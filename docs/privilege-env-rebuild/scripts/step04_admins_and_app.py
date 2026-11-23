"""Step 04: admin roles in the new environment + restrict the PingOne Privilege app.

Roles granted on the NEW environment only (scope ENVIRONMENT):
  Identity Data Admin, Environment Admin, PingOne Privilege Administrator
to: the owner's console login (Administrators env) and demouser / demoAdmin / cmuir+AgentAdmin
(copied users inside the new env). Privilege Administrator may need the console if the API
actor does not hold it; the script says so instead of failing silently.

App: "PingOne Privilege" gets accessControl.group = PrivilegeAdmins.
GET -> back up full JSON -> set one field -> PUT the whole object (a partial PUT drops fields).
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p1lib import api, org_admin_token, token, load_env_file, NEW_ENV_CREDS, q, write_state

ADMIN_ENV = "9e2f2f0c-f9fa-46da-b6f0-7eda4d3ccca2"          # "Administrators" env (console logins)
CONSOLE_USERS = {  # owner's console logins in the Administrators env (both must see Users)
    "e2cd745d-40de-47bf-b4f3-eac10aa85192": "cmuir@pingidentity.com",
    "b8dee851-212f-4092-ad9d-a99285aa7691": "cmuir@pingone.com",
}
IN_ENV_ADMINS = ["demouser", "demoAdmin", "cmuir+AgentAdmin@pingone.com"]
ROLE_NAMES = ["Identity Data Admin", "Environment Admin", "PingOne Privilege Administrator"]
BACKUPS = os.path.expanduser("~/.config/demo-kit/backups")

d = load_env_file(NEW_ENV_CREDS)
ENV = d["ENV_ID"]
wt = token(ENV, d["WORKER_CLIENT_ID"], d["WORKER_CLIENT_SECRET"])
ot = org_admin_token()
c, roles = api(ot, "/roles")
rid = {r["name"]: r["id"] for r in roles["_embedded"]["roles"]}


def grant(tok, user_env, user_id, label):
    c, have = api(tok, f"/environments/{user_env}/users/{user_id}/roleAssignments")
    held = {(r["role"]["id"], r["scope"]["id"]) for r in have.get("_embedded", {}).get("roleAssignments", [])}
    for name in ROLE_NAMES:
        if (rid[name], ENV) in held:
            print(f"  {label}: {name} already"); continue
        res = None
        for t in (tok, ot, wt):  # try each actor; a role can only be granted by a holder
            c, r = api(t, f"/environments/{user_env}/users/{user_id}/roleAssignments", "POST",
                       {"role": {"id": rid[name]}, "scope": {"type": "ENVIRONMENT", "id": ENV}})
            if c in (200, 201) or (c == 400 and "UNIQUE" in str(r)):
                res = "granted"; break
            res = f"FAILED {c} {(r.get('details') or [{}])[0].get('message', '') if isinstance(r, dict) else str(r)[:120]}"
        print(f"  {label}: {name} {res}" + ("  -> CONSOLE STEP for the owner" if res != "granted" else ""))


for uid, label in CONSOLE_USERS.items():
    print(f"console login {label}:")
    grant(ot, ADMIN_ENV, uid, label)
for uname in IN_ENV_ADMINS:
    c, r = api(wt, f"/environments/{ENV}/users?filter=" + q(f'username eq "{uname}"'))
    users = r.get("_embedded", {}).get("users", []) if c == 200 else []
    if not users:
        print(f"{uname}: not found in new env"); continue
    print(f"{uname}:")
    grant(wt, ENV, users[0]["id"], uname)

# Restrict the PingOne Privilege app to PrivilegeAdmins
c, apps = api(wt, f"/environments/{ENV}/applications")
app = next(a for a in apps["_embedded"]["applications"] if a["name"] == "PingOne Privilege")
c, full = api(wt, f"/environments/{ENV}/applications/{app['id']}")
c, groups = api(wt, f"/environments/{ENV}/groups?filter=" + q('name eq "PrivilegeAdmins"'))
gid = groups["_embedded"]["groups"][0]["id"]
want = {"type": "ANY_GROUP", "groups": [{"id": gid}]}
if (full.get("accessControl") or {}).get("group") == want:
    print("Privilege app accessControl already PrivilegeAdmins")
else:
    os.makedirs(BACKUPS, exist_ok=True)
    bk = os.path.join(BACKUPS, f"pingid-privilege-app-{app['id'][:8]}-{time.strftime('%Y%m%d-%H%M%S')}.json")
    fd = os.open(bk, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(full, f, indent=1)
    body = {k: v for k, v in full.items() if k not in ("_links", "id", "environment", "createdAt", "updatedAt")}
    body.setdefault("accessControl", {})["group"] = want
    c, r = api(wt, f"/environments/{ENV}/applications/{app['id']}", "PUT", body)
    print("Privilege app accessControl ->", "set" if c == 200 else f"FAILED {c} {str(r)[:300]}", "| backup", bk)
c, after = api(wt, f"/environments/{ENV}/applications/{app['id']}")
print("read-back accessControl:", json.dumps(after.get("accessControl")))
write_state(privilege_app_id=app["id"], privilege_admins_group=gid,
            privilege_app_client_id=after.get("id"))
