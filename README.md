<div align="center">
  <img src="icons/idle/icon128.png" width="96" alt="MV3 Bridge">

  # MV3 Bridge

  *Route HLS streams and web videos directly to MPV from your browser*

  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-3c873a?style=flat-square)](#)
  [![Platform](https://img.shields.io/badge/Platform-Linux-cc3333?style=flat-square)](#)
  [![Version](https://img.shields.io/badge/Version-3.0.0-00e5ff?style=flat-square)](#)
  [![Browsers](https://img.shields.io/badge/Browsers-14+-478ce1?style=flat-square)](#)

  [Features](#features) · [Prerequisites](#prerequisites) · [Installation](#installation) · [Configuration](#configuration) · [Architecture](#architecture)
</div>

---

MV3 Bridge is a lightweight, pure Manifest V3 browser extension that intercepts HLS video streams (`.m3u8`) and web videos, routing them directly to your local [mpv](https://mpv.io/) player via Native Messaging. 

Designed for performance and security, the project features a zero-build-system architecture and a robust, Bash-based installation process.

## Features

- **Performance & Security**
  - **Dispatch Locking**: Prevents race conditions during rapid stream requests.
  - **LRU Cache**: Efficient HLS stream detection and management.
  - **Cookie Security**: Secure handling of browser cookie files for authenticated playback.
- **Real-Time HLS Interception**
  - Sniffs `.m3u8` manifests using the `webRequest` API.
  - Displays detected streams in the popup HUD.
- **Terminal Editorial UI**
  - Cyberpunk-inspired brutalist configuration HUD.
  - Built-in documentation panel with copy-paste CLI snippets.

## Prerequisites

| Requirement | Purpose |
|-------------|---------|
| Linux | Native messaging host uses Linux-specific paths |
| Python 3 | Powers the native messaging intermediary |
| [mpv](https://mpv.io/) | Target media player |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Video extraction backend |

## Installation

The system consists of the browser extension and a native messaging host.

### 1. Load the Extension
1. Open `chrome://extensions` (or equivalent) in your browser.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the repository root.

### 2. Register the Native Host
Run the modernized Bash installer:

```bash
cd native_host
chmod +x installer.sh
./installer.sh
```

The script automatically detects your browser environment and configures the native messaging host.

## Architecture

```
mv3/
├── manifest.json                 # Extension manifest
├── src/
│   ├── background/               # Service worker & logic
│   ├── popup/                    # Stream interceptor HUD
│   ├── options/                  # Configuration terminal
│   └── utils/                    # Shared utilities
├── native_host/
│   ├── install.sh                # Bash installer
│   └── mpv_bridge.py            # Native messaging host
└── icons/                        # State icons
```

### Data Flow
```
[Browser Tab] → HLS Sniffer (LRU Cache) → Service Worker
                                            ↓
[Popup HUD] ← Message Router ← Dispatch Locking
      ↓
"Send to MPV" → Native Messaging → mpv_bridge.py → mpv
                  (stdio JSON)    (cookie security)
```

---
*Built for the Terminal Editorial.*
