/**
 * TubePilot Reactions — Full Tab Page
 */

document.addEventListener('DOMContentLoaded', async () => {
  // --- Elements ---
  const previewVideo = document.getElementById('preview-video');
  const previewPlaceholder = document.getElementById('preview-placeholder');
  const recordingIndicator = document.getElementById('recording-indicator');
  const pausedIndicator = document.getElementById('paused-indicator');

  const cameraSelect = document.getElementById('camera-select');
  const micSelect = document.getElementById('mic-select');
  const tabSelect = document.getElementById('tab-select');
  const refreshTabsBtn = document.getElementById('refresh-tabs-btn');

  const pipBtns = document.querySelectorAll('.rx-pip-btn');
  const pipSizeSlider = document.getElementById('pip-size-slider');
  const pipSizeValue = document.getElementById('pip-size-value');

  const tabVolumeSlider = document.getElementById('tab-volume-slider');
  const tabVolumeValue = document.getElementById('tab-volume-value');
  const micVolumeSlider = document.getElementById('mic-volume-slider');
  const micVolumeValue = document.getElementById('mic-volume-value');

  const recordBtn = document.getElementById('record-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  const timerEl = document.getElementById('timer');
  const statusMsg = document.getElementById('status-msg');

  const outputSection = document.getElementById('output-section');
  const outputVideo = document.getElementById('output-video');
  const outputMeta = document.getElementById('output-meta');
  const downloadBtn = document.getElementById('download-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const uploadProgress = document.getElementById('upload-progress');
  const uploadFill = document.getElementById('upload-fill');
  const uploadText = document.getElementById('upload-text');

  const minimizeBtn = document.getElementById('minimize-btn');

  // --- State ---
  let currentState = RX_STATES.IDLE;
  let previewStream = null;
  let timerInterval = null;
  let timerSeconds = 0;
  let timerPaused = false;
  let lastRecordingId = null;
  let lastRecordingBlob = null;

  // --- Device enumeration ---

  async function loadDevices() {
    try {
      // Request permission first to get device labels
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      tempStream.getTracks().forEach(t => t.stop());
    } catch {}

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(d => d.kind === 'videoinput');
    const mics = devices.filter(d => d.kind === 'audioinput');

    cameraSelect.innerHTML = cameras.length
      ? cameras.map(d => `<option value="${d.deviceId}">${d.label || 'Camera ' + (cameras.indexOf(d) + 1)}</option>`).join('')
      : '<option value="">No cameras found</option>';

    micSelect.innerHTML = mics.length
      ? mics.map(d => `<option value="${d.deviceId}">${d.label || 'Mic ' + (mics.indexOf(d) + 1)}</option>`).join('')
      : '<option value="">No microphones found</option>';

    // Start preview with first camera
    if (cameras.length > 0) {
      startPreview(cameras[0].deviceId);
    }
  }

  async function startPreview(deviceId) {
    // Stop existing preview
    if (previewStream) {
      previewStream.getTracks().forEach(t => t.stop());
      previewStream = null;
    }

    try {
      previewStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false
      });
      previewVideo.srcObject = previewStream;
      previewVideo.style.display = 'block';
      previewPlaceholder.classList.add('hidden');
    } catch (e) {
      console.warn('[TubePilot RX] Preview failed:', e.message);
      setStatus('Camera preview failed: ' + e.message, true);
    }
  }

  cameraSelect.addEventListener('change', () => {
    if (cameraSelect.value) startPreview(cameraSelect.value);
  });

  // --- YouTube tab enumeration ---

  async function loadYouTubeTabs() {
    try {
      const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/*' });
      if (tabs.length === 0) {
        tabSelect.innerHTML = '<option value="">No YouTube tabs open</option>';
        recordBtn.disabled = true;
        return;
      }
      tabSelect.innerHTML = tabs.map(t =>
        `<option value="${t.id}">${truncate(t.title || 'YouTube', 60)}</option>`
      ).join('');
      updateRecordBtnState();
    } catch (e) {
      tabSelect.innerHTML = '<option value="">Error loading tabs</option>';
    }
  }

  refreshTabsBtn.addEventListener('click', loadYouTubeTabs);

  // --- PiP position ---

  let pipPosition = RX_PIP_POSITIONS.BR;

  pipBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      pipBtns.forEach(b => b.classList.remove('rx-pip-btn-active'));
      btn.classList.add('rx-pip-btn-active');
      pipPosition = btn.dataset.pos;
      sendConfigUpdate();
    });
  });

  pipSizeSlider.addEventListener('input', () => {
    pipSizeValue.textContent = pipSizeSlider.value;
    sendConfigUpdate();
  });

  // --- Volume ---

  tabVolumeSlider.addEventListener('input', () => {
    tabVolumeValue.textContent = tabVolumeSlider.value + '%';
    sendConfigUpdate();
  });

  micVolumeSlider.addEventListener('input', () => {
    micVolumeValue.textContent = micVolumeSlider.value + '%';
    sendConfigUpdate();
  });

  function sendConfigUpdate() {
    if (currentState !== RX_STATES.RECORDING && currentState !== RX_STATES.PAUSED) return;
    chrome.runtime.sendMessage({
      type: RX_MESSAGES.UPDATE_CONFIG,
      config: {
        pipPosition,
        pipSize: parseInt(pipSizeSlider.value),
        tabVolume: parseInt(tabVolumeSlider.value),
        micVolume: parseInt(micVolumeSlider.value)
      }
    }).catch(() => {});
  }

  // --- Recording controls ---

  function updateRecordBtnState() {
    recordBtn.disabled = !tabSelect.value || currentState !== RX_STATES.IDLE;
  }

  tabSelect.addEventListener('change', updateRecordBtnState);

  recordBtn.addEventListener('click', async () => {
    if (!tabSelect.value) return;

    recordBtn.disabled = true;
    setStatus('Starting capture...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: RX_MESSAGES.START_CAPTURE,
        tabId: parseInt(tabSelect.value),
        cameraDeviceId: cameraSelect.value || undefined,
        micDeviceId: micSelect.value || undefined,
        pipPosition,
        pipSize: parseInt(pipSizeSlider.value),
        tabVolume: parseInt(tabVolumeSlider.value),
        micVolume: parseInt(micVolumeSlider.value)
      });

      if (response && response.success) {
        setState(RX_STATES.RECORDING);
        setStatus('Recording...');
        // Hide webcam preview during recording (offscreen handles compositing)
        previewVideo.style.display = 'none';
        previewPlaceholder.classList.remove('hidden');
        previewPlaceholder.querySelector('span').textContent = 'Recording in progress...';
      } else {
        setStatus(response?.error || 'Failed to start recording', true);
        recordBtn.disabled = false;
      }
    } catch (err) {
      setStatus('Error: ' + err.message, true);
      recordBtn.disabled = false;
    }
  });

  pauseBtn.addEventListener('click', async () => {
    if (currentState === RX_STATES.RECORDING) {
      await chrome.runtime.sendMessage({ type: RX_MESSAGES.PAUSE });
      setState(RX_STATES.PAUSED);
      setStatus('Paused — browse to another video and resume');
    } else if (currentState === RX_STATES.PAUSED) {
      await chrome.runtime.sendMessage({ type: RX_MESSAGES.RESUME });
      setState(RX_STATES.RECORDING);
      setStatus('Recording...');
    }
  });

  stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true;
    setStatus('Stopping...');
    try {
      const response = await chrome.runtime.sendMessage({ type: RX_MESSAGES.STOP_CAPTURE });
      if (response && response.success) {
        setState(RX_STATES.STOPPED);
        if (response.recordingId) {
          lastRecordingId = response.recordingId;
          await loadRecordingOutput(response.recordingId, response.duration, response.size);
        }
        setStatus('Recording saved');
      } else {
        setStatus(response?.error || 'Failed to stop', true);
      }
    } catch (err) {
      setStatus('Error stopping: ' + err.message, true);
    }
  });

  // --- State management ---

  function setState(state) {
    currentState = state;

    recordingIndicator.classList.toggle('hidden', state !== RX_STATES.RECORDING);
    pausedIndicator.classList.toggle('hidden', state !== RX_STATES.PAUSED);

    switch (state) {
      case RX_STATES.IDLE:
        recordBtn.disabled = !tabSelect.value;
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        pauseBtn.textContent = 'Pause';
        stopTimer();
        break;
      case RX_STATES.RECORDING:
        recordBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        pauseBtn.textContent = 'Pause';
        startTimer();
        break;
      case RX_STATES.PAUSED:
        recordBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        pauseBtn.textContent = 'Resume';
        pauseTimer();
        break;
      case RX_STATES.STOPPED:
        recordBtn.disabled = false;
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        pauseBtn.textContent = 'Pause';
        stopTimer();
        // Restore preview
        previewPlaceholder.querySelector('span').textContent = 'Camera preview will appear here';
        if (cameraSelect.value) startPreview(cameraSelect.value);
        break;
    }
  }

  // --- Timer ---

  function startTimer() {
    if (timerInterval) return;
    timerPaused = false;
    timerInterval = setInterval(() => {
      if (!timerPaused) {
        timerSeconds++;
        timerEl.textContent = formatTime(timerSeconds);
      }
    }, 1000);
  }

  function pauseTimer() {
    timerPaused = true;
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerSeconds = 0;
    timerEl.textContent = '00:00:00';
    timerPaused = false;
  }

  function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  }

  // --- Output ---

  async function loadRecordingOutput(recordingId, duration, size) {
    try {
      const db = await openDB();
      const tx = db.transaction('recordings', 'readonly');
      const store = tx.objectStore('recordings');
      const rec = await new Promise((resolve, reject) => {
        const req = store.get(recordingId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (!rec || !rec.blob) {
        setStatus('Recording not found in storage', true);
        return;
      }

      lastRecordingBlob = rec.blob;
      const url = URL.createObjectURL(rec.blob);
      outputVideo.src = url;

      const durationStr = duration ? formatTime(Math.round(duration / 1000)) : 'Unknown';
      const sizeStr = size ? formatFileSize(size) : formatFileSize(rec.blob.size);
      outputMeta.textContent = `Duration: ${durationStr}  |  Size: ${sizeStr}`;

      outputSection.classList.remove('hidden');
    } catch (err) {
      setStatus('Failed to load recording: ' + err.message, true);
    }
  }

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

  // --- Download ---

  downloadBtn.addEventListener('click', () => {
    if (!lastRecordingBlob) return;
    const url = URL.createObjectURL(lastRecordingBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reaction-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // --- Upload to YouTube ---

  uploadBtn.addEventListener('click', async () => {
    if (!lastRecordingBlob) return;

    uploadBtn.disabled = true;
    uploadProgress.classList.remove('hidden');
    uploadText.textContent = 'Getting upload token...';
    uploadFill.style.width = '0%';

    try {
      // Get channel token
      const tokenResp = await chrome.runtime.sendMessage({ type: 'GET_CHANNEL_TOKEN' });
      if (!tokenResp || !tokenResp.success) {
        throw new Error(tokenResp?.error || 'Failed to get channel token');
      }

      uploadText.textContent = 'Uploading to YouTube...';
      uploadFill.style.width = '10%';

      // Upload via YouTube Data API
      const metadata = JSON.stringify({
        snippet: {
          title: 'Reaction Video — ' + new Date().toLocaleDateString(),
          description: 'Recorded with TubePilot Reactions',
          categoryId: '22'
        },
        status: {
          privacyStatus: 'private',
          selfDeclaredMadeForKids: false
        }
      });

      const form = new FormData();
      form.append('metadata', new Blob([metadata], { type: 'application/json' }));
      form.append('video', lastRecordingBlob, 'reaction.webm');

      const uploadResp = await fetch(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenResp.token}` },
          body: form
        }
      );

      uploadFill.style.width = '90%';

      if (!uploadResp.ok) {
        const errText = await uploadResp.text().catch(() => '');
        throw new Error(`Upload failed (${uploadResp.status}): ${errText}`);
      }

      const result = await uploadResp.json();
      uploadFill.style.width = '100%';
      uploadText.textContent = 'Uploaded! Video ID: ' + result.id;

      // Track upload quota
      chrome.runtime.sendMessage({ type: 'TRACK_UPLOAD_QUOTA' }).catch(() => {});

    } catch (err) {
      uploadText.textContent = 'Upload failed: ' + err.message;
      uploadBtn.disabled = false;
    }
  });

  // --- Minimize to side panel ---

  minimizeBtn.addEventListener('click', async () => {
    try {
      const currentWindow = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: currentWindow.id });
    } catch (err) {
      console.warn('[TubePilot RX] Failed to open side panel:', err.message);
    }
  });

  // --- Listen for state changes from service worker ---

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === RX_MESSAGES.STATE_CHANGED) {
      setState(message.state);
      if (message.state === RX_STATES.STOPPED && message.recordingId) {
        lastRecordingId = message.recordingId;
        loadRecordingOutput(message.recordingId, message.duration, message.size);
      }
    }
    if (message.type === RX_MESSAGES.RECORDING_READY) {
      lastRecordingId = message.recordingId;
      loadRecordingOutput(message.recordingId, message.duration, message.size);
    }
  });

  // --- Status helper ---

  function setStatus(msg, isError = false) {
    statusMsg.textContent = msg;
    statusMsg.className = 'rx-status' + (isError ? ' error' : '');
  }

  // --- Check initial state ---

  try {
    const stateResp = await chrome.runtime.sendMessage({ type: RX_MESSAGES.GET_STATE });
    if (stateResp && stateResp.success && stateResp.state !== RX_STATES.IDLE) {
      setState(stateResp.state);
      if (stateResp.state === RX_STATES.RECORDING) {
        setStatus('Recording in progress...');
      } else if (stateResp.state === RX_STATES.PAUSED) {
        setStatus('Recording paused');
      }
    }
  } catch {}

  // --- Utilities ---

  function truncate(str, max) {
    return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // --- Init ---

  await loadDevices();
  await loadYouTubeTabs();
});
