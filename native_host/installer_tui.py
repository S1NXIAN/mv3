#!/usr/bin/env python3
"""
Interactive TUI Installer for MV3 Native Messaging Host.
Provides a modern terminal interface to select browser profiles and install the manifest.
"""

import os
import sys
import json
import re
import tty
import termios
import shutil

CYAN = "\033[38;2;0;212;255m"
GREEN = "\033[38;2;0;230;118m"
RED = "\033[38;2;255;82;82m"
GRAY = "\033[38;5;242m"
WHITE = "\033[37m"
BOLD = "\033[1m"
RESET = "\033[0m"

UP = "\033[A"
CLEAR_LINE = "\033[2K\r"
HIDE_CURSOR = "\033[?25l"
SHOW_CURSOR = "\033[?25h"

HOST_NAME = "com.mpvbridge.native"

def get_browser_dirs():
    home = os.path.expanduser("~")
    candidates = [
        ("Google Chrome", f"{home}/.config/google-chrome"),
        ("Chromium", f"{home}/.config/chromium"),
        ("Brave", f"{home}/.config/BraveSoftware/Brave-Browser"),
        ("Brave Origin Nightly", f"{home}/.config/BraveSoftware/Brave-Origin-Nightly"),
        ("Edge", f"{home}/.config/microsoft-edge"),
    ]
    return [(name, path) for name, path in candidates if os.path.isdir(path)]

def read_key():
    """Read a single keypress from stdin."""
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        ch = sys.stdin.read(1)
        if ch == '\x1b':
            ch += sys.stdin.read(2)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
    return ch

def interactive_select(options):
    """
    Renders an interactive multi-select menu.
    options: list of (name, path)
    Returns list of selected items.
    """
    selected = set()
    cursor = 0

    print(f"{CYAN}?{RESET} {BOLD}Multiple browser configurations detected.{RESET}")
    print(f"{GRAY}Use [Arrow Keys] to move, [Space] to toggle, [Enter] to confirm.{RESET}")

    for _ in options:
        print()
    sys.stdout.write(f"\033[{len(options)}A")

    sys.stdout.write(HIDE_CURSOR)
    try:
        while True:
            for i, (name, path) in enumerate(options):
                prefix = f"{CYAN}> {RESET}" if i == cursor else "  "
                box = f"{GREEN}◉{RESET}" if i in selected else f"{GRAY}◯{RESET}"
                color = BOLD if i == cursor else ""
                sys.stdout.write(f"{CLEAR_LINE}{prefix}{box} {color}{name}{RESET}\n")

            sys.stdout.write(f"\033[{len(options)}A")
            sys.stdout.flush()

            key = read_key()
            if key == '\x03':
                sys.stdout.write(f"\033[{len(options)}B{SHOW_CURSOR}")
                print(f"{RED}Aborted.{RESET}")
                sys.exit(1)
            elif key == '\r' or key == '\n':
                break
            elif key == ' ':
                if cursor in selected:
                    selected.remove(cursor)
                else:
                    selected.add(cursor)
            elif key == '\x1b[A':
                cursor = max(0, cursor - 1)
            elif key == '\x1b[B':
                cursor = min(len(options) - 1, cursor + 1)

    finally:
        sys.stdout.write(f"\033[{len(options)}B{SHOW_CURSOR}")

    return [options[i] for i in sorted(list(selected))]

def is_valid_extension_id(ext_id):
    """Validate Chrome extension ID format (32 chars, alphanumeric)."""
    if not ext_id:
        return False
    return bool(re.match(r'^[a-z]{32}$', ext_id))

def prompt_ext_id():
    while True:
        print(f"\n{CYAN}?{RESET} {BOLD}Enter your Extension ID:{RESET}")
        print(f"{GRAY}(Find this at chrome://extensions or brave://extensions){RESET}")
        sys.stdout.write(f"{CYAN}❯{RESET} ")
        sys.stdout.flush()
        ext_id = input().strip()

        if not ext_id:
            print(f"{RED}Extension ID is required.{RESET}")
            continue

        if not is_valid_extension_id(ext_id):
            print(f"{RED}Invalid extension ID format. Expected 32 lowercase letters.{RESET}")
            print(f"{GRAY}Example: aaaaaaaaaaaaabcdefghijkabcdefg{RESET}")
            retry = input(f"{CYAN}Retry?{RESET} [Y/n]: ").strip().lower()
            if retry not in ('y', 'yes', ''):
                sys.exit(1)
            continue

        return ext_id

def install_manifest(browser_name, config_path, host_path, ext_id):
    try:
        os.makedirs(config_path, exist_ok=True)
    except PermissionError:
        print(f"{RED}ERROR: No write permission for {config_path}{RESET}")
        return False

    nm_dir = os.path.join(config_path, "NativeMessagingHosts")
    try:
        os.makedirs(nm_dir, exist_ok=True)
    except PermissionError:
        print(f"{RED}ERROR: Cannot create NativeMessagingHosts directory.{RESET}")
        return False

    manifest_path = os.path.join(nm_dir, f"{HOST_NAME}.json")

    manifest = {
        "name": HOST_NAME,
        "description": "MV3 Native Messaging Host — browser-to-mpv relay",
        "path": host_path,
        "type": "stdio",
        "allowed_origins": [
            f"chrome-extension://{ext_id}/"
        ]
    }

    try:
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
            f.write('\n')
    except IOError as e:
        print(f"{RED}ERROR: Failed to write manifest: {e}{RESET}")
        return False

    print(f"{GREEN}✔{RESET} Installed for {BOLD}{browser_name}{RESET} → {GRAY}{manifest_path}{RESET}")
    return True

def main():
    print(f"\n{CYAN}╔══════════════════════════════════════════╗{RESET}")
    print(f"{CYAN}║{RESET}{BOLD}   MV3 — Native Messaging Installer       {RESET}{CYAN}║{RESET}")
    print(f"{CYAN}╚══════════════════════════════════════════╝{RESET}\n")

    if not shutil.which('python3'):
        print(f"{RED}ERROR: python3 not found in PATH{RESET}")
        sys.exit(1)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    host_path = os.path.join(script_dir, "mpv_bridge.py")

    if not os.path.isfile(host_path):
        print(f"{RED}ERROR: mpv_bridge.py not found at: {host_path}{RESET}")
        sys.exit(1)

    os.chmod(host_path, 0o755)
    print(f"{GREEN}✔{RESET} Set executable permissions on mpv_bridge.py\n")

    dirs = get_browser_dirs()
    if not dirs:
        print(f"{RED}No known browser config directories found!{RESET}")
        sys.exit(1)
    elif len(dirs) == 1:
        name, path = dirs[0]
        print(f"{CYAN}?{RESET} Found 1 browser: {BOLD}{name}{RESET}")
        sys.stdout.write(f"  Install manifest here? [Y/n] ")
        sys.stdout.flush()
        ans = input().strip().lower()
        if ans not in ('', 'y', 'yes'):
            print(f"{RED}Aborted.{RESET}")
            sys.exit(0)
        selected = dirs
    else:
        selected = interactive_select(dirs)
        if not selected:
            print(f"{RED}No browsers selected. Aborted.{RESET}")
            sys.exit(0)

    ext_id = prompt_ext_id()
    print()

    success_count = 0
    for name, path in selected:
        if install_manifest(name, path, host_path, ext_id):
            success_count += 1

    if success_count == 0:
        print(f"\n{RED}Failed to install to any browsers.{RESET}")
        sys.exit(1)

    print(f"\n{CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{RESET}")
    print(f"{GREEN}Done!{RESET} Installed to {success_count} browser(s).")
    print("Reload the extension in your browser to apply.\n")

if __name__ == "__main__":
    main()
