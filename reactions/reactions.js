/**
 * TubePilot Reactions — Full Tab Page (Phase 1)
 *
 * Visible canvas compositing, audio mixing, MediaRecorder,
 * player controls, view toggle.
 */

document.addEventListener('DOMContentLoaded', async () => {

  // ============================================================
  // Elements
  // ============================================================

  const previewCanvas = document.getElementById('preview-canvas');
  const previewCtx = previewCanvas.getContext('2d');
  const recordingCanvas = document.getElementById('recording-canvas');
  const recordingCtx = recordingCanvas.getContext('2d');
  const previewPlaceholder = document.getElementById('preview-placeholder');
  const recIndicator = document.getElementById('rec-indicator');

  const tabVideo = document.getElementById('tab-video');
  const camVideo = document.getElementById('cam-video');

  // Top bar recording controls
  const recDot = document.getElementById('rec-dot');
  const recTimer = document.getElementById('rec-timer');
  const recordBtn = document.getElementById('record-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');

  // View toggle
  const viewBtns = document.querySelectorAll('.view-btn');

  // Player controls
  const playPauseBtn = document.getElementById('play-pause-btn');
  const currentTimeEl = document.getElementById('current-time');
  const durationTimeEl = document.getElementById('duration-time');
  const seekInput = document.getElementById('seek-input');
  const seekFill = document.getElementById('seek-fill');

  // Queue tab
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const searchStatus = document.getElementById('search-status');
  const nowPlayingSection = document.getElementById('now-playing');
  const nowPlayingCard = document.getElementById('now-playing-card');
  const queueSection = document.getElementById('queue-section');
  const queueList = document.getElementById('queue-list');
  const searchResultsSection = document.getElementById('search-results-section');
  const searchResultsList = document.getElementById('search-results-list');

  // Nav buttons
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  // Camera tab
  const camPreview = document.getElementById('cam-preview');
  const camPlaceholder = document.getElementById('cam-placeholder');
  const cameraSelect = document.getElementById('camera-select');
  const micSelect = document.getElementById('mic-select');
  const mirrorBtn = document.getElementById('mirror-btn');

  // Volume
  const tabVolumeSlider = document.getElementById('tab-volume-slider');
  const tabVolumeValue = document.getElementById('tab-volume-value');
  const micVolumeSlider = document.getElementById('mic-volume-slider');
  const micVolumeValue = document.getElementById('mic-volume-value');
  const micMuteBtn = document.getElementById('mic-mute-btn');

  // Sidebar tabs
  const sidebarTabs = document.querySelectorAll('.sidebar-tab');

  // Output
  const outputSection = document.getElementById('output-section');
  const outputVideo = document.getElementById('output-video');
  const outputMeta = document.getElementById('output-meta');
  const downloadBtn = document.getElementById('download-btn');
  const outputCloseBtn = document.getElementById('output-close-btn');

  // Upload form
  const uploadToggleBtn = document.getElementById('upload-toggle-btn');
  const uploadForm = document.getElementById('upload-form');
  const uploadChannelSelect = document.getElementById('upload-channel');
  const connectChannelBtn = document.getElementById('connect-channel-btn');
  const uploadTitle = document.getElementById('upload-title');
  const uploadTitleCount = document.getElementById('upload-title-count');
  const uploadDescription = document.getElementById('upload-description');
  const uploadDescCount = document.getElementById('upload-desc-count');
  const uploadCategory = document.getElementById('upload-category');
  const uploadVisibility = document.getElementById('upload-visibility');
  const uploadBtn = document.getElementById('upload-btn');
  const uploadCancelBtn = document.getElementById('upload-cancel-btn');
  const uploadProgress = document.getElementById('upload-progress');
  const uploadProgressFill = document.getElementById('upload-progress-fill');
  const uploadProgressText = document.getElementById('upload-progress-text');
  const uploadResult = document.getElementById('upload-result');
  const uploadVideoId = document.getElementById('upload-video-id');
  const uploadStudioLink = document.getElementById('upload-studio-link');
  const uploadError = document.getElementById('upload-error');

  // ============================================================
  // State
  // ============================================================

  let currentState = RX_STATES.IDLE;
  let currentView = RX_VIEWS.FINAL;

  // PiP position / size (absolute coordinates, null = compute default on first render)
  let pipX = null;
  let pipY = null;
  let pipSizePercent = RX_DEFAULTS.pipSize;

  // PiP style
  let pipShape = RX_DEFAULTS.pipShape;
  let pipBorderColor = RX_DEFAULTS.pipBorderColor;
  let pipBorderWidth = RX_DEFAULTS.pipBorderWidth;
  let pipCornerRadius = RX_DEFAULTS.pipCornerRadius;

  // PiP interaction state
  let pipSelected = false;
  let pipDragging = false;
  let pipResizing = false;
  let pipResizeCorner = null;
  let pipDragOffsetX = 0;
  let pipDragOffsetY = 0;
  let pipHovered = false;

  // Streams
  let tabStream = null;
  let camStream = null;
  let camPreviewStream = null;

  // Audio
  let audioCtx = null;
  let tabGain = null;
  let micGain = null;
  let micSourceNode = null;
  let audioDest = null;
  let micMuted = false;
  let savedMicGain = 1;

  // Camera mirror
  let camMirrored = false;

  // Recording
  let mediaRecorder = null;
  let recordedChunks = [];
  let composedStream = null;
  let startTime = 0;
  let pausedDuration = 0;
  let pauseStart = 0;

  // Render loop
  let animFrameId = null;

  // Timer
  let timerInterval = null;
  let timerSeconds = 0;
  let timerPaused = false;

  // Player state
  let playerPlaying = false;
  let playerCurrentTime = 0;
  let playerDuration = 0;
  let seeking = false;

  // Output
  let lastRecordingBlob = null;
  let lastRecordingThumbnail = null;

  // Upload
  let uploadXhr = null;

  // Phase 8 — Post-recording tools
  let recordedChunksMeta = [];       // [{ index, timestamp, size }]
  let recordingMimeType = '';        // stored mimeType for getExportBlob
  let trimStartIdx = 0;             // chunk index for trim start
  let trimEndIdx = -1;              // chunk index for trim end (-1 = last)
  let chunkAudioLevels = [];        // normalized RMS per chunk (0-1)
  let rawRmsLevels = [];            // un-normalized RMS per chunk
  let silentChunkRanges = [];       // [{ startIdx, endIdx }]
  let silentChunkSet = new Set();   // chunk indices flagged as silent
  let silenceRemovalEnabled = false;
  let captionSegments = [];         // [{ start, end, text }] ms relative to recording start
  let speechRecognition = null;
  let captionsEnabled = false;
  let customThumbnailDataUrl = null;
  let aiMetaGenerating = false;
  let postToolsInitialized = false;

  // BG removal (Phase 5)
  let bgRemovalEnabled = false;
  let bgRemovalSupported = true;
  let bgRemovalMode = 'remove';     // 'remove' or 'blur'
  let bgFeatherValue = CONFIG.REACTIONS.BG_REMOVAL.DEFAULT_FEATHER;
  let bgBlurStrength = CONFIG.REACTIONS.BG_REMOVAL.DEFAULT_BLUR_STRENGTH;

  let segmenter = null;
  let segmenterInitializing = false;
  let currentMaskData = null;        // Float32Array, copied from MediaPipe
  let currentMaskWidth = 0;
  let currentMaskHeight = 0;
  let lastSegTimestamp = 0;

  // Offscreen canvases (created lazily)
  let bgCamCanvas = null;
  let bgMaskCanvas = null;
  let bgTempCanvas = null;
  let bgBlurCanvas = null;

  // Segmentation performance
  let segLastDuration = 0;
  let segTargetInterval = Math.round(1000 / CONFIG.REACTIONS.BG_REMOVAL.SEG_TARGET_FPS);
  let segConsecutiveErrors = 0;

  // Feather LUT (precomputed)
  let featherLUT = new Uint8Array(256);

  // Queue
  let videoQueue = [];
  let nowPlaying = null;
  let playHistory = [];
  let isFirstVideoLoad = true;
  let lastSearchResults = [];

  // Layout system (Phase 6)
  let currentLayout = RX_LAYOUTS.PIP;
  let activePreset = RX_PRESETS.PIP_BR;
  let recordingView = RX_VIEWS.FINAL;
  let webcamOnlyMode = false;

  // Sync link
  let recordingStartVideoId = null;
  let recordingStartVideoTime = 0;

  // ============================================================
  // (a) Video loading & Queue system
  // ============================================================

  function parseVideoId(input) {
    if (!input) return null;
    input = input.trim();
    // Direct ID (11 chars)
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
    // URL patterns
    try {
      const url = new URL(input);
      if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
        if (url.hostname === 'youtu.be') return url.pathname.slice(1);
        const v = url.searchParams.get('v');
        if (v) return v;
        // /embed/ID
        const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
        if (embedMatch) return embedMatch[1];
      }
    } catch {}
    // Fallback — treat as ID if it looks plausible
    if (/^[a-zA-Z0-9_-]{10,12}$/.test(input)) return input;
    return null;
  }

  function setSearchStatus(msg, type) {
    searchStatus.textContent = msg;
    searchStatus.className = 'search-status' + (type ? ' ' + type : '');
  }

  // --- Search input handler ---

  searchBtn.addEventListener('click', () => handleSearchInput());
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearchInput();
  });

  async function handleSearchInput() {
    const input = searchInput.value.trim();
    if (!input) return;

    // Check if it's a direct URL/ID
    const videoId = parseVideoId(input);
    if (videoId) {
      const videoObj = {
        videoId,
        title: 'Video ' + videoId,
        channelTitle: '',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
      };
      addToQueueOrPlay(videoObj);
      searchInput.value = '';
      return;
    }

    // Otherwise, search via YouTube API
    setSearchStatus('Searching...', 'loading');
    searchBtn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: RX_MESSAGES.YOUTUBE_SEARCH,
        query: input
      });

      if (!response || !response.success) {
        const err = response?.error || 'Search failed';
        if (err.includes('token expired') || err.includes('No channel')) {
          setSearchStatus('Sign in and connect a channel to search YouTube', 'info');
        } else if (err.includes('quota')) {
          setSearchStatus('Search quota reached — try again tomorrow or paste a URL', 'error');
        } else {
          setSearchStatus(err, 'error');
        }
        return;
      }

      lastSearchResults = response.results || [];
      if (lastSearchResults.length === 0) {
        setSearchStatus('No results found', 'info');
        searchResultsSection.classList.add('hidden');
      } else {
        setSearchStatus('');
        renderSearchResults();
      }
    } catch (err) {
      setSearchStatus('Search error: ' + err.message, 'error');
    } finally {
      searchBtn.disabled = false;
    }
  }

  // --- Queue management ---

  function addToQueueOrPlay(videoObj) {
    // Deduplicate
    if (nowPlaying && nowPlaying.videoId === videoObj.videoId) {
      setSearchStatus('Already playing', 'info');
      return;
    }
    if (videoQueue.some(v => v.videoId === videoObj.videoId)) {
      setSearchStatus('Already in queue', 'info');
      return;
    }

    if (!nowPlaying) {
      playVideo(videoObj);
    } else {
      if (videoQueue.length >= CONFIG.REACTIONS.QUEUE_MAX_SIZE) {
        setSearchStatus('Queue is full (max ' + CONFIG.REACTIONS.QUEUE_MAX_SIZE + ')', 'error');
        return;
      }
      videoQueue.push(videoObj);
      setSearchStatus('Added to queue', 'success');
      renderQueue();
      updateNavButtons();
    }
  }

  async function playVideo(videoObj) {
    // Push current to history
    if (nowPlaying) {
      playHistory.push(nowPlaying);
    }
    nowPlaying = videoObj;

    // Reset player UI
    playerPlaying = false;
    playerCurrentTime = 0;
    playerDuration = 0;
    playPauseBtn.innerHTML = '&#x25B6;';
    seekInput.value = 0;
    seekFill.style.width = '0%';
    currentTimeEl.textContent = '0:00';
    durationTimeEl.textContent = '0:00';

    renderNowPlaying();
    renderQueue();
    updateNavButtons();

    if (isFirstVideoLoad) {
      // Full flow: create player tab, capture, set up audio
      setSearchStatus('Loading video...', 'loading');
      try {
        const response = await chrome.runtime.sendMessage({
          type: RX_MESSAGES.LOAD_VIDEO,
          videoId: videoObj.videoId
        });

        if (!response || !response.success) {
          throw new Error(response?.error || 'Failed to load video');
        }

        // Got streamId — get the MediaStream
        const streamId = response.streamId;
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

        // Set canvas dimensions from video
        const vTrack = tabStream.getVideoTracks()[0];
        if (vTrack) {
          const settings = vTrack.getSettings();
          const w = settings.width || RX_DEFAULTS.canvasWidth;
          const h = settings.height || RX_DEFAULTS.canvasHeight;
          previewCanvas.width = w;
          previewCanvas.height = h;
          recordingCanvas.width = w;
          recordingCanvas.height = h;
        }

        // Set up audio mixing
        setupAudioMixing();

        // Hide placeholder, start render loop
        previewPlaceholder.classList.add('hidden');
        startRenderLoop();

        // Enable player controls
        playPauseBtn.disabled = false;
        seekInput.disabled = false;
        recordBtn.disabled = false;

        isFirstVideoLoad = false;
        setSearchStatus('');
      } catch (err) {
        setSearchStatus('Error: ' + err.message, 'error');
        // Revert nowPlaying
        nowPlaying = playHistory.length > 0 ? playHistory.pop() : null;
        renderNowPlaying();
        updateNavButtons();
      }
    } else {
      // Lightweight: just change video in existing player tab
      setSearchStatus('Loading next video...', 'loading');
      try {
        const response = await chrome.runtime.sendMessage({
          type: RX_MESSAGES.LOAD_NEXT_VIDEO,
          videoId: videoObj.videoId
        });

        if (!response || !response.success) {
          if (response?.error === 'No player tab') {
            // Player tab was closed — fall back to full flow
            isFirstVideoLoad = true;
            await playVideo(videoObj);
            return;
          }
          throw new Error(response?.error || 'Failed to load video');
        }
        setSearchStatus('');
      } catch (err) {
        setSearchStatus('Error: ' + err.message, 'error');
        nowPlaying = playHistory.length > 0 ? playHistory.pop() : null;
        renderNowPlaying();
        updateNavButtons();
      }
    }
  }

  function playNextInQueue() {
    if (videoQueue.length === 0) return;
    const next = videoQueue.shift();
    playVideo(next);
  }

  function playPrevious() {
    if (playHistory.length === 0) return;
    const prev = playHistory.pop();
    // Put current back at front of queue
    if (nowPlaying) {
      videoQueue.unshift(nowPlaying);
    }
    nowPlaying = null; // prevent double-push in playVideo
    playVideo(prev);
    // Remove the duplicate history entry that playVideo would add (since nowPlaying was null)
  }

  function removeFromQueue(index) {
    if (index >= 0 && index < videoQueue.length) {
      videoQueue.splice(index, 1);
      renderQueue();
      updateNavButtons();
    }
  }

  function moveQueueItem(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= videoQueue.length) return;
    const temp = videoQueue[index];
    videoQueue[index] = videoQueue[newIndex];
    videoQueue[newIndex] = temp;
    renderQueue();
  }

  // --- Nav buttons ---

  prevBtn.addEventListener('click', () => playPrevious());
  nextBtn.addEventListener('click', () => playNextInQueue());

  function updateNavButtons() {
    prevBtn.disabled = playHistory.length === 0;
    nextBtn.disabled = videoQueue.length === 0;
  }

  // --- Rendering ---

  function renderNowPlaying() {
    if (!nowPlaying) {
      nowPlayingSection.classList.add('hidden');
      return;
    }
    nowPlayingSection.classList.remove('hidden');
    nowPlayingCard.innerHTML = `
      <img class="np-thumb" src="${escapeAttr(nowPlaying.thumbnail)}" alt="">
      <div class="np-info">
        <div class="np-title" title="${escapeAttr(nowPlaying.title)}">${escapeHtml(nowPlaying.title)}</div>
        <div class="np-channel">${escapeHtml(nowPlaying.channelTitle)}</div>
      </div>
    `;
  }

  function renderQueue() {
    if (videoQueue.length === 0) {
      queueSection.classList.add('hidden');
      return;
    }
    queueSection.classList.remove('hidden');
    queueList.innerHTML = videoQueue.map((v, i) => `
      <div class="queue-item" data-index="${i}">
        <span class="qi-num">${i + 1}</span>
        <img class="qi-thumb" src="${escapeAttr(v.thumbnail)}" alt="">
        <div class="qi-info">
          <div class="qi-title" title="${escapeAttr(v.title)}">${escapeHtml(v.title)}</div>
          <div class="qi-channel">${escapeHtml(v.channelTitle)}</div>
        </div>
        <div class="qi-actions">
          <button class="qi-action-btn qi-up" data-index="${i}" title="Move up">&uarr;</button>
          <button class="qi-action-btn qi-down" data-index="${i}" title="Move down">&darr;</button>
          <button class="qi-action-btn qi-remove" data-index="${i}" title="Remove">&times;</button>
        </div>
      </div>
    `).join('');

    // Queue item event listeners
    queueList.querySelectorAll('.qi-up').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveQueueItem(parseInt(btn.dataset.index), -1);
      });
    });
    queueList.querySelectorAll('.qi-down').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveQueueItem(parseInt(btn.dataset.index), 1);
      });
    });
    queueList.querySelectorAll('.qi-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromQueue(parseInt(btn.dataset.index));
      });
    });
    // Double-click to play immediately
    queueList.querySelectorAll('.queue-item').forEach(item => {
      item.addEventListener('dblclick', () => {
        const idx = parseInt(item.dataset.index);
        const videoObj = videoQueue.splice(idx, 1)[0];
        if (videoObj) playVideo(videoObj);
      });
    });
  }

  function renderSearchResults() {
    if (lastSearchResults.length === 0) {
      searchResultsSection.classList.add('hidden');
      return;
    }
    searchResultsSection.classList.remove('hidden');
    searchResultsList.innerHTML = lastSearchResults.map((v, i) => `
      <div class="search-result" data-index="${i}">
        <img class="sr-thumb" src="${escapeAttr(v.thumbnail)}" alt="">
        <div class="sr-info">
          <div class="sr-title" title="${escapeAttr(v.title)}">${escapeHtml(v.title)}</div>
          <div class="sr-channel">${escapeHtml(v.channelTitle)}</div>
        </div>
        <button class="sr-add-btn" data-index="${i}">+ Queue</button>
      </div>
    `).join('');

    searchResultsList.querySelectorAll('.sr-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        const videoObj = lastSearchResults[idx];
        if (videoObj) addToQueueOrPlay(videoObj);
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ============================================================
  // (b) Webcam setup
  // ============================================================

  async function loadDevices() {
    try {
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

    if (cameras.length > 0) {
      startCamPreview(cameras[0].deviceId);
    }
  }

  async function startCamPreview(deviceId) {
    if (camPreviewStream) {
      camPreviewStream.getTracks().forEach(t => t.stop());
      camPreviewStream = null;
    }

    try {
      camPreviewStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false
      });
      camPreview.srcObject = camPreviewStream;
      camPlaceholder.classList.add('hidden');
    } catch (e) {
      console.warn('[TubePilot RX] Camera preview failed:', e.message);
    }
  }

  async function startCamStream() {
    if (camStream) {
      camStream.getTracks().forEach(t => t.stop());
      camStream = null;
    }

    const constraints = { video: true, audio: true };
    if (cameraSelect.value) {
      constraints.video = { deviceId: { exact: cameraSelect.value } };
    }
    if (micSelect.value) {
      constraints.audio = { deviceId: { exact: micSelect.value } };
    }

    try {
      camStream = await navigator.mediaDevices.getUserMedia(constraints);
      camVideo.srcObject = camStream;
      await camVideo.play();

      // Add mic to audio mix
      if (audioCtx && audioDest) {
        const micAudioTracks = camStream.getAudioTracks();
        if (micAudioTracks.length > 0) {
          micSourceNode = audioCtx.createMediaStreamSource(new MediaStream(micAudioTracks));
          micGain = audioCtx.createGain();
          micGain.gain.value = micMuted ? 0 : parseInt(micVolumeSlider.value) / 100;
          micSourceNode.connect(micGain);
          micGain.connect(audioDest);
        }
      }
    } catch (e) {
      console.warn('[TubePilot RX] Webcam unavailable:', e.message);
    }
  }

  cameraSelect.addEventListener('change', async () => {
    if (!cameraSelect.value) return;
    startCamPreview(cameraSelect.value);
    // Hot-swap camera if stream is active
    if (camStream && camStream.getVideoTracks().length > 0) {
      await swapCamDevice(cameraSelect.value);
    }
  });

  mirrorBtn.addEventListener('click', () => {
    camMirrored = !camMirrored;
    mirrorBtn.classList.toggle('active', camMirrored);
    // Also mirror the sidebar camera preview via CSS
    camPreview.style.transform = camMirrored ? 'scaleX(-1)' : '';
  });

  micSelect.addEventListener('change', async () => {
    if (!micSelect.value) return;
    // Hot-swap mic if stream is active
    if (camStream && camStream.getAudioTracks().length > 0) {
      await swapMicDevice(micSelect.value);
    }
  });

  async function swapCamDevice(deviceId) {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;

      // Replace video track in camStream
      const oldTrack = camStream.getVideoTracks()[0];
      camStream.removeTrack(oldTrack);
      camStream.addTrack(newTrack);

      // Update camVideo so the render loop picks up the new track
      camVideo.srcObject = camStream;

      // Stop old track
      if (oldTrack) oldTrack.stop();
    } catch (e) {
      console.warn('[TubePilot RX] Camera swap failed:', e.message);
    }
  }

  async function swapMicDevice(deviceId) {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { deviceId: { exact: deviceId } }
      });
      const newAudioTrack = newStream.getAudioTracks()[0];
      if (!newAudioTrack) return;

      // Disconnect old mic source from audio graph
      if (micSourceNode) {
        micSourceNode.disconnect();
        micSourceNode = null;
      }

      // Replace audio track in camStream
      const oldTrack = camStream.getAudioTracks()[0];
      camStream.removeTrack(oldTrack);
      camStream.addTrack(newAudioTrack);

      // Create new source and reconnect through same gain node
      if (audioCtx && micGain) {
        micSourceNode = audioCtx.createMediaStreamSource(new MediaStream([newAudioTrack]));
        micSourceNode.connect(micGain);
        // micGain is already connected to audioDest — mute state is preserved
      }

      // Stop old track
      if (oldTrack) oldTrack.stop();
    } catch (e) {
      console.warn('[TubePilot RX] Mic swap failed:', e.message);
    }
  }

  // ============================================================
  // (b2) Background Removal — MediaPipe segmentation
  // ============================================================

  function buildFeatherLUT(sliderValue) {
    const t = sliderValue / 100;
    const low = 0.45 - t * 0.35;   // 0.45 → 0.10
    const high = 0.55 + t * 0.35;  // 0.55 → 0.90
    for (let i = 0; i < 256; i++) {
      const x = i / 255;
      const s = Math.max(0, Math.min(1, (x - low) / (high - low)));
      featherLUT[i] = Math.round(s * s * (3 - 2 * s) * 255); // smoothstep
    }
  }
  buildFeatherLUT(bgFeatherValue);

  async function initSegmenter() {
    if (segmenterInitializing || segmenter) return;
    segmenterInitializing = true;

    const toggleLabel = document.getElementById('bg-toggle-label');
    const statusHint = document.getElementById('bg-status-hint');
    if (toggleLabel) toggleLabel.classList.add('loading');
    if (statusHint) statusHint.textContent = 'Loading AI model...';

    try {
      const { FilesetResolver, ImageSegmenter } = await import(
        chrome.runtime.getURL(CONFIG.REACTIONS.BG_REMOVAL.VISION_BUNDLE_PATH)
      );

      const vision = await FilesetResolver.forVisionTasks(
        chrome.runtime.getURL(CONFIG.REACTIONS.BG_REMOVAL.WASM_PATH)
      );

      // Try GPU first, fall back to CPU
      let delegate = 'GPU';
      try {
        segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: chrome.runtime.getURL(CONFIG.REACTIONS.BG_REMOVAL.MODEL_PATH),
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          outputConfidenceMasks: true,
          outputCategoryMask: false
        });
      } catch (gpuErr) {
        console.warn('[TubePilot RX] GPU delegate failed, trying CPU:', gpuErr.message);
        delegate = 'CPU';
        segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: chrome.runtime.getURL(CONFIG.REACTIONS.BG_REMOVAL.MODEL_PATH),
            delegate: 'CPU'
          },
          runningMode: 'VIDEO',
          outputConfidenceMasks: true,
          outputCategoryMask: false
        });
      }

      console.log(`[TubePilot RX] Segmenter ready (${delegate})`);
      if (statusHint) statusHint.textContent = `AI model loaded (${delegate})`;
      segConsecutiveErrors = 0;
      lastSegTimestamp = 0;
    } catch (err) {
      console.error('[TubePilot RX] Segmenter init failed:', err);
      segmenter = null;
      bgRemovalSupported = false;
      bgRemovalEnabled = false;
      const toggle = document.getElementById('bg-removal-toggle');
      if (toggle) toggle.checked = false;
      if (statusHint) statusHint.textContent = 'BG removal unavailable: ' + err.message;
      const bgOptions = document.getElementById('bg-options');
      if (bgOptions) bgOptions.classList.add('hidden');
    } finally {
      segmenterInitializing = false;
      if (toggleLabel) toggleLabel.classList.remove('loading');
    }
  }

  function updateCurrentMask(result) {
    const masks = result.confidenceMasks;
    if (!masks || masks.length === 0) return;

    const mask = masks[0];
    // Get the mask data as Float32Array
    const data = mask.getAsFloat32Array();
    currentMaskWidth = mask.width;
    currentMaskHeight = mask.height;
    // Copy to our own buffer (MediaPipe reuses internal buffers)
    if (!currentMaskData || currentMaskData.length !== data.length) {
      currentMaskData = new Float32Array(data.length);
    }
    currentMaskData.set(data);
  }

  function runSegmentation(timestamp) {
    if (!bgRemovalEnabled || !segmenter || !camVideo.srcObject || camVideo.readyState < 2) return;

    // MediaPipe requires monotonically increasing timestamps
    if (timestamp <= lastSegTimestamp) return;

    // Throttle based on adaptive interval
    if (timestamp - lastSegTimestamp < segTargetInterval) return;

    try {
      const t0 = performance.now();
      const result = segmenter.segmentForVideo(camVideo, Math.round(timestamp));
      updateCurrentMask(result);
      result.close();

      segLastDuration = performance.now() - t0;
      segConsecutiveErrors = 0;

      // Adaptive throttling
      if (segLastDuration > 40) {
        segTargetInterval = Math.round(1000 / CONFIG.REACTIONS.BG_REMOVAL.SEG_MIN_FPS);
      } else if (segLastDuration > 25) {
        segTargetInterval = 67; // ~15fps
      } else {
        segTargetInterval = Math.round(1000 / CONFIG.REACTIONS.BG_REMOVAL.SEG_TARGET_FPS);
      }

      lastSegTimestamp = timestamp;
    } catch (err) {
      segConsecutiveErrors++;
      if (segConsecutiveErrors >= CONFIG.REACTIONS.BG_REMOVAL.SEG_ERROR_THRESHOLD) {
        console.error('[TubePilot RX] Segmentation error threshold hit, auto-disabling');
        bgRemovalEnabled = false;
        currentMaskData = null;
        const toggle = document.getElementById('bg-removal-toggle');
        if (toggle) toggle.checked = false;
        const statusHint = document.getElementById('bg-status-hint');
        if (statusHint) statusHint.textContent = 'Background removal stopped due to errors';
        const bgOptions = document.getElementById('bg-options');
        if (bgOptions) bgOptions.classList.add('hidden');
      }
    }
  }

  function ensureBgCanvases(w, h) {
    if (!bgCamCanvas || bgCamCanvas.width !== w || bgCamCanvas.height !== h) {
      bgCamCanvas = new OffscreenCanvas(w, h);
      bgBlurCanvas = new OffscreenCanvas(w, h);
      bgTempCanvas = new OffscreenCanvas(w, h);
    }
    if (!bgMaskCanvas || bgMaskCanvas.width !== currentMaskWidth || bgMaskCanvas.height !== currentMaskHeight) {
      bgMaskCanvas = new OffscreenCanvas(currentMaskWidth, currentMaskHeight);
    }
  }

  function drawPipWithBgRemoval(ctx, pipRect) {
    ensureBgCanvases(pipRect.w, pipRect.h);

    const camCtx = bgCamCanvas.getContext('2d');
    const maskCtx = bgMaskCanvas.getContext('2d');
    const tempCtx = bgTempCanvas.getContext('2d');

    // 1. Draw webcam to bgCamCanvas (cover-fit + mirror)
    camCtx.clearRect(0, 0, pipRect.w, pipRect.h);
    camCtx.save();
    const vw = camVideo.videoWidth || pipRect.w;
    const vh = camVideo.videoHeight || pipRect.h;
    const scale = Math.max(pipRect.w / vw, pipRect.h / vh);
    const sw = vw * scale;
    const sh = vh * scale;
    if (camMirrored) {
      camCtx.translate(pipRect.w, 0);
      camCtx.scale(-1, 1);
    }
    const sx = (pipRect.w - sw) / 2;
    const sy = (pipRect.h - sh) / 2;
    camCtx.drawImage(camVideo, sx, sy, sw, sh);
    camCtx.restore();

    // 2. Build alpha mask on bgMaskCanvas
    const maskLen = currentMaskWidth * currentMaskHeight;
    const imgData = new ImageData(currentMaskWidth, currentMaskHeight);
    const pixels = imgData.data;
    for (let i = 0; i < maskLen; i++) {
      const confidence = currentMaskData[i];
      const idx = i * 4;
      pixels[idx] = 255;     // R
      pixels[idx + 1] = 255; // G
      pixels[idx + 2] = 255; // B
      pixels[idx + 3] = featherLUT[Math.round(confidence * 255)]; // A
    }
    maskCtx.putImageData(imgData, 0, 0);

    // 3. Upscale mask to PiP size (bilinear interpolation = free edge smoothing)
    tempCtx.clearRect(0, 0, pipRect.w, pipRect.h);
    tempCtx.drawImage(bgMaskCanvas, 0, 0, pipRect.w, pipRect.h);

    if (bgRemovalMode === 'blur') {
      // Blur mode: blurred bg + sharp person
      const blurCtx = bgBlurCanvas.getContext('2d');

      // Draw blurred webcam
      blurCtx.clearRect(0, 0, pipRect.w, pipRect.h);
      const blurRadius = 4 + (bgBlurStrength / 100) * 20; // 4-24px
      blurCtx.filter = `blur(${blurRadius}px)`;
      blurCtx.save();
      if (camMirrored) {
        blurCtx.translate(pipRect.w, 0);
        blurCtx.scale(-1, 1);
      }
      blurCtx.drawImage(camVideo, sx, sy, sw, sh);
      blurCtx.restore();
      blurCtx.filter = 'none';

      // Apply inverted mask to blurred bg (keep only background)
      // Invert: create inverted mask on tempCtx
      const invImgData = new ImageData(currentMaskWidth, currentMaskHeight);
      const invPixels = invImgData.data;
      for (let i = 0; i < maskLen; i++) {
        const confidence = currentMaskData[i];
        const idx = i * 4;
        invPixels[idx] = 255;
        invPixels[idx + 1] = 255;
        invPixels[idx + 2] = 255;
        invPixels[idx + 3] = 255 - featherLUT[Math.round(confidence * 255)];
      }
      maskCtx.putImageData(invImgData, 0, 0);
      tempCtx.clearRect(0, 0, pipRect.w, pipRect.h);
      tempCtx.drawImage(bgMaskCanvas, 0, 0, pipRect.w, pipRect.h);

      blurCtx.globalCompositeOperation = 'destination-in';
      blurCtx.drawImage(bgTempCanvas, 0, 0);
      blurCtx.globalCompositeOperation = 'source-over';

      // Apply normal mask to sharp webcam (keep only person)
      // Rebuild normal mask on temp
      maskCtx.putImageData(imgData, 0, 0);
      tempCtx.clearRect(0, 0, pipRect.w, pipRect.h);
      tempCtx.drawImage(bgMaskCanvas, 0, 0, pipRect.w, pipRect.h);

      camCtx.globalCompositeOperation = 'destination-in';
      camCtx.drawImage(bgTempCanvas, 0, 0);
      camCtx.globalCompositeOperation = 'source-over';

      // Composite: blurred bg first, then sharp person on top
      ctx.save();
      pipClipPath(ctx, pipRect.x, pipRect.y, pipRect.w, pipRect.h);
      ctx.clip();
      ctx.drawImage(bgBlurCanvas, pipRect.x, pipRect.y);
      ctx.drawImage(bgCamCanvas, pipRect.x, pipRect.y);
      ctx.restore();
    } else {
      // Remove mode: transparent background
      // 4. Apply mask to webcam frame
      camCtx.globalCompositeOperation = 'destination-in';
      camCtx.drawImage(bgTempCanvas, 0, 0);
      camCtx.globalCompositeOperation = 'source-over';

      // 5. Draw result onto main canvas with shape clip
      ctx.save();
      pipClipPath(ctx, pipRect.x, pipRect.y, pipRect.w, pipRect.h);
      ctx.clip();
      ctx.drawImage(bgCamCanvas, pipRect.x, pipRect.y);
      ctx.restore();
    }
  }

  // ============================================================
  // (c) Render loop (two canvases)
  // ============================================================

  function startRenderLoop() {
    if (animFrameId) cancelAnimationFrame(animFrameId);

    function draw(timestamp) {
      // Run segmentation once per frame (shared by both canvases)
      runSegmentation(timestamp);

      drawCanvas(recordingCtx, recordingCanvas, recordingView, false);
      drawCanvas(previewCtx, previewCanvas, currentView, true);
      animFrameId = requestAnimationFrame(draw);
    }
    animFrameId = requestAnimationFrame(draw);
  }

  function drawCanvas(ctx, canvas, view, isPreviewCanvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (view === RX_VIEWS.CAMERA) {
      // Camera full-screen
      if (camVideo.srcObject && camVideo.readyState >= 2) {
        drawVideoFill(ctx, camVideo, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    } else if (view === RX_VIEWS.VIDEO) {
      // Video only, no PiP
      if (tabVideo.readyState >= 2) {
        ctx.drawImage(tabVideo, 0, 0, canvas.width, canvas.height);
      }
    } else {
      // FINAL — video + PiP or side-by-side
      if (currentLayout === RX_LAYOUTS.SIDE_BY_SIDE) {
        drawSideBySide(ctx, canvas, isPreviewCanvas);
      } else {
        if (tabVideo.readyState >= 2) {
          ctx.drawImage(tabVideo, 0, 0, canvas.width, canvas.height);
        }
        if (camVideo.srcObject && camVideo.readyState >= 2) {
          drawPip(ctx, canvas, isPreviewCanvas);
        }
      }
    }
  }

  function drawVideoFill(ctx, video, w, h) {
    // Cover-fit the video into the canvas
    const vw = video.videoWidth || w;
    const vh = video.videoHeight || h;
    const scale = Math.max(w / vw, h / vh);
    const sw = vw * scale;
    const sh = vh * scale;
    const sx = (w - sw) / 2;
    const sy = (h - sh) / 2;
    ctx.drawImage(video, sx, sy, sw, sh);
  }

  function drawPip(ctx, canvas, isPreviewCanvas) {
    const pipRect = calcPipRect(canvas);

    if (bgRemovalEnabled && currentMaskData) {
      drawPipWithBgRemoval(ctx, pipRect);
    } else {
      // Original path — draw webcam inside shape clip
      ctx.save();
      pipClipPath(ctx, pipRect.x, pipRect.y, pipRect.w, pipRect.h);
      ctx.clip();
      const vw = camVideo.videoWidth || pipRect.w;
      const vh = camVideo.videoHeight || pipRect.h;
      const scale = Math.max(pipRect.w / vw, pipRect.h / vh);
      const sw = vw * scale;
      const sh = vh * scale;
      if (camMirrored) {
        ctx.translate(pipRect.x + pipRect.w, pipRect.y);
        ctx.scale(-1, 1);
        const sx = (pipRect.w - sw) / 2;
        const sy = (pipRect.h - sh) / 2;
        ctx.drawImage(camVideo, sx, sy, sw, sh);
      } else {
        const sx = pipRect.x + (pipRect.w - sw) / 2;
        const sy = pipRect.y + (pipRect.h - sh) / 2;
        ctx.drawImage(camVideo, sx, sy, sw, sh);
      }
      ctx.restore();
    }

    // Draw border
    if (pipBorderColor !== 'none' && pipBorderWidth > 0) {
      ctx.strokeStyle = pipBorderColor;
      ctx.lineWidth = pipBorderWidth;
      pipClipPath(ctx, pipRect.x, pipRect.y, pipRect.w, pipRect.h);
      ctx.stroke();
    }

    // Draw resize handles on preview only when selected or hovered
    if (isPreviewCanvas && (pipSelected || pipHovered)) {
      drawResizeHandles(ctx, pipRect);
    }
  }

  function drawSideBySide(ctx, canvas, isPreviewCanvas) {
    const w = canvas.width;
    const h = canvas.height;
    const halfW = Math.floor(w / 2);

    // Left half — video (cover-fit)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, halfW, h);
    ctx.clip();
    if (tabVideo.readyState >= 2) {
      const vw = tabVideo.videoWidth || halfW;
      const vh = tabVideo.videoHeight || h;
      const scale = Math.max(halfW / vw, h / vh);
      const sw = vw * scale;
      const sh = vh * scale;
      const sx = (halfW - sw) / 2;
      const sy = (h - sh) / 2;
      ctx.drawImage(tabVideo, sx, sy, sw, sh);
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, halfW, h);
    }
    ctx.restore();

    // Right half — webcam (cover-fit)
    ctx.save();
    ctx.beginPath();
    ctx.rect(halfW, 0, w - halfW, h);
    ctx.clip();
    if (camVideo.srcObject && camVideo.readyState >= 2) {
      if (bgRemovalEnabled && currentMaskData) {
        drawSideBySideWebcamBgRemoval(ctx, halfW, 0, w - halfW, h);
      } else {
        const vw = camVideo.videoWidth || (w - halfW);
        const vh = camVideo.videoHeight || h;
        const scale = Math.max((w - halfW) / vw, h / vh);
        const sw = vw * scale;
        const sh = vh * scale;
        if (camMirrored) {
          ctx.translate(halfW + (w - halfW), 0);
          ctx.scale(-1, 1);
          const sx = ((w - halfW) - sw) / 2;
          const sy = (h - sh) / 2;
          ctx.drawImage(camVideo, sx, sy, sw, sh);
        } else {
          const sx = halfW + ((w - halfW) - sw) / 2;
          const sy = (h - sh) / 2;
          ctx.drawImage(camVideo, sx, sy, sw, sh);
        }
      }
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(halfW, 0, w - halfW, h);
    }
    ctx.restore();

    // Divider line
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, h);
    ctx.stroke();
  }

  function drawSideBySideWebcamBgRemoval(ctx, rx, ry, rw, rh) {
    ensureBgCanvases(rw, rh);

    const camCtx = bgCamCanvas.getContext('2d');
    const maskCtx = bgMaskCanvas.getContext('2d');
    const tempCtx = bgTempCanvas.getContext('2d');

    // Draw webcam to bgCamCanvas (cover-fit + mirror)
    camCtx.clearRect(0, 0, rw, rh);
    camCtx.save();
    const vw = camVideo.videoWidth || rw;
    const vh = camVideo.videoHeight || rh;
    const scale = Math.max(rw / vw, rh / vh);
    const sw = vw * scale;
    const sh = vh * scale;
    if (camMirrored) {
      camCtx.translate(rw, 0);
      camCtx.scale(-1, 1);
    }
    const sx = (rw - sw) / 2;
    const sy = (rh - sh) / 2;
    camCtx.drawImage(camVideo, sx, sy, sw, sh);
    camCtx.restore();

    // Build alpha mask
    const maskLen = currentMaskWidth * currentMaskHeight;
    const imgData = new ImageData(currentMaskWidth, currentMaskHeight);
    const pixels = imgData.data;
    for (let i = 0; i < maskLen; i++) {
      const confidence = currentMaskData[i];
      const idx = i * 4;
      pixels[idx] = 255;
      pixels[idx + 1] = 255;
      pixels[idx + 2] = 255;
      pixels[idx + 3] = featherLUT[Math.round(confidence * 255)];
    }
    maskCtx.putImageData(imgData, 0, 0);
    tempCtx.clearRect(0, 0, rw, rh);
    tempCtx.drawImage(bgMaskCanvas, 0, 0, rw, rh);

    if (bgRemovalMode === 'blur') {
      const blurCtx = bgBlurCanvas.getContext('2d');
      blurCtx.clearRect(0, 0, rw, rh);
      const blurRadius = 4 + (bgBlurStrength / 100) * 20;
      blurCtx.filter = `blur(${blurRadius}px)`;
      blurCtx.save();
      if (camMirrored) {
        blurCtx.translate(rw, 0);
        blurCtx.scale(-1, 1);
      }
      blurCtx.drawImage(camVideo, sx, sy, sw, sh);
      blurCtx.restore();
      blurCtx.filter = 'none';

      // Inverted mask for blurred bg
      const invImgData = new ImageData(currentMaskWidth, currentMaskHeight);
      const invPixels = invImgData.data;
      for (let i = 0; i < maskLen; i++) {
        const confidence = currentMaskData[i];
        const idx = i * 4;
        invPixels[idx] = 255;
        invPixels[idx + 1] = 255;
        invPixels[idx + 2] = 255;
        invPixels[idx + 3] = 255 - featherLUT[Math.round(confidence * 255)];
      }
      maskCtx.putImageData(invImgData, 0, 0);
      tempCtx.clearRect(0, 0, rw, rh);
      tempCtx.drawImage(bgMaskCanvas, 0, 0, rw, rh);

      blurCtx.globalCompositeOperation = 'destination-in';
      blurCtx.drawImage(bgTempCanvas, 0, 0);
      blurCtx.globalCompositeOperation = 'source-over';

      // Rebuild normal mask
      maskCtx.putImageData(imgData, 0, 0);
      tempCtx.clearRect(0, 0, rw, rh);
      tempCtx.drawImage(bgMaskCanvas, 0, 0, rw, rh);

      camCtx.globalCompositeOperation = 'destination-in';
      camCtx.drawImage(bgTempCanvas, 0, 0);
      camCtx.globalCompositeOperation = 'source-over';

      ctx.drawImage(bgBlurCanvas, rx, ry);
      ctx.drawImage(bgCamCanvas, rx, ry);
    } else {
      // Remove mode: dark bg behind person
      ctx.fillStyle = '#111';
      ctx.fillRect(rx, ry, rw, rh);

      camCtx.globalCompositeOperation = 'destination-in';
      camCtx.drawImage(bgTempCanvas, 0, 0);
      camCtx.globalCompositeOperation = 'source-over';

      ctx.drawImage(bgCamCanvas, rx, ry);
    }
  }

  function pipClipPath(ctx, x, y, w, h) {
    ctx.beginPath();
    if (pipShape === RX_PIP_SHAPES.CIRCLE) {
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (pipShape === RX_PIP_SHAPES.ROUNDED) {
      roundedRectPath(ctx, x, y, w, h, pipCornerRadius);
      return; // roundedRectPath already calls beginPath
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.closePath();
  }

  function roundedRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawResizeHandles(ctx, pipRect) {
    const hs = RX_DEFAULTS.resizeHandleSize;
    const corners = [
      { x: pipRect.x, y: pipRect.y },
      { x: pipRect.x + pipRect.w, y: pipRect.y },
      { x: pipRect.x, y: pipRect.y + pipRect.h },
      { x: pipRect.x + pipRect.w, y: pipRect.y + pipRect.h }
    ];
    corners.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, hs / 2, 0, Math.PI * 2);
      ctx.fillStyle = pipSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)';
      ctx.fill();
      ctx.strokeStyle = '#cc0000';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  function calcPipRect(canvas) {
    const pipW = Math.round(canvas.width * (pipSizePercent / 100));
    const pipH = pipShape === RX_PIP_SHAPES.CIRCLE
      ? pipW  // 1:1 for circle
      : Math.round(pipW * (9 / 16));

    // Default position: bottom-right corner
    if (pipX === null || pipY === null) {
      const margin = 20;
      pipX = canvas.width - pipW - margin;
      pipY = canvas.height - pipH - margin;
    }

    // Clamp to canvas bounds
    const x = Math.max(0, Math.min(pipX, canvas.width - pipW));
    const y = Math.max(0, Math.min(pipY, canvas.height - pipH));

    return { x, y, w: pipW, h: pipH };
  }

  function snapPipToCorner(corner) {
    const margin = 20;
    const pipW = Math.round(previewCanvas.width * (pipSizePercent / 100));
    const pipH = pipShape === RX_PIP_SHAPES.CIRCLE
      ? pipW
      : Math.round(pipW * (9 / 16));

    switch (corner) {
      case 'top-left':
        pipX = margin; pipY = margin; break;
      case 'top-right':
        pipX = previewCanvas.width - pipW - margin; pipY = margin; break;
      case 'bottom-left':
        pipX = margin; pipY = previewCanvas.height - pipH - margin; break;
      case 'bottom-right':
      default:
        pipX = previewCanvas.width - pipW - margin; pipY = previewCanvas.height - pipH - margin; break;
    }
  }

  // ============================================================
  // (c2) Canvas coordinate mapping and hit testing
  // ============================================================

  function canvasCoordsFromEvent(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function hitTestPip(cx, cy, canvas) {
    const pr = calcPipRect(canvas);
    if (pipShape === RX_PIP_SHAPES.CIRCLE) {
      const dx = cx - (pr.x + pr.w / 2);
      const dy = cy - (pr.y + pr.h / 2);
      const rx = pr.w / 2;
      const ry = pr.h / 2;
      return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
    }
    return cx >= pr.x && cx <= pr.x + pr.w && cy >= pr.y && cy <= pr.y + pr.h;
  }

  function hitTestResizeHandle(cx, cy, canvas) {
    if (!pipSelected) return null;
    const pr = calcPipRect(canvas);
    const hs = RX_DEFAULTS.resizeHandleSize;
    const corners = [
      { name: 'tl', x: pr.x, y: pr.y },
      { name: 'tr', x: pr.x + pr.w, y: pr.y },
      { name: 'bl', x: pr.x, y: pr.y + pr.h },
      { name: 'br', x: pr.x + pr.w, y: pr.y + pr.h }
    ];
    for (const c of corners) {
      const dx = cx - c.x;
      const dy = cy - c.y;
      if (dx * dx + dy * dy <= (hs / 2 + 4) * (hs / 2 + 4)) return c.name;
    }
    return null;
  }

  // ============================================================
  // (c3) Mouse event system (drag / resize)
  // ============================================================

  previewCanvas.addEventListener('mousedown', (e) => {
    if (currentView !== RX_VIEWS.FINAL) return;
    if (currentLayout !== RX_LAYOUTS.PIP) return;
    const { x, y } = canvasCoordsFromEvent(e, previewCanvas);

    // Check resize handles first
    const handle = hitTestResizeHandle(x, y, previewCanvas);
    if (handle) {
      pipResizing = true;
      pipResizeCorner = handle;
      e.preventDefault();
      return;
    }

    // Check PiP body for drag
    if (hitTestPip(x, y, previewCanvas)) {
      const pr = calcPipRect(previewCanvas);
      pipSelected = true;
      pipDragging = true;
      pipDragOffsetX = x - pr.x;
      pipDragOffsetY = y - pr.y;
      previewCanvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    // Click outside — deselect
    pipSelected = false;
    pipHovered = false;
  });

  previewCanvas.addEventListener('mousemove', (e) => {
    if (currentView !== RX_VIEWS.FINAL) return;
    const { x, y } = canvasCoordsFromEvent(e, previewCanvas);

    if (pipDragging) {
      pipX = x - pipDragOffsetX;
      pipY = y - pipDragOffsetY;
      // Clamp
      const pr = calcPipRect(previewCanvas);
      pipX = pr.x;
      pipY = pr.y;
      return;
    }

    if (pipResizing) {
      resizePipFromCorner(x, y, previewCanvas);
      return;
    }

    // Hover detection
    const handle = hitTestResizeHandle(x, y, previewCanvas);
    if (handle) {
      pipHovered = true;
      const cursors = { tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize' };
      previewCanvas.style.cursor = cursors[handle];
    } else if (hitTestPip(x, y, previewCanvas)) {
      pipHovered = true;
      previewCanvas.style.cursor = 'grab';
    } else {
      pipHovered = false;
      previewCanvas.style.cursor = 'default';
    }
  });

  previewCanvas.addEventListener('mouseup', (e) => {
    if (pipDragging || pipResizing) {
      clearActivePreset();
    }
    pipDragging = false;
    pipResizing = false;
    pipResizeCorner = null;
    if (pipHovered) {
      previewCanvas.style.cursor = 'grab';
    } else {
      previewCanvas.style.cursor = 'default';
    }
  });

  previewCanvas.addEventListener('mouseleave', () => {
    pipDragging = false;
    pipResizing = false;
    pipResizeCorner = null;
    pipHovered = false;
    previewCanvas.style.cursor = 'default';
  });

  function resizePipFromCorner(mx, my, canvas) {
    const pr = calcPipRect(canvas);
    const minPct = RX_DEFAULTS.pipMinSize;
    const maxPct = RX_DEFAULTS.pipMaxSize;

    // Anchor is opposite corner
    let anchorX, anchorY;
    switch (pipResizeCorner) {
      case 'tl': anchorX = pr.x + pr.w; anchorY = pr.y + pr.h; break;
      case 'tr': anchorX = pr.x;         anchorY = pr.y + pr.h; break;
      case 'bl': anchorX = pr.x + pr.w; anchorY = pr.y;         break;
      case 'br': anchorX = pr.x;         anchorY = pr.y;         break;
    }

    // Compute new width from mouse distance to anchor
    const dx = Math.abs(mx - anchorX);
    let newPct = (dx / canvas.width) * 100;
    newPct = Math.max(minPct, Math.min(maxPct, newPct));

    pipSizePercent = Math.round(newPct);

    // Recompute pip dimensions
    const newW = Math.round(canvas.width * (pipSizePercent / 100));
    const newH = pipShape === RX_PIP_SHAPES.CIRCLE ? newW : Math.round(newW * (9 / 16));

    // Position from anchor
    if (pipResizeCorner === 'tl' || pipResizeCorner === 'bl') {
      pipX = anchorX - newW;
    } else {
      pipX = anchorX;
    }
    if (pipResizeCorner === 'tl' || pipResizeCorner === 'tr') {
      pipY = anchorY - newH;
    } else {
      pipY = anchorY;
    }

    // Sync size slider
    const sizeSlider = document.getElementById('style-pip-size-slider');
    const sizeValue = document.getElementById('style-pip-size-value');
    if (sizeSlider) sizeSlider.value = pipSizePercent;
    if (sizeValue) sizeValue.textContent = pipSizePercent + '%';
  }

  // ============================================================
  // (d) Audio mixing
  // ============================================================

  function setupAudioMixing() {
    if (audioCtx) {
      audioCtx.close().catch(() => {});
    }

    audioCtx = new AudioContext();
    audioDest = audioCtx.createMediaStreamDestination();

    // Tab audio
    const tabAudioTracks = tabStream?.getAudioTracks();
    if (tabAudioTracks && tabAudioTracks.length > 0) {
      const tabSource = audioCtx.createMediaStreamSource(new MediaStream(tabAudioTracks));
      tabGain = audioCtx.createGain();
      tabGain.gain.value = parseInt(tabVolumeSlider.value) / 100;
      tabSource.connect(tabGain);
      tabGain.connect(audioDest);
    }
  }

  tabVolumeSlider.addEventListener('input', () => {
    tabVolumeValue.textContent = tabVolumeSlider.value + '%';
    if (tabGain) tabGain.gain.value = parseInt(tabVolumeSlider.value) / 100;
  });

  micVolumeSlider.addEventListener('input', () => {
    const val = parseInt(micVolumeSlider.value) / 100;
    micVolumeValue.textContent = micVolumeSlider.value + '%';
    if (micMuted) {
      // Update saved value but keep gain at 0
      savedMicGain = val;
    } else {
      if (micGain) micGain.gain.value = val;
    }
  });

  micMuteBtn.addEventListener('click', () => {
    micMuted = !micMuted;
    if (micMuted) {
      savedMicGain = micGain ? micGain.gain.value : parseInt(micVolumeSlider.value) / 100;
      if (micGain) micGain.gain.value = 0;
      micMuteBtn.classList.add('muted');
      micMuteBtn.innerHTML = '&#x1F507;'; // muted speaker
      micMuteBtn.title = 'Unmute mic';
    } else {
      if (micGain) micGain.gain.value = savedMicGain;
      micMuteBtn.classList.remove('muted');
      micMuteBtn.innerHTML = '&#x1F50A;'; // speaker with sound
      micMuteBtn.title = 'Mute mic';
    }
  });

  // ============================================================
  // (e) Player controls
  // ============================================================

  playPauseBtn.addEventListener('click', async () => {
    if (playerPlaying) {
      await chrome.runtime.sendMessage({ type: RX_MESSAGES.PAUSE_VIDEO });
      playerPlaying = false;
      playPauseBtn.innerHTML = '&#x25B6;';
    } else {
      await chrome.runtime.sendMessage({ type: RX_MESSAGES.PLAY });
      playerPlaying = true;
      playPauseBtn.innerHTML = '&#x23F8;';
    }
  });

  seekInput.addEventListener('input', () => {
    seeking = true;
    const pct = parseFloat(seekInput.value);
    seekFill.style.width = pct + '%';
    if (playerDuration > 0) {
      currentTimeEl.textContent = formatPlayerTime(playerDuration * pct / 100);
    }
  });

  seekInput.addEventListener('change', () => {
    const pct = parseFloat(seekInput.value);
    const time = playerDuration * pct / 100;
    chrome.runtime.sendMessage({ type: RX_MESSAGES.SEEK, time });
    seeking = false;
  });

  function updatePlayerUI(currentTime, duration, playerState) {
    if (duration > 0) {
      playerDuration = duration;
      durationTimeEl.textContent = formatPlayerTime(duration);
      seekInput.max = '100';
    }

    if (!seeking && duration > 0) {
      playerCurrentTime = currentTime;
      const pct = (currentTime / duration) * 100;
      seekInput.value = pct;
      seekFill.style.width = pct + '%';
      currentTimeEl.textContent = formatPlayerTime(currentTime);
    }

    // playerState: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering
    if (playerState === 1) {
      playerPlaying = true;
      playPauseBtn.innerHTML = '&#x23F8;';
    } else if (playerState === 2 || playerState === 0) {
      playerPlaying = false;
      playPauseBtn.innerHTML = '&#x25B6;';
    }
  }

  function formatPlayerTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  // ============================================================
  // (f) Recording
  // ============================================================

  recordBtn.addEventListener('click', async () => {
    recordBtn.disabled = true;

    // Start webcam stream for recording (if not already)
    if (!camStream) {
      await startCamStream();
    }

    // Notify service worker
    await chrome.runtime.sendMessage({ type: RX_MESSAGES.START_CAPTURE });

    // Compose recording stream: recording canvas video + mixed audio
    const canvasStream = recordingCanvas.captureStream(RX_DEFAULTS.frameRate);
    const audioTracks = audioDest ? audioDest.stream.getAudioTracks() : [];
    composedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioTracks
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
    recordedChunksMeta = [];
    captionSegments = [];
    trimStartIdx = 0;
    trimEndIdx = -1;
    chunkAudioLevels = [];
    rawRmsLevels = [];
    silentChunkRanges = [];
    silentChunkSet = new Set();
    silenceRemovalEnabled = false;
    customThumbnailDataUrl = null;
    recordingMimeType = mimeType;

    let chunkIndex = 0;
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
        recordedChunksMeta.push({
          index: chunkIndex++,
          timestamp: Date.now() - startTime - pausedDuration,
          size: e.data.size
        });
      }
    };

    // Capture sync link data
    recordingStartVideoId = nowPlaying?.videoId || null;
    recordingStartVideoTime = playerCurrentTime || 0;

    mediaRecorder.start(1000);
    startTime = Date.now();
    pausedDuration = 0;

    setState(RX_STATES.RECORDING);

    // Start speech recognition if enabled
    if (captionsEnabled) {
      startSpeechRecognition();
    }
  });

  pauseBtn.addEventListener('click', async () => {
    if (currentState === RX_STATES.RECORDING) {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        pauseStart = Date.now();
      }
      if (speechRecognition) try { speechRecognition.stop(); } catch {}
      await chrome.runtime.sendMessage({ type: RX_MESSAGES.PAUSE });
      setState(RX_STATES.PAUSED);
    } else if (currentState === RX_STATES.PAUSED) {
      if (mediaRecorder && mediaRecorder.state === 'paused') {
        pausedDuration += Date.now() - pauseStart;
        mediaRecorder.resume();
      }
      if (captionsEnabled) startSpeechRecognition();
      await chrome.runtime.sendMessage({ type: RX_MESSAGES.RESUME });
      setState(RX_STATES.RECORDING);
    }
  });

  stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true;

    // Stop speech recognition
    if (speechRecognition) {
      try { speechRecognition.stop(); } catch {}
      speechRecognition = null;
    }

    if (mediaRecorder && mediaRecorder.state === 'paused') {
      pausedDuration += Date.now() - pauseStart;
    }

    const duration = Date.now() - startTime - pausedDuration;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      await new Promise((resolve) => {
        mediaRecorder.onstop = resolve;
        mediaRecorder.stop();
      });
    }

    // Assemble blob
    const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || 'video/webm' });
    const id = 'rx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);

    // Capture thumbnail from recording canvas
    try {
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 320;
      thumbCanvas.height = 180;
      const thumbCtx = thumbCanvas.getContext('2d');
      thumbCtx.drawImage(recordingCanvas, 0, 0, 320, 180);
      lastRecordingThumbnail = thumbCanvas.toDataURL('image/jpeg', 0.8);
    } catch (err) {
      console.warn('[TubePilot RX] Thumbnail capture failed:', err.message);
      lastRecordingThumbnail = null;
    }

    // Save to IndexedDB
    await saveRecording(id, blob, duration, lastRecordingThumbnail);
    lastRecordingBlob = blob;

    // Notify service worker
    await chrome.runtime.sendMessage({ type: RX_MESSAGES.STOP_CAPTURE });
    chrome.runtime.sendMessage({
      type: RX_MESSAGES.RECORDING_READY,
      recordingId: id,
      duration,
      size: blob.size
    }).catch(() => {});

    setState(RX_STATES.STOPPED);
    showOutput(blob, duration);
  });

  // ============================================================
  // State management
  // ============================================================

  function setState(state) {
    currentState = state;

    recIndicator.classList.toggle('hidden', state !== RX_STATES.RECORDING);
    recDot.classList.toggle('hidden', state !== RX_STATES.RECORDING);

    // Cam-only badge
    const existingBadge = recIndicator.querySelector('.cam-only-badge');
    if (existingBadge) existingBadge.remove();
    if (state === RX_STATES.RECORDING && webcamOnlyMode) {
      const badge = document.createElement('span');
      badge.className = 'cam-only-badge';
      badge.textContent = 'CAM ONLY';
      recIndicator.appendChild(badge);
    }

    switch (state) {
      case RX_STATES.IDLE:
      case RX_STATES.READY:
        recordBtn.disabled = !tabStream;
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
        break;
    }
  }

  // ============================================================
  // Timer
  // ============================================================

  function startTimer() {
    if (timerInterval) return;
    timerPaused = false;
    timerInterval = setInterval(() => {
      if (!timerPaused) {
        timerSeconds++;
        recTimer.textContent = formatRecTime(timerSeconds);
      }
    }, 1000);
  }

  function pauseTimer() { timerPaused = true; }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerSeconds = 0;
    recTimer.textContent = '00:00:00';
    timerPaused = false;
  }

  function formatRecTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  }

  // ============================================================
  // (g) Output & Upload
  // ============================================================

  function showOutput(blob, duration) {
    const url = URL.createObjectURL(blob);
    outputVideo.src = url;

    const durationStr = duration ? formatRecTime(Math.round(duration / 1000)) : 'Unknown';
    const sizeStr = formatFileSize(blob.size);
    outputMeta.textContent = `Duration: ${durationStr}  |  Size: ${sizeStr}`;

    // Reset upload form state
    uploadForm.classList.add('hidden');
    uploadProgress.classList.add('hidden');
    uploadResult.classList.add('hidden');
    uploadError.classList.add('hidden');
    uploadCancelBtn.classList.add('hidden');
    uploadBtn.disabled = true;
    uploadProgressFill.style.width = '0%';
    uploadProgressText.textContent = '0%';
    uploadToggleBtn.textContent = 'Upload to YouTube';

    // Auto-populate title
    if (nowPlaying && nowPlaying.title) {
      uploadTitle.value = ('Reacting to: ' + nowPlaying.title).slice(0, 100);
    } else {
      uploadTitle.value = 'Reaction ' + new Date().toLocaleDateString();
    }

    // Sync link
    const syncLinkRow = document.getElementById('sync-link-row');
    const syncLinkInput = document.getElementById('sync-link-input');
    if (recordingStartVideoId && !webcamOnlyMode) {
      const t = Math.floor(recordingStartVideoTime);
      const syncUrl = `https://youtu.be/${recordingStartVideoId}${t > 0 ? '?t=' + t : ''}`;
      if (syncLinkInput) syncLinkInput.value = syncUrl;
      if (syncLinkRow) syncLinkRow.classList.remove('hidden');
      uploadDescription.value = `Original video: ${syncUrl}`;
    } else {
      if (syncLinkRow) syncLinkRow.classList.add('hidden');
      uploadDescription.value = '';
    }
    updateCharCounters();

    outputSection.classList.remove('hidden');
  }

  function closeOutput() {
    outputSection.classList.add('hidden');
  }

  outputCloseBtn.addEventListener('click', closeOutput);

  // Close output overlay on click outside
  outputSection.addEventListener('click', (e) => {
    if (e.target === outputSection) closeOutput();
  });

  downloadBtn.addEventListener('click', async () => {
    if (!lastRecordingBlob) return;
    const exportBlob = await getExportBlob();
    const url = URL.createObjectURL(exportBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reaction-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // --- Upload form toggle ---

  uploadToggleBtn.addEventListener('click', () => {
    const isHidden = uploadForm.classList.toggle('hidden');
    uploadToggleBtn.textContent = isHidden ? 'Upload to YouTube' : 'Hide Upload Form';
    if (!isHidden) {
      populateChannels();
      populateCategories();
    }
  });

  // --- Char counters ---

  function updateCharCounters() {
    uploadTitleCount.textContent = uploadTitle.value.length + '/' + uploadTitle.maxLength;
    uploadDescCount.textContent = uploadDescription.value.length + '/' + uploadDescription.maxLength;
  }

  uploadTitle.addEventListener('input', updateCharCounters);
  uploadDescription.addEventListener('input', updateCharCounters);

  // --- Channel population ---

  async function populateChannels() {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'GET_CONNECTED_CHANNELS' });
      if (!resp || !resp.success || !resp.channels) {
        uploadChannelSelect.innerHTML = '<option value="">No channels connected</option>';
        uploadBtn.disabled = true;
        return;
      }

      const channels = resp.channels;
      const keys = Object.keys(channels);
      if (keys.length === 0) {
        uploadChannelSelect.innerHTML = '<option value="">No channels connected</option>';
        uploadBtn.disabled = true;
        return;
      }

      uploadChannelSelect.innerHTML = keys.map(id => {
        const ch = channels[id];
        return `<option value="${escapeAttr(id)}">${escapeHtml(ch.channelName || id)}</option>`;
      }).join('');

      // Auto-select stored channel
      const stored = await chrome.storage.local.get(CONFIG.SELECTED_CHANNEL_KEY);
      const selectedId = stored[CONFIG.SELECTED_CHANNEL_KEY];
      if (selectedId && keys.includes(selectedId)) {
        uploadChannelSelect.value = selectedId;
      }

      uploadBtn.disabled = false;
    } catch (err) {
      console.warn('[TubePilot RX] Failed to load channels:', err.message);
      uploadChannelSelect.innerHTML = '<option value="">Error loading channels</option>';
      uploadBtn.disabled = true;
    }
  }

  // --- Category population ---

  function populateCategories() {
    if (uploadCategory.options.length > 0 && uploadCategory.options[0].value !== '') return;
    uploadCategory.innerHTML = Object.entries(CONFIG.YOUTUBE_CATEGORIES)
      .map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`)
      .join('');
    uploadCategory.value = '24'; // Entertainment default
  }

  // --- Connect channel ---

  connectChannelBtn.addEventListener('click', async () => {
    connectChannelBtn.disabled = true;
    connectChannelBtn.textContent = 'Connecting...';
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'ADD_CHANNEL' });
      if (resp && resp.success) {
        await populateChannels();
      } else {
        uploadError.textContent = resp?.error || 'Failed to connect channel';
        uploadError.classList.remove('hidden');
      }
    } catch (err) {
      uploadError.textContent = 'Connection error: ' + err.message;
      uploadError.classList.remove('hidden');
    } finally {
      connectChannelBtn.disabled = false;
      connectChannelBtn.textContent = '+ Connect';
    }
  });

  // --- Upload functions (adapted from youtube-studio.js) ---

  async function initiateResumableUpload(metadata, token, blob) {
    const url = CONFIG.YOUTUBE_UPLOAD_API + '?uploadType=resumable&part=snippet,status';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(blob.size),
        'X-Upload-Content-Type': blob.type || 'video/webm'
      },
      body: JSON.stringify(metadata)
    });

    if (!res.ok) {
      const status = res.status;
      const errBody = await res.text().catch(() => '');
      if (status === 401) throw new Error('YouTube token expired — reconnect the channel');
      if (status === 403) {
        try {
          const body = JSON.parse(errBody);
          const reason = body.error?.errors?.[0]?.reason;
          if (reason === 'quotaExceeded') throw new Error('YouTube API daily quota exceeded');
        } catch (e) { if (e.message.includes('quota')) throw e; }
        throw new Error('Upload forbidden — check YouTube permissions');
      }
      throw new Error(`Upload initiation failed (HTTP ${status})`);
    }

    const uploadUri = res.headers.get('Location');
    if (!uploadUri) throw new Error('No upload URI returned from YouTube');
    return uploadUri;
  }

  function uploadBlobWithProgress(uploadUri, blob, token, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      uploadXhr = xhr;

      xhr.open('PUT', uploadUri, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', blob.type || 'video/webm');

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(e.loaded, e.total);
        }
      });

      xhr.addEventListener('load', () => {
        uploadXhr = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve(null);
          }
        } else {
          const errBody = xhr.responseText?.slice(0, 500) || '';
          reject(new Error(`Upload failed (HTTP ${xhr.status}): ${errBody}`));
        }
      });

      xhr.addEventListener('error', () => {
        uploadXhr = null;
        reject(new Error('Upload network error'));
      });

      xhr.addEventListener('abort', () => {
        uploadXhr = null;
        reject(new Error('Upload cancelled'));
      });

      xhr.send(blob);
    });
  }

  // --- Upload button handler ---

  uploadBtn.addEventListener('click', async () => {
    // Validate
    const channelId = uploadChannelSelect.value;
    if (!channelId) {
      uploadError.textContent = 'Please select a channel';
      uploadError.classList.remove('hidden');
      return;
    }
    const title = uploadTitle.value.trim();
    if (!title) {
      uploadError.textContent = 'Title is required';
      uploadError.classList.remove('hidden');
      return;
    }
    if (!lastRecordingBlob) {
      uploadError.textContent = 'No recording available';
      uploadError.classList.remove('hidden');
      return;
    }

    // Clear previous state
    uploadError.classList.add('hidden');
    uploadResult.classList.add('hidden');

    // Get token
    let token;
    try {
      const tokenResp = await chrome.runtime.sendMessage({
        type: 'GET_CHANNEL_TOKEN',
        channelId
      });
      if (!tokenResp || !tokenResp.success) {
        throw new Error(tokenResp?.error || 'Token expired — reconnect the channel');
      }
      token = tokenResp.token;
    } catch (err) {
      uploadError.textContent = err.message;
      uploadError.classList.remove('hidden');
      return;
    }

    // Build metadata
    const madeForKids = document.querySelector('input[name="upload-kids"]:checked')?.value === 'true';
    const metadata = {
      snippet: {
        title,
        description: uploadDescription.value,
        categoryId: uploadCategory.value || '24'
      },
      status: {
        privacyStatus: uploadVisibility.value || 'private',
        selfDeclaredMadeForKids: madeForKids
      }
    };

    // Track quota
    const channelsResp = await chrome.runtime.sendMessage({ type: 'GET_CONNECTED_CHANNELS' });
    const channelName = channelsResp?.channels?.[channelId]?.channelName || channelId;
    chrome.runtime.sendMessage({
      type: 'TRACK_UPLOAD_QUOTA',
      channelId,
      channelName
    }).catch(() => {});

    // Show progress UI, disable form
    uploadProgress.classList.remove('hidden');
    uploadProgressFill.style.width = '0%';
    uploadProgressText.textContent = '0%';
    uploadBtn.disabled = true;
    uploadCancelBtn.classList.remove('hidden');
    uploadToggleBtn.disabled = true;

    const exportBlob = await getExportBlob();

    try {
      // Initiate resumable upload
      const uploadUri = await initiateResumableUpload(metadata, token, exportBlob);

      // Upload blob with progress
      const result = await uploadBlobWithProgress(uploadUri, exportBlob, token, (loaded, total) => {
        const pct = Math.round((loaded / total) * 100);
        uploadProgressFill.style.width = pct + '%';
        uploadProgressText.textContent = `${pct}% — ${formatFileSize(loaded)} / ${formatFileSize(total)}`;
      });

      // Validate response
      if (result?.status?.uploadStatus === 'rejected') {
        throw new Error('Upload rejected: ' + (result.status.failureReason || 'unknown reason'));
      }
      if (result?.status?.uploadStatus === 'failed') {
        throw new Error('Upload failed: ' + (result.status.failureReason || 'unknown reason'));
      }

      // Success
      const videoId = result?.id || 'unknown';
      uploadVideoId.textContent = videoId;
      uploadStudioLink.href = `https://studio.youtube.com/video/${videoId}/edit`;
      uploadResult.classList.remove('hidden');
      uploadProgress.classList.add('hidden');

      // Save upload history
      saveUploadHistory({
        id: 'ul_' + Date.now().toString(36),
        videoId,
        videoUrl: `https://youtu.be/${videoId}`,
        title,
        channelId,
        channelName,
        method: 'reactions-api',
        visibility: uploadVisibility.value,
        timestamp: Date.now()
      });

    } catch (err) {
      uploadError.textContent = err.message;
      uploadError.classList.remove('hidden');
      uploadProgress.classList.add('hidden');
    } finally {
      uploadBtn.disabled = false;
      uploadCancelBtn.classList.add('hidden');
      uploadToggleBtn.disabled = false;
      uploadXhr = null;
    }
  });

  // --- Cancel upload ---

  uploadCancelBtn.addEventListener('click', () => {
    if (uploadXhr) {
      uploadXhr.abort();
    }
  });

  // --- Upload history ---

  async function saveUploadHistory(record) {
    try {
      const key = CONFIG.UPLOAD_HISTORY_KEY;
      const data = await chrome.storage.local.get(key);
      const history = data[key] || [];
      history.unshift(record);
      if (history.length > CONFIG.UPLOAD_HISTORY_MAX) {
        history.length = CONFIG.UPLOAD_HISTORY_MAX;
      }
      await chrome.storage.local.set({ [key]: history });
    } catch (err) {
      console.warn('[TubePilot RX] Failed to save upload history:', err.message);
    }
  }

  // IndexedDB
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CONFIG.REACTIONS.DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(CONFIG.REACTIONS.DB_STORE)) {
          db.createObjectStore(CONFIG.REACTIONS.DB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveRecording(id, blob, duration, thumbnail) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONFIG.REACTIONS.DB_STORE, 'readwrite');
      const store = tx.objectStore(CONFIG.REACTIONS.DB_STORE);
      store.put({
        id,
        blob,
        duration,
        thumbnail: thumbnail || null,
        timestamp: Date.now(),
        title: 'Reaction ' + new Date().toLocaleString()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function cleanupOldRecordings() {
    try {
      const db = await openDB();
      const tx = db.transaction(CONFIG.REACTIONS.DB_STORE, 'readwrite');
      const store = tx.objectStore(CONFIG.REACTIONS.DB_STORE);
      const req = store.openCursor();
      const cutoff = Date.now() - CONFIG.REACTIONS.MAX_RECORDING_AGE_MS;

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) return;
        if (cursor.value.timestamp && cursor.value.timestamp < cutoff) {
          cursor.delete();
          console.log('[TubePilot RX] Cleaned up old recording:', cursor.value.id);
        }
        cursor.continue();
      };
    } catch (err) {
      console.warn('[TubePilot RX] Cleanup failed:', err.message);
    }
  }

  // ============================================================
  // (h) Message listener
  // ============================================================

  chrome.runtime.onMessage.addListener((message) => {
    if (!message.type) return;

    switch (message.type) {
      case RX_MESSAGES.STATE_CHANGED:
        if (message.playerClosed && currentState === RX_STATES.RECORDING) {
          // Player tab was closed during recording
          stopBtn.click();
        }
        if (message.playerClosed) {
          isFirstVideoLoad = true;
        }
        break;

      case RX_MESSAGES.PLAYER_STATE:
        updatePlayerUI(message.currentTime, message.duration, message.playerState);
        // Auto-advance when video ends (state 0) and not recording
        if (message.playerState === 0 && videoQueue.length > 0 &&
            currentState !== RX_STATES.RECORDING && currentState !== RX_STATES.PAUSED) {
          playNextInQueue();
        }
        break;

      case RX_MESSAGES.PLAYER_READY:
        // Player tab signals ready after loading a new video
        setSearchStatus('');
        break;

      case RX_MESSAGES.PLAYER_ERROR: {
        const code = message.code;
        const errMsg = message.error || 'unknown';
        // Codes 100 (not found), 101/150 (not embeddable) — auto-skip
        if ((code === 100 || code === 101 || code === 150) && videoQueue.length > 0) {
          setSearchStatus('Skipping: ' + errMsg, 'error');
          setTimeout(() => playNextInQueue(), 1500);
        } else {
          setSearchStatus('Player error: ' + errMsg, 'error');
        }
        break;
      }
    }
  });

  // ============================================================
  // View toggle
  // ============================================================

  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
    });
  });

  // Webcam-only toggle
  const webcamOnlyToggle = document.getElementById('webcam-only-toggle');
  if (webcamOnlyToggle) {
    webcamOnlyToggle.addEventListener('change', () => {
      webcamOnlyMode = webcamOnlyToggle.checked;
      recordingView = webcamOnlyMode ? RX_VIEWS.CAMERA : RX_VIEWS.FINAL;
    });
  }

  // Sync link copy button
  const syncLinkCopy = document.getElementById('sync-link-copy');
  const syncLinkInput = document.getElementById('sync-link-input');
  if (syncLinkCopy && syncLinkInput) {
    syncLinkCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(syncLinkInput.value).then(() => {
        const orig = syncLinkCopy.textContent;
        syncLinkCopy.textContent = 'Copied!';
        setTimeout(() => { syncLinkCopy.textContent = orig; }, 1500);
      });
    });
  }

  // ============================================================
  // Style tab controls
  // ============================================================

  function clearActivePreset() {
    activePreset = null;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('preset-btn-active'));
    // Restore PIP layout and show controls if they were hidden
    if (currentLayout !== RX_LAYOUTS.PIP) {
      currentLayout = RX_LAYOUTS.PIP;
      const pipControls = document.getElementById('pip-only-controls');
      if (pipControls) pipControls.style.display = '';
    }
  }

  function applyPreset(presetId) {
    activePreset = presetId;

    // Highlight active button
    document.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.toggle('preset-btn-active', b.dataset.preset === presetId);
    });

    switch (presetId) {
      case RX_PRESETS.PIP_TL:
        currentLayout = RX_LAYOUTS.PIP;
        pipSizePercent = 25;
        snapPipToCorner('top-left');
        break;
      case RX_PRESETS.PIP_TR:
        currentLayout = RX_LAYOUTS.PIP;
        pipSizePercent = 25;
        snapPipToCorner('top-right');
        break;
      case RX_PRESETS.PIP_BL:
        currentLayout = RX_LAYOUTS.PIP;
        pipSizePercent = 25;
        snapPipToCorner('bottom-left');
        break;
      case RX_PRESETS.PIP_BR:
        currentLayout = RX_LAYOUTS.PIP;
        pipSizePercent = 25;
        snapPipToCorner('bottom-right');
        break;
      case RX_PRESETS.SIDE_BY_SIDE:
        currentLayout = RX_LAYOUTS.SIDE_BY_SIDE;
        break;
      case RX_PRESETS.REACTOR_OVER:
        currentLayout = RX_LAYOUTS.PIP;
        pipSizePercent = 60;
        // Center the PiP
        const cw = previewCanvas.width;
        const ch = previewCanvas.height;
        const pw = Math.round(cw * 0.6);
        const ph = pipShape === RX_PIP_SHAPES.CIRCLE ? pw : Math.round(pw * (9 / 16));
        pipX = (cw - pw) / 2;
        pipY = (ch - ph) / 2;
        // Auto-enable BG removal (transparent mode)
        if (!bgRemovalEnabled && bgRemovalSupported) {
          const bgToggle = document.getElementById('bg-removal-toggle');
          if (bgToggle && !bgToggle.checked) {
            bgToggle.checked = true;
            bgToggle.dispatchEvent(new Event('change'));
          }
        }
        break;
    }

    syncStyleTabToState();
  }

  function syncStyleTabToState() {
    // Size slider
    const sizeSlider = document.getElementById('style-pip-size-slider');
    const sizeValue = document.getElementById('style-pip-size-value');
    if (sizeSlider) sizeSlider.value = pipSizePercent;
    if (sizeValue) sizeValue.textContent = pipSizePercent + '%';

    // Shape buttons
    document.querySelectorAll('.shape-btn').forEach(b => {
      b.classList.toggle('shape-btn-active', b.dataset.shape === pipShape);
    });

    // Clear snap-to-corner highlights (presets set position directly)
    document.querySelectorAll('.snap-btn').forEach(b => b.classList.remove('pip-btn-active'));

    // Show/hide PiP-only controls
    const pipControls = document.getElementById('pip-only-controls');
    if (pipControls) {
      pipControls.style.display = currentLayout === RX_LAYOUTS.SIDE_BY_SIDE ? 'none' : '';
    }
  }

  function initStyleTab() {
    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applyPreset(btn.dataset.preset);
      });
    });

    // Snap-to-corner buttons
    document.querySelectorAll('.snap-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        clearActivePreset();
        document.querySelectorAll('.snap-btn').forEach(b => b.classList.remove('pip-btn-active'));
        btn.classList.add('pip-btn-active');
        snapPipToCorner(btn.dataset.pos);
      });
    });

    // Shape buttons
    document.querySelectorAll('.shape-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        clearActivePreset();
        document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('shape-btn-active'));
        btn.classList.add('shape-btn-active');
        const oldShape = pipShape;
        pipShape = btn.dataset.shape;
        // Re-center when switching to/from circle (aspect ratio changes)
        if ((oldShape === RX_PIP_SHAPES.CIRCLE) !== (pipShape === RX_PIP_SHAPES.CIRCLE)) {
          recenterPipOnShapeChange(oldShape);
        }
      });
    });

    // Border color swatches
    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('swatch-active'));
        swatch.classList.add('swatch-active');
        pipBorderColor = swatch.dataset.color;
      });
    });

    // Border width slider
    const borderSlider = document.getElementById('border-width-slider');
    const borderValue = document.getElementById('border-width-value');
    if (borderSlider) {
      borderSlider.addEventListener('input', () => {
        pipBorderWidth = parseInt(borderSlider.value);
        borderValue.textContent = pipBorderWidth + 'px';
      });
    }

    // PiP size slider (in Style tab)
    const sizeSlider = document.getElementById('style-pip-size-slider');
    const sizeValue = document.getElementById('style-pip-size-value');
    if (sizeSlider) {
      sizeSlider.addEventListener('input', () => {
        clearActivePreset();
        const oldRect = calcPipRect(previewCanvas);
        const oldCX = oldRect.x + oldRect.w / 2;
        const oldCY = oldRect.y + oldRect.h / 2;

        pipSizePercent = parseInt(sizeSlider.value);
        sizeValue.textContent = pipSizePercent + '%';

        // Re-center around current center point
        const newW = Math.round(previewCanvas.width * (pipSizePercent / 100));
        const newH = pipShape === RX_PIP_SHAPES.CIRCLE ? newW : Math.round(newW * (9 / 16));
        pipX = oldCX - newW / 2;
        pipY = oldCY - newH / 2;
      });
    }

    // BG removal controls
    const bgToggle = document.getElementById('bg-removal-toggle');
    const bgOptions = document.getElementById('bg-options');
    const bgFeatherSlider = document.getElementById('bg-feather-slider');
    const bgFeatherValueEl = document.getElementById('bg-feather-value');
    const bgBlurSlider = document.getElementById('bg-blur-slider');
    const bgBlurValueEl = document.getElementById('bg-blur-value');
    const bgFeatherRow = document.getElementById('bg-feather-row');
    const bgBlurRow = document.getElementById('bg-blur-row');
    const bgStatusHint = document.getElementById('bg-status-hint');

    if (bgToggle) {
      bgToggle.addEventListener('change', async () => {
        if (bgToggle.checked) {
          if (!bgRemovalSupported) {
            bgToggle.checked = false;
            return;
          }
          await initSegmenter();
          if (segmenter) {
            bgRemovalEnabled = true;
            if (bgOptions) bgOptions.classList.remove('hidden');
          } else {
            bgToggle.checked = false;
          }
        } else {
          bgRemovalEnabled = false;
          currentMaskData = null;
          if (bgOptions) bgOptions.classList.add('hidden');
          if (bgStatusHint) bgStatusHint.textContent = 'Remove or blur your webcam background';
        }
      });
    }

    // Mode buttons
    document.querySelectorAll('.bg-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.bg-mode-btn').forEach(b => b.classList.remove('bg-mode-active'));
        btn.classList.add('bg-mode-active');
        bgRemovalMode = btn.dataset.mode;
        if (bgRemovalMode === 'blur') {
          if (bgFeatherRow) bgFeatherRow.classList.add('hidden');
          if (bgBlurRow) bgBlurRow.classList.remove('hidden');
        } else {
          if (bgFeatherRow) bgFeatherRow.classList.remove('hidden');
          if (bgBlurRow) bgBlurRow.classList.add('hidden');
        }
      });
    });

    // Feather slider
    if (bgFeatherSlider) {
      bgFeatherSlider.addEventListener('input', () => {
        bgFeatherValue = parseInt(bgFeatherSlider.value);
        if (bgFeatherValueEl) bgFeatherValueEl.textContent = bgFeatherValue;
        buildFeatherLUT(bgFeatherValue);
      });
    }

    // Blur slider
    if (bgBlurSlider) {
      bgBlurSlider.addEventListener('input', () => {
        bgBlurStrength = parseInt(bgBlurSlider.value);
        if (bgBlurValueEl) bgBlurValueEl.textContent = bgBlurStrength;
      });
    }
  }

  function recenterPipOnShapeChange(oldShape) {
    const cw = previewCanvas.width;
    const oldW = Math.round(cw * (pipSizePercent / 100));
    const oldH = oldShape === RX_PIP_SHAPES.CIRCLE ? oldW : Math.round(oldW * (9 / 16));
    const newW = Math.round(cw * (pipSizePercent / 100));
    const newH = pipShape === RX_PIP_SHAPES.CIRCLE ? newW : Math.round(newW * (9 / 16));

    if (pipX !== null && pipY !== null) {
      const cx = pipX + oldW / 2;
      const cy = pipY + oldH / 2;
      pipX = cx - newW / 2;
      pipY = cy - newH / 2;
    }
  }

  // ============================================================
  // Sidebar tab switching
  // ============================================================

  sidebarTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sidebarTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.sidebar-content').forEach(p => p.classList.add('panel-hidden'));
      const panel = document.getElementById('panel-' + tab.dataset.panel);
      if (panel) panel.classList.remove('panel-hidden');
    });
  });

  // ============================================================
  // Utilities
  // ============================================================

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // ============================================================
  // (i) Phase 8 — Post-Recording Tools
  // ============================================================

  // --- Audio analysis ---

  async function analyzeAudioLevels(blob, chunkCount) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const offlineCtx = new OfflineAudioContext(1, 44100, 44100);
      const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      const samplesPerChunk = Math.floor(channelData.length / chunkCount);

      rawRmsLevels = [];
      for (let i = 0; i < chunkCount; i++) {
        const start = i * samplesPerChunk;
        const end = Math.min(start + samplesPerChunk, channelData.length);
        let sum = 0;
        for (let j = start; j < end; j++) {
          sum += channelData[j] * channelData[j];
        }
        rawRmsLevels.push(Math.sqrt(sum / (end - start)));
      }

      // Normalize to 0-1
      const maxRms = Math.max(...rawRmsLevels, 0.001);
      chunkAudioLevels = rawRmsLevels.map(v => v / maxRms);
    } catch (err) {
      console.warn('[TubePilot RX] decodeAudioData failed, using chunk-size fallback:', err.message);
      // Fallback: use chunk byte sizes as proxy
      const sizes = recordedChunksMeta.map(m => m.size);
      const maxSize = Math.max(...sizes, 1);
      chunkAudioLevels = sizes.map(s => s / maxSize);
      rawRmsLevels = chunkAudioLevels.slice();
    }
  }

  // --- Timeline waveform rendering ---

  function drawTimeline() {
    const canvas = document.getElementById('timeline-canvas');
    if (!canvas || chunkAudioLevels.length === 0) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.clientWidth;
    const displayH = 64;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, displayW, displayH);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, displayW, displayH);

    const count = chunkAudioLevels.length;
    const effectiveEnd = trimEndIdx < 0 ? count - 1 : trimEndIdx;
    const barWidth = Math.max(1, displayW / count);
    const padding = 4;

    for (let i = 0; i < count; i++) {
      const x = (i / count) * displayW;
      const level = chunkAudioLevels[i];
      const barH = Math.max(2, level * (displayH - padding * 2));
      const y = displayH / 2 - barH / 2;

      // Determine color
      if (i < trimStartIdx || i > effectiveEnd) {
        ctx.fillStyle = '#2a2a2a'; // outside trim
      } else if (silentChunkSet.has(i)) {
        ctx.fillStyle = silenceRemovalEnabled ? 'rgba(255,68,68,0.5)' : '#8a6a2a';
      } else {
        ctx.fillStyle = '#4a8acc';
      }

      ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barH);
    }

    // Update trim overlays and handle positions
    updateTrimOverlays(count, displayW);
  }

  function chunkIdxToSeconds(idx) {
    if (recordedChunksMeta[idx]) return Math.round(recordedChunksMeta[idx].timestamp / 1000);
    return idx; // fallback: chunk ≈ 1 second
  }

  function updateTrimOverlays(chunkCount, containerWidth) {
    const effectiveEnd = trimEndIdx < 0 ? chunkCount - 1 : trimEndIdx;
    const overlayLeft = document.getElementById('trim-overlay-left');
    const overlayRight = document.getElementById('trim-overlay-right');
    const handleStart = document.getElementById('trim-handle-start');
    const handleEnd = document.getElementById('trim-handle-end');

    if (!overlayLeft) return;

    const leftPct = (trimStartIdx / chunkCount) * 100;
    const rightPct = ((chunkCount - 1 - effectiveEnd) / chunkCount) * 100;

    overlayLeft.style.width = leftPct + '%';
    overlayRight.style.width = rightPct + '%';

    handleStart.style.left = leftPct + '%';
    handleEnd.style.right = rightPct + '%';

    // Visibility: always show once trim panel is active
    handleStart.classList.toggle('visible', trimStartIdx > 0);
    handleEnd.classList.toggle('visible', trimEndIdx >= 0);

    // Update time displays
    const inTime = document.getElementById('trim-in-time');
    const outTime = document.getElementById('trim-out-time');
    const durTime = document.getElementById('trim-duration');
    const startTimeEl = document.getElementById('timeline-time-start');
    const endTimeEl = document.getElementById('timeline-time-end');

    const inSec = chunkIdxToSeconds(trimStartIdx);
    const outSec = chunkIdxToSeconds(effectiveEnd);
    if (inTime) inTime.textContent = formatRecTime(inSec);
    if (outTime) outTime.textContent = formatRecTime(outSec);
    if (durTime) {
      let dur = outSec - inSec;
      if (silenceRemovalEnabled) {
        for (let i = trimStartIdx; i <= effectiveEnd; i++) {
          if (silentChunkSet.has(i)) dur--;
        }
      }
      durTime.textContent = formatRecTime(Math.max(0, dur));
    }
    if (startTimeEl) startTimeEl.textContent = formatRecTime(0);
    if (endTimeEl) endTimeEl.textContent = formatRecTime(chunkIdxToSeconds(chunkCount - 1));
  }

  // --- Trim handles (drag interaction) ---

  function initTrimHandles() {
    const container = document.getElementById('timeline-container');
    const handleStart = document.getElementById('trim-handle-start');
    const handleEnd = document.getElementById('trim-handle-end');
    const canvas = document.getElementById('timeline-canvas');
    const playhead = document.getElementById('timeline-playhead');

    if (!container || !handleStart || !handleEnd) return;

    let draggingHandle = null;

    function getChunkFromX(clientX) {
      const rect = container.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(pct * (chunkAudioLevels.length - 1));
    }

    handleStart.addEventListener('mousedown', (e) => {
      draggingHandle = 'start';
      e.preventDefault();
    });

    handleEnd.addEventListener('mousedown', (e) => {
      draggingHandle = 'end';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!draggingHandle) return;
      if (outputSection.classList.contains('hidden')) { draggingHandle = null; return; }
      const idx = getChunkFromX(e.clientX);
      const effectiveEnd = trimEndIdx < 0 ? chunkAudioLevels.length - 1 : trimEndIdx;

      if (draggingHandle === 'start') {
        trimStartIdx = Math.max(0, Math.min(idx, effectiveEnd - 1));
      } else {
        const newEnd = Math.max(trimStartIdx + 1, Math.min(idx, chunkAudioLevels.length - 1));
        trimEndIdx = newEnd === chunkAudioLevels.length - 1 ? -1 : newEnd;
      }
      drawTimeline();
    });

    document.addEventListener('mouseup', () => {
      draggingHandle = null;
    });

    // Click on timeline to seek video
    canvas.addEventListener('click', (e) => {
      if (draggingHandle) return;
      const rect = canvas.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      if (outputVideo && outputVideo.duration) {
        outputVideo.currentTime = pct * outputVideo.duration;
      }
    });

    // Sync playhead to video playback
    outputVideo.addEventListener('timeupdate', () => {
      if (!outputVideo.duration || chunkAudioLevels.length === 0) return;
      const pct = outputVideo.currentTime / outputVideo.duration;
      if (playhead) {
        playhead.style.left = (pct * 100) + '%';
      }
    });
  }

  // --- Trim reset ---

  function resetTrim() {
    trimStartIdx = 0;
    trimEndIdx = -1;
    drawTimeline();
  }

  // --- Silence detection ---

  function detectSilence() {
    const thresholdSlider = document.getElementById('silence-threshold');
    const minDurSlider = document.getElementById('silence-min-duration');
    const statusEl = document.getElementById('silence-status');

    const threshold = parseInt(thresholdSlider.value) / 100; // 1-10 → 0.01-0.10
    const minDuration = parseInt(minDurSlider.value); // seconds = chunks

    silentChunkRanges = [];
    silentChunkSet = new Set();

    let runStart = -1;
    for (let i = 0; i < chunkAudioLevels.length; i++) {
      if (chunkAudioLevels[i] < threshold) {
        if (runStart < 0) runStart = i;
      } else {
        if (runStart >= 0 && (i - runStart) >= minDuration) {
          silentChunkRanges.push({ startIdx: runStart, endIdx: i - 1 });
          for (let j = runStart; j < i; j++) silentChunkSet.add(j);
        }
        runStart = -1;
      }
    }
    // Handle trailing silence
    if (runStart >= 0 && (chunkAudioLevels.length - runStart) >= minDuration) {
      silentChunkRanges.push({ startIdx: runStart, endIdx: chunkAudioLevels.length - 1 });
      for (let j = runStart; j < chunkAudioLevels.length; j++) silentChunkSet.add(j);
    }

    // Count total silent seconds
    let totalSilent = 0;
    silentChunkRanges.forEach(r => totalSilent += r.endIdx - r.startIdx + 1);

    if (statusEl) {
      statusEl.textContent = silentChunkRanges.length > 0
        ? `Found ${silentChunkRanges.length} silent segment(s) (${totalSilent}s total)`
        : 'No silence detected';
    }

    drawTimeline();
  }

  // --- Speech Recognition ---

  function startSpeechRecognition() {
    const SpeechRecog = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecog) return;

    speechRecognition = new SpeechRecog();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'en-US';

    let interimStart = null;

    speechRecognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) {
          if (interimStart === null) {
            interimStart = Date.now() - startTime - pausedDuration;
          }
        } else {
          const text = result[0].transcript.trim();
          if (text) {
            const segStart = interimStart !== null ? interimStart : Date.now() - startTime - pausedDuration;
            const segEnd = Date.now() - startTime - pausedDuration;
            captionSegments.push({ start: segStart, end: segEnd, text });
          }
          interimStart = null;
        }
      }
    };

    speechRecognition.onend = function() {
      // Guard against stale instance (e.g. stop/pause fired async)
      if (this !== speechRecognition) return;
      // Auto-restart if still recording
      if (currentState === RX_STATES.RECORDING && captionsEnabled) {
        try { speechRecognition.start(); } catch {}
      }
    };

    speechRecognition.onerror = (e) => {
      console.warn('[TubePilot RX] SpeechRecognition error:', e.error);
      if (e.error === 'not-allowed') {
        captionsEnabled = false;
        const toggle = document.getElementById('captions-toggle');
        if (toggle) toggle.checked = false;
        const hint = document.getElementById('captions-hint');
        if (hint) hint.textContent = 'Microphone access denied';
      }
    };

    try {
      speechRecognition.start();
    } catch (err) {
      console.warn('[TubePilot RX] SpeechRecognition start failed:', err.message);
    }
  }

  // --- Caption rendering & SRT export ---

  function renderCaptions() {
    const list = document.getElementById('caption-list');
    const empty = document.getElementById('caption-empty');
    const srtDownloadBtn = document.getElementById('caption-download-srt');
    if (!list) return;

    if (captionSegments.length === 0) {
      list.innerHTML = '';
      list.appendChild(empty || createCaptionEmpty());
      if (srtDownloadBtn) srtDownloadBtn.disabled = true;
      return;
    }

    if (empty) empty.remove();
    if (srtDownloadBtn) srtDownloadBtn.disabled = false;

    list.innerHTML = captionSegments.map((seg, i) => `
      <div class="caption-item" data-index="${i}">
        <span class="caption-time">${formatSrtTime(seg.start)}</span>
        <textarea class="caption-text" rows="1" data-index="${i}">${escapeHtml(seg.text)}</textarea>
        <button class="caption-delete-btn" data-index="${i}" title="Delete">&times;</button>
      </div>
    `).join('');

    // Edit listeners
    list.querySelectorAll('.caption-text').forEach(ta => {
      ta.addEventListener('input', () => {
        const idx = parseInt(ta.dataset.index);
        if (captionSegments[idx]) captionSegments[idx].text = ta.value;
      });
    });

    // Delete listeners
    list.querySelectorAll('.caption-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        captionSegments.splice(idx, 1);
        renderCaptions();
      });
    });
  }

  function createCaptionEmpty() {
    const div = document.createElement('div');
    div.className = 'caption-empty';
    div.id = 'caption-empty';
    div.textContent = 'No captions recorded. Enable captions before recording in the Camera tab.';
    return div;
  }

  function generateSrt() {
    return captionSegments.map((seg, i) => {
      return `${i + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text}\n`;
    }).join('\n');
  }

  function formatSrtTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const millis = ms % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }

  // --- Thumbnail picker ---

  function captureThumbnail() {
    if (!outputVideo || !outputVideo.videoWidth) return;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 1280;
    thumbCanvas.height = 720;
    const ctx = thumbCanvas.getContext('2d');
    ctx.drawImage(outputVideo, 0, 0, 1280, 720);
    customThumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.92);

    const preview = document.getElementById('thumbnail-preview');
    const img = document.getElementById('thumbnail-img');
    const dlBtn = document.getElementById('thumbnail-download-btn');
    if (preview) preview.classList.remove('hidden');
    if (img) img.src = customThumbnailDataUrl;
    if (dlBtn) dlBtn.disabled = false;
  }

  function downloadThumbnail() {
    if (!customThumbnailDataUrl) return;
    const a = document.createElement('a');
    a.href = customThumbnailDataUrl;
    a.download = `thumbnail-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // --- AI Metadata generation ---

  async function generateAiMeta() {
    if (aiMetaGenerating) return;
    aiMetaGenerating = true;
    const statusEl = document.getElementById('ai-meta-status');
    const btn = document.getElementById('ai-meta-btn');
    if (statusEl) statusEl.textContent = 'Generating...';
    if (btn) btn.disabled = true;

    try {
      // Build video description context
      let videoDesc = '';
      if (nowPlaying) {
        videoDesc += `Reaction video to: "${nowPlaying.title}"`;
        if (nowPlaying.channelTitle) videoDesc += ` by ${nowPlaying.channelTitle}`;
        videoDesc += '. ';
      }
      videoDesc += 'This is a reaction/commentary video. ';
      // Add first few caption excerpts
      if (captionSegments.length > 0) {
        const excerpts = captionSegments.slice(0, 5).map(s => s.text).join('. ');
        videoDesc += 'Reactor said: ' + excerpts;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_YOUTUBE_META',
        videoDescription: videoDesc,
        product: null,
        channelContext: null
      });

      if (response?.error) {
        if (statusEl) statusEl.textContent = response.error;
        return;
      }

      const result = response?.result;
      if (result) {
        if (result.title) uploadTitle.value = result.title.slice(0, 100);
        if (result.description) uploadDescription.value = result.description.slice(0, 5000);
        if (result.category) {
          const catId = Object.entries(CONFIG.YOUTUBE_CATEGORIES)
            .find(([, name]) => name.toLowerCase() === result.category.toLowerCase())?.[0];
          if (catId) uploadCategory.value = catId;
        }
        updateCharCounters();

        // Show upload form if hidden
        if (uploadForm.classList.contains('hidden')) {
          uploadForm.classList.remove('hidden');
          uploadToggleBtn.textContent = 'Hide Upload Form';
          populateChannels();
          populateCategories();
        }

        if (statusEl) statusEl.textContent = 'Done!';
      } else {
        if (statusEl) statusEl.textContent = 'No result received';
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Error: ' + err.message;
    } finally {
      aiMetaGenerating = false;
      if (btn) btn.disabled = false;
    }
  }

  // --- Init segment extraction for trimming ---

  async function extractInitSegment(firstChunk) {
    try {
      const buffer = await firstChunk.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // Scan for Cluster element ID: 0x1F 0x43 0xB6 0x75
      for (let i = 0; i < bytes.length - 3; i++) {
        if (bytes[i] === 0x1F && bytes[i + 1] === 0x43 && bytes[i + 2] === 0xB6 && bytes[i + 3] === 0x75) {
          return new Blob([buffer.slice(0, i)], { type: firstChunk.type || 'video/webm' });
        }
      }
    } catch (err) {
      console.warn('[TubePilot RX] extractInitSegment failed:', err.message);
    }
    // Fallback: return entire chunk
    return firstChunk;
  }

  // --- Export blob with trim + silence removal ---

  async function getExportBlob() {
    const effectiveEnd = trimEndIdx < 0 ? recordedChunks.length - 1 : trimEndIdx;
    const hasTrim = trimStartIdx > 0 || effectiveEnd < recordedChunks.length - 1;
    const hasSilenceRemoval = silenceRemovalEnabled && silentChunkSet.size > 0;

    if (!hasTrim && !hasSilenceRemoval) {
      return lastRecordingBlob;
    }

    const parts = [];

    if (trimStartIdx === 0) {
      // Include full first chunk (init segment + first cluster data)
      parts.push(recordedChunks[0]);
    } else {
      // Trimming the start: init segment only (no first cluster data)
      const initSegment = await extractInitSegment(recordedChunks[0]);
      parts.push(initSegment);
    }

    for (let i = Math.max(1, trimStartIdx); i <= effectiveEnd; i++) {
      if (hasSilenceRemoval && silentChunkSet.has(i)) continue;
      parts.push(recordedChunks[i]);
    }

    return new Blob(parts, { type: recordingMimeType || 'video/webm' });
  }

  // --- Tool panel switching ---

  function initPostTools() {
    if (postToolsInitialized) return;
    postToolsInitialized = true;

    // Tool button switching
    document.querySelectorAll('.post-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        const panel = document.getElementById('tool-panel-' + tool);
        const wasActive = btn.classList.contains('active');

        // Deactivate all
        document.querySelectorAll('.post-tool-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tool-panel').forEach(p => p.classList.add('hidden'));

        if (!wasActive && panel) {
          btn.classList.add('active');
          panel.classList.remove('hidden');
        }
      });
    });

    // Trim reset
    const trimResetBtn = document.getElementById('trim-reset-btn');
    if (trimResetBtn) trimResetBtn.addEventListener('click', resetTrim);

    // Silence controls
    const silenceDetectBtn = document.getElementById('silence-detect-btn');
    if (silenceDetectBtn) silenceDetectBtn.addEventListener('click', detectSilence);

    const silenceThreshold = document.getElementById('silence-threshold');
    const silenceThresholdVal = document.getElementById('silence-threshold-val');
    if (silenceThreshold) {
      silenceThreshold.addEventListener('input', () => {
        silenceThresholdVal.textContent = silenceThreshold.value + '%';
      });
    }

    const silenceMinDur = document.getElementById('silence-min-duration');
    const silenceMinVal = document.getElementById('silence-min-val');
    if (silenceMinDur) {
      silenceMinDur.addEventListener('input', () => {
        silenceMinVal.textContent = silenceMinDur.value + 's';
      });
    }

    const silenceRemoveToggle = document.getElementById('silence-remove-toggle');
    if (silenceRemoveToggle) {
      silenceRemoveToggle.addEventListener('change', () => {
        silenceRemovalEnabled = silenceRemoveToggle.checked;
        drawTimeline();
      });
    }

    // Caption SRT download
    const captionDlBtn = document.getElementById('caption-download-srt');
    if (captionDlBtn) {
      captionDlBtn.addEventListener('click', () => {
        const srt = generateSrt();
        const blob = new Blob([srt], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `captions-${Date.now()}.srt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    // Thumbnail
    const thumbCaptureBtn = document.getElementById('thumbnail-capture-btn');
    if (thumbCaptureBtn) thumbCaptureBtn.addEventListener('click', captureThumbnail);
    const thumbDlBtn = document.getElementById('thumbnail-download-btn');
    if (thumbDlBtn) thumbDlBtn.addEventListener('click', downloadThumbnail);

    // AI meta
    const aiMetaBtn = document.getElementById('ai-meta-btn');
    if (aiMetaBtn) aiMetaBtn.addEventListener('click', generateAiMeta);

    // Init trim handle drag
    initTrimHandles();
  }

  // --- Captions toggle in Camera tab ---

  const captionsToggle = document.getElementById('captions-toggle');
  const captionsHint = document.getElementById('captions-hint');
  if (captionsToggle) {
    const SpeechRecog = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecog) {
      captionsToggle.disabled = true;
      if (captionsHint) captionsHint.textContent = 'Not supported in this browser';
    } else {
      captionsToggle.addEventListener('change', () => {
        captionsEnabled = captionsToggle.checked;
      });
    }
  }

  // --- Modified showOutput ---

  const _originalShowOutput = showOutput;

  // Override showOutput to add post-tools initialization
  showOutput = function(blob, duration) {
    _originalShowOutput(blob, duration);

    // Reset post-tool state
    trimStartIdx = 0;
    trimEndIdx = -1;
    chunkAudioLevels = [];
    rawRmsLevels = [];
    silentChunkRanges = [];
    silentChunkSet = new Set();
    silenceRemovalEnabled = false;
    customThumbnailDataUrl = null;
    const silenceToggle = document.getElementById('silence-remove-toggle');
    if (silenceToggle) silenceToggle.checked = false;

    // Reset tool panels
    document.querySelectorAll('.post-tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tool-panel').forEach(p => p.classList.add('hidden'));

    // Reset thumbnail
    const thumbPreview = document.getElementById('thumbnail-preview');
    if (thumbPreview) thumbPreview.classList.add('hidden');
    const thumbDlBtn = document.getElementById('thumbnail-download-btn');
    if (thumbDlBtn) thumbDlBtn.disabled = true;

    // Init event listeners once
    initPostTools();

    // Render captions
    renderCaptions();

    // Analyze audio and draw timeline
    if (chunkAudioLevels.length === 0 && recordedChunks.length > 0) {
      // Show analyzing state
      const timelineCanvas = document.getElementById('timeline-canvas');
      if (timelineCanvas) {
        const ctx = timelineCanvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        timelineCanvas.width = timelineCanvas.clientWidth * dpr;
        timelineCanvas.height = 64 * dpr;
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, timelineCanvas.clientWidth, 64);
        ctx.fillStyle = '#555';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Analyzing audio...', timelineCanvas.clientWidth / 2, 36);
      }

      analyzeAudioLevels(blob, recordedChunksMeta.length).then(() => {
        drawTimeline();
      });
    } else if (chunkAudioLevels.length > 0) {
      drawTimeline();
    }
  };

  // ============================================================
  // Init
  // ============================================================

  await loadDevices();
  initStyleTab();
  updateNavButtons();
  cleanupOldRecordings();

  // Check for existing session
  try {
    const stateResp = await chrome.runtime.sendMessage({ type: RX_MESSAGES.GET_STATE });
    if (stateResp?.success && stateResp.state !== RX_STATES.IDLE) {
      setState(stateResp.state);
    }
  } catch {}
});
