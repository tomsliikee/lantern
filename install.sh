#!/usr/bin/env bash
# Links the extension into GNOME Shell for the current user and enables it.
# Run it again after moving the repository; updating is a plain "git pull"
# followed by this script, which builds the schema and the translations.
set -euo pipefail

UUID="material-search@thomashaiden"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
FONT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/fonts"
FONTS="$REPO/insights-mono/fonts"

command -v gjs >/dev/null || { echo "gjs is missing; it ships with GNOME Shell." >&2; exit 1; }
command -v glib-compile-schemas >/dev/null || { echo "glib-compile-schemas is missing; it ships with GLib." >&2; exit 1; }

"$REPO/tools/build.sh"

if [ -e "$TARGET" ] && [ ! -L "$TARGET" ]; then
    echo "$TARGET exists and is not a link. Move it away first." >&2
    exit 1
fi
mkdir -p "$(dirname "$TARGET")"
ln -sfn "$REPO/extension" "$TARGET"
echo "Linked $TARGET"

# Inter for the text, Geist Serif for the statements. Without them the panel
# still draws, in the system's sans-serif and serif.
families="$(fc-list : family)"
if ! grep -Eq "(^|,)Inter(,|$)" <<<"$families" || ! grep -Eq "(^|,)Geist Serif(,|$)" <<<"$families"; then
    mkdir -p "$FONT_DIR"
    cp "$FONTS"/*.ttf "$FONT_DIR/"
    fc-cache -f "$FONT_DIR"
    echo "Installed Inter and Geist Serif to $FONT_DIR"
fi

# Written to the setting directly: the running shell only learns about a new
# extension at the next login, and "gnome-extensions enable" fails until then.
enabled="$(gsettings get org.gnome.shell enabled-extensions)"
if [[ "$enabled" != *"'$UUID'"* ]]; then
    if [[ "$enabled" == "@as []" || "$enabled" == "[]" ]]; then
        gsettings set org.gnome.shell enabled-extensions "['$UUID']"
    else
        gsettings set org.gnome.shell enabled-extensions "${enabled%]}, '$UUID']"
    fi
fi
echo "Enabled. Log out and back in to load it."
