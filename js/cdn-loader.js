export function loadVideo(videoElement, filename, cdnsArray, statusElement, timeoutMs) {
  return new Promise(function(resolve, reject) {
    if (!cdnsArray || cdnsArray.length === 0) {
      reject(new Error('No CDN available'));
      return;
    }

    let cdnIndex = 0;
    let currentTimeout = null;
    let onCanPlay = null;
    let onError = null;

    function updateStatus(cdn, state) {
      if (!statusElement) return;
      let dotClass = 'trying';
      if (state === 'fail') dotClass = 'fail';
      if (state === 'ok') dotClass = 'ok';
      statusElement.innerHTML = '<div class="load-status-line"><span class="cdn-dot ' + dotClass + '"></span>' + cdn.name + '</div>';
    }

    function cleanup() {
      if (currentTimeout) {
        clearTimeout(currentTimeout);
        currentTimeout = null;
      }
      if (videoElement) {
        if (onCanPlay) videoElement.removeEventListener('canplay', onCanPlay);
        if (onError) videoElement.removeEventListener('error', onError);
      }
      onCanPlay = null;
      onError = null;
    }

    function tryCdn() {
      if (cdnIndex >= cdnsArray.length) {
        cleanup();
        reject(new Error('All CDNs failed'));
        return;
      }

      const cdn = cdnsArray[cdnIndex];
      const url = cdn.base.replace(/\/+$/, '') + '/' + filename.replace(/^\/+/, '');

      updateStatus(cdn, 'trying');

      onCanPlay = function() {
        cleanup();
        updateStatus(cdn, 'ok');
        resolve(url);
      };

      onError = function() {
        cleanup();
        updateStatus(cdn, 'fail');
        cdnIndex++;
        tryCdn();
      };

      videoElement.addEventListener('canplay', onCanPlay);
      videoElement.addEventListener('error', onError);

      videoElement.src = url;
      videoElement.load();

      currentTimeout = setTimeout(function() {
        cleanup();
        updateStatus(cdn, 'fail');
        cdnIndex++;
        tryCdn();
      }, timeoutMs);
    }

    tryCdn();
  });
}