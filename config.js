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
  MAX_SINGLE_TAG_LENGTH: 30, // per-tag character limit
  MAX_HASHTAGS: 15, // max hashtags in description before YouTube ignores them

  // YouTube Data API
  YOUTUBE_API_BASE: 'https://www.googleapis.com/youtube/v3',
  YOUTUBE_UPLOAD_API: 'https://www.googleapis.com/upload/youtube/v3/videos',
  YOUTUBE_API_SCOPE: 'https://www.googleapis.com/auth/youtube.force-ssl',

  // Multi-channel storage keys
  CHANNELS_STORAGE_KEY: 'tubepilot_channels',
  SELECTED_CHANNEL_KEY: 'tubepilot_selected_channel',
  CHANNEL_PLAYLIST_KEY: 'tubepilot_channel_playlist',

  // OAuth client ID — Web Application type (for launchWebAuthFlow)
  OAUTH_CLIENT_ID: '815700675676-qi7s0i6o92vqqn6usk2vs374p18p1tu9.apps.googleusercontent.com',

  // Upload history
  UPLOAD_HISTORY_KEY: 'tubepilot_upload_history',
  UPLOAD_HISTORY_MAX: 50,

  // Apply strategy
  APPLY_STRATEGY_KEY: 'tubepilot_apply_strategy',
  APPLY_STRATEGIES: {
    DOM: 'dom',
    API: 'api',
    API_WITH_DOM_FALLBACK: 'api_with_dom_fallback'
  },

  // Upload automation
  VISIBILITY_KEY: 'tubepilot_visibility',
  VISIBILITY: {
    PRIVATE: 'PRIVATE',
    UNLISTED: 'UNLISTED',
    PUBLIC: 'PUBLIC'
  },

  // Made for Kids
  KIDS_KEY: 'tubepilot_kids',

  // Reactions feature
  REACTIONS: {
    DB_NAME: 'tubepilot_reactions',
    DB_STORE: 'recordings',
    MAX_RECORDING_AGE_MS: 7 * 24 * 60 * 60 * 1000,
    DEFAULT_PIP_POSITION: 'bottom-right',
    DEFAULT_PIP_SIZE: 25,
    DEFAULT_TAB_VOLUME: 75,
    DEFAULT_MIC_VOLUME: 100,
    CANVAS_WIDTH: 1920,
    CANVAS_HEIGHT: 1080,
    FRAME_RATE: 30,
    VIDEO_BITRATE: 2_500_000
  },

  // Upload wizard DOM selectors
  SELECTORS: {
    // Dashboard
    CREATE_BUTTON: 'ytcp-button.ytcpAppHeaderCreateIcon',
    UPLOAD_MENU_ITEM: 'tp-yt-paper-item[test-id="upload"]',

    // Upload dialog
    UPLOAD_DIALOG: 'ytcp-uploads-dialog',
    SCROLLABLE_CONTENT: '#scrollable-content',

    // Details step
    TITLE_TEXTAREA: '#title-textarea',
    DESCRIPTION_TEXTAREA: '#description-textarea',
    TOGGLE_BUTTON: '#toggle-button',
    CHIP_BAR_INPUT: 'ytcp-chip-bar input',

    // Navigation
    NEXT_BUTTON: '#next-button',
    DONE_BUTTON: '#done-button',
    BACK_BUTTON: '#back-button',

    // Stepper
    STEP_DETAILS: '#step-badge-0',
    STEP_ELEMENTS: '#step-badge-1',
    STEP_CHECKS: '#step-badge-2',
    STEP_VISIBILITY: '#step-badge-3',

    // Checks
    CHECK_SUCCESS_ICON: 'ytcp-uploads-check-status yt-icon#success-icon',
    CHECK_PROGRESS_LABEL: '.progress-label',

    // Made for Kids (audience section on Details step)
    AUDIENCE_SECTION: '#audience',
    KIDS_YES_RADIO: 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_MFK"]',
    KIDS_NO_RADIO: 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',

    // Visibility
    PRIVACY_RADIOS: '#privacy-radios',
    PRIVATE_RADIO: 'tp-yt-paper-radio-button[name="PRIVATE"]',
    UNLISTED_RADIO: 'tp-yt-paper-radio-button[name="UNLISTED"]',
    PUBLIC_RADIO: 'tp-yt-paper-radio-button[name="PUBLIC"]',

    // Published dialog
    SHARE_URL: '#share-url',
    CLOSE_BUTTON: '#close-button',
    CLOSE_ICON_BUTTON: '#close-icon-button'
  }
};
