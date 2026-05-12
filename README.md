<div align="center">
  <img src="icons/active/icon128.png" width="96" alt="MV3 Bridge Logo">

  # MV3 // BRIDGE
  *Cyberpunk-themed browser extension to route network streams directly to MPV*

  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-3c873a?style=flat-square)](#)
  [![Browser](https://img.shields.io/badge/Browser-Chrome%20|%20Edge%20|%20Brave-478ce1?style=flat-square)](#)
  [![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

  ⭐ If you like this project, star it on GitHub!

  [Features](#features) • [Installation](#installation) • [Configuration](#configuration)

</div>

A powerful Manifest V3 browser extension that intercepts HLS video streams (`.m3u8`) and routes them directly to your local `mpv` media player using Native Messaging. Encased in a highly stylized, animated Cyberpunk Targeting HUD, it serves as a seamless bridge between the web and your desktop, fully supporting DRM-protected streams and advanced renderer overrides.

## Features

- 🎯 **Network Stream Interception** - Sniffs traffic for HLS manifests using the powerful `webRequest` API.
- 🔐 **Identity Forwarding** - Seamlessly passes your browser Cookies and User-Agent string to MPV, unlocking DRM-protected and authenticated streams.
- ⚡ **Codec Enforcement (h264ify)** - Automatically blocks VP8/VP9/AV1 encodings at the browser level, forcing sites to serve H264 for drastically reduced CPU usage.
- 🎨 **Diegetic Cyberpunk HUD** - An immersive, fully animated deep crimson targeting interface with custom glitching interactions and CRT scanline effects.
- 🔧 **Advanced Renderer Overrides** - Fine-tune hardware decoding (`--hwdec`), video output APIs (`--vo`), and `ytdl` formats directly from the integrated `SYS.CONFIG` options terminal.

## Installation

Because this extension interfaces directly with a desktop application (`mpv`), installation requires setting up both the browser extension and the Native Messaging Host.

### 1. Load the Browser Extension
1. Clone or download this repository.
2. Open your Chromium-based browser and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the root directory of this repository.

### 2. Install the Native Messaging Host
To allow the extension to communicate with `mpv`, you must install the native host manifest JSON file on your operating system.

> [!IMPORTANT]
> The exact location for the native host JSON file depends on your OS and browser. For Chrome on Linux, the manifest usually goes to `~/.config/google-chrome/NativeMessagingHosts/com.mpvbridge.native.json`. Make sure the python/shell script specified in the manifest has executable permissions!

### 3. Verify Connection
1. Open the extension's **SYS.CONFIG** terminal (Options Page).
2. Click the `[ PING NATIVE HOST ]` button under the `SYS.STAT // DIAGNOSTICS` panel.
3. If successful, the readout will display `✓ CONNECTED`.

## Configuration

The extension is primarily controlled through its Cyberpunk HUD (Popup) and the Options Terminal.

> [!TIP]
> You can quickly access the advanced configuration terminal by clicking the **SYS.CONFIG** button directly from the popup HUD.

**NET.INT // INTERCEPT**
- **HLS Sniffer:** Enable to automatically catch `.m3u8` master playlists.
- **Pass Browser Identity:** Essential if you are trying to route streams from subscription services (forwards cookies).
- **Force H264:** Use this if you are on an older machine without hardware AV1/VP9 decoding.

**CORE.CFG // KERNEL** (Advanced Mode)
- **Executable Path:** Must be the absolute path to your `mpv` binary (e.g., `/usr/bin/mpv`).
- **Native Host ID:** Must precisely match the ID used in your Native Messaging JSON manifest (default: `com.mpvbridge.native`).

**VID.RNDR // OUTPUT** (Advanced Mode)
- Allows overriding default MPV flags like `--hwdec=auto-safe` or `--vo=gpu-next`. Inherit leaves the decision to your default `mpv.conf`.
