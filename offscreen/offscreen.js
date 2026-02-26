/**
 * TubePilot Reactions — Offscreen Recording Engine
 *
 * Handles canvas compositing, audio mixing, and MediaRecorder.
 * Communicates with the service worker via chrome.runtime messages.
 */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const tabVideo = document.getElementById('tab-video');
const camVideo = document.getElementById('cam-video');

let tabStream = null;
let camStream = null;
let audioCtx = null;
let tabGain = null;
let micGain = null;
let mediaRecorder = null;
let recordedChunks = [];
let animFrameId = null;
let composedStream = null;
let startTime = 0;
let pausedDuration = 0;
let pauseStart = 0;

// Current config
let config = {
  pipPosition: RX_PIP_POSITIONS.BR,
  pipSize: RX_DEFAULTS.pipSize,
  tabVolume: RX_DEFAULTS.tabVolume,
  micVolume: RX_DEFAULTS.micVolume
};

// --- IndexedDB helpers ---

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('tubepilot_reactions', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('recordings')) {
        db.createObjectStore('recordings', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveRecording(id, blob, duration) {
  const db = await openDB();
  // Generate thumbnail from current canvas state
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 320;
  thumbCanvas.height = 180;
  const thumbCtx = thumbCanvas.getContext('2d');
  thumbCtx.drawImage(canvas, 0, 0, 320, 180);
  const thumbnailBlob = await new Promise(r => thumbCanvas.toBlob(r, 'image/jpeg', 0.7));

  return new Promise((resolve, reject) => {
    const tx = db.transaction('recordings', 'readwrite');
    const store = tx.objectStore('recordings');
    store.put({
      id,
      blob,
      thumbnailBlob,
      duration,
      timestamp: Date.now(),
      title: 'Reaction ' + new Date().toLocaleString()
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function cleanOldRecordings() {
  try {
    const db = await openDB();
    const tx = db.transaction('recordings', 'readwrite');
    const store = tx.objectStore('recordings');
    const all = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const rec of all) {
      if (rec.timestamp < sevenDaysAgo) {
        store.delete(rec.id);
      }
    }
  } catch (e) {
    console.warn('[TubePilot RX] Failed to clean old recordings:', e);
  }
}

// Clean on load
cleanOldRecordings();

// --- Message listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message.type || !message.type.startsWith('RX_')) return;

  switch (message.type) {
    case RX_MESSAGES.START_CAPTURE:
      initCapture(message.streamId, message.config)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case RX_MESSAGES.STOP_CAPTURE:
      stopRecording()
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case RX_MESSAGES.PAUSE:
      pauseRecording();
      sendResponse({ success: true });
      break;

    case RX_MESSAGES.RESUME:
      resumeRecording();
      sendResponse({ success: true });
      break;

    case RX_MESSAGES.UPDATE_CONFIG:
      updateConfig(message.config);
      sendResponse({ success: true });
      break;

    case RX_MESSAGES.CLEANUP:
      cleanup();
      sendResponse({ success: true });
      break;
  }
});

// --- Capture initialization ---

async function initCapture(streamId, cfg) {
  if (cfg) Object.assign(config, cfg);

  // Get tab capture stream via streamId
  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    }
  });

  tabVideo.srcObject = tabStream;
  await tabVideo.play();

  // Set canvas to match tab video dimensions
  const vTrack = tabStream.getVideoTracks()[0];
  if (vTrack) {
    const settings = vTrack.getSettings();
    canvas.width = settings.width || RX_DEFAULTS.canvasWidth;
    canvas.height = settings.height || RX_DEFAULTS.canvasHeight;
  }

  // Get webcam stream
  const camConstraints = { video: true, audio: true };
  if (cfg && cfg.cameraDeviceId) {
    camConstraints.video = { deviceId: { exact: cfg.cameraDeviceId } };
  }
  if (cfg && cfg.micDeviceId) {
    camConstraints.audio = { deviceId: { exact: cfg.micDeviceId } };
  }

  try {
    camStream = await navigator.mediaDevices.getUserMedia(camConstraints);
    camVideo.srcObject = camStream;
    await camVideo.play();
  } catch (e) {
    console.warn('[TubePilot RX] Webcam unavailable, recording tab only:', e.message);
    // Continue without webcam — tab-only recording
  }

  // Set up audio mixing
  audioCtx = new AudioContext();

  // Tab audio
  const tabAudioTracks = tabStream.getAudioTracks();
  let tabSource = null;
  if (tabAudioTracks.length > 0) {
    const tabAudioStream = new MediaStream(tabAudioTracks);
    tabSource = audioCtx.createMediaStreamSource(tabAudioStream);
    tabGain = audioCtx.createGain();
    tabGain.gain.value = config.tabVolume / 100;
    tabSource.connect(tabGain);
  }

  // Mic audio
  let micSource = null;
  if (camStream) {
    const micAudioTracks = camStream.getAudioTracks();
    if (micAudioTracks.length > 0) {
      const micAudioStream = new MediaStream(micAudioTracks);
      micSource = audioCtx.createMediaStreamSource(micAudioStream);
      micGain = audioCtx.createGain();
      micGain.gain.value = config.micVolume / 100;
      micSource.connect(micGain);
    }
  }

  // Merge audio to destination
  const dest = audioCtx.createMediaStreamDestination();
  if (tabGain) tabGain.connect(dest);
  if (micGain) micGain.connect(dest);

  // Start render loop
  startRenderLoop();

  // Compose final stream: canvas video + mixed audio
  const canvasStream = canvas.captureStream(RX_DEFAULTS.frameRate);
  composedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks()
  ]);

  // Start MediaRecorder
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : 'video/webm';

  mediaRecorder = new MediaRecorder(composedStream, {
    mimeType,
    videoBitsPerSecond: RX_DEFAULTS.videoBitrate
  });

  recordedChunks = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.start(1000); // 1-second chunks
  startTime = Date.now();
  pausedDuration = 0;

  console.log('[TubePilot RX] Recording started, canvas:', canvas.width, 'x', canvas.height);
}

// --- Render loop ---

function startRenderLoop() {
  function draw() {
    // Draw tab video full-size
    if (tabVideo.readyState >= 2) {
      ctx.drawImage(tabVideo, 0, 0, canvas.width, canvas.height);
    }

    // Draw webcam PiP overlay
    if (camVideo.srcObject && camVideo.readyState >= 2) {
      const pipRect = calcPipRect();
      const radius = 12;

      ctx.save();
      // Rounded rect clip
      ctx.beginPath();
      ctx.moveTo(pipRect.x + radius, pipRect.y);
      ctx.lineTo(pipRect.x + pipRect.w - radius, pipRect.y);
      ctx.quadraticCurveTo(pipRect.x + pipRect.w, pipRect.y, pipRect.x + pipRect.w, pipRect.y + radius);
      ctx.lineTo(pipRect.x + pipRect.w, pipRect.y + pipRect.h - radius);
      ctx.quadraticCurveTo(pipRect.x + pipRect.w, pipRect.y + pipRect.h, pipRect.x + pipRect.w - radius, pipRect.y + pipRect.h);
      ctx.lineTo(pipRect.x + radius, pipRect.y + pipRect.h);
      ctx.quadraticCurveTo(pipRect.x, pipRect.y + pipRect.h, pipRect.x, pipRect.y + pipRect.h - radius);
      ctx.lineTo(pipRect.x, pipRect.y + radius);
      ctx.quadraticCurveTo(pipRect.x, pipRect.y, pipRect.x + radius, pipRect.y);
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(camVideo, pipRect.x, pipRect.y, pipRect.w, pipRect.h);
      ctx.restore();

      // Draw border
      ctx.strokeStyle = '#cc0000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pipRect.x + radius, pipRect.y);
      ctx.lineTo(pipRect.x + pipRect.w - radius, pipRect.y);
      ctx.quadraticCurveTo(pipRect.x + pipRect.w, pipRect.y, pipRect.x + pipRect.w, pipRect.y + radius);
      ctx.lineTo(pipRect.x + pipRect.w, pipRect.y + pipRect.h - radius);
      ctx.quadraticCurveTo(pipRect.x + pipRect.w, pipRect.y + pipRect.h, pipRect.x + pipRect.w - radius, pipRect.y + pipRect.h);
      ctx.lineTo(pipRect.x + radius, pipRect.y + pipRect.h);
      ctx.quadraticCurveTo(pipRect.x, pipRect.y + pipRect.h, pipRect.x, pipRect.y + pipRect.h - radius);
      ctx.lineTo(pipRect.x, pipRect.y + radius);
      ctx.quadraticCurveTo(pipRect.x, pipRect.y, pipRect.x + radius, pipRect.y);
      ctx.closePath();
      ctx.stroke();
    }

    animFrameId = requestAnimationFrame(draw);
  }
  draw();
}

function calcPipRect() {
  const margin = 20;
  const pipW = Math.round(canvas.width * (config.pipSize / 100));
  const pipH = Math.round(pipW * (9 / 16)); // 16:9 aspect ratio
  let x, y;

  switch (config.pipPosition) {
    case RX_PIP_POSITIONS.TL:
      x = margin; y = margin; break;
    case RX_PIP_POSITIONS.TR:
      x = canvas.width - pipW - margin; y = margin; break;
    case RX_PIP_POSITIONS.BL:
      x = margin; y = canvas.height - pipH - margin; break;
    case RX_PIP_POSITIONS.BR:
    default:
      x = canvas.width - pipW - margin; y = canvas.height - pipH - margin; break;
  }

  return { x, y, w: pipW, h: pipH };
}

// --- Recording controls ---

function pauseRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
    pauseStart = Date.now();
    console.log('[TubePilot RX] Recording paused');
  }
}

function resumeRecording() {
  if (mediaRecorder && mediaRecorder.state === 'paused') {
    pausedDuration += Date.now() - pauseStart;
    mediaRecorder.resume();
    console.log('[TubePilot RX] Recording resumed');
  }
}

function stopRecording() {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      cleanup();
      reject(new Error('No active recording'));
      return;
    }

    if (mediaRecorder.state === 'paused') {
      pausedDuration += Date.now() - pauseStart;
    }

    const duration = Date.now() - startTime - pausedDuration;

    mediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
        const id = 'rx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);

        await saveRecording(id, blob, duration);
        cleanup();

        // Notify service worker
        chrome.runtime.sendMessage({
          type: RX_MESSAGES.RECORDING_READY,
          recordingId: id,
          duration,
          size: blob.size
        }).catch(() => {});

        resolve({ recordingId: id, duration, size: blob.size });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    mediaRecorder.stop();
  });
}

// --- Config updates ---

function updateConfig(cfg) {
  if (cfg.pipPosition !== undefined) config.pipPosition = cfg.pipPosition;
  if (cfg.pipSize !== undefined) config.pipSize = cfg.pipSize;
  if (cfg.tabVolume !== undefined) {
    config.tabVolume = cfg.tabVolume;
    if (tabGain) tabGain.gain.value = cfg.tabVolume / 100;
  }
  if (cfg.micVolume !== undefined) {
    config.micVolume = cfg.micVolume;
    if (micGain) micGain.gain.value = cfg.micVolume / 100;
  }
}

// --- Cleanup ---

function cleanup() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch {}
  }
  mediaRecorder = null;
  recordedChunks = [];

  if (tabStream) {
    tabStream.getTracks().forEach(t => t.stop());
    tabStream = null;
  }
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }

  tabVideo.srcObject = null;
  camVideo.srcObject = null;

  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  tabGain = null;
  micGain = null;

  if (composedStream) {
    composedStream.getTracks().forEach(t => t.stop());
    composedStream = null;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  console.log('[TubePilot RX] Cleanup complete');
}
