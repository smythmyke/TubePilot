(function () {
  'use strict';

  // --- Detect Stripe purchase redirect ---
  const urlParams = new URLSearchParams(location.search);
  if (urlParams.get('tp_purchase') === 'success') {
    const cleanUrl = location.origin + location.pathname;
    history.replaceState(null, '', cleanUrl);
  }

  // --- URL & Page Detection ---
  function isEditPage() {
    return /\/video\/[^/]+\/edit/.test(location.pathname);
  }

  function getVideoId() {
    const match = location.pathname.match(/\/video\/([^/]+)\/edit/);
    return match ? match[1] : null;
  }

  let currentVideoId = null;

  // --- Products Cache ---
  let productsCache = [];

  function loadProducts(callback) {
    chrome.storage.local.get(['tubepilot_products'], (result) => {
      productsCache = result.tubepilot_products || [];
      if (callback) callback();
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.tubepilot_products) {
      productsCache = changes.tubepilot_products.newValue || [];
      if (panel) rebuildProjectDropdown();
    }
  });

  // --- SPA Navigation Detection ---
  let lastUrl = location.href;
  let fab = null;
  let panel = null;
  let backdrop = null;

  setInterval(() => {
    if (location.href !== lastUrl) onUrlChange();
  }, 500);
  window.addEventListener('popstate', onUrlChange);

  function onUrlChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;

    if (isEditPage()) {
      currentVideoId = getVideoId();
      if (!fab) fab = createFAB();
      fab.style.display = '';
    } else {
      currentVideoId = null;
      if (fab) fab.style.display = 'none';
      closePanel();
    }
  }

  // --- FAB ---
  function createFAB() {
    const btn = document.createElement('button');
    btn.className = 'tp-fab';
    btn.title = 'TubePilot — Generate YouTube Metadata';
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    btn.addEventListener('click', togglePanel);
    document.body.appendChild(btn);
    return btn;
  }

  // --- Panel Toggle ---
  function togglePanel() {
    if (panel && panel.classList.contains('tp-visible')) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function openPanel() {
    if (!panel) {
      createPanel();
    }
    currentVideoId = getVideoId();
    loadProducts(() => {
      rebuildProjectDropdown();
    });
    backdrop.classList.add('tp-visible');
    panel.classList.add('tp-visible');
    checkAuthAndUpdateUI();
  }

  function closePanel() {
    if (panel) panel.classList.remove('tp-visible');
    if (backdrop) backdrop.classList.remove('tp-visible');
  }

  // --- Listen for OPEN_PANEL from popup ---
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OPEN_PANEL') {
      if (!isEditPage()) {
        sendResponse({ success: false, error: 'not_edit_page' });
        return;
      }
      if (panel && panel.classList.contains('tp-visible')) {
        sendResponse({ success: false, error: 'already_open' });
        return;
      }
      openPanel();
      sendResponse({ success: true });
    }
  });

  // --- Create Panel ---
  function createPanel() {
    // Backdrop
    backdrop = document.createElement('div');
    backdrop.className = 'tp-backdrop';
    backdrop.addEventListener('click', closePanel);
    document.body.appendChild(backdrop);

    // Panel
    panel = document.createElement('div');
    panel.className = 'tp-panel';
    panel.innerHTML = `
      <div class="tp-panel-header">
        <div class="tp-panel-header-text">
          <div class="tp-panel-title">TubePilot</div>
          <div class="tp-panel-subtitle">YouTube Metadata Generator</div>
        </div>
        <div class="tp-credits-badge" id="tp-credits-badge">
          <span class="tp-credits-icon">&#9679;</span>
          <span id="tp-credits-count">--</span>
        </div>
        <button class="tp-close-btn" title="Close">&times;</button>
      </div>
      <div class="tp-panel-body">
        <!-- Auth required state -->
        <div class="tp-auth-required" id="tp-auth-required">
          <p>Sign in to generate AI-powered YouTube metadata</p>
          <button class="tp-btn tp-btn-primary" id="tp-sign-in-btn">Sign in with Google</button>
        </div>

        <!-- Main content (hidden until auth) -->
        <div class="tp-main-content" id="tp-main-content" style="display:none;">
          <!-- Product dropdown -->
          <div class="tp-project-row">
            <span>Product:</span>
            <select class="tp-project-select" id="tp-project-select">
              <option value="none">No Product</option>
            </select>
          </div>

          <!-- Apply strategy -->
          <div class="tp-strategy-row">
            <span>Apply via:</span>
            <select class="tp-strategy-select" id="tp-strategy-select">
              <option value="dom">DOM (default)</option>
              <option value="api">YouTube API</option>
              <option value="api_with_dom_fallback">API + DOM Fallback</option>
            </select>
          </div>

          <!-- Video description input -->
          <div class="tp-field-group">
            <label class="tp-field-label">Video Description <span class="tp-required">*</span></label>
            <p class="tp-field-hint">Briefly describe your video content. The AI uses this to generate metadata.</p>
            <textarea class="tp-input-textarea" id="tp-video-desc" rows="4" maxlength="3000" placeholder="What is this video about? Key topics, target audience..."></textarea>
            <div class="tp-char-count"><span id="tp-desc-count">0</span>/3000</div>
          </div>

          <!-- Target audience (optional) -->
          <div class="tp-field-group">
            <label class="tp-field-label">Target Audience</label>
            <input class="tp-input" type="text" id="tp-target-audience" maxlength="500" placeholder="e.g. beginners, developers, gamers...">
          </div>

          <!-- Generate button -->
          <button class="tp-btn tp-btn-primary tp-generate-btn" id="tp-generate-btn">Generate Metadata</button>

          <!-- Loading state -->
          <div class="tp-loading-state" id="tp-loading" style="display:none;">
            <div class="tp-spinner"></div>
            <span>Generating SEO-optimized metadata...</span>
          </div>

          <!-- Results (hidden until generated) -->
          <div class="tp-results" id="tp-results" style="display:none;">
            <div class="tp-results-header">
              <span>Generated Metadata</span>
              <button class="tp-btn-regen" id="tp-regen-btn">Regenerate</button>
            </div>

            <!-- Title -->
            <div class="tp-field-group">
              <label class="tp-field-label">Title</label>
              <input class="tp-input" type="text" id="tp-result-title" maxlength="100">
              <div class="tp-char-count"><span id="tp-title-count">0</span>/100</div>
            </div>

            <!-- Description -->
            <div class="tp-field-group">
              <label class="tp-field-label">Description</label>
              <textarea class="tp-result-textarea" id="tp-result-desc" rows="8" maxlength="5000"></textarea>
              <div class="tp-char-count"><span id="tp-rdesc-count">0</span>/5000</div>
            </div>

            <!-- Tags -->
            <div class="tp-field-group">
              <label class="tp-field-label">Tags</label>
              <input class="tp-input" type="text" id="tp-result-tags" placeholder="tag1, tag2, tag3...">
              <div class="tp-char-count"><span id="tp-tags-info">0 tags</span></div>
            </div>

            <!-- Category -->
            <div class="tp-field-group">
              <label class="tp-field-label">Suggested Category</label>
              <div class="tp-category-display" id="tp-result-category">—</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer (shown when results exist) -->
      <div class="tp-panel-footer" id="tp-panel-footer" style="display:none;">
        <button class="tp-btn tp-btn-primary" id="tp-fill-btn">Fill Form</button>
        <button class="tp-btn tp-btn-secondary" id="tp-copy-btn">Copy All</button>
      </div>
    `;

    document.body.appendChild(panel);
    wireUpPanel();
  }

  // --- Wire Up Panel Events ---
  function wireUpPanel() {
    panel.querySelector('.tp-close-btn').addEventListener('click', closePanel);

    // Sign in
    panel.querySelector('#tp-sign-in-btn').addEventListener('click', async () => {
      const btn = panel.querySelector('#tp-sign-in-btn');
      btn.disabled = true;
      btn.textContent = 'Signing in...';
      try {
        const result = await chrome.runtime.sendMessage({ type: 'SIGN_IN' });
        if (result && result.success) {
          showMainContent(result.credits);
        } else {
          btn.textContent = 'Sign in failed — retry';
          btn.disabled = false;
        }
      } catch (err) {
        btn.textContent = 'Sign in failed — retry';
        btn.disabled = false;
      }
    });

    // Video description char counter
    const descInput = panel.querySelector('#tp-video-desc');
    const descCount = panel.querySelector('#tp-desc-count');
    descInput.addEventListener('input', () => {
      descCount.textContent = descInput.value.length;
    });

    // Result title char counter
    const titleInput = panel.querySelector('#tp-result-title');
    const titleCount = panel.querySelector('#tp-title-count');
    titleInput.addEventListener('input', () => {
      titleCount.textContent = titleInput.value.length;
    });

    // Result description char counter
    const rdescInput = panel.querySelector('#tp-result-desc');
    const rdescCount = panel.querySelector('#tp-rdesc-count');
    rdescInput.addEventListener('input', () => {
      rdescCount.textContent = rdescInput.value.length;
    });

    // Tags info
    const tagsInput = panel.querySelector('#tp-result-tags');
    const tagsInfo = panel.querySelector('#tp-tags-info');
    tagsInput.addEventListener('input', () => {
      const tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
      tagsInfo.textContent = tags.length + ' tag' + (tags.length !== 1 ? 's' : '');
    });

    // Generate
    panel.querySelector('#tp-generate-btn').addEventListener('click', handleGenerate);
    panel.querySelector('#tp-regen-btn').addEventListener('click', handleGenerate);

    // Fill form
    panel.querySelector('#tp-fill-btn').addEventListener('click', handleFillForm);

    // Copy all
    panel.querySelector('#tp-copy-btn').addEventListener('click', handleCopyAll);

    // Project select persistence
    const projectSelect = panel.querySelector('#tp-project-select');
    chrome.storage.local.get(['tp_project'], (result) => {
      if (result.tp_project) {
        projectSelect.value = result.tp_project;
      }
    });
    projectSelect.addEventListener('change', () => {
      chrome.storage.local.set({ tp_project: projectSelect.value });
    });

    // Strategy select persistence + scope upgrade prompt
    const strategySelect = panel.querySelector('#tp-strategy-select');
    chrome.storage.local.get([CONFIG.APPLY_STRATEGY_KEY], (result) => {
      const saved = result[CONFIG.APPLY_STRATEGY_KEY];
      if (saved && strategySelect.querySelector(`option[value="${saved}"]`)) {
        strategySelect.value = saved;
      }
    });
    strategySelect.addEventListener('change', async () => {
      const value = strategySelect.value;

      // If switching to an API mode, prompt for YouTube scope
      if (value === CONFIG.APPLY_STRATEGIES.API || value === CONFIG.APPLY_STRATEGIES.API_WITH_DOM_FALLBACK) {
        try {
          const resp = await chrome.runtime.sendMessage({ type: 'GET_YOUTUBE_TOKEN' });
          if (!resp || !resp.success) {
            showToast('YouTube scope denied — reverting to DOM', true);
            strategySelect.value = CONFIG.APPLY_STRATEGIES.DOM;
            chrome.storage.local.set({ [CONFIG.APPLY_STRATEGY_KEY]: CONFIG.APPLY_STRATEGIES.DOM });
            return;
          }
        } catch {
          showToast('YouTube scope denied — reverting to DOM', true);
          strategySelect.value = CONFIG.APPLY_STRATEGIES.DOM;
          chrome.storage.local.set({ [CONFIG.APPLY_STRATEGY_KEY]: CONFIG.APPLY_STRATEGIES.DOM });
          return;
        }
      }

      chrome.storage.local.set({ [CONFIG.APPLY_STRATEGY_KEY]: value });
    });
  }

  // --- Auth Check ---
  async function checkAuthAndUpdateUI() {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
      if (result && result.authenticated) {
        showMainContent(result.credits);
      } else {
        showAuthRequired();
      }
    } catch (err) {
      showAuthRequired();
    }
  }

  function showMainContent(credits) {
    if (!panel) return;
    panel.querySelector('#tp-auth-required').style.display = 'none';
    panel.querySelector('#tp-main-content').style.display = '';
    if (credits && credits.available !== undefined) {
      updateCreditsDisplay(credits.available);
    }
  }

  function showAuthRequired() {
    if (!panel) return;
    panel.querySelector('#tp-auth-required').style.display = '';
    panel.querySelector('#tp-main-content').style.display = 'none';
    const btn = panel.querySelector('#tp-sign-in-btn');
    btn.textContent = 'Sign in with Google';
    btn.disabled = false;
  }

  function updateCreditsDisplay(available) {
    if (!panel) return;
    const badge = panel.querySelector('#tp-credits-badge');
    const count = panel.querySelector('#tp-credits-count');
    count.textContent = available;
    badge.classList.remove('tp-credits-low', 'tp-credits-zero');
    if (available <= 0) {
      badge.classList.add('tp-credits-zero');
    } else if (available <= 5) {
      badge.classList.add('tp-credits-low');
    }
  }

  // --- Project Dropdown ---
  function rebuildProjectDropdown() {
    if (!panel) return;
    const select = panel.querySelector('#tp-project-select');
    const currentVal = select.value;
    select.innerHTML = '<option value="none">No Product</option>';

    productsCache.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });

    // Restore selection
    if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
      select.value = currentVal;
    }
  }

  // --- Generate Metadata ---
  async function handleGenerate() {
    const videoDesc = panel.querySelector('#tp-video-desc').value.trim();
    if (!videoDesc) {
      showToast('Please describe your video content', true);
      return;
    }
    if (videoDesc.length < 10) {
      showToast('Description must be at least 10 characters', true);
      return;
    }

    const generateBtn = panel.querySelector('#tp-generate-btn');
    const regenBtn = panel.querySelector('#tp-regen-btn');
    const loading = panel.querySelector('#tp-loading');
    const results = panel.querySelector('#tp-results');
    const footer = panel.querySelector('#tp-panel-footer');

    generateBtn.disabled = true;
    regenBtn.disabled = true;
    generateBtn.textContent = 'Generating...';
    loading.style.display = '';
    results.style.display = 'none';
    footer.style.display = 'none';

    // Get selected product
    const projectId = panel.querySelector('#tp-project-select').value;
    let product = null;
    if (projectId !== 'none') {
      product = productsCache.find(p => p.id === projectId);
    }

    const targetAudience = panel.querySelector('#tp-target-audience').value.trim();

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_YOUTUBE_META',
        videoDescription: videoDesc,
        product: product || null,
        channelContext: '',
        targetAudience: targetAudience
      });

      if (response.error) {
        showToast(response.error, true);
        return;
      }

      const data = response.result;
      populateResults(data);

      // Refresh credits display
      chrome.runtime.sendMessage({ type: 'CHECK_CREDITS' }).then(resp => {
        if (resp && resp.success && resp.credits) {
          updateCreditsDisplay(resp.credits.available);
        }
      }).catch(() => {});
    } catch (err) {
      showToast('Generation failed — try again', true);
    } finally {
      generateBtn.disabled = false;
      regenBtn.disabled = false;
      generateBtn.textContent = 'Generate Metadata';
      loading.style.display = 'none';
    }
  }

  // --- Populate Results ---
  function populateResults(data) {
    const results = panel.querySelector('#tp-results');
    const footer = panel.querySelector('#tp-panel-footer');

    // Title
    const titleInput = panel.querySelector('#tp-result-title');
    titleInput.value = data.title || '';
    panel.querySelector('#tp-title-count').textContent = (data.title || '').length;

    // Description
    const descInput = panel.querySelector('#tp-result-desc');
    descInput.value = data.description || '';
    panel.querySelector('#tp-rdesc-count').textContent = (data.description || '').length;

    // Tags
    const tagsInput = panel.querySelector('#tp-result-tags');
    const tags = data.tags || [];
    tagsInput.value = tags.join(', ');
    panel.querySelector('#tp-tags-info').textContent = tags.length + ' tag' + (tags.length !== 1 ? 's' : '');

    // Category
    const categoryEl = panel.querySelector('#tp-result-category');
    if (data.categoryId && data.categoryName) {
      categoryEl.textContent = data.categoryName;
      categoryEl.dataset.categoryId = data.categoryId;
    } else if (data.categoryId && CONFIG.YOUTUBE_CATEGORIES[data.categoryId]) {
      categoryEl.textContent = CONFIG.YOUTUBE_CATEGORIES[data.categoryId];
      categoryEl.dataset.categoryId = data.categoryId;
    } else {
      categoryEl.textContent = '—';
    }

    results.style.display = '';
    footer.style.display = '';
  }

  // --- Fill YouTube Studio Form (Strategy Dispatcher) ---
  async function handleFillForm() {
    const fillBtn = panel.querySelector('#tp-fill-btn');
    fillBtn.disabled = true;
    fillBtn.textContent = 'Filling...';

    try {
      const result = await chrome.storage.local.get([CONFIG.APPLY_STRATEGY_KEY]);
      const strategy = result[CONFIG.APPLY_STRATEGY_KEY] || CONFIG.APPLY_STRATEGIES.DOM;

      if (strategy === CONFIG.APPLY_STRATEGIES.API) {
        await applyViaApi();
      } else if (strategy === CONFIG.APPLY_STRATEGIES.API_WITH_DOM_FALLBACK) {
        try {
          await applyViaApi();
        } catch (apiErr) {
          showToast('API failed — falling back to DOM fill', true);
          await applyViaDom();
        }
      } else {
        await applyViaDom();
      }
    } catch (err) {
      showToast('Fill failed — use Copy All instead', true);
    } finally {
      fillBtn.disabled = false;
      fillBtn.textContent = 'Fill Form';
    }
  }

  // --- Apply via DOM (existing behavior, extracted) ---
  async function applyViaDom() {
    let filledCount = 0;

    const title = panel.querySelector('#tp-result-title').value;
    if (title) {
      const filled = await fillField('#title-textarea', title);
      if (filled) filledCount++;
    }

    const desc = panel.querySelector('#tp-result-desc').value;
    if (desc) {
      const filled = await fillField('#description-textarea', desc);
      if (filled) filledCount++;
    }

    const tagsStr = panel.querySelector('#tp-result-tags').value;
    if (tagsStr) {
      const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
      const filled = await fillTags(tags);
      if (filled) filledCount++;
    }

    if (filledCount > 0) {
      showToast(`Filled ${filledCount} field${filledCount > 1 ? 's' : ''} successfully`);
    } else {
      showToast('Could not fill fields — use Copy All instead', true);
    }
  }

  // --- Apply via YouTube Data API ---
  async function applyViaApi() {
    const videoId = currentVideoId || getVideoId();
    if (!videoId) {
      throw new Error('Could not extract video ID from URL');
    }

    const title = panel.querySelector('#tp-result-title').value;
    const description = panel.querySelector('#tp-result-desc').value;
    const tagsStr = panel.querySelector('#tp-result-tags').value;
    const categoryEl = panel.querySelector('#tp-result-category');
    const categoryId = categoryEl.dataset.categoryId || null;

    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : null;

    const metadata = {};
    if (title) metadata.title = title;
    if (description) metadata.description = description;
    if (tags && tags.length > 0) metadata.tags = tags;
    if (categoryId) metadata.categoryId = categoryId;

    const resp = await chrome.runtime.sendMessage({
      type: 'APPLY_VIA_API',
      videoId,
      metadata
    });

    if (!resp || !resp.success) {
      throw new Error(resp?.error || 'API apply failed');
    }

    showToast('Metadata applied via YouTube API');
  }

  // --- Fill a YouTube Studio field using clipboard paste strategy ---
  async function fillField(containerSelector, text) {
    const container = document.querySelector(containerSelector);
    if (!container) return false;

    // YouTube Studio uses contenteditable divs inside its custom elements
    const editable = container.querySelector('div[contenteditable="true"]') ||
                     container.querySelector('[contenteditable]') ||
                     container.querySelector('textarea') ||
                     container.querySelector('input');

    if (!editable) return false;

    // Focus the element
    editable.focus();
    editable.click();
    await sleep(100);

    // Select all existing content
    document.execCommand('selectAll', false, null);
    await sleep(50);

    // Use insertText command (works with contenteditable and undo stack)
    const success = document.execCommand('insertText', false, text);

    if (!success) {
      // Fallback: clipboard paste simulation
      try {
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/plain', text);
        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: clipboardData
        });
        editable.dispatchEvent(pasteEvent);
      } catch (e) {
        // Last resort: direct value set
        if (editable.tagName === 'TEXTAREA' || editable.tagName === 'INPUT') {
          editable.value = text;
          editable.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          editable.textContent = text;
          editable.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }

    // Trigger change events
    editable.dispatchEvent(new Event('input', { bubbles: true }));
    editable.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
  }

  // --- Fill tags ---
  async function fillTags(tags) {
    // YouTube Studio tags: look for the chip bar input
    const tagInput = document.querySelector('ytcp-chip-bar input') ||
                     document.querySelector('#tags-container input') ||
                     document.querySelector('[aria-label="Tags"] input') ||
                     document.querySelector('input[placeholder*="tag" i]') ||
                     document.querySelector('input[placeholder*="Tag" i]');

    if (!tagInput) return false;

    tagInput.focus();
    await sleep(100);

    for (const tag of tags) {
      tagInput.value = tag;
      tagInput.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(100);

      // Simulate Enter to confirm the tag
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
      });
      tagInput.dispatchEvent(enterEvent);
      await sleep(150);
    }

    return true;
  }

  // --- Copy All ---
  function handleCopyAll() {
    const title = panel.querySelector('#tp-result-title').value;
    const desc = panel.querySelector('#tp-result-desc').value;
    const tags = panel.querySelector('#tp-result-tags').value;
    const category = panel.querySelector('#tp-result-category').textContent;

    const text = [
      '=== TITLE ===',
      title,
      '',
      '=== DESCRIPTION ===',
      desc,
      '',
      '=== TAGS ===',
      tags,
      '',
      '=== CATEGORY ===',
      category
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      showToast('All metadata copied to clipboard');
    }).catch(() => {
      showToast('Failed to copy — try manually', true);
    });
  }

  // --- Toast ---
  let toastEl = null;
  let toastTimer = null;

  function showToast(msg, isError = false) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'tp-toast';
      document.body.appendChild(toastEl);
    }

    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className = 'tp-toast' + (isError ? ' tp-error' : ' tp-success');

    requestAnimationFrame(() => {
      toastEl.classList.add('tp-visible');
    });

    toastTimer = setTimeout(() => {
      toastEl.classList.remove('tp-visible');
    }, 3000);
  }

  // --- Utility ---
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // --- Init ---
  loadProducts();
  if (isEditPage()) {
    currentVideoId = getVideoId();
    fab = createFAB();
  }
})();
