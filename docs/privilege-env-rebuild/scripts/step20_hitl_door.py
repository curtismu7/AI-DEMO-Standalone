#!/usr/bin/env python3
"""Step 20: HITL test case on the door `opensearch-hitl2` (stage 1: the hold, no PingID).

What the 2026-11-17 replay left unusable, and what this fixes (names follow privilege/NAMING-CONVENTION.md):
  * aipolicy `opensearch-hitl2-hold`: State was blank (gateway only shadows it).
    -> State Active. @approvers takes a GROUP id (the approval object records RefKind Group), NOT a user id: the replayed group
       f3defcdb (PingOne Privilege administrators and HITL approvers: demouser, cmuir@pingidentity.com, ...) is kept. Everything else unchanged.
  * agent key `lab-opensearch-hitl-key` (scope mcp, custodian aidemo, expiry 2027-02-20) and its key-bound grant
    `lab-opensearch-hitl-key-grant` on the door (tools = the tools the door's own permit lists).
Backs up the hold policy to ~/.config/demo-kit/backups/hitl-2026-11-24/. The key value is NEVER printed; it is written to
~/.config/demo-kit/hitl-opensearch.env (mode 600) as LAB_OPENSEARCH_HITL_KEY. Dry run by default; --apply writes. Idempotent.
"""
import base64, copy, datetime, json, os, ssl, sys, time, urllib.request, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
T = json.load(open(os.path.join(HERE, "..", "state.json")))["env_id"]
BASE = f"https://local.procyon.ai:8643/api/{T}/v1"; CTX = ssl._create_unverified_context()
APPLY = "--apply" in sys.argv
DOOR, HOLD, KEY, GRANT = "opensearch-hitl2", "opensearch-hitl2-hold", "lab-opensearch-hitl-key", "lab-opensearch-hitl-key-grant"
APPROVER_GROUP, CUSTODIAN = "f3defcdb-7fe8-4ff1-95a9-5e004836b596", "aidemo"
EXPIRY = "2027-02-20T00:00:00.000Z"
OUT_ENV = os.path.expanduser("~/.config/demo-kit/hitl-opensearch.env")
BACKUPS = os.path.expanduser("~/.config/demo-kit/backups/hitl-2026-11-24")
b64 = lambda s: base64.b64encode(s.encode()).decode()
ref = lambda kind, name: {"RefKind": kind, "RefID": b64(f"{T}@@@default@@@{name}")}
HDR = {"x-procyon-session-id": str(uuid.uuid4()), "accept": "application/json", "content-type": "application/json"}


def call(m, path, body=None):
    req = urllib.request.Request(f"{BASE}/{path}", method=m, headers=HDR, data=json.dumps(body).encode() if body is not None else None)
    try:
        r = urllib.request.urlopen(req, context=CTX, timeout=110); raw = r.read(); return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")[:300]


def lst(k):
    c, d = call("GET", f"{k}?ObjectMeta.Namespace=default"); return {o["ObjectMeta"]["Name"]: o for v in d.values() if isinstance(v, list) for o in v}


apps, pols, keys, users, aip = lst("applications"), lst("pacpolicys"), lst("agentaccesskeys"), lst("users"), lst("aipolicys")
uname = {u["Spec"]["UserName"]: n for n, u in users.items()}
assert CUSTODIAN in uname, f"user {CUSTODIAN} missing"
cust_id = uname[CUSTODIAN]
approver_id = APPROVER_GROUP; assert approver_id in lst("groups"), "approver group missing"
assert DOOR in apps and HOLD in aip, "door or hold policy missing"
permit = pols[f"{DOOR}-permit"]
tools = permit["Spec"]["ActionMap"]["MCP"]["PolicyRule"][0]["Capabilities"]["Map"]["tools"]["Elems"]
assert "SearchIndexTool" in tools
print(f"tenant {T}\ndoor {DOOR} (auth {apps[DOOR]['Spec']['McpAppConfig']['AuthMode']}); approver group {approver_id[:8]}; custodian {CUSTODIAN}={cust_id[:8]}; {len(tools)} tools")

# 1. hold policy: Active + approver
h = copy.deepcopy(aip[HOLD]); sp = h["Spec"]
import re
new_cedar = re.sub(r'@approvers\("[^"]*"\)', f'@approvers("{approver_id}")', sp["Cedar"])
form = json.loads(base64.b64decode(sp["BuilderForm"])); form["approvers"] = approver_id
new_form = b64(json.dumps(form, separators=(",", ":")))
hold_change = h.get("State") != "Active" or new_cedar != sp["Cedar"] or new_form != sp["BuilderForm"]
print(f"hold policy {HOLD}: State {h.get('State')!r} -> 'Active'; approver changes: {new_cedar != sp['Cedar']}  => {'UPDATE' if hold_change else 'ok already'}")
sp["Cedar"], sp["BuilderForm"], h["State"] = new_cedar, new_form, "Active"

# 2. key + grant
now = datetime.datetime.utcnow(); fmt = "%Y-%m-%dT%H:%M:%S.000Z"; nb = (now - datetime.timedelta(minutes=2)).strftime(fmt)
status0 = {"Status": "", "AppRoles": {"ObjectRef": []}, "Error": "", "ApprovalReq": {"RefKind": "", "RefID": ""}}
CT = {"Map": {"purpose": "hitl-test", "source": "ai-demo-standalone", "env": "demo"}}
strip = lambda o: [o["ObjectMeta"].pop(k, None) for k in ("UUID", "CreatedAt", "UpdatedAt", "RevisionID")]
plan = []
if KEY not in keys:
    tpl = next(k for n, k in keys.items() if k["Spec"].get("Scopes", {}).get("Elems") == ["mcp"] and not k["Spec"].get("Provider") and n in ("meridian-agent", "muse-agent", "testobo-agent", "agg-guest"))
    k = copy.deepcopy(tpl); strip(k); k["ObjectMeta"].update({"Name": KEY, "ID": b64(f"{T}@@@default@@@{KEY}"), "CTags": CT})
    k["Spec"].update({"VirtualKey": "", "RealKey": "", "Revoked": False, "Scopes": {"Elems": ["mcp"]}, "UserRef": ref("User", cust_id), "NotAfter": EXPIRY})
    if "CustodianRef" in k["Spec"]: k["Spec"]["CustodianRef"] = {"RefKind": "", "RefID": ""}  # template names a NonHumanIdentity; a human custodian is UserRef only
    plan.append(("agentaccesskeys", KEY, k))
if GRANT not in pols:
    g = copy.deepcopy(pols["MainAgentA2aMcpTools"]); strip(g)
    g["ObjectMeta"].update({"Name": GRANT, "ID": b64(f"{T}@@@default@@@{GRANT}"), "CTags": CT})
    g["IssuedTo"] = {"ObjectRef": [ref("User", cust_id)]}
    rule = g["Spec"]["ActionMap"]["MCP"]["PolicyRule"][0]
    rule["ObjectRef"] = ref("Application", DOOR); rule["Attributes"] = {"Map": {"agentaccesskey": b64(f"{T}@@@default@@@{KEY}")}}
    rule["Capabilities"]["Map"]["tools"] = {"Elems": tools}
    g["Spec"]["ActionMap"]["MCP"]["PolicyRule"] = [rule]
    g["Spec"]["Description"] = f"Key-bound grant for the agent key {KEY} on {DOOR} (HITL test; the hold policy {HOLD} narrows on top)."
    g["NotBefore"], g["NotAfter"], g["Status"] = nb, EXPIRY, status0; g["GivenName"] = GRANT; g["Type"] = g.get("Type") or "App"
    plan.append(("pacpolicys", GRANT, g))
for kind, name, _ in plan: print(f"  would create {kind}: {name}")
if not plan: print("  key and grant already exist")
if not APPLY: print("(dry run)"); sys.exit(0)

os.makedirs(BACKUPS, exist_ok=True)
bk = os.path.join(BACKUPS, f"{HOLD}.{time.strftime('%Y%m%d-%H%M%S')}.json"); open(bk, "w").write(json.dumps(aip[HOLD], indent=1)); os.chmod(bk, 0o600)
print("backup:", bk)
if hold_change:
    c, r = call("PUT", f"aipolicys/default/{HOLD}", h); print(f"PUT aipolicys/{HOLD}: {c}" + ("" if c in (200, 201) else f" {str(r)[:200]}"))
    if c not in (200, 201): sys.exit(1)
for kind, name, body in plan:
    c, r = call("POST", kind, body); print(f"POST {kind}/{name}: {c}" + ("" if c in (200, 201) else f" {str(r)[:200]}"))
    if c not in (200, 201): sys.exit(1)
    time.sleep(3)
# read back (names/states only) and store the key value without printing it
h2 = lst("aipolicys")[HOLD]; k2 = lst("agentaccesskeys")[KEY]; g2 = lst("pacpolicys")[GRANT]
print("read-back: hold State", h2.get("State"), "| approver ok", approver_id in h2["Spec"]["Cedar"], "| key revoked", k2["Spec"].get("Revoked"),
      "| key value present", bool(k2["Spec"].get("VirtualKey")), "| grant IssuedTo", len(g2["IssuedTo"]["ObjectRef"]), "NotAfter", g2["NotAfter"][:10])
if k2["Spec"].get("VirtualKey"):
    fd = os.open(OUT_ENV, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f: f.write(f"LAB_OPENSEARCH_HITL_KEY={k2['Spec']['VirtualKey']}\n")
    print("key written to", OUT_ENV, "(mode 600)")
print("done")
