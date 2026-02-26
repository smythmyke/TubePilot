/**
 * TubePilot Reactions — YouTube Content Script
 *
 * Injected into youtube.com pages. Provides direct DOM control of the
 * YouTube <video> element for the reactions feature. Communicates with
 * the service worker via chrome.runtime messages.
 */

(function () {
  let video = null;
  let pollInterval = null;
  let active = false;
  let lastPlayerState = -1;
  let cleanupStyleEl = null;

  // CSS that hides all YouTube UI so the captured stream shows only the video
  const CLEANUP_CSS = `
    #masthead, #masthead-container, #secondary, #below, #guide,
    ytd-miniplayer, ytd-popup-container, tp-yt-paper-dialog,
    ytd-consent-bump-v2-lightbox, #chat, #panels,
    .ytp-chrome-bottom, .ytp-chrome-top,
    .ytp-gradient-bottom, .ytp-gradient-top,
    .ytp-pause-overlay, .ytp-watermark,
    .ytp-ce-element { display: none !important; }
    body { overflow: hidden !important; background: #000 !important; margin: 0 !important; }
    #page-manager { margin: 0 !important; padding: 0 !important; }
    ytd-watch-flexy { --ytd-watch-flexy-max-player-width: 100vw !important; }
    #player, #movie_player, .html5-video-container, video.html5-main-video {
      position: fixed !important; top: 0 !important; left: 0 !important;
      width: 100vw !important; height: 100vh !important; z-index: 9999 !important;
    }
    #movie_player { background: #000 !important; }
    video.html5-main-video { object-fit: contain !important; }
  `;

  function injectCleanupCSS() {
    if (cleanupStyleEl) return;
    cleanupStyleEl = document.createElement('style');
    cleanupStyleEl.id = 'tubepilot-rx-cleanup';
    cleanupStyleEl.textContent = CLEANUP_CSS;
    document.head.appendChild(cleanupStyleEl);
  }

  function removeCleanupCSS() {
    if (cleanupStyleEl) {
      cleanupStyleEl.remove();
      cleanupStyleEl = null;
    }
  }

  function findVideo() {
    video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    return !!video;
  }

  function derivePlayerState() {
    if (!video) return -1;
    if (video.ended) return 0;
    if (video.readyState < 3) return 3; // buffering
    if (video.paused) return 2;
    return 1; // playing
  }

  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(() => {
      if (!video || !video.isConnected) {
        findVideo();
        return;
      }
      const state = derivePlayerState();
      try {
        chrome.runtime.sendMessage({
          type: RX_MESSAGES.YT_PLAYER_STATE,
          currentTime: video.currentTime,
          duration: video.duration || 0,
          playerState: state
        }).catch(() => {});
      } catch { stopPolling(); }
      lastPlayerState = state;
    }, 250);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case RX_MESSAGES.YT_PLAY:
        if (video) video.play().catch(() => {});
        sendResponse({ success: true });
        return;

      case RX_MESSAGES.YT_PAUSE:
        if (video) video.pause();
        sendResponse({ success: true });
        return;

      case RX_MESSAGES.YT_SEEK:
        if (video && typeof msg.time === 'number') {
          video.currentTime = msg.time;
        }
        sendResponse({ success: true });
        return;

      case RX_MESSAGES.YT_ACTIVATE:
        active = true;
        injectCleanupCSS();
        findVideo();
        startPolling();
        sendResponse({ success: true });
        return;

      case RX_MESSAGES.YT_DEACTIVATE:
        active = false;
        stopPolling();
        removeCleanupCSS();
        sendResponse({ success: true });
        return;
    }
  });

  // YouTube SPA navigation — re-acquire <video> element + re-inject cleanup CSS
  document.addEventListener('yt-navigate-finish', () => {
    if (active) {
      injectCleanupCSS();
      setTimeout(() => findVideo(), 500);
    }
  });

  // Signal ready to SW (try-catch guards against "Extension context invalidated" on reload)
  try {
    chrome.runtime.sendMessage({ type: RX_MESSAGES.YT_CONTENT_READY }).catch(() => {});
  } catch {};
})();
