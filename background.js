/**
 * MV3 — Service Worker
 *
 * Modules:
 *   1. Config loader
 *   2. Per-tab state manager (Hybrid Cache + Session Storage)
 *   3. HLS sniffer (webRequest)
 *   4. Badge controller
 *   5. Context menu
 *   6. Native messaging dispatcher
 *   7. Internal message router (popup ↔ SW)
 */

console.log("[MV3 Bridge] Service Worker BOOTING...");

/* ──────────────────────────────────────────────
 * 1. CONFIG
 * ────────────────────────────────────────────── */

const CONFIG_DEFAULTS = {
  mpvPath: "/usr/bin/mpv",
  hostName: "com.mpvbridge.native",
  defaultFlags: [],
  snifferEnabled: true,
  passIdentity: true,
  hwDec: "",
  vo: "",
  alwaysOnTop: false,
  ytdlFormat: "",
  advancedMode: false,
};

let _configCache = null;

async function getConfig() {
  if (_configCache) return _configCache;
  _configCache = await chrome.storage.sync.get(CONFIG_DEFAULTS);
  return _configCache;
}

// Invalidate config cache when settings change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") _configCache = null;
});

/* ──────────────────────────────────────────────
 * 2. PER-TAB STATE (HYBRID CACHE)
 * ──────────────────────────────────────────────
 * Fast memory map backed by persistent session storage.
 */

const stateCache = new Map();
let cacheHydrated = false;

async function hydrateCache() {
  if (cacheHydrated) return;
  try {
    if (chrome.storage && chrome.storage.session) {
      const data = await chrome.storage.session.get(null);
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith("tab_")) {
          const tabId = parseInt(key.split("_")[1], 10);
          stateCache.set(tabId, { ...value, pending: new Set() });
        }
      }
    }
  } catch (err) {
    console.warn("[MV3 Bridge] Session storage unavailable, falling back to memory:", err);
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
  try {
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.set({ [`tab_${tabId}`]: toSave });
    }
  } catch (_) {}
}

async function clearTabState(tabId) {
  stateCache.delete(tabId);
  try {
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.remove(`tab_${tabId}`);
    }
  } catch (_) {}
  updateBadge(tabId, { urls: [], hasMaster: false }); // Clears badge safely
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
  { urls: ["*://*/*.m3u8", "*://*/*.m3u8?*", "*://*/*.m3u8#*"] },
  ["responseHeaders"]
);

chrome.webRequest.onCompleted.addListener(
  handleMimeBasedDetection,
  { urls: ["<all_urls>"] },
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
  if (tabId < 0) return;

  if (/\.m3u8(\?|#|$)/.test(url)) return;

  if (!responseHeaders) return;
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

async function classifyAndStore(tabId, url) {
  const state = await getTabState(tabId);

  // O(1) deduplication via Set
  if (!state._urlIndex) {
    state._urlIndex = new Set(state.urls.map((e) => e.url));
  }
  if (state._urlIndex.has(url) || state.pending.has(url)) return;
  state.pending.add(url); // Acquire lock

  let type = "unknown";
  try {
    const response = await fetch(url, { credentials: "include" });
    if (response.ok) {
      const text = await response.text();
      if (MASTER_PLAYLIST_REGEX.test(text)) {
        type = "master";
      } else if (MEDIA_PLAYLIST_REGEX.test(text)) {
        type = "media";
      }
    }
  } catch (_) {
    // Keep as "unknown"
  }

  state.pending.delete(url); // Release lock

  // ── RACE CONDITION CHECK ──
  // If the tab was cleared (onUpdated) while we were fetching,
  // the 'state' object we hold is now an orphan. We must abort
  // to avoid saving stale URLs into the new page's state.
  if (stateCache.get(tabId) !== state) return;

  // Double-check just in case
  if (state._urlIndex.has(url)) return;

  state.urls.push({ url, type, timestamp: Date.now() });
  state._urlIndex.add(url);

  if (type === "master") {
    state.hasMaster = true;
  }

  await saveTabState(tabId);
  await updateBadge(tabId, state);
}

/* ──────────────────────────────────────────────
 * 4. BADGE CONTROLLER
 * ────────────────────────────────────────────── */

const ICON_IDLE = {
  16: "icons/idle/icon16.png",
  48: "icons/idle/icon48.png",
  128: "icons/idle/icon128.png",
};

const ICON_ACTIVE = {
  16: "icons/active/icon16.png",
  48: "icons/active/icon48.png",
  128: "icons/active/icon128.png",
};

async function updateBadge(tabId, state) {
  try {
    const iconPath = state.urls.length > 0 ? ICON_ACTIVE : ICON_IDLE;
    await Promise.all([
      chrome.action.setIcon({ path: iconPath, tabId }),
      chrome.action.setBadgeText({ text: "", tabId }),
    ]);
  } catch (_) {
    // Tab was likely closed before the icon could update.
  }
}

/* ──────────────────────────────────────────────
 * 5. TAB LIFECYCLE
 * ────────────────────────────────────────────── */

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Clear state on full reload OR SPA-style URL navigation (e.g. YouTube video change)
  if (changeInfo.status === "loading" || changeInfo.url) {
    clearTabState(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  // Clear from both Cache and Session Storage
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
  console.log("[MV3 Bridge] createContextMenu() called");
  chrome.contextMenus.removeAll(() => {
    console.log("[MV3 Bridge] removeAll done, now creating...");
    chrome.contextMenus.create(
      {
        id: "send-to-mpv",
        title: "[ DISPATCH_TO_MPV ]",
        contexts: ["page", "link", "video", "audio"],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("[MV3 Bridge] Menu CREATE FAILED:", chrome.runtime.lastError.message);
        } else {
          console.log("[MV3 Bridge] Menu created OK ✓");
        }
      }
    );
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[MV3 Bridge] onInstalled fired");
  createContextMenu();
});
chrome.runtime.onStartup.addListener(() => {
  console.log("[MV3 Bridge] onStartup fired");
  createContextMenu();
});

console.log("[MV3 Bridge] Registering onClicked listener...");
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log("[MV3 Bridge] Context menu clicked:", info.menuItemId);
    const url = info.linkUrl || info.srcUrl || info.pageUrl;
    const referer = info.pageUrl;
    if (url) {
      console.log("[MV3 Bridge] Resolved URL:", url);
      sendToMpv(url, [], referer).then(res => {
        console.log("[MV3 Bridge] sendToMpv result:", JSON.stringify(res));
        if (tab && tab.id && res.success) {
          try {
            // Flash the active icon briefly to confirm
            chrome.action.setIcon({ path: ICON_ACTIVE, tabId: tab.id });
            setTimeout(async () => {
              const state = await getTabState(tab.id);
              await updateBadge(tab.id, state);
            }, 1500);
          } catch (_) {}
        }
      }).catch(err => {
        console.error("[MV3 Bridge] sendToMpv threw:", err);
      });
    }
});

/* ──────────────────────────────────────────────
 * 7. NATIVE MESSAGING DISPATCHER
 * ────────────────────────────────────────────── */

async function getCookiesForUrl(url) {
  try {
    const cookies = await chrome.cookies.getAll({ url });
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } catch (e) {
    console.error("[MV3 Bridge] Failed to extract cookies:", e);
    return "";
  }
}

async function sendToMpv(url, extraFlags = [], referer = null) {
  const config = await getConfig();
  
  // Build Dynamic Flags
  const dynamicFlags = [];
  
  if (config.advancedMode) {
    if (config.hwDec) {
      dynamicFlags.push(`--hwdec=${config.hwDec}`);
    }
    
    if (config.vo) {
      dynamicFlags.push(`--vo=${config.vo}`);
    }
    
    if (config.alwaysOnTop) {
      dynamicFlags.push('--ontop');
    }
    
    if (config.ytdlFormat) {
      dynamicFlags.push(`--ytdl-format=${config.ytdlFormat}`);
    }
  }

  const combinedFlags = [...dynamicFlags, ...config.defaultFlags, ...extraFlags];

  const payload = {
    action: "play",
    url: url,
    referer: referer || url,
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
          console.error("[MV3 Bridge] Native messaging error:", chrome.runtime.lastError.message);
          resolve({ success: false, error: chrome.runtime.lastError.message });
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
    getTabState(message.tabId).then(state => sendResponse(state));
    return true; // Keeps the messaging channel open for the async response
  }

  if (message.action === "sendToMpv") {
    // Resolve the active tab's page URL as referer for CDN hotlink protection
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
