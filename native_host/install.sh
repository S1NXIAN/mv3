#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TUI_SCRIPT="$SCRIPT_DIR/installer_tui.py"

if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 is not installed or not in PATH"
    exit 1
fi

if [ ! -f "$TUI_SCRIPT" ]; then
    echo "ERROR: TUI script not found at: $TUI_SCRIPT"
    exit 1
fi

if [ ! -r "$TUI_SCRIPT" ]; then
    echo "ERROR: TUI script is not readable: $TUI_SCRIPT"
    exit 1
fi

chmod +x "$TUI_SCRIPT"

python3 "$TUI_SCRIPT"
