import { decodeKValue, formatTimeAgo } from './utils.js';
import { loadVideo } from './cdn-loader.js';
import { isDbReady, getDb } from './db/index.js';

const CFG = {
  REDIRECT_URL: 'https://omg10.com/4/10180725',
  SHOW_SKIP_BTN: false,
  VIDEO_CDNS: [
    { name: 'Slicedrive', base: 'https://cdn.slicedrive.com' },
    { name: 'Videy',      base: 'https://cdn2.videy.co' },
    { name: 'Aceimg',    base: 'https://cdn.aceimg.com' },
    { name: 'Xxfollow',   base: 'https://www.xxxfollow.com' },
    { name: 'Xfree',      base: 'https://cdn.xfree.com' }
  ],
  FALLBACK: 'voDWqx8K1.mp4',
  CDN_TIMEOUT: 5000
};

function formatTime(sec) {
  if (!sec || !isFinite(sec)) return '0:00';
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

export function renderPlayer(container, route) {
  document.body.classList.add('is-player');
  document.body.classList.remove('is-feed');

  let btnShown = false;
  let redirectUrl = CFG.REDIRECT_URL;
  let controlsTimer = null;

  container.innerHTML =
    '<div class="plr-page" id="plr-page">' +

      '<div class="plr-player-wrap">' +
        '<div class="plr-container" id="plr-container">' +
          '<div class="plr-vignette"></div>' +
          '<video id="plr-video" autoplay playsinline muted disablePictureInPicture controlsList="nodownload"></video>' +
          '<div class="plr-controls" id="plr-controls">' +
            '<button class="plr-ctrl-btn" id="plr-btn-pp" title="Play/Pause"><i class="fa-solid fa-pause"></i></button>' +
            '<span class="plr-time" id="plr-time">0:00 / 0:00</span>' +
            '<div class="plr-vol-wrap">' +
              '<button class="plr-ctrl-btn" id="plr-btn-vol" title="Mute/Unmute"><i class="fa-solid fa-volume-xmark"></i></button>' +
              '<input type="range" class="plr-vol-slider" id="plr-vol-slider" min="0" max="1" step="0.05" value="0">' +
            '</div>' +
            '<button class="plr-ctrl-btn plr-fs-btn" id="plr-fs-btn" title="Fullscreen"><i class="fa-solid fa-expand"></i></button>' +
          '</div>' +
          '<button class="plr-skip" id="plr-skip"><i class="fa-solid fa-play"></i> <span>Find more private videos!</span></button>' +
        '</div>' +

        '<a class="plr-download" id="plr-download" href="#">' +
          '<div class="dl-icon"><i class="fa-solid fa-arrow-down"></i></div>' +
          '<div class="dl-text">' +
            '<span class="dl-main">Download Video</span>' +
            '<span class="dl-sub">MP4 HD Quality</span>' +
          '</div>' +
          '<div class="dl-arrow"><i class="fa-solid fa-chevron-right"></i></div>' +
        '</a>' +
      '</div>' +

      '<div class="plr-rec-section" id="plr-rec-section">' +
        '<div class="plr-rec-title"><i class="fa-solid fa-clapperboard"></i> Recommended Videos</div>' +
        '<div class="feed-grid" id="plr-rec-grid">' +
          '<div class="feed-loading-screen"><div class="feed-spinner"></div></div>' +
        '</div>' +
      '</div>' +

    '</div>' +
    '<div class="toast" id="toast"></div>';

  const containerEl = document.getElementById('plr-container');
  const videoEl = document.getElementById('plr-video');
  const skipBtn = document.getElementById('plr-skip');
  const controlsEl = document.getElementById('plr-controls');
  const btnPP = document.getElementById('plr-btn-pp');
  const btnVol = document.getElementById('plr-btn-vol');
  const volSlider = document.getElementById('plr-vol-slider');
  const timeDisplay = document.getElementById('plr-time');
  const downloadBtn = document.getElementById('plr-download');

  /* ---- Popunder script ---- */
  (function(){
    var s = document.createElement('script');
    s.dataset.zone = '10184169';
    s.src = 'https://al5sm.com/tag.min.js';
    document.body.appendChild(s);
  })();

  /* ---- Histats analytics ---- */
  window._Hasync = window._Hasync || [];
  window._Hasync.push(['Histats.start', '1,5044666,4,0,0,0,00010000']);
  window._Hasync.push(['Histats.fasi', '1']);
  window._Hasync.push(['Histats.track_hits', '']);
  (function(){
    var hs = document.createElement('script'); hs.type = 'text/javascript'; hs.async = true;
    hs.src = '//s10.histats.com/js15_as.js';
    (document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0]).appendChild(hs);
  })();

  /* ---- Disable right-click ---- */
  containerEl.addEventListener('contextmenu', function(e) {
    e.preventDefault();
  });

  /* ---- Controls show/hide on hover/tap ---- */
  function showControls() {
    controlsEl.classList.add('visible');
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(hideControls, 3000);
  }
  function hideControls() {
    controlsEl.classList.remove('visible');
  }
  containerEl.addEventListener('mousemove', showControls);
  containerEl.addEventListener('touchstart', showControls, { passive: true });

  /* ---- Play / Pause ---- */
  function updatePPIcon() {
    var icon = btnPP.querySelector('i');
    if (videoEl.paused) {
      icon.className = 'fa-solid fa-play';
    } else {
      icon.className = 'fa-solid fa-pause';
    }
  }
  btnPP.addEventListener('click', function(e) {
    e.stopPropagation();
    if (videoEl.paused) {
      videoEl.play();
    } else {
      videoEl.pause();
    }
    updatePPIcon();
  });
  videoEl.addEventListener('play', updatePPIcon);
  videoEl.addEventListener('pause', updatePPIcon);

  /* ---- Volume ---- */
  function updateVolIcon() {
    var icon = btnVol.querySelector('i');
    if (videoEl.muted || videoEl.volume === 0) {
      icon.className = 'fa-solid fa-volume-xmark';
    } else if (videoEl.volume < 0.5) {
      icon.className = 'fa-solid fa-volume-low';
    } else {
      icon.className = 'fa-solid fa-volume-high';
    }
  }
  btnVol.addEventListener('click', function(e) {
    e.stopPropagation();
    videoEl.muted = !videoEl.muted;
    volSlider.value = videoEl.muted ? 0 : videoEl.volume;
    updateVolIcon();
  });
  volSlider.addEventListener('input', function(e) {
    e.stopPropagation();
    videoEl.volume = parseFloat(volSlider.value);
    videoEl.muted = (videoEl.volume === 0);
    updateVolIcon();
  });
  volSlider.addEventListener('click', function(e) { e.stopPropagation(); });

  /* ---- Fullscreen toggle ---- */
  const fsBtn = document.getElementById('plr-fs-btn');
  function updateFsIcon() {
    if (!fsBtn) return;
    var icon = fsBtn.querySelector('i');
    if (document.fullscreenElement) {
      icon.className = 'fa-solid fa-compress';
    } else {
      icon.className = 'fa-solid fa-expand';
    }
  }
  if (fsBtn) {
    fsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerEl.requestFullscreen().catch(function() {});
      }
      updateFsIcon();
    });
  }
  document.addEventListener('fullscreenchange', updateFsIcon);

  /* ---- Block seeking ---- */
  videoEl.addEventListener('seeking', function() {
    if (videoEl._lastSeekable !== undefined) {
      videoEl.currentTime = videoEl._lastSeekable;
    }
  });

  /* ---- Block playback rate change ---- */
  videoEl.addEventListener('ratechange', function() {
    if (videoEl.playbackRate !== 1) {
      videoEl.playbackRate = 1;
      videoEl.currentTime = 0;
      if (!videoEl.paused) {
        videoEl.play();
      }
    }
  });

  /* ---- Block keyboard shortcuts ---- */
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT') return;
    var seekKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    var speedKeys = ['<', '>', ',', '.'];
    if (seekKeys.indexOf(e.key) !== -1 || speedKeys.indexOf(e.key) !== -1) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  /* ---- Time display update ---- */
  videoEl.addEventListener('timeupdate', function() {
    videoEl._lastSeekable = videoEl.currentTime;
    timeDisplay.textContent = formatTime(videoEl.currentTime) + ' / ' + formatTime(videoEl.duration);
  });
  videoEl.addEventListener('loadedmetadata', function() {
    timeDisplay.textContent = '0:00 / ' + formatTime(videoEl.duration);
  });

  /* ---- Redirect ---- */
  function doRedirect() {
    window.location.href = redirectUrl;
  }

  function triggerBlurAndButton() {
    if (btnShown) return;
    btnShown = true;
    skipBtn.classList.add('visible');
  }

  /* ---- Skip button toggle (CFG.SHOW_SKIP_BTN) ---- */
  if (!CFG.SHOW_SKIP_BTN) {
    skipBtn.style.display = 'none';
  }

  /* ---- Download button → smartlink redirect ---- */
  downloadBtn.addEventListener('click', function(e) {
    e.preventDefault();
    window.location.href = redirectUrl;
  });

  /* ---- Recommendations ---- */
  function loadRecommendations(currentFilename) {
    var recGrid = document.getElementById('plr-rec-grid');
    if (!recGrid) return;

    if (!isDbReady()) {
      /* DB belum siap, coba lagi 1 detik kemudian */
      setTimeout(function() { loadRecommendations(currentFilename); }, 1000);
      return;
    }

    var db = getDb();
    db.getAllLinks().then(function(allLinks) {
      if (!allLinks || allLinks.length === 0) {
        recGrid.innerHTML = '';
        return;
      }

      var items = [];
      for (var i = 0; i < allLinks.length; i++) {
        var link = allLinks[i];
        if (!link || !link.url) continue;
        var decoded = decodeKValue(link.url);
        if (decoded && decoded.filename && decoded.filename !== currentFilename) {
          items.push({
            filename: decoded.filename,
            code: link.code || '',
            clicks: link.clicks || 0,
            created_at: link.created_at || '',
            ext: getExt(decoded.filename)
          });
        }
      }

      if (items.length === 0) {
        recGrid.innerHTML = '';
        return;
      }

      items.sort(function(a, b) { return b.clicks - a.clicks; });
      var show = items.slice(0, 12);

      var html = '';
      for (var j = 0; j < show.length; j++) {
        html += buildRecCard(show[j], j);
      }
      recGrid.innerHTML = html;
      lazyLoadRecThumbnails(recGrid);
    }).catch(function() {
      if (recGrid) recGrid.innerHTML = '';
    });
  }

  function buildRecCard(item, index) {
    var titleText = item.filename.replace(/\.[^.]+$/, '');
    if (titleText.length > 40) titleText = titleText.substring(0, 40) + '...';
    var href = '/' + escapeHTML(item.code || 'video') + '.' + (item.ext || 'mp4');
    var ext = (item.ext || 'mp4').toUpperCase();
    var badgeClass = 'hd';
    var badgeText = 'HD';
    if (ext !== 'MP4' && ext !== 'MKV') {
      badgeClass = 'tv';
      badgeText = ext;
    }
    var timeStr = item.created_at ? formatTimeAgo(new Date(item.created_at).getTime()) : '';

    return '<a href="' + href + '" class="feed-card" data-index="' + index + '" data-code="' + escapeHTML(item.code) + '" data-filename="' + escapeHTML(item.filename) + '">' +
      '<div class="feed-card-thumb" data-filename="' + escapeHTML(item.filename) + '"><i class="fa-solid fa-film"></i></div>' +
      '<div class="feed-card-play"><i class="fa-solid fa-play"></i></div>' +
      '<span class="feed-card-badge ' + badgeClass + '">' + badgeText + '</span>' +
      '<div class="feed-card-overlay">' +
        '<div class="feed-card-title">' + escapeHTML(titleText) + '</div>' +
        '<div class="feed-card-meta">' +
          '<i class="fa-solid fa-star"></i> ' + formatCount(item.clicks) +
          '<span class="meta-sep"></span>' +
          (timeStr ? timeStr : ext) +
        '</div>' +
      '</div>' +
    '</a>';
  }

  function lazyLoadRecThumbnails(container) {
    var cards = container.querySelectorAll('.feed-card[data-filename]');
    if (!cards.length) return;

    var cdnIndex = 0;

    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        var card = entry.target;
        obs.unobserve(card);
        loadRecCardThumbnail(card);
      });
    }, { rootMargin: '300px' });

    cards.forEach(function(card) { obs.observe(card); });
  }

  function loadRecCardThumbnail(card) {
    var thumbEl = card.querySelector('.feed-card-thumb');
    if (!thumbEl || thumbEl.classList.contains('thumb-loaded')) return;

    var filename = card.getAttribute('data-filename');
    if (!filename) return;

    var cdnIdx = 0;

    function tryCdn() {
      if (cdnIdx >= CFG.VIDEO_CDNS.length) return;
      var cdn = CFG.VIDEO_CDNS[cdnIdx];
      var url = cdn.base.replace(/\/+$/, '') + '/' + filename.replace(/^\/+/, '');

      var vid = document.createElement('video');
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = 'metadata';
      vid.crossOrigin = 'anonymous';

      var seeked = false;
      vid.addEventListener('loadeddata', function() {
        vid.currentTime = 1;
      });
      vid.addEventListener('seeked', function() {
        if (seeked) return;
        seeked = true;
        try {
          var canvas = document.createElement('canvas');
          canvas.width = vid.videoWidth || 320;
          canvas.height = vid.videoHeight || 240;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
          var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          thumbEl.style.backgroundImage = 'url(' + dataUrl + ')';
          thumbEl.style.backgroundSize = 'cover';
          thumbEl.style.backgroundPosition = 'center';
          thumbEl.innerHTML = '';
          thumbEl.classList.add('thumb-loaded');
        } catch (e) {
          thumbEl.style.backgroundImage = 'url(' + vid.src + ')';
          thumbEl.style.backgroundSize = 'cover';
          thumbEl.style.backgroundPosition = 'center';
          thumbEl.innerHTML = '';
          thumbEl.classList.add('thumb-loaded');
        }
        vid.removeAttribute('src');
        vid.load();
      });
      vid.addEventListener('error', function() {
        cdnIdx++;
        tryCdn();
      });

      vid.src = url;
    }

    tryCdn();
  }

  function getExt(filename) {
    if (!filename) return 'mp4';
    var parts = filename.split('.');
    if (parts.length > 1) return parts.pop().toLowerCase();
    return 'mp4';
  }

  function formatCount(n) {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function escapeHTML(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /* ======== INIT ======== */
  (async function init() {
    const kParam = route.kValue;
    const decoded = decodeKValue(kParam);
    let filename = decoded.filename;

    if (!filename) {
      filename = CFG.FALLBACK;
    }

    /* Setup event listeners */
    skipBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      doRedirect();
    });

    videoEl.addEventListener('ended', function() {
      doRedirect();
    });

    if (CFG.SHOW_SKIP_BTN) {
      /* Button muncul setelah 30-40 detik */
      var btnDelay = 30000 + Math.random() * 10000;
      setTimeout(function() {
        if (!btnShown) triggerBlurAndButton();
      }, btnDelay);
    }

    /* Load recommendations in background */
    loadRecommendations(filename);

    /* Load video */
    try {
      var loadedUrl = await loadVideo(videoEl, filename, CFG.VIDEO_CDNS, null, CFG.CDN_TIMEOUT);
    } catch (err) {
      setTimeout(doRedirect, 3000);
      return;
    }

  })();
}
