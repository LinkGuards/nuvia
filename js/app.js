import { getRoute } from './router.js';
import { renderGenerator } from './generator.js';
import { renderPlayer } from './player.js';
import { decodeKValue, generateRandomFilename } from './utils.js';
import { initDb, getDb, isDbReady } from './db/index.js';
import { checkIndonesia } from './geo-block.js';

/* ═══════════════════════════════════════════════════════════════
   Alur Utama:

   Generator mode (/g/)       → tampilkan generator
   Player mode (/?k=...)       → render player, URL tetap sama
   Shortlink (/abc12345.mp4)   → cari DB → render player, URL jadi player URL
   Root (/)                    → random dari DB → render player, URL jadi player URL
   Tidak ditemukan             → tampilkan pesan fallback
   ═══════════════════════════════════════════════════════════════ */

(async function() {
  var app = document.getElementById('app');
  if (!app) return;

  var pageMode = document.documentElement.getAttribute('data-mode') || 'main';

  /* ── Generator Mode (domain.com/g/) ── */
  if (pageMode === 'generator') {
    await initDb();
    renderGenerator(app);
    return;
  }

  /* ── Main Mode ── */

  /* ⚡ START DB INIT SEKARANG — jalan paralel dengan getRoute()
     Kalau nanti butuh DB, await initDb() tinggal resolve instantly */
  var dbPromise = initDb();

  /* Simpan original URL dari sessionStorage SEBELUM getRoute() menghapusnya */
  var storedRedirect = sessionStorage.getItem('spa_redirect');
  var originalPathAndQuery = storedRedirect || '';

  var route = getRoute();

  /* ---- PLAYER LANGSUNG (ada ?k=) — TIDAK PERLU DB ---- */
  if (route.isPlayer) {
    renderPlayer(app, route);
    pushPlayerUrl(route.kValue, originalPathAndQuery);
    dbPromise.catch(function() {});
    return;
  }

  /* ---- SHORTLINK (path 6+ char, tanpa ?k=) → butuh DB ---- */
  if (route.isShortRedirect && route.shortSlug) {
    var loader = document.getElementById('redirect-loader');
    if (loader) {
      loader.innerHTML = '<div class="rdl-spinner"></div><div class="rdl-text">Please wait a few seconds...</div>';
      loader.classList.add('active');
    }

    var kValue = route.kValue;

    /* Cek database */
    if (!kValue) {
      await dbPromise; /* DB init mungkin SUDAH selesai karena di-start lebih awal */
      if (isDbReady()) {
        try {
          var db = getDb();
          var link = await db.getLinkByCode(route.shortSlug);
          if (link && link.url) {
            kValue = link.url;
            db.incrementClicks(route.shortSlug).catch(function() {});
          }
        } catch (e) {
          console.warn('[DB] Lookup failed:', e);
        }
      }
    }

    /* Ketemu → cek tipe: player atau smartlink */
    if (kValue) {
      var decoded = decodeKValue(kValue);

      /* SMARTLINK → redirect berdasarkan geo */
      if (decoded.type === 'smartlink') {
        if (loader) loader.classList.remove('active');
        var isId = await checkIndonesia();
        window.location.href = isId ? decoded.idUrl : decoded.otherUrl;
        return;
      }

      /* PLAYER → render video */
      if (decoded.filename) {
        if (loader) loader.classList.remove('active');
        renderPlayer(app, { kValue: kValue, params: new URLSearchParams() });
        pushPlayerUrl(kValue, null);
        return;
      }
    }

    /* Tidak ketemu → coba random player dari DB */
    if (loader) loader.classList.remove('active');
    await loadRandomPlayerOrFallback(app);
    return;
  }

  /* ---- ROOT (/) → random player dari DB ---- */
  await dbPromise;
  await loadRandomPlayerOrFallback(app);

})();

/* ══════ Helper Functions ══════ */

function pushPlayerUrl(kValue, originalUrl) {
  try {
    if (originalUrl && originalUrl.includes('?k=')) {
      history.replaceState(null, '', originalUrl);
    } else if (kValue) {
      var fakeName = generateRandomFilename();
      history.replaceState(null, '', '/' + fakeName + '?k=' + kValue);
    }
  } catch (e) {
    /* history.replaceState bisa gagal di cross-origin iframe, ignore */
  }
}

async function loadRandomPlayerOrFallback(app) {
  if (!isDbReady() || typeof getDb().getRandomLink !== 'function') {
    showFallback(app, 'Database belum terhubung atau adapter tidak mendukung random player.');
    return;
  }

  var loader = document.getElementById('redirect-loader');
  if (loader) {
    loader.innerHTML = '<div class="rdl-spinner"></div><div class="rdl-text">Loading...</div>';
    loader.classList.add('active');
  }

  try {
    var db = getDb();
    var link = await db.getRandomLink();

    if (loader) loader.classList.remove('active');

    if (!link || !link.url) {
      showFallback(app, 'Belum ada video di database. Buka <a href="/g/" style="color:var(--accent-blue)">Generator</a> untuk membuat shortlink pertama.');
      return;
    }

    var decoded = decodeKValue(link.url);

    /* Skip smartlink entries untuk random player */
    if (decoded.type === 'smartlink') {
      showFallback(app, 'Belum ada video di database. Buka <a href="/g/" style="color:var(--accent-blue)">Generator</a> untuk membuat shortlink pertama.');
      return;
    }

    if (!decoded.filename) {
      showFallback(app, 'Data video tidak valid di database.');
      return;
    }

    renderPlayer(app, { kValue: link.url, params: new URLSearchParams() });
    pushPlayerUrl(link.url, null);

  } catch (e) {
    if (loader) loader.classList.remove('active');
    showFallback(app, 'Gagal memuat: ' + (e.message || e));
  }
}

function showFallback(app, msg) {
  app.innerHTML =
    '<div class="no-video-msg">' +
      '<i class="fa-solid fa-film" style="font-size:2.5rem;opacity:0.3;margin-bottom:16px;display:block"></i>' +
      '<p style="color:var(--text-sec);font-size:0.95rem">' + msg + '</p>' +
    '</div>';
}