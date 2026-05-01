#!/usr/bin/env python3
"""
Interactive TUI Installer for MV3 Native Messaging Host.
Provides a modern terminal interface to select browser profiles and install the manifest.
"""

import os
import sys
import json
import tty
import termios

# ANSI Colors
CYAN = "\033[38;2;0;212;255m"
GREEN = "\033[38;2;0;230;118m"
RED = "\033[38;2;255;82;82m"
GRAY = "\033[38;5;242m"
WHITE = "\033[37m"
BOLD = "\033[1m"
RESET = "\033[0m"

# Move cursor
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
    Returns list of selected indices.
    """
    selected = set([0]) if options else set()
    cursor = 0
    
    print(f"{CYAN}?{RESET} {BOLD}Multiple browser configurations detected.{RESET}")
    print(f"{GRAY}Use [Arrow Keys] to move, [Space] to toggle, [Enter] to confirm.{RESET}")
    
    # Pre-allocate lines for the menu
    for _ in options:
        print()
    sys.stdout.write(f"\033[{len(options)}A") # Move back up

    sys.stdout.write(HIDE_CURSOR)
    try:
        while True:
            # Draw menu
            for i, (name, path) in enumerate(options):
                prefix = f"{CYAN}> {RESET}" if i == cursor else "  "
                box = f"{GREEN}◉{RESET}" if i in selected else f"{GRAY}◯{RESET}"
                color = BOLD if i == cursor else ""
                sys.stdout.write(f"{CLEAR_LINE}{prefix}{box} {color}{name}{RESET}\n")
            
            # Move cursor back up
            sys.stdout.write(f"\033[{len(options)}A")
            sys.stdout.flush()

            key = read_key()
            if key == '\x03': # Ctrl+C
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
            elif key == '\x1b[A': # Up
                cursor = max(0, cursor - 1)
            elif key == '\x1b[B': # Down
                cursor = min(len(options) - 1, cursor + 1)
                
    finally:
        # Move cursor to bottom of menu and restore visibility
        sys.stdout.write(f"\033[{len(options)}B{SHOW_CURSOR}")
        
    return [options[i] for i in sorted(list(selected))]

def prompt_ext_id():
    print(f"\n{CYAN}?{RESET} {BOLD}Enter your Extension ID:{RESET}")
    print(f"{GRAY}(Find this at chrome://extensions or brave://extensions){RESET}")
    sys.stdout.write(f"{CYAN}❯{RESET} ")
    sys.stdout.flush()
    ext_id = input().strip()
    if not ext_id:
        print(f"{RED}Extension ID is required.{RESET}")
        sys.exit(1)
    return ext_id

def install_manifest(browser_name, config_path, host_path, ext_id):
    nm_dir = os.path.join(config_path, "NativeMessagingHosts")
    os.makedirs(nm_dir, exist_ok=True)
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
    
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
        
    print(f"{GREEN}✔{RESET} Installed for {BOLD}{browser_name}{RESET} → {GRAY}{manifest_path}{RESET}")

def main():
    print(f"\n{CYAN}╔══════════════════════════════════════════╗{RESET}")
    print(f"{CYAN}║{RESET}{BOLD}   MV3 — Native Messaging Installer       {RESET}{CYAN}║{RESET}")
    print(f"{CYAN}╚══════════════════════════════════════════╝{RESET}\n")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    host_path = os.path.join(script_dir, "mpv_bridge.py")

    if not os.path.isfile(host_path):
        print(f"{RED}ERROR: mpv_bridge.py not found at: {host_path}{RESET}")
        sys.exit(1)

    # Ensure executable
    os.chmod(host_path, 0o755)
    print(f"{GREEN}✔{RESET} Set executable permissions on mpv_bridge.py\n")

    dirs = get_browser_dirs()
    if not dirs:
        print(f"{RED}No known browser config directories found!{RESET}")
        print(f"Fallback to Chrome default.")
        home = os.path.expanduser("~")
        dirs = [("Google Chrome (Fallback)", f"{home}/.config/google-chrome")]
        selected = dirs
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

    for name, path in selected:
        install_manifest(name, path, host_path, ext_id)

    print(f"\n{CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{RESET}")
    print(f"{GREEN}Done!{RESET} The Native Messaging Host is registered.")
    print("Reload the extension in your browser to apply.\n")

if __name__ == "__main__":
    main()
