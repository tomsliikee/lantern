#!/usr/bin/env bash
# Builds what is not kept in git: the compiled settings schema and the
# compiled translations. The stylesheet and tokens are kept in git and
# rebuilt with "node tools/build-tokens.js" after a change to the template.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
glib-compile-schemas --strict "$REPO/extension/schemas"
if command -v msgfmt >/dev/null; then
    for po in "$REPO"/po/*.po; do
        lang="$(basename "$po" .po)"
        mkdir -p "$REPO/extension/locale/$lang/LC_MESSAGES"
        msgfmt -o "$REPO/extension/locale/$lang/LC_MESSAGES/material-search.mo" "$po"
    done
else
    echo "msgfmt is missing (gettext); the launcher stays in English." >&2
fi
