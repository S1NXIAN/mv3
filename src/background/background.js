/**
 * MV3 — Service Worker (Entry Point)
 *
 * Wires together the modular subsystems:
 *   1. config-defaults  — Shared default values
 *   2. config           — Config loader with TTL cache + H264ify lifecycle
 *   3. badge            — Icon state controller with debouncing
 *   4. tab-state        — Per-tab HLS state (hybrid cache + local storage)
 *   5. hls-sniffer      — webRequest-based .m3u8 detection
 *   6. native-messaging — MPV dispatch + context menu
 *   7. message-router   — Internal message handler (popup ↔ SW)
 */

importScripts(
  "../utils/config-defaults.js",
  "config.js",
  "badge.js",
  "tab-state.js",
  "hls-sniffer.js",
  "native-messaging.js",
  "message-router.js"
);
