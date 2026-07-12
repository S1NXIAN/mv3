<div align="center">
  <img src="icons/idle/icon128.png" width="96" alt="MV3 Bridge">

  # MV3 Bridge

  *Route HLS streams and web videos directly to MPV from your browser*

  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-3c873a?style=flat-square)](#)
  [![Platform](https://img.shields.io/badge/Platform-Linux-cc3333?style=flat-square)](#)
  [![Version](https://img.shields.io/badge/Version-3.0.0-00e5ff?style=flat-square)](#)

  [Features](#features) · [Installation](#installation) · [Configuration](#configuration) · [Architecture](#architecture)
</div>

---

MV3 Bridge intercepts HLS streams (`.m3u8`) and sends them to your local [mpv](https://mpv.io/) player via Native Messaging.

## Prerequisites

| Requirement | Purpose |
|-------------|---------|
| Linux | Native messaging host paths |
| Python 3 | Native messaging intermediary |
| [mpv](https://mpv.io/) | Target media player |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Video extraction |

## Installation

### 1. Load the Extension

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select the repo root.

### 2. Register the Native Host

Open the extension's **Options** page → the **EXTENSION_ID** and install command are shown in the DIAGNOSTICS panel. Copy the command and run it from the repo root:

```bash
./native_host/installer.sh <extension_id>
```

Or run without args for the interactive prompt.

---

Built for the Terminal Editorial.
