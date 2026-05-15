<div align="center">
  <img src="icons/idle/icon128.png" width="96" alt="MV3 Bridge Logo">

  # MV3 // BRIDGE

  *Route network streams and web videos directly to MPV from your browser*

  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-3c873a?style=flat-square)](#)
  [![Platform](https://img.shields.io/badge/Platform-Linux-cc3333?style=flat-square)](#)
  [![Version](https://img.shields.io/badge/Version-2.3.8-00e5ff?style=flat-square)](#)
  [![Browser](https://img.shields.io/badge/Browser-Chrome%20|%20Brave%20|%20Edge%20|%20Vivaldi%20|%20Opera%20|%20Firefox-478ce1?style=flat-square)](#)

  [Features](#features) · [Prerequisites](#prerequisites) · [Installation](#installation) · [Configuration](#configuration) · [Architecture](#architecture)
</div>

---

A Manifest V3 browser extension that bridges the gap between the browser sandbox and your local machine. MV3 intercepts HLS video streams (`.m3u8`) and web videos, routing them instantly to your local [mpv](https://mpv.io/) media player via Native Messaging. 

By passing browser identity and cookies down to `yt-dlp` and `mpv`, this extension provides a seamless, native playback experience that natively supports DRM-protected streams and subscription services, all wrapped in a high-performance "Terminal Editorial" cyberpunk HUD.

<div align="center">
  <img src="screenshots/ss1.png" width="390" alt="HUD — Idle State">
  <img src="screenshots/ss2.png" width="390" alt="HUD — Stream Interception">
  <br>
  <img src="screenshots/ss3.png" width="390" alt="Options — Basic Configuration">
  <img src="screenshots/ss4.png" width="390" alt="Options — Advanced Mode">
</div>

## Features

- **Real-Time HLS Interception**  
  Sniffs `.m3u8` manifests directly from the network using the `webRequest` API. Automatically classifies streams as master or media playlists and presents them in the popup HUD.
  
- **Identity Forwarding (Cookie Sync)**  
  Seamlessly passes your active browser session (cookies and User-Agent) to the native `mpv` process. This enables playback of authenticated or age-restricted streams from premium services without requiring manual token extraction.

- **Codec Enforcement (h264ify)**  
  Injects isolated scripts to block `VP8`, `VP9`, and `AV1` codecs at the browser level, forcing sites like YouTube to serve `H.264`. This massively reduces CPU overhead on older hardware.

- **Terminal Editorial UI & Docs**  
  A completely bespoke, cyberpunk-inspired brutalist configuration HUD. Includes a beautifully designed `System Parameters` documentation panel to help you configure advanced `mpv` overrides effortlessly.

- **Contextual Dispatch**  
  Right-click any page, link, video, or audio element to instantly dispatch the target URL to the native player.

## Prerequisites

| Requirement | Purpose |
|---|---|
| **Linux** | The native host installer currently relies on Linux-specific manifest paths. |
| **python3** | Powers the native messaging host intermediary script. |
| **[mpv](https://mpv.io/)** | The target kernel media player. |
| **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** | The video extraction backend utilized by `mpv`. |

## Installation

The system requires two components: the browser extension itself, and a native messaging host that allows the browser to securely talk to the underlying OS.

### 1. Load the Browser Extension

1. Clone this repository to your local machine.
2. Open your browser's extension management page:
   - Chromium-based: Navigate to `chrome://extensions`
   - Firefox-based: Navigate to `about:debugging#/runtime/this-firefox`
3. Enable **Developer mode** (Chromium) or click **Load Temporary Add-on** (Firefox).
4. Select the root directory of this repository to load the unpacked extension.

> [!TIP]
> **Find your Extension ID**  
> You will need this for the next step.
> - **Chromium:** Enable Developer Mode, look at the MV3 extension card, and copy the `ID`.
> - **Firefox:** Look at the MV3 extension card and copy the `Internal UUID`.

### 2. Register the Native Host

The extension ships with an interactive CLI installer that auto-detects your browser variants and registers the native messaging manifest securely.

```bash
cd native_host
./install.sh
```

Follow the on-screen terminal prompts. You will be asked to select your target browser and paste the Extension ID you copied in step 1.

<details>
<summary><strong>View all supported browsers</strong></summary>

| Chromium Architecture | Firefox Architecture |
|---|---|
| Google Chrome (+ Beta, Dev) | Firefox |
| Chromium / Ungoogled Chromium | Zen Browser |
| Brave (+ Beta, Nightly, Origin) | Floorp |
| Microsoft Edge (+ Beta, Dev) | Waterfox |
| Vivaldi (+ Snapshot) | |
| Opera (+ Beta, Developer) | |
| Thorium | |

</details>

### 3. Verify System Connection

Open the extension's popup, click the hexagon icon to open the **Options Terminal**, and click **[ PING NATIVE HOST ]** under the diagnostics panel. A successful handshake will output a green `✓ CONNECTED` signal.

> [!NOTE]
> To completely remove the native messaging manifests from your system later, you can run:
> ```bash
> cd native_host
> python3 installer_tui.py --uninstall
> ```

## Configuration

Configuration is handled entirely through the Options Terminal. 

### Advanced Mode

Toggling **Advanced Mode** unlocks the renderer overrides and CLI configurations.

| Target Parameter | mpv Flag Equivalent | System Behavior when unset |
|---|---|---|
| HW Decoder | `--hwdec` | Defers to your local `mpv.conf` |
| Video Output | `--vo` | Defers to your local `mpv.conf` |
| Always On Top | `--ontop` | Defers to your local `mpv.conf` |
| YTDL Format | `--ytdl-format` | Defers to your local `mpv.conf` |
| Custom CLI Flags | Raw injected string | None |

> [!IMPORTANT]
> The extension is strictly non-destructive. Any parameter left blank or set to "Inherit" will quietly defer to your existing `~/.config/mpv/mpv.conf`. Your local configurations are always respected.

### System Directives

Click **[ VIEW DOCS ]** in the configuration panel to access the `SYSTEM PARAMETERS` guide. This built-in documentation provides copy-pasteable snippets for useful CLI flags like `--autofit=50%`, `--save-position-on-quit`, and `--ytdl-raw-options="mark-watched="`.

## Architecture

The system utilizes a service worker to aggressively cache and clean up stream states, while a Python daemon passes commands directly to the OS shell.

```text
mv3/
├── manifest.json                    # Extension manifest (MV3)
├── src/
│   ├── background/                  # Background Service Worker 
│   │   ├── background.js            # Entry point — wires modules via importScripts
│   │   ├── config.js                # Shared configuration state
│   │   ├── badge.js                 # HUD icon state controller
│   │   ├── tab-state.js             # High-performance HLS state cache
│   │   ├── hls-sniffer.js           # webRequest-based .m3u8 detection
│   │   ├── native-messaging.js      # OS dispatch and cookie merging
│   │   └── message-router.js        # Internal message bus
│   ├── content/                     # DOM parsers
│   ├── popup/                       # Stream Interceptor HUD
│   ├── options/                     # Configuration Terminal
│   ├── docs/                        # System Parameters Documentation
│   └── utils/                       # Shared UI and state utilities
├── native_host/
│   ├── install.sh                   # Bash bootstrap
│   ├── installer_tui.py             # TUI interactive browser registry
│   └── mpv_bridge.py                # Native messaging host daemon
└── icons/                           # Dynamic state icons
```

### Protocol Data Flow

```text
[ Browser Tab ] → webRequest API → HLS Sniffer → Local Storage Cache
                                                        ↓
[ Popup HUD ] ← Message Router ← Service Worker → Badge Controller
      ↓
"Send to MPV" → Native Messaging → mpv_bridge.py → mpv process
                   (stdio JSON)    (cookie sync)    (detached)
```
