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
    console.log('[TubePilot Auth] signIn() started');

    // Step 1: Get Google OAuth token via chrome.identity
    console.log('[TubePilot Auth] Step 1: Requesting token via chrome.identity.getAuthToken...');
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          console.error('[TubePilot Auth] Step 1 FAILED:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        console.log('[TubePilot Auth] Step 1 OK: got token', token ? token.substring(0, 10) + '...' : 'null');
        resolve(token);
      });
    });

    // Step 2: Get user profile from Google
    console.log('[TubePilot Auth] Step 2: Fetching userinfo from Google...');
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('[TubePilot Auth] Step 2 response status:', userInfoResponse.status);
    if (!userInfoResponse.ok) {
      const errText = await userInfoResponse.text();
      console.error('[TubePilot Auth] Step 2 FAILED:', errText);
      throw new Error(`Failed to get user info from Google (${userInfoResponse.status})`);
    }

    const userInfo = await userInfoResponse.json();
    console.log('[TubePilot Auth] Step 2 OK: user =', userInfo.email);

    // Step 3: Register/authenticate with backend
    // Note: Do NOT send X-Extension-Id here — the backend middleware blocks
    // unauthenticated extension requests. After sign-in, the gtp_ session token
    // will be used for subsequent requests (which bypasses the extension check).
    console.log('[TubePilot Auth] Step 3: Authenticating with backend...', AUTH_API_BASE + '/api/auth/google');
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

    console.log('[TubePilot Auth] Step 3 response status:', authResponse.status);
    if (!authResponse.ok) {
      const errText = await authResponse.text();
      console.error('[TubePilot Auth] Step 3 FAILED:', errText);
      throw new Error(`Failed to authenticate with backend (${authResponse.status})`);
    }

    const authData = await authResponse.json();
    console.log('[TubePilot Auth] Step 3 OK: token received =', !!authData.token, 'isAdmin =', authData.isAdmin);

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

    console.log('[TubePilot Auth] signIn() complete for', this.user.email);
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
}

AuthService.instance = null;
const authService = AuthService.getInstance();
