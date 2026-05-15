/**
 * MV3 — Service Worker (Entry Point)
 *
 * Wires together the modular subsystems:
 *   1. config-defaults  — Shared default values
 *   2. storage-utils    — Session storage abstraction
 *   3. config           — Config loader with TTL cache + H264ify lifecycle
 *   4. badge            — Icon state controller with debouncing
 *   5. tab-state        — Per-tab HLS state (hybrid cache + session storage)
 *   6. hls-sniffer      — webRequest-based .m3u8 detection
 *   7. native-messaging — MPV dispatch + context menu
 *   8. message-router   — Internal message handler (popup ↔ SW)
 */

importScripts(
  "../utils/config-defaults.js",
  "../utils/storage-utils.js",
  "config.js",
  "badge.js",
  "tab-state.js",
  "hls-sniffer.js",
  "native-messaging.js",
  "message-router.js"
);
