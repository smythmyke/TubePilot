importScripts('../config.js');
importScripts('../services/auth.js');
importScripts('../services/storage.js');
importScripts('../services/credits.js');
importScripts('../services/youtube-api.js');

// --- Auth token helper ---

async function getAuthToken() {
  const result = await chrome.storage.local.get(['tubepilot_token', 'authToken']);
  return result.tubepilot_token || result.authToken || null;
}

function getExtensionHeaders() {
  return {
    'X-Extension-Id': chrome.runtime.id || 'unknown',
    'X-Extension-Version': chrome.runtime.getManifest().version,
    'X-Extension-Name': 'TubePilot'
  };
}

async function getApiHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    ...getExtensionHeaders()
  };

  const token = await getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

// --- API fetch with 401 retry ---

async function apiFetch(endpoint, options = {}) {
  const headers = await getApiHeaders();
  const mergedOptions = { ...options, headers: { ...headers, ...options.headers } };

  const response = await fetch(CONFIG.API_URL + endpoint, mergedOptions);

  if (response.status === 401) {
    try {
      const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (chrome.runtime.lastError || !token) {
            reject(new Error('Token refresh failed'));
            return;
          }
          resolve(token);
        });
      });

      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json();
        const authRes = await fetch(CONFIG.API_URL + '/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getExtensionHeaders() },
          body: JSON.stringify({ googleToken: token, email: userInfo.email, name: userInfo.name, picture: userInfo.picture })
        });
        if (authRes.ok) {
          const authData = await authRes.json();
          const newToken = authData.token || token;
          await chrome.storage.local.set({
            tubepilot_token: newToken,
            authToken: newToken
          });
          mergedOptions.headers['Authorization'] = `Bearer ${newToken}`;
          return fetch(CONFIG.API_URL + endpoint, mergedOptions);
        }
      }
    } catch (refreshErr) {
      // Refresh failed
    }
    throw new Error('Session expired — please sign in again');
  }

  return response;
}

// --- Install handler ---

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      tubepilot_installed: Date.now(),
      tp_project: 'none'
    });
  }
});

// --- Data freshness check (YouTube API ToS: 30-day max) ---
enforceDataFreshness().catch(() => {});

// --- Detect Stripe purchase redirect ---

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && changeInfo.url.includes('tp_purchase=success')) {
    creditsService.invalidateCache();
    creditsService.getBalance(true).catch(() => {});
    chrome.runtime.sendMessage({ type: 'CREDITS_UPDATED' }).catch(() => {});
  }
});

// --- Message handler ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  switch (message.type) {
    case 'GENERATE_YOUTUBE_META':
      handleGenerateYouTubeMeta(message.videoDescription, message.product, message.channelContext, message.targetAudience)
        .then(result => sendResponse({ result }))
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'CHECK_AUTH':
      console.log('[TubePilot SW] CHECK_AUTH received');
      authService.checkAuth()
        .then(result => {
          console.log('[TubePilot SW] CHECK_AUTH result:', result.authenticated);
          if (result.authenticated) {
            creditsService.getBalance()
              .then(credits => sendResponse({ ...result, credits }))
              .catch(() => sendResponse({ ...result, credits: null }));
          } else {
            sendResponse(result);
          }
        })
        .catch(err => {
          console.error('[TubePilot SW] CHECK_AUTH error:', err);
          sendResponse({ authenticated: false, user: null });
        });
      return true;

    case 'SIGN_IN':
      console.log('[TubePilot SW] SIGN_IN received');
      authService.signIn()
        .then(user => {
          console.log('[TubePilot SW] SIGN_IN success:', user.email);
          creditsService.getBalance(true).then(credits => {
            console.log('[TubePilot SW] Credits loaded:', credits);
            sendResponse({ success: true, user, credits });
          }).catch(credErr => {
            console.warn('[TubePilot SW] Credits fetch failed:', credErr);
            sendResponse({ success: true, user, credits: null });
          });
        })
        .catch(err => {
          console.error('[TubePilot SW] SIGN_IN failed:', err.message, err.stack);
          sendResponse({ success: false, error: err.message });
        });
      return true;

    case 'SIGN_OUT':
      authService.signOut()
        .then(() => {
          creditsService.invalidateCache();
          sendResponse({ success: true });
        })
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'CHECK_CREDITS':
      creditsService.getBalance(true)
        .then(credits => sendResponse({ success: true, credits }))
        .catch(() => sendResponse({ success: false, credits: null }));
      return true;

    case 'BUY_CREDITS':
      creditsService.createCheckoutSession(message.packId || 'standard')
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'GENERATE_PRODUCT_META':
      handleGenerateProductMeta(message.name, message.link, message.features)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'USE_PRODUCT_CREDIT':
      handleUseProductCredit()
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'EXPAND_PRODUCT_LIMIT':
      handleExpandProductLimit()
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'APPLY_VIA_API':
      handleApplyViaApi(message.videoId, message.metadata)
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_YOUTUBE_TOKEN':
      authService.getYouTubeToken(true)
        .then(token => sendResponse({ success: true, token }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'CHECK_YOUTUBE_SCOPE':
      authService.getYouTubeToken(false)
        .then(token => sendResponse({ granted: true }))
        .catch(() => sendResponse({ granted: false }));
      return true;

    case 'FETCH_CHANNEL_INFO':
      handleFetchChannelInfo()
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'FETCH_PLAYLISTS':
      handleFetchPlaylists()
        .then(playlists => sendResponse({ success: true, playlists }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_CHANNEL_CACHE':
      enforceDataFreshness().then(() => {
        chrome.storage.local.get(['tubepilot_channel'], (result) => {
          sendResponse({ data: result.tubepilot_channel || null });
        });
      }).catch(() => {
        sendResponse({ data: null });
      });
      return true;

    case 'REFRESH_CHANNEL':
      handleRefreshChannel()
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'ADD_TO_PLAYLIST':
      handleAddToPlaylist(message.playlistId, message.videoId)
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_QUOTA_STATUS':
      youtubeApiService.getQuotaStatus()
        .then(status => sendResponse({ success: true, ...status }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
  }
});

// --- YouTube Metadata Generation ---

const CREDITS_PER_GENERATION = 1;

async function handleGenerateYouTubeMeta(videoDescription, product, channelContext, targetAudience) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Sign in required to generate metadata');
  }

  const creditResult = await creditsService.useCredits(CREDITS_PER_GENERATION, 'youtube_generate_meta');
  if (!creditResult.success) {
    if (creditResult.error === 'insufficient_credits') {
      throw new Error(`Insufficient credits (${creditResult.creditsRemaining} remaining). Purchase more to continue.`);
    }
    if (creditResult.error === 'not_authenticated') {
      throw new Error('Session expired — please sign in again');
    }
    throw new Error('Failed to verify credits. Please try again.');
  }

  function truncate(str, max) {
    return typeof str === 'string' ? str.slice(0, max) : '';
  }

  const payload = {
    videoDescription: truncate(videoDescription, 3000),
    channelContext: truncate(channelContext || '', 1000),
    targetAudience: truncate(targetAudience || '', 500)
  };

  if (product && product.name) {
    payload.product = {
      name: truncate(product.name, 100),
      link: truncate(product.link, 500),
      features: truncate(product.features, 2000),
      benefits: truncate(product.benefits, 1000),
      keywords: Array.isArray(product.keywords) ? product.keywords.slice(0, 20) : []
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await apiFetch('/api/v1/youtube-generate-meta', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!res.ok) {
      const errBody = await res.text();
      if (res.status === 401) throw new Error('Session expired — please sign in again');
      if (res.status === 402) throw new Error('Insufficient credits — purchase more to continue');
      if (res.status === 429) throw new Error('Rate limit exceeded — wait a moment');
      if (res.status === 503) throw new Error('AI service unavailable');
      throw new Error('Failed to generate metadata. Please try again.');
    }

    const data = await res.json();
    if (!data.title) throw new Error('Empty response from API');
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out — please try again');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// --- Product meta generation (reuses Marketeer endpoint) ---

async function handleGenerateProductMeta(name, link, features) {
  const token = await getAuthToken();
  if (!token) throw new Error('Sign in required');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await apiFetch('/api/v1/reddit/generate-product-meta', {
      method: 'POST',
      body: JSON.stringify({ name, link, features }),
      signal: controller.signal
    });

    if (!res.ok) {
      const errBody = await res.text();
      if (res.status === 401) throw new Error('Session expired — please sign in again');
      if (res.status === 429) throw new Error('Too many requests — wait a moment');
      if (res.status === 503) throw new Error('AI service unavailable');
      throw new Error('Failed to generate product metadata');
    }

    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out — please try again');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// --- Product credit handlers ---

async function handleUseProductCredit() {
  const result = await creditsService.useCredits(1, 'product_create');
  if (!result.success) {
    return {
      success: false,
      error: result.error,
      creditsRemaining: result.creditsRemaining || 0
    };
  }
  return { success: true, creditsRemaining: result.creditsRemaining };
}

// --- YouTube Data API apply handler ---

async function handleApplyViaApi(videoId, metadata) {
  if (!videoId) throw new Error('No video ID provided');
  if (!metadata) throw new Error('No metadata provided');

  // Try silent token first, then interactive
  let token;
  try {
    token = await authService.getYouTubeToken(false);
  } catch {
    token = await authService.getYouTubeToken(true);
  }

  return await youtubeApiService.applyMetadata(videoId, metadata, token);
}

// --- YouTube Channel Data ---

async function getYouTubeTokenSilentOrInteractive(interactive) {
  try {
    return await authService.getYouTubeToken(false);
  } catch {
    if (interactive) return await authService.getYouTubeToken(true);
    throw new Error('YouTube scope not granted');
  }
}

async function handleFetchChannelInfo() {
  const token = await getYouTubeTokenSilentOrInteractive(true);
  const channelInfo = await youtubeApiService.getChannelInfo(token);
  const playlists = await youtubeApiService.getPlaylists(token);

  const data = {
    ...channelInfo,
    playlists,
    lastFetched: Date.now()
  };

  await chrome.storage.local.set({ tubepilot_channel: data });
  return data;
}

async function handleFetchPlaylists() {
  const token = await getYouTubeTokenSilentOrInteractive(false);
  const playlists = await youtubeApiService.getPlaylists(token);

  // Update just the playlists in cached channel data
  const stored = await chrome.storage.local.get(['tubepilot_channel']);
  const existing = stored.tubepilot_channel || {};
  existing.playlists = playlists;
  existing.lastFetched = Date.now();
  await chrome.storage.local.set({ tubepilot_channel: existing });

  return playlists;
}

async function handleRefreshChannel() {
  const token = await getYouTubeTokenSilentOrInteractive(false);
  const channelInfo = await youtubeApiService.getChannelInfo(token);
  const playlists = await youtubeApiService.getPlaylists(token);

  const stored = await chrome.storage.local.get(['tubepilot_channel']);
  const previous = stored.tubepilot_channel || {};
  const channelChanged = previous.channelId && previous.channelId !== channelInfo.channelId;

  const data = {
    ...channelInfo,
    playlists,
    lastFetched: Date.now()
  };

  await chrome.storage.local.set({ tubepilot_channel: data });

  return { ...data, channelChanged };
}

async function handleAddToPlaylist(playlistId, videoId) {
  if (!playlistId) throw new Error('No playlist ID provided');
  if (!videoId) throw new Error('No video ID provided');

  const token = await getYouTubeTokenSilentOrInteractive(false);
  return await youtubeApiService.addToPlaylist(playlistId, videoId, token);
}

async function handleExpandProductLimit() {
  const result = await creditsService.useCredits(5, 'product_limit_expand');
  if (!result.success) {
    if (result.error === 'insufficient_credits') {
      return { success: false, error: 'Not enough credits (need 5)', creditsRemaining: result.creditsRemaining || 0 };
    }
    return { success: false, error: result.error || 'Failed to deduct credits' };
  }

  const stored = await chrome.storage.local.get(['tubepilot_product_limit']);
  const currentLimit = stored.tubepilot_product_limit || 20;
  const newLimit = currentLimit + 20;
  await chrome.storage.local.set({ tubepilot_product_limit: newLimit });

  return { success: true, newLimit, creditsRemaining: result.creditsRemaining };
}
