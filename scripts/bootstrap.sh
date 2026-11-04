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
echo "== One-domain launcher (lab-proxy)"
# All apps are served through ONE domain, already in /etc/hosts - no new hosts entries, ever.
#   https://local.ping-devops.com:8443            -> the shelf (launcher)
#   https://local.ping-devops.com:8443/<app>/     -> each app
# The proxy needs the apps' Docker networks, so it starts after the first apps are up. Try it, don't fail the setup.
# The watchdog also installs a launchd agent (RunAtLoad + every 5 min) so a reboot never leaves the
# launcher down, and starts any lab containers a restart left exited. Users never see ERR_CONNECTION_REFUSED.
if "$root/scripts/lab-proxy-watchdog.sh"; then
  echo "lab-proxy started (and a launchd agent keeps it up): https://local.ping-devops.com:8443"
else
  echo "lab-proxy not serving yet (see /tmp/lab-proxy-watchdog.log). It retries every 5 minutes; or run:"
  echo "  scripts/lab-proxy-watchdog.sh"
fi
echo "Done. Open https://local.ping-devops.com:8443 (launcher) or run an app directly: cd standalone/<app> && npm start"
