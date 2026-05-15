/**
 * native-messaging.js — Native messaging dispatcher + context menu
 *
 * Handles communication with the native host (mpv_bridge.py) and
 * context menu integration for "Send to MPV".
 *
 * Depends on: config.js (getConfig), badge.js (ICON_ACTIVE, updateBadge),
 *             tab-state.js (getTabState)
 */

const CONTEXT_MENU_ID = "send-to-mpv";
const ICON_FLASH_DURATION_MS = 1500;

/* ── Cookie Helpers ── */

async function getCookiesForUrl(url) {
  try {
    return await chrome.cookies.getAll({ url });
  } catch (e) {
    return [];
  }
}

async function mergeCookies(url, referer) {
  const urlCookies = await getCookiesForUrl(url);
  const allCookies = [...urlCookies];

  if (referer && referer !== url) {
    const refCookies = await getCookiesForUrl(referer);
    const seen = new Set(urlCookies.map(c => `${c.name}:${c.domain}`));
    for (const c of refCookies) {
      const key = `${c.name}:${c.domain}`;
      if (!seen.has(key)) {
        allCookies.push(c);
        seen.add(key);
      }
    }
  }

  return allCookies;
}

/* ── Flag Builder ── */

function buildMpvFlags(config, extraFlags) {
  const dynamicFlags = [];

  if (config.hwDec) dynamicFlags.push(`--hwdec=${config.hwDec}`);
  if (config.vo) dynamicFlags.push(`--vo=${config.vo}`);
  if (config.alwaysOnTop) dynamicFlags.push('--ontop');
  if (config.ytdlFormat) dynamicFlags.push(`--ytdl-format=${config.ytdlFormat}`);

  return [...dynamicFlags, ...config.defaultFlags, ...extraFlags];
}

/* ── Native Messaging Dispatcher ── */

async function sendToMpv(url, extraFlags = [], referer = null) {
  const config = await getConfig();

  const payload = {
    action: "play",
    url: url,
    referer: referer || url,
    userAgent: navigator.userAgent,
    flags: buildMpvFlags(config, extraFlags),
    mpvPath: config.mpvPath,
  };

  if (config.passIdentity) {
    payload.cookies = await mergeCookies(url, referer);
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

/* ── Context Menu ── */

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "[ DISPATCH_TO_MPV ]",
      contexts: ["page", "link", "video", "audio"],
    });
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
            }, ICON_FLASH_DURATION_MS);
          } catch (_) {}
        }
      });
    }
});
