/**
 * TubePilot Reactions — YouTube Player Tab
 *
 * Runs in a background tab. Embeds a YouTube iframe, bridges postMessage
 * commands from the service worker, and polls player state back.
 */

const iframe = document.getElementById('yt-player');
let pollInterval = null;
let playerReady = false;
let videoLoaded = false;

// --- YouTube IFrame postMessage helpers ---

function postToPlayer(func, args) {
  if (!iframe.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({
    event: 'command',
    func,
    args: args || []
  }), '*');
}

function postListening() {
  if (!iframe.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({
    event: 'listening'
  }), '*');
}

// --- Load video ---

function loadVideo(videoId) {
  const src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&controls=0&modestbranding=1&rel=0&origin=${encodeURIComponent(location.origin)}`;
  iframe.src = src;
  videoLoaded = false;
  playerReady = false;

  iframe.onload = () => {
    // Send listening event to activate the JS API
    postListening();
    // Give the iframe a moment to initialize the player
    setTimeout(() => {
      playerReady = true;
      videoLoaded = true;
      chrome.runtime.sendMessage({
        type: RX_MESSAGES.PLAYER_READY
      }).catch(() => {});
      startPolling();
    }, 1500);
  };
}

// --- State polling ---

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    if (!playerReady) return;
    // Request current time and duration from the iframe
    postToPlayer('getCurrentTime');
    postToPlayer('getDuration');
    postToPlayer('getPlayerState');
  }, 250);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// --- Listen for postMessage from YouTube iframe ---

let lastCurrentTime = 0;
let lastDuration = 0;
let lastPlayerState = -1;

window.addEventListener('message', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
  } catch {
    return;
  }

  if (!data.event) return;

  if (data.event === 'infoDelivery' && data.info) {
    let changed = false;

    if (data.info.currentTime !== undefined) {
      lastCurrentTime = data.info.currentTime;
      changed = true;
    }
    if (data.info.duration !== undefined) {
      lastDuration = data.info.duration;
      changed = true;
    }
    if (data.info.playerState !== undefined) {
      lastPlayerState = data.info.playerState;
      changed = true;
    }

    if (changed) {
      chrome.runtime.sendMessage({
        type: RX_MESSAGES.PLAYER_STATE,
        currentTime: lastCurrentTime,
        duration: lastDuration,
        playerState: lastPlayerState
      }).catch(() => {});
    }
  }

  if (data.event === 'onReady') {
    playerReady = true;
  }

  if (data.event === 'onError') {
    const code = typeof data.info === 'number' ? data.info : parseInt(data.info) || 0;
    const errorMessages = {
      2: 'Invalid video ID',
      5: 'HTML5 player error',
      100: 'Video not found or removed',
      101: 'Video not embeddable',
      150: 'Video not embeddable'
    };
    chrome.runtime.sendMessage({
      type: RX_MESSAGES.PLAYER_ERROR,
      code,
      error: errorMessages[code] || ('Player error code ' + code)
    }).catch(() => {});
  }
});

// --- Listen for commands from the service worker ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message.type) return;

  switch (message.type) {
    case RX_MESSAGES.LOAD_VIDEO:
      loadVideo(message.videoId);
      sendResponse({ success: true });
      return true;

    case RX_MESSAGES.PLAY:
      postToPlayer('playVideo');
      sendResponse({ success: true });
      break;

    case RX_MESSAGES.PAUSE_VIDEO:
      postToPlayer('pauseVideo');
      sendResponse({ success: true });
      break;

    case RX_MESSAGES.SEEK:
      postToPlayer('seekTo', [message.time, true]);
      sendResponse({ success: true });
      break;

    case RX_MESSAGES.GET_PLAYER_STATE:
      sendResponse({
        success: true,
        currentTime: lastCurrentTime,
        duration: lastDuration,
        playerState: lastPlayerState
      });
      break;

    case RX_MESSAGES.CLEANUP:
      stopPolling();
      iframe.src = '';
      playerReady = false;
      videoLoaded = false;
      sendResponse({ success: true });
      break;
  }
});

console.log('[TubePilot Player] Tab ready');
