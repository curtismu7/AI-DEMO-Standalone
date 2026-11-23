"""Step 12: let one more gateway (a local Docker one, or any new host) sign users in through the environment's
ONE shared OIDC app, "PingOne Privilege". There is no second app per gateway: every gateway uses that app's client id
and secret, and the only per-gateway setting is its redirect URI, https://<gateway host>/callback, which must equal the
gateway's SERVER_URL host plus /callback, character for character.

Replaces the old step 12 that created a separate "Local AI Gateway" app per local gateway (retired 2026-11-23: nothing
used it, and a second app per gateway only adds a secret to keep and rotate).

What it does: GET the shared app, back it up (mode 600), add the redirect to redirectUris (GET -> backup -> PUT the whole
object, never a partial write), read it back, and report whether the openid resource grant (openid profile email) is
in place. Idempotent. It writes no secret and prints no secret. The gateway's pingone.env values come from step 8.
Usage: python3 -I step12_gateway_redirect.py --host pingid-gw.local.ping-devops.com [--dry-run]
"""
import argparse, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p1lib import api, token, load_env_file, read_state, NEW_ENV_CREDS

ap = argparse.ArgumentParser()
ap.add_argument("--host", required=True, help="the gateway's host name as in its SERVER_URL, e.g. pingid-gw.local.ping-devops.com (no scheme, no path)")
ap.add_argument("--dry-run", action="store_true")
a = ap.parse_args()
if "/" in a.host or " " in a.host:
    sys.exit("--host is a bare host name (a port is allowed); no scheme, no path")
redirect = f"https://{a.host}/callback"

d = load_env_file(NEW_ENV_CREDS); E = d["ENV_ID"]
t = token(E, d["WORKER_CLIENT_ID"], d["WORKER_CLIENT_SECRET"])
APP = read_state()["privilege_app_id"]
c, full = api(t, f"/environments/{E}/applications/{APP}")
if c != 200:
    sys.exit(f"cannot read the shared app {APP}: {c}")
print("shared app:", full["name"], APP)
have = full.get("redirectUris") or []
if redirect in have:
    print("redirect already registered:", redirect)
elif a.dry_run:
    print("would add:", redirect)
else:
    bkdir = os.path.expanduser("~/.config/demo-kit/backups"); os.makedirs(bkdir, exist_ok=True)
    bk = os.path.join(bkdir, f"pingid-privilege-app-{APP[:8]}-{time.strftime('%Y%m%d-%H%M%S')}.json")
    fd = os.open(bk, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(full, f, indent=1)
    body = {k: v for k, v in full.items() if k not in ("_links", "id", "environment", "createdAt", "updatedAt")}
    body["redirectUris"] = have + [redirect]
    c, r = api(t, f"/environments/{E}/applications/{APP}", "PUT", body)
    if c != 200:
        sys.exit(f"redirect PUT FAILED {c} {str(r)[:300]} (backup {bk})")
    c, chk = api(t, f"/environments/{E}/applications/{APP}")
    ok = redirect in (chk.get("redirectUris") or []) and len(chk["redirectUris"]) == len(have) + 1
    print("redirect added:", "ok, read back" if ok else "NOT confirmed on read-back", "| backup", bk)

c, res = api(t, f"/environments/{E}/resources?limit=200")
oid = next((r["id"] for r in res["_embedded"]["resources"] if r["name"] == "openid"), None)
c, gr = api(t, f"/environments/{E}/applications/{APP}/grants")
granted = oid and any(g["resource"]["id"] == oid for g in gr.get("_embedded", {}).get("grants", []))
print("openid grant on the shared app:", "present" if granted else "MISSING (run step07_gateway_oidc_app.py)")
print("next: the gateway's SERVER_URL must be https://" + a.host + " and its OIDC_CLIENT_ID/SECRET are the shared app's (step 8 writes them).")
