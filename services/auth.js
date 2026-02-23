/**
 * TubePilot Auth Service
 * Google OAuth 3-step flow: chrome.identity → Google userinfo → backend session
 */

const AUTH_API_BASE = 'https://business-search-api-815700675676.us-central1.run.app';
const AUTH_STORAGE_PREFIX = 'tubepilot_';

class AuthService {
  constructor() {
    this.user = null;
    this.listeners = [];
  }

  static getInstance() {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  onAuthChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  notifyListeners(user) {
    this.listeners.forEach(callback => callback(user));
  }

  async signIn() {
    // Step 1: Get Google OAuth token via chrome.identity
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(token);
      });
    });

    // Step 2: Get user profile from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!userInfoResponse.ok) {
      throw new Error(`Failed to get user info from Google (${userInfoResponse.status})`);
    }

    const userInfo = await userInfoResponse.json();

    // Step 3: Register/authenticate with backend
    const authResponse = await fetch(`${AUTH_API_BASE}/api/auth/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        googleToken: token,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture
      })
    });

    if (!authResponse.ok) {
      throw new Error(`Failed to authenticate with backend (${authResponse.status})`);
    }

    const authData = await authResponse.json();

    this.user = {
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      isAdmin: authData.isAdmin || false
    };

    await chrome.storage.local.set({
      [AUTH_STORAGE_PREFIX + 'token']: authData.token || token,
      [AUTH_STORAGE_PREFIX + 'user']: this.user,
      authToken: authData.token || token
    });

    this.notifyListeners(this.user);
    return this.user;
  }

  async signOut() {
    const result = await chrome.storage.local.get([AUTH_STORAGE_PREFIX + 'token']);
    const token = result[AUTH_STORAGE_PREFIX + 'token'];

    if (token) {
      await new Promise((resolve) => {
        chrome.identity.removeCachedAuthToken({ token }, resolve);
      });
    }

    await chrome.storage.local.remove([
      AUTH_STORAGE_PREFIX + 'token',
      AUTH_STORAGE_PREFIX + 'user',
      AUTH_STORAGE_PREFIX + 'credits',
      'authToken'
    ]);

    this.user = null;
    this.notifyListeners(null);
  }

  async checkAuth() {
    const result = await chrome.storage.local.get([
      AUTH_STORAGE_PREFIX + 'user',
      AUTH_STORAGE_PREFIX + 'token'
    ]);

    if (result[AUTH_STORAGE_PREFIX + 'user'] && result[AUTH_STORAGE_PREFIX + 'token']) {
      this.user = result[AUTH_STORAGE_PREFIX + 'user'];
      return { authenticated: true, user: this.user };
    }

    return { authenticated: false, user: null };
  }

  getUser() {
    return this.user;
  }

  /**
   * Get a YouTube-scoped OAuth token (lazy scope upgrade).
   * Only prompts for youtube.force-ssl consent when called.
   * @param {boolean} interactive - show consent prompt (true) or silent check (false)
   */
  async getYouTubeToken(interactive = true) {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      CONFIG.YOUTUBE_API_SCOPE
    ];

    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive, scopes }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!token) {
          reject(new Error('No token returned'));
          return;
        }
        resolve(token);
      });
    });

    // Mark scope as granted
    await chrome.storage.local.set({ tubepilot_youtube_scope_granted: true });
    return token;
  }

  // --- Multi-Channel OAuth (launchWebAuthFlow, implicit flow) ---

  /**
   * Launch OAuth consent for a YouTube channel via launchWebAuthFlow.
   * Returns { accessToken, expiresIn } from the URL fragment.
   */
  async addYouTubeChannel() {
    const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
    const scopes = [
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.upload'
    ];

    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: CONFIG.OAUTH_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: scopes.join(' '),
      prompt: 'consent',
      access_type: 'online',
      include_granted_scopes: 'false'
    }).toString();

    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        (callbackUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!callbackUrl) {
            reject(new Error('No callback URL returned'));
            return;
          }
          resolve(callbackUrl);
        }
      );
    });

    // Parse token from URL fragment: #access_token=...&expires_in=3600&token_type=Bearer
    const fragmentStr = responseUrl.split('#')[1];
    if (!fragmentStr) throw new Error('No token fragment in callback URL');

    const params = new URLSearchParams(fragmentStr);
    const accessToken = params.get('access_token');
    const expiresIn = parseInt(params.get('expires_in'), 10) || 3600;

    if (!accessToken) throw new Error('No access_token in callback');
    return { accessToken, expiresIn };
  }

  /**
   * Upsert a channel into the tubepilot_channels storage map.
   */
  async storeChannel(channelData, accessToken, expiresIn) {
    const result = await chrome.storage.local.get([CONFIG.CHANNELS_STORAGE_KEY]);
    const channels = result[CONFIG.CHANNELS_STORAGE_KEY] || {};

    const channelId = channelData.channelId;
    const existing = channels[channelId] || {};

    channels[channelId] = {
      ...existing,
      channelId,
      channelName: channelData.channelName || existing.channelName || '',
      channelAvatar: channelData.channelAvatar || existing.channelAvatar || '',
      channelDescription: channelData.channelDescription || existing.channelDescription || '',
      channelKeywords: channelData.channelKeywords || existing.channelKeywords || [],
      subscriberCount: channelData.subscriberCount ?? existing.subscriberCount ?? 0,
      videoCount: channelData.videoCount ?? existing.videoCount ?? 0,
      playlists: channelData.playlists || existing.playlists || [],
      loginHint: channelData.loginHint || existing.loginHint || '',
      accessToken: accessToken,
      tokenExpiresAt: Date.now() + expiresIn * 1000,
      addedAt: existing.addedAt || Date.now(),
      lastFetched: Date.now()
    };

    await chrome.storage.local.set({ [CONFIG.CHANNELS_STORAGE_KEY]: channels });
    return channels[channelId];
  }

  /**
   * Get all connected channels.
   */
  async getConnectedChannels() {
    const result = await chrome.storage.local.get([CONFIG.CHANNELS_STORAGE_KEY]);
    return result[CONFIG.CHANNELS_STORAGE_KEY] || {};
  }

  /**
   * Get a per-channel access token. If expired, attempts a silent refresh first.
   * Returns null only if both the stored token and silent refresh fail.
   */
  async getChannelToken(channelId) {
    const channels = await this.getConnectedChannels();
    const channel = channels[channelId];
    if (!channel || !channel.accessToken) return null;

    // Token still valid — return it
    if (Date.now() < channel.tokenExpiresAt) {
      return channel.accessToken;
    }

    // Token expired — try silent refresh
    try {
      const { accessToken, expiresIn } = await this.silentRefreshToken(channel.loginHint);
      const tokenChannelId = await this.verifyTokenChannel(accessToken);
      if (tokenChannelId && tokenChannelId !== channelId) {
        return null;
      }
      await this.updateChannelToken(channelId, accessToken, expiresIn);
      return accessToken;
    } catch {
      return null;
    }
  }

  /**
   * Attempt a silent (non-interactive) token refresh via launchWebAuthFlow.
   * Uses prompt=none so Google returns a token without user interaction
   * if they have an active session and have previously granted consent.
   */
  async silentRefreshToken(loginHint) {
    const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
    const scopes = [
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.upload'
    ];

    const params = {
      client_id: CONFIG.OAUTH_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: scopes.join(' '),
      prompt: 'none',
      access_type: 'online',
      include_granted_scopes: 'false'
    };

    // login_hint tells Google which account to refresh for
    if (loginHint) {
      params.login_hint = loginHint;
    }

    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
      new URLSearchParams(params).toString();

    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: false },
        (callbackUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!callbackUrl) {
            reject(new Error('No callback URL returned'));
            return;
          }
          resolve(callbackUrl);
        }
      );
    });

    const fragmentStr = responseUrl.split('#')[1];
    if (!fragmentStr) throw new Error('No token fragment in callback URL');

    const fragmentParams = new URLSearchParams(fragmentStr);
    const accessToken = fragmentParams.get('access_token');
    const expiresIn = parseInt(fragmentParams.get('expires_in'), 10) || 3600;

    if (!accessToken) throw new Error('No access_token in callback');
    return { accessToken, expiresIn };
  }

  /**
   * Quick check: which channelId does this token belong to?
   */
  async verifyTokenChannel(accessToken) {
    try {
      const res = await fetch(
        `${CONFIG.YOUTUBE_API_BASE}/channels?part=id&mine=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data.items?.[0]?.id || null;
    } catch {
      return null;
    }
  }

  /**
   * Update just the token fields for an existing channel.
   */
  async updateChannelToken(channelId, accessToken, expiresIn) {
    const result = await chrome.storage.local.get([CONFIG.CHANNELS_STORAGE_KEY]);
    const channels = result[CONFIG.CHANNELS_STORAGE_KEY] || {};
    if (!channels[channelId]) return;

    channels[channelId].accessToken = accessToken;
    channels[channelId].tokenExpiresAt = Date.now() + expiresIn * 1000;
    await chrome.storage.local.set({ [CONFIG.CHANNELS_STORAGE_KEY]: channels });
  }

  /**
   * Check if a channel's token is still valid (not expired).
   */
  async isChannelTokenValid(channelId) {
    const token = await this.getChannelToken(channelId);
    return token !== null;
  }

  /**
   * Remove a channel from storage. If it was selected, switch to another or clear.
   */
  async removeChannel(channelId) {
    const result = await chrome.storage.local.get([
      CONFIG.CHANNELS_STORAGE_KEY,
      CONFIG.SELECTED_CHANNEL_KEY,
      CONFIG.CHANNEL_PLAYLIST_KEY
    ]);

    const channels = result[CONFIG.CHANNELS_STORAGE_KEY] || {};
    delete channels[channelId];

    const playlists = result[CONFIG.CHANNEL_PLAYLIST_KEY] || {};
    delete playlists[channelId];

    const updates = {
      [CONFIG.CHANNELS_STORAGE_KEY]: channels,
      [CONFIG.CHANNEL_PLAYLIST_KEY]: playlists
    };

    // If removed channel was selected, switch to first remaining or clear
    if (result[CONFIG.SELECTED_CHANNEL_KEY] === channelId) {
      const remaining = Object.keys(channels);
      updates[CONFIG.SELECTED_CHANNEL_KEY] = remaining.length > 0 ? remaining[0] : '';
    }

    await chrome.storage.local.set(updates);
  }

  /**
   * Get the currently selected channel ID.
   */
  async getSelectedChannelId() {
    const result = await chrome.storage.local.get([CONFIG.SELECTED_CHANNEL_KEY]);
    return result[CONFIG.SELECTED_CHANNEL_KEY] || '';
  }

  /**
   * Set the selected channel ID.
   */
  async setSelectedChannel(channelId) {
    await chrome.storage.local.set({ [CONFIG.SELECTED_CHANNEL_KEY]: channelId });
  }

  /**
   * One-time migration from tubepilot_channel (single) to tubepilot_channels (multi).
   * Migrated channel has accessToken: null (needs reconnect).
   */
  async migrateFromSingleChannel() {
    const result = await chrome.storage.local.get([
      'tubepilot_channel',
      CONFIG.CHANNELS_STORAGE_KEY
    ]);

    // Only migrate if old key exists and new key doesn't
    if (!result.tubepilot_channel || result[CONFIG.CHANNELS_STORAGE_KEY]) return;

    const old = result.tubepilot_channel;
    if (!old.channelId) return;

    const channels = {
      [old.channelId]: {
        channelId: old.channelId,
        channelName: old.channelName || '',
        channelAvatar: old.channelAvatar || '',
        channelDescription: old.channelDescription || '',
        channelKeywords: old.channelKeywords || [],
        subscriberCount: old.subscriberCount || 0,
        videoCount: old.videoCount || 0,
        playlists: old.playlists || [],
        accessToken: null, // Needs reconnect
        tokenExpiresAt: 0,
        addedAt: old.lastFetched || Date.now(),
        lastFetched: old.lastFetched || Date.now()
      }
    };

    await chrome.storage.local.set({
      [CONFIG.CHANNELS_STORAGE_KEY]: channels,
      [CONFIG.SELECTED_CHANNEL_KEY]: old.channelId
    });
  }
}

AuthService.instance = null;
const authService = AuthService.getInstance();
