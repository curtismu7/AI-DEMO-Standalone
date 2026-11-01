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

echo "== Authorize policy snapshot (live mode only)"
# The AI Demo P1AZ policy is imported by hand in the PingOne console (there is no import API). This only checks
# whether the tenant already has it, and says what to do if not. Mock mode (the default in every app) needs no snapshot
# and no tenant. It never blocks the setup. The file is policy/README.md's placeholder-host copy, safe to share.
snapshot="${P1AZ_SNAPSHOT_FILE:-$root/policy/ai-demo-p1az.standalone.snapshot.json}"
rc=0
node "$root/scripts/check-authorize-policy.mjs" || rc=$?
if [ "$rc" = 1 ]; then
  echo "Import it once: PingOne console -> Authorize -> Trust Framework -> Import -> $snapshot"
  [ -f "$snapshot" ] || echo "(that file is not here; set P1AZ_SNAPSHOT_FILE to a snapshot file)"
  echo "Skip all of this by staying in mock mode: no tenant, no snapshot."
  echo "Then re-run scripts/bootstrap.sh --skip-install to confirm."
fi

echo "== Submodules"
git -C "$root" submodule update --init --recursive

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
