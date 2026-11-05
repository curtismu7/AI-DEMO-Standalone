#!/usr/bin/env bash
# pingone-setup.sh — create a dedicated PingOne demo environment and write the
# standalone labs' shared settings file (~/Development/.env).
#
# What the user does by hand (once, in the PingOne console):
#   1. In the Administrators environment: create a Worker app
#      (Applications -> + -> Worker, Client Secret Basic, enabled) and grant it
#      the organization roles that allow environment creation
#      (Organization Admin, or at minimum an environment-creation role).
#   2. Copy that worker's client ID + secret, and note the Administrators
#      environment ID (the env id in the console URL) and the region.
#
# What this script then does (no console needed):
#   1. Mints an org token with those worker creds.
#   2. Picks an active license with the demo's entitlements.
#   3. Creates a dedicated SANDBOX environment (SSO, MFA, DaVinci, Authorize).
#   4. Mints a Worker app (Identity Data Admin) inside the new environment.
#   5. Writes ~/Development/.env (mode 600) with the new env id + worker creds.
#
# After this: run scripts/bootstrap.sh — every lab reads the same .env.
#
# Env-var overrides (scripted runs): PINGONE_ADMIN_ENV_ID, PINGONE_REGION,
# PINGONE_WORKER_CLIENT_ID, PINGONE_WORKER_CLIENT_SECRET, ASSUME_YES=1.
set -euo pipefail
# CLI flags (each optional; anything not passed is asked interactively):
#   --region com|eu|ca|asia
#   --admin-env-id <Administrators environment ID>
#   --client-id <worker client id>
#   --client-secret <worker client secret>

# ── style ─────────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=''; RED=''; GREEN=''; BLUE=''; RESET=''
fi
info() { echo "${BLUE}${BOLD}==>${RESET} $*"; }
ok()   { echo "${GREEN}✓${RESET}  $*"; }
err()  { echo "${RED}✗${RESET} $*" >&2; }
fatal() { err "$*"; exit 1; }

ask() { # ask <prompt> <envvar-name>
  local prompt="$1" var="$2" answer=""
  if [[ -n "${!var:-}" ]]; then info "$prompt (from environment)"; return 0; fi
  if [[ -t 0 ]]; then read -r -p "$prompt" answer
  elif [[ -r /dev/tty ]]; then read -r -p "$prompt" answer </dev/tty
  else fatal "cannot prompt (no terminal). Set $var and re-run."; fi
  [[ -z "$answer" ]] && fatal "a value is required."
  printf -v "$var" '%s' "$answer"
}

ask_secret() { # ask_secret <prompt> <envvar-name>
  local prompt="$1" var="$2" answer=""
  if [[ -n "${!var:-}" ]]; then info "$prompt (from environment)"; return 0; fi
  if [[ -t 0 ]]; then read -rs -p "$prompt" answer; echo
  elif [[ -r /dev/tty ]]; then read -rs -p "$prompt" answer </dev/tty; echo
  else fatal "cannot prompt (no terminal). Set $var and re-run."; fi
  [[ -z "$answer" ]] && fatal "a value is required."
  printf -v "$var" '%s' "$answer"
}

ENV_FILE="${STANDALONE_ENV:-$HOME/Development/.env}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      cat <<'USAGE'
Creates a dedicated PingOne demo environment and writes ~/Development/.env.

Usage: scripts/pingone-setup.sh [options]

You need (once, in the PingOne console's Administrators environment):
  a Worker app (Client Secret Basic, enabled, Organization Admin role).

Options (anything omitted is asked interactively):
  --region <com|eu|ca|asia>
  --admin-env-id <Administrators environment ID>
  --client-id <worker client ID>
  --client-secret <worker client secret>

Creates: SANDBOX environment (SSO, MFA, DaVinci, Authorize) + a per-environment
Identity Data Admin worker. Writes ~/Development/.env (mode 600).
USAGE
      exit 0 ;;
    --region) PINGONE_REGION="$2"; shift 2 ;;
    --admin-env-id) PINGONE_ADMIN_ENV_ID="$2"; shift 2 ;;
    --client-id) PINGONE_WORKER_CLIENT_ID="$2"; shift 2 ;;
    --client-secret) PINGONE_WORKER_CLIENT_SECRET="$2"; shift 2 ;;
    *) err "unknown argument: $1 (usage: pingone-setup.sh [--region R] [--admin-env-id ID] [--client-id ID] [--client-secret SECRET])"; exit 2 ;;
  esac
done

echo ""
echo "${BOLD}Standalone labs — PingOne environment setup${RESET}"
echo "──────────────────────────────────────────────"
echo "  In the PingOne console (Administrators environment) create a Worker app:"
echo "    Applications → + → Worker · Client Secret Basic · enabled"
echo "    Roles: Organization Admin (so it can create environments)."
echo "  Then enter its credentials below. Everything else is automated."
echo ""

ask "PingOne region (com, eu, ca, asia): " PINGONE_REGION
PINGONE_REGION="${PINGONE_REGION:-com}"
ask "Administrators environment ID: " PINGONE_ADMIN_ENV_ID
ask "Worker client ID: " PINGONE_WORKER_CLIENT_ID
ask_secret "Worker client secret: " PINGONE_WORKER_CLIENT_SECRET

api="https://api.pingone.${PINGONE_REGION}/v1"
auth="https://auth.pingone.${PINGONE_REGION}"

# ── 1. org token ──────────────────────────────────────────────────────────────
info "Minting an organization token..."
# Tokens live on the AS host; the management API host rejects token POSTs
# (measured). Workers default to client_secret_basic — POST-body auth is
# rejected on current tenants (measured).
tok="$(curl -s --max-time 30 -X POST "$auth/$PINGONE_ADMIN_ENV_ID/as/token" \
  -u "$PINGONE_WORKER_CLIENT_ID:$PINGONE_WORKER_CLIENT_SECRET" \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=client_credentials')"
access="$(printf '%s' "$tok" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true)"
if [[ -z "$access" ]]; then
  err "Token mint failed:"
  printf '%s\n' "$tok" | sed 's/"access_token":"[^"]*"/"access_token":"<redacted>"/' >&2
  fatal "check the environment ID, worker client id/secret and region."
fi
ok "organization token minted"

# ── 2. license ────────────────────────────────────────────────────────────────
info "Looking for an active license with the demo's entitlements..."
org_id="$(curl -s --max-time 30 "$api/environments/$PINGONE_ADMIN_ENV_ID" \
  -H "authorization: Bearer $access" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("organization",{}).get("id",""))' 2>/dev/null || true)"
[[ -z "$org_id" ]] && fatal "could not resolve the organization id from the admin environment."
license_id="$(curl -s --max-time 30 "$api/organizations/$org_id/licenses" -H "authorization: Bearer $access" | python3 -c '
import sys, json, datetime
d = json.load(sys.stdin)
now = datetime.datetime.now(datetime.timezone.utc)
best, best_score = "", -1
for l in d.get("_embedded", {}).get("licenses", []):
    exp = l.get("expiresAt", "")
    try:
        if datetime.datetime.fromisoformat(exp.replace("Z", "+00:00")) < now: continue
    except Exception: pass
    if l.get("status") != "ACTIVE": continue
    score = sum([
        bool(l.get("privilege", {}).get("allowPrivilege")),
        bool(l.get("authorize", {}).get("allowDynamicAuthorization")),
        bool(l.get("orchestrate", {}).get("allowOrchestration")),
        bool(l.get("mfa", {}).get("allowMfaSignOnPolicies")),
        bool(l.get("environments", {}).get("allowProduction")),
    ])
    if score > best_score: best, best_score = l["id"], score
if not best or best_score < 3:
    sys.stderr.write("no active license with Authorize+Privilege+DaVinci entitlements\n")
    sys.exit(1)
print(best)' )" || fatal "license lookup failed."
ok "license found"

# ── 3. create the environment ─────────────────────────────────────────────────
ENV_NAME="Standalone Labs Demo"
# Name-collision safety: PingOne allows duplicate environment names, so a rerun
# would silently burn another license seat on an identically-named orphan. Look
# first; if one exists, ask whether to reuse it or create a fresh one anyway.
existing_env="$(curl -s --max-time 30 "$api/environments?filter=name%20eq%20%22$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$ENV_NAME")%22" \
  -H "authorization: Bearer $access" \
  | python3 -c '
import sys, json
try:
    envs = json.load(sys.stdin).get("_embedded", {}).get("environments", [])
except Exception:
    envs = []
print(envs[0]["id"] if envs else "")' 2>/dev/null || true)"
new_env=""
if [[ -n "$existing_env" ]]; then
  ok "an environment named \"$ENV_NAME\" already exists: $existing_env"
  if [[ -t 0 || -r /dev/tty ]]; then
    read -r -p "Reuse it (r), or create a new one anyway (n)? [r/n, default r] " reuse_answer </dev/tty 2>/dev/null || reuse_answer="r"
  else
    reuse_answer="${ASSUME_REUSE:-r}"
  fi
  if [[ "${reuse_answer:-r}" != "n" && "${reuse_answer:-r}" != "N" ]]; then
    new_env="$existing_env"
    ok "reusing the existing environment"
  fi
fi
if [[ -z "$new_env" ]]; then
info "Creating the SANDBOX demo environment (SSO, MFA, DaVinci, Authorize)..."
# Constraints measured live: name allows only letters/digits/space/-/_/./';
# SANDBOX licenses reject PING_ONE_FRAUD (Privilege is not a BOM product).
env_json="$(curl -s --max-time 60 -X POST "$api/environments" \
  -H "authorization: Bearer $access" -H 'content-type: application/json' \
  -d '{"name":"'"$ENV_NAME"'","region":"'"$(printf '%s' "$PINGONE_REGION" | tr 'a-z' 'A-Z' | sed 's/COM\.AU/COM_AU/')"'",
       "type":"SANDBOX","description":"Created by AI-DEMO-Standalone pingone-setup.sh",
       "license":{"id":"'"$license_id"'"},
       "billOfMaterials":{"products":[{"type":"PING_ONE_BASE"},{"type":"PING_ONE_MFA"},{"type":"PING_ONE_DAVINCI"},{"type":"PING_ONE_AUTHORIZE"}]}}')"
new_env="$(printf '%s' "$env_json" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id",""))' 2>/dev/null || true)"
if [[ -z "$new_env" ]]; then
  err "Environment creation failed:"
  printf '%s\n' "$env_json" >&2
  exit 1
fi
ok "environment created: $new_env"
fi

# ── 4. per-env worker ─────────────────────────────────────────────────────────
# On the reuse path the env may already carry the worker from a previous run:
# look it up first; mint a fresh one only when absent. A re-mint on reuse would
# strand the old app and its role assignment.
app_id=""
if [[ -n "${reuse_answer:-}" && "${reuse_answer:-r}" != "n" && "${reuse_answer:-r}" != "N" ]]; then
  app_id="$(curl -s --max-time 30 "$api/environments/$new_env/applications?filter=name%20eq%20%22Standalone%20Labs%20Worker%22" \
    -H "authorization: Bearer $access" \
    | python3 -c '
import sys, json
try:
    apps = json.load(sys.stdin).get("_embedded", {}).get("applications", [])
except Exception:
    apps = []
print(apps[0]["id"] if apps else "")' 2>/dev/null || true)"
  [[ -n "$app_id" ]] && ok "existing worker found: $app_id (secret will be re-minted; the old secret stops working)"
fi
if [[ -z "$app_id" ]]; then
info "Minting a Worker app (Identity Data Admin) in the new environment..."
app_json="$(curl -s --max-time 30 -X POST "$api/environments/$new_env/applications" \
  -H "authorization: Bearer $access" -H 'content-type: application/json' \
  -d '{"name":"Standalone Labs Worker","description":"Worker for the standalone labs","protocol":"OPENID_CONNECT","type":"WORKER","enabled":true,"grantTypes":["CLIENT_SECRET_BASIC"],"grantTypes":["CLIENT_CREDENTIALS"],"tokenEndpointAuthMethod":"CLIENT_SECRET_BASIC"}')"
app_id="$(printf '%s' "$app_json" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id",""))' 2>/dev/null || true)"
[[ -z "$app_id" ]] && { err "Worker app creation failed:"; printf '%s\n' "$app_json" >&2; exit 1; }
fi

roles_json="$(curl -s --max-time 30 "$api/roles?filter=name%20eq%20%22Identity%20Data%20Admin%22" -H "authorization: Bearer $access")"
role_id="$(printf '%s' "$roles_json" | python3 -c '
import sys, json
d = json.load(sys.stdin)
roles = d if isinstance(d, list) else d.get("_embedded", {}).get("roles", [])
print(next((r["id"] for r in roles if r.get("name") == "Identity Data Admin"), ""))' 2>/dev/null || true)"
[[ -z "$role_id" ]] && { err "could not resolve the Identity Data Admin role id:"; printf '%s\n' "$roles_json" >&2; exit 1; }
# Role assignment is /roleAssignments with an explicit scope (/roles 403s — measured).
assign="$(curl -s --max-time 30 -X POST "$api/environments/$new_env/applications/$app_id/roleAssignments" \
    -H "authorization: Bearer $access" -H 'content-type: application/json' \
    -d '{"role":{"id":"'"$role_id"'"},"scope":{"id":"'"$new_env"'","type":"ENVIRONMENT"}}')"
if printf '%s' "$assign" | grep -q 'UNIQUENESS_VIOLATION'; then
  info "role already assigned — continuing"
elif printf '%s' "$assign" | grep -q '"code"'; then
  err "role assignment failed:"; printf '%s\n' "$assign" >&2; exit 1
fi
# Secret mint is POST /secret (singular); the value lands in "secret".
secret="$(curl -s --max-time 30 -X POST "$api/environments/$new_env/applications/$app_id/secret" \
  -H "authorization: Bearer $access" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("secret",""))' 2>/dev/null || true)"
[[ -z "$secret" ]] && { err "secret mint failed:"; printf '%s\n' "$secret_json" >&2; exit 1; }
ok "worker minted in the new environment"

# ── 5. write the shared settings file ─────────────────────────────────────────
# Merge, never overwrite: this file is shared by every lab and the owner's other
# settings (AI Gateway, AgentCore, PF, JIT keys) live here too. Only this
# script's own keys are replaced; everything else is preserved.
mkdir -p "$(dirname "$ENV_FILE")"
umask 177
backup="$ENV_FILE.bak.$(date +%Y%m%d-%H%M%S)"
[[ -f "$ENV_FILE" ]] && cp "$ENV_FILE" "$backup" && ok "previous settings backed up: $backup"
new_keys=$(mktemp)
{
  echo "PINGONE_ENVIRONMENT_ID=$new_env"
  echo "PINGONE_REGION=$PINGONE_REGION"
  # Both key-name conventions: some labs read WORKER_CLIENT_ID/SECRET, others
  # (ciba-hitl-lab) read WORKER_ID/WORKER_SECRET.
  echo "PINGONE_WORKER_CLIENT_ID=$app_id"
  echo "PINGONE_WORKER_CLIENT_SECRET=$secret"
  echo "PINGONE_WORKER_ID=$app_id"
  echo "PINGONE_WORKER_SECRET=$secret"
} > "$new_keys"
if [[ -f "$ENV_FILE" ]]; then
  python3 - "$ENV_FILE" "$new_keys" <<'PYEOF'
import sys
main, update = sys.argv[1], sys.argv[2]
fresh = dict(line.split("=", 1) for line in open(update).read().splitlines() if "=" in line)
kept = {}
for line in open(main).read().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.split("=", 1)
        if k not in fresh:
            kept[k] = line
with open(main, "w") as f:
    f.write("# Standalone labs shared settings (merged by scripts/pingone-setup.sh).\n")
    for k, v in fresh.items():
        f.write(f"{k}={v}\n")
    for line in kept.values():
        f.write(line + "\n")
PYEOF
else
  cp "$new_keys" "$ENV_FILE"
fi
rm -f "$new_keys"
chmod 600 "$ENV_FILE"
ok "settings written: $ENV_FILE (mode 600)"

echo ""
ok "Done. Now run:  scripts/bootstrap.sh"
echo "  Every lab reads PINGONE_ENVIRONMENT_ID/REGION from that file; the worker"
echo "  creds above stay in it for labs that provision their own resources."
