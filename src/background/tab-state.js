/**
 * tab-state.js — Per-tab state manager (Hybrid Cache + Session Storage)
 *
 * Fast in-memory Map backed by persistent session storage.
 * Handles tab lifecycle events (navigation resets, tab removal).
 *
 * Depends on: storage-utils.js (MV3_Storage), badge.js (clearBadgeTimeout, updateBadge)
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
  clearBadgeTimeout(tabId);
  stateCache.delete(tabId);
  await MV3_Storage.removeSession(`tab_${tabId}`);
  updateBadge(tabId, { urls: [], hasMaster: false });
}

/* ── Tab Lifecycle ── */

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
