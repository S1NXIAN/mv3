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

  const bridgeEl = document.getElementById("title-bridge");
  if (bridgeEl) {
    initRandomGlitch(bridgeEl, "BRIDGE");
  }

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Show current page URL
  const pageUrlEl = document.getElementById("page-url");
  const displayUrl = truncateUrl(tab.url, 48);
  pageUrlEl.textContent = displayUrl;
  pageUrlEl.title = tab.url;
  applyScrambleCopy(pageUrlEl, tab.url);

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

    applyScrambleCopy(urlSpan, entry.url);

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
  if (btnEl.classList.contains("sending")) return;

  btnEl.classList.add("sending");
  const originalHtml = btnEl.innerHTML;

  if (btnEl.classList.contains("hud-action-btn")) {
    btnEl.innerHTML = `<div class="btn-scan"></div>[ TX... ]`;
  } else {
    btnEl.textContent = "[ TRANSMITTING ]";
  }

  chrome.runtime.sendMessage(
    { action: "sendToMpv", url },
    (result) => {
      btnEl.classList.remove("sending");
      btnEl.innerHTML = originalHtml;

      if (result && result.success) {
        showToast("INJECTION_SUCCESS", "success");
      } else {
        const errMsg = (result && result.error) || "TX_FAILURE";
        showToast(`ERR: ${errMsg.toUpperCase()}`, "error");
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

/* ── UI Helpers ── */

function applyScrambleCopy(element, textToCopy) {
  element.style.cursor = "pointer";
  element.addEventListener("click", () => {
    if (element.classList.contains("url-glitch")) return;

    navigator.clipboard.writeText(textToCopy).then(() => {
      const original = element.dataset.original || element.textContent;
      element.dataset.original = original;
      element.classList.add("url-glitch");

      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*";
      const finalString = "COPIED_TO_CLIPBOARD";
      let iterationsIn = 0;

      const intervalIn = setInterval(() => {
        element.textContent = finalString.split("").map((letter, index) => {
          if (index < iterationsIn) return finalString[index];
          return chars[Math.floor(Math.random() * chars.length)];
        }).join("");

        iterationsIn += 1;
        if (iterationsIn > finalString.length) {
          clearInterval(intervalIn);
          element.textContent = finalString;

          // Pause to let user read, then scramble back to original
          setTimeout(() => {
            let iterationsOut = 0;
            const intervalOut = setInterval(() => {
              element.textContent = original.split("").map((letter, index) => {
                if (index < iterationsOut) return original[index];
                return chars[Math.floor(Math.random() * chars.length)];
              }).join("");

              iterationsOut += 1; // Resolve original URL slightly slower
              if (iterationsOut > original.length + 1) {
                clearInterval(intervalOut);
                element.textContent = original;
                element.classList.remove("url-glitch");
              }
            }, 25);
          }, 1000);
        }
      }, 45);
    });
  });
}

function initRandomGlitch(element, finalString) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*";
  
  function triggerGlitch() {
    element.classList.add("is-glitching");
    let iterations = 0;
    const interval = setInterval(() => {
      element.textContent = finalString.split("").map((letter, index) => {
        if (Math.random() > 0.5) return finalString[index];
        return chars[Math.floor(Math.random() * chars.length)];
      }).join("");
      iterations++;
      
      if (iterations > 6) {
        clearInterval(interval);
        element.textContent = finalString;
        element.classList.remove("is-glitching");
        
        setTimeout(triggerGlitch, 3000 + Math.random() * 7000);
      }
    }, 30);
  }
  
  setTimeout(triggerGlitch, 2000 + Math.random() * 3000);
}
