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
#   3. Creates a dedicated SANDBOX environment (SSO, DaVinci, Authorize; add --with-pingone-mfa for MFA), or, with
#      --existing-env <id>, adopts one you made in the console with PingID (Workforce) and Privilege.
#   4. Mints a Worker app inside the new environment, trimmed to Identity Data Admin + Environment Admin there.
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
  BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; BLUE=$'\033[34m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
  BOLD=''; RED=''; GREEN=''; BLUE=''; YELLOW=''; RESET=''
fi
info() { echo "${BLUE}${BOLD}==>${RESET} $*"; }
ok()   { echo "${GREEN}✓${RESET}  $*"; }
err()  { echo "${RED}✗${RESET} $*" >&2; }
warn() { echo "${YELLOW}!${RESET}  $*"; }
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
ADMIN_USER=""
WITH_MFA=0
ADOPT_ENV="${PINGONE_EXISTING_ENV_ID:-}"   # an environment a person made in the console (PingID + Privilege)
API_CREATE=0                               # skip the question and make a basic environment through the API

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
  --admin-user <login>      your console login in the Administrators environment:
                            gets Identity Data Admin + Environment Admin on the new
                            environment (see docs/PRIVILEGE-ONE-ENV.md)
  --existing-env <id>       use an environment you already created in the PingOne console
                            (Workforce, PingID "create new", Privilege). RECOMMENDED for PingID and
                            Privilege: the API cannot make PingID work. Skips license lookup and creation.
  --api-create              make a basic environment through the API without asking (SSO, DaVinci,
                            Authorize; no PingID, no Privilege). What a run with no terminal does.
  --with-pingone-mfa        (API-created environments only) also add PingOne MFA. Default is without it,
                            because PingID (used by PingOne Privilege) cannot share an environment with it.

Creates: SANDBOX environment (SSO, DaVinci, Authorize; or adopts the one you made in the console) + a per-environment worker
holding Identity Data Admin and Environment Admin on that environment only.
Writes ~/Development/.env (mode 600).
USAGE
      exit 0 ;;
    --region) PINGONE_REGION="$2"; shift 2 ;;
    --admin-env-id) PINGONE_ADMIN_ENV_ID="$2"; shift 2 ;;
    --client-id) PINGONE_WORKER_CLIENT_ID="$2"; shift 2 ;;
    --client-secret) PINGONE_WORKER_CLIENT_SECRET="$2"; shift 2 ;;
    --admin-user) ADMIN_USER="$2"; shift 2 ;;
    --with-pingone-mfa) WITH_MFA=1; shift ;;
    --existing-env) ADOPT_ENV="$2"; shift 2 ;;
    --api-create) API_CREATE=1; shift ;;
    *) err "unknown argument: $1 (usage: pingone-setup.sh [--region R] [--admin-env-id ID] [--client-id ID] [--client-secret SECRET] [--admin-user LOGIN] [--existing-env ID | --api-create] [--with-pingone-mfa])"; exit 2 ;;
  esac
done
check_adopt_conflict() {
  if [[ -n "$ADOPT_ENV" && ( "$API_CREATE" == "1" || "$WITH_MFA" == "1" ) ]]; then
    fatal "an existing environment ($ADOPT_ENV, from --existing-env, PINGONE_EXISTING_ENV_ID in your shell, or the question) cannot be combined with --api-create or --with-pingone-mfa: it already has its products. Unset the variable or drop the flag."
  fi
}
check_adopt_conflict

echo ""
echo "${BOLD}Standalone labs — PingOne environment setup${RESET}"
echo "──────────────────────────────────────────────"
echo "  In the PingOne console (Administrators environment) create a Worker app:"
echo "    Applications → + → Worker · Client Secret Basic · enabled"
echo "    Roles: Organization Admin (so it can create environments)."
echo "  Then enter its credentials below. Everything else is automated."
echo ""

ask "PingOne region (na, eu, ca, asia): " PINGONE_REGION
PINGONE_REGION="${PINGONE_REGION:-na}"
# North America is the .com domain: accept "na" (the name people use) and map it to the TLD.
[[ "$(printf %s "$PINGONE_REGION" | tr A-Z a-z)" == "na" ]] && PINGONE_REGION=com
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
tok_rc=0
tok="$(curl -sS --max-time 30 -X POST "$auth/$PINGONE_ADMIN_ENV_ID/as/token" \
  -u "$PINGONE_WORKER_CLIENT_ID:$PINGONE_WORKER_CLIENT_SECRET" \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=client_credentials' 2>&1)" || tok_rc=$?
# Without this, set -e quit here with no message when curl itself failed (DNS,
# timeout, TLS, proxy) — the run just stopped after "Minting an organization token...".
[[ "$tok_rc" -ne 0 ]] && fatal "could not reach $auth (curl exit $tok_rc): $tok — check network/VPN/proxy and the region."
access="$(printf '%s' "$tok" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true)"
if [[ -z "$access" ]]; then
  err "Token mint failed:"
  printf '%s\n' "$tok" | sed 's/"access_token":"[^"]*"/"access_token":"<redacted>"/' >&2
  fatal "check the environment ID, worker client id/secret and region."
fi
ok "organization token minted"

# Early permission check: a worker with the wrong admin role mints a token fine
# and even passes a GET /organizations probe (Environment Admin org-scoped does),
# then fails much later with a cryptic ACCESS_FAILED on environment creation.
# So read the worker's actual role assignments and verify the ORGANIZATION-scoped
# role is Organization Admin — naming the role it did find when it isn't.
# (Role assignments live on the worker's app resource; listing them needs no
# special role beyond the worker itself — measured on tenants with the wrong role.)
worker_role_json="$(curl -s --max-time 30 "$api/environments/$PINGONE_ADMIN_ENV_ID/applications/$PINGONE_WORKER_CLIENT_ID/roleAssignments" \
  -H "authorization: Bearer $access")"
worker_roles_out="$(printf '%s' "$worker_role_json" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    assigns = d.get("_embedded", {}).get("roleAssignments", [])
except Exception:
    assigns = []
org_scoped = [a for a in assigns if a.get("scope", {}).get("type") == "ORGANIZATION"]
for a in org_scoped:
    print(a.get("role", {}).get("id", ""))' 2>/dev/null || true)"
if [[ -z "$worker_roles_out" ]]; then
  err "the Worker app you entered holds no organization-scoped admin role (HTTP check of its role assignments failed or returned none)."
  echo "" >&2
  echo "  Fix in the PingOne console (Administrators environment):" >&2
  echo "    Applications → your Worker → Roles → assign Organization Admin" >&2
  echo "    (scope: the Organization, not a single environment)" >&2
  echo "  Then re-run this script with the same credentials." >&2
  exit 1
fi
org_admin_role_id=""
worker_role_names=""
for rid in $worker_roles_out; do
  rname="$(curl -s --max-time 30 "$api/roles/$rid" -H "authorization: Bearer $access" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin).get("name",""))' 2>/dev/null || true)"
  worker_role_names="${worker_role_names:+$worker_role_names, }${rname:-unknown}"
  [[ "$rname" == "Organization Admin" ]] && org_admin_role_id="$rid"
done
# Creating an environment needs Organization Admin. Adopting one a person made in the console (--existing-env) only creates
# an app in it and assigns that app two roles, which Environment Admin at organization scope can do (measured 2026-11-24 on
# a console-made environment). So Environment Admin passes here, and a run that has to CREATE an environment stops below.
needs_org_admin=0
if [[ -n "$org_admin_role_id" ]]; then
  ok "worker has Organization Admin (organization scope)"
elif [[ ", $worker_role_names, " == *", Environment Admin, "* ]]; then
  needs_org_admin=1
  warn "the Worker app holds Environment Admin, not Organization Admin (organization scope: $worker_role_names). Enough to adopt an environment you made in the console (--existing-env); not enough to create one."
else
  err "the Worker app's organization-scoped roles are \"${worker_role_names:-unknown}\": Organization Admin is required (Environment Admin is enough only with --existing-env)."
  echo "" >&2
  echo "  Environment Admin alone cannot create environments (ACCESS_FAILED)." >&2
  echo "" >&2
  echo "  Fix in the PingOne console (Administrators environment):" >&2
  echo "    Applications → your Worker → Roles → replace it with Organization Admin" >&2
  echo "    (scope: the Organization, not a single environment)" >&2
  echo "  Then re-run this script with the same credentials." >&2
  exit 1
fi

# ── 1b. which environment? ────────────────────────────────────────────────────
# PingID cannot be made to work through the API: PingOne accepts PING_ONE_ID in the bill of materials but never provisions
# the PingID deployment (measured 2026-11-24: PINGID_AUTHENTICATION is refused with LICENSE_EXCEEDED, "PingID is disabled").
# And only the person who adds Privilege in the console becomes Privilege Administrator. So an environment that is to run
# PingID + Privilege is created by a PERSON in the console, and this script adopts it (--existing-env). With no terminal
# and no flag, the old behaviour stays: a basic environment through the API.
# A readable /dev/tty is not a terminal (ssh without -t, cron, CI): open it for real before printing a question.
have_tty=0; [[ -t 0 ]] && have_tty=1; { [[ "$have_tty" == 1 ]] || : </dev/tty; } 2>/dev/null && have_tty=1
configured_env=""
[[ -f "$ENV_FILE" ]] && configured_env="$(grep -m1 '^PINGONE_ENVIRONMENT_ID=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"
if [[ -z "$ADOPT_ENV" && "$API_CREATE" != "1" && -n "$configured_env" ]]; then
  # Never fall through to a basic environment when the configured one has PingID and Privilege: every lab would silently lose them.
  # (Quiet check: exit 0 means PingID Workforce with its deployment, Privilege and a SANDBOX.)
  # Exit 0 = PingID + Privilege; 1 = read fine, not one (a basic environment); anything else = could not tell, which must not
  # be treated as "basic" (a 503 here would let the run overwrite the configured environment). The same goes for a check that
  # cannot run at all (no node, or an id that is not an environment id, e.g. a hand-edited line): fail closed, never fall through.
  if ! command -v node >/dev/null 2>&1 || ! [[ "$configured_env" =~ ^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$ ]]; then
    err "PINGONE_ENVIRONMENT_ID in $ENV_FILE is set (\"$configured_env\") but it cannot be checked for PingID + Privilege (node missing, or the value is not an environment id), so this run will not risk replacing it."
    fatal "install Node 26 or fix the line; or re-run with --existing-env <id>, or --api-create to really switch to a basic environment."
  else
    guard_rc=0
    PINGONE_ACCESS_TOKEN="$access" PINGONE_REGION="$PINGONE_REGION" \
      node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pingone-admin.mjs" check-env --env "$configured_env" >/dev/null 2>&1 || guard_rc=$?
    if [[ "$guard_rc" == 0 ]]; then
      err "the configured environment $configured_env is a PingID + Privilege environment, and this run would replace it with a basic one."
      fatal "re-run with --existing-env $configured_env to refresh it (its lab worker secret is re-minted), or --api-create to really switch to a basic environment."
    elif [[ "$guard_rc" != 1 ]]; then
      err "could not read the configured environment $configured_env to see whether it has PingID + Privilege (check-env exit $guard_rc), so this run will not risk replacing it."
      fatal "retry; or re-run with --existing-env $configured_env to refresh it, or --api-create to really switch to a basic environment."
    fi
  fi
  info "an environment is already configured ($configured_env); pass --existing-env <id> to switch to one you made in the console."
fi
if [[ -z "$ADOPT_ENV" && "$API_CREATE" != "1" && -z "$configured_env" && "${ASSUME_YES:-}" != "1" && "${STANDALONE_NON_INTERACTIVE:-}" != "1" && "$have_tty" == 1 ]]; then
  echo ""
  echo "  ${BOLD}Which environment?${RESET}  PingID and PingOne Privilege cannot be created by a script."
  echo "  For the demos that approve with PingID or use Privilege, create the environment yourself first:"
  echo "    PingOne console → Environments → +"
  echo "      · Type Sandbox, a name you like, licence type Paid, use case ${BOLD}Workforce${RESET}"
  echo "      · Capabilities: PingOne SSO, DaVinci, Authorize, Risk, ${BOLD}PingID${RESET} → ${BOLD}Create new${RESET} (a new PingID account)"
  echo "        and ${BOLD}PingOne Privilege${RESET} → Authentication mode ${BOLD}No Endpoint Controller${RESET} (agentless). Do NOT add PingOne MFA."
  echo "      · Use your own admin login: whoever adds Privilege becomes Privilege Administrator and nobody can grant it later."
  echo "    Copy the environment ID from the console URL."
  echo "  Or press Enter to let this script create a basic environment (SSO, DaVinci, Authorize: no PingID, no Privilege)."
  read -r -p "Environment ID from the console (Enter = basic environment): " ADOPT_ENV </dev/tty 2>/dev/null || ADOPT_ENV=""
  ADOPT_ENV="$(printf '%s' "$ADOPT_ENV" | tr -d '[:space:]')"
  check_adopt_conflict
fi
if [[ -n "$ADOPT_ENV" ]]; then
  [[ "$ADOPT_ENV" =~ ^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$ ]] || fatal "\"$ADOPT_ENV\" is not an environment ID (expected 8-4-4-4-12 hex, from the console URL)."
  command -v node >/dev/null 2>&1 || fatal "node is required to check the environment (Node 26, see the README)."
  info "Checking the environment you made in the console..."
  # Kept so the closing steps can say what check-env saw (is Privilege already in agent mode?).
  check_rc=0
  check_out="$(PINGONE_ACCESS_TOKEN="$access" PINGONE_REGION="$PINGONE_REGION" \
    node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pingone-admin.mjs" check-env --env "$ADOPT_ENV" 2>&1)" || check_rc=$?
  printf '%s\n' "$check_out"
  if [[ "$check_rc" == 2 ]]; then
    # 2 = could not read it (a wrong id or region, or a worker that cannot see it): not a defect of the environment.
    fatal "could not read that environment (see above). Check the id, the region and that the worker can see it (Environment Admin or Organization Admin)."
  elif [[ "$check_rc" != 0 ]]; then
    fatal "that environment is not ready for PingID + Privilege (see the FAIL lines above). Fix it in the console, or re-run with --api-create for a basic environment."
  fi
  privilege_in_agent_mode=0
  printf '%s\n' "$check_out" | grep -E 'PASS +Privilege' | grep -Eq 'AUTHENTICATION_MODE_AGENT($|[^A-Za-z_])' && privilege_in_agent_mode=1
  new_env="$ADOPT_ENV"
  reuse_answer="r"   # find the lab worker if an earlier run made one, instead of making a second
  ok "adopting environment $new_env (no license lookup, no environment created). Next: the lab worker is found or created here, and an existing one has its secret re-minted: its old secret stops working."
fi

# A worker without Organization Admin may only adopt: stop before the license lookup and environment creation.
if [[ -z "$ADOPT_ENV" && "$needs_org_admin" == 1 ]]; then
  err "this run would create an environment, which needs Organization Admin; the Worker app holds only Environment Admin."
  echo "  Either give the Worker Organization Admin (organization scope) in the Administrators environment," >&2
  echo "  or create the environment in the PingOne console and re-run with --existing-env <its id>." >&2
  exit 1
fi

if [[ -z "$ADOPT_ENV" ]]; then

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
# The create endpoint takes the region CODE (NA, CA, EU, AP, AU), not the domain
# suffix: uppercasing "com" sent "COM" and PingOne rejected it (allowedValues ["NA"]).
case "$(printf '%s' "$PINGONE_REGION" | tr 'A-Z' 'a-z')" in
  com) env_region=NA ;;
  ca) env_region=CA ;;
  eu) env_region=EU ;;
  asia) env_region=AP ;;
  com.au) env_region=AU ;;
  *) env_region="$(printf '%s' "$PINGONE_REGION" | tr 'a-z' 'A-Z')" ;;
esac
# Name-collision safety: PingOne rejects a second environment with the same name
# (UNIQUENESS_VIOLATION), so look first. The list endpoint cannot filter by name,
# so match client-side. If one exists, only reuse it when it is OURS.
existing_env="$(ENV_API="$api" ENV_TOK="$access" ENV_WANT="$ENV_NAME" python3 -c '
import os, sys, json, urllib.request
# The environments endpoint rejects filter=name eq (HTTP 400), so list every
# environment (following _links.next) and match the display name here.
url = os.environ["ENV_API"] + "/environments?limit=100"
tok, want = os.environ["ENV_TOK"], os.environ["ENV_WANT"]
hits = []
try:
    while url:
        req = urllib.request.Request(url, headers={"authorization": "Bearer " + tok})
        d = json.load(urllib.request.urlopen(req, timeout=30))
        hits += [e for e in d.get("_embedded", {}).get("environments", []) if e.get("name") == want]
        url = d.get("_links", {}).get("next", {}).get("href")
except Exception:
    pass
hits.sort(key=lambda e: e.get("createdAt", ""))  # oldest first
print(hits[0]["id"] if hits else "")' 2>/dev/null || true)"
new_env=""
if [[ -n "$existing_env" ]]; then
  ok "an environment named \"$ENV_NAME\" already exists: $existing_env"
  # Our own earlier run wrote its id into the settings file; anything else may be a
  # colleague's (shared organizations). Reuse re-mints that environment's worker
  # secret, which would break the owner's labs.
  is_mine=0
  [[ -f "$ENV_FILE" ]] && grep -qx "PINGONE_ENVIRONMENT_ID=$existing_env" "$ENV_FILE" && is_mine=1
  if [[ "$is_mine" == 1 ]]; then
    ok "it matches PINGONE_ENVIRONMENT_ID in $ENV_FILE — it is yours"
    default_answer="r"
  else
    warn "it does NOT match PINGONE_ENVIRONMENT_ID in $ENV_FILE — it may belong to a colleague."
    warn "reusing it re-creates its lab worker's secret and breaks the owner's labs. Only answer r if you created it."
    default_answer="n"
  fi
  if [[ -t 0 || -r /dev/tty ]]; then
    read -r -p "Reuse it (r), or stop (n)? [r/n, default $default_answer] " reuse_answer </dev/tty 2>/dev/null || reuse_answer=""
  else
    reuse_answer="${ASSUME_REUSE:-}"
  fi
  reuse_answer="${reuse_answer:-$default_answer}"
  if [[ "$reuse_answer" == "r" || "$reuse_answer" == "R" ]]; then
    new_env="$existing_env"
    ok "reusing the existing environment"
  else
    fatal "stopped: PingOne does not allow a second environment named \"$ENV_NAME\" in this organization. If it is a colleague's, ask them, or delete it in the console if it is an orphan of yours."
  fi
fi
if [[ -z "$new_env" ]]; then
# PingID (PingOne Privilege) cannot share an environment with PingOne MFA, so MFA is opt-in.
bom_products='{"type":"PING_ONE_BASE"},{"type":"PING_ONE_DAVINCI"},{"type":"PING_ONE_AUTHORIZE"}'
bom_label="SSO, DaVinci, Authorize"
if [[ "$WITH_MFA" == "1" ]]; then
  bom_products='{"type":"PING_ONE_BASE"},{"type":"PING_ONE_MFA"},{"type":"PING_ONE_DAVINCI"},{"type":"PING_ONE_AUTHORIZE"}'
  bom_label="SSO, MFA, DaVinci, Authorize"
fi
info "Creating the SANDBOX demo environment ($bom_label)..."
# Constraints measured live: name allows only letters/digits/space/-/_/./';
# SANDBOX licenses reject PING_ONE_FRAUD (Privilege is not a BOM product).
env_json="$(curl -s --max-time 60 -X POST "$api/environments" \
  -H "authorization: Bearer $access" -H 'content-type: application/json' \
  -d '{"name":"'"$ENV_NAME"'","region":"'"$env_region"'",
       "type":"SANDBOX","description":"Created by AI-DEMO-Standalone pingone-setup.sh",
       "license":{"id":"'"$license_id"'"},
       "billOfMaterials":{"products":['"$bom_products"']}}')"
new_env="$(printf '%s' "$env_json" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id",""))' 2>/dev/null || true)"
if [[ -z "$new_env" ]]; then
  err "Environment creation failed:"
  printf '%s\n' "$env_json" >&2
  exit 1
fi
# Trust nothing: a create response can carry an id yet the environment can be
# absent (a 403 body parsed as success — measured). GET it before proceeding;
# if it is not there, the run cannot continue without lying to the user.
env_check_code="$(curl -s --max-time 30 -o /dev/null -w '%{http_code}' "$api/environments/$new_env" -H "authorization: Bearer $access")"
if [[ "$env_check_code" != "200" ]]; then
  err "environment $new_env was reported created but a GET returns HTTP $env_check_code — it does not exist."
  echo "" >&2
  echo "  Most likely cause: the worker cannot actually create environments" >&2
  echo "  (needs Organization Admin scoped to the Organization)." >&2
  printf '%s\n' "$env_json" >&2
  exit 1
fi
ok "environment created: $new_env"
fi
fi  # end of: no --existing-env (license lookup and environment creation)

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
assign_role() {
  curl -s --max-time 30 -X POST "$api/environments/$new_env/applications/$app_id/roleAssignments" \
    -H "authorization: Bearer $access" -H 'content-type: application/json' \
    -d '{"role":{"id":"'"$role_id"'"},"scope":{"id":"'"$new_env"'","type":"ENVIRONMENT"}}'
}
assign="$(assign_role)"
# Right after the app is created its inherited roles arrive asynchronously, and PingOne can answer 400 INVALID_DATA once
# (measured 2026-11-24 on probe apps). Look at the app's roles again: if the role is there, it is done; otherwise assign it
# once more. Any other error is not retried.
if printf '%s' "$assign" | grep -q 'INVALID_DATA'; then
  info "role assignment answered INVALID_DATA right after the app was created — checking the app's roles and trying once more"
  sleep "${STANDALONE_ROLE_RETRY_SECONDS:-2}"
  held_json="$(curl -s --max-time 30 "$api/environments/$new_env/applications/$app_id/roleAssignments" -H "authorization: Bearer $access")"
  if printf '%s' "$held_json" | ROLE_ID="$role_id" python3 -c '
import sys, json, os
try:
    held = json.load(sys.stdin).get("_embedded", {}).get("roleAssignments", [])
except Exception:
    held = []
sys.exit(0 if any(a.get("role", {}).get("id") == os.environ["ROLE_ID"] for a in held) else 1)' 2>/dev/null; then
    assign='{"code":"UNIQUENESS_VIOLATION"}'
  else
    assign="$(assign_role)"
  fi
fi
if printf '%s' "$assign" | grep -q 'UNIQUENESS_VIOLATION'; then
  info "role already assigned — continuing"
elif printf '%s' "$assign" | grep -q '"code"'; then
  err "role assignment failed:"
  printf '%s\n' "$assign" >&2
  if printf '%s' "$assign" | grep -q 'ACCESS_FAILED'; then
    echo "" >&2
    echo "  The worker app that minted the org token is not allowed to assign roles." >&2
    echo "  Fix in the PingOne console (Administrators environment):" >&2
    echo "    Applications → your Worker → Roles → assign Organization Admin" >&2
    echo "    (scope: the Organization, not a single environment)" >&2
    echo "  Then re-run this script." >&2
  fi
  exit 1
fi
# Secret mint is POST /secret (singular); the value lands in "secret".
secret="$(curl -s --max-time 30 -X POST "$api/environments/$new_env/applications/$app_id/secret" \
  -H "authorization: Bearer $access" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("secret",""))' 2>/dev/null || true)"
[[ -z "$secret" ]] && { err "secret mint failed:"; exit 1; }
ok "worker minted in the new environment"

# The API-made worker inherits every role of the worker that created it (Organization Admin, Identity Data
# Admin on every environment). Trim it to Identity Data Admin + Environment Admin on this environment only.
SCRIPT_DIR_ADMIN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if command -v node >/dev/null 2>&1; then
  # A worker with Environment Admin only (it can adopt, not create) passes its organization-wide role on to the worker it makes:
  # --strict makes a role that could not be removed stop the run, before the secret is written into the settings file.
  strict_flag=""; if [[ "$needs_org_admin" == 1 ]]; then strict_flag="--strict"; fi
  PINGONE_ACCESS_TOKEN="$access" PINGONE_REGION="$PINGONE_REGION" \
    node "$SCRIPT_DIR_ADMIN/pingone-admin.mjs" ensure-worker-roles --env "$new_env" --app "$app_id" $strict_flag \
    || fatal "the worker's roles could not be set (see above). The environment $new_env exists; fix the cause and run this script again (it reuses the environment and is safe to repeat)."
  if [[ -n "$ADMIN_USER" ]]; then
    PINGONE_ACCESS_TOKEN="$access" PINGONE_REGION="$PINGONE_REGION" \
      node "$SCRIPT_DIR_ADMIN/pingone-admin.mjs" grant-admin --env "$new_env" --admin-env "$PINGONE_ADMIN_ENV_ID" --user "$ADMIN_USER" || true
  fi
else
  warn "node not found: skipped trimming the worker's roles and granting --admin-user (install Node 26, then see docs/PRIVILEGE-ONE-ENV.md)"
fi

# ── 4b. per-env NATIVE app (authorization code + PKCE) ───────────────────────
# The user token path (ping-services-stub-LAB's pi.flow sign-in) needs a user app,
# not the worker: worker client_credentials tokens are scope-less and carry no sub.
# The app authenticates with CLIENT_SECRET_POST (what PINGONE_USER_TOKEN_ENDPOINT_AUTH_METHOD
# names) and its redirect URI is the family's standard BFF callback.
user_app_json="$(curl -s --max-time 30 -X POST "$api/environments/$new_env/applications" \
  -H "authorization: Bearer $access" -H 'content-type: application/json' \
  -d '{"name":"Standalone Labs User","description":"Authorization-code user app for the standalone labs (pi.flow sign-in)","protocol":"OPENID_CONNECT","type":"NATIVE_APP","enabled":true,"grantTypes":["AUTHORIZATION_CODE","REFRESH_TOKEN"],"responseTypes":["CODE"],"tokenEndpointAuthMethod":"CLIENT_SECRET_POST","redirectUris":["https://local.ping-devops.com:4000/api/auth/oauth/user/callback"],"postLogoutRedirectUris":["https://local.ping-devops.com:4000"]}')"
user_app_id="$(printf '%s' "$user_app_json" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id",""))' 2>/dev/null || true)"
# The create response does not carry the secret (the worker path had the same surprise —
# measured); mint it separately, same POST /secret as the worker.
user_secret="$(curl -s --max-time 30 -X POST "$api/environments/$new_env/applications/$user_app_id/secret" \
  -H "authorization: Bearer $access" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("secret",""))' 2>/dev/null || true)"
if [[ -z "$user_app_id" || -z "$user_secret" ]]; then
  # A previous run may have created it (secret is not re-mintable here); look it up and warn.
  user_app_id="$(curl -s --max-time 30 "$api/environments/$new_env/applications?filter=name%20eq%20%22Standalone%20Labs%20User%22" \
    -H "authorization: Bearer $access" \
    | python3 -c '
import sys, json
try:
    apps = json.load(sys.stdin).get("_embedded", {}).get("applications", [])
except Exception:
    apps = []
print(apps[0]["id"] if apps else "")' 2>/dev/null || true)"
  if [[ -n "$user_app_id" ]]; then
    warn "user app exists from a previous run; its secret cannot be minted again, so PINGONE_USER_CLIENT_ID/SECRET are not written (an earlier run's pair for this same environment is kept; one for another environment is dropped) — reset the secret in the PingOne console if the lab's sign-in fails."
  else
    warn "user app creation failed — pi.flow sign-in labs will fall back to their own configuration"
    printf '%s\n' "$user_app_json" | sed -E 's/("secret")[^,}]*/\1:<redacted>/' >&2
  fi
fi

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
  # The user app (authorization code + PKCE, pi.flow sign-in). Empty values are
  # skipped by the merge below only if absent — write them so later runs update.
  if [[ -n "${user_app_id:-}" && -n "${user_secret:-}" ]]; then
    echo "PINGONE_USER_CLIENT_ID=$user_app_id"
    echo "PINGONE_USER_CLIENT_SECRET=$user_secret"
    echo "PINGONE_USER_REDIRECT_URI=https://local.ping-devops.com:4000/api/auth/oauth/user/callback"
    echo "PINGONE_USER_TOKEN_ENDPOINT_AUTH_METHOD=client_secret_post"
  fi
} > "$new_keys"
if [[ -f "$ENV_FILE" ]]; then
  python3 - "$ENV_FILE" "$new_keys" <<'PYEOF'
import sys
main, update = sys.argv[1], sys.argv[2]
fresh = dict(line.split("=", 1) for line in open(update).read().splitlines() if "=" in line)
kept = {}
lines = open(main).read().splitlines()
old_env = next((l.split("=", 1)[1].strip().strip("\"'") for l in lines if l.startswith("PINGONE_ENVIRONMENT_ID=")), "")
# The user app belongs to one environment. When this run moves to another one and could not write that environment's pair
# (the secret of an existing app cannot be minted again), the old pair must not stay beside the new environment id.
switched = bool(old_env) and old_env != fresh.get("PINGONE_ENVIRONMENT_ID", old_env)
for line in lines:
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.split("=", 1)
        if k not in fresh and not (switched and k.startswith("PINGONE_USER_")):
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

# ── 6. save the ADMIN (org worker) credentials for teardown ───────────────────
# The admin creds are deliberately NOT in $ENV_FILE (check-env forbids them there —
# that file gets copied around). They live alone in ~/.config/demo-kit/provisioning.json so
# pingone-teardown.sh can run without prompting.
CRED_FILE="${STANDALONE_CRED_FILE:-$HOME/.config/demo-kit/provisioning.json}"
mkdir -p "$(dirname "$CRED_FILE")"
umask 177
cat > "$CRED_FILE" <<EOF
# PingOne ADMIN credentials (org worker) — used by scripts/pingone-teardown.sh.
# Written by scripts/pingone-setup.sh $(date +%Y-%m-%d). Do not copy this file around.
PINGONE_REGION=$PINGONE_REGION
PINGONE_ADMIN_ENV_ID=$PINGONE_ADMIN_ENV_ID
PINGONE_ADMIN_CLIENT_ID=$PINGONE_WORKER_CLIENT_ID
PINGONE_ADMIN_CLIENT_SECRET=$PINGONE_WORKER_CLIENT_SECRET
EOF
chmod 600 "$CRED_FILE"
ok "admin credentials saved: $CRED_FILE (mode 600) — teardown reads them automatically"

echo ""
ok "Done. Now run:  scripts/bootstrap.sh"
echo "  Teardown later is prompt-free: admin creds were saved to ~/.config/demo-kit/provisioning.json"
echo "  Every lab reads PINGONE_ENVIRONMENT_ID/REGION from that file; the worker"
echo "  creds above stay in it for labs that provision their own resources."
echo ""
echo "  One manual step for live Authorize (mock mode works without it) — import"
echo "  the P1AZ policy snapshot once, in the PingOne console:"
echo "    Console → your new environment → Authorize → Trust Framework → Import →"
echo "    ${STANDALONE_SNAPSHOT:-$HOME/Development/AI-DEMO-Standalone/policy/ai-demo-p1az.standalone.snapshot.json}"
echo "  (scripts/bootstrap.sh checks the tenant and prints this path again if the policy is missing.)"
echo ""
if [[ -n "$ADOPT_ENV" ]]; then
  echo "  PingID and PingOne Privilege are already in this environment (you added them in the console). What is left:"
  echo "    1. Run:  node scripts/pingone-admin.mjs privilege-prepare --create-admin <your login> --users demouser,demoAdmin"
  echo "       (creates your admin as a user inside this environment, which the Privilege console requires)."
  echo "    2. In the console, as the login that added Privilege: Users → your admin → Roles → PingOne Privilege Administrator."
  if [[ "${privilege_in_agent_mode:-0}" == 1 ]]; then
    echo "    3. Privilege is already in agent mode (the local desktop agent can pair); nothing to switch."
  else
    echo "    3. Need the local desktop agent? Then node scripts/pingone-admin.mjs set-privilege-mode --env $new_env --mode agent (Privilege is not in agent mode yet)."
  fi
  echo "    4. Pair a phone with PingID for each approver before any MFA is switched on."
else
  echo "  This basic environment has no PingID and no Privilege. To run them, create a new environment in the console"
  echo "  (Workforce, PingID \"Create new\", Privilege No Endpoint Controller) and run:  scripts/pingone-setup.sh --existing-env <its id>"
fi
echo "  Full walkthrough and lockout rules: docs/PRIVILEGE-ONE-ENV.md"
