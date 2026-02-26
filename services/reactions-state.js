/**
 * TubePilot Reactions — Shared state constants and message types
 */

const RX_STATES = {
  IDLE: 'IDLE',
  PREPARING: 'PREPARING',
  RECORDING: 'RECORDING',
  PAUSED: 'PAUSED',
  STOPPED: 'STOPPED'
};

const RX_MESSAGES = {
  START_CAPTURE: 'RX_START_CAPTURE',
  STOP_CAPTURE: 'RX_STOP_CAPTURE',
  PAUSE: 'RX_PAUSE',
  RESUME: 'RX_RESUME',
  UPDATE_CONFIG: 'RX_UPDATE_CONFIG',
  GET_STATE: 'RX_GET_STATE',
  STATE_CHANGED: 'RX_STATE_CHANGED',
  RECORDING_READY: 'RX_RECORDING_READY',
  CLEANUP: 'RX_CLEANUP'
};

const RX_PIP_POSITIONS = {
  TL: 'top-left',
  TR: 'top-right',
  BL: 'bottom-left',
  BR: 'bottom-right'
};

const RX_DEFAULTS = {
  pipPosition: RX_PIP_POSITIONS.BR,
  pipSize: 25,        // percentage of canvas width
  tabVolume: 75,      // 0-100
  micVolume: 100,     // 0-100
  canvasWidth: 1920,
  canvasHeight: 1080,
  frameRate: 30,
  videoBitrate: 2_500_000
};
