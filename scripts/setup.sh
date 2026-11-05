#!/usr/bin/env bash
# setup.sh — the ONE command for the standalone labs family.
#
#   scripts/setup.sh                     full first-time setup (was bootstrap.sh)
#   scripts/setup.sh teardown [--dry-run]  delete the PingOne demo environment
#   scripts/setup.sh <bootstrap flags>     --app X, --start Y, --skip-install, ...
#
# Everything else (bootstrap.sh, pingone-setup.sh, pingone-teardown.sh) still
# exists and stays runnable by hand; this wrapper just means nobody has to
# remember more than one entry point.
set -eu

# Canonical location: ~/Development/AI-DEMO-Standalone. Run from anywhere —
# if this script lives elsewhere, install/refresh the canonical clone and
# re-exec setup from there. Never deletes an existing checkout.
canonical="$HOME/Development/AI-DEMO-Standalone"
here="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$here" != "$canonical" ]; then
  if [ -d "$canonical/.git" ]; then
    echo "Canonical checkout found at $canonical — switching to it."
    git -C "$canonical" pull --ff-only origin main 2>/dev/null || \
      echo "(could not fast-forward the canonical checkout; using it as-is)"
    exec "$canonical/scripts/setup.sh" "$@"
  else
    mkdir -p "$HOME/Development"
    echo "Installing the family to $canonical ..."
    git clone --recurse-submodules https://github.com/curtismu7/AI-DEMO-Standalone.git "$canonical"
    exec "$canonical/scripts/setup.sh" "$@"
  fi
fi
root="$canonical"

# Keep the canonical checkout current (unless the user pinned something or is offline).
if git -C "$root" remote get-url origin > /dev/null 2>&1; then
  if ! git -C "$root" pull --ff-only origin main > /dev/null 2>&1; then
    echo "(could not fast-forward from origin/main — continuing with the local state)"
  fi
fi

sub="${1:-}"
case "$sub" in
  teardown)
    shift
    exec "$root/scripts/pingone-teardown.sh" "$@"
    ;;
  setup)
    shift
    exec "$root/scripts/pingone-setup.sh" "$@"
    ;;
  update)
    # Bring an existing deployment current: meta-repo + every submodule, fast-forward only.
    echo "Updating $root ..."
    git -C "$root" pull --ff-only origin main || { echo "(meta-repo could not fast-forward — resolve by hand)"; exit 1; }
    git -C "$root" submodule sync --recursive
    git -C "$root" submodule update --init --recursive
    echo "Done. All submodules at their recorded pins."
    echo "Next: scripts/setup.sh --skip-install to re-verify, or --start <lab>."
    exit 0
    ;;
  -h|--help|help)
    cat <<'USAGE'
setup.sh — the one command for the standalone labs family.

Usage:
  scripts/setup.sh                       First-time setup: prerequisites,
                                         submodules, shelf, lab-proxy, PingOne.
  scripts/setup.sh --app <lab-dir>       Set up only one lab.
  scripts/setup.sh --start <lab-dir>     Set up, then start one lab.
  scripts/setup.sh --start-all           Set up, then start every lab.
  scripts/setup.sh --skip-install        Set up without npm install/build.
  scripts/setup.sh setup [flags]         Re-run PingOne setup alone
                                         (e.g. setup pingone --region com ...)
  scripts/setup.sh teardown [--dry-run]  Delete the PingOne demo environment
                                         (reads the admin creds saved by setup;
                                         --dry-run shows what it would delete).
  scripts/setup.sh update                Pull the latest meta-repo + all lab pins
                                         (fast-forward only, never discards).

After setup, open the shelf: https://local.ping-devops.com:8443
USAGE
    exit 0
    ;;
  *)
    exec "$root/scripts/bootstrap.sh" "$@"
    ;;
esac
