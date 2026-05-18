const MASTER_PLAYLIST_REGEX = /#EXT-X-STREAM-INF/;
const MEDIA_PLAYLIST_REGEX = /#EXTINF/;
const PLAYLIST_FETCH_TIMEOUT_MS = 10000;
const PLAYLIST_CACHE_TTL_MS = 60000;

const playlistCache = new Map();

const HLS_MIME_TYPES = [
  "application/x-mpegurl",
  "application/vnd.apple.mpegurl",
  "audio/mpegurl",
  "audio/x-mpegurl",
];

const SNIFFER_ONCOMPLETED_FILTER = {
  urls: ["*://*/*.m3u8", "*://*/*.m3u8?*", "*://*/*.m3u8#*"]
};
const SNIFFER_ONHEADERS_FILTER = {
  urls: ["<all_urls>"],
  types: ["xmlhttprequest", "media", "other"]
};
const SNIFFER_EXTRA = ["responseHeaders"];

let _snifferRegistered = false;

async function syncSniffer() {
  try {
    const config = await getConfig();
    if (config.snifferEnabled && !_snifferRegistered) {
      chrome.webRequest.onCompleted.addListener(handleRequestCompleted, SNIFFER_ONCOMPLETED_FILTER);
      chrome.webRequest.onHeadersReceived.addListener(handleMimeBasedDetection, SNIFFER_ONHEADERS_FILTER, SNIFFER_EXTRA);
      _snifferRegistered = true;
    } else if (!config.snifferEnabled && _snifferRegistered) {
      chrome.webRequest.onCompleted.removeListener(handleRequestCompleted);
      chrome.webRequest.onHeadersReceived.removeListener(handleMimeBasedDetection);
      _snifferRegistered = false;
    }
  } catch (err) {
    console.error("[MV3 Bridge] Failed to sync sniffer:", err);
  }
}

syncSniffer();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && "snifferEnabled" in changes) {
    syncSniffer();
  }
});

async function handleRequestCompleted(details) {
  try {
    const { tabId, url } = details;
    if (tabId < 0) return;
    await classifyAndStore(tabId, url);
  } catch (err) {
    console.error("[MV3 Bridge] handleRequestCompleted error:", err);
  }
}

async function handleMimeBasedDetection(details) {
  try {
    const { tabId, url, responseHeaders } = details;
    if (tabId < 0 || !responseHeaders) return;

    if (/\.m3u8(\?|#|$)/.test(url)) return;

    const contentType = responseHeaders.find(
      (h) => h.name.toLowerCase() === "content-type"
    );
    if (!contentType) return;

    const mime = contentType.value.toLowerCase().split(";")[0].trim();
    if (!HLS_MIME_TYPES.includes(mime)) return;

    await classifyAndStore(tabId, url);
  } catch (err) {
    console.error("[MV3 Bridge] handleMimeBasedDetection error:", err);
  }
}

async function detectPlaylistType(url) {
  const cached = playlistCache.get(url);
  if (cached && (Date.now() - cached.timestamp) < PLAYLIST_CACHE_TTL_MS) {
    return cached.type;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PLAYLIST_FETCH_TIMEOUT_MS);
    const response = await fetch(url, { credentials: "include", signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      playlistCache.set(url, { type: "unknown", timestamp: Date.now() });
      return "unknown";
    }
    const text = await response.text();
    let type = "unknown";
    if (MASTER_PLAYLIST_REGEX.test(text)) type = "master";
    else if (MEDIA_PLAYLIST_REGEX.test(text)) type = "media";
    
    playlistCache.set(url, { type, timestamp: Date.now() });
    return type;
  } catch (_) {
    return "unknown";
  }
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
  debouncedBadgeUpdate(tabId);
}
