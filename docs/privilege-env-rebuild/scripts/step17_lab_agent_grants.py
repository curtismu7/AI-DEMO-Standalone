#!/usr/bin/env python3
"""Step 17: key-bound grants for the `lab-agent` key on the three aggregate doors the labs call
(`*_GW_APPS=aggregate,aggregate-limited,aggregate-none` in ~/Development/.env). The doors carry their own tool filters
(aggregate: all, aggregate-limited: 4 tools, aggregate-none: none), so each grant allows `.*` and the door decides, as the existing
agg-guest / agg-delegate grants on aggregate-limited do. Cloned from agg-guest-aggregate-limited. Dry run by default; --apply writes. Idempotent."""
import base64, copy, json, ssl, sys, time, urllib.request, uuid, os

T = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "state.json")))["env_id"]
BASE = f"https://local.procyon.ai:8643/api/{T}/v1"; CTX = ssl._create_unverified_context()
HDR = {"x-procyon-session-id": str(uuid.uuid4()), "accept": "application/json", "content-type": "application/json"}
APPLY = "--apply" in sys.argv
b64 = lambda s: base64.b64encode(s.encode()).decode()


def call(m, path, body=None):
    req = urllib.request.Request(f"{BASE}/{path}", method=m, headers=HDR, data=json.dumps(body).encode() if body is not None else None)
    try:
        r = urllib.request.urlopen(req, context=CTX, timeout=90); raw = r.read(); return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")[:300]


def lst(k):
    c, d = call("GET", f"{k}?ObjectMeta.Namespace=default"); return {o["ObjectMeta"]["Name"]: o for v in d.values() if isinstance(v, list) for o in v}


pols, apps, keys = lst("pacpolicys"), lst("applications"), lst("agentaccesskeys")
assert "lab-agent" in keys and not keys["lab-agent"]["Spec"].get("Revoked"), "lab-agent key missing or revoked"
tpl = pols["agg-guest-aggregate-limited"]
for door in ("aggregate", "aggregate-limited", "aggregate-none"):
    assert door in apps, f"door {door} missing"
    name = f"lab-agent-{door}"
    if name in pols:
        print(f"exists: {name}"); continue
    p = copy.deepcopy(tpl)
    for k in ("UUID", "CreatedAt", "UpdatedAt", "RevisionID"): p["ObjectMeta"].pop(k, None)
    p["ObjectMeta"]["Name"] = name; p["ObjectMeta"]["ID"] = b64(f"{T}@@@default@@@{name}")
    p["ObjectMeta"]["CTags"] = {"Map": {"purpose": "lab-agent", "source": "ai-demo2", "env": "demo"}}
    rules = p["Spec"]["ActionMap"]["MCP"]["PolicyRule"]; assert len(rules) == 1
    r = rules[0]
    r["ObjectRef"] = {"RefKind": "Application", "RefID": b64(f"{T}@@@default@@@{door}")}
    r["Attributes"] = {"Map": {"agentaccesskey": b64(f"{T}@@@default@@@lab-agent")}}
    p["Spec"]["Description"] = f"Key-bound grant for the agent key lab-agent on {door} (the door's own tool filter applies)."
    print(f"{'create' if APPLY else 'would create'}: {name}  (door {door}, tools {r['Capabilities']['Map']['tools']['Elems']})")
    if APPLY:
        c, res = call("POST", "pacpolicys", p); print(f"   POST: {c}" + ("" if c in (200, 201) else f" {str(res)[:200]}"))
        if c not in (200, 201): sys.exit(1)
        time.sleep(3)
print("done" if APPLY else "(dry run)")
