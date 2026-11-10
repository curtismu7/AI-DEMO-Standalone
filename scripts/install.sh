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
# Every failure is loud: a fetch or reset that fails must abort the install,
# never silently leave a stale tree behind (that is how setup.sh "went missing").
sync_to_origin() {
  echo "  fetching origin/main ..."
  if ! git -C "$canonical" fetch origin main; then
    echo "ERROR: could not fetch from $repo" >&2
    echo "Check network/GitHub access, or run manually:" >&2
    echo "  cd $canonical && git fetch origin main" >&2
    exit 1
  fi
  if ! git -C "$canonical" rev-parse origin/main > /dev/null 2>&1; then
    echo "ERROR: origin/main not found after fetch — remote repo may be missing or private." >&2
    exit 1
  fi
  if git -C "$canonical" merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
    if ! git -C "$canonical" merge --ff-only origin/main 2>/dev/null; then
      echo "  fast-forward failed — hard-resetting to origin/main"
      git -C "$canonical" reset --hard origin/main
    fi
  else
    echo "  local checkout diverged from GitHub — resetting to origin/main (stray changes stashed)"
    git -C "$canonical" stash push -m "auto-stash before sync $(date +%F)" > /dev/null 2>&1 || true
    git -C "$canonical" reset --hard origin/main
    # reset --hard updates .gitmodules but git does NOT re-read submodule URLs from it;
    # a checkout predating the ping-sandbox -> curtismu7 migration keeps fetching the
    # dead repo. sync re-reads every URL from the fresh .gitmodules.
    git -C "$canonical" submodule sync --recursive > /dev/null 2>&1 || true
  fi
  git -C "$canonical" submodule sync --recursive > /dev/null 2>&1 || true
}
if [ -d "$canonical/.git" ]; then
  echo "Found existing checkout at $canonical — updating."
  # If the checkout points at a stale/different remote (e.g. the old
  # ping-sandbox meta-repo, frozen before the migration), re-point it here —
  # otherwise every fetch keeps landing on an ancient commit.
  current_origin="$(git -C "$canonical" remote get-url origin 2>/dev/null || true)"
  if [ "$current_origin" != "$repo" ]; then
    echo "  origin was $current_origin — re-pointing to $repo"
    git -C "$canonical" remote set-url origin "$repo"
    git -C "$canonical" fetch origin main 2>/dev/null
    git -C "$canonical" branch --set-upstream-to=origin/main main > /dev/null 2>&1 || true
  fi
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

# Refuse to run a partial/stale checkout: if setup.sh is missing after the
# sync, the update failed — say so instead of a cryptic "No such file".
if [ ! -f "$canonical/scripts/setup.sh" ]; then
  echo "ERROR: $canonical/scripts/setup.sh is missing after update." >&2
  echo "The checkout is stale or incomplete. To repair it, run:" >&2
  echo "  cd $canonical && git fetch origin main && git reset --hard origin/main" >&2
  echo "then re-run this installer." >&2
  exit 1
fi

exec "$canonical/scripts/setup.sh" "$@"
