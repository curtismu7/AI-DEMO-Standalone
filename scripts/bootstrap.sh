#!/bin/bash
# First-time setup for the standalone apps. Usage: scripts/bootstrap.sh [--skip-install]
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
skip_install=0
[ "${1:-}" = "--skip-install" ] && skip_install=1

echo "== Node"
major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$major" -lt 22 ]; then echo "Node 22 or newer is required (found major $major)"; exit 1; fi
echo "Node $(node -v) OK"

echo "== Submodules"
git -C "$root" submodule update --init --recursive

echo "== Shelf"
# The shelf sits beside the apps so each app finds it and adds itself on npm start.
if [ -d "$root/standalone/demo-shelf-LAB" ]; then
  echo "demo-shelf-LAB already present"
else
  git clone --quiet https://github.com/ping-sandbox/demo-shelf-LAB.git "$root/standalone/demo-shelf-LAB" \
    && (cd "$root/standalone/demo-shelf-LAB" && npm install --no-audit --no-fund && npm run build) \
    || echo "Could not set up the shelf. Clone ping-sandbox/demo-shelf-LAB into standalone/ by hand."
fi

if [ "$skip_install" = 0 ]; then
  echo "== Install"
  (cd "$root/standalone/ai-gateway-client-LAB" && npm install --prefix server --no-audit --no-fund && npm install --prefix web --no-audit --no-fund)
  (cd "$root/standalone/mcp-demo-client-privilege-LAB" && npm install --no-package-lock --no-audit --no-fund)
  (cd "$root/standalone/privilege-a2a-anthropic-demo-LAB" && npm ci --no-audit --no-fund)
fi

echo "== UI standard"
"$root/scripts/check-ui-standard.sh" || true

echo "== Settings file"
"$root/scripts/check-env.sh" || echo "Fix the lines above, then re-run scripts/check-env.sh"
echo "Done. Start an app with: cd standalone/<app> && npm start"
