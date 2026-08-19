<?php
/* ─────────────────────────────────────────────────────────────
   Video Player Shortlink — API Proxy (cPanel / PHP + MySQL)
   ───────────────────────────────────────────────────────────── */

/* ── CORS Headers ── */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Cache-Control: no-store, no-cache, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['ok' => false, 'msg' => 'Method not allowed. Use POST.']);
    exit;
}

/* ═══════════════════════════════════════════════════
   KONFIGURASI DATABASE — UBAH SESUAI HOSTING ANDA
   ═══════════════════════════════════════════════════ */

$db_host     = 'localhost';
$db_name     = 'brik6427_api';
$db_user     = 'brik6427_api';
$db_pass     = 'cpYmARMao?fLfU@l';

$API_KEY = '';

/* ═══════════════════════════════════════════════════ */

/* ── Koneksi Database ── */
try {
    $pdo = new PDO(
        "mysql:host=$db_host;dbname=$db_name;charset=utf8mb4",
        $db_user,
        $db_pass,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'ok'  => false,
        'msg' => 'DB connection failed. Cek konfigurasi database di api-proxy.php'
    ]);
    exit;
}

/* ── Baca Input JSON ── */
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

if (!$input || !isset($input['action'])) {
    echo json_encode(['ok' => false, 'msg' => 'Invalid request. action is required.']);
    exit;
}

/* ── Validasi API Key ── */
if ($API_KEY !== '') {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $sentKey = '';
    foreach ($headers as $k => $v) {
        if (strtolower($k) === 'x-api-key') {
            $sentKey = $v;
            break;
        }
    }
    if ($sentKey !== $API_KEY) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'msg' => 'Invalid API key']);
        exit;
    }
}

$action = $input['action'];

/* ── Auto-create tabel jika belum ada ── */
$pdo->exec("CREATE TABLE IF NOT EXISTS vgen_links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL,
    url TEXT NOT NULL,
    player_url TEXT DEFAULT NULL,
    short_url TEXT DEFAULT NULL,
    filename VARCHAR(200) DEFAULT NULL,
    clicks INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_code (code),
    INDEX idx_filename (filename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

/* ── Migrasi: tambah kolom baru jika tabel lama belum punya ── */
try {
    $col1 = $pdo->query("SHOW COLUMNS FROM vgen_links LIKE 'player_url'")->fetch();
    if (!$col1) {
        $pdo->exec("ALTER TABLE vgen_links ADD COLUMN player_url TEXT DEFAULT NULL AFTER url");
    }
} catch (Exception $e) {}
try {
    $col2 = $pdo->query("SHOW COLUMNS FROM vgen_links LIKE 'short_url'")->fetch();
    if (!$col2) {
        $pdo->exec("ALTER TABLE vgen_links ADD COLUMN short_url TEXT DEFAULT NULL AFTER player_url");
    }
} catch (Exception $e) {}
try {
    $col3 = $pdo->query("SHOW COLUMNS FROM vgen_links LIKE 'filename'")->fetch();
    if (!$col3) {
        $pdo->exec("ALTER TABLE vgen_links ADD COLUMN filename VARCHAR(200) DEFAULT NULL AFTER short_url");
        $pdo->exec("CREATE INDEX idx_filename ON vgen_links (filename)");
    }
} catch (Exception $e) {}

/* ── Rate Limit ── */
$rateLimit = 120;
$rateKey = 'vgen_rl_' . md5($_SERVER['REMOTE_ADDR'] ?? 'unknown');
$cacheDir = sys_get_temp_dir();
$rateFile = $cacheDir . DIRECTORY_SEPARATOR . $rateKey;
$now = time();
$rateData = ['count' => 0, 'reset' => $now + 60];
if (file_exists($rateFile)) {
    $rateData = json_decode(file_get_contents($rateFile), true) ?: $rateData;
}
if ($rateData['reset'] < $now) {
    $rateData = ['count' => 0, 'reset' => $now + 60];
}
$rateData['count']++;
@file_put_contents($rateFile, json_encode($rateData), LOCK_EX);
if ($rateData['count'] > $rateLimit) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'msg' => 'Rate limit exceeded.']);
    exit;
}

/* ══════════════ ROUTING ══════════════ */

switch ($action) {

    case 'ping':
        echo json_encode(['ok' => true, 'msg' => 'Pong! Database terhubung.']);
        break;

    case 'get_link':
        $code = trim($input['code'] ?? '');
        if (!$code) {
            echo json_encode(['ok' => false, 'msg' => 'code wajib diisi']);
            break;
        }
        $stmt = $pdo->prepare("SELECT * FROM vgen_links WHERE code = ? LIMIT 1");
        $stmt->execute([$code]);
        $link = $stmt->fetch();
        echo json_encode(['ok' => true, 'link' => $link ?: null]);
        break;

    /* ── Random link untuk halaman utama ── */
    case 'get_random_link':
        $stmt = $pdo->query("SELECT * FROM vgen_links WHERE url IS NOT NULL AND url != '' ORDER BY RAND() LIMIT 1");
        $link = $stmt->fetch();
        echo json_encode(['ok' => true, 'link' => $link ?: null]);
        break;

    /* ── Buat link baru (dengan cek duplikat filename) ── */
    case 'create_link':
        $code       = trim($input['code'] ?? '');
        $url        = trim($input['url'] ?? '');
        $player_url = isset($input['player_url']) ? trim($input['player_url']) : '';
        $short_url  = isset($input['short_url']) ? trim($input['short_url']) : '';

        if (!$code || !$url) {
            echo json_encode(['ok' => false, 'msg' => 'code dan url wajib diisi']);
            break;
        }
        if (strlen($code) > 20) {
            echo json_encode(['ok' => false, 'msg' => 'code maksimal 20 karakter']);
            break;
        }

        /* Extract filename dari k-value (base64) */
        $filename = null;
        $decoded = base64_decode($url);
        if ($decoded) {
            $parts = explode('|', $decoded);
            if (isset($parts[0]) && strpos($parts[0], '.') !== false && $parts[0] !== 'SMARTLINK') {
                $filename = $parts[0];
            }
        }

        try {
            /* Cek duplikat berdasarkan filename */
            if ($filename !== null && $filename !== '') {
                $dup = $pdo->prepare("SELECT * FROM vgen_links WHERE filename = ? LIMIT 1");
                $dup->execute([$filename]);
                $existing = $dup->fetch();
                if ($existing) {
                    echo json_encode([
                        'ok'       => true,
                        'duplicate' => true,
                        'msg'      => 'Video ini sudah ada di database',
                        'link'     => $existing
                    ]);
                    break;
                }
            }

            /* Cek apakah code sudah ada */
            $cek = $pdo->prepare("SELECT id FROM vgen_links WHERE code = ?");
            $cek->execute([$code]);
            $existing = $cek->fetch();

            if ($existing) {
                /* UPDATE yang sudah ada */
                $stmt = $pdo->prepare("UPDATE vgen_links SET url = ?, player_url = ?, short_url = ?, filename = ? WHERE code = ?");
                $stmt->execute([$url, $player_url ?: null, $short_url ?: null, $filename ?: null, $code]);
            } else {
                /* INSERT baru */
                $stmt = $pdo->prepare("INSERT INTO vgen_links (code, url, player_url, short_url, filename) VALUES (?, ?, ?, ?, ?)");
                $stmt->execute([$code, $url, $player_url ?: null, $short_url ?: null, $filename ?: null]);
            }

            echo json_encode([
                'ok'        => true,
                'duplicate' => false,
                'link' => [
                    'code'       => $code,
                    'url'        => $url,
                    'player_url' => $player_url ?: null,
                    'short_url'  => $short_url ?: null,
                    'filename'   => $filename ?: null,
                    'clicks'     => 0,
                    'created_at' => date('c')
                ]
            ]);
        } catch (PDOException $e) {
            echo json_encode(['ok' => false, 'msg' => 'Gagal simpan: ' . $e->getMessage()]);
        }
        break;

    /* ── Update URL saja ── */
    case 'update_link_urls':
        $code       = trim($input['code'] ?? '');
        $player_url = isset($input['player_url']) ? trim($input['player_url']) : '';
        $short_url  = isset($input['short_url']) ? trim($input['short_url']) : '';
        if (!$code) {
            echo json_encode(['ok' => false, 'msg' => 'code wajib diisi']);
            break;
        }
        $stmt = $pdo->prepare("UPDATE vgen_links SET player_url = ?, short_url = ? WHERE code = ?");
        $stmt->execute([$player_url ?: null, $short_url ?: null, $code]);
        echo json_encode(['ok' => true, 'updated' => $stmt->rowCount() > 0]);
        break;

    case 'increment_clicks':
        $code = trim($input['code'] ?? '');
        if (!$code) {
            echo json_encode(['ok' => false, 'msg' => 'code wajib diisi']);
            break;
        }
        $stmt = $pdo->prepare("UPDATE vgen_links SET clicks = clicks + 1 WHERE code = ?");
        $stmt->execute([$code]);
        echo json_encode(['ok' => true]);
        break;

    case 'delete_link':
        $code = trim($input['code'] ?? '');
        if (!$code) {
            echo json_encode(['ok' => false, 'msg' => 'code wajib diisi']);
            break;
        }
        $stmt = $pdo->prepare("DELETE FROM vgen_links WHERE code = ?");
        $stmt->execute([$code]);
        echo json_encode(['ok' => true, 'deleted' => $stmt->rowCount() > 0]);
        break;

    case 'get_all_links':
        /* Dedup: ambil hanya 1 entry per filename (paling awal), + semua smartlink (filename NULL) */
        $stmt = $pdo->query("
            SELECT * FROM (
                SELECT * FROM vgen_links WHERE id IN (
                    SELECT MIN(id) FROM vgen_links WHERE filename IS NOT NULL GROUP BY filename
                )
                UNION ALL
                SELECT * FROM vgen_links WHERE filename IS NULL
            ) AS deduped
            ORDER BY created_at DESC
            LIMIT 500
        ");
        $links = $stmt->fetchAll();
        echo json_encode(['ok' => true, 'links' => $links]);
        break;

    case 'clear_all_links':
        $pdo->exec("TRUNCATE TABLE vgen_links");
        echo json_encode(['ok' => true, 'msg' => 'Semua link dihapus']);
        break;

    case 'stats':
        $totalLinks = $pdo->query("SELECT COUNT(*) as c FROM vgen_links")->fetch()['c'];
        $totalClicks = $pdo->query("SELECT COALESCE(SUM(clicks), 0) as c FROM vgen_links")->fetch()['c'];
        $todayLinks = $pdo->query("SELECT COUNT(*) as c FROM vgen_links WHERE DATE(created_at) = CURDATE()")->fetch()['c'];
        echo json_encode([
            'ok'           => true,
            'total_links'  => (int)$totalLinks,
            'total_clicks' => (int)$totalClicks,
            'today_links'  => (int)$todayLinks
        ]);
        break;

    default:
        echo json_encode(['ok' => false, 'msg' => 'Unknown action: ' . $action]);
}