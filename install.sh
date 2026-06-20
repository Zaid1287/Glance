#!/bin/sh
# Glance — Mac menu-bar agent installer.
#   curl -fsSL https://raw.githubusercontent.com/Zaid1287/Glance-app/main/install.sh | sh
#
# Downloads the latest release binaries, installs them to ~/.glance/bin, sets the
# agent to start at login, and launches it. No Apple account needed — the binary
# is unsigned, so we clear the download quarantine so macOS will run it.
set -eu

REPO="Zaid1287/Glance-app"
DEST="$HOME/.glance/bin"
ASSET="glance-macos-arm64.zip"
URL="https://github.com/$REPO/releases/latest/download/$ASSET"

say() { printf '\033[1;34m▸\033[0m %s\n' "$1"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "Glance is macOS-only."
[ "$(uname -m)" = "arm64" ] || die "This installer is Apple-silicon only for now. Build from source for Intel: https://github.com/$REPO"

say "Downloading Glance…"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$URL" -o "$tmp/$ASSET" || die "Download failed ($URL). Has a release been published yet?"

say "Installing to $DEST"
mkdir -p "$DEST"
unzip -oq "$tmp/$ASSET" -d "$DEST"
chmod +x "$DEST"/glance "$DEST"/glance-bar 2>/dev/null || true

# Unsigned binary: clear the quarantine flag so Gatekeeper allows it to run.
# A notarized release passes Gatekeeper on its own — run with GLANCE_NOTARIZED=1
# to skip this strip.
if [ "${GLANCE_NOTARIZED:-0}" != "1" ]; then
  xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
fi

# Put the CLI on PATH if we can; otherwise print a hint.
if ln -sf "$DEST/glance" /usr/local/bin/glance 2>/dev/null; then
  say "Linked 'glance' into /usr/local/bin"
else
  say "Add to your PATH:  export PATH=\"\$HOME/.glance/bin:\$PATH\""
fi

say "Enabling start-at-login + launching the menu-bar app…"
"$DEST/glance-bar" --install-agent >/dev/null 2>&1 || true

printf '\n\033[1;32m✓ Glance is installed.\033[0m\n'
printf '  Look for the gauge icon in your menu bar → click it → Copy pairing key.\n'
printf '  Then paste that key into the Glance iPhone app to pair.\n'
printf '  macOS may ask to allow Local Network access — allow it so your phone can connect.\n\n'
