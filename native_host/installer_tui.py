#!/usr/bin/env python3
"""
Interactive TUI Installer for MV3 Native Messaging Host.
Provides a modern terminal interface to select browser profiles and install the manifest.

Supports Chromium-based and Firefox-based browsers on Linux.
"""

import os
import sys
import json
import re
import tty
import termios
import shutil
import time

# ── ANSI Escape Codes ──────────────────────────────────────────────────

CYAN = "\033[38;2;0;212;255m"
GREEN = "\033[38;2;0;230;118m"
RED = "\033[38;2;255;82;82m"
YELLOW = "\033[38;2;255;213;79m"
GRAY = "\033[38;5;242m"
DIM = "\033[2m"
WHITE = "\033[37m"
BOLD = "\033[1m"
RESET = "\033[0m"

CLEAR_LINE = "\033[2K\r"
HIDE_CURSOR = "\033[?25l"
SHOW_CURSOR = "\033[?25h"

HOST_NAME = "com.mpvbridge.native"

# ── Browser Definitions ────────────────────────────────────────────────

# engine: 'chromium' uses allowed_origins + NativeMessagingHosts/
# engine: 'firefox'  uses allowed_extensions + native-messaging-hosts/

BROWSER_REGISTRY = [
    # Chromium-based
    {"name": "Google Chrome",       "engine": "chromium", "path": "~/.config/google-chrome"},
    {"name": "Google Chrome Beta",  "engine": "chromium", "path": "~/.config/google-chrome-beta"},
    {"name": "Google Chrome Dev",   "engine": "chromium", "path": "~/.config/google-chrome-unstable"},
    {"name": "Chromium",            "engine": "chromium", "path": "~/.config/chromium"},
    {"name": "Ungoogled Chromium",  "engine": "chromium", "path": "~/.config/chromium"},
    {"name": "Brave",               "engine": "chromium", "path": "~/.config/BraveSoftware/Brave-Browser"},
    {"name": "Brave Beta",          "engine": "chromium", "path": "~/.config/BraveSoftware/Brave-Browser-Beta"},
    {"name": "Brave Nightly",       "engine": "chromium", "path": "~/.config/BraveSoftware/Brave-Browser-Nightly"},
    {"name": "Brave Origin Nightly","engine": "chromium", "path": "~/.config/BraveSoftware/Brave-Origin-Nightly"},
    {"name": "Microsoft Edge",      "engine": "chromium", "path": "~/.config/microsoft-edge"},
    {"name": "Microsoft Edge Beta", "engine": "chromium", "path": "~/.config/microsoft-edge-beta"},
    {"name": "Microsoft Edge Dev",  "engine": "chromium", "path": "~/.config/microsoft-edge-dev"},
    {"name": "Vivaldi",             "engine": "chromium", "path": "~/.config/vivaldi"},
    {"name": "Vivaldi Snapshot",    "engine": "chromium", "path": "~/.config/vivaldi-snapshot"},
    {"name": "Opera",               "engine": "chromium", "path": "~/.config/opera"},
    {"name": "Opera Beta",          "engine": "chromium", "path": "~/.config/opera-beta"},
    {"name": "Opera Developer",     "engine": "chromium", "path": "~/.config/opera-developer"},
    {"name": "Thorium",             "engine": "chromium", "path": "~/.config/thorium"},
    # Firefox-based
    {"name": "Firefox",             "engine": "firefox",  "path": "~/.mozilla/native-messaging-hosts"},
    {"name": "Zen Browser",         "engine": "firefox",  "path": "~/.zen/native-messaging-hosts"},
    {"name": "Floorp",              "engine": "firefox",  "path": "~/.floorp/native-messaging-hosts"},
    {"name": "Waterfox",            "engine": "firefox",  "path": "~/.waterfox/native-messaging-hosts"},
]


def get_detected_browsers():
    """Scan the filesystem for installed browsers and return detected entries."""
    detected = []
    seen_paths = set()
    for entry in BROWSER_REGISTRY:
        resolved = os.path.expanduser(entry["path"])
        # For Chromium-based: check if the config dir exists
        # For Firefox-based: the native-messaging-hosts dir may not exist yet,
        # so check the parent dir instead
        if entry["engine"] == "chromium":
            check_path = resolved
        else:
            check_path = os.path.dirname(resolved) if resolved.endswith("native-messaging-hosts") else resolved

        if os.path.isdir(check_path):
            # Deduplicate entries that share the same resolved path
            # (e.g. Ungoogled Chromium and Chromium both use ~/.config/chromium)
            key = (resolved, entry["engine"])
            if key in seen_paths:
                continue
            seen_paths.add(key)
            detected.append({**entry, "resolved_path": resolved})

    return detected


# ── Terminal Utilities ─────────────────────────────────────────────────

def read_key():
    """Read a single keypress from stdin (handles escape sequences)."""
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


def typewriter(text, delay=0.008):
    """Print text with a typewriter effect."""
    for char in text:
        sys.stdout.write(char)
        sys.stdout.flush()
        time.sleep(delay)
    sys.stdout.write("\n")


def print_header():
    """Print the installer banner."""
    print()
    print(f"  {CYAN}┌─────────────────────────────────────────────┐{RESET}")
    print(f"  {CYAN}│{RESET}  {BOLD}MV3 // BRIDGE{RESET}  —  Native Host Installer   {CYAN}│{RESET}")
    print(f"  {CYAN}└─────────────────────────────────────────────┘{RESET}")
    print()


def print_step(number, text):
    """Print a numbered step header."""
    print(f"  {CYAN}[{number}]{RESET} {BOLD}{text}{RESET}")


def print_ok(text):
    """Print a success message."""
    print(f"  {GREEN}✔{RESET}  {text}")


def print_warn(text):
    """Print a warning message."""
    print(f"  {YELLOW}⚠{RESET}  {text}")


def print_err(text):
    """Print an error message."""
    print(f"  {RED}✗{RESET}  {text}")


def print_info(text):
    """Print an info/hint message."""
    print(f"     {GRAY}{text}{RESET}")


# ── Interactive Multi-Select ───────────────────────────────────────────

def interactive_select(options):
    """
    Interactive multi-select menu with arrow keys, space to toggle, enter to confirm.
    options: list of browser dicts
    Returns list of selected browser dicts.
    """
    selected = set(range(len(options)))  # All pre-selected by default
    cursor = 0

    print(f"     {GRAY}↑↓ Navigate   Space Toggle   Enter Confirm   Ctrl+C Abort{RESET}")
    print()

    # Reserve lines for the menu
    for _ in options:
        print()
    sys.stdout.write(f"\033[{len(options)}A")

    sys.stdout.write(HIDE_CURSOR)
    try:
        while True:
            for i, browser in enumerate(options):
                is_active = i == cursor
                is_selected = i in selected
                engine_tag = f"{DIM}[{browser['engine']}]{RESET}" if is_active else ""

                if is_active:
                    prefix = f"  {CYAN}❯ {RESET}"
                else:
                    prefix = "    "

                if is_selected:
                    box = f"{GREEN}◉{RESET}"
                else:
                    box = f"{GRAY}○{RESET}"

                name = f"{BOLD}{browser['name']}{RESET}" if is_active else browser['name']
                sys.stdout.write(f"{CLEAR_LINE}{prefix}{box}  {name} {engine_tag}\n")

            sys.stdout.write(f"\033[{len(options)}A")
            sys.stdout.flush()

            key = read_key()
            if key == '\x03':  # Ctrl+C
                sys.stdout.write(f"\033[{len(options)}B{SHOW_CURSOR}\n")
                print(f"  {RED}Aborted.{RESET}")
                sys.exit(1)
            elif key in ('\r', '\n'):
                break
            elif key == ' ':
                if cursor in selected:
                    selected.discard(cursor)
                else:
                    selected.add(cursor)
            elif key == 'a':  # Select all
                if len(selected) == len(options):
                    selected.clear()
                else:
                    selected = set(range(len(options)))
            elif key == '\x1b[A':  # Up
                cursor = max(0, cursor - 1)
            elif key == '\x1b[B':  # Down
                cursor = min(len(options) - 1, cursor + 1)

    finally:
        # Move cursor past the menu and restore
        sys.stdout.write(f"\033[{len(options)}B{SHOW_CURSOR}")

    return [options[i] for i in sorted(selected)]


# ── Extension ID Prompt ────────────────────────────────────────────────

def is_valid_chromium_ext_id(ext_id):
    """Validate Chrome extension ID format (32 lowercase alpha chars)."""
    return bool(re.match(r'^[a-p]{32}$', ext_id))


def prompt_ext_id(engine):
    """Prompt for extension/add-on ID based on engine type."""
    if engine == "firefox":
        # Firefox add-ons use a different ID format
        print_info("Firefox add-on IDs look like: {xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}")
        print_info("or a string like: mv3-bridge@example.com")
        print()

        while True:
            sys.stdout.write(f"  {CYAN}❯{RESET} ")
            sys.stdout.flush()
            addon_id = input().strip()

            if not addon_id:
                print_err("Add-on ID is required.")
                continue

            return addon_id
    else:
        print_info("Find this at chrome://extensions with Developer Mode enabled.")
        print_info("Example: abcdefghijklmnopabcdefghijklmnop")
        print()

        while True:
            sys.stdout.write(f"  {CYAN}❯{RESET} ")
            sys.stdout.flush()
            ext_id = input().strip()

            if not ext_id:
                print_err("Extension ID is required.")
                continue

            if not is_valid_chromium_ext_id(ext_id):
                print_err("Invalid format. Expected 32 lowercase letters (a-p).")
                retry = input(f"     {GRAY}Retry? [Y/n]:{RESET} ").strip().lower()
                if retry not in ('y', 'yes', ''):
                    sys.exit(1)
                continue

            return ext_id


# ── Manifest Installation ──────────────────────────────────────────────

def build_manifest(engine, host_path, ext_id):
    """Build the native messaging host manifest JSON for the given engine."""
    manifest = {
        "name": HOST_NAME,
        "description": "MV3 Native Messaging Host — browser-to-mpv relay",
        "path": host_path,
        "type": "stdio",
    }

    if engine == "chromium":
        manifest["allowed_origins"] = [f"chrome-extension://{ext_id}/"]
    else:
        manifest["allowed_extensions"] = [ext_id]

    return manifest


def install_manifest(browser, host_path, ext_id):
    """Install the native messaging host manifest for a single browser."""
    engine = browser["engine"]
    resolved = browser["resolved_path"]

    if engine == "chromium":
        nm_dir = os.path.join(resolved, "NativeMessagingHosts")
    else:
        # For Firefox-based, resolved_path already points to native-messaging-hosts/
        nm_dir = resolved

    try:
        os.makedirs(nm_dir, exist_ok=True)
    except PermissionError:
        print_err(f"Permission denied: {nm_dir}")
        return False

    manifest_path = os.path.join(nm_dir, f"{HOST_NAME}.json")
    manifest = build_manifest(engine, host_path, ext_id)

    # Check for existing manifest
    if os.path.isfile(manifest_path):
        try:
            with open(manifest_path, 'r') as f:
                existing = json.load(f)
            if existing == manifest:
                print_ok(f"{browser['name']} — already up to date")
                print_info(f"→ {manifest_path}")
                return True
        except (json.JSONDecodeError, IOError):
            pass  # Overwrite corrupt manifests

    try:
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
            f.write('\n')
    except IOError as e:
        print_err(f"Failed to write manifest: {e}")
        return False

    print_ok(f"{browser['name']} — installed")
    print_info(f"→ {manifest_path}")
    return True


# ── Uninstall ──────────────────────────────────────────────────────────

def uninstall_manifests():
    """Remove all installed MV3 native messaging host manifests."""
    removed = 0
    for entry in BROWSER_REGISTRY:
        resolved = os.path.expanduser(entry["path"])
        if entry["engine"] == "chromium":
            manifest_path = os.path.join(resolved, "NativeMessagingHosts", f"{HOST_NAME}.json")
        else:
            manifest_path = os.path.join(resolved, f"{HOST_NAME}.json")

        if os.path.isfile(manifest_path):
            try:
                os.remove(manifest_path)
                print_ok(f"Removed: {manifest_path}")
                removed += 1
            except OSError as e:
                print_err(f"Failed to remove {manifest_path}: {e}")

    if removed == 0:
        print_info("No installed manifests found.")
    else:
        print()
        print_ok(f"Removed {removed} manifest(s).")


# ── Main Flow ──────────────────────────────────────────────────────────

def main():
    print_header()

    # ── Preflight checks ──

    print_step(1, "Preflight checks")
    print()

    # Check python3
    if not shutil.which('python3'):
        print_err("python3 not found in PATH")
        sys.exit(1)
    print_ok("python3 found")

    # Check mpv
    mpv_bin = shutil.which('mpv')
    if mpv_bin:
        print_ok(f"mpv found at {mpv_bin}")
    else:
        print_warn("mpv not found in PATH — install it before using the extension")

    # Check yt-dlp
    ytdlp_bin = shutil.which('yt-dlp')
    if ytdlp_bin:
        print_ok(f"yt-dlp found at {ytdlp_bin}")
    else:
        print_warn("yt-dlp not found in PATH — required for YouTube and most video sites")

    # Locate and prepare host script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    host_path = os.path.join(script_dir, "mpv_bridge.py")

    if not os.path.isfile(host_path):
        print_err(f"mpv_bridge.py not found at: {host_path}")
        sys.exit(1)

    os.chmod(host_path, 0o755)
    print_ok("mpv_bridge.py is executable")
    print()

    # ── Check for --uninstall flag ──

    if '--uninstall' in sys.argv:
        print_step(2, "Uninstalling manifests")
        print()
        uninstall_manifests()
        print()
        return

    # ── Detect browsers ──

    print_step(2, "Detecting browsers")
    print()

    detected = get_detected_browsers()

    if not detected:
        print_err("No supported browser configurations found!")
        print()
        print_info("Supported browsers:")
        for entry in BROWSER_REGISTRY:
            resolved = os.path.expanduser(entry["path"])
            print_info(f"  • {entry['name']} — {resolved}")
        print()
        print_info("If your browser uses a custom config path, create the")
        print_info("NativeMessagingHosts directory manually and re-run.")
        sys.exit(1)

    for b in detected:
        engine_label = f"{DIM}({b['engine']}){RESET}"
        print_ok(f"{b['name']} {engine_label}")
    print()

    # ── Browser selection ──

    print_step(3, "Select browsers to install")
    print()

    if len(detected) == 1:
        browser = detected[0]
        sys.stdout.write(f"     Install for {BOLD}{browser['name']}{RESET}? [Y/n] ")
        sys.stdout.flush()
        ans = input().strip().lower()
        if ans not in ('', 'y', 'yes'):
            print_err("Aborted.")
            sys.exit(0)
        selected = detected
    else:
        selected = interactive_select(detected)
        if not selected:
            print_err("No browsers selected. Aborted.")
            sys.exit(0)

    print()

    # ── Group by engine for extension ID prompts ──

    chromium_browsers = [b for b in selected if b["engine"] == "chromium"]
    firefox_browsers = [b for b in selected if b["engine"] == "firefox"]

    print_step(4, "Extension / Add-on ID")
    print()

    chromium_ext_id = None
    firefox_ext_id = None

    if chromium_browsers:
        names = ", ".join(b["name"] for b in chromium_browsers)
        print(f"     {BOLD}Chromium ID{RESET} (for {names}):")
        chromium_ext_id = prompt_ext_id("chromium")
        print()

    if firefox_browsers:
        names = ", ".join(b["name"] for b in firefox_browsers)
        print(f"     {BOLD}Firefox Add-on ID{RESET} (for {names}):")
        firefox_ext_id = prompt_ext_id("firefox")
        print()

    # ── Install manifests ──

    print_step(5, "Installing manifests")
    print()

    success_count = 0
    for browser in selected:
        ext_id = chromium_ext_id if browser["engine"] == "chromium" else firefox_ext_id
        if install_manifest(browser, host_path, ext_id):
            success_count += 1

    print()

    if success_count == 0:
        print_err("Failed to install to any browsers.")
        sys.exit(1)

    # ── Summary ──

    print(f"  {CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{RESET}")
    print(f"  {GREEN}{BOLD}Done!{RESET} Installed to {success_count}/{len(selected)} browser(s).")
    print()
    print_info("Next steps:")
    print_info("  1. Reload the extension in your browser")
    print_info("  2. Open the extension options → click [ PING NATIVE HOST ]")
    print_info("  3. If it shows ✓ CONNECTED, you're all set!")
    print()
    print_info(f"To uninstall: python3 {os.path.basename(__file__)} --uninstall")
    print()


if __name__ == "__main__":
    main()
