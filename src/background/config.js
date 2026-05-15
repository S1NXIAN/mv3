/**
 * config.js — Configuration loader with TTL cache
 *
 * Provides getConfig() with in-memory caching and automatic invalidation
 * on storage changes. Also manages the H264ify content script lifecycle.
 *
 * Depends on: config-defaults.js (MV3_CONFIG_DEFAULTS)
 */

const CONFIG_CACHE_TTL_MS = 5000;
const H264IFY_SCRIPT_ID = "h264ify-shield";

let _configCache = null;
let _configCacheTime = 0;
let _configPromise = null;

async function getConfig(forceRefresh = false) {
  const now = Date.now();
  if (_configCache && !forceRefresh && (now - _configCacheTime) < CONFIG_CACHE_TTL_MS) {
    return _configCache;
  }
  if (_configPromise && !forceRefresh) {
    return _configPromise;
  }
  _configPromise = chrome.storage.sync.get(MV3_CONFIG_DEFAULTS).then(config => {
    _configCache = config;
    _configCacheTime = Date.now();
    _configPromise = null;
    return config;
  });
  return _configPromise;
}

// Dynamic H264ify Management
async function syncH264ify() {
  try {
    const config = await getConfig();
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [H264IFY_SCRIPT_ID] });

    if (config.forceH264) {
      if (existing.length === 0) {
        await chrome.scripting.registerContentScripts([{
          id: H264IFY_SCRIPT_ID,
          js: ["src/scripts/h264ify.js"],
          matches: ["<all_urls>"],
          runAt: "document_start",
          world: "MAIN",
           allFrames: true
         }]);
       }
     } else {
       if (existing.length > 0) {
         await chrome.scripting.unregisterContentScripts({ ids: [H264IFY_SCRIPT_ID] });
       }
     }
  } catch (err) {
    console.error("[MV3 Bridge] Failed to sync H264ify:", err);
  }
}

// Invalidate config cache when settings change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    _configCache = null;
    if (changes.forceH264) {
      syncH264ify();
    }
  }
});

// Sync on boot
syncH264ify();
