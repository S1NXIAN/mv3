/**
 * options.js — SYS.CONSOLE_CONFIG
 */

const DEFAULTS = {
  mpvPath: "/usr/bin/mpv",
  hostName: "com.mpvbridge.native",
  defaultFlags: [],
  snifferEnabled: true,
  passIdentity: true,
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

  document.getElementById("input-mpv-path").value = config.mpvPath;
  document.getElementById("input-host-name").value = config.hostName;
  document.getElementById("toggle-sniffer").checked = config.snifferEnabled;
  document.getElementById("toggle-pass-identity").checked = config.passIdentity;
  document.getElementById("input-hwdec").value = config.hwDec;
  document.getElementById("input-vo").value = config.vo;
  document.getElementById("toggle-ontop").checked = config.alwaysOnTop;
  document.getElementById("input-ytdl-format").value = config.ytdlFormat;
  
  const advToggle = document.getElementById("toggle-advanced");
  advToggle.checked = config.advancedMode;
  document.body.classList.toggle("advanced-mode", config.advancedMode);
  
  advToggle.addEventListener("change", (e) => {
    document.body.classList.toggle("advanced-mode", e.target.checked);
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
  resultEl.className = "field-hint test-result";

  const hostName = document.getElementById("input-host-name").value.trim() || DEFAULTS.hostName;

  chrome.runtime.sendNativeMessage(
    hostName,
    { action: "ping" },
    (response) => {
      if (chrome.runtime.lastError) {
        resultEl.textContent = "✗ " + chrome.runtime.lastError.message;
        resultEl.className = "field-hint test-result error";
      } else {
        resultEl.textContent = "✓ CONNECTED [" + (response.python || "HOST") + "]";
        resultEl.className = "field-hint test-result success";
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
