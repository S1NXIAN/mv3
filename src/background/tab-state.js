/**
 * tab-state.js — Per-tab state manager (Hybrid Cache + Local Storage)
 *
 * Fast in-memory Map backed by chrome.storage.local for persistence
 * across service worker restarts AND extension reloads.
 * Validates tabs on hydration to prune stale entries.
 *
 * Depends on: badge.js (clearBadgeTimeout, updateBadge)
 */

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

      // Query which tabs actually still exist
      const liveTabs = await chrome.tabs.query({});
      const liveTabIds = new Set(liveTabs.map(t => t.id));

      let pruned = false;
      for (const [tabIdStr, value] of Object.entries(stored)) {
        const tabId = parseInt(tabIdStr, 10);
        if (!liveTabIds.has(tabId)) {
          pruned = true;
          continue; // Skip dead tabs
        }
        if (value && Array.isArray(value.urls) && value.urls.length > 0) {
          stateCache.set(tabId, {
            urls: value.urls,
            hasMaster: value.hasMaster || false,
            pending: new Set(),
          });
          // Restore badge for tabs that have streams
          debouncedBadgeUpdate(tabId, stateCache.get(tabId));
        }
      }

      // Clean up dead tab entries from storage
      if (pruned) {
        _persistDebounce();
      }
    } catch (err) {
      console.warn("[MV3 Bridge] Failed to hydrate tab state:", err);
    }
  })();

  return _hydratePromise;
}

// Start hydration immediately on boot
hydrateCache();

/* ── Persistence (debounced batch write) ── */

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

/* ── Public API ── */

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

async function clearTabState(tabId) {
  clearBadgeTimeout(tabId);
  stateCache.delete(tabId);
  _persistDebounce();
  updateBadge(tabId, { urls: [], hasMaster: false });
}

/* ── Tab Lifecycle ── */

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
