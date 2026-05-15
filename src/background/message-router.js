/**
 * message-router.js — Internal message router (popup ↔ SW)
 *
 * Handles chrome.runtime.onMessage for communication between
 * the popup/options pages and the service worker.
 *
 * Depends on: tab-state.js (getTabState), native-messaging.js (sendToMpv),
 *             config.js (getConfig)
 */

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
