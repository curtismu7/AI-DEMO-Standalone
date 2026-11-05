#!/usr/bin/env bash
# install.sh — the one-liner entry for a machine that has NOTHING.
#
#   curl -fsSL https://raw.githubusercontent.com/curtismu7/AI-DEMO-Standalone/main/scripts/install.sh | bash
#
# Needs only git. Clones the family to ~/Development/AI-DEMO-Standalone
# (unless it's already there) and hands off to scripts/setup.sh.
set -eu
canonical="$HOME/Development/AI-DEMO-Standalone"
repo="https://github.com/curtismu7/AI-DEMO-Standalone.git"

command -v git > /dev/null || {
  echo "git is required. On macOS run:  xcode-select --install"
  exit 1
}

if [ -d "$canonical/.git" ]; then
  echo "Found existing checkout at $canonical — updating (fast-forward only)."
  git -C "$canonical" pull --ff-only origin main 2>/dev/null || \
    echo "(could not fast-forward — continuing with the local state)"
else
  mkdir -p "$HOME/Development"
  echo "Installing the standalone labs family to $canonical ..."
  git clone --recurse-submodules "$repo" "$canonical"
fi

exec "$canonical/scripts/setup.sh" "$@"
