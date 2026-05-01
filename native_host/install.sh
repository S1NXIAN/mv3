#!/bin/bash
# ─────────────────────────────────────────────────────────
# MV3 — Native Messaging Host Installer Wrapper
# ─────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TUI_SCRIPT="$SCRIPT_DIR/installer_tui.py"

# Make sure Python script exists
if [ ! -f "$TUI_SCRIPT" ]; then
    echo "ERROR: TUI script not found at: $TUI_SCRIPT"
    exit 1
fi

# Make python scripts executable just in case
chmod +x "$TUI_SCRIPT"

# Run the interactive python TUI
python3 "$TUI_SCRIPT"
