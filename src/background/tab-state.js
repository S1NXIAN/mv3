const TAB_STORAGE_KEY = "mv3_tabStates";

const stateCache = new Map();
let _hydratePromise = null;

async function hydrateCache() {
  if (_hydratePromise) return _hydratePromise;

  _hydratePromise = (async () => {
    try {
      const result = await chrome.storage.local.get(TAB_STORAGE_KEY);
      const stored = result[TAB_STORAGE_KEY];
      if (!stored || typeof stored !== "object") return;

      const liveTabs = await chrome.tabs.query({});
      const liveTabIds = new Set(liveTabs.map(t => t.id));

      let pruned = false;
      for (const [tabIdStr, value] of Object.entries(stored)) {
        const tabId = parseInt(tabIdStr, 10);
        if (!liveTabIds.has(tabId)) {
          pruned = true;
          continue;
        }
        if (value && Array.isArray(value.urls) && value.urls.length > 0) {
          stateCache.set(tabId, {
            urls: value.urls,
            hasMaster: value.hasMaster || false,
            pending: new Set(),
          });
          debouncedBadgeUpdate(tabId);
        }
      }

      if (pruned) {
        _persistDebounce();
      }
    } catch (err) {
      console.warn("[MV3 Bridge] Failed to hydrate tab state:", err);
    }
  })();

  return _hydratePromise;
}

hydrateCache();

const PERSIST_DEBOUNCE_MS = 1000;
let _persistTimer = null;

function _persistDebounce() {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(_persistNow, PERSIST_DEBOUNCE_MS);
}

async function _persistNow() {
  _persistTimer = null;
  const serialized = {};
  for (const [tabId, state] of stateCache) {
    if (state.urls.length > 0) {
      serialized[tabId] = { urls: state.urls, hasMaster: state.hasMaster };
    }
  }
  try {
    await chrome.storage.local.set({ [TAB_STORAGE_KEY]: serialized });
  } catch (err) {
    console.warn("[MV3 Bridge] Failed to persist tab states:", err);
  }
}

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
  _persistDebounce();
}

function clearBadgeTimeout(tabId) {
  if (badgeUpdateTimeouts.has(tabId)) {
    clearTimeout(badgeUpdateTimeouts.get(tabId));
    badgeUpdateTimeouts.delete(tabId);
  }
}

async function clearTabState(tabId) {
  clearBadgeTimeout(tabId);
  stateCache.delete(tabId);
  _persistDebounce();
  updateBadge(tabId, { urls: [], hasMaster: false });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" || changeInfo.url) {
    clearTabState(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearBadgeTimeout(tabId);
  stateCache.delete(tabId);
  _persistDebounce();
});

// ── badge ────────────────────────────────────────────────────

const BADGE_DEBOUNCE_MS = 250;

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

function debouncedBadgeUpdate(tabId) {
  clearBadgeTimeout(tabId);
  badgeUpdateTimeouts.set(tabId, setTimeout(async () => {
    badgeUpdateTimeouts.delete(tabId);
    const currentState = await getTabState(tabId);
    updateBadge(tabId, currentState);
  }, BADGE_DEBOUNCE_MS));
}

async function updateBadge(tabId, state) {
  try {
    const hasStreams = state.urls.length > 0;
    const iconPath = hasStreams ? ICON_ACTIVE : ICON_IDLE;

    await Promise.all([
      chrome.action.setIcon({ path: iconPath, tabId }),
      chrome.action.setBadgeText({ text: "", tabId })
    ]);
  } catch (err) {
    console.error("[MV3 Bridge] Failed to update badge:", err);
  }
}
