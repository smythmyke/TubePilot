/**
 * TubePilot YouTube Data API Service
 * Read-merge-write pattern: reads current video state, merges generated fields, writes back.
 */

// --- Quota Tracking ---

const QUOTA_COSTS = {
  'videos.list': 1,
  'videos.update': 50,
  'videos.insert': 1600,
  'channels.list': 1,
  'playlists.list': 1,
  'playlistItems.insert': 50,
  'thumbnails.set': 50,
  'search.list': 100
};

const DAILY_QUOTA_LIMIT = 10000;
const QUOTA_STORAGE_KEY = 'tubepilot_quota';

async function getQuotaUsage() {
  const result = await chrome.storage.local.get([QUOTA_STORAGE_KEY]);
  const stored = result[QUOTA_STORAGE_KEY] || {};

  // Migrate from old flat format { used, date } to new structure
  if (stored.used !== undefined && !stored.global) {
    const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
    return {
      global: { used: stored.date === today ? stored.used : 0, date: today },
      channels: {}
    };
  }

  const quota = {
    global: stored.global || { used: 0, date: '' },
    channels: stored.channels || {}
  };

  // Reset if it's a new day (Pacific Time)
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
  if (quota.global.date !== today) {
    quota.global = { used: 0, date: today };
    // Reset per-channel daily counts but keep names
    for (const chId of Object.keys(quota.channels)) {
      quota.channels[chId].used = 0;
      quota.channels[chId].operations = {};
    }
  }
  return quota;
}

async function trackQuota(operation, channelId, channelName) {
  const cost = QUOTA_COSTS[operation] || 0;
  if (cost === 0) return;

  const quota = await getQuotaUsage();
  quota.global.used += cost;

  // Track per-channel if channelId provided
  if (channelId) {
    if (!quota.channels[channelId]) {
      quota.channels[channelId] = { channelName: channelName || '', used: 0, operations: {} };
    }
    quota.channels[channelId].used += cost;
    quota.channels[channelId].operations[operation] = (quota.channels[channelId].operations[operation] || 0) + 1;
    if (channelName) quota.channels[channelId].channelName = channelName;
  }

  await chrome.storage.local.set({ [QUOTA_STORAGE_KEY]: quota });

  // Quota warning is available via getQuotaStatus() in the UI
}

async function checkQuotaAvailable(operation) {
  const cost = QUOTA_COSTS[operation] || 0;
  const quota = await getQuotaUsage();
  if (quota.global.used + cost > DAILY_QUOTA_LIMIT) {
    throw new Error(`YouTube API daily quota would be exceeded (${quota.global.used}/${DAILY_QUOTA_LIMIT} used). Resets at midnight Pacific Time.`);
  }
}

// --- Data Freshness (30-day ToS requirement) ---

const DATA_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function enforceDataFreshness() {
  // Legacy single-channel cache
  const result = await chrome.storage.local.get(['tubepilot_channel']);
  const cached = result.tubepilot_channel;
  if (cached && cached.lastFetched && Date.now() - cached.lastFetched > DATA_MAX_AGE_MS) {
    await chrome.storage.local.remove(['tubepilot_channel']);
    // Cleared stale channel data (>30 days) per YouTube API ToS
  }

  // Multi-channel storage — clear stale channels
  const channelsResult = await chrome.storage.local.get([CONFIG.CHANNELS_STORAGE_KEY]);
  const channels = channelsResult[CONFIG.CHANNELS_STORAGE_KEY];
  if (channels) {
    let changed = false;
    for (const chId of Object.keys(channels)) {
      const ch = channels[chId];
      if (ch.lastFetched && Date.now() - ch.lastFetched > DATA_MAX_AGE_MS) {
        // Clear cached data but keep the channel entry (user needs to reconnect/refresh)
        ch.channelDescription = '';
        ch.channelKeywords = [];
        ch.playlists = [];
        ch.lastFetched = 0;
        changed = true;
      }
    }
    if (changed) {
      await chrome.storage.local.set({ [CONFIG.CHANNELS_STORAGE_KEY]: channels });
    }
  }
}

class YouTubeApiService {
  constructor() {}

  static getInstance() {
    if (!YouTubeApiService.instance) {
      YouTubeApiService.instance = new YouTubeApiService();
    }
    return YouTubeApiService.instance;
  }

  /**
   * Fetch current video snippet + status via videos.list (1 quota unit)
   */
  async getVideoSnippet(videoId, token) {
    await checkQuotaAvailable('videos.list');
    const url = `${CONFIG.YOUTUBE_API_BASE}/videos?part=snippet,status&id=${encodeURIComponent(videoId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const status = res.status;
      if (status === 404) throw new Error('Video not found');
      if (status === 403) throw new Error('Access denied — you may not own this video or quota exceeded');
      throw new Error(`YouTube API error (${status})`);
    }

    const data = await res.json();
    if (!data.items || data.items.length === 0) {
      throw new Error('Video not found');
    }

    await trackQuota('videos.list');
    return data.items[0];
  }

  /**
   * Update video snippet via videos.update (50 quota units)
   */
  async updateVideoSnippet(videoId, snippet, token) {
    await checkQuotaAvailable('videos.update');
    const url = `${CONFIG.YOUTUBE_API_BASE}/videos?part=snippet`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: videoId,
        snippet: snippet
      })
    });

    if (!res.ok) {
      const status = res.status;
      if (status === 403) {
        const body = await res.json().catch(() => ({}));
        const reason = body.error?.errors?.[0]?.reason;
        if (reason === 'quotaExceeded') throw new Error('YouTube API quota exceeded');
        if (reason === 'forbidden') throw new Error('Not authorized to edit this video');
        throw new Error('Access denied — check video ownership');
      }
      if (status === 404) throw new Error('Video not found');
      throw new Error(`YouTube API update failed (${status})`);
    }

    await trackQuota('videos.update');
    return await res.json();
  }

  /**
   * Fetch the authenticated user's channel info (1 quota unit)
   * Returns normalized channel object for caching.
   */
  async getChannelInfo(token) {
    await checkQuotaAvailable('channels.list');
    const url = `${CONFIG.YOUTUBE_API_BASE}/channels?part=snippet,statistics,brandingSettings&mine=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const status = res.status;
      if (status === 401) throw new Error('YouTube token expired');
      if (status === 403) throw new Error('YouTube access denied — scope may not be granted');
      throw new Error(`YouTube channels API error (${status})`);
    }

    const data = await res.json();
    if (!data.items || data.items.length === 0) {
      throw new Error('No YouTube channel found for this account');
    }

    const ch = data.items[0];
    const snippet = ch.snippet || {};
    const stats = ch.statistics || {};
    const branding = ch.brandingSettings?.channel || {};

    await trackQuota('channels.list', ch.id, snippet.title);
    return {
      channelId: ch.id,
      channelName: snippet.title || '',
      channelAvatar: snippet.thumbnails?.default?.url || '',
      channelDescription: snippet.description || '',
      channelKeywords: branding.keywords ? branding.keywords.split(/[,\s]+/).filter(Boolean) : [],
      channelUrl: snippet.customUrl ? `https://youtube.com/${snippet.customUrl}` : '',
      subscriberCount: parseInt(stats.subscriberCount, 10) || 0,
      videoCount: parseInt(stats.videoCount, 10) || 0,
      defaultLanguage: snippet.defaultLanguage || branding.defaultLanguage || '',
      country: snippet.country || ''
    };
  }

  /**
   * Fetch all playlists for the authenticated user (1 quota unit per page)
   * Returns array of { id, title }.
   */
  async getPlaylists(token) {
    await checkQuotaAvailable('playlists.list');
    const playlists = [];
    let pageToken = '';

    // Paginate (max 50 per page, most creators have < 50)
    do {
      const url = `${CONFIG.YOUTUBE_API_BASE}/playlists?part=snippet&mine=true&maxResults=50` +
                  (pageToken ? `&pageToken=${pageToken}` : '');
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const status = res.status;
        if (status === 401) throw new Error('YouTube token expired');
        if (status === 403) throw new Error('YouTube access denied');
        throw new Error(`YouTube playlists API error (${status})`);
      }

      const data = await res.json();
      await trackQuota('playlists.list');
      for (const item of (data.items || [])) {
        playlists.push({
          id: item.id,
          title: item.snippet?.title || 'Untitled'
        });
      }

      pageToken = data.nextPageToken || '';
    } while (pageToken);

    return playlists;
  }

  /**
   * Add a video to a playlist via playlistItems.insert (50 quota units)
   */
  async addToPlaylist(playlistId, videoId, token) {
    await checkQuotaAvailable('playlistItems.insert');
    const url = `${CONFIG.YOUTUBE_API_BASE}/playlistItems?part=snippet`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        snippet: {
          playlistId: playlistId,
          resourceId: {
            kind: 'youtube#video',
            videoId: videoId
          }
        }
      })
    });

    if (!res.ok) {
      const status = res.status;
      if (status === 404) throw new Error('Playlist not found');
      if (status === 403) throw new Error('Not authorized to modify this playlist');
      if (status === 409) throw new Error('Video already in this playlist');
      throw new Error(`YouTube playlistItems API error (${status})`);
    }

    await trackQuota('playlistItems.insert');
    return await res.json();
  }

  /**
   * Search YouTube videos (100 quota units per call)
   * Returns simplified objects for the reactions queue.
   */
  async searchVideos(query, token, maxResults = CONFIG.REACTIONS.SEARCH_MAX_RESULTS) {
    await checkQuotaAvailable('search.list');
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      videoEmbeddable: 'true',
      maxResults: String(maxResults)
    });
    const url = `${CONFIG.YOUTUBE_API_BASE}/search?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const status = res.status;
      if (status === 401) throw new Error('YouTube token expired');
      if (status === 403) throw new Error('YouTube API quota exceeded or access denied');
      throw new Error(`YouTube search API error (${status})`);
    }

    const data = await res.json();
    await trackQuota('search.list');

    return (data.items || []).map(item => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title || 'Untitled',
      channelTitle: item.snippet?.channelTitle || '',
      thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
      publishedAt: item.snippet?.publishedAt || ''
    })).filter(v => v.videoId);
  }

  /**
   * Get current quota usage for display purposes.
   */
  async getQuotaStatus() {
    const quota = await getQuotaUsage();
    const used = quota.global.used;
    const remaining = DAILY_QUOTA_LIMIT - used;
    const uploadCost = QUOTA_COSTS['videos.insert'];
    return {
      used,
      limit: DAILY_QUOTA_LIMIT,
      remaining,
      percentage: Math.round(used / DAILY_QUOTA_LIMIT * 100),
      uploadsRemaining: Math.max(0, Math.floor(remaining / uploadCost)),
      channels: quota.channels
    };
  }

  /**
   * Read → Merge → Write: applies only generated fields, preserves everything else
   */
  async applyMetadata(videoId, metadata, token) {
    const video = await this.getVideoSnippet(videoId, token);
    const existing = video.snippet;

    // Merge: overwrite only the fields we generated
    const merged = { ...existing };

    if (metadata.title) {
      merged.title = metadata.title;
    }
    if (metadata.description) {
      merged.description = metadata.description;
    }
    if (metadata.tags) {
      merged.tags = metadata.tags;
    }
    if (metadata.categoryId) {
      merged.categoryId = String(metadata.categoryId);
    }

    const result = await this.updateVideoSnippet(videoId, merged, token);
    return result;
  }
}

YouTubeApiService.instance = null;
const youtubeApiService = YouTubeApiService.getInstance();
