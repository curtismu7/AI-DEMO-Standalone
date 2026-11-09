#!/bin/bash
# First-time setup for the standalone apps. Users should call scripts/setup.sh (same
# flags, plus `teardown`); this script is the implementation setup.sh delegates to.
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
skip_install=0
verbose=0
start_app=""
run_pingone=""
BOOTSTRAP_APP=""

# ---- output helpers ---------------------------------------------------------
# One line per step: "[n/N] Name ............ OK (detail)". Detail/explanations
# print only on failure or with --verbose. Colors degrade gracefully when not
# a TTY.
if [ -t 1 ]; then
  C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_B=$'\033[36m'; C_DIM=$'\033[2m'; C_0=$'\033[0m'
else
  C_G=""; C_Y=""; C_R=""; C_B=""; C_DIM=""; C_0=""
fi
STEP_TOTAL=14
STEP_N=0
STEP_NAME=""
STEP_DETAIL=""

run_quiet() {
  # run_quiet <label> <cmd...> — run a command, swallow output; on failure print
  # the captured tail and exit. With --verbose, stream everything.
  local label="$1"; shift
  if [ "$verbose" = 1 ]; then "$@"; return; fi
  local out rc
  out="$("$@" 2>&1)" && return 0
  rc=$?
  echo "${C_R}    $label failed (exit $rc) — last lines:${C_0}"
  printf '%s\n' "$out" | tail -8 | sed 's/^/    /'
  return $rc
}

step() {
  # step <name> — start a step line; step_ok/step_skip/step_warn/step_fail end it.
  STEP_N=$((STEP_N + 1))
  STEP_NAME="$1"
  STEP_DETAIL=""
  printf '[%d/%d] %s ' "$STEP_N" "$STEP_TOTAL" "$STEP_NAME"
}
# pad the step name to a fixed column
_step_pad() {
  local len name="$STEP_NAME"
  len=${#name}
  while [ "$len" -lt 22 ]; do printf '.'; len=$((len + 1)); done
  printf ' '
}
step_ok()      { _step_pad; printf "${C_G}OK${C_0} %s\n" "${1:-}"; }
step_skip()    { _step_pad; printf "${C_DIM}SKIP${C_0} %s\n" "${1:-}"; }
step_warn()    { _step_pad; printf "${C_Y}WARN${C_0} %s\n" "${1:-}"; [ -n "${STEP_DETAIL:-}" ] && printf '%b' "$STEP_DETAIL" || true; }
step_fail()    { _step_pad; printf "${C_R}FAIL${C_0} %s\n" "${1:-}"; [ -n "${STEP_DETAIL:-}" ] && printf '%b' "$STEP_DETAIL"; exit 1; }
step_detail()  { STEP_DETAIL="${STEP_DETAIL}${1}\n"; }

# repair_pins: when a submodule update fails with "not our ref", the pinned
# commit is missing on that submodule's remote (a pin was committed from an
# unpushed local HEAD). Re-point every such pin at the remote's own main and
# commit locally — no push from consumer machines; the owner's machine reconciles.
repair_pins() {
  local fixed=0 sha name remote_main
  while read -r mode type sha name; do
    [ "$type" = "commit" ] || continue
    d="$name"
    [ -d "$root/$d/.git" ] || continue
    git -C "$root/$d" ls-remote --heads origin 2>/dev/null | grep -q "$sha" && continue
    remote_main=$(git -C "$root/$d" ls-remote --heads origin main 2>/dev/null | awk '{print $1}')
    [ -n "$remote_main" ] || continue
    git update-index --cacheinfo "160000,$remote_main,$d" && fixed=$((fixed + 1))
  done < <(git -C "$root" ls-tree HEAD standalone/ shared/ 2>/dev/null)
  if [ "$fixed" -gt 0 ]; then
    # A fresh machine may have no git identity — the repair commit is local
    # bookkeeping, so provide one rather than failing.
    git -C "$root" -c user.name="standalone-bootstrap" -c user.email="bootstrap@local" \
      commit -q -m "pins: auto-repair — advance pins whose commits are missing on their remotes"
    echo "    (repaired $fixed stale pin(s) locally; they were not pushed — the owner machine reconciles)"
  fi
}

# ---- argument parsing -------------------------------------------------------
while [ "$#" -gt 0 ]; do
  arg="$1"; shift
  case "$arg" in
    -h|--help)
      cat <<'USAGE'
AI-DEMO-Standalone first-time setup (called via scripts/setup.sh).

Usage: scripts/setup.sh [options]

Options:
  (none)           Full setup: prerequisites, submodules, shelf, shared services
                   (every shared/<svc>/docker-compose.yml), lab-proxy, and PingOne
                   setup (asks for worker client-id, client-secret, admin
                   environment ID when no ~/Development/.env exists)
  --app <lab-dir>  Init only one lab's submodule, e.g. --app id-jag-standalone-LAB
  --skip-install   Skip the npm install/build steps
  --start <app>    After setup, start one lab (docker compose up -d, else npm start)
  --start-all      After setup, start every lab (docker compose, using the same compose
                   file as the shelf's Start button; already-running labs are skipped)
  --start-top <n>  After setup, start the <n> most recently used labs (from the shelf's
                   last-running.json; default order applies when that file is empty)
  --pingone="..."  Force PingOne setup with args (reconfigure), e.g.
                   --pingone="--region com --admin-env-id ID --client-id ID --client-secret SECRET"
  --no-pingone     Skip PingOne entirely (mock mode)
  --verbose        Show all tool output (brew, npm) instead of only failures
  --dry-run        Print what would happen without changing anything
  -h, --help       This help

After setup: https://local.ping-devops.com:8443 (launcher)
Real/live mode needs ~/Development/.env (written by the PingOne step).
USAGE
      exit 0 ;;
    --skip-install) skip_install=1 ;;
    --verbose) verbose=1 ;;
    --dry-run) dry_run=1 ;;
    --pingone) run_pingone=1 ;;
    --pingone=*) run_pingone=1; PINGONE_ARGS="${arg#--pingone=}" ;;
    --no-pingone) run_pingone=0 ;;
    --start-all) start_all=1 ;;
    --start=*) start_app="${arg#--start=}" ;;
    --start-top=*) start_top="${arg#--start-top=}" ;;
    --app=*) BOOTSTRAP_APP="${arg#--app=}" ;;
    --start|--start-top|--app)
      # value flags: the next argument is the value (--start-top defaults to 10 when none follows)
      if [ "$#" -gt 0 ] && [ "${1#-}" = "$1" ]; then val="$1"; shift
      elif [ "$arg" = "--start-top" ]; then val=10
      else echo "$arg needs a value (see --help)"; exit 2; fi
      case "$arg" in
        --start) start_app="$val" ;;
        --start-top) start_top="$val" ;;
        --app) BOOTSTRAP_APP="$val" ;;
      esac ;;
    *) echo "Unknown argument: $arg (see --help)"; exit 2 ;;
  esac
done
dry_run="${dry_run:-0}"
start_all="${start_all:-0}"
start_top="${start_top:-}"

if [ "$dry_run" = 1 ]; then
  echo "${C_B}dry run — nothing will be changed${C_0}"
  run_quiet() { shift; echo "    would run: $*"; }
  sudo() { echo "    would sudo: $*"; }
  brew() { if [ "$1" = "install" ]; then echo "    would brew install: $2"; else command brew "$@"; fi }
fi

# ---- 1. Homebrew ------------------------------------------------------------
step "Homebrew"
if ! command -v brew > /dev/null; then
  step_detail "Homebrew missing — installing (will ask for your password)..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Apple Silicon puts brew in /opt/homebrew; the installer prints the eval line but a fresh shell needs it now.
  if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
  if [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"; fi
  command -v brew > /dev/null || step_fail "Homebrew install failed. Install it: https://brew.sh then re-run."
fi
# git ships with the Xcode Command Line Tools, which the brew install above just set up.
command -v git > /dev/null || { xcode-select --install 2>/dev/null || true; step_fail "git missing — the Xcode CLT install was started; re-run after it finishes."; }
step_ok "$(brew --version | head -1 | sed 's/Homebrew //'), git $(git --version | awk '{print $3}')"

# ---- 2. Node ----------------------------------------------------------------
step "Node"
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
major="$(node_major)"
if [ "$major" -lt 26 ]; then
  # nvm FIRST (the most common shadowing source): if it manages node, install/alias 26 there
  # and skip brew entirely — two node managers fighting is what breaks machines.
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    if [ "$verbose" = 0 ]; then nvm install 26 > /dev/null 2>&1 || nvm install 26; else nvm install 26; fi
    nvm alias default 26 > /dev/null
    hash -r
    major="$(node_major)"
    [ "$major" -ge 26 ] && step_ok "v$(node -v | sed 's/v//') (nvm default 26)"
  fi
  if [ "$major" -lt 26 ]; then
    if command -v brew > /dev/null; then
      if ! brew list --versions node@26 > /dev/null 2>&1; then
        step_detail "Node $major found — installing node@26 via brew..."
        run_quiet "brew install node@26" brew install node@26 || true
      fi
      # Keg-only formula: if the plain `node` formula is linked it owns the bin name and brew
      # refuses the overwrite — unlink it first (measured: the Air shipped with a linked node 22).
      if brew list --versions node > /dev/null 2>&1; then
        if ! brew link --overwrite node@26 > /dev/null 2>&1; then
          step_detail "brew 'node' formula shadows node@26 — unlinking it..."
          brew unlink node > /dev/null 2>&1 || true
          brew link --overwrite node@26 > /dev/null 2>&1 || true
        fi
      else
        brew link --overwrite node@26 > /dev/null 2>&1 || true
      fi
      hash -r
      major="$(node_major)"
    fi
    if [ "$major" -lt 26 ]; then
      step_detail "Node 26 is required (found major $major).\nTried: nvm (if installed) and brew.\nIf a version manager still shadows node: ${C_B}which -a node${C_0} — put node@26 first on PATH."
      step_fail "cannot get Node 26 on PATH"
    fi
    step_ok "v$(node -v | sed 's/v//') (brew node@26)"
  fi
else
  step_ok "v$(node -v | sed 's/v//')"
fi

# ---- 3. gh CLI + repo access ------------------------------------------------
step "gh CLI + access"
# Submodule init fails cryptically without access to the submodule owner.
command -v gh > /dev/null || {
  command -v brew > /dev/null || step_fail "gh CLI is required and brew is not available. Install: brew install gh"
  run_quiet "brew install gh" brew install gh
}
if ! gh auth status > /dev/null 2>&1; then
  step_detail "gh is not signed in — starting the browser login (--web)..."
  gh auth login --hostname github.com --git-protocol https --web
fi
# Git needs gh as its credential helper or submodule fetches over HTTPS fail on private repos.
gh auth setup-git
ghuser="$(gh api user --jq .login 2>/dev/null || true)"
[ -n "$ghuser" ] || step_fail "gh is signed in but the API call failed; check: gh auth status"
# Gate on the meta-repo's OWN origin (works for any owner: curtismu7, an org fork).
meta_repo="$(git -C "$root" config --get remote.origin.url | sed 's|\.git$||; s|^https://github.com/||')"
if [ -z "$meta_repo" ]; then
  step_detail "This script must run from inside the family checkout (a git repo with an origin).\nFrom nothing, run:\n  curl -fsSL https://raw.githubusercontent.com/curtismu7/AI-DEMO-Standalone/main/scripts/install.sh | bash\nOr:\n  git clone --recurse-submodules https://github.com/curtismu7/AI-DEMO-Standalone.git ~/Development/AI-DEMO-Standalone"
  step_fail "not inside the family git checkout"
fi
if ! gh api "repos/$meta_repo" --jq .full_name > /dev/null 2>&1; then
  step_detail "The meta-repo origin is not reachable with account $ghuser:\n  $meta_repo\nThe labs live under the same owner — your account needs access to that owner's repos."
  step_fail "no access to $meta_repo as $ghuser"
fi
step_ok "$ghuser, $meta_repo reachable"

# ---- 4. Docker --------------------------------------------------------------
step "Docker"
if ! command -v docker > /dev/null; then
  if command -v brew > /dev/null; then
    [ "$(uname -s)" = "Darwin" ] && run_quiet "brew install orbstack" brew install orbstack
  else
    step_fail "Docker is required and brew is not available. Install: brew install orbstack"
  fi
fi
if ! docker info > /dev/null 2>&1; then
  # Start OrbStack (auto-starts the VM on first command) or Docker Desktop as fallback.
  if [ "$(uname -s)" = "Darwin" ]; then
    open -a OrbStack 2>/dev/null || open -a "Docker Desktop" 2>/dev/null || true
    for _ in $(seq 1 30); do docker info > /dev/null 2>&1 && break; sleep 2; done
  fi
fi
docker info > /dev/null 2>&1 || step_fail "Docker is not running. Start OrbStack (or Docker Desktop) and re-run."
docker_engine="OrbStack"
docker --context orbstack info > /dev/null 2>&1 || docker info > /dev/null 2>&1 && { docker --context orbstack info > /dev/null 2>&1 || docker_engine="Docker (existing engine)"; }
step_ok "$docker_engine ($(docker version --format '{{.Server.Version}}' 2>/dev/null || echo running))"

# ---- 5. /etc/hosts ----------------------------------------------------------
step "hosts entry"
# The lab-proxy serves https://local.ping-devops.com:8443; the name must resolve on this machine.
if grep -q "local.ping-devops.com" /etc/hosts 2>/dev/null; then
  step_ok "local.ping-devops.com present"
elif sudo -n true 2>/dev/null; then
  echo "127.0.0.1 local.ping-devops.com" | sudo tee -a /etc/hosts > /dev/null
  step_ok "added"
else
  echo "127.0.0.1 local.ping-devops.com" | sudo tee -a /etc/hosts > /dev/null 2>&1 && step_ok "added" || {
    step_warn "could not add (no sudo)"
    step_detail "Add this line yourself (sudo tee -a /etc/hosts):\n  127.0.0.1 local.ping-devops.com\nApps still work directly (cd standalone/<app> && npm start) without it."
  }
fi

# ---- 5b. TLS certs for the launcher -----------------------------------------
step "TLS certs"
tls_dir="$root/shared/tls"
cert="$tls_dir/local.ping-devops.com-wild.pem"
key="$tls_dir/local.ping-devops.com-wild-key.pem"
if [ -s "$cert" ] && [ -s "$key" ]; then
  step_ok "present"
else
  mkdir -p "$tls_dir"
  # mkcert gives a TRUSTED cert (its local CA is installed in the user's keychain,
  # so browsers show no warning). Fall back to a self-signed cert when mkcert is
  # unavailable — that one shows a one-time browser warning.
  command -v mkcert > /dev/null || brew install mkcert > /dev/null 2>&1
  if command -v mkcert > /dev/null && mkcert -install > /dev/null 2>&1 \
      && mkcert -key-file "$key" -cert-file "$cert" \
        "local.ping-devops.com" "*.local.ping-devops.com" > /dev/null 2>&1; then
    chmod 600 "$key"
    step_ok "trusted cert via mkcert (local CA installed in your keychain — no browser warning)"
  elif openssl req -x509 -newkey rsa:2048 -keyout "$key" -out "$cert" -days 825 -nodes \
      -subj "/CN=*.local.ping-devops.com" \
      -addext "subjectAltName=DNS:local.ping-devops.com,DNS:*.local.ping-devops.com" > /dev/null 2>&1; then
    chmod 600 "$key"
    step_ok "self-signed wildcard generated (browsers show a warning once; accept to continue)"
  else
    step_warn "could not generate TLS certs — the launcher needs them; install openssl or copy the pems from another machine"
    step_detail "Expected files:\n  $cert\n  $key"
  fi
fi

# ---- 6. PingOne environment -------------------------------------------------
step "PingOne"
if [ "${run_pingone:-1}" = "0" ]; then
  step_skip "--no-pingone: mock mode"
elif grep -q "^PINGONE_ENVIRONMENT_ID=" "${STANDALONE_ENV:-$HOME/Development/.env}" 2>/dev/null && [ -z "${PINGONE_ARGS:-}" ]; then
  step_ok "configured in ~/Development/.env"
else
  # Intentional word-splitting: PINGONE_ARGS holds --flag value pairs from --pingone="...".
  # shellcheck disable=SC2086
  if "$root/scripts/pingone-setup.sh" ${PINGONE_ARGS:-}; then
    step_ok "environment created, ~/Development/.env written"
  else
    step_warn "setup failed — continuing in mock mode"
    step_detail "Fix and re-run scripts/pingone-setup.sh, or stay in mock mode (the default in every app)."
  fi
fi

# ---- 7. Authorize policy snapshot (live mode only) --------------------------
step "Authorize snapshot"
# The AI Demo P1AZ policy is imported by hand in the PingOne console (there is no import API). This only checks
# whether the tenant already has it, and says what to do if not. Mock mode (the default in every app) needs no snapshot
# and no tenant. It never blocks the setup. The file is policy/README.md's placeholder-host copy, safe to share.
snapshot="${P1AZ_SNAPSHOT_FILE:-$root/policy/ai-demo-p1az.standalone.snapshot.json}"
out="$(node "$root/scripts/check-authorize-policy.mjs" 2>&1)" && step_ok "policy present" || {
  step_detail "$out\nImport once (live mode): PingOne console -> Authorize -> Trust Framework -> Import ->\n  $snapshot"
  step_warn "check could not confirm (mock mode is unaffected)"
}

# ---- 8. Submodules + shelf + installs ---------------------------------------
step "Submodules"
# submodules_init <path-args...>: try the update; on "not our ref" style failure,
# re-fetch origin (the meta push and the lab push can land seconds apart when
# several sessions publish at once) and repair locally, then retry — up to 3 tries.
submodules_init() {
  local attempt=1 max=3 rc=1
  while [ "$attempt" -le "$max" ]; do
    if git -C "$root" submodule update --init --recursive "$@" > /dev/null 2>&1; then
      return 0
    fi
    rc=1
    # backoff before re-fetching: the meta push and the lab push can land seconds
    # apart when several sessions publish at once — give that gap time to close.
    sleep $((attempt * 5))
    git -C "$root" fetch origin main > /dev/null 2>&1 || true
    if git -C "$root" merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
      git -C "$root" merge --ff-only origin/main > /dev/null 2>&1 || true
    fi
    repair_pins
    attempt=$((attempt + 1))
  done
  git -C "$root" submodule update --init --recursive "$@" 2>&1 | tail -4 | sed 's/^/    /'
  return 1
}
if [ -n "$BOOTSTRAP_APP" ]; then
  submodules_init "standalone/$BOOTSTRAP_APP" && step_ok "$BOOTSTRAP_APP" \
    || { step_detail "submodule init kept failing after retries — see the lines above."; step_fail "$BOOTSTRAP_APP did not initialize"; }
else
  shelf_pin_before="$(git -C "$root" ls-tree HEAD standalone/demo-shelf-LAB | awk '{print $3}')"
  submodules_init && step_ok "$(git -C "$root" submodule status | wc -l | tr -d ' ') labs" \
    || { step_detail "submodule init kept failing after retries — see the lines above."; step_fail "submodules did not initialize"; }
  # If the shelf pin moved during this run and a shelf container is already up,
  # restart it so users actually get the new banner/notes code.
  shelf_pin_after="$(git -C "$root" ls-tree HEAD standalone/demo-shelf-LAB | awk '{print $3}')"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qi "shelf"; then
    if [ "$shelf_pin_before" != "$shelf_pin_after" ]; then
      (cd "$root/standalone/demo-shelf-LAB" && npm run build > /dev/null 2>&1 && npm run docker > /dev/null 2>&1) \
        && step_detail "Shelf restarted with the new code (update banner + release notes)." \
        || step_detail "Shelf restart failed — run: (cd standalone/demo-shelf-LAB && npm run docker) to see why."
    fi
  else
    # Shelf down (or never started): bring it up, else the launcher 404s.
    if (cd "$root/standalone/demo-shelf-LAB" && npm install --no-audit --no-fund > /dev/null 2>&1 && npm run build > /dev/null 2>&1 && npm run docker > /dev/null 2>&1); then
      step_detail "Shelf started (the launcher now serves it)."
    else
      step_detail "Shelf did not start — the launcher will 404 until it is up. Fix by hand: cd standalone/demo-shelf-LAB && npm run docker  (run it WITHOUT silencing to see the real error)"
      step_warn "shelf not running — run the fix command above"
    fi
  fi
fi

step "Shelf + installs"
if [ ! -d "$root/standalone/demo-shelf-LAB" ]; then
  step_warn "demo-shelf-LAB missing"
  step_detail "Init it: git submodule update --init standalone/demo-shelf-LAB"
elif [ "$skip_install" = 1 ]; then
  step_skip "--skip-install"
else
  out="$(cd "$root/standalone/demo-shelf-LAB" && npm install --no-audit --no-fund 2>&1 && npm run build 2>&1)" \
    || { printf '%s\n' "$out" | tail -8; step_fail "shelf install/build failed"; }
  (cd "$root/standalone/ai-gateway-client-LAB" && npm install --prefix server --no-audit --no-fund > /dev/null 2>&1 && npm install --prefix web --no-audit --no-fund > /dev/null 2>&1) \
    || step_detail "ai-gateway-client-LAB install failed (continue — start it by hand to see the error)."
  (cd "$root/standalone/mcp-demo-client-privilege-LAB" && npm install --no-package-lock --no-audit --no-fund > /dev/null 2>&1) \
    || step_detail "mcp-demo-client-privilege-LAB install failed."
  (cd "$root/standalone/privilege-a2a-anthropic-demo-LAB" && npm ci --no-audit --no-fund > /dev/null 2>&1) \
    || step_detail "privilege-a2a-anthropic-demo-LAB install failed."
  step_ok
fi

# ---- 9. Shelf URL + UI standard + env + launcher -----------------------------
step "Shelf URL"
# Every app serves the "Shelf" button from GET /api/shelf, which reads SHELF_URL from the
# shared settings file. Save it here once, so all apps find it (rulebook lesson: one .env).
env_file="${STANDALONE_ENV:-$HOME/Development/.env}"
mkdir -p "$(dirname "$env_file")"
shelf_default="https://local.ping-devops.com:8443"
if [ ! -f "$env_file" ]; then
  touch "$env_file" && chmod 600 "$env_file" 2>/dev/null || true
fi
if grep -q "^SHELF_URL=" "$env_file" 2>/dev/null; then
  step_ok "already set in $(basename "$env_file")"
else
  printf '\n# Demo shelf (launcher) URL — read by every app for the header "Shelf" button\nSHELF_URL=%s\n' "$shelf_default" >> "$env_file" \
    && step_ok "$shelf_default" \
    || { step_warn "could not write SHELF_URL to $env_file"; step_detail "Add it by hand:\n  echo 'SHELF_URL=$shelf_default' >> $env_file"; }
fi
# Export for this run: the labs' compose files pass SHELF_URL into their containers.
shellGREP="$(grep -E "^SHELF_URL=" "$env_file" | tail -1 | cut -d= -f2-)"
export SHELF_URL="${SHELF_URL:-$shellGREP}"

step "UI standard + env"
ui_out="$("$root/scripts/check-ui-standard.sh" 2>&1)" || step_detail "$ui_out"
# The shared settings file lives at ~/Development/.env (the family convention). Make sure
# the folder exists even if the repo was cloned elsewhere.
mkdir -p "$HOME/Development"
env_out="$("$root/scripts/check-env.sh" 2>&1)" || step_detail "$env_out"
[ -n "$(printf '%s' "$ui_out$env_out")" ] && step_warn "issues found (details below)" || step_ok

step "Shared services"
# Every shared/<svc>/docker-compose.yml is per-host infra the labs reuse (rule 20: ping-shared's
# network + cimd-doc-server, the log collector, ...). Bring each one up so a new service ships
# by adding its folder. lab-proxy is the watchdog's job (next step). A service whose compose
# demands settings (${VAR:?...}) waits until its own .env exists — never a half-configured start.
svc_up=""; svc_skip=""; svc_fail=""
for f in "$root"/shared/*/docker-compose.yml; do
  [ -f "$f" ] || continue
  svc_dir="$(dirname "$f")"; svc="$(basename "$svc_dir")"
  [ "$svc" = "lab-proxy" ] && continue
  # compose itself says whether every required setting resolves (from .env or the shell)
  if ! (cd "$svc_dir" && docker compose config -q > /dev/null 2>&1); then svc_skip="$svc_skip $svc"; continue; fi
  if [ "$dry_run" = 1 ]; then echo "    would run: docker compose -f shared/$svc/docker-compose.yml up -d"; svc_up="$svc_up $svc"; continue; fi
  if (cd "$svc_dir" && perl -e 'alarm 300; exec @ARGV' docker compose up -d > "/tmp/standalone-shared-$svc.log" 2>&1); then
    svc_up="$svc_up $svc"
  else
    svc_fail="$svc_fail $svc"
  fi
done
[ -n "$svc_skip" ] && step_detail "Not configured yet (fill in .env from .env.example in each, then re-run):$(for s in $svc_skip; do printf '\n  shared/%s' "$s"; done)"
[ -n "$svc_fail" ] && step_detail "Failed to start (log: /tmp/standalone-shared-<name>.log):$svc_fail"
if [ -n "$svc_fail" ]; then step_warn "up:${svc_up:- none}"; else step_ok "up:${svc_up:- none}${svc_skip:+ (skipped:$svc_skip)}"; fi

step "Launcher"
# All apps are served through ONE domain, already in /etc/hosts - no new hosts entries, ever.
#   https://local.ping-devops.com:8443            -> the shelf (launcher)
#   https://local.ping-devops.com:8443/<app>/     -> each app
# The proxy needs the apps' Docker networks, so it starts after the first apps are up. Try it, don't fail the setup.
# The watchdog also installs a launchd agent (RunAtLoad + every 5 min) so a reboot never leaves the
# launcher down, and starts any lab containers a restart left exited. Users never see ERR_CONNECTION_REFUSED.
if "$root/scripts/lab-proxy-watchdog.sh" > /dev/null 2>&1; then
  step_ok "https://local.ping-devops.com:8443 (launchd agent keeps it up)"
else
  step_warn "not serving yet — it retries every 5 min, or run scripts/lab-proxy-watchdog.sh"
fi

# ---- --start: bring labs up -------------------------------------------------
# lab_compose_file <lab-dir>: the compose file that deploys a lab, as an absolute path. Same
# source as the shelf's Start button — the shelf seed's composeFile (relative to standalone/) —
# so a new lab deploys as soon as its shelf entry lands; falls back to the usual spots in the dir.
lab_compose_file() {
  local app="$1" seed="$root/standalone/demo-shelf-LAB/data/demos.json" f
  if [ -f "$seed" ]; then
    f="$(node -e '
      const [seed, app] = process.argv.slice(1);
      const d = JSON.parse(require("fs").readFileSync(seed, "utf8"));
      const hit = (d.demos || d).find((x) => (x.composeFile || "").split("/")[0] === app);
      if (hit) console.log(hit.composeFile);' "$seed" "$app" 2>/dev/null)"
    [ -n "$f" ] && [ -f "$root/standalone/$f" ] && { echo "$root/standalone/$f"; return 0; }
  fi
  for f in docker-compose.yml compose.yml deploy/docker-compose.yml; do
    [ -f "$root/standalone/$app/$f" ] && { echo "$root/standalone/$app/$f"; return 0; }
  done
  return 1
}
# Compose files of the projects running now (one per line), so "already up" is exact, not a name guess.
running_compose_files() {
  docker compose ls --format json 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{for(const p of JSON.parse(s||"[]"))for(const f of String(p.ConfigFiles||"").split(","))console.log(f)})' 2>/dev/null || true
}
start_one() {
  local app="$1" dir="$root/standalone/$1" script compose
  if [ ! -d "$dir" ]; then echo "  no such lab dir: standalone/$1"; return 1; fi
  # Docker first (rulebook: every lab ships a local Docker standalone). Run compose from the
  # file's own folder, exactly like the shelf does, so relative paths and .env resolve the same.
  if [ "$app" != "demo-shelf-LAB" ] && compose="$(lab_compose_file "$app")"; then
    if [ "$dry_run" = 1 ]; then echo "  $1: would run docker compose -f ${compose#"$root/"} up -d"; return 0; fi
    if (cd "$(dirname "$compose")" && perl -e 'alarm 600; exec @ARGV' docker compose -f "$compose" up -d > "/tmp/standalone-$1.log" 2>&1); then
      echo "  $1: docker compose up (${compose#"$root/standalone/"})"
    else
      echo "  $1: docker compose failed — log: /tmp/standalone-$1.log"
    fi
    return 0
  fi
  # No compose file: the lab's own start script (the shelf has `npm run docker`, its compose wrapper).
  for script in docker docker:up start; do
    if [ -f "$dir/package.json" ] && node -e "const p=require('$dir/package.json'); process.exit(p.scripts && p.scripts['$script'] ? 0 : 1)" 2>/dev/null; then
      if [ "$dry_run" = 1 ]; then echo "  $1: would run npm run $script"; return 0; fi
      if [ "$script" = "start" ]; then
        # npm start = long-running node server; run it detached so the server keeps
        # living after this script returns, log to /tmp.
        if [ "$dry_run" = 1 ]; then echo "  $1: would start detached (npm start)"; return 0; fi
        (cd "$dir" && nohup npm start > "/tmp/standalone-$1.log" 2>&1 &)
        sleep 3
        if curl -sk --max-time 2 "http://localhost:${PORT:-3000}" > /dev/null 2>&1; then
          echo "  $1: started detached (log: /tmp/standalone-$1.log)"
        else
          echo "  $1: launched detached (log: /tmp/standalone-$1.log)"
        fi
        return 0
      fi
      # npm run docker = compose wrapper that exits when done; cap at 3 min for safety.
      if (cd "$dir" && perl -e 'alarm 180; exec @ARGV' npm run "$script" > /dev/null 2>&1); then
        echo "  $1: npm run $script"
      else
        echo "  $1: npm run $script failed or timed out (cd standalone/$1 && npm run $script to see why)"
      fi
      return 0
    fi
  done
  if [ -f "$dir/docker-compose.yml" ] || [ -f "$dir/compose.yml" ]; then
    if [ "$dry_run" = 1 ]; then echo "  $1: would run docker compose up -d"; return 0; fi
    (cd "$dir" && docker compose up -d > /dev/null 2>&1) && echo "  $1: docker compose up" || echo "  $1: docker compose failed (run it there by hand)"
  else
    echo "  $1: no start script or compose file — check its README"
  fi
}
if [ "$start_all" = 1 ]; then
  # Every lab at once is heavy: warn on small-RAM Macs and point at the lighter option.
  if [ "$(uname -s)" = "Darwin" ]; then
    ram_gb=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1073741824 ))
    if [ "$ram_gb" -gt 0 ] && [ "$ram_gb" -lt 16 ]; then
      echo "WARNING: this Mac has ${ram_gb} GB RAM; starting every lab at once may slow it down or run out of memory."
      echo "  Lighter: scripts/setup.sh --start-top 10   (your 10 most recently used labs)"
      echo "  Or start one: scripts/setup.sh --start <lab-dir>"
    fi
  fi
  echo "Starting all labs (skipping ones already running):"
  up_files="$(running_compose_files)"
  for d in "$root"/standalone/*/; do
    app="$(basename "$d")"
    # already running? match the lab's compose file against `docker compose ls`
    if compose="$(lab_compose_file "$app")" && printf '%s\n' "$up_files" | grep -qxF "$compose"; then
      echo "  $app: already running"; continue
    fi
    [ "$app" = "demo-shelf-LAB" ] && docker ps --format '{{.Names}}' 2>/dev/null | grep -qi shelf && { echo "  $app: already running"; continue; }
    start_one "$app"
  done
elif [ -n "$start_app" ]; then
  echo "Starting $start_app:"
  start_one "$start_app"
elif [ -n "${start_top:-}" ]; then
  # Start the N most recently used labs from the shelf's last-running set (the shelf's
  # start agent records every start/stop to .data/last-running.json). LRU-first order.
  top="${start_top:-10}"
  case "$top" in ''|*[!0-9]*) top=10 ;; esac
  last_file="$root/standalone/demo-shelf-LAB/.data/last-running.json"
  if [ ! -f "$last_file" ]; then
    echo "No last-running set yet ($last_file missing) — start labs from the shelf and they will be remembered."
  else
    echo "Starting the $top most recently used labs:"
    ids=$(node -e "
      const d = JSON.parse(require('fs').readFileSync('$last_file', 'utf8'));
      const ids = (d.demos || []).slice(0, $top).map((e) => e.id).reverse();
      console.log(ids.join(' '));" 2>/dev/null)
    for id in $ids; do
      # registry id -> lab dir: the seed uses the repo minus -LAB, but demos.local.json may
      # differ; resolve via the registry entry's composeFile path when present.
      dir=$(node -e "
        const fs = require('fs');
        const d = JSON.parse(fs.readFileSync('$last_file', 'utf8'));
        void d;
        const reg = JSON.parse(fs.readFileSync('$root/standalone/demo-shelf-LAB/.data/demos.local.json', 'utf8'));
        const demo = (reg.demos || []).find((x) => x.id === '$id');
        if (demo && demo.composeFile) {
          const p = demo.composeFile.startsWith('/') ? demo.composeFile : require('path').join('$root/standalone', demo.composeFile);
          console.log(require('path').dirname(require('path').resolve(p)));
        }" 2>/dev/null)
      if [ -n "$dir" ] && [ -f "$dir/docker-compose.yml" ]; then
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -qi "$(basename "$dir")"; then
          echo "  $id: already running"; continue
        fi
        (cd "$dir" && docker compose up -d > /dev/null 2>&1) && echo "  $id: started ($dir)" || echo "  $id: docker compose failed (run it there by hand)"
      else
        echo "  $id: no compose file found — start it from the shelf"
      fi
    done
  fi
fi

# ---- network-pool headroom ---------------------------------------------------
# Docker's default pool holds ~31 user networks; every compose project takes one. Warn before
# the cryptic daemon error, and offer the prune.
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  nets=$(docker network ls --format '{{.Name}}' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$nets" -ge 28 ]; then
    echo "WARNING: docker network pool nearly full ($nets networks)."
    echo "  Fix: docker network prune -f   (removes only unused networks)"
    echo "  Or raise default-address-pools in the docker daemon settings."
  fi
fi

# ---- what's new: labs added/removed since the last run ----------------------
# Tell the user how many new apps arrived and their names BEFORE the browser
# opens, so the update is visible in the console. Baseline is the pinned lab
# list from origin/main as of the previous run (saved in .bootstrap-labs);
# a first run has no baseline and just reports the total.
new_labs_file="$root/.bootstrap-labs"
if [ -f "$new_labs_file" ]; then
  added="$(comm -13 <(sort "$new_labs_file") <(git -C "$root" submodule status | awk '{print $2}' | sort))"
  removed="$(comm -23 <(sort "$new_labs_file") <(git -C "$root" submodule status | awk '{print $2}' | sort))"
  added_n="$(printf '%s' "$added" | grep -c . || true)"
  removed_n="$(printf '%s' "$removed" | grep -c . || true)"
  if [ "$added_n" -gt 0 ]; then
    printf "\n${C_B}  %s new app(s) in this update:${C_0}\n" "$added_n"
    printf '%s\n' "$added" | sed 's/^/    + /'
  fi
  if [ "$removed_n" -gt 0 ]; then
    printf "\n${C_Y}  %s app(s) removed:${C_0}\n" "$removed_n"
    printf '%s\n' "$removed" | sed 's/^/    - /'
  fi
  [ "$added_n" = 0 ] && [ "$removed_n" = 0 ] && echo "  No new apps since the last run."
fi
git -C "$root" submodule status | awk '{print $2}' | sort > "$new_labs_file" 2>/dev/null || true

# ---- open the shelf in the browser ------------------------------------------
if [ "$dry_run" != 1 ]; then
  if [ "$(uname -s)" = "Darwin" ]; then
    open "https://local.ping-devops.com:8443" 2>/dev/null && browser_opened=1 || browser_opened=0
  fi
fi

# ---- summary ----------------------------------------------------------------
mode="mock (no PingOne env)"
grep -q "^PINGONE_ENVIRONMENT_ID=" "${STANDALONE_ENV:-$HOME/Development/.env}" 2>/dev/null && mode="live (PingOne env configured)"
proxy="up"
curl -sk --max-time 2 https://local.ping-devops.com:8443/api/health > /dev/null 2>&1 || proxy="starting (retries every 5 min)"
labs="$(git -C "$root" submodule status | wc -l | tr -d ' ')"
running="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -ci "lab\|shelf" || true)"

printf "\n${C_B}"
printf '  ──────────────────────────────────────────────────────\n'
printf '  Setup complete\n'
printf '  ──────────────────────────────────────────────────────\n'
printf "${C_0}"
printf "  Mode      %s\n" "$mode"
printf "  Labs      %s initialized, ~%s containers running\n" "$labs" "$running"
printf "  Launcher  %s\n" "$proxy"
[ "${browser_opened:-0}" = "1" ] && printf "  Browser   shelf opened in your browser\n"
printf "            ${C_B}https://local.ping-devops.com:8443${C_0}\n"
printf "\n"
printf "  Next:\n"
printf "    Open the shelf in a browser:  ${C_B}https://local.ping-devops.com:8443${C_0}\n"
printf "    Or start one lab:             ${C_B}scripts/setup.sh --start <lab-dir>${C_0}\n"
printf "    List labs: ${C_DIM}ls standalone/${C_0}   Status/drift: ${C_DIM}scripts/check-drift.sh${C_0}\n"
printf "    ${C_DIM}Many labs running? Lower OrbStack's memory in Settings > System.${C_0}\n"
if [ "$mode" != "${mode#mock}" ]; then
  printf "    For live mode later: ${C_DIM}scripts/pingone-setup.sh${C_0}\n"
fi
