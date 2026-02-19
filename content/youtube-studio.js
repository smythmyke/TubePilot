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

  function isStudioPage() {
    return location.hostname === 'studio.youtube.com';
  }

  function getVideoId() {
    const match = location.pathname.match(/\/video\/([^/]+)\/edit/);
    return match ? match[1] : null;
  }

  let currentVideoId = null;
  let selectedFile = null;

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

    if (isStudioPage()) {
      currentVideoId = isEditPage() ? getVideoId() : null;
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
    const logo = document.createElement('img');
    logo.src = chrome.runtime.getURL('icons/icon48.png');
    logo.width = 56;
    logo.height = 56;
    btn.appendChild(logo);
    btn.addEventListener('click', togglePanel);
    document.body.appendChild(btn);
    return btn;
  }

  // --- FAB Animation ---
  function setFabWorking(working) {
    if (!fab) return;
    fab.classList.remove('tp-working', 'tp-spinning');
    if (working) fab.classList.add('tp-working');
  }

  function setFabSpinning(spinning) {
    if (!fab) return;
    fab.classList.remove('tp-working', 'tp-spinning');
    if (spinning) fab.classList.add('tp-spinning');
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
    currentVideoId = isEditPage() ? getVideoId() : null;
    loadProducts(() => {
      rebuildProjectDropdown();
    });
    backdrop.classList.add('tp-visible');
    panel.classList.add('tp-visible');
    checkAuthAndUpdateUI();
    updatePanelMode();
  }

  function closePanel() {
    if (panel) panel.classList.remove('tp-visible');
    if (backdrop) backdrop.classList.remove('tp-visible');
  }

  // --- Listen for OPEN_PANEL from popup ---
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OPEN_PANEL') {
      if (!isStudioPage()) {
        sendResponse({ success: false, error: 'not_studio_page' });
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
        <img src="${chrome.runtime.getURL('icons/icon48.png')}" width="28" height="28" style="border-radius:50%;">
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
            <button class="tp-add-product-btn" id="tp-add-product-btn" title="Add product">+</button>
          </div>

          <!-- Inline product form (hidden) -->
          <div class="tp-product-form" id="tp-product-form">
            <div class="tp-product-form-header">New Product</div>
            <div class="tp-field-group">
              <label class="tp-field-label">Name <span class="tp-required">*</span></label>
              <input class="tp-input" type="text" id="tp-pf-name" maxlength="100" placeholder="e.g. MyAwesomeTool">
            </div>
            <div class="tp-field-group">
              <label class="tp-field-label">Link</label>
              <input class="tp-input" type="text" id="tp-pf-link" maxlength="500" placeholder="https://...">
            </div>
            <div class="tp-field-group">
              <label class="tp-field-label">What it does <span class="tp-required">*</span></label>
              <textarea class="tp-input-textarea" id="tp-pf-desc" rows="2" maxlength="2000" placeholder="Key features, what the product does..."></textarea>
            </div>
            <div class="tp-field-group">
              <label class="tp-field-label">SEO Keywords</label>
              <input class="tp-input" type="text" id="tp-pf-keywords" placeholder="comma-separated, e.g. SEO, YouTube, automation">
              <p class="tp-field-hint">Woven into generated tags and description for better discoverability.</p>
            </div>
            <div class="tp-product-form-actions">
              <button class="tp-btn tp-btn-primary" id="tp-pf-save">Save</button>
              <button class="tp-btn tp-btn-secondary" id="tp-pf-cancel">Cancel</button>
            </div>
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

          <!-- Upload section (visible on non-edit pages) -->
          <div id="tp-upload-section" style="display:none;">
            <div class="tp-file-picker" id="tp-file-picker">
              <span class="tp-file-picker-label">Click or drag a video file</span>
              <span class="tp-file-picker-name" id="tp-file-name"></span>
              <input type="file" id="tp-file-input" accept=".mov,.mpeg4,.mp4,.avi,.wmv,.mpegps,.flv,.3gpp,.webm,.mkv,video/*">
            </div>
            <div class="tp-visibility-row">
              <span>Visibility:</span>
              <select class="tp-visibility-select" id="tp-visibility-select">
                <option value="PRIVATE">Private</option>
                <option value="UNLISTED">Unlisted</option>
                <option value="PUBLIC">Public</option>
              </select>
            </div>
          </div>

          <!-- Upload progress -->
          <div class="tp-upload-progress" id="tp-upload-progress" style="display:none;">
            <div class="tp-upload-step" id="tp-step-open">
              <span class="tp-step-indicator"></span>
              <span>Opening upload dialog</span>
            </div>
            <div class="tp-upload-step" id="tp-step-file">
              <span class="tp-step-indicator"></span>
              <span>Selecting file</span>
            </div>
            <div class="tp-upload-step" id="tp-step-details">
              <span class="tp-step-indicator"></span>
              <span>Filling video details</span>
            </div>
            <div class="tp-upload-step" id="tp-step-elements">
              <span class="tp-step-indicator"></span>
              <span>Skipping video elements</span>
            </div>
            <div class="tp-upload-step" id="tp-step-checks">
              <span class="tp-step-indicator"></span>
              <span>Waiting for checks</span>
            </div>
            <div class="tp-upload-step" id="tp-step-visibility">
              <span class="tp-step-indicator"></span>
              <span>Setting visibility</span>
            </div>
            <div class="tp-upload-step" id="tp-step-save">
              <span class="tp-step-indicator"></span>
              <span>Saving &amp; publishing</span>
            </div>
          </div>

          <!-- Made for Kids -->
          <div class="tp-kids-row">
            <span>Kids:</span>
            <select class="tp-kids-select" id="tp-kids-select">
              <option value="no">No, not made for kids</option>
              <option value="yes">Yes, made for kids</option>
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
        <button class="tp-btn tp-btn-primary" id="tp-upload-btn" style="display:none;">Upload &amp; Fill</button>
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

    // Tags info with YouTube limit validation
    const tagsInput = panel.querySelector('#tp-result-tags');
    const tagsInfo = panel.querySelector('#tp-tags-info');
    tagsInput.addEventListener('input', () => {
      const tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
      const totalChars = tags.reduce((sum, t) => sum + t.length, 0);
      const overLength = tags.filter(t => t.length > CONFIG.MAX_SINGLE_TAG_LENGTH);
      let info = tags.length + ' tag' + (tags.length !== 1 ? 's' : '') + ' · ' + totalChars + '/500 chars';
      if (totalChars > CONFIG.MAX_TAG_LENGTH) info += ' (over limit!)';
      if (overLength.length > 0) info += ' · ' + overLength.length + ' tag(s) over 30 chars';
      tagsInfo.textContent = info;
      tagsInfo.style.color = (totalChars > CONFIG.MAX_TAG_LENGTH || overLength.length > 0) ? '#ff4444' : '';
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

    // Inline product form
    const productForm = panel.querySelector('#tp-product-form');
    panel.querySelector('#tp-add-product-btn').addEventListener('click', () => {
      productForm.classList.toggle('tp-visible');
      if (productForm.classList.contains('tp-visible')) {
        panel.querySelector('#tp-pf-name').focus();
      }
    });
    panel.querySelector('#tp-pf-cancel').addEventListener('click', () => {
      productForm.classList.remove('tp-visible');
      clearProductForm();
    });
    panel.querySelector('#tp-pf-save').addEventListener('click', () => {
      const name = panel.querySelector('#tp-pf-name').value.trim();
      const desc = panel.querySelector('#tp-pf-desc').value.trim();
      if (!name) { showToast('Product name is required', true); return; }
      if (!desc) { showToast('Product description is required', true); return; }

      const id = 'p_' + Date.now();
      const product = {
        id,
        name: name.slice(0, 100),
        link: panel.querySelector('#tp-pf-link').value.trim().slice(0, 500),
        features: desc.slice(0, 2000),
        keywords: parseKeywords(panel.querySelector('#tp-pf-keywords').value)
      };

      productsCache.push(product);
      chrome.storage.local.set({ tubepilot_products: productsCache }, () => {
        rebuildProjectDropdown();
        projectSelect.value = id;
        chrome.storage.local.set({ tp_project: id });
        productForm.classList.remove('tp-visible');
        clearProductForm();
        showToast('Product saved');
      });
    });

    function clearProductForm() {
      panel.querySelector('#tp-pf-name').value = '';
      panel.querySelector('#tp-pf-link').value = '';
      panel.querySelector('#tp-pf-desc').value = '';
      panel.querySelector('#tp-pf-keywords').value = '';
    }

    function parseKeywords(str) {
      return str.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);
    }

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

    // File picker
    const filePicker = panel.querySelector('#tp-file-picker');
    const fileInput = panel.querySelector('#tp-file-input');
    const fileName = panel.querySelector('#tp-file-name');

    filePicker.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const error = validateVideoFile(file);
        if (error) {
          showToast(error, true);
          fileInput.value = '';
          return;
        }
        selectedFile = file;
        fileName.textContent = file.name + ' (' + formatFileSize(file.size) + ')';
        filePicker.classList.add('tp-file-selected');
      }
    });

    // Drag and drop on file picker
    filePicker.addEventListener('dragover', (e) => {
      e.preventDefault();
      filePicker.style.borderColor = '#cc0000';
    });
    filePicker.addEventListener('dragleave', () => {
      filePicker.style.borderColor = '';
    });
    filePicker.addEventListener('drop', (e) => {
      e.preventDefault();
      filePicker.style.borderColor = '';
      if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const error = validateVideoFile(file);
        if (!error) {
          selectedFile = file;
          fileName.textContent = file.name + ' (' + formatFileSize(file.size) + ')';
          filePicker.classList.add('tp-file-selected');
          fileInput.files = e.dataTransfer.files;
        } else {
          showToast(error, true);
        }
      }
    });

    // Visibility select persistence
    const visibilitySelect = panel.querySelector('#tp-visibility-select');
    chrome.storage.local.get([CONFIG.VISIBILITY_KEY], (result) => {
      if (result[CONFIG.VISIBILITY_KEY]) {
        visibilitySelect.value = result[CONFIG.VISIBILITY_KEY];
      }
    });
    visibilitySelect.addEventListener('change', () => {
      chrome.storage.local.set({ [CONFIG.VISIBILITY_KEY]: visibilitySelect.value });
    });

    // Kids select persistence
    const kidsSelect = panel.querySelector('#tp-kids-select');
    chrome.storage.local.get(['tubepilot_kids'], (result) => {
      if (result.tubepilot_kids) {
        kidsSelect.value = result.tubepilot_kids;
      }
    });
    kidsSelect.addEventListener('change', () => {
      chrome.storage.local.set({ tubepilot_kids: kidsSelect.value });
    });

    // Upload & Fill button
    panel.querySelector('#tp-upload-btn').addEventListener('click', handleUploadAndFill);
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
    setFabWorking(true);

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
      setFabWorking(false);
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
    const totalChars = tags.reduce((sum, t) => sum + t.length, 0);
    const tagsInfoEl = panel.querySelector('#tp-tags-info');
    tagsInfoEl.textContent = tags.length + ' tag' + (tags.length !== 1 ? 's' : '') + ' · ' + totalChars + '/500 chars';
    tagsInfoEl.style.color = totalChars > CONFIG.MAX_TAG_LENGTH ? '#ff4444' : '';

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
      const tags = sanitizeTags(tagsStr);
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

    const tags = tagsStr ? sanitizeTags(tagsStr) : null;

    const metadata = {};
    if (title) metadata.title = title.slice(0, CONFIG.MAX_TITLE_LENGTH);
    if (description) metadata.description = description.slice(0, CONFIG.MAX_DESCRIPTION_LENGTH);
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

  // --- Panel Mode (edit vs upload) ---
  function updatePanelMode() {
    if (!panel) return;
    const uploadSection = panel.querySelector('#tp-upload-section');
    const fillBtn = panel.querySelector('#tp-fill-btn');
    const uploadBtn = panel.querySelector('#tp-upload-btn');

    if (isEditPage()) {
      uploadSection.style.display = 'none';
      fillBtn.style.display = '';
      uploadBtn.style.display = 'none';
    } else {
      uploadSection.style.display = '';
      fillBtn.style.display = 'none';
      uploadBtn.style.display = '';
    }
  }

  // --- Collect metadata from result fields ---
  function collectMetadata() {
    const title = panel.querySelector('#tp-result-title').value.slice(0, CONFIG.MAX_TITLE_LENGTH);
    const description = panel.querySelector('#tp-result-desc').value.slice(0, CONFIG.MAX_DESCRIPTION_LENGTH);
    const tagsStr = panel.querySelector('#tp-result-tags').value;
    const categoryEl = panel.querySelector('#tp-result-category');
    const categoryId = categoryEl.dataset.categoryId || null;
    const tags = sanitizeTags(tagsStr);
    return { title, description, tags, categoryId };
  }

  // --- Upload Step Progress ---
  let _currentUploadStep = null;

  function resetUploadProgress() {
    _currentUploadStep = null;
    const steps = panel.querySelectorAll('.tp-upload-step');
    steps.forEach(s => {
      s.className = 'tp-upload-step';
      s.querySelector('.tp-step-indicator').textContent = '';
    });
  }

  function setUploadStep(name) {
    _currentUploadStep = name;
    const step = panel.querySelector('#tp-step-' + name);
    if (step) step.className = 'tp-upload-step tp-step-active';
  }

  function completeUploadStep(name) {
    const step = panel.querySelector('#tp-step-' + name);
    if (step) {
      step.className = 'tp-upload-step tp-step-done';
      step.querySelector('.tp-step-indicator').textContent = '\u2713';
    }
  }

  function failUploadStep(name) {
    if (!name) return;
    const step = panel.querySelector('#tp-step-' + name);
    if (step) {
      step.className = 'tp-upload-step tp-step-error';
      step.querySelector('.tp-step-indicator').textContent = '\u2717';
    }
  }

  // --- Upload Orchestrator ---
  async function handleUploadAndFill() {
    if (!selectedFile) {
      showToast('Please select a video file first', true);
      return;
    }

    const metadata = collectMetadata();
    if (!metadata.title) {
      showToast('Please generate metadata first', true);
      return;
    }

    const uploadBtn = panel.querySelector('#tp-upload-btn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';

    const progress = panel.querySelector('#tp-upload-progress');
    progress.style.display = '';
    resetUploadProgress();

    // Minimize panel so user can see the upload dialog
    closePanel();
    setFabSpinning(true);

    try {
      // Step 1: Open upload dialog
      setUploadStep('open');
      await openUploadDialog();
      completeUploadStep('open');

      // Step 2: Select file
      setUploadStep('file');
      await selectFileInDialog();
      completeUploadStep('file');

      // Step 3: Wait for details step and fill metadata
      setUploadStep('details');
      await waitForDetailsStep();
      await fillDetailsStep(metadata);
      completeUploadStep('details');

      // Step 4: Click past Video Elements
      setUploadStep('elements');
      await clickNextButton();
      await sleep(1000);
      completeUploadStep('elements');

      // Step 5: Click past Checks (proceed even if still processing)
      setUploadStep('checks');
      await clickNextButton();
      await waitForChecks();
      completeUploadStep('checks');

      // Step 6: Set visibility
      setUploadStep('visibility');
      await clickNextButton();
      await sleep(1000);
      const visibility = panel.querySelector('#tp-visibility-select').value;
      await selectVisibility(visibility);
      completeUploadStep('visibility');

      // Step 7: Save
      setUploadStep('save');
      await clickSaveButton();
      const shareUrl = await handlePublishedDialog();
      completeUploadStep('save');

      if (shareUrl) {
        showToast('Published! URL copied to clipboard');
      } else {
        showToast('Video uploaded successfully!');
      }
    } catch (err) {
      failUploadStep(_currentUploadStep);
      showToast('Upload failed: ' + err.message, true);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload & Fill';
      setFabSpinning(false);
    }
  }

  // --- Upload Step Functions ---
  async function openUploadDialog() {
    const createBtn = await waitForElement(CONFIG.SELECTORS.CREATE_BUTTON);
    clickElement(createBtn);
    await sleep(800);

    const uploadItem = await waitForElement(CONFIG.SELECTORS.UPLOAD_MENU_ITEM);
    clickElement(uploadItem);
    await sleep(1500);

    await waitForElement(CONFIG.SELECTORS.UPLOAD_DIALOG);
  }

  async function selectFileInDialog() {
    const dialog = document.querySelector(CONFIG.SELECTORS.UPLOAD_DIALOG);
    if (!dialog) throw new Error('Upload dialog not found');

    // Try setting the file input directly
    const fileInput = dialog.querySelector('input[type="file"]');
    if (fileInput) {
      const dt = new DataTransfer();
      dt.items.add(selectedFile);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(2000);
      return;
    }

    // Fallback: try drag-and-drop
    const dropTarget = dialog.querySelector('#content') || dialog;
    await attemptDragDrop(dropTarget);
    await sleep(2000);
  }

  async function attemptDragDrop(target) {
    const dt = new DataTransfer();
    dt.items.add(selectedFile);
    target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
    await sleep(100);
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
    await sleep(100);
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    await sleep(500);
  }

  async function waitForDetailsStep() {
    await waitForElement(CONFIG.SELECTORS.TITLE_TEXTAREA, 30000);
    await sleep(500);
  }

  async function fillDetailsStep(metadata) {
    if (metadata.title) {
      await fillField(CONFIG.SELECTORS.TITLE_TEXTAREA, metadata.title);
      await sleep(300);
    }

    if (metadata.description) {
      await fillField(CONFIG.SELECTORS.DESCRIPTION_TEXTAREA, metadata.description);
      await sleep(300);
    }

    // Expand "Show more" to reveal tags + audience settings
    const toggleBtn = document.querySelector(CONFIG.SELECTORS.TOGGLE_BUTTON);
    if (toggleBtn) {
      clickElement(toggleBtn);
      await sleep(800);

      // Scroll down to reveal expanded fields
      const scrollable = document.querySelector(CONFIG.SELECTORS.SCROLLABLE_CONTENT);
      if (scrollable) {
        scrollable.scrollTop = scrollable.scrollHeight;
        await sleep(300);
      }

      // Fill tags
      if (metadata.tags && metadata.tags.length > 0) {
        await fillTags(metadata.tags);
        await sleep(300);
      }

      // Set Made for Kids
      const kidsValue = panel.querySelector('#tp-kids-select').value;
      const kidsSelector = kidsValue === 'yes'
        ? CONFIG.SELECTORS.KIDS_YES_RADIO
        : CONFIG.SELECTORS.KIDS_NO_RADIO;
      const kidsRadio = document.querySelector(kidsSelector);
      if (kidsRadio) {
        clickElement(kidsRadio);
        await sleep(300);
      }
    }
  }

  async function clickNextButton() {
    const nextBtn = await waitForElement(CONFIG.SELECTORS.NEXT_BUTTON);
    await waitForEnabled(nextBtn);
    clickElement(nextBtn);
    await sleep(1500);
  }

  async function waitForChecks(timeout) {
    timeout = timeout || 120000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const successIcon = document.querySelector(CONFIG.SELECTORS.CHECK_SUCCESS_ICON);
      if (successIcon) return;

      const progressLabel = document.querySelector(CONFIG.SELECTORS.CHECK_PROGRESS_LABEL);
      if (progressLabel) {
        const text = progressLabel.textContent.toLowerCase();
        if (text.includes('no issues') || text.includes('complete')) return;
      }

      await sleep(2000);
    }
    // Proceed anyway if checks didn't complete within timeout
  }

  async function selectVisibility(visibility) {
    const selectorMap = {
      PRIVATE: CONFIG.SELECTORS.PRIVATE_RADIO,
      UNLISTED: CONFIG.SELECTORS.UNLISTED_RADIO,
      PUBLIC: CONFIG.SELECTORS.PUBLIC_RADIO
    };
    const radioSelector = selectorMap[visibility] || selectorMap.PRIVATE;
    const radio = await waitForElement(radioSelector);
    clickElement(radio);
    await sleep(500);
  }

  async function clickSaveButton() {
    const doneBtn = await waitForElement(CONFIG.SELECTORS.DONE_BUTTON);
    await waitForEnabled(doneBtn);
    clickElement(doneBtn);
    await sleep(3000);
  }

  async function handlePublishedDialog() {
    try {
      const shareUrlEl = await waitForElement(CONFIG.SELECTORS.SHARE_URL, 10000);
      const url = shareUrlEl.value || shareUrlEl.textContent || '';
      if (url) {
        await navigator.clipboard.writeText(url);
      }

      const closeBtn = document.querySelector(CONFIG.SELECTORS.CLOSE_BUTTON) ||
                        document.querySelector(CONFIG.SELECTORS.CLOSE_ICON_BUTTON);
      if (closeBtn) {
        await sleep(500);
        clickElement(closeBtn);
      }

      return url;
    } catch {
      return null;
    }
  }

  // --- DOM Helpers ---
  async function waitForElement(selector, timeout) {
    timeout = timeout || 10000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(300);
    }
    throw new Error('Timed out waiting for: ' + selector);
  }

  async function waitForEnabled(el, timeout) {
    timeout = timeout || 10000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!el.disabled && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true') return;
      await sleep(300);
    }
  }

  function clickElement(el) {
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    el.click();
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

  // --- Video File Validation ---
  const YOUTUBE_ALLOWED_EXTENSIONS = ['mov', 'mpeg4', 'mp4', 'avi', 'wmv', 'mpegps', 'flv', '3gpp', 'webm', 'mkv', 'mpeg', 'mpg', 'm4v'];
  const MAX_FILE_SIZE_GB = 256;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024;

  function validateVideoFile(file) {
    if (!file) return 'No file selected';

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!YOUTUBE_ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported format (.${ext}). YouTube accepts: ${YOUTUBE_ALLOWED_EXTENSIONS.join(', ')}`;
    }

    if (!file.type.startsWith('video/') && file.type !== '') {
      return 'This does not appear to be a video file';
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(1);
      return `File too large (${sizeGB} GB). YouTube max is ${MAX_FILE_SIZE_GB} GB`;
    }

    if (file.size === 0) {
      return 'File is empty (0 bytes)';
    }

    return null;
  }

  // Enforce YouTube tag limits: 30 chars each, 500 chars total
  function sanitizeTags(tagsStr) {
    const raw = tagsStr.split(',').map(t => t.replace(/[<>]/g, '').trim()).filter(Boolean);
    const tags = [];
    let total = 0;
    for (const tag of raw) {
      const trimmed = tag.slice(0, CONFIG.MAX_SINGLE_TAG_LENGTH);
      if (total + trimmed.length > CONFIG.MAX_TAG_LENGTH) break;
      total += trimmed.length;
      tags.push(trimmed);
    }
    return tags;
  }

  function formatFileSize(bytes) {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  }

  // --- Init ---
  loadProducts();
  if (isStudioPage()) {
    currentVideoId = isEditPage() ? getVideoId() : null;
    fab = createFAB();
  }
})();
