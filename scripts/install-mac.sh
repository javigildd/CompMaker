#!/usr/bin/env bash
#
# CompMaker — macOS dev install
# Symlinks this project into the CEP extensions folder and enables debug mode,
# so edits in the repo are reflected live in After Effects (no copying).
#
set -euo pipefail

EXT_ID="com.compmaker"
# Project root = parent of this script's directory.
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$DEST_DIR/$EXT_ID"

echo "CompMaker → installing dev symlink"
echo "  source: $SRC"
echo "  target: $DEST"

mkdir -p "$DEST_DIR"

if [ -L "$DEST" ]; then
    echo "  removing existing symlink"
    rm "$DEST"
elif [ -e "$DEST" ]; then
    echo "ERROR: $DEST already exists and is not a symlink. Move or delete it first."
    exit 1
fi

ln -s "$SRC" "$DEST"
echo "  symlink created ✔"

# Enable PlayerDebugMode for the CEP versions AE is likely to use.
echo "Enabling PlayerDebugMode (unsigned extensions)…"
for v in 9 10 11 12; do
    defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 2>/dev/null || true
done
echo "  done ✔"

echo
echo "All set. Restart After Effects, then open:"
echo "  Window → Extensions → CompMaker"
