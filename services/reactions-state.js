/**
 * TubePilot Reactions — Shared state constants and message types
 */

const RX_STATES = {
  IDLE: 'IDLE',
  LOADING: 'LOADING',
  READY: 'READY',
  PREPARING: 'PREPARING',
  RECORDING: 'RECORDING',
  PAUSED: 'PAUSED',
  STOPPED: 'STOPPED'
};

const RX_MESSAGES = {
  // Video loading
  LOAD_VIDEO: 'RX_LOAD_VIDEO',
  PLAYER_READY: 'RX_PLAYER_READY',
  PLAYER_STATE: 'RX_PLAYER_STATE',
  PLAYER_ERROR: 'RX_PLAYER_ERROR',
  CAPTURE_READY: 'RX_CAPTURE_READY',

  // Playback control
  PLAY: 'RX_PLAY',
  PAUSE_VIDEO: 'RX_PAUSE_VIDEO',
  SEEK: 'RX_SEEK',
  GET_PLAYER_STATE: 'RX_GET_PLAYER_STATE',

  // Recording
  START_CAPTURE: 'RX_START_CAPTURE',
  STOP_CAPTURE: 'RX_STOP_CAPTURE',
  PAUSE: 'RX_PAUSE',
  RESUME: 'RX_RESUME',
  UPDATE_CONFIG: 'RX_UPDATE_CONFIG',
  GET_STATE: 'RX_GET_STATE',
  STATE_CHANGED: 'RX_STATE_CHANGED',
  RECORDING_READY: 'RX_RECORDING_READY',
  CLEANUP: 'RX_CLEANUP',

  // Queue / Search
  YOUTUBE_SEARCH: 'RX_YOUTUBE_SEARCH',
  LOAD_NEXT_VIDEO: 'RX_LOAD_NEXT_VIDEO'
};

const RX_VIEWS = {
  FINAL: 'FINAL',
  CAMERA: 'CAMERA',
  VIDEO: 'VIDEO'
};

const RX_PIP_POSITIONS = {
  TL: 'top-left',
  TR: 'top-right',
  BL: 'bottom-left',
  BR: 'bottom-right'
};

const RX_PIP_SHAPES = {
  RECT: 'rect',
  ROUNDED: 'rounded',
  CIRCLE: 'circle'
};

const RX_LAYOUTS = {
  PIP: 'pip',
  SIDE_BY_SIDE: 'side-by-side'
};

const RX_PRESETS = {
  PIP_TL: 'pip-tl',
  PIP_TR: 'pip-tr',
  PIP_BL: 'pip-bl',
  PIP_BR: 'pip-br',
  SIDE_BY_SIDE: 'side-by-side',
  REACTOR_OVER: 'reactor-over'
};

const RX_PIP_BORDER_COLORS = ['#cc0000', '#ffffff', '#ffd700', '#00cc66', '#3366ff', 'none'];

const RX_DEFAULTS = {
  pipPosition: RX_PIP_POSITIONS.BR,
  pipSize: 25,        // percentage of canvas width
  pipShape: RX_PIP_SHAPES.ROUNDED,
  pipBorderColor: '#cc0000',
  pipBorderWidth: 3,
  pipCornerRadius: 12,
  pipMinSize: 10,
  pipMaxSize: 45,
  resizeHandleSize: 14,
  tabVolume: 75,      // 0-100
  micVolume: 100,     // 0-100
  canvasWidth: 1920,
  canvasHeight: 1080,
  frameRate: 30,
  videoBitrate: 2_500_000
};
