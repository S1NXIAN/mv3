#!/usr/bin/env python3
"""
MPV Bridge — Native Messaging Host

Protocol: Chrome Native Messaging (stdio, 4-byte LE length prefix)
Receives JSON commands from the extension, spawns mpv as a detached process.

Supported actions:
  - "play"  → Launch mpv with the given URL and flags
  - "ping"  → Health check, responds with status
"""

import sys
import json
import struct
import subprocess
import os
import glob
import time
import tempfile
from urllib.parse import urlparse


# ── Stale Cookie Cleanup ──────────────────────────────────────────────
# Removes old Netscape cookie files from /tmp to prevent clutter.
# Called on every "play" action. Only removes files older than 1 hour.

COOKIE_PREFIX = 'mv3_cookies_'
COOKIE_MAX_AGE_SECONDS = 3600  # 1 hour


def _cleanup_stale_cookies():
    """Remove temporary cookie files older than COOKIE_MAX_AGE_SECONDS."""
    try:
        pattern = os.path.join(tempfile.gettempdir(), f'{COOKIE_PREFIX}*.txt')
        now = time.time()
        for filepath in glob.glob(pattern):
            try:
                if now - os.path.getmtime(filepath) > COOKIE_MAX_AGE_SECONDS:
                    os.remove(filepath)
            except OSError:
                pass
    except Exception:
        pass


def _extract_domain(url):
    """Extract the domain from a URL for cookie jar formatting."""
    try:
        parsed = urlparse(url)
        domain = parsed.hostname or ''
        # Netscape cookie format expects leading dot for domain-wide cookies
        if domain and not domain.startswith('.'):
            domain = '.' + domain
        return domain
    except Exception:
        return '.unknown.com'


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) < 4:
        sys.exit(0)
    length = struct.unpack('<I', raw_length)[0]
    if length > 1024 * 1024:
        sys.exit(1)
    raw_message = sys.stdin.buffer.read(length)
    return json.loads(raw_message.decode('utf-8'))


def send_message(obj):
    encoded = json.dumps(obj).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def handle_play(message):
    url = message.get('url', '')
    flags = message.get('flags', [])
    mpv_path = message.get('mpvPath', '/usr/bin/mpv')
    cookies = message.get('cookies', '')

    if not url:
        send_message({'status': 'error', 'message': 'No URL provided'})
        return

    if not os.path.isfile(mpv_path):
        send_message({'status': 'error', 'message': f'MPV not found: {mpv_path}'})
        return

    if not os.access(mpv_path, os.X_OK):
        send_message({'status': 'error', 'message': f'Not executable: {mpv_path}'})
        return

    # Clean up stale cookie files from previous sessions
    _cleanup_stale_cookies()

    safe_flags = [f for f in flags if isinstance(f, str) and f.startswith('-')]
    cmd = [mpv_path] + safe_flags

    referer = message.get('referer', '')
    if referer:
        cmd.append(f"--referrer={referer}")

    # ── yt-dlp Hardening ──────────────────────────────────────────────
    # Force yt-dlp to timeout instead of retrying forever.
    # This prevents ghost yt-dlp processes from living indefinitely
    # when mpv crashes or the CDN returns persistent errors.
    ytdl_opts = ['socket-timeout=30']

    # ── Cookie Jar (Netscape format) ──────────────────────────────────
    # Page URLs (YouTube, etc.) need a Netscape Cookie Jar for yt-dlp.
    # We DO NOT pass cookies as HTTP headers because global cookies
    # break aggressive CDNs that reject unexpected cookie headers.
    if cookies:
        try:
            domain = _extract_domain(url)
            cookie_file = tempfile.NamedTemporaryFile(
                mode='w', suffix='.txt', prefix=COOKIE_PREFIX, delete=False
            )
            cookie_file.write("# Netscape HTTP Cookie File\n")
            for pair in cookies.split('; '):
                if '=' in pair:
                    name, value = pair.split('=', 1)
                    cookie_file.write(f"{domain}\tTRUE\t/\tFALSE\t0\t{name}\t{value}\n")
            cookie_file.close()
            ytdl_opts.append(f'cookies={cookie_file.name}')
        except Exception:
            pass

    # Combine all ytdl options into a single flag
    cmd.append(f"--ytdl-raw-options={','.join(ytdl_opts)}")

    cmd.append('--')
    cmd.append(url)

    try:
        subprocess.Popen(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
            close_fds=True
        )
        send_message({'status': 'success', 'message': f'Launched MPV: {url[:80]}'})
    except Exception as e:
        send_message({'status': 'error', 'message': str(e)})


def handle_ping():
    import shutil
    mpv_found = shutil.which('mpv')
    send_message({
        'status': 'success',
        'message': 'MPV Bridge host is running',
        'mpvDetected': mpv_found or None,
        'python': sys.version.split()[0]
    })


def main():
    message = read_message()
    action = message.get('action', '')

    if action == 'play':
        handle_play(message)
    elif action == 'ping':
        handle_ping()
    else:
        send_message({'status': 'error', 'message': f'Unknown action: {action}'})


if __name__ == '__main__':
    main()
