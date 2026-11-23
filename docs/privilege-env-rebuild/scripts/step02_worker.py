"""Step 02: create the new environment's own worker app and give it full control.

Roles: Identity Data Admin + Environment Admin on the new env, Organization Admin at org scope
(so the rebuild never depends on the old `pingid` environment again).
Writes ~/.config/demo-kit/pingid-privilege-env.env (mode 600). Prints ids and role names only.
Idempotent: reuses the app by name; a role that already exists is skipped.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p1lib import api, org_admin_token, read_state, write_state, write_secret_file, NEW_ENV_CREDS, load_env_file

APP_NAME = "privilege-rebuild worker"
ROLES = {  # role id -> (name, scope type)
    "0bd9c966-ee50-4ef5-b4a2-8bd2fd6c35cd": ("Identity Data Admin", "ENVIRONMENT"),
    "29ddce68-7f25-4b50-8f9e-d9fdc2e8e58a": ("Environment Admin", "ENVIRONMENT"),
    "1813bc13-9dca-4fd5-9dba-1d6f8e0d9a4e": ("Organization Admin", "ORGANIZATION"),
}

if "--org-admin" not in sys.argv:
    # Organization Admin covers EVERY environment in the org: only with the owner's explicit OK.
    ROLES = {k: v for k, v in ROLES.items() if v[0] != "Organization Admin"}

st = read_state()
env = st["env_id"]
tok = org_admin_token()

# Resolve full role ids by name (ids above are only hints).
c, roles = api(tok, "/roles")
by_name = {r["name"]: r["id"] for r in roles["_embedded"]["roles"]}
c, envobj = api(tok, f"/environments/{env}")
org_id = envobj["organization"]["id"]

c, apps = api(tok, f"/environments/{env}/applications")
app = next((a for a in apps["_embedded"]["applications"] if a["name"] == APP_NAME), None)
if app:
    print("worker exists:", app["id"])
else:
    c, app = api(tok, f"/environments/{env}/applications", "POST", {
        "name": APP_NAME, "type": "WORKER", "protocol": "OPENID_CONNECT", "enabled": True,
        "description": "Full-control worker for the Privilege rebuild",
        "tokenEndpointAuthMethod": "CLIENT_SECRET_BASIC", "grantTypes": ["CLIENT_CREDENTIALS"],
    })
    if c not in (200, 201):
        sys.exit(f"create app failed: {c} {app}")
    print("worker created:", app["id"])

c, have = api(tok, f"/environments/{env}/applications/{app['id']}/roleAssignments")
have_set = {(r["role"]["id"], r["scope"]["id"]) for r in have.get("_embedded", {}).get("roleAssignments", [])}
org_admin = False
for name, scope_type in [(v[0], v[1]) for v in ROLES.values()]:
    rid = by_name[name]
    scope_id = env if scope_type == "ENVIRONMENT" else org_id
    if (rid, scope_id) in have_set:
        print(f"role ok (already): {name} @ {scope_type}")
        org_admin |= name == "Organization Admin"
        continue
    c, r = api(tok, f"/environments/{env}/applications/{app['id']}/roleAssignments", "POST",
               {"role": {"id": rid}, "scope": {"type": scope_type, "id": scope_id}})
    # A worker created via the API inherits its creator's roles, so "UNIQUE" means already held.
    ok = c in (200, 201) or (c == 400 and "UNIQUE" in str(r))
    print(f"role {'granted' if ok else 'FAILED'}: {name} @ {scope_type}" + ("" if ok else f" -> {c} {str(r)[:200]}"))
    org_admin |= ok and name == "Organization Admin"

# Secret: fetch and store only if the creds file does not already hold it.
existing = load_env_file(NEW_ENV_CREDS) if os.path.exists(NEW_ENV_CREDS) else {}
secret = existing.get("WORKER_CLIENT_SECRET") if existing.get("WORKER_CLIENT_ID") == app["id"] else None
if not secret:
    c, s = api(tok, f"/environments/{env}/applications/{app['id']}/secret")
    if c != 200:
        sys.exit(f"read secret failed: {c}")
    secret = s["secret"]
lines = [
    "# Pingid-privilege worker (full control). Written by step02_worker.py. Never commit or print.",
    f"ENV_ID={env}", "REGION=NA",
    f"WORKER_CLIENT_ID={app['id']}", f"WORKER_CLIENT_SECRET={secret}",
    f"ORG_ADMIN={'true' if org_admin else 'false'}",
]
for k in ("DEMO_PASSWORD",):
    if existing.get(k):
        lines.append(f"{k}={existing[k]}")
write_secret_file(NEW_ENV_CREDS, lines)
write_state(worker_client_id=app["id"], org_id=org_id)
print("creds file written (mode 600):", NEW_ENV_CREDS, "| org admin:", org_admin)
