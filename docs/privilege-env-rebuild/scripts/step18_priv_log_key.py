#!/usr/bin/env python3
"""Step 18: key `priv-log-agent` + key-bound grant on the `hostile-mcp` door for privilege-logging-LAB (PRIV_LOG_AGENT_KEY).
Cloned from the working pgc-all-tools key and grant (custodian aidemo, scope mcp, expiry 2027-02-20). Idempotent. Never prints key values."""
import base64, copy, json, ssl, sys, time, urllib.request, uuid, os
T = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "state.json")))["env_id"]
B = f"https://local.procyon.ai:8643/api/{T}/v1"; CTX = ssl._create_unverified_context(); H = {"x-procyon-session-id": str(uuid.uuid4()), "accept": "application/json", "content-type": "application/json"}
b64 = lambda s: base64.b64encode(s.encode()).decode()
def call(m, p, body=None):
    for _ in range(3):
        try:
            r = urllib.request.urlopen(urllib.request.Request(f"{B}/{p}", method=m, headers=H, data=json.dumps(body).encode() if body is not None else None), context=CTX, timeout=90); raw = r.read(); return r.status, (json.loads(raw) if raw else {})
        except urllib.error.HTTPError as e: return e.code, e.read().decode()[:300]
        except Exception as e: err = e
    raise err
def lst(k): c, d = call("GET", f"{k}?ObjectMeta.Namespace=default"); return {o["ObjectMeta"]["Name"]: o for v in d.values() if isinstance(v, list) for o in v}
keys, pols, apps = lst("agentaccesskeys"), lst("pacpolicys"), lst("applications")
assert "hostile-mcp" in apps
def strip(o):
    for k in ("UUID", "CreatedAt", "UpdatedAt", "RevisionID"): o["ObjectMeta"].pop(k, None)
if "priv-log-agent" not in keys:
    k = copy.deepcopy(keys["pgc-all-tools"]); strip(k); k["ObjectMeta"]["Name"] = "priv-log-agent"; k["ObjectMeta"]["ID"] = b64(f"{T}@@@default@@@priv-log-agent")
    k["ObjectMeta"]["CTags"] = {"Map": {"purpose": "privilege-logging-lab", "source": "ai-demo2", "env": "demo"}}
    k["Spec"].update({"VirtualKey": "", "RealKey": "", "Revoked": False})
    c, r = call("POST", "agentaccesskeys", k); print("POST key priv-log-agent:", c, "" if c in (200, 201) else r)
else: print("key priv-log-agent exists")
if "priv-log-agent-grant" not in pols:
    g = copy.deepcopy(pols["pgc-all-tools-grant"]); strip(g); n = "priv-log-agent-grant"
    g["ObjectMeta"]["Name"] = n; g["ObjectMeta"]["ID"] = b64(f"{T}@@@default@@@{n}"); g["ObjectMeta"]["CTags"] = {"Map": {"purpose": "privilege-logging-lab", "source": "ai-demo2", "env": "demo"}}
    rule = g["Spec"]["ActionMap"]["MCP"]["PolicyRule"][0]
    rule["ObjectRef"] = {"RefKind": "Application", "RefID": b64(f"{T}@@@default@@@hostile-mcp")}
    rule["Attributes"] = {"Map": {"agentaccesskey": b64(f"{T}@@@default@@@priv-log-agent")}}
    g["Spec"]["Description"] = "Key-bound grant for the agent key priv-log-agent on hostile-mcp (privilege-logging-LAB)."
    c, r = call("POST", "pacpolicys", g); print("POST grant priv-log-agent-grant:", c, "" if c in (200, 201) else r)
else: print("grant exists")
time.sleep(3); k = lst("agentaccesskeys")["priv-log-agent"]["Spec"]; print("virtual key generated:", bool(k.get("VirtualKey")), "| scopes", k["Scopes"]["Elems"], "| expires", k["NotAfter"][:10])
