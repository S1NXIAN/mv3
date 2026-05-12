/**
 * options.js — SYS.CONSOLE_CONFIG
 */

const DEFAULTS = {
  mpvPath: "/usr/bin/mpv",
  hostName: "com.mpvbridge.native",
  defaultFlags: [],
  snifferEnabled: true,
  passIdentity: true,
  forceH264: false,
  hwDec: "",
  vo: "",
  alwaysOnTop: false,
  ytdlFormat: "",
  advancedMode: false,
};

document.addEventListener("DOMContentLoaded", loadSettings);

/* ── Load ── */
async function loadSettings() {
  const config = await chrome.storage.sync.get(DEFAULTS);
  
  const manifest = chrome.runtime.getManifest();
  const versionEl = document.getElementById("app-version");
  const versionStr = `v${manifest.version}`;
  versionEl.textContent = versionStr;
  initVersionGlitch(versionEl, versionStr);

  document.getElementById("input-mpv-path").value = config.mpvPath;
  document.getElementById("input-host-name").value = config.hostName;
  document.getElementById("toggle-sniffer").checked = config.snifferEnabled;
  document.getElementById("toggle-pass-identity").checked = config.passIdentity;
  document.getElementById("toggle-force-h264").checked = config.forceH264;
  document.getElementById("input-hwdec").value = config.hwDec;
  document.getElementById("input-vo").value = config.vo;
  document.getElementById("toggle-ontop").checked = config.alwaysOnTop;
  document.getElementById("input-ytdl-format").value = config.ytdlFormat;
  
  const advToggle = document.getElementById("toggle-advanced");
  advToggle.checked = config.advancedMode;
  
  const advPanels = document.querySelectorAll(".advanced-panel");
  advPanels.forEach(el => {
    if (!config.advancedMode) el.style.display = "none";
  });
  
  advToggle.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    advPanels.forEach((el) => {
      if (isChecked) {
        el.style.display = "block";
        el.classList.remove("glitch-out");
        el.classList.add("glitch-in");
      } else {
        el.classList.remove("glitch-in");
        el.classList.add("glitch-out");
        setTimeout(() => {
          if (!advToggle.checked) el.style.display = "none";
        }, 300);
      }
    });
  });

  const flagsStr = Array.isArray(config.defaultFlags)
    ? config.defaultFlags.join("\n")
    : config.defaultFlags;
  document.getElementById("input-default-flags").value = flagsStr;

  document.getElementById("btn-save").addEventListener("click", saveSettings);
  document.getElementById("btn-reset").addEventListener("click", resetSettings);
  document.getElementById("btn-test-host").addEventListener("click", testConnection);
}

/* ── Save ── */
async function saveSettings() {
  const mpvPath = document.getElementById("input-mpv-path").value.trim();
  const hostName = document.getElementById("input-host-name").value.trim();
  const snifferEnabled = document.getElementById("toggle-sniffer").checked;
  const passIdentity = document.getElementById("toggle-pass-identity").checked;
  const forceH264 = document.getElementById("toggle-force-h264").checked;
  const hwDec = document.getElementById("input-hwdec").value;
  const vo = document.getElementById("input-vo").value;
  const alwaysOnTop = document.getElementById("toggle-ontop").checked;
  const ytdlFormat = document.getElementById("input-ytdl-format").value.trim();
  const advancedMode = document.getElementById("toggle-advanced").checked;

  const flagsRaw = document.getElementById("input-default-flags").value;
  const defaultFlags = flagsRaw
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  if (!mpvPath.startsWith("/")) {
    flashToast("ERR: Absolute path required.");
    return;
  }

  await chrome.storage.sync.set({
    mpvPath,
    hostName,
    snifferEnabled,
    passIdentity,
    forceH264,
    hwDec,
    vo,
    alwaysOnTop,
    ytdlFormat,
    defaultFlags,
    advancedMode,
  });

  flashToast("SYSTEM UPDATED");
}

/* ── Reset ── */
async function resetSettings() {
  await chrome.storage.sync.set(DEFAULTS);
  loadSettings(); // Reload UI
  flashToast("FACTORY RESET");
}

/* ── Test Connection ── */
async function testConnection() {
  const resultEl = document.getElementById("test-result");
  resultEl.textContent = "TESTING...";
  resultEl.className = "vfd-status";

  const hostName = document.getElementById("input-host-name").value.trim() || DEFAULTS.hostName;

  chrome.runtime.sendNativeMessage(
    hostName,
    { action: "ping" },
    (response) => {
      if (chrome.runtime.lastError) {
        resultEl.textContent = "✗ " + chrome.runtime.lastError.message;
        resultEl.className = "vfd-status error";
      } else {
        resultEl.textContent = "✓ CONNECTED [" + (response.python || "HOST") + "]";
        resultEl.className = "vfd-status success";
      }
    }
  );
}

/* ── Toast ── */
function flashToast(message) {
  const toast = document.getElementById("save-toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2000);
}

/* ── UI Helpers ── */

function initVersionGlitch(element, finalString) {
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
      
      if (iterations > 6) { // Run for about 6 frames (180ms)
        clearInterval(interval);
        element.textContent = finalString;
        element.classList.remove("is-glitching");
        
        // Schedule next glitch between 3 and 10 seconds
        setTimeout(triggerGlitch, 3000 + Math.random() * 7000);
      }
    }, 30);
  }
  
  // Start first glitch between 2 and 5 seconds
  setTimeout(triggerGlitch, 2000 + Math.random() * 3000);
}
