const CONTEXT_MENU_ID = "send-to-mpv";
const ICON_FLASH_DURATION_MS = 1500;
const NATIVE_MSG_TIMEOUT_MS = 30000;
const dispatchingTabs = new Set();

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

function buildMpvFlags(config, extraFlags) {
  const dynamicFlags = [];

  if (config.hwDec) dynamicFlags.push(`--hwdec=${config.hwDec}`);
  if (config.vo) dynamicFlags.push(`--vo=${config.vo}`);
  if (config.alwaysOnTop) dynamicFlags.push('--ontop');
  if (config.ytdlFormat) dynamicFlags.push(`--ytdl-format=${config.ytdlFormat}`);

  return [...dynamicFlags, ...config.defaultFlags, ...extraFlags];
}

async function sendToMpv(url, extraFlags = [], referer = null, tabId = null) {
  if (tabId && dispatchingTabs.has(tabId)) return { success: false, error: "Dispatch already in progress" };
  if (tabId) dispatchingTabs.add(tabId);
  
  try {
    const config = await getConfig();
    const payload = {
      action: "play",
      url: url,
      referer: referer || url,
      flags: buildMpvFlags(config, extraFlags),
      mpvPath: config.mpvPath,
      socketTimeout: config.socketTimeout || 30,
    };

    if (config.passIdentity) {
      payload.userAgent = navigator.userAgent;
      payload.cookies = await mergeCookies(url, referer);
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({ success: false, error: "NATIVE_HOST_TIMEOUT" });
      }, NATIVE_MSG_TIMEOUT_MS);

      chrome.runtime.sendNativeMessage(
        config.hostName,
        payload,
        (response) => {
          clearTimeout(timeoutId);
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
  } finally {
    if (tabId) dispatchingTabs.delete(tabId);
  }
}

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
  if (!url) return;

  try {
    const res = await sendToMpv(url, [], referer, tab.id);
    if (tab && tab.id && res.success) {
      chrome.action.setIcon({ path: ICON_ACTIVE, tabId: tab.id });
      setTimeout(async () => {
        const state = await getTabState(tab.id);
        await updateBadge(tab.id, state);
      }, ICON_FLASH_DURATION_MS);
    } else if (!res.success) {
      console.warn("[MV3 Bridge] Dispatch failed:", res.error);
    }
  } catch (err) {
    console.warn("[MV3 Bridge] Context menu dispatch error:", err);
  }
});
