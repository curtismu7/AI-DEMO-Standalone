"""Step 05: sign-on policies. An environment created through the API gets NONE, so every app
sign-in (MyAccount, portal, PingOne Privilege) fails with "There was an unexpected error with
the service". Copies the source env's policies (default: `pingid`: Single_Factor = LOGIN,
default; Multi_Factor = LOGIN + PINGID_AUTHENTICATION) with their action settings.

Idempotent (matches by name). Multi_Factor is created but NOT assigned to any app.
Usage: python3 -I step05_signon_policies.py [--only Single_Factor]
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p1lib import api, token, load_env_file, NEW_ENV_CREDS, ORG_ADMIN_CREDS

only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
src = load_env_file(ORG_ADMIN_CREDS)
S = src["PINGID_ENV_ID"]
st = token(S, src["PINGID_WORKER_CLIENT_ID"], src["PINGID_WORKER_CLIENT_SECRET"])
dst = load_env_file(NEW_ENV_CREDS)
D = dst["ENV_ID"]
dt = token(D, dst["WORKER_CLIENT_ID"], dst["WORKER_CLIENT_SECRET"])
DROP = {"id", "_links", "environment", "signOnPolicy", "createdAt", "updatedAt"}

c, have = api(dt, f"/environments/{D}/signOnPolicies")
have = {p["name"]: p for p in have.get("_embedded", {}).get("signOnPolicies", [])}
c, srcp = api(st, f"/environments/{S}/signOnPolicies")
for p in srcp["_embedded"]["signOnPolicies"]:
    if only and p["name"] != only:
        continue
    if p["name"] in have:
        pid = have[p["name"]]["id"]; print("policy exists:", p["name"])
    else:
        c, r = api(dt, f"/environments/{D}/signOnPolicies", "POST",
                   {"name": p["name"], "description": p.get("description", ""), "default": bool(p.get("default"))})
        if c not in (200, 201):
            print("policy FAILED", p["name"], c, str(r)[:300]); continue
        pid = r["id"]; print("policy created:", p["name"], "(default)" if p.get("default") else "")
    c, dacts = api(dt, f"/environments/{D}/signOnPolicies/{pid}/actions")
    dtypes = {a["type"] for a in dacts.get("_embedded", {}).get("actions", [])}
    c, sacts = api(st, f"/environments/{S}/signOnPolicies/{p['id']}/actions")
    for a in sorted(sacts["_embedded"]["actions"], key=lambda x: x.get("priority", 0)):
        if a["type"] in dtypes:
            print("  action exists:", a["type"]); continue
        body = {k: v for k, v in a.items() if k not in DROP}
        # Ids that belong to the source env (e.g. a specific PingID/identity-provider object) must not be copied.
        for k in list(body):
            if isinstance(body[k], dict) and "id" in body[k] and k not in ("registration", "recovery"):
                body.pop(k)
        c, r = api(dt, f"/environments/{D}/signOnPolicies/{pid}/actions", "POST", body)
        print("  action", a["type"], "created" if c in (200, 201) else f"FAILED {c} {json.dumps(r)[:300]}")

    # PingOne ignores "default" on create; set it with a PUT.
    if p.get("default"):
        c, cur = api(dt, f"/environments/{D}/signOnPolicies/{pid}")
        if not cur.get("default"):
            c, _ = api(dt, f"/environments/{D}/signOnPolicies/{pid}", "PUT",
                       {"name": cur["name"], "description": cur.get("description", ""), "default": True})
            print("  made default:", "ok" if c == 200 else f"FAILED {c}")

c, fin = api(dt, f"/environments/{D}/signOnPolicies")
for p in fin["_embedded"]["signOnPolicies"]:
    c, acts = api(dt, f"/environments/{D}/signOnPolicies/{p['id']}/actions")
    print("read-back:", p["name"], "default" if p.get("default") else "", [a["type"] for a in acts.get("_embedded", {}).get("actions", [])])
