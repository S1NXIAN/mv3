#!/usr/bin/env bash
set -euo pipefail
umask 077

HOST_NAME="com.mpvbridge.native"
HOST_SCRIPT="$(cd "$(dirname "$0")" && pwd)/mpv_bridge.py"

R="\033[38;2;255;82;82m"
G="\033[38;2;0;230;118m"
B="\033[38;2;0;212;255m"
D="\033[38;2;140;140;140m"
W="\033[0m"
BOLD="\033[1m"

announce() { printf "\n  ${B}%s${W}\n" "$1"; }
ok()       { printf "  ${G}✓${W} %s\n" "$1"; }
info()     { printf "  ${D}%s${W}\n" "$1"; }
warn()     { printf "  ${R}✗${W} ${BOLD}%s${W}\n" "$1" >&2; }
die()      { warn "$1"; exit 1; }
sep()      { printf "\n  ${D}─────────────────────────────────────${W}\n\n"; }

#─────────────────────────────────────────────────────────────────
# UNINSTALL
#─────────────────────────────────────────────────────────────────
uninstall_all() {
  announce "Uninstalling"

  define_browser() { :; } # no-op during uninstall — we scan manifests directly
  source_browser_list

  found=0
  for cfg in "${BROWSER_PATHS[@]}"; do
    m="$cfg/NativeMessagingHosts/$HOST_NAME.json"
    if [ -f "$m" ]; then
      found=$((found + 1))
      info "$m"
    fi
  done

  [ "$found" -eq 0 ] && { info "Nothing to remove"; exit 0; }

  sep
  printf "  ${D}Remove ${found} manifest(s)? [y/N]:${W} "
  read -r confirm
  case "$confirm" in
    y|Y|yes)
      for cfg in "${BROWSER_PATHS[@]}"; do
        m="$cfg/NativeMessagingHosts/$HOST_NAME.json"
        [ -f "$m" ] && rm "$m" && ok "Removed: $(basename "$(dirname "$m")")"
      done
      ;;
    *) info "Aborted" ;;
  esac
  exit 0
}

#─────────────────────────────────────────────────────────────────
# BROWSER DETECTION
#─────────────────────────────────────────────────────────────────
source_browser_list() {
  BROWSER_NAMES=()
  BROWSER_PATHS=()

  define_browser() {
    local name="$1" cfg="$2"
    cfg="${cfg/#\~/$HOME}"
    [ -d "$cfg" ] || return 0
    BROWSER_NAMES+=("$name")
    BROWSER_PATHS+=("$cfg")
  }

  define_browser "Google Chrome"        "$HOME/.config/google-chrome"
  define_browser "Chrome Beta"          "$HOME/.config/google-chrome-beta"
  define_browser "Chrome Dev"           "$HOME/.config/google-chrome-unstable"
  define_browser "Chromium"             "$HOME/.config/chromium"
  define_browser "Brave"                "$HOME/.config/BraveSoftware/Brave-Browser"
  define_browser "Brave Beta"           "$HOME/.config/BraveSoftware/Brave-Browser-Beta"
  define_browser "Brave Nightly"        "$HOME/.config/BraveSoftware/Brave-Browser-Nightly"
  define_browser "Brave Origin"         "$HOME/.config/BraveSoftware/Brave-Origin"
  define_browser "Brave Origin Nightly" "$HOME/.config/BraveSoftware/Brave-Origin-Nightly"
  define_browser "Microsoft Edge"       "$HOME/.config/microsoft-edge"
  define_browser "Edge Beta"            "$HOME/.config/microsoft-edge-beta"
  define_browser "Edge Dev"             "$HOME/.config/microsoft-edge-dev"
  define_browser "Vivaldi"              "$HOME/.config/vivaldi"
  define_browser "Opera"                "$HOME/.config/opera"
  define_browser "Opera GX"             "$HOME/.config/opera-gx"
}

#─────────────────────────────────────────────────────────────────
# ENTRY POINT
#─────────────────────────────────────────────────────────────────
case "${1:-}" in
  --uninstall|-u) uninstall_all ;;
  [a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p][a-p])
    ext_id="$1"
    goto_install=true
    ;;
esac

printf "\n"
printf "  ${BOLD}${B}MV3 BRIDGE — Native Host Installer${W}\n"
printf "  ${D}Registers mpv_bridge.py with your browser${W}\n"
printf "\n"

#───────────────────────────────────────
# PREREQUISITES
#───────────────────────────────────────
announce "Checking prerequisites"

missing=""
for cmd in python3 mpv yt-dlp; do
  if command -v "$cmd" &>/dev/null; then
    ok "$cmd — $(command -v "$cmd")"
  else
    warn "$cmd — not found"
    missing+=" $cmd"
  fi
done

[ -f "$HOST_SCRIPT" ] && ok "mpv_bridge.py" || die "mpv_bridge.py not found alongside this script"

[ -n "$missing" ] && die "Install missing tools:${missing}"

chmod +x "$HOST_SCRIPT" 2>/dev/null || true

#───────────────────────────────────────
# DETECT
#───────────────────────────────────────
announce "Detecting browsers"
source_browser_list

if [ ${#BROWSER_NAMES[@]} -eq 0 ]; then
  die "No supported browsers found in ~/.config/"
fi

printf "\n"
for i in "${!BROWSER_NAMES[@]}"; do
  printf "  ${D}%2d)${W} %s\n" $((i+1)) "${BROWSER_NAMES[$i]}"
done
sep

#───────────────────────────────────────
# SELECT
#───────────────────────────────────────
announce "Select browsers to install for"

printf "  ${D}Enter numbers separated by space (e.g. 1 3 5), or 'a' for all:${W}\n\n"
printf "  ${B}›${W} "
read -r raw

selected=()
if [ "$raw" = "a" ] || [ "$raw" = "A" ]; then
  for i in "${!BROWSER_NAMES[@]}"; do selected+=("$i"); done
else
  for token in $raw; do
    idx=$((token - 1))
    [ "$idx" -ge 0 ] && [ "$idx" -lt "${#BROWSER_NAMES[@]}" ] && selected+=("$idx")
  done
fi

[ ${#selected[@]} -eq 0 ] && die "No browsers selected"

printf "\n  ${D}Selected:${W}"
for i in "${selected[@]}"; do printf " ${G}${BROWSER_NAMES[$i]}${W}"; done
printf "\n\n"

#───────────────────────────────────────
# EXTENSION ID
#───────────────────────────────────────
if [ "${goto_install:-false}" = "true" ] && [ -n "${ext_id:-}" ]; then
  announce "Extension ID (from CLI arg)"
  ok "$ext_id"
else
  announce "Extension ID"

  printf "  ${D}Open${W} chrome://extensions ${D}→ enable Developer Mode${W}\\n"
  printf "  ${D}Copy the 32-character ID (letters a—p only)${W}\\n\\n"

  while true; do
    printf "  ${B}›${W} "
    read -r ext_id
    ext_id="${ext_id// /}"
    [ -z "$ext_id" ] && die "Extension ID required"

    if echo "$ext_id" | grep -qP '^[a-p]{32}$'; then
      break
    fi

    warn "Invalid — must be 32 chars, letters a–p only"
    printf "  ${D}Retry? [Y/n]:${W} "
    read -r retry
    case "$retry" in
      n|N|no) die "Aborted" ;;
    esac
  done
fi

#───────────────────────────────────────
# INSTALL
#───────────────────────────────────────
announce "Installing"

errors=0
for i in "${selected[@]}"; do
  name="${BROWSER_NAMES[$i]}"
  cfg="${BROWSER_PATHS[$i]}"
  manifest_dir="$cfg/NativeMessagingHosts"
  manifest_file="$manifest_dir/$HOST_NAME.json"

  mkdir -p "$manifest_dir" 2>/dev/null || {
    warn "$name — permission denied ($manifest_dir)"
    errors=$((errors + 1))
    continue
  }

  cat > "$manifest_file" << EOF
{
  "name": "$HOST_NAME",
  "description": "MV3 Native Messaging Host — browser-to-mpv relay",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$ext_id/"]
}
EOF

  ok "$name"
done

sep

[ "$errors" -gt 0 ] && warn "$errors browser(s) failed — check permissions above" && sep

printf "  ${G}${BOLD}✓ Installation complete${W}\n\n"
printf "  ${D}Next steps:${W}\n"
printf "  ${D}  1. Reload the extension at chrome://extensions${W}\n"
printf "  ${D}  2. Open extension options → [ PING NATIVE HOST ]${W}\n"
printf "  ${D}  3. Expected: ✓ CONNECTED${W}\n\n"
