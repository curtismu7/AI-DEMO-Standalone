"""Step 01: create the PingOne environment with the same products as `pingid`.

Idempotent: if an environment with this exact name exists, it is reused, never duplicated.
Usage: python3 -I step01_create_env.py [--name Pingid-privilege] [--dry-run]
"""
import argparse, json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p1lib import api, org_admin_token as org_token, q, write_state

ap = argparse.ArgumentParser()
ap.add_argument("--name", default="Pingid-privilege")
ap.add_argument("--license-from", default="4cb38c18-691a-4201-a99d-b4b8842ca786",
                help="environment whose licence id to reuse (pingid)")
ap.add_argument("--dry-run", action="store_true")
ap.add_argument("--create", action="store_true", help="create via API (NOT for Privilege: no admin role)")
a = ap.parse_args()

tok = org_token()
c, d = api(tok, "/environments?filter=" + q(f'name sw "{a.name}"'))
if c != 200:
    sys.exit(f"lookup failed: {c} {d}")
same = [e for e in d.get("_embedded", {}).get("environments", []) if e["name"] == a.name]
if same:
    env = same[0]
    print(f"exists: {env['name']} {env['id']} (reused, nothing created)")
    write_state(env_id=env["id"], env_name=env["name"])
    sys.exit(0)

if not a.create:
    sys.exit(f"no environment named {a.name!r}. For Privilege, a PERSON must create it in the console "
             "(see SETUP-Privilege-gateway-GUIDE.md, rule zero). Use --create only for non-Privilege envs.")

c, src = api(tok, f"/environments/{a.license_from}")
if c != 200:
    sys.exit(f"cannot read licence source env: {c} {src}")

body = {
    "name": a.name,
    "type": "SANDBOX",
    "region": "NA",
    "description": "Privilege rebuild 2026-11-23: full API control. Runbook: Development/privilege-env-rebuild",
    "license": {"id": src["license"]["id"]},
    "billOfMaterials": {"products": [
        {"type": "PING_ONE_BASE"},
        {"type": "PING_ONE_RISK"},
        {"type": "PING_ONE_DAVINCI"},
        {"type": "PING_ONE_PAM", "tags": ["AUTHENTICATION_MODE_AGENT"]},
        {"type": "PING_ONE_AUTHORIZE"},
        {"type": "PING_ONE_ID", "subtype": "WORKFORCE"},
    ]},
}
if a.dry_run:
    print(json.dumps(body, indent=1))
    sys.exit(0)

c, env = api(tok, "/environments", "POST", body)
if c not in (200, 201):
    sys.exit(f"create failed: {c} {json.dumps(env)[:800]}")
print(f"created: {env['name']} {env['id']}")
write_state(env_id=env["id"], env_name=env["name"])
c, bom = api(tok, f"/environments/{env['id']}/billOfMaterials")
for p in bom.get("products", []):
    print(" product", p["type"], p.get("tags", ""), "deployment" if p.get("deployment") else "")
