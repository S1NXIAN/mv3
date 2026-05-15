<div align="center">
  <img src="icons/idle/icon128.png" width="96" alt="MV3 Bridge Logo">

  # MV3 // BRIDGE

  *Route network streams and web videos directly to MPV from your browser*

  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-3c873a?style=flat-square)](#)
  [![Platform](https://img.shields.io/badge/Platform-Linux-cc3333?style=flat-square)](#)
  [![Browser](https://img.shields.io/badge/Browser-Chrome%20|%20Brave%20|%20Edge%20|%20Vivaldi%20|%20Opera%20|%20Firefox-478ce1?style=flat-square)](#)
  [![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

  [Features](#features) · [Installation](#installation) · [Configuration](#configuration) · [Architecture](#architecture)

</div>

---

A Manifest V3 browser extension that intercepts HLS video streams (`.m3u8`) and routes them to your local [mpv](https://mpv.io/) media player via Native Messaging. Supports DRM-protected streams through browser identity forwarding, codec enforcement via h264ify, and advanced renderer overrides — all wrapped in an animated cyberpunk HUD.

<div align="center">
  <img src="screenshots/ss1.png" width="390" alt="HUD — Idle State">
  <img src="screenshots/ss2.png" width="390" alt="HUD — Stream Interception">
  <br>
  <img src="screenshots/ss3.png" width="390" alt="Options — Basic Configuration">
  <img src="screenshots/ss4.png" width="390" alt="Options — Advanced Mode">
</div>

## Features

- **HLS Stream Interception** — Sniffs `.m3u8` manifests in real-time using the `webRequest` API. Classifies streams as master or media playlists and presents them in the popup HUD.
- **Identity Forwarding** — Passes browser cookies and User-Agent to mpv, enabling playback of DRM-protected and authenticated streams from subscription services.
- **Codec Enforcement** — h264ify integration blocks VP8/VP9/AV1 at the browser level, forcing H.264 fallback for reduced CPU usage on older hardware.
- **Renderer Overrides** — Fine-tune `--hwdec`, `--vo`, `--ytdl-format`, and custom CLI flags directly from the options terminal. "Inherit" mode defers to your `mpv.conf`.
- **Context Menu Integration** — Right-click any page, link, video, or audio element to dispatch it to mpv instantly.

## Prerequisites

| Requirement | Purpose |
|---|---|
| **Linux** | Only supported platform |
| **python3** | Runs the native messaging host |
| **[mpv](https://mpv.io/)** | Media player target |
| A supported browser | See table below |

## Installation

Setup involves two steps: loading the extension and registering the native messaging host.

### 1. Load the Extension

1. Clone this repository.
2. Open your browser's extension page:
   - Chromium-based: `chrome://extensions`
   - Firefox-based: `about:debugging#/runtime/this-firefox`
3. Enable **Developer mode** (Chromium) or click **Load Temporary Add-on** (Firefox).
4. Select the root directory of this repository.

### 2. Install the Native Host

The included interactive installer auto-detects your browsers and registers the native messaging manifest.

```bash
cd native_host
./install.sh
```

The installer will walk you through browser selection and extension ID entry.

<details>
<summary><strong>Supported browsers</strong></summary>

| Chromium-based | Firefox-based |
|---|---|
| Google Chrome (+ Beta, Dev) | Firefox |
| Chromium / Ungoogled Chromium | Zen Browser |
| Brave (+ Beta, Nightly, Origin) | Floorp |
| Microsoft Edge (+ Beta, Dev) | Waterfox |
| Vivaldi (+ Snapshot) | |
| Opera (+ Beta, Developer) | |
| Thorium | |

</details>

> [!TIP]
> **Finding your Extension ID:**
> - Chromium: `chrome://extensions` → enable Developer Mode → copy ID
> - Firefox: `about:debugging#/runtime/this-firefox` → copy Internal UUID

### 3. Verify Connection

Open the extension's options page and click **[ PING NATIVE HOST ]** under the diagnostics panel. A successful connection shows `✓ CONNECTED`.

To uninstall all manifests later:
```bash
cd native_host
python3 installer_tui.py --uninstall
```

## Configuration

The extension is controlled through two interfaces: the **popup HUD** (stream interception and dispatch) and the **options terminal** (system configuration).

> [!TIP]
> Access the options terminal directly from the popup by clicking the hexagon icon in the top-right corner.

### Basic Options

| Option | Description | Default |
|---|---|---|
| **HLS Sniffer** | Intercept `.m3u8` manifests via `webRequest` | Enabled |
| **Pass Browser Identity** | Forward cookies and User-Agent to mpv (required for DRM) | Enabled |
| **Force H264** | Block VP8/VP9/AV1 codecs in the browser | Disabled |

### Advanced Options

Enable **Advanced Mode** in the options terminal to reveal renderer and flag overrides.

| Option | mpv Flag | Behavior when unset |
|---|---|---|
| HW Decoder | `--hwdec` | Inherits from `mpv.conf` |
| Video Output | `--vo` | Inherits from `mpv.conf` |
| Always On Top | `--ontop` | Inherits from `mpv.conf` |
| YTDL Format | `--ytdl-format` | Inherits from `mpv.conf` |
| Custom CLI Flags | Raw flags | None added |

> [!IMPORTANT]
> Only explicitly configured options produce CLI flags. Everything left at "Inherit" or blank defers to your `mpv.conf`, so your existing mpv setup is never disrupted.

## Architecture

```
mv3/
├── manifest.json                    # Extension manifest (MV3)
├── src/
│   ├── background/                  # Service worker (modular)
│   │   ├── background.js            # Entry point — wires modules via importScripts
│   │   ├── config.js                # Config cache with TTL + h264ify lifecycle
│   │   ├── badge.js                 # Icon state controller with debouncing
│   │   ├── tab-state.js             # Per-tab HLS state (memory + session storage)
│   │   ├── hls-sniffer.js           # webRequest-based .m3u8 detection
│   │   ├── native-messaging.js      # mpv dispatch, cookie merging, context menu
│   │   └── message-router.js        # Internal message handler (popup ↔ SW)
│   ├── popup/                       # HUD interface
│   ├── options/                     # Configuration terminal
│   ├── scripts/
│   │   └── h264ify.js               # Codec blocking content script (MAIN world)
│   └── utils/
│       ├── config-defaults.js       # Shared config defaults (single source of truth)
│       ├── storage-utils.js         # Session storage abstraction
│       └── ui-utils.js              # Glitch effects and clipboard helpers
├── native_host/
│   ├── install.sh                   # Installer entry point
│   ├── installer_tui.py             # Interactive TUI installer (18 browsers)
│   └── mpv_bridge.py                # Native messaging host (stdio JSON protocol)
└── icons/
    ├── idle/                        # Default extension icon
    └── active/                      # Icon when streams detected
```

### Data Flow

```
Browser Tab → webRequest API → HLS Sniffer → Tab State Cache
                                                    ↓
Popup HUD ← Message Router ← Service Worker → Badge Controller
    ↓
"Send to MPV" → Native Messaging → mpv_bridge.py → mpv process
                  (stdio JSON)     (cookie file)    (detached)
```
