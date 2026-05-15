/**
 * config-defaults.js - Shared configuration defaults for MV3 Bridge
 *
 * Single source of truth for all default config values.
 * Consumed by: background service worker, options page, popup.
 */

self.MV3_CONFIG_DEFAULTS = Object.freeze({
  mpvPath: "/usr/bin/mpv",
  hostName: "com.mpvbridge.native",
  defaultFlags: [],
  snifferEnabled: true,
  passIdentity: true,
  forceH264: false,
  hwDec: "",
  vo: "",
  alwaysOnTop: false,
  ytdlFormat: "",
  socketTimeout: 30,
  advancedMode: false,
});
