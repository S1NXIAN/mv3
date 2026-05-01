/**
 * popup.js — MPV Bridge Popup Controller
 *
 * Queries the service worker for per-tab state,
 * renders detected m3u8 URLs, and dispatches "send to MPV" commands.
 */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  // Wire up settings button
  const btnOptions = document.getElementById("btn-options");
  btnOptions.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Show current page URL
  const pageUrlEl = document.getElementById("page-url");
  const displayUrl = truncateUrl(tab.url, 48);
  pageUrlEl.textContent = displayUrl;
  pageUrlEl.title = tab.url;

  // "Send Page" button
  const btnSendPage = document.getElementById("btn-send-page");
  btnSendPage.addEventListener("click", () => {
    sendUrl(tab.url, btnSendPage);
  });

  // Query tab state from SW
  chrome.runtime.sendMessage(
    { action: "getTabState", tabId: tab.id },
    (state) => {
      renderStreams(state || { urls: [], hasMaster: false });
    }
  );

  // Check config to hide stream panel if sniffer is disabled
  chrome.storage.sync.get({ snifferEnabled: true }, (config) => {
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
    const item = document.createElement("div");
    item.className = "stream-item" + (entry.type === "master" ? " is-master" : "");
    item.style.animationDelay = `${index * 40}ms`;

    // Type badge
    const typeBadge = document.createElement("span");
    typeBadge.className = `stream-type type-${entry.type}`;
    typeBadge.textContent = entry.type === "master" ? "⚡ Master"
                          : entry.type === "media"  ? "📺 Media"
                          : "❓ Unknown";

    // URL — click to copy
    const urlSpan = document.createElement("span");
    urlSpan.className = "stream-url copyable";
    urlSpan.textContent = truncateUrl(entry.url, 40);
    urlSpan.title = "Click to copy URL";
    urlSpan.addEventListener("click", () => {
      navigator.clipboard.writeText(entry.url).then(() => {
        const original = urlSpan.textContent;
        urlSpan.textContent = "COPIED ✓";
        urlSpan.classList.add("copied");
        setTimeout(() => {
          urlSpan.textContent = original;
          urlSpan.classList.remove("copied");
        }, 1000);
      });
    });

    // Send button
    const sendBtn = document.createElement("button");
    sendBtn.className = "cyber-btn mini";
    sendBtn.id = `btn-send-stream-${index}`;
    sendBtn.title = "Send to MPV";
    sendBtn.appendChild(_bracketSpan("["));
    sendBtn.appendChild(document.createTextNode(" INJECT "));
    sendBtn.appendChild(_bracketSpan("]"));
    sendBtn.addEventListener("click", () => {
      sendUrl(entry.url, sendBtn);
    });

    item.appendChild(typeBadge);
    item.appendChild(urlSpan);
    item.appendChild(sendBtn);
    listEl.appendChild(item);
  });
}

/* ── Send to MPV via SW ── */

function sendUrl(url, btnEl) {
  if (btnEl.classList.contains("sending")) return;

  btnEl.classList.add("sending");
  const savedNodes = Array.from(btnEl.childNodes).map(n => n.cloneNode(true));
  btnEl.replaceChildren(_bracketSpan("["), document.createTextNode(" DISPATCHING "), _bracketSpan("]"));

  chrome.runtime.sendMessage(
    { action: "sendToMpv", url },
    (result) => {
      btnEl.classList.remove("sending");
      btnEl.replaceChildren(...savedNodes);

      if (result && result.success) {
        showToast("[ STATUS: DISPATCH_SUCCESS ]", "success");
      } else {
        const errMsg = (result && result.error) || "CONNECTION_FAILURE";
        showToast(`[ STATUS: ${errMsg.toUpperCase()} ]`, "error");
      }
    }
  );
}

/* ── Toast notifications ── */

function showToast(message, type) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    toast.addEventListener("animationend", () => toast.remove());
  }, 2200);
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

/* ── DOM Helpers ── */

function _bracketSpan(char) {
  const span = document.createElement("span");
  span.className = "btn-bracket";
  span.textContent = char;
  return span;
}
