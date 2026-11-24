"""Step 03: copy custom schema attributes, populations, users, groups and memberships
from the source environment (default: `pingid`) into the new environment.

- Idempotent: matches by name / username; existing objects are reused, not duplicated.
- New users get the demo password (PINGID_DEMO_PASSWORD from pingid-env.env) via the
  password.set call with forceChange=false (PingOne ignores `password` on create).
- MFA devices (PingID pairings) are NOT copied: users re-pair on first MFA.
- The old->new id map holds usernames, so it is written to ~/.config/demo-kit (mode 600).
Usage: python3 -I step03_copy_users.py [--dry-run]
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p1lib import (api, token, load_env_file, read_state, write_state, write_secret_file,
                   NEW_ENV_CREDS, ORG_ADMIN_CREDS, q)

DRY = "--dry-run" in sys.argv
# Overrides for a later move (2026-11-24: ea040334 -> 5bfb4e12). Defaults keep the 2026-11-23 behaviour.
#   SRC_CREDS  source env file: PINGID_ENV_ID/PINGID_WORKER_* keys, or ENV_ID/WORKER_CLIENT_* keys
#   DST_CREDS  target env file (ENV_ID/WORKER_CLIENT_* keys)
#   IDMAP      old->new id map file (use a new one per move; the old map holds another move's ids)
IDMAP = os.path.expanduser(os.environ.get("IDMAP", "~/.config/demo-kit/privilege-rebuild-idmap.json"))

src = load_env_file(os.path.expanduser(os.environ.get("SRC_CREDS", ORG_ADMIN_CREDS)))
_p = "PINGID_" if "PINGID_ENV_ID" in src else ""
S_ENV = src[_p + "ENV_ID"]
st_ = token(S_ENV, src[_p + "WORKER_CLIENT_ID"], src[_p + "WORKER_CLIENT_SECRET"])
dst = load_env_file(os.path.expanduser(os.environ.get("DST_CREDS", NEW_ENV_CREDS)))
D_ENV = dst["ENV_ID"]
dt = token(D_ENV, dst["WORKER_CLIENT_ID"], dst["WORKER_CLIENT_SECRET"])
# The demo password always comes from pingid-env.env (never printed).
PASSWORD = src.get("PINGID_DEMO_PASSWORD") or load_env_file(ORG_ADMIN_CREDS).get("PINGID_DEMO_PASSWORD")
print(f"source {S_ENV[:8]} -> target {D_ENV[:8]}, idmap {os.path.basename(IDMAP)}" + (" (dry run)" if DRY else ""))


def all_items(tok, path, key):
    out, url = [], path
    while url:
        c, d = api(tok, url)
        if c != 200:
            sys.exit(f"GET {path} -> {c} {str(d)[:300]}")
        out += d.get("_embedded", {}).get(key, [])
        url = d.get("_links", {}).get("next", {}).get("href")
    return out


idmap = json.load(open(IDMAP)) if os.path.exists(IDMAP) else {"populations": {}, "users": {}, "groups": {}}

# 1. custom schema attributes
c, s_sch = api(st_, f"/environments/{S_ENV}/schemas")
c, d_sch = api(dt, f"/environments/{D_ENV}/schemas")
s_sid, d_sid = s_sch["_embedded"]["schemas"][0]["id"], d_sch["_embedded"]["schemas"][0]["id"]
s_attrs = all_items(st_, f"/environments/{S_ENV}/schemas/{s_sid}/attributes", "attributes")
d_names = {a["name"] for a in all_items(dt, f"/environments/{D_ENV}/schemas/{d_sid}/attributes", "attributes")}
custom = [a for a in s_attrs if a.get("schemaType") == "CUSTOM"]
for a in custom:
    if a["name"] in d_names:
        continue
    body = {k: a[k] for k in ("name", "displayName", "description", "type", "unique", "multiValued", "enabled", "required") if k in a}
    if DRY:
        print("would create attribute", a["name"]); continue
    c, r = api(dt, f"/environments/{D_ENV}/schemas/{d_sid}/attributes", "POST", body)
    print("attribute", a["name"], "created" if c in (200, 201) else f"FAILED {c} {str(r)[:200]}")
custom_names = {a["name"] for a in custom}

# 2. populations
d_pops = {p["name"]: p["id"] for p in all_items(dt, f"/environments/{D_ENV}/populations", "populations")}
for p in all_items(st_, f"/environments/{S_ENV}/populations", "populations"):
    if p["name"] in d_pops:
        idmap["populations"][p["id"]] = d_pops[p["name"]]; continue
    if DRY:
        print("would create population", p["name"]); continue
    c, r = api(dt, f"/environments/{D_ENV}/populations", "POST", {"name": p["name"], "description": p.get("description", "")})
    if c in (200, 201):
        idmap["populations"][p["id"]] = r["id"]; d_pops[p["name"]] = r["id"]
    print("population", p["name"], "created" if c in (200, 201) else f"FAILED {c}")

# 3. users
STD = ("username", "email", "name", "nickname", "title", "preferredLanguage", "locale", "timezone",
       "mobilePhone", "primaryPhone", "address", "externalId", "photo", "type", "enabled")
d_users = {u["username"].lower(): u["id"] for u in all_items(dt, f"/environments/{D_ENV}/users", "users")}
made = skipped = failed = 0
for u in all_items(st_, f"/environments/{S_ENV}/users", "users"):
    key = u["username"].lower()
    if key in d_users:
        idmap["users"][u["id"]] = d_users[key]; skipped += 1; continue
    body = {k: u[k] for k in STD if k in u}
    body.update({k: u[k] for k in custom_names if k in u})
    pop = idmap["populations"].get(u.get("population", {}).get("id"))
    if pop:
        body["population"] = {"id": pop}
    if DRY:
        made += 1; continue
    c, r = api(dt, f"/environments/{D_ENV}/users", "POST", body)
    if c not in (200, 201):
        failed += 1; print("user FAILED", u["username"], c, str(r)[:200]); continue
    idmap["users"][u["id"]] = r["id"]; d_users[key] = r["id"]; made += 1
    if PASSWORD:
        c, _ = api(dt, f"/environments/{D_ENV}/users/{r['id']}/password", "PUT",
                   {"value": PASSWORD, "forceChange": False},
                   content_type="application/vnd.pingidentity.password.set+json")
        if c != 200:
            print("password FAILED", u["username"], c)
print(f"users: created {made}, existing {skipped}, failed {failed}" + (" (dry run)" if DRY else ""))

# 4. groups + memberships
d_groups = {g["name"]: g["id"] for g in all_items(dt, f"/environments/{D_ENV}/groups", "groups")}
for g in all_items(st_, f"/environments/{S_ENV}/groups", "groups"):
    gid = d_groups.get(g["name"])
    if not gid:
        if DRY:
            print("would create group", g["name"]); continue
        c, r = api(dt, f"/environments/{D_ENV}/groups", "POST", {"name": g["name"], "description": g.get("description", "")})
        if c not in (200, 201):
            print("group FAILED", g["name"], c); continue
        gid = r["id"]; print("group created", g["name"])
    idmap["groups"][g["id"]] = gid
    members = all_items(st_, f"/environments/{S_ENV}/users?filter=" + q(f'memberOfGroups[id eq "{g["id"]}"]'), "users")
    added = 0
    for m in members:
        nu = idmap["users"].get(m["id"])
        if not nu or DRY:
            continue
        c, r = api(dt, f"/environments/{D_ENV}/users/{nu}/memberOfGroups", "POST", {"id": gid})
        added += c in (200, 201)
    print(f"group {g['name']}: {len(members)} source members, {added} added now")

if not DRY:
    fd = os.open(IDMAP, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(idmap, f, indent=1)
    write_state(groups={k: v for k, v in idmap["groups"].items()})
print("done")
