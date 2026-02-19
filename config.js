const CONFIG = {
  API_URL: 'https://business-search-api-815700675676.us-central1.run.app',

  // YouTube category map (id → name)
  YOUTUBE_CATEGORIES: {
    1: 'Film & Animation',
    2: 'Autos & Vehicles',
    10: 'Music',
    15: 'Pets & Animals',
    17: 'Sports',
    18: 'Short Movies',
    19: 'Travel & Events',
    20: 'Gaming',
    21: 'Videoblogging',
    22: 'People & Blogs',
    23: 'Comedy',
    24: 'Entertainment',
    25: 'News & Politics',
    26: 'Howto & Style',
    27: 'Education',
    28: 'Science & Technology',
    29: 'Nonprofits & Activism'
  },

  // Field max lengths (YouTube limits)
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 5000,
  MAX_TAG_LENGTH: 500, // total chars for all tags combined
  MAX_TAGS_COUNT: 15,

  // YouTube Data API
  YOUTUBE_API_BASE: 'https://www.googleapis.com/youtube/v3',
  YOUTUBE_API_SCOPE: 'https://www.googleapis.com/auth/youtube.force-ssl',

  // Apply strategy
  APPLY_STRATEGY_KEY: 'tubepilot_apply_strategy',
  APPLY_STRATEGIES: {
    DOM: 'dom',
    API: 'api',
    API_WITH_DOM_FALLBACK: 'api_with_dom_fallback'
  }
};
