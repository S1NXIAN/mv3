/**
 * storage-utils.js - Shared storage helpers for MV3 Bridge
 */

self.MV3_Storage = (function() {
  const SESSION = chrome.storage?.session;

  async function getSession(key = null) {
    if (!SESSION) return key ? null : {};
    try {
      return await SESSION.get(key);
    } catch (e) {
      console.warn("[MV3 Storage] Session get failed:", e);
      return key ? null : {};
    }
  }

  async function setSession(data) {
    if (!SESSION) return;
    try {
      await SESSION.set(data);
    } catch (e) {
      console.warn("[MV3 Storage] Session set failed:", e);
    }
  }

  async function removeSession(key) {
    if (!SESSION) return;
    try {
      await SESSION.remove(key);
    } catch (e) {
      console.warn("[MV3 Storage] Session remove failed:", e);
    }
  }

  return {
    getSession,
    setSession,
    removeSession
  };
})();
