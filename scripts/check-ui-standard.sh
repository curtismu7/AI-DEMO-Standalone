#!/bin/bash
# Checks that each app's vendored standalone-ui.css matches the canonical copy.
# Usage: scripts/check-ui-standard.sh   (run from the AI-DEMO-Standalone root, after submodules are checked out)
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
canonical="$root/shared/standalone-ui.css"
status=0
found=0
# -prune (not -not -path): -not -path still WALKS node_modules/dist/.git, which hangs for minutes with ~65 labs under load.
for copy in $(find "$root/standalone" "$root/id-jag-kit-wip" \
    \( -name node_modules -o -name dist -o -name .git \) -prune -o -name standalone-ui.css -print 2>/dev/null | sort); do
  rel=${copy#"$root/"}
  found=1
  if cmp -s "$canonical" "$copy"; then
    echo "OK      $rel"
  else
    echo "DRIFT   $rel (differs from shared/standalone-ui.css)"; status=1
  fi
done
if [ "$found" = "0" ]; then
  echo "No vendored standalone-ui.css copies found (submodules not checked out?)"; status=1
fi
exit $status
