import { getRoute } from './router.js';
import { renderGenerator } from './generator.js';
import { renderPlayer } from './player.js';
import { renderFeed } from './feed.js';
import { decodeKValue, generateRandomFilename } from './utils.js';
import { initDb, getDb, isDbReady } from './db/index.js';

/* ═══════════════════════════════════════════════════════════════
   Routing:

   /g/                        → Generator page
   /?k=...                   → Player (direct)
   /{slug}.mp4               → Shortlink → Player or Smartlink redirect
   /?trending=1              → Trending feed
   /                          → Home feed (videos from DB)
   ═══════════════════════════════════════════════════════════════ */

(async function() {
  var app = document.getElementById('app');
  if (!app) return;

  var pageMode = document.documentElement.getAttribute('data-mode') || 'main';

  /* ── Generator Mode (/g/) ── */
  if (pageMode === 'generator') {
    await initDb();
    renderGenerator(app);
    return;
  }

  /* ── Main Mode ── */
  var dbPromise = initDb();
  var storedRedirect = sessionStorage.getItem('spa_redirect');
  var originalPathAndQuery = storedRedirect || '';
  var route = getRoute();

  /* ---- Check trending query param ---- */
  var isTrending = route.params && route.params.has('trending');

  /* ---- PLAYER LANGSUNG (ada ?k=) ── */
  if (route.isPlayer) {
    renderPlayer(app, route);
    pushPlayerUrl(route.kValue, originalPathAndQuery);
    dbPromise.catch(function() {});
    return;
  }

  /* ---- SHORTLINK (path 6+ char) → DB lookup → player/smartlink ---- */
  if (route.isShortRedirect && route.shortSlug) {
    var loader = document.getElementById('redirect-loader');
    if (loader) {
      loader.innerHTML = '<div class="rdl-spinner"></div><div class="rdl-text">Please wait a few seconds...</div>';
      loader.classList.add('active');
    }

    var kValue = route.kValue;

    if (!kValue) {
      await dbPromise;
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

    if (kValue) {
      var decoded = decodeKValue(kValue);

      /* SMARTLINK → direct redirect */
      if (decoded.type === 'smartlink') {
        if (loader) loader.classList.remove('active');
        window.location.href = decoded.url;
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

    /* Not found → show feed */
    if (loader) loader.classList.remove('active');
    await dbPromise;
    renderFeed(app, isTrending ? 'trending' : 'feed');
    return;
  }

  /* ---- HOME or TRENDING → Feed ---- */
  await dbPromise;
  renderFeed(app, isTrending ? 'trending' : 'feed');

})();

/* ── Helper: push fake player URL to address bar ── */
function pushPlayerUrl(kValue, originalUrl) {
  try {
    if (originalUrl && originalUrl.includes('?k=')) {
      history.replaceState(null, '', originalUrl);
    } else if (kValue) {
      var fakeName = generateRandomFilename();
      history.replaceState(null, '', '/' + fakeName + '?k=' + kValue);
    }
  } catch (e) {}
}