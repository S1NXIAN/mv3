/**
 * MV3 — Service Worker
 *
 * Modules:
 *   1. Config loader (with expiration)
 *   2. Per-tab state manager (Hybrid Cache + Session Storage)
 *   3. HLS sniffer (webRequest) with debouncing
 *   4. Badge controller (debounced to prevent flicker)
 *   5. Context menu
 *   6. Native messaging dispatcher
 *   7. Internal message router (popup ↔ SW)
 *   8. Storage utilities
 */

importScripts("../utils/storage-utils.js");

/* ──────────────────────────────────────────────
 * 1. CONFIG (with expiration)
 * ────────────────────────────────────────────── */

const CONFIG_DEFAULTS = {
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
  advancedMode: false,
};

let _configCache = null;
let _configCacheTime = 0;
const CONFIG_CACHE_TTL = 5000;

async function getConfig(forceRefresh = false) {
  const now = Date.now();
  if (_configCache && !forceRefresh && (now - _configCacheTime) < CONFIG_CACHE_TTL) {
    return _configCache;
  }
  _configCache = await chrome.storage.sync.get(CONFIG_DEFAULTS);
  _configCacheTime = now;
  return _configCache;
}

// Dynamic H264ify Management
async function syncH264ify() {
  try {
    const config = await getConfig();
    const SCRIPT_ID = "h264ify-shield";

    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });

    if (config.forceH264) {
      if (existing.length === 0) {
        await chrome.scripting.registerContentScripts([{
          id: SCRIPT_ID,
          js: ["src/scripts/h264ify.js"],
          matches: ["<all_urls>"],
          runAt: "document_start",
          world: "MAIN",
           allFrames: true
         }]);
       }
     } else {
       if (existing.length > 0) {
         await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
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

/* ──────────────────────────────────────────────
 * 2. PER-TAB STATE (HYBRID CACHE)
 * ──────────────────────────────────────────────
 * Fast memory map backed by persistent session storage.
 */

const stateCache = new Map();
let cacheHydrated = false;

async function hydrateCache() {
  if (cacheHydrated) return;
  const data = await MV3_Storage.getSession();
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("tab_")) {
      const tabId = parseInt(key.split("_")[1], 10);
      stateCache.set(tabId, { ...value, pending: new Set() });
    }
  }
  cacheHydrated = true;
}

// Ensure cache is hydrated on SW boot
hydrateCache().catch(() => {});

async function getTabState(tabId) {
  await hydrateCache();
  if (!stateCache.has(tabId)) {
    stateCache.set(tabId, { urls: [], hasMaster: false, pending: new Set() });
  }
  return stateCache.get(tabId);
}

async function saveTabState(tabId) {
  const state = stateCache.get(tabId);
  if (!state) return;
  // Exclude 'pending' Set because Sets cannot be serialized to JSON
  const toSave = { urls: state.urls, hasMaster: state.hasMaster };
  await MV3_Storage.setSession({ [`tab_${tabId}`]: toSave });
}

async function clearTabState(tabId) {
  if (badgeUpdateTimeouts.has(tabId)) {
    clearTimeout(badgeUpdateTimeouts.get(tabId));
    badgeUpdateTimeouts.delete(tabId);
  }
  stateCache.delete(tabId);
  await MV3_Storage.removeSession(`tab_${tabId}`);
  updateBadge(tabId, { urls: [], hasMaster: false });
}

/* ──────────────────────────────────────────────
 * 3. HLS SNIFFER (webRequest)
 * ────────────────────────────────────────────── */

const MASTER_PLAYLIST_REGEX = /#EXT-X-STREAM-INF/;
const MEDIA_PLAYLIST_REGEX = /#EXTINF/;
const HLS_MIME_TYPES = [
  "application/x-mpegurl",
  "application/vnd.apple.mpegurl",
  "audio/mpegurl",
  "audio/x-mpegurl",
];

chrome.webRequest.onCompleted.addListener(
  handleRequestCompleted,
  { urls: ["*://*/*.m3u8", "*://*/*.m3u8?*", "*://*/*.m3u8#*"] }
);

chrome.webRequest.onHeadersReceived.addListener(
  handleMimeBasedDetection,
  { urls: ["<all_urls>"], types: ["xmlhttprequest", "media", "other"] },
  ["responseHeaders"]
);

async function handleRequestCompleted(details) {
  const { tabId, url } = details;
  if (tabId < 0) return;

  const config = await getConfig();
  if (!config.snifferEnabled) return;

  await classifyAndStore(tabId, url);
}

async function handleMimeBasedDetection(details) {
  const { tabId, url, responseHeaders } = details;
  if (tabId < 0 || !responseHeaders) return;

  if (/\.m3u8(\?|#|$)/.test(url)) return;

  const contentType = responseHeaders.find(
    (h) => h.name.toLowerCase() === "content-type"
  );
  if (!contentType) return;

  const mime = contentType.value.toLowerCase().split(";")[0].trim();
  if (!HLS_MIME_TYPES.includes(mime)) return;

  const config = await getConfig();
  if (!config.snifferEnabled) return;

  await classifyAndStore(tabId, url);
}

async function detectPlaylistType(url) {
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return "unknown";
    
    const text = await response.text();
    if (MASTER_PLAYLIST_REGEX.test(text)) return "master";
    if (MEDIA_PLAYLIST_REGEX.test(text)) return "media";
  } catch (_) {}
  return "unknown";
}

async function classifyAndStore(tabId, url) {
  const state = await getTabState(tabId);

  if (!state._urlIndex) {
    state._urlIndex = new Set(state.urls.map((e) => e.url));
  }
  if (state._urlIndex.has(url) || state.pending.has(url)) return;

  state.pending.add(url);
  const type = await detectPlaylistType(url);
  state.pending.delete(url);

  const currentState = stateCache.get(tabId);
  if (currentState !== state || state._urlIndex.has(url)) return;

  state.urls.push({ url, type, timestamp: Date.now() });
  state._urlIndex.add(url);

  if (type === "master") {
    state.hasMaster = true;
  }

  await saveTabState(tabId);
  debouncedBadgeUpdate(tabId, state);
}

/* ──────────────────────────────────────────────
 * 4. BADGE CONTROLLER (with debouncing)
 * ────────────────────────────────────────────── */

const ICON_IDLE = {
  16: "/icons/idle/icon16.png",
  48: "/icons/idle/icon48.png",
  128: "/icons/idle/icon128.png",
};

const ICON_ACTIVE = {
  16: "/icons/active/icon16.png",
  48: "/icons/active/icon48.png",
  128: "/icons/active/icon128.png",
};

const badgeUpdateTimeouts = new Map();

function debouncedBadgeUpdate(tabId, state) {
  if (badgeUpdateTimeouts.has(tabId)) {
    clearTimeout(badgeUpdateTimeouts.get(tabId));
  }
  badgeUpdateTimeouts.set(tabId, setTimeout(() => {
    badgeUpdateTimeouts.delete(tabId);
    updateBadge(tabId, state);
  }, 250));
}

async function updateBadge(tabId, state) {
  try {
    const count = state.urls.length;
    const iconPath = count > 0 ? ICON_ACTIVE : ICON_IDLE;
    const badgeText = "";

    await Promise.all([
      chrome.action.setIcon({ path: iconPath, tabId }),
      chrome.action.setBadgeText({ text: badgeText, tabId })
    ]);
  } catch (err) {
    console.error("[MV3 Bridge] Failed to update badge:", err);
  }
}

/* ──────────────────────────────────────────────
 * 5. TAB LIFECYCLE
 * ────────────────────────────────────────────── */

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" || changeInfo.url) {
    clearTabState(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  stateCache.delete(tabId);
  try {
    if (chrome.storage && chrome.storage.session) {
      chrome.storage.session.remove(`tab_${tabId}`);
    }
  } catch (_) {}
});

/* ──────────────────────────────────────────────
 * 6. CONTEXT MENU
 * ────────────────────────────────────────────── */

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: "send-to-mpv",
        title: "[ DISPATCH_TO_MPV ]",
        contexts: ["page", "link", "video", "audio"],
      }
    );
  });
}

chrome.runtime.onInstalled.addListener(createContextMenu);
chrome.runtime.onStartup.addListener(createContextMenu);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const url = info.linkUrl || info.srcUrl || info.pageUrl;
    const referer = info.pageUrl;
    if (url) {
      sendToMpv(url, [], referer).then(res => {
        if (tab && tab.id && res.success) {
          try {
            chrome.action.setIcon({ path: ICON_ACTIVE, tabId: tab.id });
            setTimeout(async () => {
              const state = await getTabState(tab.id);
              await updateBadge(tab.id, state);
            }, 1500);
          } catch (_) {}
        }
      });
    }
});

/* ──────────────────────────────────────────────
 * 7. NATIVE MESSAGING DISPATCHER
 * ────────────────────────────────────────────── */

async function getCookiesForUrl(url) {
  try {
    return await chrome.cookies.getAll({ url });
  } catch (e) {
    return [];
  }
}

async function sendToMpv(url, extraFlags = [], referer = null) {
  const config = await getConfig();
  const dynamicFlags = [];

  if (config.hwDec) dynamicFlags.push(`--hwdec=${config.hwDec}`);
  if (config.vo) dynamicFlags.push(`--vo=${config.vo}`);
  if (config.alwaysOnTop) dynamicFlags.push('--ontop');
  if (config.ytdlFormat) dynamicFlags.push(`--ytdl-format=${config.ytdlFormat}`);

  const combinedFlags = [...dynamicFlags, ...config.defaultFlags, ...extraFlags];

  const payload = {
    action: "play",
    url: url,
    referer: referer || url,
    userAgent: navigator.userAgent,
    flags: combinedFlags,
    mpvPath: config.mpvPath,
  };

  if (config.passIdentity) {
    payload.cookies = await getCookiesForUrl(url);
  }

  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(
      config.hostName,
      payload,
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else if (response && response.status === 'error') {
          resolve({ success: false, error: response.message || 'Unknown error' });
        } else {
          resolve({ success: true, response });
        }
      }
    );
  });
}

/* ──────────────────────────────────────────────
 * 8. INTERNAL MESSAGE ROUTER (popup ↔ SW)
 * ────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "getTabState") {
    if (typeof message.tabId !== 'number' || message.tabId < 0) {
      sendResponse({ urls: [], hasMaster: false });
      return false;
    }
    getTabState(message.tabId).then(state => sendResponse(state));
    return true;
  }

  if (message.action === "sendToMpv") {
    if (!message.url || typeof message.url !== 'string') {
      sendResponse({ success: false, error: 'Invalid URL' });
      return false;
    }
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const referer = (tab && tab.url) || message.url;
      sendToMpv(message.url, message.flags || [], referer)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  if (message.action === "getConfig") {
    getConfig().then((config) => sendResponse(config));
    return true;
  }

  return false;
});
