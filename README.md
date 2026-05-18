<div align="center">
  <img src="icons/idle/icon128.png" width="96" alt="MV3 Bridge">

  # MV3 Bridge

  *Route HLS streams and web videos directly to MPV from your browser*

  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-3c873a?style=flat-square)](#)
  [![Platform](https://img.shields.io/badge/Platform-Linux-cc3333?style=flat-square)](#)
  [![Version](https://img.shields.io/badge/Version-2.4.0-00e5ff?style=flat-square)](#)

  [Features](#features) · [Installation](#installation) · [Architecture](#architecture)

</div>

---

MV3 Bridge is a lightweight, high-performance browser extension that intercepts HLS video streams (`.m3u8`) and web videos, routing them directly to your local [mpv](https://mpv.io/) player via Native Messaging. It features a cyberpunk-inspired, brutalist Terminal HUD.

## Features

- **Zero-Dependency Architecture**: No build systems, no npm, no node_modules. Just pure, clean JavaScript and Python.
- **Real-Time HLS Interception**: Sniffs manifests and dispatches streams via Native Messaging.
- **Codec Enforcement (h264ify)**: Forces H.264 fallback for reduced CPU usage.
- **Terminal Editorial UI**: Cyberpunk HUD with documentation and copy-paste CLI snippets.

## Installation

### 1. Load the Extension
1. Open `chrome://extensions` in your browser.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the repository root directory.

> [!TIP]
> Copy the 32-character Extension ID from the extension card—you will need it for the next step.

### 2. Register the Native Host
Open your terminal in the repository directory and run:

```bash
cd native_host
chmod +x installer.sh
./installer.sh
```

Follow the prompts to select your browser(s) and paste the Extension ID.

> [!NOTE]
> To uninstall later:
> ```bash
> ./installer.sh --uninstall
> ```

### 3. Verify Connection
Open the extension popup, navigate to **Options**, and click **[ PING NATIVE HOST ]**. A successful connection shows `✓ CONNECTED`.

## Architecture

The project is designed for simplicity, security, and performance:

- `src/`: Pure JS/CSS/HTML with no compilation step.
- `native_host/`: Python-based secure bridge between the browser and `mpv`.
- `dist/`: No longer used; source files are loaded directly by the browser.

```
mv3/
├── src/
│   ├── background/    # Service worker orchestration
│   ├── popup/         # HUD UI
│   ├── options/       # Configuration terminal
│   ├── styles/        # Shared atmospheric CSS
│   └── ...
├── native_host/
│   ├── mpv_bridge.py  # Native host implementation
│   └── installer.sh   # Bash-based installation utility
└── manifest.json
```

## Security & Performance
- **Minimalist**: No heavy libraries; the extension is optimized for low memory footprint.
- **Security-First**: Native host temporary cookie files are created with strict `0600` permissions.
- **Stable**: All state transitions are locked to prevent concurrent process spawns.
