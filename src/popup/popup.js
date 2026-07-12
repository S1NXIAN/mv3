const TOAST_DISPLAY_MS = 2200;
const SEND_TIMEOUT_MS = 10000;
const CARD_STAGGER_MS = 40;
const STREAM_TYPE_ORDER = { master: 0, media: 1, unknown: 2 };

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const btnOptions = document.getElementById("btn-options");
  btnOptions.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageUrlEl = document.getElementById("page-url");
  if (!tab || !tab.url || !tab.url.startsWith('http')) {
    if (pageUrlEl) {
      pageUrlEl.textContent = "---";
      pageUrlEl.title = "No valid page";
    }
    return;
  }

  const displayUrl = truncateUrl(tab.url, 48);
  if (pageUrlEl) {
    pageUrlEl.textContent = displayUrl;
    pageUrlEl.title = tab.url;
    pageUrlEl.addEventListener("click", () => {
      navigator.clipboard.writeText(tab.url).then(() => showToast("URL copied"));
    });
  }

  const btnSendPage = document.getElementById("btn-send-page");
  btnSendPage.addEventListener("click", () => {
    sendUrl(tab.url, btnSendPage);
  });

  const stateTimeout = setTimeout(() => {
    renderStreams({ urls: [], hasMaster: false });
  }, SEND_TIMEOUT_MS);

  chrome.runtime.sendMessage(
    { action: "getTabState", tabId: tab.id },
    (state) => {
      clearTimeout(stateTimeout);
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
      const streamPanel = document.querySelector(".intercept-grid");
      if (streamPanel) {
        streamPanel.style.display = "none";
      }
    }
  });
}

function renderStreams(state) {
  if (!state || !Array.isArray(state.urls)) {
    state = { urls: [], hasMaster: false };
  }

  const listEl = document.getElementById("stream-list");
  const emptyEl = document.getElementById("empty-state");
  const countEl = document.getElementById("stream-count");

  countEl.textContent = state.urls.length;

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

  listEl.replaceChildren();

  const sorted = [...state.urls].sort(
    (a, b) => (STREAM_TYPE_ORDER[a.type] ?? 3) - (STREAM_TYPE_ORDER[b.type] ?? 3)
  );

  sorted.forEach((entry, index) => {
    const card = document.createElement("div");
    card.className = "data-card" + (entry.type === "master" ? " master" : "");
    card.style.animationDelay = `${index * CARD_STAGGER_MS}ms`;

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

    urlSpan.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(entry.url).then(() => showToast("URL copied"));
    });

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

function sendUrl(url, btnEl) {
  if (!url || btnEl.classList.contains("sending")) return;

  btnEl.classList.add("sending");
  const originalText = btnEl.textContent;
  btnEl.textContent = "[ TRANSMITTING ]";

  const timeoutId = setTimeout(() => {
    btnEl.classList.remove("sending");
    btnEl.textContent = originalText;
    showToast("ERR: TX_TIMEOUT", "error");
  }, SEND_TIMEOUT_MS);

  chrome.runtime.sendMessage(
    { action: "sendToMpv", url },
    (result) => {
      clearTimeout(timeoutId);
      btnEl.classList.remove("sending");
      btnEl.textContent = originalText;

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

function showToast(message, type) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    // Fallback for prefers-reduced-motion where animationend may not fire
    const safetyTimer = setTimeout(() => toast.remove(), 500);
    toast.addEventListener("animationend", () => {
      clearTimeout(safetyTimer);
      toast.remove();
    }, { once: true });
  }, TOAST_DISPLAY_MS);
}

function truncateUrl(url, maxLen) {
  if (!url) return "---";
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split("/").filter(Boolean);
    const last = pathParts[pathParts.length - 1] || "";
    const shortLast = last.length > 25 ? last.substring(0, 12) + "\u2026" + last.substring(last.length - 10) : last;
    return u.hostname + "/\u2026/" + shortLast;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + "\u2026" : url;
  }
}
