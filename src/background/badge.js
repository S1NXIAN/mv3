/**
 * badge.js — Badge icon controller with debouncing
 *
 * Manages the extension icon state (idle/active) per tab.
 * Provides debounced updates to prevent flickering during rapid stream detection.
 */

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

function clearBadgeTimeout(tabId) {
  if (badgeUpdateTimeouts.has(tabId)) {
    clearTimeout(badgeUpdateTimeouts.get(tabId));
    badgeUpdateTimeouts.delete(tabId);
  }
}

function debouncedBadgeUpdate(tabId, state) {
  clearBadgeTimeout(tabId);
  badgeUpdateTimeouts.set(tabId, setTimeout(() => {
    badgeUpdateTimeouts.delete(tabId);
    updateBadge(tabId, state);
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
