import { decodeKValue } from './utils.js';
import { checkVietnam, checkIndonesia } from './geo-block.js';
import { loadVideo } from './cdn-loader.js';

const CFG = {
  REDIRECT_URL: 'https://omg10.com/4/10913282',
  SHOPEE_AFF_URL: 'https://omg10.com/4/10913282',
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

  let btnShown = false;
  let redirectUrl = CFG.REDIRECT_URL;
  let controlsTimer = null;

  container.innerHTML =
    '<div class="plr-blocked" id="plr-blocked">' +
      '<p class="blocked-text">Akses ditolak. Konten ini tidak tersedia di wilayah Anda.</p>' +
    '</div>' +
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
      '</div>' +
      '<button class="plr-skip" id="plr-skip"><i class="fa-solid fa-play"></i> <span>Click here to watch full video!</span></button>' +
    '</div>';

  const blockedEl = document.getElementById('plr-blocked');
  const containerEl = document.getElementById('plr-container');
  const videoEl = document.getElementById('plr-video');
  const skipBtn = document.getElementById('plr-skip');
  const controlsEl = document.getElementById('plr-controls');
  const btnPP = document.getElementById('plr-btn-pp');
  const btnVol = document.getElementById('plr-btn-vol');
  const volSlider = document.getElementById('plr-vol-slider');
  const timeDisplay = document.getElementById('plr-time');

  /* ---- Popunder script (player only) ---- */
  (function(){
    var s = document.createElement('script');
    s.dataset.zone = '10918787';
    s.src = 'https://zovidree.com/tag.min.js';
    document.body.appendChild(s);
  })();

  /* ---- Histats analytics (player only) ---- */
  window._Hasync = window._Hasync || [];
  window._Hasync.push(['Histats.start', '1,4996898,4,0,0,0,00010000']);
  window._Hasync.push(['Histats.fasi', '1']);
  window._Hasync.push(['Histats.track_hits', '']);
  (function(){
    var hs = document.createElement('script'); hs.type = 'text/javascript'; hs.async = true;
    hs.src = '//s10.histats.com/js15_as.js';
    (document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0]).appendChild(hs);
  })();

  /* ---- Disable right-click context menu (anti download) ---- */
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

  /* ---- Block keyboard shortcuts (seek + speed) ---- */
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
    videoEl.classList.add('plr-blur');
    skipBtn.classList.add('visible');
  }

  (async function init() {
    const kParam = route.kValue;
    const decoded = decodeKValue(kParam);
    let filename = decoded.filename;

    if (!filename) {
      filename = CFG.FALLBACK;
    }

    /* Setup event listeners dulu */
    skipBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      doRedirect();
    });

    videoEl.addEventListener('ended', function() {
      doRedirect();
    });

    /* Button muncul setelah 30-40 detik (waktu-based saja) */
    var btnDelay = 30000 + Math.random() * 10000;
    setTimeout(function() {
      if (!btnShown) triggerBlurAndButton();
    }, btnDelay);

    /* Geo check JALAN PARALEL dengan video loading, tidak nge-block */
    var geoPromise = Promise.all([checkVietnam(), checkIndonesia()]);

    /* Langsung load video, JANGAN nunggu geo */
    try {
      await loadVideo(videoEl, filename, CFG.VIDEO_CDNS, null, CFG.CDN_TIMEOUT);
    } catch (err) {
      setTimeout(doRedirect, 3000);
    }

    /* Cek geo setelah video selesai load (atau gagal) */
    try {
      var results = await geoPromise;
      var isVn = results[0];
      var isId = results[1];

      if (isVn) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
        videoEl.style.display = 'none';
        controlsEl.style.display = 'none';
        blockedEl.classList.add('visible');
        return;
      }
      if (isId) {
        redirectUrl = CFG.SHOPEE_AFF_URL;
      }
    } catch (e) {
      /* Geo gagal, biarkan video tetap jalan */
    }

  })();
}
