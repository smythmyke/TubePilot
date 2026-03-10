/**
 * TubePilot Popup Script
 * Account tab + Products tab with full CRUD
 */

document.addEventListener('DOMContentLoaded', async () => {
  // --- Tab switching ---
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.toggle('active', b === btn));
      tabContents.forEach(tc => tc.classList.toggle('active', tc.id === 'tab-' + tab));
    });
  });

  // --- View switching (Main ↔ Products) ---
  const mainView = document.getElementById('main-view');
  const productsView = document.getElementById('products-view');
  const productsBtn = document.getElementById('products-btn');
  const backBtn = document.getElementById('back-btn');

  productsBtn.addEventListener('click', () => {
    mainView.classList.add('hidden');
    productsView.classList.remove('hidden');
  });

  backBtn.addEventListener('click', () => {
    productsView.classList.add('hidden');
    mainView.classList.remove('hidden');
  });

  // --- Account Tab ---
  const loggedInEl = document.getElementById('logged-in');
  const loggedOutEl = document.getElementById('logged-out');
  const creditCount = document.getElementById('credit-count');
  const userName = document.getElementById('user-name');
  const userEmail = document.getElementById('user-email');
  const userAvatar = document.getElementById('user-avatar');
  const signInBtn = document.getElementById('sign-in');
  const signOutBtn = document.getElementById('sign-out');
  const buyCreditsBtn = document.getElementById('buy-credits');
  const creditsWarning = document.getElementById('credits-warning');
  const versionEl = document.getElementById('version');

  // Show version
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = 'v' + manifest.version;

  // --- Header credits display ---
  const headerCredits = document.getElementById('header-credits');
  const headerCreditCount = document.getElementById('header-credit-count');
  let currentCreditsAvailable = 0;

  function updateHeaderCredits(available) {
    currentCreditsAvailable = available;
    headerCreditCount.textContent = available;
    headerCredits.classList.remove('hidden');
  }

  // Check auth status via background
  let authStatus;
  try {
    authStatus = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
  } catch (error) {
    const stored = await chrome.storage.local.get(['tubepilot_user', 'tubepilot_token', 'tubepilot_credits']);
    authStatus = {
      authenticated: !!(stored.tubepilot_user && stored.tubepilot_token),
      user: stored.tubepilot_user,
      credits: stored.tubepilot_credits
    };
  }

  const productsLoginRequired = document.getElementById('products-login-required');
  const productsContent = document.getElementById('products-content');
  const productsSignInBtn = document.getElementById('products-sign-in');

  if (authStatus && authStatus.authenticated) {
    showLoggedIn(authStatus.user, authStatus.credits);
  } else {
    showLoggedOut();
  }

  function updateProductsAccess(authenticated) {
    if (authenticated) {
      productsLoginRequired.classList.add('hidden');
      productsContent.classList.remove('hidden');
    } else {
      productsLoginRequired.classList.remove('hidden');
      productsContent.classList.add('hidden');
    }
  }

  function showLoggedIn(user, credits) {
    loggedInEl.classList.remove('hidden');
    loggedOutEl.classList.add('hidden');
    signOutBtn.classList.remove('hidden');
    updateProductsAccess(true);

    if (user) {
      userName.textContent = user.name || '';
      userEmail.textContent = user.email || '';
      if (user.picture) {
        userAvatar.src = user.picture;
      }
    }

    if (credits && credits.available !== undefined) {
      creditCount.textContent = credits.available;
      updateCreditsWarning(credits.available);
      updateHeaderCredits(credits.available);
    }

    // Fetch fresh credits
    chrome.runtime.sendMessage({ type: 'CHECK_CREDITS' }).then(resp => {
      if (resp && resp.success && resp.credits) {
        creditCount.textContent = resp.credits.available;
        updateCreditsWarning(resp.credits.available);
        updateHeaderCredits(resp.credits.available);
      }
    }).catch(() => {});
  }

  function updateCreditsWarning(available) {
    if (available <= 0) {
      creditsWarning.textContent = 'No credits remaining. Purchase more to generate metadata.';
      creditsWarning.classList.remove('hidden');
    } else if (available <= 5) {
      creditsWarning.textContent = 'Low credits (' + available + ' remaining).';
      creditsWarning.classList.remove('hidden');
    } else {
      creditsWarning.classList.add('hidden');
    }
  }

  function showLoggedOut() {
    loggedInEl.classList.add('hidden');
    loggedOutEl.classList.remove('hidden');
    signOutBtn.classList.add('hidden');
    updateProductsAccess(false);
    headerCredits.classList.add('hidden');
  }

  // Sign in
  signInBtn.addEventListener('click', async () => {
    signInBtn.disabled = true;
    signInBtn.textContent = 'Signing in...';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'SIGN_IN' });
      if (result && result.success) {
        showLoggedIn(result.user, result.credits);
      } else {
        signInBtn.textContent = 'Sign in failed — retry';
        signInBtn.disabled = false;
      }
    } catch (err) {
      signInBtn.textContent = 'Sign in failed — retry';
      signInBtn.disabled = false;
    }
  });

  // Sign in from Products tab
  productsSignInBtn.addEventListener('click', async () => {
    productsSignInBtn.disabled = true;
    productsSignInBtn.textContent = 'Signing in...';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'SIGN_IN' });
      if (result && result.success) {
        showLoggedIn(result.user, result.credits);
      } else {
        productsSignInBtn.textContent = 'Sign in failed — retry';
        productsSignInBtn.disabled = false;
      }
    } catch (err) {
      productsSignInBtn.textContent = 'Sign in failed — retry';
      productsSignInBtn.disabled = false;
    }
  });

  // Sign out
  signOutBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'SIGN_OUT' });
    showLoggedOut();
  });

  // --- Buy Credits Modal ---
  const creditsModal = document.getElementById('credits-modal');
  const creditPacksContainer = document.getElementById('credit-packs');
  const buyNowBtn = document.getElementById('buy-now-btn');
  const cancelModalBtn = document.getElementById('cancel-modal-btn');
  let creditPacks = [];
  let selectedPackId = null;

  buyCreditsBtn.addEventListener('click', () => showCreditsModal());

  cancelModalBtn.addEventListener('click', () => hideCreditsModal());

  creditsModal.addEventListener('click', (e) => {
    if (e.target === creditsModal) hideCreditsModal();
  });

  buyNowBtn.addEventListener('click', () => purchaseCredits());

  async function showCreditsModal() {
    selectedPackId = null;
    buyNowBtn.disabled = true;
    creditsModal.classList.remove('hidden');
    await loadCreditPacks();
  }

  function hideCreditsModal() {
    creditsModal.classList.add('hidden');
  }

  async function loadCreditPacks() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CREDIT_PACKS' });
      if (response.success && response.packs && response.packs.length > 0) {
        creditPacks = response.packs;
      } else {
        creditPacks = getDefaultPacks();
      }
    } catch {
      creditPacks = getDefaultPacks();
    }
    renderCreditPacks();
  }

  function getDefaultPacks() {
    return [
      { id: 'starter', name: 'Starter Pack', credits: 50, price: 199, priceFormatted: '$1.99', badge: null },
      { id: 'standard', name: 'Standard Pack', credits: 150, price: 499, priceFormatted: '$4.99', badge: 'popular' },
      { id: 'pro', name: 'Pro Pack', credits: 400, price: 1199, priceFormatted: '$11.99', badge: null },
      { id: 'power', name: 'Power Pack', credits: 1000, price: 2499, priceFormatted: '$24.99', badge: 'best_value' }
    ];
  }

  function renderCreditPacks() {
    creditPacksContainer.innerHTML = creditPacks.map(pack => {
      const priceFormatted = pack.priceFormatted || '$' + (pack.price / 100).toFixed(2);
      const badgeHtml = pack.badge
        ? `<span class="pack-badge ${pack.badge === 'popular' ? 'popular' : 'best-value'}">${pack.badge === 'popular' ? 'Popular' : 'Best Value'}</span>`
        : '';
      return `
        <label class="pack" data-pack-id="${pack.id}">
          <input type="radio" name="pack" value="${pack.id}">
          <span class="pack-info">
            <strong>${pack.name} ${badgeHtml}</strong>
            <span class="pack-detail">${pack.credits} credits (~${pack.credits} generations)</span>
          </span>
          <span class="pack-price">${priceFormatted}</span>
        </label>
      `;
    }).join('');

    creditPacksContainer.querySelectorAll('.pack').forEach(el => {
      el.addEventListener('click', () => {
        creditPacksContainer.querySelectorAll('.pack').forEach(p => p.classList.remove('selected'));
        el.classList.add('selected');
        el.querySelector('input').checked = true;
        selectedPackId = el.dataset.packId;
        buyNowBtn.disabled = false;
      });
    });
  }

  async function purchaseCredits() {
    if (!selectedPackId) return;

    buyNowBtn.disabled = true;
    buyNowBtn.textContent = 'Processing...';

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'BUY_CREDITS',
        packId: selectedPackId
      });

      if (result && result.success && result.checkoutUrl) {
        chrome.tabs.create({ url: result.checkoutUrl });
        window.close();
      } else {
        buyNowBtn.textContent = result?.error || 'Failed — try again';
        buyNowBtn.disabled = false;
        setTimeout(() => { buyNowBtn.textContent = 'Buy Now'; }, 2500);
      }
    } catch (err) {
      buyNowBtn.textContent = 'Error — try again';
      buyNowBtn.disabled = false;
      setTimeout(() => { buyNowBtn.textContent = 'Buy Now'; }, 2500);
    }
  }

  // Open Reactions Studio
  const openReactionsBtn = document.getElementById('open-reactions-btn');
  openReactionsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('reactions/reactions.html') });
    window.close();
  });

  // Open panel on current YouTube Studio page
  const openPanelBtn = document.getElementById('open-panel-btn');
  openPanelBtn.addEventListener('click', async () => {
    openPanelBtn.disabled = true;
    openPanelBtn.textContent = 'Opening...';
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.match(/studio\.youtube\.com/)) {
        openPanelBtn.textContent = 'Navigate to YouTube Studio';
        setTimeout(() => {
          openPanelBtn.textContent = 'Side Panel';
          openPanelBtn.disabled = false;
        }, 2000);
        return;
      }
      const pageCheck = await chrome.tabs.sendMessage(tab.id, { type: 'CHECK_PAGE' });
      if (!pageCheck || (!pageCheck.hasCreateButton && !pageCheck.isEditPage)) {
        openPanelBtn.textContent = 'No CREATE button found on this page';
        setTimeout(() => {
          openPanelBtn.textContent = 'Side Panel';
          openPanelBtn.disabled = false;
        }, 2000);
        return;
      }
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL' });
      if (response && response.success) {
        window.close();
      } else {
        const msg = response?.error === 'already_open' ? 'Panel is already open'
          : 'Could not open panel';
        openPanelBtn.textContent = msg;
        setTimeout(() => {
          openPanelBtn.textContent = 'Side Panel';
          openPanelBtn.disabled = false;
        }, 2000);
      }
    } catch (err) {
      // Content script not loaded — try injecting it
      if (err.message.includes('Receiving end does not exist') || err.message.includes('Could not establish connection')) {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.url && tab.url.match(/studio\.youtube\.com/)) {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['config.js', 'content/youtube-studio.js']
            });
            await chrome.scripting.insertCSS({
              target: { tabId: tab.id },
              files: ['content/styles.css']
            });
            // Wait for script to initialize, then retry
            await new Promise(r => setTimeout(r, 500));
            const pageCheck = await chrome.tabs.sendMessage(tab.id, { type: 'CHECK_PAGE' });
            if (pageCheck && (pageCheck.hasCreateButton || pageCheck.isEditPage)) {
              const response = await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL' });
              if (response && response.success) { window.close(); return; }
            }
          }
        } catch {
          // Retry failed
        }
      }
      openPanelBtn.textContent = 'Refresh this Studio tab and try again';
      setTimeout(() => {
        openPanelBtn.textContent = 'Side Panel';
        openPanelBtn.disabled = false;
      }, 3000);
    }
  });

  // --- Products Tab ---
  const BASE_PRODUCT_LIMIT = 20;
  let productLimit = BASE_PRODUCT_LIMIT;
  let products = [];
  const expandLimitBtn = document.getElementById('expand-limit-btn');

  const productList = document.getElementById('product-list');
  const productCountEl = document.getElementById('product-count');
  const addProductBtn = document.getElementById('add-product-btn');
  const productForm = document.getElementById('product-form');
  const formTitle = document.getElementById('form-title');
  const editProductId = document.getElementById('edit-product-id');
  const saveProductBtn = document.getElementById('save-product-btn');
  const cancelProductBtn = document.getElementById('cancel-product-btn');
  const formStatus = document.getElementById('form-status');

  const productsStatus = document.getElementById('products-status');
  let isEditMode = false;

  const fields = {
    name: document.getElementById('p-name'),
    link: document.getElementById('p-link'),
    features: document.getElementById('p-features'),
    keywords: document.getElementById('p-keywords')
  };

  const counters = {
    name: { el: document.getElementById('p-name-count'), max: 100 },
    link: { el: document.getElementById('p-link-count'), max: 500 },
    features: { el: document.getElementById('p-features-count'), max: 2000 }
  };

  // Wire up char counters
  Object.keys(counters).forEach(key => {
    fields[key].addEventListener('input', () => {
      const len = fields[key].value.length;
      const c = counters[key];
      c.el.textContent = len;
      c.el.parentElement.classList.toggle('over', len > c.max);
    });
  });

  // Enable save when required fields are filled
  function updateSaveBtnState() {
    const hasName = fields.name.value.trim().length > 0;
    const hasFeatures = fields.features.value.trim().length >= 10;
    saveProductBtn.disabled = !(hasName && hasFeatures);
  }
  fields.name.addEventListener('input', updateSaveBtnState);
  fields.features.addEventListener('input', updateSaveBtnState);

  // Load products and product limit
  chrome.storage.local.get(['tubepilot_products', 'tubepilot_product_limit'], (result) => {
    products = result.tubepilot_products || [];
    productLimit = result.tubepilot_product_limit || BASE_PRODUCT_LIMIT;
    renderProductList();
  });

  // Sync if changed elsewhere
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.tubepilot_products) {
        products = changes.tubepilot_products.newValue || [];
        renderProductList();
      }
      if (changes.tubepilot_product_limit) {
        productLimit = changes.tubepilot_product_limit.newValue || BASE_PRODUCT_LIMIT;
        renderProductList();
      }
    }
  });

  function renderProductList() {
    const atLimit = products.length >= productLimit;

    if (products.length === 0) {
      productList.innerHTML = '<div class="empty-state">No products yet. Add one to get started.</div>';
      productCountEl.textContent = '';
      addProductBtn.disabled = false;
      expandLimitBtn.classList.add('hidden');
      return;
    }

    productCountEl.textContent = products.length + '/' + productLimit + ' products';
    addProductBtn.disabled = atLimit;

    if (atLimit) {
      expandLimitBtn.classList.remove('hidden');
    } else {
      expandLimitBtn.classList.add('hidden');
    }

    productList.innerHTML = products.map(p => {
      const meta = [];
      if (p.link) meta.push('has link');
      if (p.keywords && p.keywords.length) meta.push(p.keywords.length + ' kw' + (p.keywords.length > 1 ? 's' : ''));
      return `
        <div class="product-card" data-id="${p.id}">
          <div class="product-card-info">
            <div class="product-card-name">${escapeHtml(p.name)}</div>
            <div class="product-card-meta">${meta.join(' · ') || 'No metadata'}</div>
          </div>
          <div class="product-card-actions">
            <button class="btn-small btn-edit edit-btn" data-id="${p.id}">Edit</button>
            <button class="btn-small btn-danger delete-btn" data-id="${p.id}">Del</button>
          </div>
        </div>
      `;
    }).join('');

    productList.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditForm(btn.dataset.id));
    });
    productList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
    });
  }

  // Add product
  addProductBtn.addEventListener('click', () => {
    if (products.length >= productLimit) {
      showProductsStatus('Product limit reached. Expand your limit below.', true);
      return;
    }
    if (currentCreditsAvailable < 1) {
      showProductsStatus('Need at least 1 credit to add a product. Buy credits first.', true);
      return;
    }
    clearForm();
    isEditMode = false;
    formTitle.textContent = 'Add Product (1 credit)';
    editProductId.value = '';
    saveProductBtn.disabled = true;
    productForm.classList.add('show');
    fields.name.focus();
  });

  // Cancel
  cancelProductBtn.addEventListener('click', () => {
    productForm.classList.remove('show');
    clearForm();
  });

  // Edit
  function openEditForm(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    isEditMode = true;
    formTitle.textContent = 'Edit Product';
    editProductId.value = id;
    fields.name.value = p.name || '';
    fields.link.value = p.link || '';
    fields.features.value = p.features || '';
    fields.keywords.value = (p.keywords || []).join(', ');

    // Update counters
    Object.keys(counters).forEach(key => {
      counters[key].el.textContent = fields[key].value.length;
    });

    saveProductBtn.disabled = false;
    productForm.classList.add('show');
    fields.name.focus();
  }

  // Save
  saveProductBtn.addEventListener('click', async () => {
    const name = fields.name.value.trim();
    const features = fields.features.value.trim();

    if (!name) {
      showFormStatus('Product name is required', true);
      return;
    }
    if (!features) {
      showFormStatus('Description is required', true);
      return;
    }

    const product = {
      id: editProductId.value || generateId(),
      name: name.slice(0, 100),
      link: fields.link.value.trim().slice(0, 500),
      features: features.slice(0, 2000),
      keywords: parseCommaSep(fields.keywords.value)
    };

    const isNew = !editProductId.value;

    if (isNew) {
      if (products.length >= productLimit) {
        showFormStatus('Product limit reached. Expand your limit.', true);
        return;
      }

      saveProductBtn.disabled = true;
      saveProductBtn.textContent = 'Saving...';
      try {
        const creditResult = await chrome.runtime.sendMessage({
          type: 'USE_PRODUCT_CREDIT'
        });
        if (!creditResult.success) {
          if (creditResult.error === 'insufficient_credits') {
            showFormStatus('Not enough credits (' + (creditResult.creditsRemaining || 0) + ' remaining). Buy more credits.', true);
          } else {
            showFormStatus('Failed to verify credits. Please try again.', true);
          }
          saveProductBtn.disabled = false;
          saveProductBtn.textContent = 'Save';
          return;
        }
        updateHeaderCredits(creditResult.creditsRemaining);
        creditCount.textContent = creditResult.creditsRemaining;
        updateCreditsWarning(creditResult.creditsRemaining);
      } catch (err) {
        showFormStatus('Failed to deduct credit. Try again.', true);
        saveProductBtn.disabled = false;
        saveProductBtn.textContent = 'Save';
        return;
      }

      products.push(product);
    } else {
      const idx = products.findIndex(p => p.id === editProductId.value);
      if (idx !== -1) products[idx] = product;
    }

    chrome.storage.local.set({ tubepilot_products: products }, () => {
      productForm.classList.remove('show');
      clearForm();
      renderProductList();
    });
  });

  // Delete
  function deleteProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    if (!confirm('Delete "' + p.name + '"?')) return;

    products = products.filter(x => x.id !== id);
    chrome.storage.local.set({ tubepilot_products: products }, () => {
      renderProductList();
    });
  }

  function clearForm() {
    Object.values(fields).forEach(f => { f.value = ''; });
    Object.keys(counters).forEach(key => {
      counters[key].el.textContent = '0';
      counters[key].el.parentElement.classList.remove('over');
    });
    editProductId.value = '';
    formStatus.classList.remove('show');
    saveProductBtn.disabled = true;
    isEditMode = false;
  }

  // Expand product limit
  expandLimitBtn.addEventListener('click', async () => {
    if (currentCreditsAvailable < 5) {
      showProductsStatus('Need 5 credits to expand limit. You have ' + currentCreditsAvailable + '.', true);
      return;
    }
    if (!confirm('Spend 5 credits to add 20 more product slots?')) return;

    expandLimitBtn.disabled = true;
    expandLimitBtn.textContent = 'Expanding...';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'EXPAND_PRODUCT_LIMIT' });
      if (!result.success) {
        showProductsStatus(result.error || 'Failed to expand limit', true);
        return;
      }
      productLimit = result.newLimit;
      updateHeaderCredits(result.creditsRemaining);
      creditCount.textContent = result.creditsRemaining;
      updateCreditsWarning(result.creditsRemaining);
      renderProductList();
      showProductsStatus('Limit expanded to ' + productLimit + ' products!', false);
    } catch (err) {
      showProductsStatus('Failed to expand limit. Try again.', true);
    } finally {
      expandLimitBtn.disabled = false;
      expandLimitBtn.textContent = 'Expand Limit +20 (5 credits)';
    }
  });

  function showFormStatus(msg, isError) {
    formStatus.textContent = msg;
    formStatus.className = 'form-status show' + (isError ? ' error' : '');
    clearTimeout(formStatus._timer);
    formStatus._timer = setTimeout(() => formStatus.classList.remove('show'), 2500);
  }

  function showProductsStatus(msg, isError) {
    productsStatus.textContent = msg;
    productsStatus.className = 'form-status show' + (isError ? ' error' : '');
    clearTimeout(productsStatus._timer);
    productsStatus._timer = setTimeout(() => productsStatus.classList.remove('show'), 3000);
  }

  function generateId() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function parseCommaSep(str) {
    return str.split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 0);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
