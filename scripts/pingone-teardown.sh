#!/usr/bin/env bash
# pingone-teardown.sh — delete the dedicated demo PingOne environment created by
# pingone-setup.sh and clean up the shared settings file (~/Development/.env).
#
# What it does:
#   1. Reads the admin-worker credentials (from ~/Development/.env or flags).
#   2. Mints an organization token.
#   3. Resolves the target environment: PINGONE_ENVIRONMENT_ID by default, or
#      by name with --name "Standalone Labs Demo" (picks the oldest match and
#      says so), or an explicit --env-id.
#   4. Shows what will be deleted and asks for confirmation (type the env id,
#      or --yes to skip; ASSUME_YES=1 works too).
#   5. DELETEs the environment (org worker with an environment-admin role).
#   6. Removes the PingOne keys this environment owns from ~/Development/.env
#      (merge-style: only the environment-scoped keys; other settings survive),
#      after backing the file up. With --keep-env-file nothing is written.
#
# Does NOT touch: docker containers, other labs' data, or any other PingOne
# environment. Deleting an environment is irreversible — its users, apps,
# configs and DaVinci flows are gone.
#
# Env-var overrides (scripted runs): PINGONE_ADMIN_ENV_ID, PINGONE_REGION,
# PINGONE_ADMIN_CLIENT_ID, PINGONE_ADMIN_CLIENT_SECRET, ASSUME_YES=1,
# STANDALONE_ENV (moves the settings file).
set -euo pipefail

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=''; RED=''; GREEN=''; BLUE=''; RESET=''
fi
info() { echo "${BLUE}${BOLD}==>${RESET} $*"; }
ok()   { echo "${GREEN}✓${RESET}  $*"; }
err()  { echo "${RED}✗${RESET} $*" >&2; }
fatal() { err "$*"; exit 1; }

ENV_FILE="${STANDALONE_ENV:-$HOME/Development/.env}"
# The admin (org worker) credentials live in ~/Documents/.env, written by
# pingone-setup.sh. Source it so the prompts below are skipped when present.
CRED_FILE="${STANDALONE_CRED_FILE:-$HOME/Documents/.env}"
if [[ -f "$CRED_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CRED_FILE"
  set +a
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      cat <<'USAGE'
Deletes the dedicated demo PingOne environment and cleans up ~/Development/.env.

Usage: scripts/pingone-teardown.sh [options]

Target environment (first match wins):
  (default)          the PINGONE_ENVIRONMENT_ID from ~/Development/.env
  --name <name>      the oldest environment with this display name
  --env-id <id>      exactly this environment id

Options:
  --region <com|eu|ca|asia>     default: PINGONE_REGION from the settings file
  --admin-env-id <id>           Administrators environment (org worker lives here)
  --client-id <id>              org worker client id (Organization Admin role)
  --client-secret <secret>
  --yes                         skip the confirmation (ASSUME_YES=1 also works)
  --keep-env-file               do not touch ~/Development/.env
  --dry-run                     resolve and show the target, delete nothing

Deleting an environment is irreversible: its users, applications, populations,
policies and DaVinci flows are gone. Nothing else on this machine is touched.
USAGE
      exit 0 ;;
    --name) TARGET_NAME="$2"; shift 2 ;;
    --env-id) TARGET_ENV_ID="$2"; shift 2 ;;
    --region) PINGONE_REGION="$2"; shift 2 ;;
    --admin-env-id) PINGONE_ADMIN_ENV_ID="$2"; shift 2 ;;
    --client-id) PINGONE_ADMIN_CLIENT_ID="$2"; shift 2 ;;
    --client-secret) PINGONE_ADMIN_CLIENT_SECRET="$2"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    --keep-env-file) KEEP_ENV_FILE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) err "unknown argument: $1 (see --help)"; exit 2 ;;
  esac
done

# ── shared settings (read-only here; never echoed, never logged) ─────────────
if [[ -f "$ENV_FILE" ]]; then
  file_value() { # file_value <key> -> value or empty (does not print secrets to stdout beyond use)
    python3 - "$ENV_FILE" "$1" <<'PYEOF'
import sys
key = sys.argv[2]
for line in open(sys.argv[1]).read().splitlines():
    if line.startswith(key + "="):
        print(line.split("=", 1)[1], end="")
        break
PYEOF
  }
  : "${PINGONE_REGION:=$(file_value PINGONE_REGION)}"
  : "${PINGONE_ADMIN_ENV_ID:=$(file_value PINGONE_ADMIN_ENV_ID)}"
  : "${PINGONE_ADMIN_CLIENT_ID:=$(file_value PINGONE_ADMIN_CLIENT_ID)}"
  : "${PINGONE_ADMIN_CLIENT_SECRET:=$(file_value PINGONE_ADMIN_CLIENT_SECRET)}"
  [[ -z "${TARGET_ENV_ID:-}" && -z "${TARGET_NAME:-}" ]] && TARGET_ENV_ID="$(file_value PINGONE_ENVIRONMENT_ID)"
fi

ask() { # ask <prompt> <var>
  local prompt="$1" var="$2" answer=""
  if [[ -n "${!var:-}" ]]; then info "$prompt (from settings)"; return 0; fi
  if [[ -n "${DRY_RUN:-}" ]]; then fatal "dry run makes no prompts but $var is missing — set it, pass --region/--admin-env-id/--client-id/--client-secret, or let pingone-setup.sh write $CRED_FILE."; fi
  if [[ -t 0 ]]; then read -r -p "$prompt" answer
  elif [[ -r /dev/tty ]]; then read -r -p "$prompt" answer </dev/tty
  else fatal "cannot prompt (no terminal). Set $var or pass flags (see --help)."; fi
  [[ -z "$answer" ]] && fatal "a value is required."
  printf -v "$var" '%s' "$answer"
}
ask_secret() {
  local prompt="$1" var="$2" answer=""
  if [[ -n "${!var:-}" ]]; then info "$prompt (from settings)"; return 0; fi
  if [[ -n "${DRY_RUN:-}" ]]; then fatal "dry run makes no prompts but $var is missing — set it, pass --client-secret, or let pingone-setup.sh write $CRED_FILE."; fi
  if [[ -t 0 ]]; then read -rs -p "$prompt" answer; echo
  elif [[ -r /dev/tty ]]; then read -rs -p "$prompt" answer </dev/tty; echo
  else fatal "cannot prompt (no terminal). Set $var or pass flags (see --help)."; fi
  [[ -z "$answer" ]] && fatal "a value is required."
  printf -v "$var" '%s' "$answer"
}

echo ""
echo "${BOLD}Standalone labs — PingOne environment teardown${RESET}"
echo "─────────────────────────────────────────────────"
ask "PingOne region (com, eu, ca, asia): " PINGONE_REGION
PINGONE_REGION="${PINGONE_REGION:-com}"
ask "Administrators environment ID: " PINGONE_ADMIN_ENV_ID
ask "Org worker client ID: " PINGONE_ADMIN_CLIENT_ID
ask_secret "Org worker client secret: " PINGONE_ADMIN_CLIENT_SECRET

api="https://api.pingone.${PINGONE_REGION}/v1"
auth="https://auth.pingone.${PINGONE_REGION}"

# ── 1. org token ──────────────────────────────────────────────────────────────
info "Minting an organization token..."
tok="$(curl -s --max-time 30 -X POST "$auth/$PINGONE_ADMIN_ENV_ID/as/token" \
  -u "$PINGONE_ADMIN_CLIENT_ID:$PINGONE_ADMIN_CLIENT_SECRET" \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=client_credentials')"
access="$(printf '%s' "$tok" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true)"
if [[ -z "$access" ]]; then
  err "Token mint failed:"
  printf '%s\n' "$tok" | sed 's/"access_token":"[^"]*"/"access_token":"<redacted>"/' >&2
  fatal "check the environment ID, worker client id/secret and region."
fi
ok "organization token minted"

# ── 2. resolve the target environment ─────────────────────────────────────────
if [[ -n "${TARGET_NAME:-}" ]]; then
  info "Looking up environments named \"$TARGET_NAME\"..."
  TARGET_ENV_ID="$(curl -s --max-time 30 "$api/environments?filter=name%20eq%20%22$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$TARGET_NAME")%22" \
    -H "authorization: Bearer $access" \
    | python3 -c '
import sys, json
try:
    envs = json.load(sys.stdin).get("_embedded", {}).get("environments", [])
except Exception:
    envs = []
# Oldest first: the first env this setup script created is the teardown default.
envs.sort(key=lambda e: e.get("createdAt", ""))
print(envs[0]["id"] if envs else "")' 2>/dev/null || true)"
  [[ -z "$TARGET_ENV_ID" ]] && fatal "no environment named \"$TARGET_NAME\" found in this organization."
  ok "resolved by name: $TARGET_ENV_ID (oldest match)"
fi
[[ -z "${TARGET_ENV_ID:-}" ]] && fatal "no target environment: pass --env-id, --name, or have PINGONE_ENVIRONMENT_ID in $ENV_FILE."

env_json="$(curl -s --max-time 30 -o /tmp/p1-lookup-$$ -w '%{http_code}' "$api/environments/$TARGET_ENV_ID" -H "authorization: Bearer $access")"
lookup_body="$(cat /tmp/p1-lookup-$$ 2>/dev/null || true)"
: > /tmp/p1-lookup-$$ 2>/dev/null || true
if [[ "$env_json" == "401" || "$env_json" == "403" ]]; then
  err "the org worker cannot read environment $TARGET_ENV_ID (HTTP $env_json)."
  fatal "check that the worker has an organization-wide admin role and that the region is right."
elif [[ "$env_json" != "200" ]]; then
  err "environment lookup failed (HTTP $env_json):"
  printf '%s\n' "$lookup_body" | sed 's/"access_token":"[^"]*"/"access_token":"<redacted>"/' >&2
  exit 1
fi
env_name="$(printf '%s' "$lookup_body" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("name",""))' 2>/dev/null || true)"
if [[ -z "$env_name" ]]; then
  fatal "environment $TARGET_ENV_ID not found in region $PINGONE_REGION (or the org worker cannot see it)."
fi

echo ""
echo "${BOLD}Will DELETE:${RESET}"
echo "  environment: $env_name ($TARGET_ENV_ID, region $PINGONE_REGION)"
echo "  everything inside it: users, apps, populations, policies, DaVinci flows."
echo "  This is irreversible."
[[ -n "${KEEP_ENV_FILE:-}" ]] || echo "  settings file: PingOne env keys removed from $ENV_FILE (backup kept)"
echo ""
if [[ -n "${DRY_RUN:-}" ]]; then
  ok "dry run: nothing deleted, settings file untouched."
  exit 0
fi
if [[ -z "${ASSUME_YES:-}" ]]; then
  if [[ -t 0 || -r /dev/tty ]]; then
    read -r -p "Type the environment id to confirm deletion: " confirm </dev/tty 2>/dev/null || confirm=""
    [[ "$confirm" == "$TARGET_ENV_ID" ]] || fatal "confirmation did not match — aborted, nothing deleted."
  else
    fatal "refusing to delete without confirmation: pass --yes (or ASSUME_YES=1) for scripted runs."
  fi
fi

# ── 3. delete ─────────────────────────────────────────────────────────────────
info "Deleting environment $TARGET_ENV_ID..."
del_code="$(curl -s --max-time 60 -o /tmp/p1-teardown-$$ -w '%{http_code}' -X DELETE "$api/environments/$TARGET_ENV_ID" -H "authorization: Bearer $access")"
del_body="$(cat /tmp/p1-teardown-$$ 2>/dev/null || true)"
: > /tmp/p1-teardown-$$ 2>/dev/null || true
# 202 accepted (async delete) and 204 are successes; 404 already gone is fine.
# 409 = deletion already in progress from an earlier run: nothing to do but report it.
if [[ "$del_code" == "202" || "$del_code" == "204" ]]; then
  ok "delete accepted (HTTP $del_code)"
elif [[ "$del_code" == "404" ]]; then
  ok "environment already gone (HTTP 404)"
elif [[ "$del_code" == "409" ]]; then
  ok "environment is already being deleted (HTTP 409) — PingOne finishes it asynchronously"
  ok "treat as done; verify in the console in a minute or rerun to confirm 404"
elif [[ "$del_code" == "403" ]]; then
  err "delete refused (HTTP 403): the org worker lacks the role to delete environments."
  err "fix: in the Administrators environment give the worker the Organization Admin role (or an environment-admin role with delete rights), then rerun."
  printf '%s\n' "$del_body" | sed 's/"access_token":"[^"]*"/"access_token":"<redacted>"/' >&2
  exit 1
else
  err "delete failed (HTTP $del_code):"
  printf '%s\n' "$del_body" | sed 's/"access_token":"[^"]*"/"access_token":"<redacted>"/' >&2
  exit 1
fi

# ── 4. clean the settings file ────────────────────────────────────────────────
if [[ -z "${KEEP_ENV_FILE:-}" && -f "$ENV_FILE" ]]; then
  backup="$ENV_FILE.bak.$(date +%Y%m%d-%H%M%S)"
  cp "$ENV_FILE" "$backup"
  ok "settings backed up: $backup"
  python3 - "$ENV_FILE" "$TARGET_ENV_ID" <<'PYEOF'
import sys
path, env_id = sys.argv[1], sys.argv[2]
# Keys this environment owned (pingone-setup.sh wrote them; the org-worker pair
# is kept: it is the ADMIN credential, not this environment's).
gone_exact = {
    f"PINGONE_ENVIRONMENT_ID={env_id}",
}
gone_prefix = ("PINGONE_WORKER_CLIENT_ID=", "PINGONE_WORKER_CLIENT_SECRET=",
               "PINGONE_WORKER_ID=", "PINGONE_WORKER_SECRET=")
out = []
dropped = []
for line in open(path).read().splitlines():
    k = line.split("=", 1)[0] if "=" in line else ""
    if line in gone_exact or (k in ("PINGONE_WORKER_CLIENT_ID", "PINGONE_WORKER_CLIENT_SECRET", "PINGONE_WORKER_ID", "PINGONE_WORKER_SECRET")):
        # Only drop the per-env worker keys if they belonged to THIS environment
        # is unknowable post-delete; the setup script always overwrote them with
        # the target env's worker, so they are this environment's by convention.
        dropped.append(k)
        continue
    out.append(line)
with open(path, "w") as f:
    for line in out:
        f.write(line + "\n")
if dropped:
    sys.stderr.write(f"removed keys: {', '.join(dict.fromkeys(dropped))}\n")
PYEOF
  chmod 600 "$ENV_FILE"
  ok "settings cleaned: $ENV_FILE"
else
  ok "settings file untouched"
fi

echo ""
ok "Done. The environment deletion completes asynchronously in PingOne."
echo "  If labs are still running: docker restart <lab> re-reads $ENV_FILE (now without the env)."
echo "  Recreate anytime with: scripts/pingone-setup.sh"
