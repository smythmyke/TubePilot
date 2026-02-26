/**
 * TubePilot Reactions — Shared queue persistence API
 *
 * Used by both the reactions page and sidepanel to keep queue state in
 * chrome.storage.local so it persists across browser restarts and syncs
 * between contexts via chrome.storage.onChanged.
 */

const QueueStorage = {
  _KEY: RX_STORAGE_KEYS.QUEUE,
  _MAX_HISTORY: 20,

  async load() {
    const result = await chrome.storage.local.get([this._KEY]);
    return result[this._KEY] || { nowPlaying: null, queue: [], playHistory: [] };
  },

  async save(data) {
    // Trim history to prevent unbounded growth
    if (data.playHistory && data.playHistory.length > this._MAX_HISTORY) {
      data.playHistory = data.playHistory.slice(-this._MAX_HISTORY);
    }
    await chrome.storage.local.set({ [this._KEY]: data });
  },

  async addToQueue(videoObj) {
    const data = await this.load();
    // Dedup: check nowPlaying and queue
    if (data.nowPlaying && data.nowPlaying.videoId === videoObj.videoId) {
      return 'already_playing';
    }
    if (data.queue.some(v => v.videoId === videoObj.videoId)) {
      return 'already_queued';
    }
    if (data.queue.length >= (CONFIG?.REACTIONS?.QUEUE_MAX_SIZE || 50)) {
      return 'queue_full';
    }
    data.queue.push(videoObj);
    await this.save(data);
    return 'added';
  },

  async removeFromQueue(index) {
    const data = await this.load();
    if (index >= 0 && index < data.queue.length) {
      data.queue.splice(index, 1);
      await this.save(data);
    }
  },

  async moveQueueItem(index, direction) {
    const data = await this.load();
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= data.queue.length) return;
    const temp = data.queue[index];
    data.queue[index] = data.queue[newIndex];
    data.queue[newIndex] = temp;
    await this.save(data);
  },

  async setNowPlaying(videoObj) {
    const data = await this.load();
    if (data.nowPlaying) {
      data.playHistory.push(data.nowPlaying);
    }
    data.nowPlaying = videoObj;
    await this.save(data);
  },

  async shiftQueue() {
    const data = await this.load();
    if (data.queue.length === 0) return null;
    const next = data.queue.shift();
    await this.save(data);
    return next;
  },

  onChange(callback) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes[this._KEY]) {
        callback(changes[this._KEY].newValue || { nowPlaying: null, queue: [], playHistory: [] });
      }
    });
  }
};

/**
 * Parse a YouTube video ID from various input formats.
 * Handles youtube.com, youtu.be, /shorts/, /embed/, /live/, and direct IDs.
 */
function parseVideoId(input) {
  if (!input) return null;
  input = input.trim();
  // Direct ID (11 chars)
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  // URL patterns
  try {
    const url = new URL(input);
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      if (url.hostname === 'youtu.be') return url.pathname.slice(1);
      const v = url.searchParams.get('v');
      if (v) return v;
      // /embed/ID, /shorts/ID, /live/ID
      const pathMatch = url.pathname.match(/\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
      if (pathMatch) return pathMatch[1];
    }
  } catch {}
  // Fallback — treat as ID if it looks plausible
  if (/^[a-zA-Z0-9_-]{10,12}$/.test(input)) return input;
  return null;
}
