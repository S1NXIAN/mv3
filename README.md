# MV3 — Browser-to-MPV HLS Bridge

<div align="center">
  <img src="icons/idle/icon128.png" width="96" alt="MV3 logo" align="center">
</div>

A high-performance Chrome Extension (Manifest V3) that intercepts HLS streams and bridges them to [MPV](https://mpv.io/). Featuring a **Tech Noir** aesthetic, this tool provides a seamless, premium interface for power users who demand the quality and flexibility of a native media player for web-based streams.

[Features](#features) · [Performance](#performance--reliability) · [Prerequisites](#prerequisites) · [Installation](#installation) · [Usage](#usage) · [Architecture](#architecture)

## Features

- **Zero-Latency HLS Sniffer** — High-efficiency implementation using `onHeadersReceived` and type-filtering. Minimizes CPU wakeups by surgically ignoring non-media assets (images, CSS, scripts) while automatically detecting `.m3u8` manifests and HLS MIME types.
- **Deep Identity Passthrough** — Forwards full `User-Agent` strings and structured `Cookies` to MPV. Automatically generates a dynamic **Netscape HTTP Cookie Jar** to bypass aggressive CDN hotlink protections and handle authenticated sessions.
- **Live Status Badge** — High-visibility crimson indicator with a real-time stream counter, providing instant feedback when HLS signatures are detected.
- **Context Menu Dispatch** — Right-click any page, link, video, or audio element to send it directly to MPV.
- **Configurable MPV Flags** — Override `--hwdec`, `--vo`, `--ytdl-format`, and add custom CLI flags per-session.
- **Cyberpunk Terminal UI** — CRT scanline overlay, noise texture, crimson/obsidian color scheme, mechanical toggle switches, and animated stream list.

## Performance & Reliability

- **Ghost Process Prevention** — Integrated `socket-timeout=30` for `yt-dlp` ensures that background processes self-terminate if a connection is lost or MPV fails, preventing resource leaks.
- **Self-Cleaning Workspace** — The native host automatically purges temporary session files and stale cookie jars older than one hour.
- **SPA-Ready State Management** — Intelligent memory management automatically flushes stream caches on tab reloads and URL changes, maintaining a near-zero RAM footprint for long browsing sessions.
- **Detached Execution** — Spawns MPV in a new process session, allowing the player to persist even if the browser is closed.

## Prerequisites

- [MPV](https://mpv.io/) installed on your system
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

The installer auto-detects browser config directories and registers `mpv_bridge.py` as a Native Messaging host. It will prompt for your Extension ID.

> [!NOTE]
> Find your Extension ID at the top of `chrome://extensions` under the extension name.

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

The popup communicates with the service worker via `chrome.runtime.sendMessage`. The service worker uses optimized `chrome.webRequest` listeners to detect `.m3u8` URLs and stores per-tab state in a hybrid in-memory + `chrome.storage.session` cache. When a dispatch is triggered, the service worker sends structured JSON metadata (including identity headers and cookies) to `mpv_bridge.py` via Chrome's Native Messaging protocol. The Python host constructs a hardened MPV command line, generates a temporary Netscape cookie jar, and spawns MPV as a detached process.

## License

This project is licensed under the [MIT License](LICENSE).
