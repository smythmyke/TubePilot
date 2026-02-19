/**
 * TubePilot YouTube Data API Service
 * Read-merge-write pattern: reads current video state, merges generated fields, writes back.
 */

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

    return data.items[0];
  }

  /**
   * Update video snippet via videos.update (50 quota units)
   */
  async updateVideoSnippet(videoId, snippet, token) {
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

    return await res.json();
  }

  /**
   * Read → Merge → Write: applies only generated fields, preserves everything else
   */
  async applyMetadata(videoId, metadata, token) {
    // Read current state
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

    // Write back with merged snippet
    return await this.updateVideoSnippet(videoId, merged, token);
  }
}

YouTubeApiService.instance = null;
const youtubeApiService = YouTubeApiService.getInstance();
