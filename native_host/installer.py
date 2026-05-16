#!/usr/bin/env python3
"""Install the MPV Bridge native host for Chromium-based browsers."""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
import termios
import tty
from dataclasses import dataclass
from typing import List


HOST_NAME = "com.mpvbridge.native"
COLOR_RED = "\033[38;2;255;82;82m"
COLOR_GREEN = "\033[38;2;0;230;118m"
COLOR_BLUE = "\033[38;2;0;212;255m"
COLOR_DIM = "\033[38;5;242m"
COLOR_CYAN = "\033[38;2;0;190;255m"
RESET = "\033[0m"
CURSOR_HIDE = "\033[?25l"
CURSOR_SHOW = "\033[?25h"
CLEAR_SCREEN = "\033[2J\033[H"
CLEAR_LINE = "\033[2K\r"
CURSOR_UP = "\033[{}A"
CURSOR_DOWN = "\033[{}B"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

EXTENSION_ID_RE = re.compile(r"^[a-p]{32}$")


@dataclass
class Browser:
    name: str
    engine: str
    config_path: str

    def resolved_path(self) -> str:
        return os.path.expanduser(self.config_path)

    def manifest_path(self) -> str:
        return os.path.join(
            self.resolved_path(), "NativeMessagingHosts", f"{HOST_NAME}.json"
        )


BROWSERS: List[Browser] = [
    Browser("Brave Origin Nightly", "chromium", "~/.config/BraveSoftware/Brave-Origin-Nightly"),
    Browser("Chromium", "chromium", "~/.config/chromium"),
]

if not BROWSERS:
    sys.exit("error: BROWSERS list is empty — no browsers configured")

for browser in BROWSERS:
    if not browser.name or not browser.engine or not browser.config_path:
        sys.exit(f"error: BROWSERS entry has missing field(s): {browser}")


# ── Terminal helpers ──────────────────────────────────────────────────────────


def clear() -> None:
    sys.stdout.write(CLEAR_SCREEN)


def show_cursor() -> None:
    sys.stdout.write(CURSOR_SHOW)


def section(title: str) -> None:
    print(f"\n{COLOR_CYAN}{title}{RESET}\n")


def ok(message: str) -> None:
    print(f"  {COLOR_GREEN}✔{RESET} {message}")


def info(message: str) -> None:
    print(f"  {COLOR_DIM}{message}{RESET}")


def fail(message: str) -> None:
    print(f"\n  {COLOR_RED}✗{RESET} {message}\n", file=sys.stderr)
    sys.exit(1)


def confirm(prompt: str, default: bool = True) -> bool:
    hint = "[Y/n]" if default else "[y/N]"
    raw = input(f"  {COLOR_DIM}{prompt} {hint}: {RESET}").strip().lower()
    if default:
        return raw in ("y", "yes", "")
    return raw in ("y", "yes")


# ── Raw-key input ─────────────────────────────────────────────────────────────


def _read_raw() -> str:
    fd = sys.stdin.fileno()
    attrs = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        ch = sys.stdin.read(1)
        if ch == "\x1b":
            ch += sys.stdin.read(2)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, attrs)
    return ch


# ── Browser detection ─────────────────────────────────────────────────────────


def detect_installed_browsers() -> List[Browser]:
    return [
        b for b in BROWSERS if os.path.isdir(b.resolved_path())
    ]


# ── Pre-flight checks ─────────────────────────────────────────────────────────


def run_preflight() -> tuple[List[Browser], str]:
    section("Pre-flight")

    for exe in ("python3", "mpv", "yt-dlp"):
        path = shutil.which(exe)
        if not path:
            fail(f"{exe} not found")
        ok(f"{exe}: {path}")

    host_script = os.path.join(SCRIPT_DIR, "mpv_bridge.py")
    if not os.path.isfile(host_script):
        fail("mpv_bridge.py not found")
    try:
        os.chmod(host_script, 0o755)
    except OSError as exc:
        fail(f"chmod failed on mpv_bridge.py: {exc}")
    ok("native host script")

    browsers = detect_installed_browsers()
    if not browsers:
        fail("No supported browsers found")
    ok(f"{len(browsers)} browser(s) detected")

    return browsers, host_script


# ── Interactive browser picker ────────────────────────────────────────────────


def _handle_menu_key(
    key: str,
    cursor: int,
    selected: set[int],
    count: int,
) -> tuple[bool, bool, int, set[int]]:
    """Returns (aborted, confirmed, cursor, selected)."""
    if key == "\x03":
        return (True, False, cursor, selected)
    if key in ("\r", "\n"):
        return (False, True, cursor, selected)
    if key == " ":
        selected = selected ^ {cursor}
    elif key == "a":
        selected = set(range(count)) if len(selected) != count else set()
    elif key == "\x1b[A":
        cursor = max(0, cursor - 1)
    elif key == "\x1b[B":
        cursor = min(count - 1, cursor + 1)
    return (False, False, cursor, selected)


def _draw_menu(browsers: List[Browser], cursor: int, selected: set) -> None:
    n = len(browsers)
    for i, b in enumerate(browsers):
        prefix = f"  {COLOR_CYAN}›{RESET} " if i == cursor else "    "
        box = f"{COLOR_GREEN}◉{RESET}" if i in selected else f"{COLOR_DIM}○{RESET}"
        tag = f"  {COLOR_CYAN}[{b.engine}]{RESET}" if i == cursor else ""
        sys.stdout.write(f"{CLEAR_LINE}{prefix}{box}  {b.name}{tag}\n")
    sys.stdout.write(CURSOR_UP.format(n))
    sys.stdout.flush()


def pick_browsers(browsers: List[Browser]) -> List[Browser]:
    if not browsers:
        fail("No browsers to select")
    if len(browsers) == 1:
        info(f"Found: {browsers[0].name}")
        return browsers if confirm("Install?", True) else []

    count = len(browsers)
    selected = set(range(count))
    cursor = 0

    info("\u2191\u2195 Move  Space Toggle  Enter Confirm")
    print()
    for _ in range(count + 1):
        print()
    sys.stdout.write(CURSOR_UP.format(count + 1))
    sys.stdout.write(CURSOR_HIDE)

    aborted = False
    try:
        while True:
            _draw_menu(browsers, cursor, selected)
            aborted, confirmed, cursor, selected = _handle_menu_key(
                _read_raw(), cursor, selected, count
            )
            if aborted or confirmed:
                break
    finally:
        sys.stdout.write(CURSOR_DOWN.format(count + 1))
        sys.stdout.write(CURSOR_SHOW)
        sys.stdout.flush()

    if aborted:
        print(f"  {COLOR_RED}Aborted{RESET}")
        sys.exit(1)

    return [browsers[i] for i in sorted(selected)]


# ── Extension ID prompt ───────────────────────────────────────────────────────


def prompt_extension_id() -> str:
    section("Extension ID")
    info("Get from: chrome://extensions \u2192 Developer Mode")
    print()

    while True:
        sys.stdout.write(f"  {COLOR_CYAN}\u203a{RESET} ")
        sys.stdout.flush()
        ext_id = input().strip()

        if not ext_id:
            fail("Extension ID required")

        if not EXTENSION_ID_RE.match(ext_id):
            print(f"  {COLOR_RED}Invalid extension ID{RESET}")
            if not confirm("Retry?", False):
                fail("Aborted")
            continue

        return ext_id


# ── Installation ──────────────────────────────────────────────────────────────


def _build_manifest(host_path: str, ext_id: str) -> dict:
    return {
        "name": HOST_NAME,
        "path": host_path,
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{ext_id}/"],
    }


def _is_current_manifest(manifest_file: str, manifest: dict) -> bool:
    try:
        with open(manifest_file) as f:
            return json.load(f) == manifest
    except (json.JSONDecodeError, OSError):
        return False


def install_for_browser(browser: Browser, host_path: str, ext_id: str) -> None:
    browser_dir = browser.resolved_path()
    if not os.path.isdir(browser_dir):
        fail(f"Browser config directory not found: {browser_dir}")

    manifest_dir = os.path.join(browser_dir, "NativeMessagingHosts")

    try:
        os.makedirs(manifest_dir, exist_ok=True)
    except PermissionError:
        fail(f"Permission denied: {manifest_dir}")

    manifest = _build_manifest(host_path, ext_id)
    manifest_file = browser.manifest_path()

    if os.path.isfile(manifest_file) and _is_current_manifest(manifest_file, manifest):
        ok(f"{browser.name} \u2014 up to date")
        return

    try:
        with open(manifest_file, "w") as f:
            json.dump(manifest, f, indent=2)
            f.write("\n")
    except OSError as exc:
        fail(f"Write failed: {exc}")

    ok(f"{browser.name} \u2014 installed")


# ── Uninstall ─────────────────────────────────────────────────────────────────


def uninstall_all() -> None:
    section("Uninstall")

    found: List[str] = []
    for b in BROWSERS:
        mp = b.manifest_path()
        if os.path.isfile(mp):
            found.append(mp)

    if not found:
        info("Nothing to remove")
        return

    for path in found:
        info(f"\u2022 {path}")

    print()
    if not confirm(f"Remove {len(found)} manifest(s)?", False):
        info("Aborted")
        return

    for path in found:
        try:
            os.remove(path)
            ok(f"Removed: {path}")
        except OSError as exc:
            fail(f"Failed to remove {path}: {exc}")


# ── Entry point ───────────────────────────────────────────────────────────────


def main() -> None:
    clear()
    show_cursor()

    if "--uninstall" in sys.argv:
        uninstall_all()
        return

    browsers, host_path = run_preflight()

    section("Select Browsers")
    selected = pick_browsers(browsers)
    if not selected:
        fail("No browsers selected")

    ext_id = prompt_extension_id()

    section("Installing")
    print()
    for b in selected:
        install_for_browser(b, host_path, ext_id)
    print()
    ok(f"Done \u2014 {len(selected)} browser(s)")
    print()
    info("Next: reload extension \u2192 open options \u2192 ping host")


if __name__ == "__main__":
    main()
