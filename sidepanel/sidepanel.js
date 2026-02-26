/**
 * TubePilot Reactions — Side Panel
 */

document.addEventListener('DOMContentLoaded', async () => {
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

  // --- Query initial state ---
  try {
    const resp = await chrome.runtime.sendMessage({ type: RX_MESSAGES.GET_STATE });
    if (resp && resp.success) {
      updateUI(resp.state);
    }
  } catch {}

  // --- State change listener ---
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === RX_MESSAGES.STATE_CHANGED) {
      updateUI(message.state);
      if (message.state === RX_STATES.STOPPED) {
        stoppedMsg.classList.remove('hidden');
      }
    }
  });

  function updateUI(state) {
    currentState = state;

    // State dot and label
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

  // --- Controls ---
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

  // --- Volume ---
  tabVolume.addEventListener('input', () => {
    tabVolVal.textContent = tabVolume.value + '%';
    sendConfig();
  });

  micVolume.addEventListener('input', () => {
    micVolVal.textContent = micVolume.value + '%';
    sendConfig();
  });

  // --- PiP ---
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

  // --- Expand ---
  expandBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('reactions/reactions.html') });
  });

  openLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('reactions/reactions.html') });
  });

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
});
