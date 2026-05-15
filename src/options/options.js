/**
 * options.js — SYS.CONSOLE_CONFIG
 */

const DEFAULTS = MV3_CONFIG_DEFAULTS;
const CONNECTION_TIMEOUT_MS = 5000;

const _glitchTimeouts = [];
let _isSaving = false;

document.addEventListener("DOMContentLoaded", loadSettings);

/* ── Load ── */
async function loadSettings() {
  try {
    const config = await chrome.storage.sync.get(DEFAULTS);

    const manifest = chrome.runtime.getManifest();
    const versionEl = document.getElementById("app-version");
    if (!versionEl) {
      console.error("[MV3 Bridge] Version element not found");
      return;
    }
    const versionStr = `v${manifest.version}`;
    versionEl.textContent = versionStr;
    _glitchTimeouts.push(...MV3_UI.initRandomGlitch(versionEl, versionStr));

    const mpvPathEl = document.getElementById("input-mpv-path");
    const hostNameEl = document.getElementById("input-host-name");
    if (mpvPathEl) mpvPathEl.value = config.mpvPath;
    if (hostNameEl) hostNameEl.value = config.hostName;

    const toggleMap = {
      "toggle-sniffer": "snifferEnabled",
      "toggle-pass-identity": "passIdentity",
      "toggle-force-h264": "forceH264",
      "toggle-ontop": "alwaysOnTop",
      "toggle-advanced": "advancedMode"
    };
    for (const [id, configKey] of Object.entries(toggleMap)) {
      const el = document.getElementById(id);
      if (el) el.checked = config[configKey];
    }

    const selectIds = { "input-hwdec": "hwDec", "input-vo": "vo" };
    for (const [elId, configKey] of Object.entries(selectIds)) {
      const el = document.getElementById(elId);
      if (el) el.value = config[configKey] || "";
    }

    const textInputIds = { "input-ytdl-format": "ytdlFormat" };
    for (const [elId, configKey] of Object.entries(textInputIds)) {
      const el = document.getElementById(elId);
      if (el) el.value = config[configKey] || "";
    }

    const advToggle = document.getElementById("toggle-advanced");
    const advPanels = document.querySelectorAll(".advanced-panel");

    advPanels.forEach(el => {
      if (!config.advancedMode) el.style.display = "none";
    });

    if (advToggle) {
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
    }

    const flagsStr = Array.isArray(config.defaultFlags)
      ? config.defaultFlags.join("\n")
      : (config.defaultFlags || "");
    const flagsEl = document.getElementById("input-default-flags");
    if (flagsEl) flagsEl.value = flagsStr;

    const btnSave = document.getElementById("btn-save");
    const btnReset = document.getElementById("btn-reset");
    const btnTest = document.getElementById("btn-test-host");
    if (btnSave) btnSave.addEventListener("click", () => saveSettings(btnSave));
    if (btnReset) btnReset.addEventListener("click", resetSettings);
    if (btnTest) btnTest.addEventListener("click", testConnection);
  } catch (err) {
    console.error("[MV3 Bridge] Failed to load settings:", err);
    flashToast("ERR: LOAD_FAILURE");
  }
}

/* ── Save ── */
async function saveSettings(btnSave) {
  if (_isSaving) return;
  _isSaving = true;

  if (btnSave) {
    btnSave.textContent = "[ SAVING... ]";
    btnSave.disabled = true;
  }

  try {
    const mpvPath = document.getElementById("input-mpv-path").value.trim();
    const hostName = document.getElementById("input-host-name").value.trim();
    const snifferEnabled = document.getElementById("toggle-sniffer")?.checked ?? true;
    const passIdentity = document.getElementById("toggle-pass-identity")?.checked ?? true;
    const forceH264 = document.getElementById("toggle-force-h264")?.checked ?? false;
    const hwDec = document.getElementById("input-hwdec")?.value ?? "";
    const vo = document.getElementById("input-vo")?.value ?? "";
    const alwaysOnTop = document.getElementById("toggle-ontop")?.checked ?? false;
    const ytdlFormat = document.getElementById("input-ytdl-format").value.trim();
    const advancedMode = document.getElementById("toggle-advanced")?.checked ?? false;

    const flagsRaw = document.getElementById("input-default-flags").value;
    const defaultFlags = flagsRaw
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0 && f.startsWith("-"));

    if (!mpvPath.startsWith("/")) {
      flashToast("ERR: Absolute path required.");
      return;
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(hostName)) {
      flashToast("ERR: Invalid host name format.");
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
  } catch (err) {
    console.error("[MV3 Bridge] Failed to save:", err);
    flashToast("ERR: SAVE_FAILURE");
  } finally {
    _isSaving = false;
    if (btnSave) {
      btnSave.innerHTML = '<div class="btn-scan"></div>[ COMMIT CHANGES ]';
      btnSave.disabled = false;
    }
  }
}

/* ── Reset ── */
async function resetSettings() {
  const confirmed = confirm("Are you sure you want to reset all settings to defaults?");
  if (!confirmed) return;

  try {
    await chrome.storage.sync.set(DEFAULTS);
    loadSettings();
    flashToast("FACTORY RESET");
  } catch (err) {
    console.error("[MV3 Bridge] Failed to reset:", err);
    flashToast("ERR: RESET_FAILURE");
  }
}

/* ── Test Connection ── */
async function testConnection() {
  const resultEl = document.getElementById("test-result");
  if (!resultEl) return;

  resultEl.textContent = "TESTING...";
  resultEl.className = "vfd-status";

  const hostName = document.getElementById("input-host-name").value.trim() || DEFAULTS.hostName;

  let timeoutId = setTimeout(() => {
    resultEl.textContent = "✗ TIMEOUT - No response from native host";
    resultEl.className = "vfd-status error";
  }, CONNECTION_TIMEOUT_MS);

  chrome.runtime.sendNativeMessage(
    hostName,
    { action: "ping" },
    (response) => {
      clearTimeout(timeoutId);
      if (chrome.runtime.lastError) {
        resultEl.textContent = "✗ " + chrome.runtime.lastError.message;
        resultEl.className = "vfd-status error";
      } else if (response && response.status === 'error') {
        resultEl.textContent = "✗ " + (response.message || "Unknown error");
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
  if (!toast) {
    console.warn("[MV3 Bridge] Toast element not found:", message);
    return;
  }
  toast.textContent = message;
  toast.classList.remove("hidden");
  if (toast.hideTimeout) clearTimeout(toast.hideTimeout);
  toast.hideTimeout = setTimeout(() => toast.classList.add("hidden"), 2000);
}


