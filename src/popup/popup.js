/**
 * popup.js — MPV Bridge Popup Controller
 *
 * Queries the service worker for per-tab state,
 * renders detected m3u8 URLs, and dispatches "send to MPV" commands.
 */

const TOAST_DISPLAY_MS = 2200;

document.addEventListener("DOMContentLoaded", init);

let _glitchTimeouts = [];

async function init() {
  const btnOptions = document.getElementById("btn-options");
  btnOptions.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  const bridgeEl = document.getElementById("title-bridge");
  if (bridgeEl) {
    _glitchTimeouts.push(...MV3_UI.initRandomGlitch(bridgeEl, "BRIDGE"));
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageUrlEl = document.getElementById("page-url");
  if (!tab || !tab.url || !tab.url.startsWith('http')) {
    if (pageUrlEl) {
      pageUrlEl.textContent = "—";
      pageUrlEl.title = "No valid page";
    }
    return;
  }

  const displayUrl = truncateUrl(tab.url, 48);
  if (pageUrlEl) {
    pageUrlEl.textContent = displayUrl;
    pageUrlEl.title = tab.url;
    MV3_UI.applyScrambleCopy(pageUrlEl, tab.url, (msg) => showToast(msg, "error"));
  }

  const btnSendPage = document.getElementById("btn-send-page");
  btnSendPage.addEventListener("click", () => {
    sendUrl(tab.url, btnSendPage);
  });

  chrome.runtime.sendMessage(
    { action: "getTabState", tabId: tab.id },
    (state) => {
      if (chrome.runtime.lastError) {
        console.error("[MV3 Bridge] Failed to get tab state:", chrome.runtime.lastError);
        renderStreams({ urls: [], hasMaster: false });
        return;
      }
      renderStreams(state || { urls: [], hasMaster: false });
    }
  );

  chrome.storage.sync.get(MV3_CONFIG_DEFAULTS, (config) => {
    if (!config.snifferEnabled) {
      const streamPanel = document.querySelector(".stream-panel");
      if (streamPanel) {
        streamPanel.style.display = "none";
      }
    }
  });
}

/* ── Render stream list ── */

function renderStreams(state) {
  if (!state || !Array.isArray(state.urls)) {
    state = { urls: [], hasMaster: false };
  }

  const listEl = document.getElementById("stream-list");
  const emptyEl = document.getElementById("empty-state");
  const countEl = document.getElementById("stream-count");

  countEl.textContent = state.urls.length;

  // We keep the page panel always visible as a reliable fallback for yt-dlp,
  // even if HLS streams are detected, just in case they are false positives (like video thumbnails).

  const warningBanner = document.getElementById("stream-warning-banner");

  if (state.urls.length === 0) {
    emptyEl.classList.remove("hidden");
    listEl.style.display = "none";
    if (warningBanner) warningBanner.classList.add("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  listEl.classList.remove("hidden");
  listEl.style.display = "flex";
  if (warningBanner) warningBanner.classList.remove("hidden");

  // Clear previous list
  listEl.replaceChildren();

  // Sort: masters first, then media, then unknown
  const typeOrder = { master: 0, media: 1, unknown: 2 };
  const sorted = [...state.urls].sort(
    (a, b) => (typeOrder[a.type] ?? 3) - (typeOrder[b.type] ?? 3)
  );

  sorted.forEach((entry, index) => {
    const card = document.createElement("div");
    card.className = "data-card" + (entry.type === "master" ? " master" : "");
    card.style.animationDelay = `${index * 40}ms`;

    const header = document.createElement("div");
    header.className = "card-header";

    const typeBadge = document.createElement("span");
    typeBadge.className = "card-type";
    typeBadge.textContent = entry.type === "master" ? "MASTER_FRQ"
      : entry.type === "media" ? "MEDIA_FRQ"
        : "UNKNOWN_SIG";

    header.appendChild(typeBadge);

    const urlSpan = document.createElement("div");
    urlSpan.className = "card-url";
    urlSpan.textContent = truncateUrl(entry.url, 40);
    urlSpan.title = "Click to copy URL";

    MV3_UI.applyScrambleCopy(urlSpan, entry.url, (msg) => showToast(msg, "error"));

    const strip = document.createElement("div");
    strip.className = "inject-strip";

    const execBtn = document.createElement("button");
    execBtn.className = "hud-execute-btn";
    execBtn.id = `btn-send-stream-${index}`;
    execBtn.textContent = "[ EXECUTE INJECTION ]";

    execBtn.addEventListener("click", () => {
      sendUrl(entry.url, execBtn);
    });

    strip.appendChild(execBtn);

    card.appendChild(header);
    card.appendChild(urlSpan);
    card.appendChild(strip);

    listEl.appendChild(card);
  });
}

/* ── Send to MPV via SW ── */

function sendUrl(url, btnEl) {
  if (!url || btnEl.classList.contains("sending")) return;

  btnEl.classList.add("sending");
  const originalHtml = btnEl.innerHTML;

  if (btnEl.classList.contains("hud-action-btn")) {
    btnEl.innerHTML = `<div class="btn-scan"></div>[ TX... ]`;
  } else {
    btnEl.textContent = "[ TRANSMITTING ]";
  }

  const timeoutId = setTimeout(() => {
    btnEl.classList.remove("sending");
    btnEl.innerHTML = originalHtml;
    showToast("ERR: TX_TIMEOUT", "error");
  }, 10000);

  chrome.runtime.sendMessage(
    { action: "sendToMpv", url },
    (result) => {
      clearTimeout(timeoutId);
      btnEl.classList.remove("sending");
      btnEl.innerHTML = originalHtml;

      if (chrome.runtime.lastError) {
        showToast(`ERR: ${chrome.runtime.lastError.message?.toUpperCase() || 'TX_FAILURE'}`, "error");
        return;
      }

      if (result && result.success) {
        showToast("INJECTION_SUCCESS", "success");
      } else {
        const errMsg = (result && result.error) || "TX_FAILURE";
        showToast(`ERR: ${String(errMsg).toUpperCase()}`, "error");
      }
    }
  );
}

/* ── Toast notifications ── */

function showToast(message, type) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    toast.addEventListener("animationend", () => toast.remove());
  }, TOAST_DISPLAY_MS);
}

/* ── Helpers ── */

function truncateUrl(url, maxLen) {
  if (!url) return "—";
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split("/").filter(Boolean);
    const last = pathParts[pathParts.length - 1] || "";
    // If the filename itself is massive, truncate its middle
    const shortLast = last.length > 25 ? last.substring(0, 12) + "…" + last.substring(last.length - 10) : last;
    return u.hostname + "/…/" + shortLast;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + "…" : url;
  }
}


