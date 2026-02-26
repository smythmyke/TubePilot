/**
 * TubePilot Reactions — Side Panel
 * Queue tab (search + queue management) + Controls tab (recording)
 */

document.addEventListener('DOMContentLoaded', async () => {

  // ============================================================
  // Tab switching
  // ============================================================

  const tabs = document.querySelectorAll('.sp-tab');
  const tabQueue = document.getElementById('tab-queue');
  const tabControls = document.getElementById('tab-controls');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('sp-tab-active'));
      tab.classList.add('sp-tab-active');
      const target = tab.dataset.tab;
      tabQueue.classList.toggle('sp-tab-hidden', target !== 'queue');
      tabControls.classList.toggle('sp-tab-hidden', target !== 'controls');
    });
  });

  // ============================================================
  // Queue tab elements
  // ============================================================

  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const searchStatus = document.getElementById('search-status');
  const nowPlayingSection = document.getElementById('now-playing');
  const nowPlayingCard = document.getElementById('now-playing-card');
  const queueSection = document.getElementById('queue-section');
  const queueList = document.getElementById('queue-list');
  const resultsSection = document.getElementById('results-section');
  const resultsList = document.getElementById('results-list');

  // ============================================================
  // Controls tab elements
  // ============================================================

  const stateDot = document.getElementById('state-dot');
  const stateLabel = document.getElementById('state-label');
  const timerEl = document.getElementById('timer');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  const tabVolume = document.getElementById('tab-volume');
  const tabVolVal = document.getElementById('tab-vol-val');
  const micVolume = document.getElementById('mic-volume');
  const micVolVal = document.getElementById('mic-vol-val');
  const pipBtns = document.querySelectorAll('.sp-pip-btn');
  const expandBtn = document.getElementById('expand-btn');
  const stoppedMsg = document.getElementById('stopped-msg');
  const openLink = document.getElementById('open-reactions-link');

  let currentState = RX_STATES.IDLE;
  let timerInterval = null;
  let timerSeconds = 0;
  let timerPaused = false;
  let pipPosition = RX_PIP_POSITIONS.BR;
  let lastSearchResults = [];

  // ============================================================
  // Queue: load initial state from storage
  // ============================================================

  async function loadQueue() {
    try {
      const data = await QueueStorage.load();
      renderNowPlaying(data.nowPlaying);
      renderQueue(data.queue);
    } catch {}
  }

  await loadQueue();

  // ============================================================
  // Queue: storage sync listener
  // ============================================================

  QueueStorage.onChange((data) => {
    renderNowPlaying(data.nowPlaying);
    renderQueue(data.queue || []);
  });

  // ============================================================
  // Queue: search
  // ============================================================

  searchBtn.addEventListener('click', () => handleSearch());
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch();
  });

  function setStatus(msg, type) {
    searchStatus.textContent = msg;
    searchStatus.className = 'sp-search-status' + (type ? ' sp-status-' + type : '');
  }

  async function handleSearch() {
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
      const result = await QueueStorage.addToQueue(videoObj);
      if (result === 'added') {
        setStatus('Added to queue', 'success');
        // Also try to play it in reactions tab
        sendPlayToReactions(videoObj);
      } else if (result === 'already_playing') {
        setStatus('Already playing', 'info');
      } else if (result === 'already_queued') {
        setStatus('Already in queue', 'info');
      } else if (result === 'queue_full') {
        setStatus('Queue is full', 'error');
      }
      searchInput.value = '';
      return;
    }

    // Text search via YouTube API
    setStatus('Searching...', 'loading');
    searchBtn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: RX_MESSAGES.YOUTUBE_SEARCH,
        query: input
      });

      if (!response || !response.success) {
        const err = response?.error || 'Search failed';
        if (err.includes('token expired') || err.includes('No channel')) {
          setStatus('Connect a channel to search', 'info');
        } else if (err.includes('quota')) {
          setStatus('Quota reached — paste a URL instead', 'error');
        } else {
          setStatus(err, 'error');
        }
        return;
      }

      lastSearchResults = response.results || [];
      if (lastSearchResults.length === 0) {
        setStatus('No results', 'info');
        resultsSection.classList.add('hidden');
      } else {
        setStatus('');
        renderSearchResults(lastSearchResults);
      }
    } catch (err) {
      setStatus('Error: ' + err.message, 'error');
    } finally {
      searchBtn.disabled = false;
    }
  }

  // ============================================================
  // Queue: rendering
  // ============================================================

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  function renderNowPlaying(np) {
    if (!np) {
      nowPlayingSection.classList.add('hidden');
      return;
    }
    nowPlayingSection.classList.remove('hidden');
    nowPlayingCard.innerHTML = `
      <img class="sp-np-thumb" src="${escapeAttr(np.thumbnail)}" alt="">
      <div class="sp-np-info">
        <div class="sp-np-title" title="${escapeAttr(np.title)}">${escapeHtml(np.title)}</div>
        <div class="sp-np-channel">${escapeHtml(np.channelTitle)}</div>
      </div>
    `;
  }

  function renderQueue(queue) {
    if (!queue || queue.length === 0) {
      queueSection.classList.add('hidden');
      return;
    }
    queueSection.classList.remove('hidden');
    queueList.innerHTML = queue.map((v, i) => `
      <div class="sp-queue-item" data-index="${i}">
        <span class="sp-qi-num">${i + 1}</span>
        <img class="sp-qi-thumb" src="${escapeAttr(v.thumbnail)}" alt="">
        <div class="sp-qi-info">
          <div class="sp-qi-title" title="${escapeAttr(v.title)}">${escapeHtml(v.title)}</div>
        </div>
        <div class="sp-qi-actions">
          <button class="sp-qi-btn sp-qi-play" data-index="${i}" title="Play now">&#x25B6;</button>
          <button class="sp-qi-btn sp-qi-up" data-index="${i}" title="Move up">&uarr;</button>
          <button class="sp-qi-btn sp-qi-down" data-index="${i}" title="Move down">&darr;</button>
          <button class="sp-qi-btn sp-qi-remove" data-index="${i}" title="Remove">&times;</button>
        </div>
      </div>
    `).join('');

    // Event listeners
    queueList.querySelectorAll('.sp-qi-play').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        const data = await QueueStorage.load();
        const videoObj = data.queue[idx];
        if (videoObj) sendPlayToReactions(videoObj);
      });
    });
    queueList.querySelectorAll('.sp-qi-up').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        QueueStorage.moveQueueItem(parseInt(btn.dataset.index), -1);
      });
    });
    queueList.querySelectorAll('.sp-qi-down').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        QueueStorage.moveQueueItem(parseInt(btn.dataset.index), 1);
      });
    });
    queueList.querySelectorAll('.sp-qi-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        QueueStorage.removeFromQueue(parseInt(btn.dataset.index));
      });
    });
  }

  function renderSearchResults(results) {
    if (!results || results.length === 0) {
      resultsSection.classList.add('hidden');
      return;
    }
    resultsSection.classList.remove('hidden');
    resultsList.innerHTML = results.map((v, i) => `
      <div class="sp-result" data-index="${i}">
        <img class="sp-result-thumb" src="${escapeAttr(v.thumbnail)}" alt="">
        <div class="sp-result-info">
          <div class="sp-result-title" title="${escapeAttr(v.title)}">${escapeHtml(v.title)}</div>
          <div class="sp-result-channel">${escapeHtml(v.channelTitle)}</div>
        </div>
        <button class="sp-result-add" data-index="${i}">+ Add</button>
      </div>
    `).join('');

    resultsList.querySelectorAll('.sp-result-add').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        const videoObj = lastSearchResults[idx];
        if (!videoObj) return;
        const result = await QueueStorage.addToQueue(videoObj);
        if (result === 'added') {
          btn.textContent = 'Added';
          btn.disabled = true;
          sendPlayToReactions(videoObj);
        } else if (result === 'already_playing') {
          setStatus('Already playing', 'info');
        } else if (result === 'already_queued') {
          setStatus('Already in queue', 'info');
        }
      });
    });
  }

  // ============================================================
  // Queue: send play command to reactions tab
  // ============================================================

  async function sendPlayToReactions(videoObj) {
    try {
      await chrome.runtime.sendMessage({
        type: RX_MESSAGES.QUEUE_PLAY_VIDEO,
        videoObj
      });
    } catch {
      // Reactions tab not open — that's fine, queue is persisted
    }
  }

  // ============================================================
  // Controls: state management
  // ============================================================

  // Query initial state
  try {
    const resp = await chrome.runtime.sendMessage({ type: RX_MESSAGES.GET_STATE });
    if (resp && resp.success) {
      updateControlsUI(resp.state);
    }
  } catch {}

  // State change listener
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === RX_MESSAGES.STATE_CHANGED) {
      updateControlsUI(message.state);
      if (message.state === RX_STATES.STOPPED) {
        stoppedMsg.classList.remove('hidden');
      }
    }
  });

  function updateControlsUI(state) {
    currentState = state;
    stateDot.className = 'sp-state-dot';
    switch (state) {
      case RX_STATES.RECORDING:
        stateDot.classList.add('recording');
        stateLabel.textContent = 'Recording';
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        pauseBtn.textContent = 'Pause';
        stoppedMsg.classList.add('hidden');
        startTimer();
        break;
      case RX_STATES.PAUSED:
        stateDot.classList.add('paused');
        stateLabel.textContent = 'Paused';
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        pauseBtn.textContent = 'Resume';
        pauseTimer();
        break;
      case RX_STATES.STOPPED:
        stateDot.classList.add('stopped');
        stateLabel.textContent = 'Stopped';
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        pauseBtn.textContent = 'Pause';
        stopTimer();
        break;
      case RX_STATES.PREPARING:
        stateLabel.textContent = 'Preparing...';
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        break;
      default:
        stateLabel.textContent = 'Idle';
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        pauseBtn.textContent = 'Pause';
        stoppedMsg.classList.add('hidden');
        break;
    }
  }

  // ============================================================
  // Controls: buttons
  // ============================================================

  pauseBtn.addEventListener('click', async () => {
    if (currentState === RX_STATES.RECORDING) {
      await chrome.runtime.sendMessage({ type: RX_MESSAGES.PAUSE });
    } else if (currentState === RX_STATES.PAUSED) {
      await chrome.runtime.sendMessage({ type: RX_MESSAGES.RESUME });
    }
  });

  stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true;
    await chrome.runtime.sendMessage({ type: RX_MESSAGES.STOP_CAPTURE });
  });

  // Volume
  tabVolume.addEventListener('input', () => {
    tabVolVal.textContent = tabVolume.value + '%';
    sendConfig();
  });

  micVolume.addEventListener('input', () => {
    micVolVal.textContent = micVolume.value + '%';
    sendConfig();
  });

  // PiP
  pipBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      pipBtns.forEach(b => b.classList.remove('sp-pip-active'));
      btn.classList.add('sp-pip-active');
      pipPosition = btn.dataset.pos;
      sendConfig();
    });
  });

  function sendConfig() {
    if (currentState !== RX_STATES.RECORDING && currentState !== RX_STATES.PAUSED) return;
    chrome.runtime.sendMessage({
      type: RX_MESSAGES.UPDATE_CONFIG,
      config: {
        pipPosition,
        tabVolume: parseInt(tabVolume.value),
        micVolume: parseInt(micVolume.value)
      }
    }).catch(() => {});
  }

  // Expand / open reactions tab
  expandBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('reactions/reactions.html') });
  });

  if (openLink) {
    openLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('reactions/reactions.html') });
    });
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
});
