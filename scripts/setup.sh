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

sync_to_origin() {
  # Make the checkout match origin/main; hard-reset (with a stash) when the
  # local branch diverged — a stale machine must never silently stay stale.
  if git -C "$root" fetch origin main 2>/dev/null && \
     git -C "$root" rev-parse origin/main > /dev/null 2>&1; then
    if ! git -C "$root" merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
      echo "(local checkout diverged from GitHub — resetting to origin/main; stray changes stashed)"
      git -C "$root" stash push -m "auto-stash before sync $(date +%F)" > /dev/null 2>&1 || true
      git -C "$root" reset --hard origin/main
    else
      git -C "$root" merge --ff-only origin/main 2>/dev/null || git -C "$root" reset --hard origin/main
    fi
  fi
}
# The canonical dir must be a real git checkout — an empty/partial leftover dir
# is treated as absent (git clone accepts cloning into an empty dir).
if [ "$here" != "$canonical" ] || [ ! -d "$canonical/.git" ]; then
  if [ -d "$canonical/.git" ]; then
    echo "Canonical checkout found at $canonical — switching to it."
    root="$canonical"
    sync_to_origin
    exec "$canonical/scripts/setup.sh" "$@"
  else
    mkdir -p "$HOME/Development"
    echo "Installing the family to $canonical ..."
    git clone --recurse-submodules https://github.com/curtismu7/AI-DEMO-Standalone.git "$canonical"
    exec "$canonical/scripts/setup.sh" "$@"
  fi
fi
sync_to_origin() {
  # Make the checkout match origin/main; hard-reset (with a stash) when the
  # local branch diverged — a stale machine must never silently stay stale.
  if git -C "$root" fetch origin main 2>/dev/null && \
     git -C "$root" rev-parse origin/main > /dev/null 2>&1; then
    if ! git -C "$root" merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
      echo "(local checkout diverged from GitHub — resetting to origin/main; stray changes stashed)"
      git -C "$root" stash push -m "auto-stash before sync $(date +%F)" > /dev/null 2>&1 || true
      git -C "$root" reset --hard origin/main
    else
      git -C "$root" merge --ff-only origin/main 2>/dev/null || git -C "$root" reset --hard origin/main
    fi
  fi
}

root="$canonical"
# Running from the canonical path but somehow not a git repo — refuse clearly
# instead of failing later with an empty origin.
if ! git -C "$root" rev-parse --git-dir > /dev/null 2>&1; then
  echo "ERROR: $root is not a git checkout (missing .git)."
  echo "Fix: rm -rf \"$root\" && bash <this-script>   # or re-run from a real clone"
  exit 1
fi

# Keep the canonical checkout current; recover from divergence instead of
# staying stale (the Air's repeated 'not our ref' failures came from this).
sync_to_origin

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
    # Restart the shelf if its pin moved (it serves the update banner/notes — it
    # must run the new code for users to see them).
    shelf_pin_before=$(git -C "$root" ls-tree HEAD standalone/demo-shelf-LAB | awk '{print $3}')
    git -C "$root" submodule update --init --recursive
    shelf_pin_after=$(git -C "$root" ls-tree HEAD standalone/demo-shelf-LAB | awk '{print $3}')
    if [ -d "$root/standalone/demo-shelf-LAB" ]; then
      if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qi "shelf"; then
        echo "Shelf not running — starting it..."
        if (cd "$root/standalone/demo-shelf-LAB" && npm install --no-audit --no-fund > /dev/null 2>&1 && npm run build > /dev/null 2>&1 && npm run docker > /dev/null 2>&1); then
          echo "  shelf running with the current code (update banner + release notes)."
        else
          echo "  WARNING: shelf failed to start — the launcher will 404 until it is up."
          echo "  Fix by hand:  cd standalone/demo-shelf-LAB && npm run docker   (its output shows why)"
        fi
      elif [ "$shelf_pin_before" != "$shelf_pin_after" ]; then
        echo "Shelf changed — restarting it (this serves the update banner and release notes)..."
        if (cd "$root/standalone/demo-shelf-LAB" && npm run build > /dev/null 2>&1 && npm run docker > /dev/null 2>&1); then
          echo "  shelf restarted with the new code."
        else
          echo "  WARNING: shelf restart failed — run: (cd standalone/demo-shelf-LAB && npm run docker) to see why."
        fi
      else
        echo "  shelf unchanged and running."
      fi
    fi
    # Bring back what the user had running (the shelf's history), rebuilt so the new code is live.
    # Nothing else starts here: an update never adds labs the user did not have up.
    # shellcheck source=lib-labs.sh
    dry_run=0; . "$root/scripts/lib-labs.sh"
    restore="$(top_labs 10 history-only)"
    if [ -n "$restore" ]; then
      echo "Restarting the labs you had running, with the updated code:"
      # shellcheck disable=SC2086
      start_labs $restore
    else
      echo "  no labs in your history to restart (start them from the shelf, or: scripts/setup.sh)."
    fi
    # The lab-proxy serves the labs over one domain; its nginx.conf lives in this repo,
    # so an update can change proxy behavior (forwarded headers, new lab routes). The
    # force-recreate is idempotent and also re-resolves DNS against now-running labs.
    if [ -x "$root/scripts/lab-proxy-watchdog.sh" ]; then
      if "$root/scripts/lab-proxy-watchdog.sh" > /dev/null 2>&1; then
        echo "  lab-proxy serving with the current config."
      else
        echo "  WARNING: lab-proxy did not come up — run: scripts/lab-proxy-watchdog.sh (it prints why)."
      fi
    fi
    echo "Done. All submodules at their recorded pins."
    echo "Next: scripts/setup.sh --skip-install to re-verify, or --start <lab>."
    exit 0
    ;;
  -h|--help|help)
    cat <<'USAGE'
setup.sh — the one command for the standalone labs family.

Usage:
  scripts/setup.sh                       Setup: prerequisites, submodules, shelf,
                                         lab-proxy, PingOne, then your last 10 labs
                                         (filled from scripts/first-run-labs.txt).
  scripts/setup.sh --app <lab-dir>       Set up only one lab.
  scripts/setup.sh --start <lab-dir>     Set up, then start one lab.
  scripts/setup.sh --start-all           Set up, then start every lab.
  scripts/setup.sh --start-top <n>       Like the default, with <n> labs instead of 10.
  scripts/setup.sh --no-start            Set up only; start no labs.
  scripts/setup.sh --skip-install        Set up without npm install/build.
  scripts/setup.sh setup [flags]         Re-run PingOne setup alone
                                         (e.g. setup pingone --region com ...)
  scripts/setup.sh teardown [--dry-run]  Delete the PingOne demo environment
                                         (reads the admin creds saved by setup;
                                         --dry-run shows what it would delete).
  scripts/setup.sh update                Pull the latest meta-repo + all lab pins
                                         (fast-forward only, never discards), then
                                         rebuild and restart only the labs you had running.

After setup, open the shelf: https://local.ping-devops.com:8443
USAGE
    exit 0
    ;;
  *)
    exec "$root/scripts/bootstrap.sh" "$@"
    ;;
esac
