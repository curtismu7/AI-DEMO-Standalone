"""Step 04b: create a LOCAL admin user inside the new environment (signs in to that env's own
console/apps, unlike the Administrators-env logins).

Creates the user if missing (Default population, demo password, forceChange false), adds it to
PrivilegeAdmins and grants Identity Data Admin + Environment Admin on the new env.
Idempotent. Usage: python3 -I step04b_local_admin.py --username cmuir@pingidentity.com
"""
import argparse, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p1lib import api, token, load_env_file, NEW_ENV_CREDS, ORG_ADMIN_CREDS, q

ap = argparse.ArgumentParser()
ap.add_argument("--username", required=True)
ap.add_argument("--given", default="Curtis")
ap.add_argument("--family", default="Muir")
a = ap.parse_args()

d = load_env_file(NEW_ENV_CREDS)
ENV = d["ENV_ID"]
t = token(ENV, d["WORKER_CLIENT_ID"], d["WORKER_CLIENT_SECRET"])
password = load_env_file(ORG_ADMIN_CREDS).get("PINGID_DEMO_PASSWORD")

c, r = api(t, f"/environments/{ENV}/users?filter=" + q(f'username eq "{a.username}"'))
users = r.get("_embedded", {}).get("users", [])
if users:
    uid = users[0]["id"]; print("user exists:", a.username, uid)
else:
    c, pops = api(t, f"/environments/{ENV}/populations")
    pop = next(p["id"] for p in pops["_embedded"]["populations"] if p["name"] == "Default")
    c, u = api(t, f"/environments/{ENV}/users", "POST", {
        "username": a.username, "email": a.username,
        "name": {"given": a.given, "family": a.family},
        "population": {"id": pop}, "enabled": True})
    if c not in (200, 201):
        sys.exit(f"create user failed: {c} {u}")
    uid = u["id"]; print("user created:", a.username, uid)
    if password:
        c, _ = api(t, f"/environments/{ENV}/users/{uid}/password", "PUT",
                   {"value": password, "forceChange": False},
                   content_type="application/vnd.pingidentity.password.set+json")
        print("password set (demo password)" if c == 200 else f"password FAILED {c}")

c, g = api(t, f"/environments/{ENV}/groups?filter=" + q('name eq "PrivilegeAdmins"'))
gid = g["_embedded"]["groups"][0]["id"]
c, r = api(t, f"/environments/{ENV}/users/{uid}/memberOfGroups", "POST", {"id": gid})
print("PrivilegeAdmins:", "added" if c in (200, 201) else ("already" if c == 400 else f"FAILED {c}"))

c, roles = api(t, "/roles")
rid = {x["name"]: x["id"] for x in roles["_embedded"]["roles"]}
for name in ("Identity Data Admin", "Environment Admin", "PingOne Privilege Administrator"):
    c, r = api(t, f"/environments/{ENV}/users/{uid}/roleAssignments", "POST",
               {"role": {"id": rid[name]}, "scope": {"type": "ENVIRONMENT", "id": ENV}})
    print(name, "granted" if c in (200, 201) else ("already" if "UNIQUE" in str(r) else f"FAILED {c} {str(r)[:150]}"))

c, r = api(t, f"/environments/{ENV}/users/{uid}/roleAssignments")
names = {v: k for k, v in rid.items()}
print("read-back roles:", sorted(names.get(x["role"]["id"]) for x in r["_embedded"]["roleAssignments"] if x["scope"]["id"] == ENV))
c, r = api(t, f"/environments/{ENV}/users/{uid}?expand=memberOfGroups")
print("read-back enabled:", r.get("enabled"), "| groups:", [x.get("name", x.get("id")) for x in r.get("_embedded", {}).get("memberOfGroups", [])])
