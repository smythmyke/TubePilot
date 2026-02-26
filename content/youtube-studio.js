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

  function hasCreateButton() {
    return !!document.querySelector('ytcp-button.ytcpAppHeaderCreateIcon');
  }

  function getVideoId() {
    const match = location.pathname.match(/\/video\/([^/]+)\/edit/);
    return match ? match[1] : null;
  }

  let currentVideoId = null;
  let selectedFile = null;
  let _uploadCancelled = false;
  let _activeUploadXhr = null;

  // --- Extension Context Guard ---
  function isExtensionValid() {
    try { return !!chrome.runtime?.id; } catch { return false; }
  }

  // --- Products Cache ---
  let productsCache = [];

  function loadProducts(callback) {
    if (!isExtensionValid()) return;
    chrome.storage.local.get(['tubepilot_products'], (result) => {
      productsCache = result.tubepilot_products || [];
      if (callback) callback();
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (!isExtensionValid()) return;
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

  const navInterval = setInterval(() => {
    if (!isExtensionValid()) { clearInterval(navInterval); return; }
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
    if (!isExtensionValid()) {
      showToast('Extension updated — please refresh the page', 'error');
      return;
    }
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

  // --- Listen for messages from popup ---
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isExtensionValid()) return;
    if (message.type === 'CHECK_PAGE') {
      sendResponse({
        isStudioPage: isStudioPage(),
        isEditPage: isEditPage(),
        hasCreateButton: hasCreateButton()
      });
      return;
    }
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
      <div class="tp-panel-tabs">
        <button class="tp-panel-tab tp-panel-tab-active" id="tp-tab-generator">Generator</button>
        <button class="tp-panel-tab" id="tp-tab-history">History</button>
      </div>
      <div class="tp-panel-body">
        <div id="tp-view-generator">
        <!-- Auth required state -->
        <div class="tp-auth-required" id="tp-auth-required">
          <p>Sign in to generate AI-powered YouTube metadata</p>
          <button class="tp-btn tp-btn-primary" id="tp-sign-in-btn">Sign in with Google</button>
        </div>

        <!-- Main content (hidden until auth) -->
        <div class="tp-main-content" id="tp-main-content" style="display:none;">
          <!-- YouTube connect banner (shown when no channels) -->
          <div class="tp-yt-connect" id="tp-yt-connect" style="display:none;">
            <span>Add a YouTube channel for uploads &amp; playlists</span>
            <button class="tp-btn tp-btn-secondary tp-btn-small" id="tp-yt-connect-btn">Add Channel</button>
          </div>

          <!-- Channel selector dropdown (multi-channel) -->
          <div class="tp-channel-selector" id="tp-channel-selector" style="display:none;">
            <button class="tp-channel-selector-btn" id="tp-channel-selector-btn" type="button">
              <img class="tp-channel-avatar" id="tp-channel-avatar" src="" alt="">
              <div class="tp-channel-info">
                <div class="tp-channel-name" id="tp-channel-name"></div>
                <div class="tp-channel-stats" id="tp-channel-stats"></div>
              </div>
              <span class="tp-channel-chevron" id="tp-channel-chevron">&#9662;</span>
            </button>
            <div class="tp-channel-dropdown" id="tp-channel-dropdown">
              <div class="tp-channel-dropdown-list" id="tp-channel-dropdown-list">
                <!-- Populated dynamically by rebuildChannelDropdown() -->
              </div>
              <div class="tp-channel-add-footer">
                <button id="tp-add-channel-dropdown-btn" type="button">+ Add Channel</button>
              </div>
            </div>
          </div>

          <!-- Quota display bar -->
          <div class="tp-quota-bar" id="tp-quota-bar" style="display:none;">
            <div class="tp-quota-track">
              <div class="tp-quota-fill" id="tp-quota-fill" style="width:0%"></div>
            </div>
            <div class="tp-quota-text" id="tp-quota-text">0 / 10,000 units</div>
          </div>

          <!-- Channel context toggle -->
          <div class="tp-checkbox-row" id="tp-channel-context-row" style="display:none;">
            <label><input type="checkbox" id="tp-use-channel-context" checked> Use channel context for AI</label>
          </div>

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

          <!-- Playlist dropdown (populated when YouTube connected) -->
          <div class="tp-project-row" id="tp-playlist-row" style="display:none;">
            <span>Playlist:</span>
            <select class="tp-project-select" id="tp-playlist-select">
              <option value="none">No playlist</option>
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
            <button class="tp-btn tp-btn-secondary tp-cancel-upload-btn" id="tp-cancel-upload" style="margin-top:8px;width:100%;">Cancel Upload</button>
          </div>

          <!-- API upload progress (separate from DOM progress) -->
          <div class="tp-api-upload-progress" id="tp-api-upload-progress" style="display:none;">
            <div class="tp-api-upload-status" id="tp-api-upload-status">Initiating upload...</div>
            <div class="tp-api-upload-track">
              <div class="tp-api-upload-fill" id="tp-api-upload-fill"></div>
            </div>
            <div class="tp-api-upload-bytes" id="tp-api-upload-bytes"></div>
            <button class="tp-btn tp-btn-secondary tp-cancel-upload-btn" id="tp-cancel-api-upload" style="margin-top:8px;width:100%;">Cancel Upload</button>
          </div>

          <!-- Advanced section (collapsible) -->
          <button class="tp-advanced-toggle" id="tp-advanced-toggle">Advanced &#9656;</button>
          <div class="tp-advanced-content" id="tp-advanced-content">
            <div class="tp-project-row">
              <span>Kids:</span>
              <select class="tp-project-select" id="tp-kids-select">
                <option value="no">No, not made for kids</option>
                <option value="yes">Yes, made for kids</option>
              </select>
            </div>
            <div class="tp-project-row">
              <span>Language:</span>
              <select class="tp-project-select" id="tp-language-select">
                <option value="">Channel default</option>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="pt">Portuguese</option>
                <option value="hi">Hindi</option>
                <option value="ja">Japanese</option>
                <option value="ko">Korean</option>
                <option value="zh">Chinese</option>
                <option value="ar">Arabic</option>
                <option value="ru">Russian</option>
                <option value="it">Italian</option>
                <option value="nl">Dutch</option>
              </select>
            </div>
            <div class="tp-project-row">
              <span>Comments:</span>
              <select class="tp-project-select" id="tp-comments-select">
                <option value="on">On</option>
                <option value="hold">Hold for review</option>
                <option value="off">Off</option>
              </select>
            </div>
            <div class="tp-checkbox-row">
              <label><input type="checkbox" id="tp-paid-promo"> Paid promotion</label>
            </div>
            <div class="tp-checkbox-row">
              <label><input type="checkbox" id="tp-altered-content"> AI / altered content</label>
            </div>
            <div class="tp-field-group">
              <label class="tp-field-label">Additional Context</label>
              <input class="tp-input" type="text" id="tp-channel-context" maxlength="500" placeholder="Extra instructions for AI generation...">
            </div>
          </div>

          <!-- Video description input -->
          <div class="tp-field-group">
            <label class="tp-field-label">Video Description <span class="tp-required">*</span></label>
            <p class="tp-field-hint">Briefly describe your video content. The AI uses this to generate metadata.</p>
            <textarea class="tp-input-textarea" id="tp-video-desc" rows="4" maxlength="3000" placeholder="What is this video about? Key topics, target audience..."></textarea>
            <div class="tp-char-count"><span id="tp-desc-count">0</span>/3000</div>
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
              <label class="tp-field-label">Category</label>
              <select class="tp-category-select" id="tp-result-category">
                <option value="">— Select category —</option>
                ${Object.entries(CONFIG.YOUTUBE_CATEGORIES).map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
        </div>
        <div id="tp-view-history" style="display:none;">
          <div class="tp-history-header">
            <span class="tp-history-title">Upload History</span>
            <button class="tp-btn tp-btn-secondary tp-btn-small" id="tp-clear-history">Clear</button>
          </div>
          <div id="tp-history-list" class="tp-history-list">
            <div class="tp-history-empty">No uploads recorded yet.</div>
          </div>
        </div>
      </div>

      <!-- Footer (shown when results exist) -->
      <div class="tp-panel-footer" id="tp-panel-footer" style="display:none;">
        <button class="tp-btn tp-btn-primary" id="tp-fill-btn">Fill Form</button>
        <button class="tp-btn tp-btn-primary" id="tp-upload-btn" style="display:none;">Upload &amp; Fill</button>
        <button class="tp-btn tp-btn-secondary" id="tp-copy-btn">Copy All</button>
        <button class="tp-btn tp-btn-secondary" id="tp-new-upload-btn" style="display:none;">New Upload</button>
      </div>
    `;

    document.body.appendChild(panel);
    wireUpPanel();
  }

  // --- Wire Up Panel Events ---
  function wireUpPanel() {
    panel.querySelector('.tp-close-btn').addEventListener('click', closePanel);

    // Tab switching (Generator / History)
    panel.querySelector('#tp-tab-generator').addEventListener('click', () => switchTab('generator'));
    panel.querySelector('#tp-tab-history').addEventListener('click', () => switchTab('history'));

    // Clear history button
    panel.querySelector('#tp-clear-history').addEventListener('click', clearUploadHistory);

    // Channel dropdown toggle
    const channelBtn = panel.querySelector('#tp-channel-selector-btn');
    const channelDropdown = panel.querySelector('#tp-channel-dropdown');
    if (channelBtn && channelDropdown) {
      channelBtn.addEventListener('click', () => {
        channelDropdown.classList.toggle('tp-visible');
        const chevron = panel.querySelector('#tp-channel-chevron');
        if (chevron) chevron.innerHTML = channelDropdown.classList.contains('tp-visible') ? '&#9652;' : '&#9662;';
      });
      // Click outside to close
      document.addEventListener('click', (e) => {
        if (!panel.querySelector('#tp-channel-selector')?.contains(e.target)) {
          channelDropdown.classList.remove('tp-visible');
          const chevron = panel.querySelector('#tp-channel-chevron');
          if (chevron) chevron.innerHTML = '&#9662;';
        }
      });
    }

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

    // Playlist selection persistence (per-channel)
    panel.querySelector('#tp-playlist-select').addEventListener('change', async () => {
      const playlistId = panel.querySelector('#tp-playlist-select').value;
      // Save per-channel playlist selection
      const selectedId = await getSelectedChannelIdFromStorage();
      if (selectedId) {
        const result = await chrome.storage.local.get([CONFIG.CHANNEL_PLAYLIST_KEY]);
        const map = result[CONFIG.CHANNEL_PLAYLIST_KEY] || {};
        map[selectedId] = playlistId;
        chrome.storage.local.set({ [CONFIG.CHANNEL_PLAYLIST_KEY]: map });
      }
      // Also save legacy key
      chrome.storage.local.set({ tubepilot_last_playlist: playlistId });
    });

    // YouTube connect / Add Channel button (zero-channels state)
    panel.querySelector('#tp-yt-connect-btn').addEventListener('click', () => handleAddChannelClick());

    // Add Channel button in dropdown footer
    panel.querySelector('#tp-add-channel-dropdown-btn').addEventListener('click', () => handleAddChannelClick());

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
      if (!isExtensionValid()) { showToast('Extension updated — please refresh the page', 'error'); return; }
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

    // Advanced section toggle
    const advToggle = panel.querySelector('#tp-advanced-toggle');
    const advContent = panel.querySelector('#tp-advanced-content');
    advToggle.addEventListener('click', () => {
      const isOpen = advContent.classList.toggle('tp-visible');
      advToggle.innerHTML = isOpen ? 'Advanced &#9662;' : 'Advanced &#9656;';
    });

    // Advanced settings persistence
    const advKeys = ['tubepilot_language', 'tubepilot_comments', 'tubepilot_paid_promo', 'tubepilot_altered_content'];
    chrome.storage.local.get(advKeys, (result) => {
      if (result.tubepilot_language) panel.querySelector('#tp-language-select').value = result.tubepilot_language;
      if (result.tubepilot_comments) panel.querySelector('#tp-comments-select').value = result.tubepilot_comments;
      if (result.tubepilot_paid_promo) panel.querySelector('#tp-paid-promo').checked = true;
      if (result.tubepilot_altered_content) panel.querySelector('#tp-altered-content').checked = true;
    });
    panel.querySelector('#tp-language-select').addEventListener('change', (e) => {
      chrome.storage.local.set({ tubepilot_language: e.target.value });
    });
    panel.querySelector('#tp-comments-select').addEventListener('change', (e) => {
      chrome.storage.local.set({ tubepilot_comments: e.target.value });
    });
    panel.querySelector('#tp-paid-promo').addEventListener('change', (e) => {
      chrome.storage.local.set({ tubepilot_paid_promo: e.target.checked });
    });
    panel.querySelector('#tp-altered-content').addEventListener('change', (e) => {
      chrome.storage.local.set({ tubepilot_altered_content: e.target.checked });
    });

    // Upload & Fill button
    panel.querySelector('#tp-upload-btn').addEventListener('click', handleUploadAndFill);

    // New Upload button (reset panel for next video)
    panel.querySelector('#tp-new-upload-btn').addEventListener('click', resetPanelForNewUpload);

    // Cancel upload button (DOM)
    panel.querySelector('#tp-cancel-upload').addEventListener('click', cancelUpload);

    // Cancel upload button (API)
    panel.querySelector('#tp-cancel-api-upload').addEventListener('click', cancelApiUpload);
  }

  // --- Auth Check ---
  async function checkAuthAndUpdateUI() {
    if (!isExtensionValid()) { showToast('Extension updated — please refresh the page', 'error'); return; }
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
    // Check YouTube scope and load channel data
    loadChannelData();
  }

  async function loadChannelData() {
    if (!isExtensionValid()) return;
    try {
      // Load multi-channel data
      const resp = await chrome.runtime.sendMessage({ type: 'GET_CONNECTED_CHANNELS' });
      if (!resp || !resp.success) {
        showYouTubeConnect();
        return;
      }

      const channels = resp.channels || {};
      const channelIds = Object.keys(channels);

      if (channelIds.length === 0) {
        // No channels — try legacy cache before showing connect banner
        const cacheResp = await chrome.runtime.sendMessage({ type: 'GET_CHANNEL_CACHE' });
        if (cacheResp && cacheResp.data && cacheResp.data.channelId) {
          displayChannelProfile(cacheResp.data);
          return;
        }
        showYouTubeConnect();
        return;
      }

      // Determine selected channel
      const selResp = await chrome.storage.local.get([CONFIG.SELECTED_CHANNEL_KEY]);
      let selectedId = selResp[CONFIG.SELECTED_CHANNEL_KEY];
      if (!selectedId || !channels[selectedId]) {
        selectedId = channelIds[0];
        chrome.runtime.sendMessage({ type: 'SET_SELECTED_CHANNEL', channelId: selectedId });
      }

      // Display the selected channel profile
      const selected = channels[selectedId];
      displayChannelProfile(selected);

      // Rebuild the multi-channel dropdown
      rebuildChannelDropdown(channels, selectedId);
    } catch {
      showYouTubeConnect();
    }
  }

  function displayChannelProfile(data) {
    if (!panel) return;
    panel.querySelector('#tp-yt-connect').style.display = 'none';
    panel.querySelector('#tp-channel-context-row').style.display = '';

    const selector = panel.querySelector('#tp-channel-selector');
    selector.style.display = '';

    const avatar = panel.querySelector('#tp-channel-avatar');
    avatar.src = data.channelAvatar || '';
    avatar.alt = data.channelName || '';

    // Show "(expired)" in amber if token is expired
    const isExpired = data.tokenExpiresAt && Date.now() >= data.tokenExpiresAt;
    const nameEl = panel.querySelector('#tp-channel-name');
    if (isExpired) {
      nameEl.innerHTML = '';
      nameEl.appendChild(document.createTextNode(data.channelName || ''));
      const expLabel = document.createElement('span');
      expLabel.className = 'tp-channel-expired-label';
      expLabel.textContent = ' (expired)';
      nameEl.appendChild(expLabel);
    } else {
      nameEl.textContent = data.channelName || '';
    }

    const stats = [];
    if (data.subscriberCount) {
      stats.push(formatCount(data.subscriberCount) + ' subscribers');
    }
    if (data.videoCount) {
      stats.push(data.videoCount + ' videos');
    }
    panel.querySelector('#tp-channel-stats').textContent = stats.join(' · ');

    // Rebuild playlist dropdown if playlists available
    if (data.playlists) {
      rebuildPlaylistDropdown(data.playlists, data.channelId);
    }

    // Update quota display
    updateQuotaDisplay();
  }

  /**
   * Rebuild the multi-channel dropdown list with all connected channels.
   */
  function rebuildChannelDropdown(channels, selectedId) {
    if (!panel) return;
    const list = panel.querySelector('#tp-channel-dropdown-list');
    if (!list) return;

    list.innerHTML = '';
    const channelIds = Object.keys(channels);

    for (const chId of channelIds) {
      const ch = channels[chId];
      const isSelected = chId === selectedId;
      const isExpired = ch.tokenExpiresAt && Date.now() >= ch.tokenExpiresAt;

      const item = document.createElement('div');
      item.className = 'tp-channel-dropdown-item' + (isSelected ? ' tp-channel-current' : '');
      item.dataset.channelId = chId;

      // Checkmark
      const check = document.createElement('span');
      check.className = 'tp-channel-check';
      check.textContent = isSelected ? '\u2713' : '';
      item.appendChild(check);

      // Avatar
      const avatar = document.createElement('img');
      avatar.className = 'tp-channel-avatar-small';
      avatar.src = ch.channelAvatar || '';
      avatar.alt = '';
      item.appendChild(avatar);

      // Info
      const info = document.createElement('div');
      info.className = 'tp-channel-dropdown-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'tp-channel-dropdown-name';
      nameEl.textContent = ch.channelName || chId;
      if (isExpired) {
        const expLabel = document.createElement('span');
        expLabel.className = 'tp-channel-expired-label';
        expLabel.textContent = ' (expired)';
        nameEl.appendChild(expLabel);
      }
      info.appendChild(nameEl);

      const idEl = document.createElement('div');
      idEl.className = 'tp-channel-dropdown-id';
      idEl.textContent = chId;
      info.appendChild(idEl);

      item.appendChild(info);

      // Action buttons
      const actions = document.createElement('div');
      actions.className = 'tp-channel-dropdown-actions';

      if (isExpired) {
        const reconnectBtn = document.createElement('button');
        reconnectBtn.className = 'tp-btn-reconnect';
        reconnectBtn.title = 'Reconnect';
        reconnectBtn.innerHTML = '&#8635;'; // ↻
        reconnectBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleReconnectClick(chId);
        });
        actions.appendChild(reconnectBtn);
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'tp-btn-remove-channel';
      removeBtn.title = 'Remove channel';
      removeBtn.textContent = '\u00d7'; // ×
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleRemoveChannelClick(chId, ch.channelName || chId);
      });
      actions.appendChild(removeBtn);

      item.appendChild(actions);

      // Click to select (only if not expired or if it's a different channel)
      item.addEventListener('click', () => {
        if (!isSelected) {
          selectChannel(chId);
        }
        // Close dropdown
        const dropdown = panel.querySelector('#tp-channel-dropdown');
        if (dropdown) dropdown.classList.remove('tp-visible');
        const chevron = panel.querySelector('#tp-channel-chevron');
        if (chevron) chevron.innerHTML = '&#9662;';
      });

      list.appendChild(item);
    }
  }

  /**
   * Select a channel: persist selection, reload UI.
   */
  async function selectChannel(channelId) {
    if (!isExtensionValid()) return;
    try {
      await chrome.runtime.sendMessage({ type: 'SET_SELECTED_CHANNEL', channelId });
      // Reload channel data to update the UI
      loadChannelData();
    } catch {
      showToast('Failed to switch channel', true);
    }
  }

  /**
   * Handle "Add Channel" button click (both in connect banner and dropdown).
   */
  async function handleAddChannelClick() {
    if (!isExtensionValid()) return;
    const connectBtn = panel.querySelector('#tp-yt-connect-btn');
    if (connectBtn) {
      connectBtn.disabled = true;
      connectBtn.textContent = 'Connecting...';
    }
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'ADD_CHANNEL' });
      if (resp && resp.success) {
        showToast('Channel added: ' + (resp.data.channelName || 'Connected'));
        loadChannelData();
      } else {
        showToast(resp?.error || 'Failed to add channel', true);
      }
    } catch (err) {
      showToast('Failed to add channel: ' + (err.message || 'unknown error'), true);
    } finally {
      if (connectBtn) {
        connectBtn.disabled = false;
        connectBtn.textContent = 'Add Channel';
      }
    }
  }

  /**
   * Handle reconnect button click for an expired channel.
   */
  async function handleReconnectClick(channelId) {
    if (!isExtensionValid()) return;
    try {
      showToast('Reconnecting...');
      const resp = await chrome.runtime.sendMessage({ type: 'RECONNECT_CHANNEL', channelId });
      if (resp && resp.success) {
        showToast('Channel reconnected: ' + (resp.data.channelName || 'OK'));
        loadChannelData();
      } else {
        showToast(resp?.error || 'Reconnect failed', true);
      }
    } catch (err) {
      showToast('Reconnect failed: ' + (err.message || 'unknown error'), true);
    }
  }

  /**
   * Handle remove channel button click.
   */
  async function handleRemoveChannelClick(channelId, channelName) {
    if (!isExtensionValid()) return;
    if (!confirm(`Remove "${channelName}" from TubePilot?`)) return;
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'REMOVE_CHANNEL', channelId });
      if (resp && resp.success) {
        showToast('Channel removed');
        loadChannelData();
      } else {
        showToast(resp?.error || 'Failed to remove channel', true);
      }
    } catch {
      showToast('Failed to remove channel', true);
    }
  }

  /**
   * Helper to get the selected channel ID from storage.
   */
  async function getSelectedChannelIdFromStorage() {
    const result = await chrome.storage.local.get([CONFIG.SELECTED_CHANNEL_KEY]);
    return result[CONFIG.SELECTED_CHANNEL_KEY] || '';
  }

  function showYouTubeConnect() {
    if (!panel) return;
    panel.querySelector('#tp-channel-selector').style.display = 'none';
    panel.querySelector('#tp-quota-bar').style.display = 'none';
    panel.querySelector('#tp-playlist-row').style.display = 'none';
    panel.querySelector('#tp-channel-context-row').style.display = 'none';
    panel.querySelector('#tp-yt-connect').style.display = '';
  }

  function showChannelLoading() {
    if (!panel) return;
    panel.querySelector('#tp-yt-connect').style.display = 'none';
    panel.querySelector('#tp-channel-selector').style.display = '';
    panel.querySelector('#tp-channel-name').textContent = 'Loading...';
    panel.querySelector('#tp-channel-stats').textContent = '';
    panel.querySelector('#tp-channel-avatar').src = '';
  }

  async function updateQuotaDisplay() {
    if (!panel || !isExtensionValid()) return;
    try {
      const status = await chrome.runtime.sendMessage({ type: 'GET_QUOTA_STATUS' });
      if (!status || !status.success) return;

      const bar = panel.querySelector('#tp-quota-bar');
      const fill = panel.querySelector('#tp-quota-fill');
      const text = panel.querySelector('#tp-quota-text');
      if (!bar || !fill || !text) return;

      bar.style.display = '';
      const pct = Math.min(status.percentage, 100);
      fill.style.width = pct + '%';

      // Color coding
      fill.classList.remove('tp-quota-green', 'tp-quota-yellow', 'tp-quota-red');
      if (pct >= 90) fill.classList.add('tp-quota-red');
      else if (pct >= 70) fill.classList.add('tp-quota-yellow');
      else fill.classList.add('tp-quota-green');

      const uploadsText = status.uploadsRemaining !== undefined
        ? ` · ~${status.uploadsRemaining} upload${status.uploadsRemaining !== 1 ? 's' : ''} remaining`
        : '';
      text.textContent = `${status.used.toLocaleString()} / ${status.limit.toLocaleString()} units${uploadsText}`;
    } catch {
      // Quota display is non-critical
    }
  }

  function formatCount(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  function rebuildPlaylistDropdown(playlists, channelId) {
    if (!panel) return;
    const select = panel.querySelector('#tp-playlist-select');
    const row = panel.querySelector('#tp-playlist-row');
    if (!select || !row) return;

    select.innerHTML = '<option value="none">No playlist</option>';
    for (const pl of playlists) {
      const opt = document.createElement('option');
      opt.value = pl.id;
      opt.textContent = pl.title;
      select.appendChild(opt);
    }

    // Restore per-channel playlist selection
    chrome.storage.local.get([CONFIG.CHANNEL_PLAYLIST_KEY, 'tubepilot_last_playlist'], (result) => {
      const perChannel = result[CONFIG.CHANNEL_PLAYLIST_KEY] || {};
      const lastId = (channelId && perChannel[channelId]) || result.tubepilot_last_playlist;
      if (lastId && select.querySelector(`option[value="${lastId}"]`)) {
        select.value = lastId;
      }
    });

    // Show the row if there are playlists
    row.style.display = playlists.length > 0 ? '' : 'none';
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

  // --- Build Channel Context for AI ---
  async function buildChannelContext() {
    const parts = [];
    const useChannelCtx = panel?.querySelector('#tp-use-channel-context')?.checked !== false;
    try {
      if (useChannelCtx) {
        // Try selected channel from multi-channel storage first
        let ch = null;
        const selectedId = await getSelectedChannelIdFromStorage();
        if (selectedId) {
          const resp = await chrome.runtime.sendMessage({ type: 'GET_CONNECTED_CHANNELS' });
          if (resp && resp.success && resp.channels[selectedId]) {
            ch = resp.channels[selectedId];
          }
        }
        // Fall back to legacy cache
        if (!ch) {
          const resp = await chrome.runtime.sendMessage({ type: 'GET_CHANNEL_CACHE' });
          if (resp && resp.data) ch = resp.data;
        }
        if (ch) {
          if (ch.channelName) parts.push(`Channel: ${ch.channelName}`);
          if (ch.channelDescription) parts.push(`About: ${ch.channelDescription}`);
          if (ch.channelKeywords && ch.channelKeywords.length > 0) {
            parts.push(`Channel keywords: ${ch.channelKeywords.join(', ')}`);
          }
          if (ch.subscriberCount) parts.push(`Subscribers: ${formatCount(ch.subscriberCount)}`);
        }
      }
    } catch {
      // No channel data available
    }

    // Add user's optional additional context
    const additionalContext = panel.querySelector('#tp-channel-context');
    if (additionalContext && additionalContext.value.trim()) {
      parts.push(`Additional: ${additionalContext.value.trim()}`);
    }

    return parts.join('\n');
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
    if (!isExtensionValid()) { showToast('Extension updated — please refresh the page', 'error'); return; }
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

    // Build channel context from cached YouTube data + optional additional context
    const channelContext = await buildChannelContext();

    try {
      console.log('[TubePilot] Sending GENERATE_YOUTUBE_META', { descLength: videoDesc.length, hasProduct: !!product, hasChannel: !!channelContext });
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_YOUTUBE_META',
        videoDescription: videoDesc,
        product: product || null,
        channelContext: channelContext
      });

      console.log('[TubePilot] Got response:', JSON.stringify(response).slice(0, 500));

      if (response.error) {
        console.error('[TubePilot] Response error:', response.error);
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
      console.error('[TubePilot] Generation catch error:', err);
      showToast('Generation failed: ' + (err.message || 'unknown error'), true);
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
    if (data.categoryId) {
      categoryEl.value = String(data.categoryId);
    } else {
      categoryEl.value = '';
    }

    results.style.display = '';
    footer.style.display = '';
  }

  // --- Fill YouTube Studio Form (Strategy Dispatcher) ---
  async function handleFillForm() {
    if (!isExtensionValid()) { showToast('Extension updated — please refresh the page', 'error'); return; }
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
    } catch {
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
    const categoryId = panel.querySelector('#tp-result-category').value || null;

    const tags = tagsStr ? sanitizeTags(tagsStr) : null;

    const metadata = {};
    if (title) metadata.title = title.slice(0, CONFIG.MAX_TITLE_LENGTH);
    if (description) metadata.description = description.slice(0, CONFIG.MAX_DESCRIPTION_LENGTH);
    if (tags && tags.length > 0) metadata.tags = tags;
    if (categoryId) metadata.categoryId = categoryId;

    // Include selected channel ID for per-channel token routing
    const selectedChannelId = await getSelectedChannelIdFromStorage();

    const resp = await chrome.runtime.sendMessage({
      type: 'APPLY_VIA_API',
      videoId,
      metadata,
      channelId: selectedChannelId || undefined
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
    const strategyRow = panel.querySelector('.tp-strategy-row');

    // Strategy dropdown visible on both edit and upload pages
    if (strategyRow) strategyRow.style.display = '';

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
    const categoryId = panel.querySelector('#tp-result-category').value || null;
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

  // --- Cancel Upload ---
  function cancelUpload() {
    _uploadCancelled = true;
    const progress = panel.querySelector('#tp-upload-progress');
    progress.style.display = 'none';
    resetUploadProgress();
    const uploadBtn = panel.querySelector('#tp-upload-btn');
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload & Fill';
    setFabSpinning(false);

    // Try to close any open YouTube upload dialog
    const closeBtn = document.querySelector('ytcp-uploads-dialog ytcp-button#close-button')
      || document.querySelector('ytcp-uploads-dialog .close-button');
    if (closeBtn) clickElement(closeBtn);

    showToast('Upload cancelled');
  }

  function cancelApiUpload() {
    if (_activeUploadXhr) {
      _activeUploadXhr.abort();
      _activeUploadXhr = null;
    }
    const apiProgress = panel.querySelector('#tp-api-upload-progress');
    if (apiProgress) apiProgress.style.display = 'none';
    const uploadBtn = panel.querySelector('#tp-upload-btn');
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload & Fill';
    }
    setFabSpinning(false);
    showToast('API upload cancelled');
  }

  function resetPanelForNewUpload() {
    if (!panel) return;

    // Ensure we're on the Generator tab
    switchTab('generator');

    // Clear video description input
    const videoDesc = panel.querySelector('#tp-video-desc');
    if (videoDesc) { videoDesc.value = ''; }
    const descCount = panel.querySelector('#tp-desc-count');
    if (descCount) descCount.textContent = '0';

    // Clear selected file
    selectedFile = null;
    const fileInput = panel.querySelector('#tp-file-input');
    if (fileInput) fileInput.value = '';
    const fileName = panel.querySelector('#tp-file-name');
    if (fileName) fileName.textContent = '';
    const filePicker = panel.querySelector('#tp-file-picker');
    if (filePicker) filePicker.classList.remove('tp-file-selected');

    // Hide results
    const results = panel.querySelector('#tp-results');
    if (results) results.style.display = 'none';

    // Clear result fields
    const resultTitle = panel.querySelector('#tp-result-title');
    if (resultTitle) resultTitle.value = '';
    const titleCount = panel.querySelector('#tp-title-count');
    if (titleCount) titleCount.textContent = '0';
    const resultDesc = panel.querySelector('#tp-result-desc');
    if (resultDesc) resultDesc.value = '';
    const rdescCount = panel.querySelector('#tp-rdesc-count');
    if (rdescCount) rdescCount.textContent = '0';
    const resultTags = panel.querySelector('#tp-result-tags');
    if (resultTags) resultTags.value = '';
    const tagsInfo = panel.querySelector('#tp-tags-info');
    if (tagsInfo) { tagsInfo.textContent = '0 tags'; tagsInfo.style.color = ''; }
    const resultCategory = panel.querySelector('#tp-result-category');
    if (resultCategory) resultCategory.value = '';

    // Hide upload progress sections
    const uploadProgress = panel.querySelector('#tp-upload-progress');
    if (uploadProgress) uploadProgress.style.display = 'none';
    resetUploadProgress();
    const apiProgress = panel.querySelector('#tp-api-upload-progress');
    if (apiProgress) apiProgress.style.display = 'none';

    // Reset footer: hide New Upload, show Upload & Fill + Copy All
    const footer = panel.querySelector('#tp-panel-footer');
    if (footer) footer.style.display = 'none';
    const newUploadBtn = panel.querySelector('#tp-new-upload-btn');
    if (newUploadBtn) newUploadBtn.style.display = 'none';
    const uploadBtn = panel.querySelector('#tp-upload-btn');
    if (uploadBtn) { uploadBtn.style.display = ''; uploadBtn.disabled = false; uploadBtn.textContent = 'Upload & Fill'; }
    const copyBtn = panel.querySelector('#tp-copy-btn');
    if (copyBtn) copyBtn.style.display = '';

    showToast('Ready for next upload');
  }

  function showPostUploadFooter() {
    if (!panel) return;
    // Hide action buttons, show New Upload
    const fillBtn = panel.querySelector('#tp-fill-btn');
    if (fillBtn) fillBtn.style.display = 'none';
    const uploadBtn = panel.querySelector('#tp-upload-btn');
    if (uploadBtn) uploadBtn.style.display = 'none';
    const copyBtn = panel.querySelector('#tp-copy-btn');
    if (copyBtn) copyBtn.style.display = 'none';
    const newUploadBtn = panel.querySelector('#tp-new-upload-btn');
    if (newUploadBtn) newUploadBtn.style.display = '';
    const footer = panel.querySelector('#tp-panel-footer');
    if (footer) footer.style.display = '';
  }

  // --- Tab Switching ---
  function switchTab(tab) {
    if (!panel) return;
    const genTab = panel.querySelector('#tp-tab-generator');
    const histTab = panel.querySelector('#tp-tab-history');
    const genView = panel.querySelector('#tp-view-generator');
    const histView = panel.querySelector('#tp-view-history');
    const footer = panel.querySelector('#tp-panel-footer');

    if (tab === 'history') {
      genTab.classList.remove('tp-panel-tab-active');
      histTab.classList.add('tp-panel-tab-active');
      genView.style.display = 'none';
      histView.style.display = '';
      if (footer) footer.style.display = 'none';
      renderUploadHistory();
    } else {
      histTab.classList.remove('tp-panel-tab-active');
      genTab.classList.add('tp-panel-tab-active');
      histView.style.display = 'none';
      genView.style.display = '';
      // Restore footer if results are showing
      const results = panel.querySelector('#tp-results');
      if (footer && results && results.style.display !== 'none') {
        footer.style.display = '';
      }
    }
  }

  // --- Upload History ---
  async function saveUploadRecord(record) {
    try {
      const key = CONFIG.UPLOAD_HISTORY_KEY;
      const result = await chrome.storage.local.get([key]);
      const history = result[key] || [];
      history.unshift(record);
      if (history.length > CONFIG.UPLOAD_HISTORY_MAX) history.length = CONFIG.UPLOAD_HISTORY_MAX;
      await chrome.storage.local.set({ [key]: history });
    } catch {
      // Failed to save upload record
    }
  }

  function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    if (days < 30) return days + 'd ago';
    return new Date(timestamp).toLocaleDateString();
  }

  function escapeHtml(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  async function renderUploadHistory() {
    if (!panel) return;
    const listEl = panel.querySelector('#tp-history-list');
    if (!listEl) return;

    try {
      const key = CONFIG.UPLOAD_HISTORY_KEY;
      const result = await chrome.storage.local.get([key]);
      const history = result[key] || [];

      if (history.length === 0) {
        listEl.innerHTML = '<div class="tp-history-empty">No uploads recorded yet.</div>';
        return;
      }

      listEl.innerHTML = history.map(entry => {
        const methodClass = entry.method === 'api' ? 'tp-history-method-api' : 'tp-history-method-dom';
        const methodLabel = entry.method === 'api' ? 'API' : 'DOM';
        const visLabel = entry.visibility ? entry.visibility.charAt(0) + entry.visibility.slice(1).toLowerCase() : '';
        const titleText = escapeHtml(entry.title || 'Untitled');
        const channelText = entry.channelName ? escapeHtml(entry.channelName) : '';
        const titleHtml = entry.videoUrl
          ? `<a class="tp-history-card-title" href="${escapeHtml(entry.videoUrl)}" target="_blank" title="Open in YouTube Studio">${titleText}</a>`
          : `<span class="tp-history-card-title">${titleText}</span>`;

        return `<div class="tp-history-card">
          <div class="tp-history-card-top">
            ${titleHtml}
            <span class="tp-history-method ${methodClass}">${methodLabel}</span>
          </div>
          <div class="tp-history-card-meta">
            ${channelText ? `<span>${channelText}</span>` : ''}
            ${visLabel ? `<span>${visLabel}</span>` : ''}
            <span>${timeAgo(entry.timestamp)}</span>
          </div>
        </div>`;
      }).join('');
    } catch (err) {
      listEl.innerHTML = '<div class="tp-history-empty">Failed to load history.</div>';
    }
  }

  async function clearUploadHistory() {
    try {
      await chrome.storage.local.set({ [CONFIG.UPLOAD_HISTORY_KEY]: [] });
      renderUploadHistory();
      showToast('Upload history cleared');
    } catch (err) {
      showToast('Failed to clear history', true);
    }
  }

  function checkCancelled() {
    if (_uploadCancelled) throw new Error('Upload cancelled by user');
  }

  // --- Upload Orchestrator (Strategy Dispatcher) ---
  async function handleUploadAndFill() {
    if (!isExtensionValid()) { showToast('Extension updated — please refresh the page', 'error'); return; }
    if (!selectedFile) {
      showToast('Please select a video file first', true);
      return;
    }

    const metadata = collectMetadata();
    if (!metadata.title) {
      showToast('Please generate metadata first', true);
      return;
    }

    const result = await chrome.storage.local.get([CONFIG.APPLY_STRATEGY_KEY]);
    const strategy = result[CONFIG.APPLY_STRATEGY_KEY] || CONFIG.APPLY_STRATEGIES.DOM;

    if (strategy === CONFIG.APPLY_STRATEGIES.API) {
      await handleApiUpload(metadata);
    } else if (strategy === CONFIG.APPLY_STRATEGIES.API_WITH_DOM_FALLBACK) {
      try {
        await handleApiUpload(metadata);
      } catch {
        showToast('API upload failed — falling back to DOM upload', true);
        await handleDomUpload(metadata);
      }
    } else {
      await handleDomUpload(metadata);
    }
  }

  // --- API Upload Path ---
  async function handleApiUpload(metadata) {
    const uploadBtn = panel.querySelector('#tp-upload-btn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading via API...';
    setFabSpinning(true);

    const apiProgress = panel.querySelector('#tp-api-upload-progress');
    const apiStatus = panel.querySelector('#tp-api-upload-status');
    const apiFill = panel.querySelector('#tp-api-upload-fill');
    const apiBytes = panel.querySelector('#tp-api-upload-bytes');
    apiProgress.style.display = '';
    apiStatus.textContent = 'Checking quota...';
    apiFill.style.width = '0%';
    apiBytes.textContent = '';

    try {
      // Check quota
      const quotaResp = await chrome.runtime.sendMessage({ type: 'GET_QUOTA_STATUS' });
      if (quotaResp && quotaResp.success && quotaResp.uploadsRemaining <= 0) {
        throw new Error('Daily API quota exhausted — no uploads remaining today');
      }

      // Get YouTube token for the selected channel
      apiStatus.textContent = 'Authenticating...';
      let channelId = null;
      let channelName = null;
      let token = null;

      const selectedId = await getSelectedChannelIdFromStorage();
      if (!selectedId) {
        throw new Error('No channel selected — connect a YouTube channel first');
      }

      const tokenResp = await chrome.runtime.sendMessage({ type: 'GET_CHANNEL_TOKEN', channelId: selectedId });
      if (!tokenResp || !tokenResp.success) {
        throw new Error('Token expired — reconnect the channel in the dropdown');
      }
      token = tokenResp.token;

      // Get channel info from multi-channel storage
      const channelsResp = await chrome.runtime.sendMessage({ type: 'GET_CONNECTED_CHANNELS' });
      if (channelsResp && channelsResp.success && channelsResp.channels[selectedId]) {
        channelId = selectedId;
        channelName = channelsResp.channels[selectedId].channelName;
      }

      // Build API metadata
      const visibility = panel.querySelector('#tp-visibility-select').value;
      const apiMetadata = {
        snippet: {
          title: metadata.title,
          description: metadata.description || '',
          tags: metadata.tags || [],
          categoryId: metadata.categoryId || '22' // default: People & Blogs
        },
        status: {
          privacyStatus: visibility.toLowerCase(),
          selfDeclaredMadeForKids: panel.querySelector('#tp-kids-select').value === 'yes'
        }
      };

      // Track upload quota optimistically BEFORE upload starts
      // YouTube consumes quota server-side regardless of whether we receive the response
      await chrome.runtime.sendMessage({
        type: 'TRACK_UPLOAD_QUOTA',
        channelId: channelId,
        channelName: channelName
      });

      // Initiate resumable upload
      apiStatus.textContent = 'Initiating upload...';
      const uploadUri = await initiateResumableUpload(apiMetadata, token);

      // Upload file with progress
      apiStatus.textContent = 'Uploading video...';
      const uploadResult = await uploadFileWithProgress(uploadUri, selectedFile, token, (loaded, total) => {
        const pct = total > 0 ? Math.round(loaded / total * 100) : 0;
        apiFill.style.width = pct + '%';
        apiBytes.textContent = `${pct}% (${formatFileSize(loaded)} / ${formatFileSize(total)})`;
      });

      // Validate API response
      if (!uploadResult || !uploadResult.id) {
        throw new Error('Upload returned no video ID — check YouTube Studio manually');
      }

      const videoId = uploadResult.id;
      const uploadStatus = uploadResult.status?.uploadStatus;

      if (uploadStatus === 'rejected') {
        const reason = uploadResult.status?.rejectionReason || 'unknown';
        throw new Error(`YouTube rejected the video (${reason})`);
      }
      if (uploadStatus === 'failed') {
        const reason = uploadResult.status?.failureReason || 'unknown';
        throw new Error(`YouTube upload failed (${reason})`);
      }

      const videoUrl = `https://studio.youtube.com/video/${videoId}/edit`;
      apiFill.style.width = '100%';
      apiStatus.textContent = 'Upload complete!';
      apiBytes.textContent = `Video ID: ${videoId}`;

      // Copy video URL to clipboard
      try { await navigator.clipboard.writeText(videoUrl); } catch { /* ignore */ }

      // Add to playlist if selected
      const playlistId = panel.querySelector('#tp-playlist-select')?.value;
      if (playlistId && playlistId !== 'none') {
        apiStatus.textContent = 'Adding to playlist...';
        try {
          const plChannelId = await getSelectedChannelIdFromStorage();
          await chrome.runtime.sendMessage({ type: 'ADD_TO_PLAYLIST', playlistId, videoId, channelId: plChannelId || undefined });
          showToast('Uploaded! URL copied. Added to playlist.');
        } catch {
          showToast('Uploaded! URL copied (playlist add failed)', false);
        }
      } else {
        showToast('Uploaded! Studio URL copied to clipboard.');
      }

      // Update quota display
      updateQuotaDisplay();

      // Save to upload history
      saveUploadRecord({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        videoId,
        videoUrl,
        title: metadata.title || '',
        channelId: channelId || '',
        channelName: channelName || '',
        method: 'api',
        visibility,
        timestamp: Date.now()
      });

      // Show New Upload button, then auto-clear
      showPostUploadFooter();
      setTimeout(() => resetPanelForNewUpload(), 3000);
    } catch (err) {
      if (err.message === 'Upload aborted') {
        // Already handled by cancelApiUpload
        return;
      }
      apiStatus.textContent = 'Upload failed: ' + err.message;
      throw err;
    } finally {
      _activeUploadXhr = null;
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload & Fill';
      setFabSpinning(false);
      // Hide progress after a delay
      setTimeout(() => {
        if (apiProgress) apiProgress.style.display = 'none';
      }, 5000);
    }
  }

  async function initiateResumableUpload(metadata, token) {
    const url = CONFIG.YOUTUBE_UPLOAD_API + '?uploadType=resumable&part=snippet,status';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(selectedFile.size),
        'X-Upload-Content-Type': selectedFile.type || 'video/*'
      },
      body: JSON.stringify(metadata)
    });

    if (!res.ok) {
      const status = res.status;
      const errBody = await res.text().catch(() => '');
      if (status === 401) throw new Error('YouTube token expired — re-authenticate');
      if (status === 403) {
        try {
          const body = JSON.parse(errBody);
          const reason = body.error?.errors?.[0]?.reason;
          if (reason === 'quotaExceeded') throw new Error('YouTube API daily quota exceeded');
        } catch { /* not JSON */ }
        throw new Error('Upload forbidden — check YouTube permissions');
      }
      throw new Error(`Upload initiation failed (HTTP ${status})`);
    }

    const uploadUri = res.headers.get('Location');
    if (!uploadUri) throw new Error('No upload URI returned from YouTube');
    return uploadUri;
  }

  function uploadFileWithProgress(uploadUri, file, token, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      _activeUploadXhr = xhr;

      xhr.open('PUT', uploadUri, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', file.type || 'video/*');

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(e.loaded, e.total);
        }
      });

      xhr.addEventListener('load', () => {
        _activeUploadXhr = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch {
            resolve(null);
          }
        } else {
          const errBody = xhr.responseText?.slice(0, 500) || '';
          reject(new Error(`Upload failed (HTTP ${xhr.status}): ${errBody}`));
        }
      });

      xhr.addEventListener('error', () => {
        _activeUploadXhr = null;
        reject(new Error('Upload network error'));
      });

      xhr.addEventListener('abort', () => {
        _activeUploadXhr = null;
        reject(new Error('Upload aborted'));
      });

      xhr.send(file);
    });
  }

  // --- DOM Upload Path (existing behavior, extracted) ---
  async function handleDomUpload(metadata) {
    _uploadCancelled = false;

    const uploadBtn = panel.querySelector('#tp-upload-btn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';

    const progress = panel.querySelector('#tp-upload-progress');
    progress.style.display = '';
    resetUploadProgress();

    // Pre-upload: read cached channel data (zero API cost — no live refresh needed)
    let domUploadChannelId = null;
    let domUploadChannelName = null;
    try {
      const selectedId = await getSelectedChannelIdFromStorage();
      const cacheResp = await chrome.runtime.sendMessage({ type: 'GET_CHANNEL_CACHE', channelId: selectedId });
      if (cacheResp && cacheResp.data) {
        domUploadChannelId = cacheResp.data.channelId;
        domUploadChannelName = cacheResp.data.channelName || '';
        displayChannelProfile(cacheResp.data);
      }
    } catch {
      // Cache read failed — proceed without channel info
    }

    // Minimize panel so user can see the upload dialog
    closePanel();
    setFabSpinning(true);

    try {
      // Step 1: Open upload dialog
      setUploadStep('open');
      await openUploadDialog();
      completeUploadStep('open');
      checkCancelled();

      // Step 2: Select file
      setUploadStep('file');
      await selectFileInDialog();
      completeUploadStep('file');
      checkCancelled();

      // Step 3: Wait for details step and fill metadata
      setUploadStep('details');
      await waitForDetailsStep();
      await fillDetailsStep(metadata);
      completeUploadStep('details');
      checkCancelled();

      // Step 4: Click Next to advance from Details to Elements
      setUploadStep('elements');
      await clickNextButton();
      completeUploadStep('elements');
      checkCancelled();

      // Step 5: Click Next to advance from Elements to Checks
      setUploadStep('checks');
      await clickNextButton();
      await waitForChecks();
      completeUploadStep('checks');
      checkCancelled();

      // Step 6: Click Next to advance from Checks to Visibility
      setUploadStep('visibility');
      await clickNextButton();
      const visibility = panel.querySelector('#tp-visibility-select').value;
      await selectVisibility(visibility);
      completeUploadStep('visibility');
      checkCancelled();

      // Step 7: Save
      setUploadStep('save');
      await clickSaveButton();
      const shareUrl = await handlePublishedDialog();
      completeUploadStep('save');

      // Add to playlist if selected (via API, after upload)
      const playlistId = panel.querySelector('#tp-playlist-select')?.value;
      if (playlistId && playlistId !== 'none' && shareUrl) {
        const videoId = extractVideoIdFromUrl(shareUrl);
        if (videoId) {
          try {
            const domPlChannelId = await getSelectedChannelIdFromStorage();
            await chrome.runtime.sendMessage({ type: 'ADD_TO_PLAYLIST', playlistId, videoId, channelId: domPlChannelId || undefined });
            showToast('Published & added to playlist! URL copied (50 API units used)');
          } catch {
            showToast('Published! URL copied (playlist add failed)', false);
          }
        } else {
          showToast('Published! URL copied to clipboard');
        }
      } else if (shareUrl) {
        showToast('Published! URL copied to clipboard');
      } else {
        showToast('Video uploaded successfully!');
      }

      // Update quota display to reflect any playlist API cost
      updateQuotaDisplay();

      // Save to upload history
      const domVideoId = shareUrl ? extractVideoIdFromUrl(shareUrl) : null;
      const domVideoUrl = domVideoId ? `https://studio.youtube.com/video/${domVideoId}/edit` : '';
      saveUploadRecord({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        videoId: domVideoId || '',
        videoUrl: domVideoUrl,
        title: metadata.title || '',
        channelId: domUploadChannelId || '',
        channelName: domUploadChannelName || '',
        method: 'dom',
        visibility: panel.querySelector('#tp-visibility-select').value,
        timestamp: Date.now()
      });

      // Show New Upload button, then auto-clear
      showPostUploadFooter();
      setTimeout(() => resetPanelForNewUpload(), 3000);
    } catch (err) {
      if (_uploadCancelled) {
        // Already handled by cancelUpload()
        return;
      }
      failUploadStep(_currentUploadStep);
      showToast('Upload failed: ' + err.message, true);
    } finally {
      if (!_uploadCancelled) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload & Fill';
        setFabSpinning(false);
      }
    }
  }

  // --- Upload Step Functions ---
  async function openUploadDialog() {
    const createBtn = await waitForElement(CONFIG.SELECTORS.CREATE_BUTTON);
    clickElement(createBtn);
    await sleep(500);

    const uploadItem = await waitForElement(CONFIG.SELECTORS.UPLOAD_MENU_ITEM);
    clickElement(uploadItem);
    await sleep(500);

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
      await sleep(500);
      return;
    }

    // Fallback: try drag-and-drop
    const dropTarget = dialog.querySelector('#content') || dialog;
    await attemptDragDrop(dropTarget);
    await sleep(500);
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
    await waitForElement(CONFIG.SELECTORS.TITLE_TEXTAREA, 15000);
    await sleep(100);
  }

  async function fillDetailsStep(metadata) {
    const dialog = document.querySelector(CONFIG.SELECTORS.UPLOAD_DIALOG) || document;

    if (metadata.title) {
      await fillField(CONFIG.SELECTORS.TITLE_TEXTAREA, metadata.title);
      await sleep(300);
    }

    if (metadata.description) {
      await fillField(CONFIG.SELECTORS.DESCRIPTION_TEXTAREA, metadata.description);
      await sleep(300);
    }

    // Expand "Show more" to reveal tags + audience settings
    await expandShowMore(dialog);

    // Verify tags section is visible (proof toggle worked)
    const tagsVisible = dialog.querySelector('#tags-container') ||
                        dialog.querySelector('input[aria-label="Tags"]');

    if (tagsVisible) {
      // Fill tags (clear existing defaults first, then add generated)
      if (metadata.tags && metadata.tags.length > 0) {
        await clearExistingTags(dialog);
        await fillTags(metadata.tags, dialog);
        await sleep(300);
      }

      // Set Made for Kids
      const kidsValue = panel.querySelector('#tp-kids-select').value;
      const kidsSelector = kidsValue === 'yes'
        ? CONFIG.SELECTORS.KIDS_YES_RADIO
        : CONFIG.SELECTORS.KIDS_NO_RADIO;
      const kidsRadio = dialog.querySelector(kidsSelector);
      if (kidsRadio) {
        clickElement(kidsRadio);
        await sleep(300);
      }

      // Apply advanced settings (paid promo, altered content, comments, language)
      await applyAdvancedSettings(dialog);
    }
  }

  async function applyAdvancedSettings(dialog) {
    if (!panel) return;

    // Scroll down to reveal advanced fields
    const scrollable = dialog.querySelector(CONFIG.SELECTORS.SCROLLABLE_CONTENT);
    if (scrollable) {
      scrollable.scrollTop = scrollable.scrollHeight;
      await sleep(500);
    }

    // 1. Paid promotion checkbox
    const paidPromo = panel.querySelector('#tp-paid-promo');
    if (paidPromo && paidPromo.checked) {
      const pppCheckbox = dialog.querySelector('ytcp-checkbox-lit#has-ppp');
      if (pppCheckbox) {
        const checkboxDiv = pppCheckbox.querySelector('div[role="checkbox"]');
        if (checkboxDiv && checkboxDiv.getAttribute('aria-checked') === 'false') {
          clickElement(checkboxDiv);
          await sleep(300);
        }
      }
    }

    // 2. Altered content radio (only set if user checked the checkbox)
    const alteredContent = panel.querySelector('#tp-altered-content');
    if (alteredContent && alteredContent.checked) {
      const radio = dialog.querySelector('tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_YES"]');
      if (radio) {
        clickElement(radio);
        await sleep(300);
      }
    }

    // 3. Comments setting (only change if not default "on")
    const commentsSelect = panel.querySelector('#tp-comments-select');
    if (commentsSelect && commentsSelect.value !== 'on') {
      const commentSettings = dialog.querySelector('ytcp-comment-moderation-settings');
      if (commentSettings) {
        const enablementSelect = commentSettings.querySelector('ytcp-select#enablement-state-select');
        if (enablementSelect) {
          // "off" → disable comments, "hold" → hold all for review
          const targetText = commentsSelect.value === 'off' ? 'Off' : 'Hold all';
          await setYtcpSelectValue(enablementSelect, targetText);
        }
      }
    }

    // 4. Language (only change if user selected a specific language)
    const langSelect = panel.querySelector('#tp-language-select');
    if (langSelect && langSelect.value) {
      const langMap = {
        en: 'English', es: 'Spanish', fr: 'French', de: 'German',
        pt: 'Portuguese', hi: 'Hindi', ja: 'Japanese', ko: 'Korean',
        zh: 'Chinese', ar: 'Arabic', ru: 'Russian', it: 'Italian', nl: 'Dutch'
      };
      const langName = langMap[langSelect.value];
      if (langName) {
        const langInput = dialog.querySelector('ytcp-form-language-input#language-input');
        if (langInput) {
          const ytcpSelect = langInput.querySelector('ytcp-select');
          if (ytcpSelect) {
            await setYtcpSelectValue(ytcpSelect, langName);
          }
        }
      }
    }
  }

  /**
   * Open a ytcp-select dropdown and click the option matching targetText.
   * YouTube Studio uses custom polymer dropdown elements (ytcp-select → ytcp-dropdown-trigger).
   */
  async function setYtcpSelectValue(ytcpSelect, targetText) {
    if (!ytcpSelect) return false;

    // Click the trigger to open dropdown
    const trigger = ytcpSelect.querySelector('ytcp-dropdown-trigger');
    if (!trigger) return false;

    clickElement(trigger);
    await sleep(600);

    // Wait for paper items to appear (they may render lazily)
    let items = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const listbox = ytcpSelect.querySelector('tp-yt-paper-listbox');
      if (listbox) {
        items = listbox.querySelectorAll('tp-yt-paper-item');
        if (items.length > 0) break;
      }
      await sleep(300);
    }

    // Find and click the matching item
    const lowerTarget = targetText.toLowerCase();
    for (const item of items) {
      if (item.textContent.trim().toLowerCase().includes(lowerTarget)) {
        item.click();
        await sleep(300);
        return true;
      }
    }

    // No match found — close dropdown by pressing Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    await sleep(200);
    return false;
  }

  async function expandShowMore(dialog) {
    // Try up to 3 times to expand "Show more"
    for (let attempt = 0; attempt < 3; attempt++) {
      // Check if already expanded (#tags-container is visible in expanded section)
      const alreadyExpanded = dialog.querySelector('#tags-container') ||
                              dialog.querySelector('input[aria-label="Tags"]');
      if (alreadyExpanded) return;

      const toggleWrapper = dialog.querySelector(CONFIG.SELECTORS.TOGGLE_BUTTON);
      if (!toggleWrapper) {
        await sleep(500);
        continue;
      }

      // ytcp-button is a custom element wrapper — click the inner <button> element
      const innerBtn = toggleWrapper.querySelector('button') || toggleWrapper;
      clickElement(innerBtn);
      await sleep(1500);

      // Scroll down to reveal expanded fields
      const scrollable = dialog.querySelector(CONFIG.SELECTORS.SCROLLABLE_CONTENT);
      if (scrollable) {
        scrollable.scrollTop = scrollable.scrollHeight;
        await sleep(500);
      }
    }
  }

  async function clearExistingTags(dialog) {
    // YouTube Studio chip-bar has a clear button: ytcp-icon-button#clear-button
    // with aria-label="Delete all" and icon="close"
    // It's hidden (display:none) when no tags exist, visible when tags are present
    const tagsContainer = dialog.querySelector('#tags-container');
    if (!tagsContainer) return;

    const clearBtn = tagsContainer.querySelector('#clear-button');
    if (!clearBtn) return;

    // The button is hidden (display:none) when no tags exist
    // Check computed style since inline style may not reflect actual state
    const isVisible = clearBtn.style.display !== 'none' &&
                      window.getComputedStyle(clearBtn).display !== 'none';
    if (isVisible) {
      const inner = clearBtn.querySelector('button') || clearBtn;
      inner.click();
      await sleep(500);
    } else {
      // Tags might exist as chip elements even if clear button isn't visible
      // Select all text in the input and delete as fallback
      const tagInput = tagsContainer.querySelector('input[aria-label="Tags"]') ||
                       tagsContainer.querySelector('ytcp-chip-bar input');
      if (tagInput) {
        // Check if there are chip elements (existing tags)
        const chips = tagsContainer.querySelectorAll('ytcp-chip-bar ytcp-chip');
        for (const chip of chips) {
          const removeIcon = chip.querySelector('#remove-icon, .remove-icon, [icon="cancel"]');
          if (removeIcon) {
            removeIcon.click();
            await sleep(100);
          }
        }
      }
    }
  }

  async function clickNextButton() {
    const nextBtn = await waitForElement(CONFIG.SELECTORS.NEXT_BUTTON);
    await sleep(100);
    clickElement(nextBtn);
    await sleep(500);
  }

  async function waitForChecks() {
    // YouTube allows proceeding through checks without waiting — just a brief pause
    await sleep(100);
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
    await sleep(100);
  }

  async function clickSaveButton() {
    const doneBtn = await waitForElement(CONFIG.SELECTORS.DONE_BUTTON);
    await sleep(100);
    clickElement(doneBtn);
    await sleep(1000);
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

    // Collapse selection BEFORE dispatching events to prevent YouTube Studio's
    // internal editor from throwing IndexSizeError on stale Range offsets
    const sel = window.getSelection();
    if (sel) sel.collapseToEnd();

    // Trigger change events (selection is now valid for YouTube's onInput handler)
    editable.dispatchEvent(new Event('input', { bubbles: true }));
    editable.dispatchEvent(new Event('change', { bubbles: true }));

    editable.blur();

    return true;
  }

  // --- Fill tags ---
  async function fillTags(tags, scope) {
    scope = scope || document;

    // YouTube Studio tags use a chip-bar: <input id="text-input" aria-label="Tags" placeholder="Add tag">
    // Each tag is typed into the input and confirmed with comma or Enter to create a chip
    const tagInput = scope.querySelector('#tags-container input[aria-label="Tags"]') ||
                     scope.querySelector('ytcp-chip-bar input#text-input') ||
                     scope.querySelector('ytcp-chip-bar input') ||
                     scope.querySelector('input[aria-label="Tags"]') ||
                     scope.querySelector('input[placeholder*="tag" i]');

    if (!tagInput) return false;

    tagInput.focus();
    await sleep(100);

    for (const tag of tags) {
      // Set value and fire input event so chip-bar registers it
      tagInput.value = tag;
      tagInput.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(100);

      // Press comma to confirm the chip (YouTube Studio uses comma as tag separator)
      tagInput.dispatchEvent(new KeyboardEvent('keydown', {
        key: ',', code: 'Comma', keyCode: 188, which: 188, bubbles: true
      }));
      tagInput.dispatchEvent(new KeyboardEvent('keyup', {
        key: ',', code: 'Comma', keyCode: 188, which: 188, bubbles: true
      }));
      await sleep(150);

      // Also try Enter as fallback to confirm the chip
      tagInput.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
      }));
      await sleep(150);
    }

    tagInput.blur();
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

  function extractVideoIdFromUrl(url) {
    // Handles youtu.be/ID, youtube.com/watch?v=ID, studio.youtube.com/video/ID/edit
    const patterns = [
      /youtu\.be\/([A-Za-z0-9_-]{11})/,
      /[?&]v=([A-Za-z0-9_-]{11})/,
      /\/video\/([A-Za-z0-9_-]{11})/
    ];
    for (const p of patterns) {
      const match = url.match(p);
      if (match) return match[1];
    }
    return null;
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
