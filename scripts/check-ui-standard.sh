#!/bin/bash
# Checks that each app's vendored standalone-ui.css matches the canonical copy.
# Usage: scripts/check-ui-standard.sh   (run from the AI-DEMO-Standalone root, after submodules are checked out)
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
canonical="$root/shared/standalone-ui.css"
status=0
for copy in \
  standalone/mcp-demo-client-privilege-LAB/public/standalone-ui.css \
  standalone/ai-gateway-client-LAB/web/src/standalone-ui.css; do
  if [ ! -f "$root/$copy" ]; then
    echo "MISSING $copy"; status=1; continue
  fi
  if cmp -s "$canonical" "$root/$copy"; then
    echo "OK      $copy"
  else
    echo "DRIFT   $copy (differs from shared/standalone-ui.css)"; status=1
  fi
done
exit $status
