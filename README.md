# MV3 — Browser-to-MPV HLS Bridge

<div align="center">
  <img src="icons/active/icon128.png" width="96" alt="MV3 logo" align="center">
</div>

A high-performance Chrome Extension (Manifest V3) that intercepts HLS streams and bridges them to [MPV](https://mpv.io/). Featuring a **Tech Noir** aesthetic, this tool provides a seamless, premium interface for power users who demand the quality and flexibility of a native media player for web-based streams.

[Features](#features) · [Prerequisites](#prerequisites) · [Installation](#installation) · [Usage](#usage) · [Configuration](#configuration) · [Architecture](#architecture)

## Features

- **Live HLS Sniffer** — Monitors network requests via `webRequest` API and automatically detects `.m3u8` manifests and `application/ x-mpegurl` responses. Sorts streams by type (Master / Media / Unknown).
- **Browser Identity Passthrough** — Forwards Cookies and User-Agent to MPV via a Netscape cookie jar. Required for authenticated streams and DRM-protected sources.
- **Context Menu Dispatch** — Right-click any page, link, video, or audio element to send it directly to MPV.
- **Configurable MPV Flags** — Override `--hwdec`, `--vo`, `--ytdl-format`, and add custom CLI flags per-session.
- **Native Messaging Host** — Python bridge (`mpv_bridge. py`) that spawns MPV as a detached process using the Chrome Native Messaging protocol (stdio, 4-byte LE length prefix).
- **Cyberpunk Terminal UI** — CRT scanline overlay, noise texture, crimson/obsidian color scheme, mechanical toggle switches, animated stream list.

## Prerequisites

- [MPV](https://mpv. io/) installed on your system
- A Chromium-based browser (Chrome, Chromium, Brave, Edge)
- Python 3.x
- Extension ID from `chrome://extensions` (or `brave://extensions`)

## Installation

### 1. Load the Extension

1. Open `chrome://extensions` (or `brave://extensions`)
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** and select the project directory

### 2. Install the Native Messaging Host

```bash
cd native_host/
./install.sh
```

The installer auto-detects browser config directories and registers `mpv_bridge. py` as a Native Messaging host. It will prompt for your Extension ID.

> [!NOTE]
> Find your Extension ID at the top of `chrome://extensions` under the extension name. On Firefox, use `web-ext build` to package the extension and check `manifest.json` for the ID.

### 3. Reload the Extension

After installing the host, click the **reload** icon on the extension card in `chrome://extensions`.

## Usage

### Popup (Stream Interceptor)

1. Navigate to any page with HLS video/audio
2. Click the extension icon in the toolbar
3. The popup shows the current page URL and any intercepted `.m3u8` streams
4. Click **INJECT** to dispatch the page URL to MPV (uses yt-dlp), or click **INJECT** on any detected stream to play it directly

> [!TIP]
> The HLS sniffer may detect background video thumbnails as false positives. Use the page **INJECT** button for the main media — it relies on yt-dlp which is more reliable for determining the best stream.

### Context Menu

Right-click anywhere on a page (page, link, video, or audio) and select **[ DISPATCH_TO_MPV ]** to send the URL directly to MPV.

### Keyboard Shortcuts

No global shortcuts are defined by default. You can add them via **Keyboard Shortcuts** in `chrome://extensions` (under the extension card's menu).

## Configuration

Open the extension's **Console Config** (gear icon in the popup or via the extension card menu) to adjust settings.

### Core System

| Setting | Description | Default |
|---|---|---|
| `EXECUTABLE_PATH` | Absolute path to the MPV binary | `/usr/bin/mpv` |
| `NATIVE_HOST_ID` | Must match the installed JSON manifest | `com.mpvbridge.native` |
| `PING_HOST` | Tests connection to the native messaging host | — |

### Network & Privacy

| Setting | Description |
|---|---|
| `HLS_SNIFFER_ENABLED` | Intercept `.m3u8` manifests via webRequest API |
| `PASS_BROWSER_IDENTITY` | Forward Cookies and User-Agent to MPV. Required for authenticated/DRM streams |

### Video Renderer (Advanced Mode)

| Setting | Description |
|---|---|
| `HW_DECODER [--hwdec]` | Hardware decoder: `auto`, `vaapi`, `nvdec`, `videotoolbox`, `no` |
| `VIDEO_OUTPUT [--vo]` | Video output: `gpu`, `gpu-next`, `x11`, `null` |
| `ALWAYS_ON_TOP [--ontop]` | Keep MPV window above all others |

### Advanced Flags

| Setting | Description |
|---|---|
| `YTDL_FORMAT [--ytdl-format]` | yt-dlp format selector, e.g. `bestvideo[height<=1080]+bestaudio/best` |
| `CUSTOM_CLI_FLAGS` | Additional raw flags passed to MPV, one per line |

## Architecture

```
Extension Popup ◄─────── chrome.runtime ───────► Service Worker ── webRequest ──► Network
(popup.html/js)                                  (background.js)              (HLS Sniffer)
                                                        │
                                    chrome.runtime.sendNativeMessage
                                                        │  stdio (4-byte LE length)
                                                        ▼
                                              Native Host (mpv_bridge.py)
                                                        │  Popen(cmd)
                                                        ▼
                                              MPV Player (detached process)
```

The popup communicates with the service worker via `chrome.runtime.sendMessage`. The service worker uses `chrome.webRequest` to detect `.m3u8` URLs and stores per-tab state in a hybrid in-memory + `chrome.storage.session` cache. When the user triggers a dispatch, the service worker sends a JSON message to `mpv_bridge.py` via Chrome's Native Messaging protocol. The Python host builds an MPV command line — including yt-dlp options, a Netscape cookie jar, and user-configured flags — then spawns MPV detached with `subprocess.Popen`.

### Key Files

| File | Role |
|---|---|
| `manifest.json` | Extension manifest (Manifest V3, permissions, icon set) |
| `background.js` | Service worker: config, HLS sniffer, badge controller, context menu, native dispatcher |
| `popup.js` / `popup.html` | Popup UI: stream list, dispatch buttons, toast notifications |
| `options.js` / `options.html` | Settings console with advanced renderer and flag overrides |
| `popup.css` / `options.css` | Cyberpunk terminal styling (CRT, noise, crimson/obsidian) |
| `native_host/mpv_bridge.py` | Native Messaging host: JSON over stdio, spawns MPV |
| `native_host/install.sh` | Wrapper that runs the TUI installer |
| `native_host/installer_tui.py` | Interactive TUI for browser manifest registration |

## License

MIT