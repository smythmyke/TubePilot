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

  // Screen capture
  const screenCaptureBtn = document.getElementById('screen-capture-btn');
  const stopScreenCaptureBtn = document.getElementById('stop-screen-capture-btn');
  const tabVolumeLabel = document.getElementById('tab-volume-label');

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

  // Music
  const musicVolumeSlider = document.getElementById('music-volume-slider');
  const musicVolumeValue = document.getElementById('music-volume-value');
  const musicMuteBtn = document.getElementById('music-mute-btn');
  const musicCaptureBtn = document.getElementById('music-capture-btn');
  const stopMusicBtn = document.getElementById('stop-music-btn');
  const musicRow = document.getElementById('music-row');
  const musicCaptureRow = document.getElementById('music-capture-row');

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

  // Video panel position / size (null = full canvas default)
  let vidX = null;
  let vidY = null;
  let vidSizePercent = 100;

  // Video panel interaction state
  let vidSelected = false;
  let vidDragging = false;
  let vidResizing = false;
  let vidResizeCorner = null;
  let vidDragOffsetX = 0;
  let vidDragOffsetY = 0;
  let vidHovered = false;

  // Z-order: which panel draws on top
  let topPanel = 'webcam';

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
  let audioCompressor = null;
  let micAnalyser = null;
  let micMeterRaf = null;
  let micMuted = false;
  let savedMicGain = 1;

  // Music (background audio from another tab)
  let musicStream = null;
  let musicSourceNode = null;
  let musicGain = null;
  let musicTabId = null;
  let musicMuted = false;
  let savedMusicGain = 1;

  // Mic preview (lightweight — meter only, before recording graph exists)
  let micPreviewStream = null;
  let micPreviewCtx = null;
  let micPreviewAnalyser = null;

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

  // Mask post-processing
  let bgMaskDilation = 10;
  let bgMaskSmoothing = 20;

  // Audio dev tuning (session-only)
  let audioDevPanelOpen = false;
  let audioDevBypassCompressor = false;
  let audioDevBitrate = 128000;
  let audioDevCompressor = { threshold: -12, knee: 10, ratio: 2, attack: 0.005, release: 0.2 };
  let audioDevPeakAnalyser = null;
  let audioDevPeakRaf = null;

  // Queue
  let videoQueue = [];
  let nowPlaying = null;
  let playHistory = [];
  let isFirstVideoLoad = true;
  let lastSearchResults = [];

  // Write-through queue persistence
  let _writingQueue = false;
  async function saveQueueState() {
    _writingQueue = true;
    const persistedNowPlaying = (nowPlaying && nowPlaying.videoId === '__screen_capture__') ? null : nowPlaying;
    await QueueStorage.save({ nowPlaying: persistedNowPlaying, queue: videoQueue, playHistory });
    setTimeout(() => { _writingQueue = false; }, 50);
  }
  QueueStorage.onChange((data) => {
    if (_writingQueue) return;
    videoQueue = data.queue || [];
    nowPlaying = data.nowPlaying;
    playHistory = data.playHistory || [];
    renderNowPlaying();
    renderQueue();
    updateNavButtons();
  });

  // Layout system (Phase 6)
  let currentLayout = RX_LAYOUTS.PIP;
  let activePreset = RX_PRESETS.PIP_BR;
  let recordingView = RX_VIEWS.FINAL;
  let webcamOnlyMode = false;
  let audioOnlyMode = false;
  let screenCaptureMode = false;
  let sideBySideSwapped = false;
  let sbsSplitPercent = 50;

  // Document PiP popout
  let pipWindow = null;
  let pipMiniCanvas = null;
  let pipMiniCtx = null;
  let pipMiniTimerEl = null;
  let pipMiniDotEl = null;
  let pipMiniStatusEl = null;
  const popoutBtn = document.getElementById('popout-btn');


  // ============================================================
  // (a) Video loading & Queue system
  // ============================================================

  // parseVideoId() is now in services/queue-storage.js (shared with sidepanel)

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
      saveQueueState();
    }
  }

  async function playVideo(videoObj) {
    // If in screen capture mode, stop it first before switching to YouTube
    if (screenCaptureMode) {
      stopCurrentCapture();
      updateScreenCaptureUI(false);
    }

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
    saveQueueState();

    if (isFirstVideoLoad) {
      setSearchStatus('Loading video...', 'loading');
      try {
        // 1. Open the YouTube video in a new tab (content script strips UI)
        const ytTab = await chrome.tabs.create({
          url: `https://www.youtube.com/watch?v=${videoObj.videoId}&autoplay=1`,
          active: true
        });

        // 2. Show instruction in placeholder + wait for page to load
        previewPlaceholder.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;line-height:1.6">'
          + '<div style="font-size:24px;margin-bottom:8px">Select the YouTube tab</div>'
          + '<div style="font-size:14px;color:#777">A share dialog will appear.<br>Pick the YouTube tab and click <b style="color:#fff">Share</b>.</div>'
          + '<div style="font-size:12px;color:#555;margin-top:12px">This is a one-time step per session.</div>'
          + '</div>';
        previewPlaceholder.classList.remove('hidden');
        await new Promise(r => setTimeout(r, 1500));

        // 3. Bring focus back to reactions page so picker appears here
        const reactionsTab = await chrome.tabs.getCurrent();
        if (reactionsTab) await chrome.tabs.update(reactionsTab.id, { active: true });
        await new Promise(r => setTimeout(r, 200));

        // 4. getDisplayMedia — user picks the YouTube tab (only tabs shown)
        tabStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'browser' },
          audio: {
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false
          },
          preferCurrentTab: false,
          selfBrowserSurface: 'exclude',
          monitorTypeSurfaces: 'exclude'
        });

        // [AUDIO DEBUG] Log what getDisplayMedia returned
        const _dbgVTracks = tabStream.getVideoTracks();
        const _dbgATracks = tabStream.getAudioTracks();
        console.log('[AUDIO DEBUG] getDisplayMedia (YT tab) resolved — video tracks:', _dbgVTracks.length, ', audio tracks:', _dbgATracks.length);
        _dbgATracks.forEach((t, i) => console.log(`[AUDIO DEBUG]   audio track[${i}]: label="${t.label}" readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`));
        if (_dbgATracks.length === 0) console.warn('[AUDIO DEBUG] ⚠ NO AUDIO TRACKS from getDisplayMedia — user likely did not check "Share tab audio"');

        // 5. Tell SW which tab we captured
        const response = await chrome.runtime.sendMessage({
          type: RX_MESSAGES.LOAD_VIDEO,
          youTubeTabId: ytTab.id,
          videoId: videoObj.videoId
        });
        if (!response?.success) throw new Error(response?.error || 'Failed to register YouTube tab');

        // 6. Set up video element
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

        // 7. Set up audio mixing
        setupAudioMixing();

        // 8. Start webcam for canvas compositing (PiP / Camera view)
        if (!audioOnlyMode && !camStream) {
          await startCamStream();
        }

        // Hide placeholder, start render loop
        previewPlaceholder.innerHTML = '<span>Load a video to start</span>';
        previewPlaceholder.classList.add('hidden');
        startRenderLoop();

        // Enable player controls
        playPauseBtn.disabled = false;
        seekInput.disabled = false;
        recordBtn.disabled = false;
        popoutBtn.disabled = false;

        // 9. Detect stream end (tab closed or user stops sharing)
        tabStream.getVideoTracks()[0]?.addEventListener('ended', handleStreamEnded);

        isFirstVideoLoad = false;
        setSearchStatus('');
      } catch (err) {
        console.error('playVideo first-load error:', err.message);
        previewPlaceholder.innerHTML = '<span>Load a video to start</span>';
        previewPlaceholder.classList.remove('hidden');
        // Clean up partial YouTube tab if it was created
        try {
          const stateResp = await chrome.runtime.sendMessage({ type: RX_MESSAGES.GET_STATE });
          if (stateResp?.youTubeTabId) {
            chrome.tabs.remove(stateResp.youTubeTabId).catch(() => {});
          }
        } catch {}
        await chrome.runtime.sendMessage({ type: RX_MESSAGES.CLEANUP }).catch(() => {});
        // Stop any partial stream
        if (tabStream) {
          tabStream.getTracks().forEach(t => t.stop());
          tabStream = null;
        }
        // Reset state so next click starts fresh
        isFirstVideoLoad = true;
        nowPlaying = playHistory.length > 0 ? playHistory.pop() : null;
        renderNowPlaying();
        updateNavButtons();
        saveQueueState();
        setSearchStatus(err.message.includes('user') || err.message.includes('cancel')
          ? 'Capture cancelled — click a video to try again'
          : 'Error: ' + err.message, 'error');
      }
    } else {
      // Navigate the captured YouTube tab to new video (stream persists)
      setSearchStatus('Loading next video...', 'loading');
      try {
        const response = await chrome.runtime.sendMessage({
          type: RX_MESSAGES.LOAD_NEXT_VIDEO,
          videoId: videoObj.videoId
        });

        if (!response || !response.success) {
          if (response?.error === 'No YouTube tab') {
            // YouTube tab was closed — fall back to full flow
            isFirstVideoLoad = true;
            await playVideo(videoObj);
            return;
          }
          throw new Error(response?.error || 'Failed to load video');
        }
        setSearchStatus('');
      } catch (err) {
        console.error('playVideo next-load error:', err.message);
        setSearchStatus('Error: ' + err.message, 'error');
        nowPlaying = playHistory.length > 0 ? playHistory.pop() : null;
        renderNowPlaying();
        updateNavButtons();
      }
    }
  }

  function handleStreamEnded() {
    tabStream = null;
    isFirstVideoLoad = true;
    previewPlaceholder.classList.remove('hidden');
    playPauseBtn.disabled = true;
    seekInput.disabled = true;
    recordBtn.disabled = true;
    // Stop background music
    stopMusicCapture();
    // Stop recording if active
    if (currentState === RX_STATES.RECORDING || currentState === RX_STATES.PAUSED) {
      stopBtn.click();
    }
  }

  // --- Screen capture mode ---

  async function startScreenCapture() {
    // If already capturing YouTube, stop that first
    if (tabStream && !screenCaptureMode) {
      stopCurrentCapture();
    }

    // Show instructions in placeholder
    previewPlaceholder.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;line-height:1.6">'
      + '<div style="font-size:24px;margin-bottom:8px">Select content to capture</div>'
      + '<div style="font-size:14px;color:#777">Choose a tab, window, or screen to capture.</div>'
      + '</div>';
    previewPlaceholder.classList.remove('hidden');

    try {
      // getDisplayMedia with no surface constraints — user picks anything
      tabStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      // [AUDIO DEBUG] Log what screen capture getDisplayMedia returned
      const _dbgScVTracks = tabStream.getVideoTracks();
      const _dbgScATracks = tabStream.getAudioTracks();
      console.log('[AUDIO DEBUG] getDisplayMedia (screen capture) resolved — video tracks:', _dbgScVTracks.length, ', audio tracks:', _dbgScATracks.length);
      _dbgScATracks.forEach((t, i) => console.log(`[AUDIO DEBUG]   audio track[${i}]: label="${t.label}" readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`));
      if (_dbgScATracks.length === 0) console.warn('[AUDIO DEBUG] ⚠ NO AUDIO TRACKS from screen capture getDisplayMedia');

      screenCaptureMode = true;

      // Push current nowPlaying to history before replacing
      if (nowPlaying) {
        playHistory.push(nowPlaying);
      }
      nowPlaying = { videoId: '__screen_capture__', title: 'Screen Capture', channelTitle: 'Live capture', thumbnail: '' };

      // Tell SW we're in screen capture mode (null youTubeTabId)
      await chrome.runtime.sendMessage({
        type: RX_MESSAGES.LOAD_VIDEO,
        youTubeTabId: null,
        videoId: '__screen_capture__'
      }).catch(() => {});

      // Set up video element
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

      // Start webcam
      if (!audioOnlyMode && !camStream) {
        await startCamStream();
      }

      // Hide placeholder, start render loop
      previewPlaceholder.innerHTML = '<span>Load a video to start</span>';
      previewPlaceholder.classList.add('hidden');
      startRenderLoop();

      // Enable record, disable player controls
      recordBtn.disabled = false;
      popoutBtn.disabled = false;
      updateScreenCaptureUI(true);

      renderNowPlaying();
      renderQueue();
      updateNavButtons();
      saveQueueState();

      // Detect stream end (user stops sharing)
      tabStream.getVideoTracks()[0]?.addEventListener('ended', handleScreenCaptureEnded);

      isFirstVideoLoad = false;
    } catch (err) {
      console.error('startScreenCapture error:', err.message);
      previewPlaceholder.innerHTML = '<span>Load a video to start</span>';
      if (!tabStream) previewPlaceholder.classList.remove('hidden');

      // Restore previous nowPlaying
      if (screenCaptureMode) {
        nowPlaying = playHistory.length > 0 ? playHistory.pop() : null;
        screenCaptureMode = false;
      }

      // Clean up partial stream
      if (tabStream) {
        tabStream.getTracks().forEach(t => t.stop());
        tabStream = null;
      }

      updateScreenCaptureUI(false);
      renderNowPlaying();
      updateNavButtons();
      saveQueueState();

      const msg = err.message.includes('user') || err.message.includes('cancel')
        ? 'Capture cancelled'
        : 'Error: ' + err.message;
      setSearchStatus(msg, 'error');
    }
  }

  function stopCurrentCapture() {
    // Stop recording if active
    if (currentState === RX_STATES.RECORDING || currentState === RX_STATES.PAUSED) {
      stopBtn.click();
    }

    // Stop all tab stream tracks
    if (tabStream) {
      tabStream.getTracks().forEach(t => t.stop());
      tabStream = null;
    }

    // Stop background music
    stopMusicCapture();

    // If we were in YouTube mode, clean up the YouTube tab
    if (!screenCaptureMode) {
      chrome.runtime.sendMessage({ type: RX_MESSAGES.CLEANUP }).catch(() => {});
    }

    isFirstVideoLoad = true;
    screenCaptureMode = false;
  }

  function handleScreenCaptureEnded() {
    // Stop recording if active
    if (currentState === RX_STATES.RECORDING || currentState === RX_STATES.PAUSED) {
      stopBtn.click();
    }

    // Stop background music
    stopMusicCapture();

    tabStream = null;
    isFirstVideoLoad = true;
    screenCaptureMode = false;
    nowPlaying = null;

    previewPlaceholder.classList.remove('hidden');
    playPauseBtn.disabled = true;
    seekInput.disabled = true;
    recordBtn.disabled = true;

    updateScreenCaptureUI(false);
    renderNowPlaying();
    updateNavButtons();
    saveQueueState();
  }

  function updateScreenCaptureUI(active) {
    screenCaptureBtn.classList.toggle('active', active);
    stopScreenCaptureBtn.classList.toggle('hidden', !active);

    // Dim player controls when in screen capture mode
    const playerControls = document.querySelector('.player-controls');
    if (playerControls) {
      if (active) {
        playerControls.style.opacity = '0.35';
        playerControls.style.pointerEvents = 'none';
      } else {
        playerControls.style.opacity = '';
        playerControls.style.pointerEvents = '';
      }
    }

    // Change volume label
    if (tabVolumeLabel) {
      tabVolumeLabel.textContent = active ? 'Audio' : 'YouTube';
    }
  }

  screenCaptureBtn.addEventListener('click', () => startScreenCapture());
  stopScreenCaptureBtn.addEventListener('click', () => {
    stopCurrentCapture();
    nowPlaying = null;
    previewPlaceholder.classList.remove('hidden');
    playPauseBtn.disabled = true;
    seekInput.disabled = true;
    recordBtn.disabled = true;
    updateScreenCaptureUI(false);
    renderNowPlaying();
    updateNavButtons();
    saveQueueState();
  });

  function playNextInQueue() {
    if (videoQueue.length === 0) return;
    const next = videoQueue.shift();
    playVideo(next); // playVideo calls saveQueueState
  }

  function playPrevious() {
    if (playHistory.length === 0) return;
    const prev = playHistory.pop();
    // Put current back at front of queue
    if (nowPlaying) {
      videoQueue.unshift(nowPlaying);
    }
    nowPlaying = null; // prevent double-push in playVideo
    playVideo(prev); // playVideo calls saveQueueState
  }

  function removeFromQueue(index) {
    if (index >= 0 && index < videoQueue.length) {
      videoQueue.splice(index, 1);
      renderQueue();
      updateNavButtons();
      saveQueueState();
    }
  }

  function moveQueueItem(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= videoQueue.length) return;
    const temp = videoQueue[index];
    videoQueue[index] = videoQueue[newIndex];
    videoQueue[newIndex] = temp;
    renderQueue();
    saveQueueState();
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
    if (nowPlaying.videoId === '__screen_capture__') {
      nowPlayingCard.innerHTML = `
        <div class="np-thumb" style="display:flex;align-items:center;justify-content:center;font-size:24px;background:#1a3a1a;color:#4caf50">&#x1F5B5;</div>
        <div class="np-info">
          <div class="np-title">Screen Capture</div>
          <div class="np-channel">Live capture active</div>
        </div>
      `;
    } else {
      nowPlayingCard.innerHTML = `
        <img class="np-thumb" src="${escapeAttr(nowPlaying.thumbnail)}" alt="">
        <div class="np-info">
          <div class="np-title" title="${escapeAttr(nowPlaying.title)}">${escapeHtml(nowPlaying.title)}</div>
          <div class="np-channel">${escapeHtml(nowPlaying.channelTitle)}</div>
        </div>
      `;
    }
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

  function isVideoQueued(videoId) {
    if (nowPlaying && nowPlaying.videoId === videoId) return true;
    return videoQueue.some(v => v.videoId === videoId);
  }

  function renderSearchResults() {
    if (lastSearchResults.length === 0) {
      searchResultsSection.classList.add('hidden');
      return;
    }
    searchResultsSection.classList.remove('hidden');

    // Sort: unadded items first, added items at bottom
    const sorted = lastSearchResults.map((v, i) => ({ v, origIdx: i, added: isVideoQueued(v.videoId) }));
    sorted.sort((a, b) => (a.added === b.added ? 0 : a.added ? 1 : -1));

    searchResultsList.innerHTML = sorted.map(({ v, origIdx, added }) => `
      <div class="search-result${added ? ' sr-added' : ''}" data-index="${origIdx}">
        <img class="sr-thumb" src="${escapeAttr(v.thumbnail)}" alt="">
        <div class="sr-info">
          <div class="sr-title" title="${escapeAttr(v.title)}">${escapeHtml(v.title)}</div>
          <div class="sr-channel">${escapeHtml(v.channelTitle)}</div>
        </div>
        ${added
          ? '<span class="sr-added-badge">\u2713 Added</span>'
          : `<button class="sr-add-btn" data-index="${origIdx}">+ Queue</button>`}
      </div>
    `).join('');

    searchResultsList.querySelectorAll('.sr-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        const videoObj = lastSearchResults[idx];
        if (videoObj) {
          addToQueueOrPlay(videoObj);
          renderSearchResults(); // re-render to show checkmark + move to bottom
        }
      });
    });
  }

  function decodeHtmlEntities(str) {
    if (!str) return '';
    const el = document.createElement('textarea');
    el.innerHTML = str;
    return el.value;
  }

  function escapeHtml(str) {
    if (!str) return '';
    str = decodeHtmlEntities(str);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    str = decodeHtmlEntities(str);
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
    if (mics.length > 0) {
      startMicPreview(mics[0].deviceId);
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

  // Lightweight mic preview — drives meter before recording graph exists
  async function startMicPreview(deviceId) {
    stopMicPreview();

    const constraints = deviceId
      ? { audio: { deviceId: { exact: deviceId } } }
      : { audio: true };

    try {
      micPreviewStream = await navigator.mediaDevices.getUserMedia(constraints);
      micPreviewCtx = new AudioContext();
      const source = micPreviewCtx.createMediaStreamSource(micPreviewStream);
      micPreviewAnalyser = micPreviewCtx.createAnalyser();
      micPreviewAnalyser.fftSize = 256;
      source.connect(micPreviewAnalyser);

      // Drive the mic meter from the preview analyser
      micAnalyser = micPreviewAnalyser;
      startMicMeter();
      console.log('[AUDIO DEBUG] startMicPreview — meter active, device:', deviceId || 'default');
    } catch (e) {
      console.warn('[TubePilot RX] Mic preview failed:', e.message);
    }
  }

  function stopMicPreview() {
    if (micPreviewStream) {
      micPreviewStream.getTracks().forEach(t => t.stop());
      micPreviewStream = null;
    }
    if (micPreviewCtx) {
      micPreviewCtx.close().catch(() => {});
      micPreviewCtx = null;
    }
    micPreviewAnalyser = null;
  }

  async function startCamStream() {
    if (camStream) {
      camStream.getTracks().forEach(t => t.stop());
      camStream = null;
      stopMicMeter();
    }

    const constraints = {
      video: true,
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false
      }
    };
    if (cameraSelect.value) {
      constraints.video = { deviceId: { exact: cameraSelect.value } };
    }
    if (micSelect.value) {
      constraints.audio = { ...constraints.audio, deviceId: { exact: micSelect.value } };
    }

    try {
      camStream = await navigator.mediaDevices.getUserMedia(constraints);
      camVideo.srcObject = camStream;
      await camVideo.play();

      // Tear down mic preview — real audio graph takes over
      stopMicPreview();

      // Add mic to audio mix (through compressor) + meter
      console.log('[AUDIO DEBUG] startCamStream — connecting mic audio. audioCtx:', !!audioCtx, ', audioCompressor:', !!audioCompressor, ', audioCtx.state:', audioCtx?.state);
      if (audioCtx && audioCompressor) {
        const micAudioTracks = camStream.getAudioTracks();
        console.log('[AUDIO DEBUG]   mic audio tracks from getUserMedia:', micAudioTracks.length);
        micAudioTracks.forEach((t, i) => console.log(`[AUDIO DEBUG]     mic track[${i}]: label="${t.label}" readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`));
        if (micAudioTracks.length > 0) {
          micSourceNode = audioCtx.createMediaStreamSource(new MediaStream(micAudioTracks));
          micGain = audioCtx.createGain();
          micGain.gain.value = micMuted ? 0 : parseInt(micVolumeSlider.value) / 100;
          micSourceNode.connect(micGain);
          micGain.connect(audioCompressor);
          console.log('[AUDIO DEBUG]   ✓ mic connected to audio graph, gain:', micGain.gain.value, ', muted:', micMuted);

          // Analyser taps raw mic input (before gain) for level meter
          micAnalyser = audioCtx.createAnalyser();
          micAnalyser.fftSize = 256;
          micSourceNode.connect(micAnalyser);
          startMicMeter();
        } else {
          console.warn('[AUDIO DEBUG]   ⚠ NO mic audio tracks from getUserMedia');
        }
      } else {
        console.warn('[AUDIO DEBUG]   ⚠ audioCtx or audioCompressor missing — mic audio NOT connected');
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
    saveStylePrefs();
  });

  micSelect.addEventListener('change', async () => {
    if (!micSelect.value) return;
    // Hot-swap mic if recording stream is active
    if (camStream && camStream.getAudioTracks().length > 0) {
      await swapMicDevice(micSelect.value);
    } else {
      // Preview only — restart mic preview with new device
      startMicPreview(micSelect.value);
    }
  });

  // Refresh devices button (mic)
  const refreshDevicesBtn = document.getElementById('refresh-devices-btn');
  if (refreshDevicesBtn) {
    refreshDevicesBtn.addEventListener('click', async () => {
      console.log('[AUDIO DEBUG] Manual device refresh triggered');
      await loadDevices();
    });
  }

  // Reconnect camera button
  const refreshCameraBtn = document.getElementById('refresh-camera-btn');
  if (refreshCameraBtn) {
    refreshCameraBtn.addEventListener('click', async () => {
      const deviceId = cameraSelect.value;
      if (!deviceId) {
        console.warn('[TubePilot RX] No camera selected to reconnect');
        await loadDevices();
        return;
      }
      console.log('[TubePilot RX] Reconnecting camera:', deviceId);
      refreshCameraBtn.disabled = true;
      refreshCameraBtn.textContent = '...';
      try {
        // Re-enumerate in case device list changed
        await loadDevices();
        // Restart preview (holds stream open for phone acknowledgement)
        await startCamPreview(cameraSelect.value || deviceId);
        // If recording is active, swap into the live stream too
        if (camStream) {
          await swapCamDevice(cameraSelect.value || deviceId);
        }
        console.log('[TubePilot RX] Camera reconnected successfully');
      } catch (e) {
        console.warn('[TubePilot RX] Camera reconnect failed:', e.message);
      } finally {
        refreshCameraBtn.disabled = false;
        refreshCameraBtn.textContent = '\u21BB';
      }
    });
  }

  // Auto-detect device changes (plugging in / removing devices)
  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      console.log('[AUDIO DEBUG] Device change detected — re-enumerating');
      const prevMic = micSelect.value;
      const prevCam = cameraSelect.value;
      await loadDevices();
      // If previously selected device disappeared, loadDevices will have picked a new default
      if (prevMic && micSelect.value !== prevMic) {
        console.log('[AUDIO DEBUG]   Mic device changed:', prevMic, '→', micSelect.value);
      }
      if (prevCam && cameraSelect.value !== prevCam) {
        console.log('[AUDIO DEBUG]   Camera device changed:', prevCam, '→', cameraSelect.value);
      }
    });
  }

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
        audio: {
          deviceId: { exact: deviceId },
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false
        }
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

      // Create new source and reconnect through same gain node + analyser
      if (audioCtx && micGain) {
        micSourceNode = audioCtx.createMediaStreamSource(new MediaStream([newAudioTrack]));
        micSourceNode.connect(micGain);
        // micGain is already connected to audioCompressor — mute state is preserved

        // Reconnect analyser to new source
        if (micAnalyser) micAnalyser.disconnect();
        micAnalyser = audioCtx.createAnalyser();
        micAnalyser.fftSize = 256;
        micSourceNode.connect(micAnalyser);
        startMicMeter();
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

  function applyMaskPostProcessing(tempCtx, w, h) {
    // Dilation: redraw mask shifted in 8 directions (morphological approximation via drawImage)
    if (bgMaskDilation > 0) {
      const d = bgMaskDilation;
      const src = tempCtx.canvas;
      tempCtx.globalCompositeOperation = 'lighter';
      const offsets = [[-d,0],[d,0],[0,-d],[0,d],[-d,-d],[d,-d],[-d,d],[d,d]];
      for (const [ox, oy] of offsets) {
        tempCtx.drawImage(src, ox, oy);
      }
      tempCtx.globalCompositeOperation = 'source-over';
    }
    // Smoothing: apply CSS filter blur to smooth mask edges
    if (bgMaskSmoothing > 0) {
      tempCtx.filter = `blur(${bgMaskSmoothing}px)`;
      tempCtx.globalCompositeOperation = 'copy';
      tempCtx.drawImage(tempCtx.canvas, 0, 0);
      tempCtx.globalCompositeOperation = 'source-over';
      tempCtx.filter = 'none';
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
    applyMaskPostProcessing(tempCtx, pipRect.w, pipRect.h);

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
      applyMaskPostProcessing(tempCtx, pipRect.w, pipRect.h);

      blurCtx.globalCompositeOperation = 'destination-in';
      blurCtx.drawImage(bgTempCanvas, 0, 0);
      blurCtx.globalCompositeOperation = 'source-over';

      // Apply normal mask to sharp webcam (keep only person)
      // Rebuild normal mask on temp
      maskCtx.putImageData(imgData, 0, 0);
      tempCtx.clearRect(0, 0, pipRect.w, pipRect.h);
      tempCtx.drawImage(bgMaskCanvas, 0, 0, pipRect.w, pipRect.h);
      applyMaskPostProcessing(tempCtx, pipRect.w, pipRect.h);

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

      const recView = audioOnlyMode ? RX_VIEWS.VIDEO : recordingView;
      const prevView = audioOnlyMode ? RX_VIEWS.VIDEO : currentView;
      drawCanvas(recordingCtx, recordingCanvas, recView, false);
      drawCanvas(previewCtx, previewCanvas, prevView, true);

      // Document PiP mini preview
      if (pipMiniCtx && pipWindow && !pipWindow.closed) {
        if (pipMiniCanvas.width !== recordingCanvas.width || pipMiniCanvas.height !== recordingCanvas.height) {
          pipMiniCanvas.width = recordingCanvas.width;
          pipMiniCanvas.height = recordingCanvas.height;
        }
        pipMiniCtx.drawImage(recordingCanvas, 0, 0, pipMiniCanvas.width, pipMiniCanvas.height);
      }

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
        // Black background (visible when panels are resized smaller than canvas)
        const vr = calcVidRect(canvas);
        if (!vr.fullCanvas) {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Draw panels in z-order (bottom first, top second)
        const drawVideo = () => drawVideoPanel(ctx, canvas, isPreviewCanvas);
        const drawCam = () => {
          if (camVideo.srcObject && camVideo.readyState >= 2) {
            drawPip(ctx, canvas, isPreviewCanvas);
          }
        };

        if (topPanel === 'webcam') {
          drawVideo();
          drawCam();
        } else {
          drawCam();
          drawVideo();
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

  function drawVideoPanel(ctx, canvas, isPreviewCanvas) {
    if (tabVideo.readyState < 2) return;

    const vr = calcVidRect(canvas);

    if (vr.fullCanvas) {
      // Full canvas — direct drawImage, no clipping overhead
      ctx.drawImage(tabVideo, 0, 0, canvas.width, canvas.height);
    } else {
      // Resized panel — clip to rect, cover-fit video
      ctx.save();
      ctx.beginPath();
      ctx.rect(vr.x, vr.y, vr.w, vr.h);
      ctx.clip();

      const vw = tabVideo.videoWidth || vr.w;
      const vh = tabVideo.videoHeight || vr.h;
      const scale = Math.max(vr.w / vw, vr.h / vh);
      const sw = vw * scale;
      const sh = vh * scale;
      const sx = vr.x + (vr.w - sw) / 2;
      const sy = vr.y + (vr.h - sh) / 2;
      ctx.drawImage(tabVideo, sx, sy, sw, sh);
      ctx.restore();

      // Draw resize handles on preview when selected or hovered
      if (isPreviewCanvas && (vidSelected || vidHovered)) {
        drawVidResizeHandles(ctx, vr);
      }
    }
  }

  function drawVidResizeHandles(ctx, vidRect) {
    const hs = RX_DEFAULTS.resizeHandleSize;
    const corners = [
      { x: vidRect.x, y: vidRect.y },
      { x: vidRect.x + vidRect.w, y: vidRect.y },
      { x: vidRect.x, y: vidRect.y + vidRect.h },
      { x: vidRect.x + vidRect.w, y: vidRect.y + vidRect.h }
    ];
    corners.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, hs / 2, 0, Math.PI * 2);
      ctx.fillStyle = vidSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)';
      ctx.fill();
      ctx.strokeStyle = '#3366ff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
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
    const videoW = Math.floor(w * sbsSplitPercent / 100);
    const camW = w - videoW;

    // Determine which side gets video vs cam
    const videoX = sideBySideSwapped ? camW : 0;
    const camX = sideBySideSwapped ? 0 : videoW;

    // Video portion (cover-fit)
    ctx.save();
    ctx.beginPath();
    ctx.rect(videoX, 0, videoW, h);
    ctx.clip();
    if (tabVideo.readyState >= 2) {
      const vw = tabVideo.videoWidth || videoW;
      const vh = tabVideo.videoHeight || h;
      const scale = Math.max(videoW / vw, h / vh);
      const sw = vw * scale;
      const sh = vh * scale;
      const sx = videoX + (videoW - sw) / 2;
      const sy = (h - sh) / 2;
      ctx.drawImage(tabVideo, sx, sy, sw, sh);
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(videoX, 0, videoW, h);
    }
    ctx.restore();

    // Cam portion (cover-fit)
    ctx.save();
    ctx.beginPath();
    ctx.rect(camX, 0, camW, h);
    ctx.clip();
    if (camVideo.srcObject && camVideo.readyState >= 2) {
      if (bgRemovalEnabled && currentMaskData) {
        drawSideBySideWebcamBgRemoval(ctx, camX, 0, camW, h);
      } else {
        const vw = camVideo.videoWidth || camW;
        const vh = camVideo.videoHeight || h;
        const scale = Math.max(camW / vw, h / vh);
        const sw = vw * scale;
        const sh = vh * scale;
        if (camMirrored) {
          ctx.translate(camX + camW, 0);
          ctx.scale(-1, 1);
          const sx = (camW - sw) / 2;
          const sy = (h - sh) / 2;
          ctx.drawImage(camVideo, sx, sy, sw, sh);
        } else {
          const sx = camX + (camW - sw) / 2;
          const sy = (h - sh) / 2;
          ctx.drawImage(camVideo, sx, sy, sw, sh);
        }
      }
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(camX, 0, camW, h);
    }
    ctx.restore();

    // Divider line
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const dividerX = sideBySideSwapped ? camW : videoW;
    ctx.moveTo(dividerX, 0);
    ctx.lineTo(dividerX, h);
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
    applyMaskPostProcessing(tempCtx, rw, rh);

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
      applyMaskPostProcessing(tempCtx, rw, rh);

      blurCtx.globalCompositeOperation = 'destination-in';
      blurCtx.drawImage(bgTempCanvas, 0, 0);
      blurCtx.globalCompositeOperation = 'source-over';

      // Rebuild normal mask
      maskCtx.putImageData(imgData, 0, 0);
      tempCtx.clearRect(0, 0, rw, rh);
      tempCtx.drawImage(bgMaskCanvas, 0, 0, rw, rh);
      applyMaskPostProcessing(tempCtx, rw, rh);

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

  function calcVidRect(canvas) {
    // Full canvas mode (default)
    if (vidSizePercent >= 100 && vidX === null && vidY === null) {
      return { x: 0, y: 0, w: canvas.width, h: canvas.height, fullCanvas: true };
    }

    const pct = Math.min(vidSizePercent, 100);
    const vidW = Math.round(canvas.width * (pct / 100));
    const vidH = Math.round(vidW * (9 / 16)); // always 16:9

    // Default position: centered
    if (vidX === null || vidY === null) {
      vidX = (canvas.width - vidW) / 2;
      vidY = (canvas.height - vidH) / 2;
    }

    // Clamp to canvas bounds
    const x = Math.max(0, Math.min(vidX, canvas.width - vidW));
    const y = Math.max(0, Math.min(vidY, canvas.height - vidH));

    return { x, y, w: vidW, h: vidH, fullCanvas: false };
  }

  function resetVidToFullCanvas() {
    vidX = null;
    vidY = null;
    vidSizePercent = 100;
    vidSelected = false;
    vidHovered = false;
    vidDragging = false;
    vidResizing = false;
    vidResizeCorner = null;
    topPanel = 'webcam';
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

  function hitTestVid(cx, cy, canvas) {
    const vr = calcVidRect(canvas);
    if (vr.fullCanvas) return false; // not interactive when full canvas
    return cx >= vr.x && cx <= vr.x + vr.w && cy >= vr.y && cy <= vr.y + vr.h;
  }

  function hitTestVidResizeHandle(cx, cy, canvas) {
    if (!vidSelected) return null;
    const vr = calcVidRect(canvas);
    if (vr.fullCanvas) return null;
    const hs = RX_DEFAULTS.resizeHandleSize;
    const corners = [
      { name: 'tl', x: vr.x, y: vr.y },
      { name: 'tr', x: vr.x + vr.w, y: vr.y },
      { name: 'bl', x: vr.x, y: vr.y + vr.h },
      { name: 'br', x: vr.x + vr.w, y: vr.y + vr.h }
    ];
    for (const c of corners) {
      const dx = cx - c.x;
      const dy = cy - c.y;
      if (dx * dx + dy * dy <= (hs / 2 + 4) * (hs / 2 + 4)) return c.name;
    }
    return null;
  }

  function resizeVidFromCorner(mx, my, canvas) {
    const vr = calcVidRect(canvas);
    const minPct = RX_DEFAULTS.vidMinSize;
    const maxPct = RX_DEFAULTS.vidMaxSize;

    // Anchor is opposite corner
    let anchorX, anchorY;
    switch (vidResizeCorner) {
      case 'tl': anchorX = vr.x + vr.w; anchorY = vr.y + vr.h; break;
      case 'tr': anchorX = vr.x;         anchorY = vr.y + vr.h; break;
      case 'bl': anchorX = vr.x + vr.w; anchorY = vr.y;         break;
      case 'br': anchorX = vr.x;         anchorY = vr.y;         break;
    }

    // Compute new width from mouse distance to anchor
    const dx = Math.abs(mx - anchorX);
    let newPct = (dx / canvas.width) * 100;
    newPct = Math.max(minPct, Math.min(maxPct, newPct));

    vidSizePercent = Math.round(newPct);

    // Recompute dimensions
    const newW = Math.round(canvas.width * (vidSizePercent / 100));
    const newH = Math.round(newW * (9 / 16));

    // Position from anchor
    if (vidResizeCorner === 'tl' || vidResizeCorner === 'bl') {
      vidX = anchorX - newW;
    } else {
      vidX = anchorX;
    }
    if (vidResizeCorner === 'tl' || vidResizeCorner === 'tr') {
      vidY = anchorY - newH;
    } else {
      vidY = anchorY;
    }

    // Sync video size slider UI
    const vidSlider = document.getElementById('style-vid-size-slider');
    const vidValue = document.getElementById('style-vid-size-value');
    if (vidSlider) vidSlider.value = vidSizePercent;
    if (vidValue) vidValue.textContent = vidSizePercent + '%';
  }

  // ============================================================
  // (c3) Mouse event system (drag / resize)
  // ============================================================

  previewCanvas.addEventListener('mousedown', (e) => {
    if (currentView !== RX_VIEWS.FINAL) return;
    if (currentLayout !== RX_LAYOUTS.PIP) return;
    const { x, y } = canvasCoordsFromEvent(e, previewCanvas);
    const resizeCursors = { tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize' };

    // Check resize handles for BOTH panels (top panel first)
    const topIsWebcam = topPanel === 'webcam';

    // Top panel resize handles
    if (topIsWebcam) {
      const pipHandle = hitTestResizeHandle(x, y, previewCanvas);
      if (pipHandle) {
        pipResizing = true;
        pipResizeCorner = pipHandle;
        e.preventDefault();
        return;
      }
    } else {
      const vidHandle = hitTestVidResizeHandle(x, y, previewCanvas);
      if (vidHandle) {
        vidResizing = true;
        vidResizeCorner = vidHandle;
        e.preventDefault();
        return;
      }
    }

    // Bottom panel resize handles
    if (topIsWebcam) {
      const vidHandle = hitTestVidResizeHandle(x, y, previewCanvas);
      if (vidHandle) {
        vidResizing = true;
        vidResizeCorner = vidHandle;
        e.preventDefault();
        return;
      }
    } else {
      const pipHandle = hitTestResizeHandle(x, y, previewCanvas);
      if (pipHandle) {
        pipResizing = true;
        pipResizeCorner = pipHandle;
        e.preventDefault();
        return;
      }
    }

    // Hit-test panels in z-order (top panel first)
    const panels = topIsWebcam ? ['pip', 'vid'] : ['vid', 'pip'];
    for (const panel of panels) {
      if (panel === 'pip' && hitTestPip(x, y, previewCanvas)) {
        const pr = calcPipRect(previewCanvas);
        pipSelected = true;
        vidSelected = false;
        pipDragging = true;
        pipDragOffsetX = x - pr.x;
        pipDragOffsetY = y - pr.y;
        topPanel = 'webcam';
        previewCanvas.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }
      if (panel === 'vid' && hitTestVid(x, y, previewCanvas)) {
        const vr = calcVidRect(previewCanvas);
        vidSelected = true;
        pipSelected = false;
        vidDragging = true;
        vidDragOffsetX = x - vr.x;
        vidDragOffsetY = y - vr.y;
        topPanel = 'video';
        previewCanvas.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }
    }

    // Click outside — deselect both
    pipSelected = false;
    pipHovered = false;
    vidSelected = false;
    vidHovered = false;
  });

  previewCanvas.addEventListener('mousemove', (e) => {
    if (currentView !== RX_VIEWS.FINAL) return;
    const { x, y } = canvasCoordsFromEvent(e, previewCanvas);

    // Active drag/resize — PiP
    if (pipDragging) {
      pipX = x - pipDragOffsetX;
      pipY = y - pipDragOffsetY;
      const pr = calcPipRect(previewCanvas);
      pipX = pr.x;
      pipY = pr.y;
      return;
    }
    if (pipResizing) {
      resizePipFromCorner(x, y, previewCanvas);
      return;
    }

    // Active drag/resize — Video
    if (vidDragging) {
      vidX = x - vidDragOffsetX;
      vidY = y - vidDragOffsetY;
      const vr = calcVidRect(previewCanvas);
      vidX = vr.x;
      vidY = vr.y;
      return;
    }
    if (vidResizing) {
      resizeVidFromCorner(x, y, previewCanvas);
      return;
    }

    // Hover detection in z-order (top panel first)
    const resizeCursors = { tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize' };
    const topIsWebcam = topPanel === 'webcam';

    // Check top panel first
    if (topIsWebcam) {
      const pipHandle = hitTestResizeHandle(x, y, previewCanvas);
      if (pipHandle) {
        pipHovered = true;
        vidHovered = false;
        previewCanvas.style.cursor = resizeCursors[pipHandle];
        return;
      }
      if (hitTestPip(x, y, previewCanvas)) {
        pipHovered = true;
        vidHovered = false;
        previewCanvas.style.cursor = 'grab';
        return;
      }
    } else {
      const vidHandle = hitTestVidResizeHandle(x, y, previewCanvas);
      if (vidHandle) {
        vidHovered = true;
        pipHovered = false;
        previewCanvas.style.cursor = resizeCursors[vidHandle];
        return;
      }
      if (hitTestVid(x, y, previewCanvas)) {
        vidHovered = true;
        pipHovered = false;
        previewCanvas.style.cursor = 'grab';
        return;
      }
    }

    // Check bottom panel
    if (topIsWebcam) {
      const vidHandle = hitTestVidResizeHandle(x, y, previewCanvas);
      if (vidHandle) {
        vidHovered = true;
        pipHovered = false;
        previewCanvas.style.cursor = resizeCursors[vidHandle];
        return;
      }
      if (hitTestVid(x, y, previewCanvas)) {
        vidHovered = true;
        pipHovered = false;
        previewCanvas.style.cursor = 'grab';
        return;
      }
    } else {
      const pipHandle = hitTestResizeHandle(x, y, previewCanvas);
      if (pipHandle) {
        pipHovered = true;
        vidHovered = false;
        previewCanvas.style.cursor = resizeCursors[pipHandle];
        return;
      }
      if (hitTestPip(x, y, previewCanvas)) {
        pipHovered = true;
        vidHovered = false;
        previewCanvas.style.cursor = 'grab';
        return;
      }
    }

    // Nothing hit
    pipHovered = false;
    vidHovered = false;
    previewCanvas.style.cursor = 'default';
  });

  previewCanvas.addEventListener('mouseup', (e) => {
    if (pipDragging || pipResizing || vidDragging || vidResizing) {
      clearActivePreset();
    }
    pipDragging = false;
    pipResizing = false;
    pipResizeCorner = null;
    vidDragging = false;
    vidResizing = false;
    vidResizeCorner = null;
    if (pipHovered || vidHovered) {
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
    vidDragging = false;
    vidResizing = false;
    vidResizeCorner = null;
    vidHovered = false;
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
    console.log('[AUDIO DEBUG] setupAudioMixing() called');
    if (audioCtx) {
      console.log('[AUDIO DEBUG]   closing previous AudioContext (state was:', audioCtx.state, ')');
      audioCtx.close().catch(() => {});
    }

    audioCtx = new AudioContext({ sampleRate: 48000 });
    console.log('[AUDIO DEBUG]   new AudioContext created — state:', audioCtx.state);
    audioCtx.onstatechange = () => console.log('[AUDIO DEBUG]   AudioContext state changed →', audioCtx.state);

    audioDest = audioCtx.createMediaStreamDestination();
    audioDest.channelCount = 2;

    // Compressor prevents clipping when tab + mic are summed
    audioCompressor = audioCtx.createDynamicsCompressor();
    audioCompressor.threshold.value = audioDevCompressor.threshold;
    audioCompressor.knee.value = audioDevCompressor.knee;
    audioCompressor.ratio.value = audioDevCompressor.ratio;
    audioCompressor.attack.value = audioDevCompressor.attack;
    audioCompressor.release.value = audioDevCompressor.release;

    if (audioDevBypassCompressor) {
      audioCompressor.threshold.value = 0;
      audioCompressor.ratio.value = 1;
    }
    audioCompressor.connect(audioDest);

    // Peak analyser for clipping detection (dev tools)
    audioDevPeakAnalyser = audioCtx.createAnalyser();
    audioDevPeakAnalyser.fftSize = 2048;
    audioCompressor.connect(audioDevPeakAnalyser);

    // Tab audio
    const tabAudioTracks = tabStream?.getAudioTracks();
    console.log('[AUDIO DEBUG]   tabStream audio tracks available:', tabAudioTracks?.length ?? 'N/A (no tabStream)');
    if (tabAudioTracks && tabAudioTracks.length > 0) {
      tabAudioTracks.forEach((t, i) => console.log(`[AUDIO DEBUG]     tab audio[${i}]: readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`));
      const tabSource = audioCtx.createMediaStreamSource(new MediaStream(tabAudioTracks));
      tabGain = audioCtx.createGain();
      tabGain.gain.value = parseInt(tabVolumeSlider.value) / 100;
      tabSource.connect(tabGain);
      tabGain.connect(audioCompressor);
      console.log('[AUDIO DEBUG]   ✓ tab audio connected to graph, gain:', tabGain.gain.value);
    } else {
      console.warn('[AUDIO DEBUG]   ⚠ NO tab audio tracks — tab audio will be silent');
    }

    // Reconnect mic if camStream already has audio (e.g. after screen capture rebuilds graph)
    const existingMicTracks = camStream?.getAudioTracks();
    if (existingMicTracks && existingMicTracks.length > 0 && audioCompressor) {
      console.log('[AUDIO DEBUG]   reconnecting existing mic to new graph (' + existingMicTracks.length + ' tracks)');
      if (micSourceNode) { try { micSourceNode.disconnect(); } catch {} }
      micSourceNode = audioCtx.createMediaStreamSource(new MediaStream(existingMicTracks));
      micGain = audioCtx.createGain();
      micGain.gain.value = micMuted ? 0 : parseInt(micVolumeSlider.value) / 100;
      micSourceNode.connect(micGain);
      micGain.connect(audioCompressor);

      // Reconnect analyser for mic meter
      if (micAnalyser) { try { micAnalyser.disconnect(); } catch {} }
      micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 256;
      micSourceNode.connect(micAnalyser);
      startMicMeter();
      console.log('[AUDIO DEBUG]   ✓ mic reconnected to new graph, gain:', micGain.gain.value, ', muted:', micMuted);
    }

    console.log('[AUDIO DEBUG]   audioDest tracks after setup:', audioDest.stream.getAudioTracks().length,
      ', AudioContext final state:', audioCtx.state);

    // Reconnect music if musicStream has audio
    if (musicStream && musicStream.getAudioTracks().length > 0) {
      connectMusicToGraph();
      console.log('[AUDIO DEBUG]   ✓ music reconnected to new graph');
    }
  }

  // --- Background music ---

  function connectMusicToGraph() {
    if (!musicStream || !audioCtx) return;

    // Disconnect previous
    if (musicSourceNode) { try { musicSourceNode.disconnect(); } catch {} }
    if (musicGain) { try { musicGain.disconnect(); } catch {} }

    const audioTracks = musicStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    musicSourceNode = audioCtx.createMediaStreamSource(new MediaStream(audioTracks));
    musicGain = audioCtx.createGain();
    musicGain.gain.value = musicMuted ? 0 : parseInt(musicVolumeSlider.value) / 100;

    musicSourceNode.connect(musicGain);
    // Route 1: into compressor → audioDest (for recording)
    musicGain.connect(audioCompressor);
    // Route 2: to speakers (because source tab is muted)
    musicGain.connect(audioCtx.destination);

    console.log('[MUSIC] Connected to audio graph, gain:', musicGain.gain.value);
  }

  function showMusicTabPicker() {
    return new Promise(async (resolve) => {
      const tabs = await chrome.tabs.query({});
      const reactionsTab = await chrome.tabs.getCurrent();
      const eligible = tabs.filter(t =>
        t.id !== reactionsTab?.id &&
        !t.url?.startsWith('chrome://') &&
        !t.url?.startsWith('chrome-extension://')
      );

      // Build inline picker
      const row = document.createElement('div');
      row.className = 'music-picker-row';

      const select = document.createElement('select');
      select.className = 'music-tab-select';
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = 'Select a tab...';
      select.appendChild(defaultOpt);

      eligible.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        const title = (t.title || 'Tab ' + t.id);
        opt.textContent = (title.length > 45 ? title.substring(0, 42) + '...' : title) + (t.audible ? ' \uD83D\uDD0A' : '');
        select.appendChild(opt);
      });

      const shareBtn = document.createElement('button');
      shareBtn.className = 'btn btn-sm btn-primary';
      shareBtn.textContent = 'Share';
      shareBtn.disabled = true;

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-sm';
      cancelBtn.textContent = 'Cancel';

      select.addEventListener('change', () => { shareBtn.disabled = !select.value; });

      row.appendChild(select);
      row.appendChild(shareBtn);
      row.appendChild(cancelBtn);

      musicCaptureBtn.style.display = 'none';
      musicCaptureRow.appendChild(row);

      function cleanup() {
        row.remove();
        musicCaptureBtn.style.display = '';
      }

      shareBtn.addEventListener('click', () => {
        const tabId = parseInt(select.value);
        cleanup();
        resolve(tabId || null);
      });

      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });
    });
  }

  async function startMusicCapture() {
    try {
      // 1. Show tab picker dropdown
      const selectedTabId = await showMusicTabPicker();
      if (!selectedTabId) return;

      // 2. Mute the tab BEFORE capture (critical timing — prevents echo)
      console.log('[MUSIC] Muting tab', selectedTabId);
      await chrome.tabs.update(selectedTabId, { muted: true });
      musicTabId = selectedTabId;

      // 3. Brief pause, bring focus back for getDisplayMedia picker
      await new Promise(r => setTimeout(r, 200));
      const thisTab = await chrome.tabs.getCurrent();
      if (thisTab) await chrome.tabs.update(thisTab.id, { active: true });
      await new Promise(r => setTimeout(r, 200));

      // 4. getDisplayMedia — user shares the same tab they selected
      console.log('[MUSIC] Starting getDisplayMedia...');
      musicStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false },
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude'
      });

      // Discard video track (we only need audio)
      musicStream.getVideoTracks().forEach(t => t.stop());

      const audioTracks = musicStream.getAudioTracks();
      console.log('[MUSIC] Audio tracks:', audioTracks.length);
      if (audioTracks.length === 0) {
        console.warn('[MUSIC] No audio tracks — user may not have checked "Share tab audio"');
        await stopMusicCapture();
        return;
      }

      // 5. Connect to audio graph if it exists
      if (audioCtx && audioCompressor) {
        connectMusicToGraph();
      }

      // 6. Show music volume UI
      musicRow.classList.remove('hidden');
      musicCaptureBtn.textContent = '\uD83C\uDFB5 Change Music';

      // 7. Handle stream end
      audioTracks[0].addEventListener('ended', handleMusicEnded);

      console.log('[MUSIC] Background music capture started');
    } catch (err) {
      console.log('[MUSIC] Capture cancelled or failed:', err.message);
      // Unmute tab if capture failed
      if (musicTabId) {
        chrome.tabs.update(musicTabId, { muted: false }).catch(() => {});
        musicTabId = null;
      }
      if (musicStream) {
        musicStream.getTracks().forEach(t => t.stop());
        musicStream = null;
      }
    }
  }

  async function stopMusicCapture() {
    // Disconnect audio nodes
    if (musicSourceNode) { try { musicSourceNode.disconnect(); } catch {} musicSourceNode = null; }
    if (musicGain) { try { musicGain.disconnect(); } catch {} musicGain = null; }

    // Stop the stream
    if (musicStream) {
      musicStream.getTracks().forEach(t => t.stop());
      musicStream = null;
    }

    // Unmute the source tab
    if (musicTabId) {
      await chrome.tabs.update(musicTabId, { muted: false }).catch(() => {});
      musicTabId = null;
    }

    // Reset UI
    musicRow.classList.add('hidden');
    musicMuted = false;
    musicMuteBtn.classList.remove('muted');
    musicMuteBtn.innerHTML = '\uD83D\uDD0A';
    musicVolumeSlider.value = 50;
    musicVolumeValue.textContent = '50%';
    musicCaptureBtn.textContent = '\uD83C\uDFB5 Add Background Music';

    console.log('[MUSIC] Stopped');
  }

  function handleMusicEnded() {
    console.log('[MUSIC] Stream ended (user stopped sharing or tab closed)');
    stopMusicCapture();
  }

  // --- Mic level meter ---

  const micMeterFill = document.getElementById('mic-meter-fill');
  const micMeterLabel = document.getElementById('mic-meter-label');

  function startMicMeter() {
    if (micMeterRaf) cancelAnimationFrame(micMeterRaf);
    if (!micAnalyser) return;

    const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);

    function tick() {
      micAnalyser.getByteTimeDomainData(dataArray);

      // Compute RMS level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const pct = Math.min(100, Math.round(rms * 300)); // scale up for visibility

      if (micMeterFill) micMeterFill.style.width = pct + '%';
      if (micMeterLabel) micMeterLabel.textContent = pct > 0 ? pct + '%' : '--';

      micMeterRaf = requestAnimationFrame(tick);
    }
    tick();
  }

  function stopMicMeter() {
    if (micMeterRaf) {
      cancelAnimationFrame(micMeterRaf);
      micMeterRaf = null;
    }
    if (micMeterFill) micMeterFill.style.width = '0%';
    if (micMeterLabel) micMeterLabel.textContent = '--';
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
    syncPipState();
  });

  // Music volume / mute / capture / stop
  musicVolumeSlider.addEventListener('input', () => {
    const val = parseInt(musicVolumeSlider.value) / 100;
    musicVolumeValue.textContent = musicVolumeSlider.value + '%';
    if (musicMuted) {
      savedMusicGain = val;
    } else {
      if (musicGain) musicGain.gain.value = val;
    }
  });

  musicMuteBtn.addEventListener('click', () => {
    musicMuted = !musicMuted;
    if (musicMuted) {
      savedMusicGain = musicGain ? musicGain.gain.value : parseInt(musicVolumeSlider.value) / 100;
      if (musicGain) musicGain.gain.value = 0;
      musicMuteBtn.classList.add('muted');
      musicMuteBtn.innerHTML = '\uD83D\uDD07';
      musicMuteBtn.title = 'Unmute music';
    } else {
      if (musicGain) musicGain.gain.value = savedMusicGain;
      musicMuteBtn.classList.remove('muted');
      musicMuteBtn.innerHTML = '\uD83D\uDD0A';
      musicMuteBtn.title = 'Mute music';
    }
  });

  musicCaptureBtn.addEventListener('click', () => startMusicCapture());
  stopMusicBtn.addEventListener('click', () => stopMusicCapture());

  // ============================================================
  // Audio Dev Tools
  // ============================================================

  function applyCompressorParams() {
    if (!audioCompressor) return;
    if (audioDevBypassCompressor) {
      audioCompressor.threshold.value = 0;
      audioCompressor.ratio.value = 1;
    } else {
      audioCompressor.threshold.value = audioDevCompressor.threshold;
      audioCompressor.knee.value = audioDevCompressor.knee;
      audioCompressor.ratio.value = audioDevCompressor.ratio;
      audioCompressor.attack.value = audioDevCompressor.attack;
      audioCompressor.release.value = audioDevCompressor.release;
    }
  }

  function startAudioPeakMeter() {
    if (audioDevPeakRaf) cancelAnimationFrame(audioDevPeakRaf);
    const fillEl = document.getElementById('audio-dev-clip-fill');
    const peakEl = document.getElementById('audio-dev-clip');
    const ctxEl = document.getElementById('audio-dev-ctx-state');
    const srEl = document.getElementById('audio-dev-sample-rate');
    let peakHold = 0;
    let peakDecay = 0;
    let lastStatsUpdate = 0;

    function tick() {
      audioDevPeakRaf = requestAnimationFrame(tick);
      if (!audioDevPanelOpen) return;

      if (audioDevPeakAnalyser) {
        const buf = new Float32Array(audioDevPeakAnalyser.fftSize);
        audioDevPeakAnalyser.getFloatTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const abs = Math.abs(buf[i]);
          if (abs > peak) peak = abs;
        }

        // Peak hold with decay
        if (peak > peakHold) peakHold = peak;
        else peakHold *= 0.995;
        peakDecay = peakHold;

        const pct = Math.min(peakDecay * 100, 100);
        if (fillEl) fillEl.style.width = pct + '%';
        if (peakDecay > 0.95 && fillEl) fillEl.style.background = '#ef4444';
        else if (fillEl) fillEl.style.background = '';
      }

      // Throttled stats update (4Hz)
      const now = performance.now();
      if (now - lastStatsUpdate > 250) {
        lastStatsUpdate = now;
        const dB = peakDecay > 0 ? (20 * Math.log10(peakDecay)).toFixed(1) : '-inf';
        if (peakEl) peakEl.textContent = `Peak: ${dB}dB`;
        if (peakDecay > 0.95 && peakEl) peakEl.style.color = '#ef4444';
        else if (peakEl) peakEl.style.color = '';
        if (ctxEl) ctxEl.textContent = `Ctx: ${audioCtx?.state ?? 'none'}`;
        if (srEl) srEl.textContent = `SR: ${audioCtx?.sampleRate ?? '--'}`;
      }
    }
    tick();
  }

  function stopAudioPeakMeter() {
    if (audioDevPeakRaf) { cancelAnimationFrame(audioDevPeakRaf); audioDevPeakRaf = null; }
  }

  // Panel toggle
  const audioDevToggle = document.getElementById('audio-dev-toggle');
  const audioDevBody = document.getElementById('audio-dev-body');
  const audioDevChevron = document.getElementById('audio-dev-chevron');
  if (audioDevToggle) {
    audioDevToggle.addEventListener('click', () => {
      audioDevPanelOpen = !audioDevPanelOpen;
      if (audioDevBody) audioDevBody.classList.toggle('hidden', !audioDevPanelOpen);
      if (audioDevChevron) audioDevChevron.classList.toggle('open', audioDevPanelOpen);
      if (audioDevPanelOpen) startAudioPeakMeter();
      else stopAudioPeakMeter();
    });
  }

  // Bypass compressor
  const bypassEl = document.getElementById('audio-dev-bypass-compressor');
  if (bypassEl) {
    bypassEl.addEventListener('change', () => {
      audioDevBypassCompressor = bypassEl.checked;
      applyCompressorParams();
    });
  }

  // Compressor sliders
  const compSliders = [
    { id: 'audio-dev-threshold', valId: 'audio-dev-threshold-val', prop: 'threshold', unit: 'dB', mult: 1 },
    { id: 'audio-dev-knee', valId: 'audio-dev-knee-val', prop: 'knee', unit: 'dB', mult: 1 },
    { id: 'audio-dev-ratio', valId: 'audio-dev-ratio-val', prop: 'ratio', unit: ':1', mult: 1 },
    { id: 'audio-dev-attack', valId: 'audio-dev-attack-val', prop: 'attack', unit: 'ms', mult: 0.001 },
    { id: 'audio-dev-release', valId: 'audio-dev-release-val', prop: 'release', unit: 'ms', mult: 0.001 }
  ];
  for (const s of compSliders) {
    const el = document.getElementById(s.id);
    const valEl = document.getElementById(s.valId);
    if (el) {
      el.addEventListener('input', () => {
        const raw = parseFloat(el.value);
        audioDevCompressor[s.prop] = raw * s.mult;
        if (valEl) valEl.textContent = raw + s.unit;
        applyCompressorParams();
      });
    }
  }

  // Bitrate selector
  const bitrateEl = document.getElementById('audio-dev-bitrate');
  if (bitrateEl) {
    bitrateEl.addEventListener('change', () => {
      audioDevBitrate = parseInt(bitrateEl.value);
    });
  }

  // Reset defaults
  const audioDevResetBtn = document.getElementById('audio-dev-reset-btn');
  if (audioDevResetBtn) {
    audioDevResetBtn.addEventListener('click', () => {
      audioDevBypassCompressor = false;
      audioDevCompressor = { threshold: -12, knee: 10, ratio: 2, attack: 0.005, release: 0.2 };
      audioDevBitrate = 128000;

      if (bypassEl) bypassEl.checked = false;
      if (bitrateEl) bitrateEl.value = '128000';

      const syncSlider = (id, valId, value, display) => {
        const sl = document.getElementById(id);
        const vl = document.getElementById(valId);
        if (sl) sl.value = value;
        if (vl) vl.textContent = display;
      };
      syncSlider('audio-dev-threshold', 'audio-dev-threshold-val', -12, '-12dB');
      syncSlider('audio-dev-knee', 'audio-dev-knee-val', 10, '10dB');
      syncSlider('audio-dev-ratio', 'audio-dev-ratio-val', 2, '2:1');
      syncSlider('audio-dev-attack', 'audio-dev-attack-val', 5, '5ms');
      syncSlider('audio-dev-release', 'audio-dev-release-val', 200, '200ms');

      applyCompressorParams();
    });
  }

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

    // [AUDIO DEBUG] Comprehensive state dump before recording
    console.log('[AUDIO DEBUG] === RECORDING START — AUDIO STATE DUMP ===');
    console.log('[AUDIO DEBUG]   AudioContext state:', audioCtx?.state ?? 'NO audioCtx');
    console.log('[AUDIO DEBUG]   audioDest exists:', !!audioDest);
    console.log('[AUDIO DEBUG]   audioDest audio tracks:', audioTracks.length);
    audioTracks.forEach((t, i) => console.log(`[AUDIO DEBUG]     dest track[${i}]: readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`));
    console.log('[AUDIO DEBUG]   tabStream exists:', !!tabStream);
    const _dbgTabAT = tabStream?.getAudioTracks() || [];
    console.log('[AUDIO DEBUG]   tabStream audio tracks:', _dbgTabAT.length);
    _dbgTabAT.forEach((t, i) => console.log(`[AUDIO DEBUG]     tab src track[${i}]: readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`));
    console.log('[AUDIO DEBUG]   camStream exists:', !!camStream);
    const _dbgMicAT = camStream?.getAudioTracks() || [];
    console.log('[AUDIO DEBUG]   camStream audio tracks:', _dbgMicAT.length);
    _dbgMicAT.forEach((t, i) => console.log(`[AUDIO DEBUG]     mic src track[${i}]: readyState=${t.readyState} enabled=${t.enabled} muted=${t.muted}`));
    console.log('[AUDIO DEBUG]   tabGain value:', tabGain?.gain?.value ?? 'N/A');
    console.log('[AUDIO DEBUG]   micGain value:', micGain?.gain?.value ?? 'N/A', ', micMuted:', micMuted);
    console.log('[AUDIO DEBUG]   canvasStream video tracks:', canvasStream.getVideoTracks().length);
    if (audioTracks.length === 0) console.error('[AUDIO DEBUG]   ❌ RECORDING WILL HAVE NO AUDIO — audioDest has 0 tracks');
    if (audioCtx?.state === 'suspended') console.error('[AUDIO DEBUG]   ❌ AudioContext is SUSPENDED — audio pipeline is frozen');
    console.log('[AUDIO DEBUG] === END AUDIO STATE DUMP ===');

    composedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioTracks
    ]);

    // Start MediaRecorder
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';

    console.log('[AUDIO DEBUG]   composedStream tracks — video:', composedStream.getVideoTracks().length, ', audio:', composedStream.getAudioTracks().length, ', mimeType:', mimeType);

    mediaRecorder = new MediaRecorder(composedStream, {
      mimeType,
      videoBitsPerSecond: RX_DEFAULTS.videoBitrate,
      audioBitsPerSecond: audioDevBitrate
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

    // Pause the YouTube video
    chrome.runtime.sendMessage({ type: RX_MESSAGES.PAUSE_VIDEO }).catch(() => {});
    playerPlaying = false;
    playPauseBtn.innerHTML = '&#x25B6;';

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
  // Document PiP popout
  // ============================================================

  async function openPipPopout() {
    if (!('documentPictureInPicture' in window)) return;
    if (pipWindow && !pipWindow.closed) return;

    pipWindow = await documentPictureInPicture.requestWindow({
      width: 400,
      height: 280
    });

    const doc = pipWindow.document;
    doc.head.innerHTML = `<style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        background: #1a1a1a; color: #f1f1f1; font-family: system-ui, sans-serif;
        display: flex; flex-direction: column; height: 100vh; overflow: hidden;
      }
      .pip-preview { flex: 1; position: relative; background: #000; min-height: 0; }
      .pip-preview canvas { width: 100%; height: 100%; display: block; object-fit: contain; }
      .pip-status {
        position: absolute; top: 8px; left: 8px;
        display: flex; align-items: center; gap: 5px;
        font-size: 11px; font-weight: 700;
        background: rgba(0,0,0,0.6); padding: 3px 8px; border-radius: 4px;
      }
      .pip-dot {
        width: 8px; height: 8px; border-radius: 50%; background: #cc0000;
        animation: pulse 1.2s ease-in-out infinite;
      }
      .pip-dot.paused { background: #e6a700; animation: none; }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      .pip-timer {
        position: absolute; top: 8px; right: 8px;
        font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums;
        background: rgba(0,0,0,0.6); padding: 3px 8px; border-radius: 4px;
      }
      .pip-controls {
        display: flex; gap: 6px; padding: 8px; background: #202020;
        justify-content: center; flex-shrink: 0;
      }
      .pip-btn {
        padding: 5px 12px; border: 1px solid #4a4a4a; border-radius: 5px;
        background: #3f3f3f; color: #f1f1f1; font-size: 12px; font-weight: 600;
        font-family: inherit; cursor: pointer; transition: background 0.15s;
      }
      .pip-btn:hover { background: #4a4a4a; }
      .pip-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .pip-btn.pip-stop { color: #ff4444; border-color: #5a2d2d; }
      .pip-btn.pip-stop:hover { background: #4a3030; }
      .pip-btn.pip-end-capture { color: #ff4444; border-color: #5a2d2d; }
      .pip-btn.pip-end-capture:hover { background: #4a3030; }
      .pip-btn.pip-mute.muted { background: #cc0000; border-color: #cc0000; color: white; }
    </style>`;

    doc.body.innerHTML = `
      <div class="pip-preview">
        <canvas id="pip-canvas" width="640" height="360"></canvas>
        <div class="pip-status">
          <div class="pip-dot" id="pip-dot"></div>
          <span id="pip-status-label">REC</span>
        </div>
        <div class="pip-timer" id="pip-timer">${formatRecTime(timerSeconds)}</div>
      </div>
      <div class="pip-controls">
        <button class="pip-btn" id="pip-pause-btn">${currentState === RX_STATES.PAUSED ? 'Resume' : 'Pause'}</button>
        <button class="pip-btn pip-stop" id="pip-stop-btn">Stop</button>
        <button class="pip-btn pip-end-capture" id="pip-end-capture-btn" style="display:${screenCaptureMode ? '' : 'none'}">End Capture</button>
        <button class="pip-btn pip-mute${micMuted ? ' muted' : ''}" id="pip-mute-btn">${micMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}</button>
      </div>`;

    pipMiniCanvas = doc.getElementById('pip-canvas');
    pipMiniCtx = pipMiniCanvas.getContext('2d');
    pipMiniTimerEl = doc.getElementById('pip-timer');
    pipMiniDotEl = doc.getElementById('pip-dot');
    pipMiniStatusEl = doc.getElementById('pip-status-label');

    // Delegate controls to parent page
    doc.getElementById('pip-pause-btn').addEventListener('click', () => pauseBtn.click());
    doc.getElementById('pip-stop-btn').addEventListener('click', () => stopBtn.click());
    doc.getElementById('pip-end-capture-btn').addEventListener('click', () => stopScreenCaptureBtn.click());
    doc.getElementById('pip-mute-btn').addEventListener('click', () => micMuteBtn.click());

    pipWindow.addEventListener('pagehide', () => closePipPopout());

    popoutBtn.textContent = 'Pop In';
    syncPipState();
  }

  function closePipPopout() {
    if (pipWindow && !pipWindow.closed) pipWindow.close();
    pipWindow = null;
    pipMiniCanvas = null;
    pipMiniCtx = null;
    pipMiniTimerEl = null;
    pipMiniDotEl = null;
    pipMiniStatusEl = null;
    popoutBtn.textContent = 'Pop Out';
  }

  function syncPipState() {
    if (!pipWindow || pipWindow.closed) return;
    const doc = pipWindow.document;

    // Pause/Resume text
    const pauseEl = doc.getElementById('pip-pause-btn');
    if (pauseEl) {
      pauseEl.textContent = currentState === RX_STATES.PAUSED ? 'Resume' : 'Pause';
      pauseEl.disabled = currentState !== RX_STATES.RECORDING && currentState !== RX_STATES.PAUSED;
    }

    // Stop disabled
    const stopEl = doc.getElementById('pip-stop-btn');
    if (stopEl) stopEl.disabled = currentState !== RX_STATES.RECORDING && currentState !== RX_STATES.PAUSED;

    // End Capture visibility
    const endCap = doc.getElementById('pip-end-capture-btn');
    if (endCap) endCap.style.display = screenCaptureMode ? '' : 'none';

    // Status dot
    if (pipMiniDotEl) {
      pipMiniDotEl.classList.toggle('paused', currentState === RX_STATES.PAUSED);
    }
    if (pipMiniStatusEl) {
      pipMiniStatusEl.textContent = currentState === RX_STATES.PAUSED ? 'PAUSED' : 'REC';
    }

    // Mic mute
    const muteEl = doc.getElementById('pip-mute-btn');
    if (muteEl) {
      muteEl.classList.toggle('muted', micMuted);
      muteEl.innerHTML = micMuted ? '&#x1F507;' : '&#x1F50A;';
    }
  }

  // Feature detection — hide button if API not available
  if (!('documentPictureInPicture' in window)) {
    popoutBtn.style.display = 'none';
  }

  popoutBtn.addEventListener('click', () => {
    if (pipWindow && !pipWindow.closed) {
      closePipPopout();
    } else {
      openPipPopout();
    }
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

    // Document PiP sync — available whenever a stream is active (pre-record + recording)
    const pipActive = state !== RX_STATES.STOPPED && (tabStream || camStream);
    popoutBtn.disabled = !pipActive;
    if (state === RX_STATES.STOPPED) closePipPopout();
    syncPipState();
  }

  // ============================================================
  // Timer
  // ============================================================

  function startTimer() {
    timerPaused = false;
    if (timerInterval) return;
    timerInterval = setInterval(() => {
      if (!timerPaused) {
        timerSeconds++;
        const timeStr = formatRecTime(timerSeconds);
        recTimer.textContent = timeStr;
        if (pipMiniTimerEl) pipMiniTimerEl.textContent = timeStr;
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
    uploadDescription.value = '';
    updateCharCounters();

    outputSection.classList.remove('hidden');
  }

  function closeOutput() {
    outputVideo.pause();
    outputSection.classList.add('hidden');
  }

  outputCloseBtn.addEventListener('click', closeOutput);

  // Modal is locked — user must use close button, download, or upload to dismiss

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

  const aiGenerateBtn = document.getElementById('ai-generate-meta-btn');
  const aiGenerateHint = document.getElementById('ai-generate-hint');
  const aiGenerateStatus = document.getElementById('ai-generate-status');

  function updateAiGenerateButton() {
    const combinedLen = uploadTitle.value.trim().length + uploadDescription.value.trim().length;
    const enabled = combinedLen >= 10;
    if (aiGenerateBtn) aiGenerateBtn.disabled = !enabled;
    if (aiGenerateHint) aiGenerateHint.style.display = enabled ? 'none' : '';
  }

  uploadTitle.addEventListener('input', () => { updateCharCounters(); updateAiGenerateButton(); });
  uploadDescription.addEventListener('input', () => { updateCharCounters(); updateAiGenerateButton(); });

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
        if (message.youTubeTabClosed && !screenCaptureMode) {
          handleStreamEnded();
        }
        break;

      case RX_MESSAGES.PLAYER_STATE:
        if (screenCaptureMode) break; // No YouTube player in screen capture mode
        updatePlayerUI(message.currentTime, message.duration, message.playerState);
        // Auto-advance when video ends (state 0) and not recording
        if (message.playerState === 0 && videoQueue.length > 0 &&
            currentState !== RX_STATES.RECORDING && currentState !== RX_STATES.PAUSED) {
          playNextInQueue();
        }
        break;

      case RX_MESSAGES.QUEUE_PLAY_VIDEO:
        if (message.videoObj) {
          addToQueueOrPlay(message.videoObj);
        }
        break;
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

  // Audio-only toggle (no camera)
  const audioOnlyToggle = document.getElementById('audio-only-toggle');
  const camControlsSection = document.getElementById('cam-controls-section');
  if (audioOnlyToggle) {
    audioOnlyToggle.addEventListener('change', () => {
      audioOnlyMode = audioOnlyToggle.checked;
      // Dim/enable cam controls
      if (camControlsSection) {
        camControlsSection.style.opacity = audioOnlyMode ? '0.35' : '';
        camControlsSection.style.pointerEvents = audioOnlyMode ? 'none' : '';
      }
      // Stop cam if switching to audio-only mid-session
      if (audioOnlyMode && camStream) {
        camStream.getTracks().forEach(t => t.stop());
        camStream = null;
        stopMicMeter();
        camVideo.srcObject = null;
      }
      // Restart cam if switching back and a video is loaded
      if (!audioOnlyMode && !camStream && tabStream) {
        startCamStream();
      }
    });
  }

  // Webcam-only toggle
  const webcamOnlyToggle = document.getElementById('webcam-only-toggle');
  if (webcamOnlyToggle) {
    webcamOnlyToggle.addEventListener('change', () => {
      webcamOnlyMode = webcamOnlyToggle.checked;
      recordingView = webcamOnlyMode ? RX_VIEWS.CAMERA : RX_VIEWS.FINAL;
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
        resetVidToFullCanvas();
        break;
      case RX_PRESETS.PIP_TR:
        currentLayout = RX_LAYOUTS.PIP;
        pipSizePercent = 25;
        snapPipToCorner('top-right');
        resetVidToFullCanvas();
        break;
      case RX_PRESETS.PIP_BL:
        currentLayout = RX_LAYOUTS.PIP;
        pipSizePercent = 25;
        snapPipToCorner('bottom-left');
        resetVidToFullCanvas();
        break;
      case RX_PRESETS.PIP_BR:
        currentLayout = RX_LAYOUTS.PIP;
        pipSizePercent = 25;
        snapPipToCorner('bottom-right');
        resetVidToFullCanvas();
        break;
      case RX_PRESETS.SIDE_BY_SIDE:
        if (currentLayout === RX_LAYOUTS.SIDE_BY_SIDE) {
          sideBySideSwapped = !sideBySideSwapped;
        } else {
          currentLayout = RX_LAYOUTS.SIDE_BY_SIDE;
          sideBySideSwapped = false;
        }
        break;
      case RX_PRESETS.REACTOR_OVER:
        currentLayout = RX_LAYOUTS.PIP;
        pipSizePercent = 60;
        resetVidToFullCanvas();
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
    const isSbs = currentLayout === RX_LAYOUTS.SIDE_BY_SIDE;

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

    // Show/hide PiP-only vs SBS-only controls
    const pipControls = document.getElementById('pip-only-controls');
    const sbsControls = document.getElementById('sbs-only-controls');
    if (pipControls) pipControls.style.display = isSbs ? 'none' : '';
    if (sbsControls) sbsControls.style.display = isSbs ? '' : 'none';

    // Sync video size slider
    const vidSlider = document.getElementById('style-vid-size-slider');
    const vidValue = document.getElementById('style-vid-size-value');
    if (vidSlider) vidSlider.value = vidSizePercent;
    if (vidValue) vidValue.textContent = vidSizePercent + '%';

    // Sync split slider
    const splitSlider = document.getElementById('sbs-split-slider');
    const splitValue = document.getElementById('sbs-split-value');
    if (splitSlider) splitSlider.value = sbsSplitPercent;
    if (splitValue) splitValue.textContent = sbsSplitPercent + '%';
  }

  // ============================================================
  // Style prefs persistence
  // ============================================================

  const STYLE_PREFS_KEY = 'tubepilot_rx_style';
  let _stylePrefsTimer = null;

  function saveStylePrefs() {
    clearTimeout(_stylePrefsTimer);
    _stylePrefsTimer = setTimeout(() => {
      chrome.storage.local.set({
        [STYLE_PREFS_KEY]: {
          activePreset,
          currentLayout,
          pipSizePercent,
          pipShape,
          pipBorderColor,
          pipBorderWidth,
          sbsSplitPercent,
          vidSizePercent,
          bgRemovalEnabled,
          bgRemovalMode,
          bgFeatherValue,
          bgBlurStrength,
          camMirrored
        }
      });
    }, 300);
  }

  async function loadStylePrefs() {
    const result = await chrome.storage.local.get(STYLE_PREFS_KEY);
    const prefs = result[STYLE_PREFS_KEY];
    if (!prefs) return;

    // Restore state
    if (prefs.pipShape) pipShape = prefs.pipShape;
    if (prefs.pipBorderColor != null) pipBorderColor = prefs.pipBorderColor;
    if (prefs.pipBorderWidth != null) pipBorderWidth = prefs.pipBorderWidth;
    if (prefs.pipSizePercent != null) pipSizePercent = prefs.pipSizePercent;
    if (prefs.sbsSplitPercent != null) sbsSplitPercent = prefs.sbsSplitPercent;
    if (prefs.vidSizePercent != null) vidSizePercent = prefs.vidSizePercent;
    if (prefs.bgRemovalMode) bgRemovalMode = prefs.bgRemovalMode;
    if (prefs.bgFeatherValue != null) bgFeatherValue = prefs.bgFeatherValue;
    if (prefs.bgBlurStrength != null) bgBlurStrength = prefs.bgBlurStrength;
    if (prefs.camMirrored != null) camMirrored = prefs.camMirrored;

    // Restore layout via preset or direct layout
    if (prefs.activePreset) {
      applyPreset(prefs.activePreset);
    } else if (prefs.currentLayout) {
      currentLayout = prefs.currentLayout;
    }

    // Sync all UI controls to match restored state
    syncStyleTabToState();

    // Border color swatch
    document.querySelectorAll('.color-swatch').forEach(s => {
      s.classList.toggle('swatch-active', s.dataset.color === pipBorderColor);
    });

    // Border width slider
    const borderSlider = document.getElementById('border-width-slider');
    const borderValue = document.getElementById('border-width-value');
    if (borderSlider) borderSlider.value = pipBorderWidth;
    if (borderValue) borderValue.textContent = pipBorderWidth + 'px';

    // BG removal sub-options
    const bgFeatherSlider = document.getElementById('bg-feather-slider');
    const bgFeatherValueEl = document.getElementById('bg-feather-value');
    const bgBlurSlider = document.getElementById('bg-blur-slider');
    const bgBlurValueEl = document.getElementById('bg-blur-value');
    const bgFeatherRow = document.getElementById('bg-feather-row');
    const bgBlurRow = document.getElementById('bg-blur-row');

    if (bgFeatherSlider) bgFeatherSlider.value = bgFeatherValue;
    if (bgFeatherValueEl) bgFeatherValueEl.textContent = bgFeatherValue;
    if (bgBlurSlider) bgBlurSlider.value = bgBlurStrength;
    if (bgBlurValueEl) bgBlurValueEl.textContent = bgBlurStrength;
    buildFeatherLUT(bgFeatherValue);

    // BG mode buttons
    document.querySelectorAll('.bg-mode-btn').forEach(b => {
      b.classList.toggle('bg-mode-active', b.dataset.mode === bgRemovalMode);
    });
    if (bgRemovalMode === 'blur') {
      if (bgFeatherRow) bgFeatherRow.classList.add('hidden');
      if (bgBlurRow) bgBlurRow.classList.remove('hidden');
    } else {
      if (bgFeatherRow) bgFeatherRow.classList.remove('hidden');
      if (bgBlurRow) bgBlurRow.classList.add('hidden');
    }

    // BG removal toggle — restore enabled state
    if (prefs.bgRemovalEnabled && bgRemovalSupported) {
      const bgToggle = document.getElementById('bg-removal-toggle');
      if (bgToggle && !bgToggle.checked) {
        bgToggle.checked = true;
        bgToggle.dispatchEvent(new Event('change'));
      }
    }

    // Mirror button
    if (camMirrored) {
      mirrorBtn.classList.add('active');
      camPreview.style.transform = 'scaleX(-1)';
    }
  }

  function initStyleTab() {
    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applyPreset(btn.dataset.preset);
        saveStylePrefs();
      });
    });

    // Snap-to-corner buttons
    document.querySelectorAll('.snap-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        clearActivePreset();
        document.querySelectorAll('.snap-btn').forEach(b => b.classList.remove('pip-btn-active'));
        btn.classList.add('pip-btn-active');
        snapPipToCorner(btn.dataset.pos);
        saveStylePrefs();
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
        saveStylePrefs();
      });
    });

    // Border color swatches
    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('swatch-active'));
        swatch.classList.add('swatch-active');
        pipBorderColor = swatch.dataset.color;
        saveStylePrefs();
      });
    });

    // Border width slider
    const borderSlider = document.getElementById('border-width-slider');
    const borderValue = document.getElementById('border-width-value');
    if (borderSlider) {
      borderSlider.addEventListener('input', () => {
        pipBorderWidth = parseInt(borderSlider.value);
        borderValue.textContent = pipBorderWidth + 'px';
        saveStylePrefs();
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
        saveStylePrefs();
      });
    }

    // Video size slider
    const vidSlider = document.getElementById('style-vid-size-slider');
    const vidValue = document.getElementById('style-vid-size-value');
    if (vidSlider) {
      vidSlider.addEventListener('input', () => {
        clearActivePreset();
        const newPct = parseInt(vidSlider.value);

        if (newPct >= 100) {
          // Reset to full canvas
          resetVidToFullCanvas();
        } else {
          // Resize from center of current position
          const oldRect = calcVidRect(previewCanvas);
          const oldCX = oldRect.x + oldRect.w / 2;
          const oldCY = oldRect.y + oldRect.h / 2;

          vidSizePercent = newPct;

          const newW = Math.round(previewCanvas.width * (vidSizePercent / 100));
          const newH = Math.round(newW * (9 / 16));
          vidX = oldCX - newW / 2;
          vidY = oldCY - newH / 2;
        }
        vidValue.textContent = vidSizePercent + '%';
        saveStylePrefs();
      });
    }

    // Split ratio slider (side-by-side)
    const splitSlider = document.getElementById('sbs-split-slider');
    const splitValue = document.getElementById('sbs-split-value');
    if (splitSlider) {
      splitSlider.addEventListener('input', () => {
        sbsSplitPercent = parseInt(splitSlider.value);
        splitValue.textContent = sbsSplitPercent + '%';
        saveStylePrefs();
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
        saveStylePrefs();
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
        saveStylePrefs();
      });
    });

    // Feather slider
    if (bgFeatherSlider) {
      bgFeatherSlider.addEventListener('input', () => {
        bgFeatherValue = parseInt(bgFeatherSlider.value);
        if (bgFeatherValueEl) bgFeatherValueEl.textContent = bgFeatherValue;
        buildFeatherLUT(bgFeatherValue);
        saveStylePrefs();
      });
    }

    // Blur slider
    if (bgBlurSlider) {
      bgBlurSlider.addEventListener('input', () => {
        bgBlurStrength = parseInt(bgBlurSlider.value);
        if (bgBlurValueEl) bgBlurValueEl.textContent = bgBlurStrength;
        saveStylePrefs();
      });
    }

    // Dilation slider
    const bgDilationSlider = document.getElementById('bg-dilation-slider');
    const bgDilationVal = document.getElementById('bg-dilation-value');
    if (bgDilationSlider) {
      bgDilationSlider.addEventListener('input', () => {
        bgMaskDilation = parseInt(bgDilationSlider.value);
        if (bgDilationVal) bgDilationVal.textContent = bgMaskDilation + 'px';
        saveStylePrefs();
      });
    }

    // Mask smoothing slider
    const bgMaskBlurSlider = document.getElementById('bg-mask-blur-slider');
    const bgMaskBlurVal = document.getElementById('bg-mask-blur-value');
    if (bgMaskBlurSlider) {
      bgMaskBlurSlider.addEventListener('input', () => {
        bgMaskSmoothing = parseInt(bgMaskBlurSlider.value);
        if (bgMaskBlurVal) bgMaskBlurVal.textContent = bgMaskSmoothing + 'px';
        saveStylePrefs();
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

  // --- AI Generate (upload form button) ---

  async function generateAiMetaFromForm() {
    if (aiMetaGenerating) return;
    aiMetaGenerating = true;
    if (aiGenerateBtn) aiGenerateBtn.disabled = true;
    if (aiGenerateStatus) aiGenerateStatus.textContent = 'Generating...';

    try {
      let videoDesc = '';
      // Include user-entered title/description as primary context
      const userTitle = uploadTitle.value.trim();
      const userDesc = uploadDescription.value.trim();
      if (userTitle) videoDesc += `Title draft: "${userTitle}". `;
      if (userDesc) videoDesc += `Description draft: "${userDesc}". `;

      // Add now-playing video context
      if (nowPlaying) {
        videoDesc += `Reaction video to: "${nowPlaying.title}"`;
        if (nowPlaying.channelTitle) videoDesc += ` by ${nowPlaying.channelTitle}`;
        videoDesc += '. ';
      }
      videoDesc += 'This is a reaction/commentary video. ';

      // Add caption excerpts
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
        if (aiGenerateStatus) aiGenerateStatus.textContent = response.error;
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
        updateAiGenerateButton();
        if (aiGenerateStatus) aiGenerateStatus.textContent = 'Done!';
      } else {
        if (aiGenerateStatus) aiGenerateStatus.textContent = 'No result received';
      }
    } catch (err) {
      if (aiGenerateStatus) aiGenerateStatus.textContent = 'Error: ' + err.message;
    } finally {
      aiMetaGenerating = false;
      updateAiGenerateButton();
    }
  }

  if (aiGenerateBtn) aiGenerateBtn.addEventListener('click', generateAiMetaFromForm);

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
  await loadStylePrefs();
  updateNavButtons();
  cleanupOldRecordings();

  // Load persisted queue from storage (clear stale nowPlaying — can't resume a dead session)
  try {
    const queueData = await QueueStorage.load();
    videoQueue = queueData.queue || [];
    playHistory = queueData.playHistory || [];
    nowPlaying = null;
    // Re-queue the old nowPlaying so the video isn't lost
    if (queueData.nowPlaying) {
      const alreadyQueued = videoQueue.some(v => v.videoId === queueData.nowPlaying.videoId);
      if (!alreadyQueued) videoQueue.unshift(queueData.nowPlaying);
    }
    renderNowPlaying();
    renderQueue();
    updateNavButtons();
    saveQueueState();
  } catch {}

  // Check for existing session
  try {
    const stateResp = await chrome.runtime.sendMessage({ type: RX_MESSAGES.GET_STATE });
    if (stateResp?.success && stateResp.state !== RX_STATES.IDLE) {
      setState(stateResp.state);
    }
  } catch {}

});
