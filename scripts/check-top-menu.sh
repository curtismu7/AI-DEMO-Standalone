#!/bin/bash
# Checks that every lab's vendored TopMenu is byte-identical to the canonical copy in
# this repo (shared/top-menu/). Same scheme as check-ui-standard.sh: one canonical copy,
# vendored per app, pinned by hash — update one thing, every app gets it.
#
# Usage: scripts/check-top-menu.sh [--pin]   (--pin refreshes each app's top-menu.sha256)
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
canonical_dir="$root/shared/top-menu"
hash() { shasum -a 256 "$1" | cut -d' ' -f1; }
rc=0

# Labs with a React web UI that vendors the TopMenu (extend as apps adopt it).
APPS=(
  "$HOME/Development/pingone-events-LAB"
  "$HOME/Development/pingfederate-LAB"
  "$HOME/Development/idjag-runner-LAB"
  "$HOME/Development/observability-LAB"
  "$HOME/Development/agent-preferences-lab"
  "$HOME/Development/gateway-claims-lab-node26"
  "$HOME/Development/mcp-scanner-lab"
  "$HOME/Development/cimd-lab-node26"
  "$HOME/Development/session-lab-node26"
)
# Plus every standalone/ lab that has vendored the component (discovered, not hardcoded).
# Server-rendered labs vendor just top-menu.css with a sha256 pin; both count.
for dir in "$root"/standalone/*/web/src/top-menu; do
  { [ -f "$dir/TopMenu.jsx" ] || [ -f "$dir/top-menu.css" ]; } && APPS+=("$(dirname "$(dirname "$(dirname "$dir")")")")
done

for app in "${APPS[@]}"; do
  name="$(basename "$app")"
  vendored="$app/web/src/top-menu"
  if [ ! -d "$vendored" ]; then
    echo "SKIP   $name (no web/src/top-menu yet)"
    continue
  fi
  for f in top-menu.css TopMenu.jsx; do
    # server-rendered labs vendor only the css; TopMenu.jsx is optional
    if [ "$f" = "TopMenu.jsx" ] && [ ! -f "$vendored/TopMenu.jsx" ]; then continue; fi
    if [ ! -f "$vendored/$f" ]; then echo "MISSING $name web/src/top-menu/$f"; rc=1; continue; fi
    want="$(hash "$canonical_dir/$f")"
    have="$(hash "$vendored/$f")"
    if [ "$want" = "$have" ]; then
      echo "OK     $name $f"
    else
      echo "DRIFT  $name $f — copy shared/top-menu/$f over it, then re-run with --pin"
      rc=1
    fi
  done
done
exit $rc
