#!/bin/bash
# First-time setup for the standalone apps. Usage: scripts/bootstrap.sh [--skip-install]
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
skip_install=0
for arg in "$@"; do
  case "$arg" in
    -h|--help)
      cat <<'USAGE'
AI-DEMO-Standalone first-time setup.

Usage: scripts/bootstrap.sh [options]

Options:
  (none)           Full setup: prerequisites, submodules, shelf, lab-proxy,
                   and PingOne setup (asks for worker client-id, client-secret,
                   admin environment ID when no ~/Development/.env exists)
  --app <lab-dir>  Init only one lab's submodule, e.g. --app id-jag-standalone-LAB
  --skip-install   Skip the npm install/build steps
  --pingone="..."  Force PingOne setup with args (reconfigure), e.g.
                   --pingone="--region com --admin-env-id ID --client-id ID --client-secret SECRET"
  --no-pingone     Skip PingOne entirely (mock mode)
  -h, --help       This help

After setup: https://local.ping-devops.com:8443 (launcher)
Real/live mode needs ~/Development/.env (written by the PingOne step).
USAGE
      exit 0 ;;
    --skip-install) skip_install=1 ;;
    --pingone) run_pingone=1 ;;
    --pingone=*) run_pingone=1; PINGONE_ARGS="${arg#--pingone=}" ;;
    --no-pingone) run_pingone=0 ;;
    --app) : ;; # value handled below
    --app=*) BOOTSTRAP_APP="${arg#--app=}" ;;
    *) if [ "${prev:-}" = "--app" ]; then BOOTSTRAP_APP="$arg"; else echo "Unknown argument: $arg (usage: bootstrap.sh [--skip-install] [--app <lab>] [--pingone[=--region R --admin-env-id ID --client-id ID --client-secret SECRET]])"; exit 2; fi ;;
  esac
  prev="$arg"
done

echo "== Homebrew (package manager for everything below)"
if ! command -v brew > /dev/null; then
  echo "Homebrew missing — installing (will ask for your password)..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Apple Silicon puts brew in /opt/homebrew; the installer prints the eval line but a fresh shell needs it now.
  if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
  if [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"; fi
fi
command -v brew > /dev/null || { echo "Homebrew install failed. Install it: https://brew.sh then re-run."; exit 1; }
echo "brew OK ($(brew --version | head -1))"
# git ships with the Xcode Command Line Tools, which the brew install above just set up.
command -v git > /dev/null || { echo "git missing — installing the Xcode Command Line Tools (git included)..."; xcode-select --install || true; echo "Re-run this script after the tools finish installing."; exit 1; }
echo "git OK ($(git --version))"

echo "== Node"
major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$major" -lt 26 ]; then
  if command -v brew > /dev/null; then
    if [ "$major" = "0" ]; then
      echo "Node missing — installing (brew install node@26)..."
      brew install node@26 || true
    elif brew list --versions node@26 > /dev/null 2>&1; then
      echo "Node $major found but node@26 is installed and not linked — linking (brew link --overwrite node@26)..."
    else
      echo "Node $major found — installing node@26..."
      brew install node@26 || true
    fi
    # Keg-only formula: the versioned node is installed but another node shadows it on PATH.
    # If the plain `node` formula (any version) is linked, it owns the bin name — brew refuses
    # to let node@26 overwrite it. Unlink it first (measured on the Air: "To relink, run:
    # brew unlink node && brew link node").
    if brew list --versions node > /dev/null 2>&1 && brew list node 2>/dev/null | head -1 | grep -q .; then
      if ! brew link --overwrite node@26 > /dev/null 2>&1; then
        echo "brew 'node' formula is linked and shadows node@26 — unlinking it..."
        brew unlink node || true
        brew link --overwrite node@26 || true
      fi
    else
      brew link --overwrite node@26 2>/dev/null || true
    fi
    hash -r
    major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  fi
  if [ "$major" -lt 26 ]; then
    echo "Node 26 is required (found major $major)."
    echo "  brew install node@26 && brew link --overwrite node@26"
    echo "If a non-brew node shadows it: which node (then remove that entry from PATH)."
    exit 1
  fi
fi
echo "Node $(node -v) OK"

echo "== gh CLI + repo access"
# Submodule init fails cryptically without access to the submodule owner.
if ! command -v gh > /dev/null; then
  if command -v brew > /dev/null; then echo "gh CLI missing — installing (brew install gh)"; brew install gh; else echo "gh CLI is required and brew is not available. Install: brew install gh"; exit 1; fi
fi
if ! gh auth status > /dev/null 2>&1; then
  echo "gh is not signed in — starting the browser login (--web)..."
  gh auth login --hostname github.com --git-protocol https --web
fi
# Git needs gh as its credential helper or submodule fetches over HTTPS fail on private repos.
gh auth setup-git
ghuser="$(gh api user --jq .login 2>/dev/null || true)"
if [ -z "$ghuser" ]; then echo "gh is signed in but the API call failed; check gh auth status"; exit 1; fi
# Gate on the meta-repo's OWN origin (works for any owner: ping-sandbox, curtismu7, an org fork).
meta_repo="$(git config --get remote.origin.url | sed 's|\.git$||; s|^https://github.com/||')"
if ! gh api "repos/$meta_repo" --jq .full_name > /dev/null 2>&1; then
  echo "Signed in as $ghuser but the meta-repo origin is not reachable with this account:"
  echo "  $meta_repo"
  echo "The labs live under the same owner: your account needs access to that owner's repos."
  exit 1
fi
echo "gh OK ($ghuser, $meta_repo reachable)"

echo "== Docker"
if ! command -v docker > /dev/null; then
  if command -v brew > /dev/null; then
    if [ "$(uname -s)" = "Darwin" ]; then echo "Docker missing — installing OrbStack (brew install orbstack)"; brew install orbstack || true; fi
  else
    echo "Docker is required and brew is not available. Install: brew install orbstack"; exit 1
  fi
fi
if command -v docker > /dev/null && ! docker info > /dev/null 2>&1; then
  # Start OrbStack (auto-starts the VM on first command) or Docker Desktop as fallback.
  if [ "$(uname -s)" = "Darwin" ]; then
    echo "Starting Docker (OrbStack)..."
    open -a OrbStack 2>/dev/null || open -a "Docker Desktop" 2>/dev/null || true
    for i in $(seq 1 30); do docker info > /dev/null 2>&1 && break; sleep 2; done
  fi
fi
if ! docker info > /dev/null 2>&1; then echo "Docker is not running. Start OrbStack (or Docker Desktop) and re-run."; exit 1; fi
echo "docker OK"

echo "== /etc/hosts entry for the one domain"
# The lab-proxy serves https://local.ping-devops.com:8443; the name must resolve on this machine.
# Bootstrap tries to add it with sudo (may prompt for your password); if sudo is unavailable it
# tells you the line and continues — apps still work directly without it.
if ! grep -q "local.ping-devops.com" /etc/hosts 2>/dev/null; then
  if sudo -n true 2>/dev/null; then
    echo "127.0.0.1 local.ping-devops.com" | sudo tee -a /etc/hosts > /dev/null && echo "hosts entry added"
  else
    echo "Asking for your password to add the hosts entry (the launcher needs it)..."
    if echo "127.0.0.1 local.ping-devops.com" | sudo tee -a /etc/hosts > /dev/null 2>&1; then
      echo "hosts entry added"
    else
      echo "NOTE: could not add the /etc/hosts entry. Add this line yourself (sudo):"
      echo "  127.0.0.1 local.ping-devops.com"
      echo "Apps still work directly (cd standalone/<app> && npm start) without it."
    fi
  fi
fi

echo "== PingOne environment"
# scripts/pingone-setup.sh creates a dedicated demo environment from ONE worker app's
# credentials (client id, client secret, admin environment id — asked for anything not
# passed via --pingone="...") and writes ~/Development/.env. Default: run it. Skipped
# when the .env already has an environment (pass --pingone="..." to reconfigure) or
# with --no-pingone (stay in mock mode).
if [ "${run_pingone:-1}" = "0" ]; then
  echo "--no-pingone: staying in mock mode (no PingOne environment needed)"
elif grep -q "^PINGONE_ENVIRONMENT_ID=" "${STANDALONE_ENV:-$HOME/Development/.env}" 2>/dev/null && [ -z "${PINGONE_ARGS:-}" ]; then
  echo "~/Development/.env already has PINGONE_ENVIRONMENT_ID — skipping (pass --pingone=... to reconfigure, or --no-pingone to skip)"
else
  # Intentional word-splitting: PINGONE_ARGS holds --flag value pairs from --pingone="...".
  # shellcheck disable=SC2086
  "$root/scripts/pingone-setup.sh" ${PINGONE_ARGS:-} || echo "pingone-setup failed — fix and re-run, or stay in mock mode (--no-pingone)."
fi

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
# Init every lab, or just one with: scripts/bootstrap.sh --app id-jag-standalone-LAB
if [ -n "${BOOTSTRAP_APP:-}" ]; then
  git -C "$root" submodule update --init --recursive "standalone/$BOOTSTRAP_APP"
else
  git -C "$root" submodule update --init --recursive
fi

echo "== Shelf"
# The shelf is the demo-shelf-LAB submodule (same meta-repo, init'd above); each app finds it
# beside itself and adds itself on npm start.
if [ -d "$root/standalone/demo-shelf-LAB" ]; then
  echo "demo-shelf-LAB present (submodule)"
  if [ "$skip_install" = 0 ]; then
    (cd "$root/standalone/demo-shelf-LAB" && npm install --no-audit --no-fund && npm run build) \
      || echo "Shelf build failed; run cd standalone/demo-shelf-LAB && npm install && npm run build by hand."
  fi
else
  echo "demo-shelf-LAB missing — init it: git submodule update --init standalone/demo-shelf-LAB"
fi

if [ "$skip_install" = 0 ]; then
  echo "== Install"
  (cd "$root/standalone/demo-shelf-LAB" && npm install --no-audit --no-fund && npm run build) || echo "shelf install failed"
  (cd "$root/standalone/ai-gateway-client-LAB" && npm install --prefix server --no-audit --no-fund && npm install --prefix web --no-audit --no-fund)
  (cd "$root/standalone/mcp-demo-client-privilege-LAB" && npm install --no-package-lock --no-audit --no-fund)
  (cd "$root/standalone/privilege-a2a-anthropic-demo-LAB" && npm ci --no-audit --no-fund)
fi

echo "== UI standard"
"$root/scripts/check-ui-standard.sh" || true

echo "== Settings file"
# The shared settings file lives at ~/Development/.env (the family convention). Make sure
# the folder exists even if the repo was cloned elsewhere.
mkdir -p "$HOME/Development"
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
