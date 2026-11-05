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

if ! command -v git > /dev/null; then
  echo "git missing — installing the Xcode Command Line Tools (a popup will appear; click Install)."
  xcode-select --install 2>/dev/null || true
  echo "Waiting for the tools to finish (this can take a few minutes)..."
  until command -v git > /dev/null; do sleep 10; done
  echo "Command Line Tools ready."
fi

# Make the checkout match origin/main. Fast-forward when possible; when the
# local branch diverged (stale machines), stash stray changes and hard-reset —
# consumers have no authored work to lose, and the stash keeps strays safe.
sync_to_origin() {
  if git -C "$canonical" fetch origin main 2>/dev/null && \
     git -C "$canonical" rev-parse origin/main > /dev/null 2>&1; then
    if git -C "$canonical" merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
      git -C "$canonical" merge --ff-only origin/main 2>/dev/null || git -C "$canonical" reset --hard origin/main
    else
      echo "  local checkout diverged from GitHub — resetting to origin/main (stray changes stashed)"
      git -C "$canonical" stash push -m "auto-stash before sync $(date +%F)" > /dev/null 2>&1 || true
      git -C "$canonical" reset --hard origin/main
    fi
  fi
}

if [ -d "$canonical/.git" ]; then
  echo "Found existing checkout at $canonical — updating."
  sync_to_origin
elif [ -d "$canonical" ] && [ -n "$(ls -A "$canonical" 2>/dev/null)" ]; then
  echo "ERROR: $canonical exists but is not a git checkout, and it is not empty."
  echo "The installer never deletes your files. Either:"
  echo "  1. move the folder aside:  mv $canonical $canonical.old"
  echo "     then re-run this installer, or"
  echo "  2. if the folder is a real clone, run its setup instead:"
  echo "     $canonical/scripts/setup.sh"
  exit 1
else
  mkdir -p "$HOME/Development"
  echo "Installing the standalone labs family to $canonical ..."
  git clone --recurse-submodules "$repo" "$canonical"
fi

exec "$canonical/scripts/setup.sh" "$@"
