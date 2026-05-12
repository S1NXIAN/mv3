# MV3 — Browser-to-MPV Bridge

A high-performance extension to send web videos directly to the **MPV media player**.

## Features

*   **Video Interceptor** — Automatically detects hidden video streams (HLS) on the page. Click the icon and hit **INJECT** to play instantly.
*   **Built-in h264ify** — Toggle **FORCE_H264_AVC** in the settings to block VP9/AV1 in the browser. This offloads decoding to your hardware, keeping your system cool and quiet.
*   **Cookie Passthrough** — Forwards your browser cookies and identity to MPV. If you can watch it in your browser, you can watch it in MPV (including private and logged-in streams).
*   **Right-Click Dispatch** — Right-click any link, video, or page and select `[ DISPATCH_TO_MPV ]` to launch instantly.
*   **Status Counter** — A real-time counter on the toolbar icon shows exactly how many streams have been detected.

## Setup

1.  **Load the Extension**: Go to `chrome://extensions`, enable **Developer mode**, and click "Load unpacked" to select this folder.
2.  **Install the Bridge**: Open a terminal in the `native_host/` folder and run `./install.sh`. You will need to provide your Extension ID (found on the extensions page).
3.  **Reload**: Refresh the extension in your browser to finalize the connection.

## Usage

*   **Popup**: Click the extension icon to see detected streams and dispatch the current page URL.
*   **Context Menu**: Right-click any media or link to send it to MPV directly.
*   **Settings**: Click the gear icon in the popup to configure h264ify, hardware acceleration, and custom MPV flags.

---
*Licensed under MIT.*
