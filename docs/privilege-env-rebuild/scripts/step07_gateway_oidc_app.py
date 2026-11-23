"""Step 07: make the new env's "PingOne Privilege" app usable as the gateways' OIDC client.

1. redirectUris: UNION of what it has + https://<host>/callback for every gateway host.
   (GET full app -> back up -> change one field -> PUT the whole object.)
2. Resource grants: mirror the source app's grants (e.g. openid: profile, email) by resource
   NAME, because resource ids differ per environment.
Idempotent. Usage: python3 -I step07_gateway_oidc_app.py [--dry-run]
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p1lib import api, token, load_env_file, read_state, NEW_ENV_CREDS, ORG_ADMIN_CREDS

DRY = "--dry-run" in sys.argv
GATEWAY_HOSTS = [
    "mcpgw-pingid.ai-demo.ping-devops.com",   # cmuir agentless-mcpgw-pingid  (HAProxy pingid-1)
    "mcpgw-pingid2.ai-demo.ping-devops.com",  # cmuir agentless-mcpgw-pingid2 (pingid-2)
    "mcpgw-pingid3.ai-demo.ping-devops.com",  # curtismuir agentless-mcpgw-pingid (pingid-3)
    "mcpgw2.ai-demo.ping-devops.com",         # cmuir agentless-mcpgw2
    "mcpgw.ai-demo.ping-devops.com",          # HAProxy mcpgw-lb public host
    "pingid-gw.local.ping-devops.com",        # local Docker pingid-mcpgw
]
SRC_APP = "33bb98ce-c805-43fa-9b01-1a7dc746ce53"  # pingid's PingOne Privilege app
BACKUPS = os.path.expanduser("~/.config/demo-kit/backups")

q_ = load_env_file(ORG_ADMIN_CREDS); S = q_["PINGID_ENV_ID"]
st = token(S, q_["PINGID_WORKER_CLIENT_ID"], q_["PINGID_WORKER_CLIENT_SECRET"])
d = load_env_file(NEW_ENV_CREDS); D = d["ENV_ID"]
dt = token(D, d["WORKER_CLIENT_ID"], d["WORKER_CLIENT_SECRET"])
APP = read_state()["privilege_app_id"]

# 1. redirect URIs
c, full = api(dt, f"/environments/{D}/applications/{APP}")
have = full.get("redirectUris") or []
want = have + [f"https://{h}/callback" for h in GATEWAY_HOSTS if f"https://{h}/callback" not in have]
if want == have:
    print("redirectUris already complete")
elif DRY:
    print("would add:", [u for u in want if u not in have])
else:
    os.makedirs(BACKUPS, exist_ok=True)
    bk = os.path.join(BACKUPS, f"pingid-privilege-app-{APP[:8]}-{time.strftime('%Y%m%d-%H%M%S')}.json")
    fd = os.open(bk, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(full, f, indent=1)
    body = {k: v for k, v in full.items() if k not in ("_links", "id", "environment", "createdAt", "updatedAt")}
    body["redirectUris"] = want
    c, r = api(dt, f"/environments/{D}/applications/{APP}", "PUT", body)
    print("redirectUris PUT:", "ok" if c == 200 else f"FAILED {c} {str(r)[:300]}", "| backup", bk)

# 2. resource grants, mirrored by resource name + scope name
def resources(tok, env):
    c, r = api(tok, f"/environments/{env}/resources?limit=200")
    return {x["id"]: x["name"] for x in r["_embedded"]["resources"]}

def scopes(tok, env, rid):
    c, r = api(tok, f"/environments/{env}/resources/{rid}/scopes")
    return {x["id"]: x["name"] for x in r.get("_embedded", {}).get("scopes", [])}

s_res, d_res = resources(st, S), resources(dt, D)
d_by_name = {v: k for k, v in d_res.items()}
c, sg = api(st, f"/environments/{S}/applications/{SRC_APP}/grants")
c, dg = api(dt, f"/environments/{D}/applications/{APP}/grants")
d_granted = {g["resource"]["id"] for g in dg.get("_embedded", {}).get("grants", [])}
for g in sg.get("_embedded", {}).get("grants", []):
    rname = s_res.get(g["resource"]["id"])
    s_sc = scopes(st, S, g["resource"]["id"])
    names = [s_sc.get(x["id"]) for x in g.get("scopes", [])]
    drid = d_by_name.get(rname)
    if not drid:
        print("resource missing in new env:", rname); continue
    if drid in d_granted:
        print("grant exists:", rname); continue
    d_sc = {v: k for k, v in scopes(dt, D, drid).items()}
    body = {"resource": {"id": drid}, "scopes": [{"id": d_sc[n]} for n in names if n in d_sc]}
    if DRY:
        print("would grant", rname, names); continue
    c, r = api(dt, f"/environments/{D}/applications/{APP}/grants", "POST", body)
    print("grant", rname, names, "created" if c in (200, 201) else f"FAILED {c} {str(r)[:200]}")

c, after = api(dt, f"/environments/{D}/applications/{APP}")
c, ag = api(dt, f"/environments/{D}/applications/{APP}/grants")
print("read-back redirectUris:", after.get("redirectUris"))
print("read-back grants:", [(d_res.get(x["resource"]["id"]), len(x.get("scopes", []))) for x in ag.get("_embedded", {}).get("grants", [])])
