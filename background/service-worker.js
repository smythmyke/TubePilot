importScripts('../config.js');
importScripts('../services/auth.js');
importScripts('../services/storage.js');
importScripts('../services/credits.js');
importScripts('../services/youtube-api.js');
importScripts('../services/reactions-state.js');
importScripts('../services/queue-storage.js');

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

  console.log('[TubePilot] apiFetch:', CONFIG.API_URL + endpoint, 'method:', mergedOptions.method || 'GET');
  const response = await fetch(CONFIG.API_URL + endpoint, mergedOptions);
  console.log('[TubePilot] apiFetch response:', response.status, response.statusText);

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

// --- Migrate single channel to multi-channel storage ---
authService.migrateFromSingleChannel().catch(() => {});

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
      handleGenerateYouTubeMeta(message.videoDescription, message.product, message.channelContext)
        .then(result => sendResponse({ result }))
        .catch(err => sendResponse({ error: err.message }));
      return true;

    case 'CHECK_AUTH':
      authService.checkAuth()
        .then(result => {
          if (result.authenticated) {
            creditsService.getBalance()
              .then(credits => sendResponse({ ...result, credits }))
              .catch(() => sendResponse({ ...result, credits: null }));
          } else {
            sendResponse(result);
          }
        })
        .catch(() => {
          sendResponse({ authenticated: false, user: null });
        });
      return true;

    case 'SIGN_IN':
      authService.signIn()
        .then(user => {
          creditsService.getBalance(true).then(credits => {
            sendResponse({ success: true, user, credits });
          }).catch(() => {
            sendResponse({ success: true, user, credits: null });
          });
        })
        .catch(err => {
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

    case 'GET_CREDIT_PACKS':
      creditsService.getCreditPacks()
        .then(packs => sendResponse({ success: true, packs }))
        .catch(err => sendResponse({ success: false, packs: [], error: err.message }));
      return true;

    case 'BUY_CREDITS':
      creditsService.createCheckoutSession(message.packId || 'standard')
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
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
      handleApplyViaApi(message.videoId, message.metadata, message.channelId)
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_YOUTUBE_TOKEN':
      handleGetYouTubeToken(message.channelId)
        .then(token => sendResponse({ success: true, token }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'CHECK_YOUTUBE_SCOPE':
      authService.getYouTubeToken(false)
        .then(token => sendResponse({ granted: true }))
        .catch(() => sendResponse({ granted: false }));
      return true;

    case 'FETCH_CHANNEL_INFO':
      handleFetchChannelInfo(message.channelId)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'FETCH_PLAYLISTS':
      handleFetchPlaylists(message.channelId)
        .then(playlists => sendResponse({ success: true, playlists }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_CHANNEL_CACHE':
      handleGetChannelCache(message.channelId)
        .then(data => sendResponse({ data }))
        .catch(() => sendResponse({ data: null }));
      return true;

    case 'REFRESH_CHANNEL':
      handleRefreshChannel(message.channelId)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'ADD_TO_PLAYLIST':
      handleAddToPlaylist(message.playlistId, message.videoId, message.channelId)
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'ADD_CHANNEL':
      handleAddChannel()
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_CONNECTED_CHANNELS':
      authService.getConnectedChannels()
        .then(channels => sendResponse({ success: true, channels }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'REMOVE_CHANNEL':
      authService.removeChannel(message.channelId)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_CHANNEL_TOKEN':
      handleGetChannelToken(message.channelId)
        .then(token => sendResponse({ success: true, token }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'SET_SELECTED_CHANNEL':
      authService.setSelectedChannel(message.channelId)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'RECONNECT_CHANNEL':
      handleReconnectChannel(message.channelId)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_QUOTA_STATUS':
      youtubeApiService.getQuotaStatus()
        .then(status => sendResponse({ success: true, ...status }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'TRACK_UPLOAD_QUOTA':
      handleTrackUploadQuota(message.channelId, message.channelName)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'OPEN_REACTIONS':
      chrome.tabs.create({ url: chrome.runtime.getURL('reactions/reactions.html') });
      sendResponse({ success: true });
      break;

    // --- Reactions ---
    case RX_MESSAGES.LOAD_VIDEO:
      handleRxSetYouTubeTab(message, sender.tab?.id)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => {
          rxState = RX_STATES.IDLE;
          broadcastRxState();
          sendResponse({ success: false, error: err.message });
        });
      return true;

    case RX_MESSAGES.YOUTUBE_SEARCH:
      handleRxYouTubeSearch(message)
        .then(results => sendResponse({ success: true, results }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case RX_MESSAGES.LOAD_NEXT_VIDEO:
      handleRxNavigateYouTube(message, sender.tab?.id)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case RX_MESSAGES.PLAY:
      if (rxYouTubeTabId) {
        chrome.tabs.sendMessage(rxYouTubeTabId, { type: RX_MESSAGES.YT_PLAY })
          .then(() => sendResponse({ success: true }))
          .catch(err => sendResponse({ success: false, error: err.message }));
      } else {
        sendResponse({ success: false, error: 'No YouTube tab' });
      }
      return true;

    case RX_MESSAGES.PAUSE_VIDEO:
      if (rxYouTubeTabId) {
        chrome.tabs.sendMessage(rxYouTubeTabId, { type: RX_MESSAGES.YT_PAUSE })
          .then(() => sendResponse({ success: true }))
          .catch(err => sendResponse({ success: false, error: err.message }));
      } else {
        sendResponse({ success: false, error: 'No YouTube tab' });
      }
      return true;

    case RX_MESSAGES.SEEK:
      if (rxYouTubeTabId) {
        chrome.tabs.sendMessage(rxYouTubeTabId, { type: RX_MESSAGES.YT_SEEK, time: message.time })
          .then(() => sendResponse({ success: true }))
          .catch(err => sendResponse({ success: false, error: err.message }));
      } else {
        sendResponse({ success: false, error: 'No YouTube tab' });
      }
      return true;

    case RX_MESSAGES.YT_PLAYER_STATE:
      // Forward player state from content script to reactions tab
      if (rxReactionsTabId) {
        chrome.tabs.sendMessage(rxReactionsTabId, {
          type: RX_MESSAGES.PLAYER_STATE,
          currentTime: message.currentTime,
          duration: message.duration,
          playerState: message.playerState
        }).catch(() => {});
      }
      break;

    case RX_MESSAGES.YT_VIDEO_DIMENSIONS:
      // Forward video dimensions from content script to reactions tab
      if (rxReactionsTabId) {
        chrome.tabs.sendMessage(rxReactionsTabId, {
          type: RX_MESSAGES.VIDEO_DIMENSIONS,
          videoWidth: message.videoWidth,
          videoHeight: message.videoHeight
        }).catch(() => {});
      }
      break;

    case RX_MESSAGES.YT_CONTENT_READY:
      // Content script loaded in a YouTube tab
      break;

    case RX_MESSAGES.START_CAPTURE:
      handleRxStartCapture()
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case RX_MESSAGES.STOP_CAPTURE:
      handleRxStopCapture()
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case RX_MESSAGES.PAUSE:
      rxState = RX_STATES.PAUSED;
      broadcastRxState();
      sendResponse({ success: true });
      break;

    case RX_MESSAGES.RESUME:
      rxState = RX_STATES.RECORDING;
      broadcastRxState();
      sendResponse({ success: true });
      break;

    case RX_MESSAGES.GET_STATE:
      sendResponse({ success: true, state: rxState, youTubeTabId: rxYouTubeTabId });
      break;

    case RX_MESSAGES.RECORDING_READY:
      rxState = RX_STATES.STOPPED;
      broadcastRxState(message);
      sendResponse({ success: true });
      break;

    case RX_MESSAGES.QUEUE_PLAY_VIDEO:
      // Forward to reactions tab from sidepanel
      if (rxReactionsTabId) {
        chrome.tabs.sendMessage(rxReactionsTabId, message)
          .then(() => sendResponse({ success: true }))
          .catch(() => sendResponse({ success: false, error: 'Reactions tab not responding' }));
      } else {
        sendResponse({ success: false, error: 'No reactions tab open' });
      }
      return true;

    case RX_MESSAGES.CLEANUP:
      rxYouTubeTabId = null;
      rxState = RX_STATES.IDLE;
      broadcastRxState();
      sendResponse({ success: true });
      break;
  }
});

// --- YouTube Metadata Generation ---

const CREDITS_PER_GENERATION = 1;

async function handleGenerateYouTubeMeta(videoDescription, product, channelContext) {
  console.log('[TubePilot] handleGenerateYouTubeMeta called', { hasDesc: !!videoDescription, hasProduct: !!product, hasChannel: !!channelContext });

  const token = await getAuthToken();
  console.log('[TubePilot] Auth token:', token ? 'present (' + token.slice(0, 8) + '...)' : 'MISSING');
  if (!token) {
    throw new Error('Sign in required to generate metadata');
  }

  console.log('[TubePilot] Deducting credits...');
  const creditResult = await creditsService.useCredits(CREDITS_PER_GENERATION, 'youtube_generate_meta');
  console.log('[TubePilot] Credit result:', JSON.stringify(creditResult));
  if (!creditResult.success) {
    if (creditResult.error === 'insufficient_credits') {
      throw new Error(`Insufficient credits (${creditResult.creditsRemaining} remaining). Purchase more to continue.`);
    }
    if (creditResult.error === 'not_authenticated') {
      throw new Error('Session expired — please sign in again');
    }
    throw new Error(`Failed to verify credits (${creditResult.error}). Please try again.`);
  }

  function truncate(str, max) {
    return typeof str === 'string' ? str.slice(0, max) : '';
  }

  const payload = {
    videoDescription: truncate(videoDescription, 3000),
    channelContext: truncate(channelContext || '', 1000)
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

  console.log('[TubePilot] Sending API request to /api/v1/youtube-generate-meta', { payloadKeys: Object.keys(payload), descLength: payload.videoDescription.length });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await apiFetch('/api/v1/youtube-generate-meta', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    console.log('[TubePilot] API response status:', res.status);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('[TubePilot] API error response:', res.status, errBody);
      if (res.status === 401) throw new Error('Session expired — please sign in again');
      if (res.status === 402) throw new Error('Insufficient credits — purchase more to continue');
      if (res.status === 429) throw new Error('Rate limit exceeded — wait a moment');
      if (res.status === 503) throw new Error('AI service unavailable');
      throw new Error(`Failed to generate metadata (${res.status}): ${errBody.slice(0, 200) || 'no details'}`);
    }

    const data = await res.json();
    console.log('[TubePilot] API response data keys:', Object.keys(data));
    if (!data.title) throw new Error('Empty response from API');
    return data;
  } catch (err) {
    console.error('[TubePilot] Generation error:', err.name, err.message);
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

async function handleApplyViaApi(videoId, metadata, channelId) {
  if (!videoId) throw new Error('No video ID provided');
  if (!metadata) throw new Error('No metadata provided');

  const token = await resolveYouTubeTokenStrict(channelId);
  const result = await youtubeApiService.applyMetadata(videoId, metadata, token);
  return result;
}

// --- YouTube Channel Data ---

async function handleFetchChannelInfo(channelId) {
  const token = await resolveYouTubeTokenStrict(channelId);

  const channelInfo = await youtubeApiService.getChannelInfo(token);
  const playlists = await youtubeApiService.getPlaylists(token);

  const data = {
    ...channelInfo,
    playlists,
    lastFetched: Date.now()
  };

  // Also update in multi-channel storage if applicable
  if (channelInfo.channelId) {
    const channels = await authService.getConnectedChannels();
    if (channels[channelInfo.channelId]) {
      const ch = channels[channelInfo.channelId];
      Object.assign(ch, {
        channelName: channelInfo.channelName,
        channelAvatar: channelInfo.channelAvatar,
        channelDescription: channelInfo.channelDescription,
        channelKeywords: channelInfo.channelKeywords,
        subscriberCount: channelInfo.subscriberCount,
        videoCount: channelInfo.videoCount,
        playlists,
        lastFetched: Date.now()
      });
      await chrome.storage.local.set({ [CONFIG.CHANNELS_STORAGE_KEY]: channels });
    }
  }

  // Keep legacy cache for backwards compat
  await chrome.storage.local.set({ tubepilot_channel: data });
  return data;
}

async function handleFetchPlaylists(channelId) {
  const token = await resolveYouTubeTokenStrict(channelId);
  const playlists = await youtubeApiService.getPlaylists(token);

  // Update playlists in multi-channel storage
  const id = channelId || await authService.getSelectedChannelId();
  if (id) {
    const channels = await authService.getConnectedChannels();
    if (channels[id]) {
      channels[id].playlists = playlists;
      channels[id].lastFetched = Date.now();
      await chrome.storage.local.set({ [CONFIG.CHANNELS_STORAGE_KEY]: channels });
    }
  }

  // Also update legacy cache
  const stored = await chrome.storage.local.get(['tubepilot_channel']);
  const existing = stored.tubepilot_channel || {};
  existing.playlists = playlists;
  existing.lastFetched = Date.now();
  await chrome.storage.local.set({ tubepilot_channel: existing });

  return playlists;
}

async function handleRefreshChannel(channelId) {
  const token = await resolveYouTubeTokenStrict(channelId);

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

  // Update multi-channel storage
  if (channelInfo.channelId) {
    const channels = await authService.getConnectedChannels();
    if (channels[channelInfo.channelId]) {
      const ch = channels[channelInfo.channelId];
      Object.assign(ch, {
        channelName: channelInfo.channelName,
        channelAvatar: channelInfo.channelAvatar,
        channelDescription: channelInfo.channelDescription,
        channelKeywords: channelInfo.channelKeywords,
        subscriberCount: channelInfo.subscriberCount,
        videoCount: channelInfo.videoCount,
        playlists,
        lastFetched: Date.now()
      });
      await chrome.storage.local.set({ [CONFIG.CHANNELS_STORAGE_KEY]: channels });
    }
  }

  return { ...data, channelChanged };
}

async function handleAddToPlaylist(playlistId, videoId, channelId) {
  if (!playlistId) throw new Error('No playlist ID provided');
  if (!videoId) throw new Error('No video ID provided');

  const token = await resolveYouTubeTokenStrict(channelId);
  return await youtubeApiService.addToPlaylist(playlistId, videoId, token);
}

async function handleTrackUploadQuota(channelId, channelName) {
  await trackQuota('videos.insert', channelId, channelName);
}

// --- Multi-Channel Handlers ---

/**
 * Strict token resolver: get the token for the specified (or selected) channel.
 * NEVER falls back to chrome.identity.getAuthToken, which may belong to a
 * completely different Google account / YouTube channel.
 */
async function resolveYouTubeTokenStrict(channelId) {
  // Determine which channel to use
  const id = channelId || await authService.getSelectedChannelId();
  if (!id) {
    throw new Error('No channel selected — connect a YouTube channel first');
  }

  const token = await authService.getChannelToken(id);
  if (token) return token;

  // Token expired — tell the user which channel needs reconnecting
  const channels = await authService.getConnectedChannels();
  const name = channels[id]?.channelName || id;
  throw new Error(`Token expired for "${name}" — reconnect the channel to continue`);
}

/**
 * GET_YOUTUBE_TOKEN handler: use per-channel token when channelId is provided.
 * Only falls back to legacy chrome.identity when no channelId is specified
 * AND no channel is selected (i.e. legacy/initial setup flow).
 */
async function handleGetYouTubeToken(channelId) {
  // If a specific channel is requested, use strict resolution (no cross-account fallback)
  if (channelId) {
    return await resolveYouTubeTokenStrict(channelId);
  }

  // Try selected channel first
  try {
    return await resolveYouTubeTokenStrict();
  } catch {
    // No channel selected or token expired — fall back to legacy only for initial setup
    try {
      return await authService.getYouTubeToken(false);
    } catch {
      return await authService.getYouTubeToken(true);
    }
  }
}

/**
 * GET_CHANNEL_CACHE: read from multi-channel storage (selected channel), fall back to legacy.
 */
async function handleGetChannelCache(channelId) {
  await enforceDataFreshness();

  // Try multi-channel storage first (prefer explicit channelId, fall back to selected)
  const id = channelId || await authService.getSelectedChannelId();
  if (id) {
    const channels = await authService.getConnectedChannels();
    if (channels[id]) return channels[id];
  }

  // Fall back to legacy single-channel cache
  const result = await chrome.storage.local.get(['tubepilot_channel']);
  return result.tubepilot_channel || null;
}

/**
 * GET_CHANNEL_TOKEN: return per-channel token (selected if no channelId specified).
 */
async function handleGetChannelToken(channelId) {
  const id = channelId || await authService.getSelectedChannelId();
  if (!id) throw new Error('No channel selected');

  const token = await authService.getChannelToken(id);
  if (!token) throw new Error('Channel token expired — reconnect required');
  return token;
}

/**
 * Fetch the Google account email for a token (used as login_hint for silent refresh).
 */
async function fetchLoginHint(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email || null;
  } catch {
    return null;
  }
}

/**
 * ADD_CHANNEL: run launchWebAuthFlow, fetch channel info + playlists, store, auto-select.
 */
async function handleAddChannel() {
  const { accessToken, expiresIn } = await authService.addYouTubeChannel();

  // Fetch channel info and playlists with the new token
  const channelInfo = await youtubeApiService.getChannelInfo(accessToken);
  const playlists = await youtubeApiService.getPlaylists(accessToken);

  // Fetch the Google account email to use as login_hint for silent token refresh
  const loginHint = await fetchLoginHint(accessToken);

  const channelData = { ...channelInfo, playlists, loginHint };

  // Store the channel
  const stored = await authService.storeChannel(channelData, accessToken, expiresIn);

  // Auto-select if it's the first channel
  const channels = await authService.getConnectedChannels();
  if (Object.keys(channels).length === 1) {
    await authService.setSelectedChannel(channelInfo.channelId);
  }

  return stored;
}

/**
 * RECONNECT_CHANNEL: re-run launchWebAuthFlow, update token for the channel.
 * If user picks a different account, adds a new channel instead.
 */
async function handleReconnectChannel(channelId) {
  const { accessToken, expiresIn } = await authService.addYouTubeChannel();

  // Fetch channel info to see which channel this token belongs to
  const channelInfo = await youtubeApiService.getChannelInfo(accessToken);
  const playlists = await youtubeApiService.getPlaylists(accessToken);
  const loginHint = await fetchLoginHint(accessToken);

  const channelData = { ...channelInfo, playlists, loginHint };
  const stored = await authService.storeChannel(channelData, accessToken, expiresIn);

  // If user authenticated a different channel than expected, note it
  return stored;
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

// ==========================================================
// Reactions feature — YouTube tab tracking + state management
// ==========================================================

let rxState = RX_STATES.IDLE;
let rxYouTubeTabId = null;
let rxReactionsTabId = null;

// --- Persist/restore SW state across restarts ---

async function persistRxSwState() {
  await chrome.storage.session.set({
    [RX_STORAGE_KEYS.SW_STATE]: { rxState, rxYouTubeTabId, rxReactionsTabId }
  });
}

(async () => {
  try {
    const result = await chrome.storage.session.get([RX_STORAGE_KEYS.SW_STATE]);
    const saved = result[RX_STORAGE_KEYS.SW_STATE];
    if (!saved) return;

    if (saved.rxYouTubeTabId) {
      try {
        await chrome.tabs.get(saved.rxYouTubeTabId);
        rxYouTubeTabId = saved.rxYouTubeTabId;
      } catch {
        rxYouTubeTabId = null;
      }
    }

    if (saved.rxReactionsTabId) {
      try {
        await chrome.tabs.get(saved.rxReactionsTabId);
        rxReactionsTabId = saved.rxReactionsTabId;
      } catch {
        rxReactionsTabId = null;
      }
    }

    rxState = saved.rxState || RX_STATES.IDLE;
  } catch (err) {
    console.error('RX restore failed:', err.message);
  }
})();

function broadcastRxState(extra = {}) {
  persistRxSwState();
  chrome.runtime.sendMessage({
    type: RX_MESSAGES.STATE_CHANGED,
    state: rxState,
    ...extra
  }).catch(() => {});
}

// --- SET_YOUTUBE_TAB: reactions page created the tab + captured via getDisplayMedia ---

async function handleRxSetYouTubeTab(message, senderTabId) {
  const youTubeTabId = message.youTubeTabId;

  rxYouTubeTabId = youTubeTabId || null;
  rxReactionsTabId = senderTabId;
  rxState = RX_STATES.READY;
  broadcastRxState();

  // Activate content script polling in the YouTube tab (skip for screen capture)
  if (rxYouTubeTabId) {
    try {
      await chrome.tabs.sendMessage(rxYouTubeTabId, { type: RX_MESSAGES.YT_ACTIVATE });
    } catch {
      // Content script may not be ready yet — re-injects on page load
    }
  }

  return {};
}

// --- LOAD_NEXT_VIDEO: navigate the captured YouTube tab to a new embed URL ---

async function handleRxNavigateYouTube(message, senderTabId) {
  const videoId = message.videoId;
  if (!videoId) throw new Error('No videoId provided');

  if (!rxYouTubeTabId) {
    throw new Error('No YouTube tab');
  }

  if (senderTabId) {
    rxReactionsTabId = senderTabId;
  }

  // Navigate the already-captured YouTube tab — stream persists
  await chrome.tabs.update(rxYouTubeTabId, {
    url: `https://www.youtube.com/watch?v=${videoId}&autoplay=1`
  });

  persistRxSwState();

  // Re-activate content script after navigation — content script re-injects on full nav
  setTimeout(async () => {
    try {
      await chrome.tabs.sendMessage(rxYouTubeTabId, { type: RX_MESSAGES.YT_ACTIVATE });
    } catch {}
  }, 2000);

  return {};
}

// --- Recording state management (recording happens in reactions page) ---

async function handleRxStartCapture() {
  rxState = RX_STATES.RECORDING;
  broadcastRxState();
  return { state: rxState };
}

async function handleRxStopCapture() {
  rxState = RX_STATES.STOPPED;
  broadcastRxState();
  return {};
}

// --- YOUTUBE_SEARCH: search YouTube via Data API ---

async function handleRxYouTubeSearch(message) {
  const query = message.query;
  if (!query) throw new Error('No search query provided');

  const token = await handleGetYouTubeToken();
  return await youtubeApiService.searchVideos(query, token, message.maxResults);
}

// --- YouTube tab cleanup on close ---

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === rxYouTubeTabId) {
    rxYouTubeTabId = null;
    if (rxState === RX_STATES.RECORDING || rxState === RX_STATES.PAUSED) {
      rxState = RX_STATES.STOPPED;
    } else if (rxState !== RX_STATES.STOPPED) {
      rxState = RX_STATES.IDLE;
    }
    broadcastRxState({ youTubeTabClosed: true });
  }
});
