#!/usr/bin/env bash
# Runs the extension in a GNOME Shell without a screen, with its own
# settings, and lets a script drive it and take screenshots.
#
#   tools/headless/run.sh <script> [seconds] [monitor arguments...]
#
# <script> is a file in tools/headless/scripts, without ".js". Screenshots
# and the log go to $MS_OUT (default: a folder in the system's temp).
# MS_WITHOUT=1 runs the shell with the driver alone, for comparing costs.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
export MS_OUT="${MS_OUT:-${TMPDIR:-/tmp}/material-search-headless}"
ENV="$MS_OUT/env"
EXTENSIONS="$ENV/data/gnome-shell/extensions"

mkdir -p "$EXTENSIONS" "$ENV/config" "$ENV/cache" "$MS_OUT/shots"
ln -sfn "$REPO/extension" "$EXTENSIONS/material-search@thomashaiden"
ln -sfn "$HERE/driver" "$EXTENSIONS/material-search-driver@test"
ln -sfn "${XDG_DATA_HOME:-$HOME/.local/share}/fonts" "$ENV/data/fonts"
"$REPO/tools/build.sh"

export MS_REPO="$REPO"
export MS_SCRIPT="$HERE/scripts/$1.js"
export MS_SECONDS="${2:-60}"
shift; shift || true
export MS_MONITORS="${*:---virtual-monitor 1600x1000}"
export XDG_CONFIG_HOME="$ENV/config" XDG_CACHE_HOME="$ENV/cache" XDG_DATA_HOME="$ENV/data" XDG_STATE_HOME="$ENV/state"
export G_MESSAGES_DEBUG=Gjs-Console
export MATERIAL_SEARCH_DEBUG=1
unset WAYLAND_DISPLAY DISPLAY
ENABLED='["material-search@thomashaiden", "material-search-driver@test"]'
if [ "${MS_WITHOUT:-}" = 1 ]; then ENABLED='["material-search-driver@test"]'; fi
export ENABLED

exec dbus-run-session -- bash -c '
gsettings set org.gnome.shell enabled-extensions "$ENABLED"
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell welcome-dialog-last-shown-version "99"
gsettings set org.gnome.desktop.interface color-scheme "${MS_SCHEME:-prefer-dark}"
gsettings set org.gnome.desktop.interface enable-hot-corners false
# A value of the removed "style" key, as an older version left it: it must be ignored.
dconf write /org/gnome/shell/extensions/material-search/style "'"'"'wallpaper'"'"'"
gsettings set org.gnome.desktop.background picture-options none
gsettings set org.gnome.desktop.background color-shading-type solid
gsettings set org.gnome.desktop.background primary-color "#1d2433"
timeout "$MS_SECONDS" gnome-shell --headless $MS_MONITORS --wayland-display ms-test --no-x11 2>&1'
