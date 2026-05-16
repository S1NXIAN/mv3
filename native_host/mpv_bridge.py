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
import shutil
import atexit


COOKIE_PREFIX = 'mv3_cookies_'
COOKIE_MAX_AGE_SECONDS = 3600

_cookie_files = []


def _cleanup_cookie_files():
    """Remove temporary cookie files created during this session."""
    for filepath in _cookie_files:
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
        except OSError:
            pass


atexit.register(_cleanup_cookie_files)


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


def _escape_cookie_value(value):
    """Escape cookie value for Netscape format (handles special characters)."""
    return value.replace('\\', '\\\\').replace(',', '\\,').replace('\t', '\\t').replace('\n', '\\n').replace('\r', '\\r')


def read_message():
    try:
        raw_length = sys.stdin.buffer.read(4)
        if len(raw_length) < 4:
            sys.exit(0)
        length = struct.unpack('<I', raw_length)[0]
        if length > 1024 * 1024:
            sys.exit(1)
        raw_message = sys.stdin.buffer.read(length)
        return json.loads(raw_message.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        send_message({'status': 'error', 'message': f'Invalid message format: {e}'})
        sys.exit(1)


def send_message(obj):
    encoded = json.dumps(obj).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def handle_play(message):
    url = message.get('url', '')
    flags = message.get('flags', [])
    mpv_path = message.get('mpvPath', '/usr/bin/mpv')
    cookies = message.get('cookies', [])
    user_agent = message.get('userAgent', '')

    if not url:
        send_message({'status': 'error', 'message': 'No URL provided'})
        return

    if not os.path.isfile(mpv_path) or not os.access(mpv_path, os.X_OK):
        send_message({'status': 'error', 'message': f'MPV not found or not executable: {mpv_path}'})
        return

    _cleanup_stale_cookies()

    safe_flags = [f for f in flags if isinstance(f, str) and f.startswith('-')]
    cmd = [mpv_path] + safe_flags

    if user_agent:
        cmd.append(f"--user-agent={user_agent}")

    referer = message.get('referer', '')
    if referer:
        cmd.append(f"--referrer={referer}")

    socket_timeout = message.get('socketTimeout', 30)
    try:
        socket_timeout = max(1, int(socket_timeout))
    except (ValueError, TypeError):
        socket_timeout = 30
    ytdl_opts = [f'socket-timeout={socket_timeout}']

    cookie_file = None
    if cookies and isinstance(cookies, list):
        try:
            current_time = int(time.time())
            valid_cookies = [c for c in cookies if isinstance(c, dict) and (c.get('session', False) or c.get('expirationDate', 0) >= current_time)]

            if valid_cookies:
                cookie_file = tempfile.NamedTemporaryFile(
                    mode='w', suffix='.txt', prefix=COOKIE_PREFIX, delete=False
                )
                cookie_file.write("# Netscape HTTP Cookie File\n")

                for c in valid_cookies:
                    domain = c.get('domain', '')
                    path = c.get('path', '/')
                    secure = "TRUE" if c.get('secure') else "FALSE"
                    try:
                        expires = int(c.get('expirationDate', 0) or 0)
                    except (ValueError, TypeError):
                        expires = 0
                    name = _escape_cookie_value(c.get('name', ''))
                    value = _escape_cookie_value(c.get('value', ''))

                    subdomains = "TRUE" if domain.startswith('.') else "FALSE"

                    cookie_file.write(f"{domain}\t{subdomains}\t{path}\t{secure}\t{expires}\t{name}\t{value}\n")

                cookie_file.close()
                _cookie_files.append(cookie_file.name)
                ytdl_opts.append(f'cookies={cookie_file.name}')
        except Exception as e:
            if cookie_file and os.path.exists(cookie_file.name):
                try:
                    os.remove(cookie_file.name)
                except OSError:
                    pass

    if ytdl_opts:
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
    mpv_found = shutil.which('mpv')
    send_message({
        'status': 'success',
        'message': 'MPV Bridge host is running',
        'mpvDetected': mpv_found or None,
        'python': sys.version.split()[0]
    })


def main():
    try:
        message = read_message()
        action = message.get('action', '')

        if action == 'play':
            handle_play(message)
        elif action == 'ping':
            handle_ping()
        else:
            send_message({'status': 'error', 'message': f'Unknown action: {action}'})
    except Exception as e:
        send_message({'status': 'error', 'message': f'Internal error: {e}'})


if __name__ == '__main__':
    main()
