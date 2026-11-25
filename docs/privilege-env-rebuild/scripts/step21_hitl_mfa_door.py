#!/usr/bin/env python3
"""Step 21: hitl-mfa-LAB stage 1 on the current tenant (spec: docs/specs/2026-11-25-hitl-mfa-stage1.md).
Creates, by cloning objects that exist on the tenant (templates are read only):
  door   lab-hitl-mfa            <- lab-banking-full (banking MCP upstream, FrontEndName renamed)
  permit lab-hitl-mfa-permit     <- lab-banking-full-permit (bound to the new door)
  hold   lab-hitl-mfa-hold       <- opensearch-hitl2-hold (Tool transfer_funds, app lab-hitl-mfa, same approvers, Active)
  key    lab-hitl-mfa-key        (scope mcp, custodian aidemo as UserRef, expiry 2027-02-20)
  grant  lab-hitl-mfa-key-grant  (key-bound, tools = the permit's tools)
Names follow AI-DEMO2 privilege/NAMING-CONVENTION.md. Dry run by default; --apply writes. Idempotent (existing names skipped).
The key value is NEVER printed: --apply writes it into hitl-mfa-LAB/.env (HMLAB_REAL_AGENT_KEY, backup first) with HMLAB_REAL_URL.
Usage: python3 -I step21_hitl_mfa_door.py [--apply]
"""
import base64, copy, datetime, json, os, re, shutil, ssl, sys, time, urllib.error, urllib.request, uuid
HERE = os.path.dirname(os.path.abspath(__file__))
T = json.load(open(os.path.join(HERE, "..", "state.json")))["env_id"]
BASE = f"https://local.procyon.ai:8643/api/{T}/v1"; CTX = ssl._create_unverified_context()
APPLY = "--apply" in sys.argv
DOOR, PERMIT, HOLD, KEY, GRANT = "lab-hitl-mfa", "lab-hitl-mfa-permit", "lab-hitl-mfa-hold", "lab-hitl-mfa-key", "lab-hitl-mfa-key-grant"
T_DOOR, T_PERMIT, T_HOLD, T_GRANT = "lab-banking-full", "lab-banking-full-permit", "opensearch-hitl2-hold", "MainAgentA2aMcpTools"
TOOL, CUSTODIAN, EXPIRY = "transfer_funds", "aidemo", "2027-02-20T00:00:00.000Z"
GW_URL = f"https://mcpgw.ai-demo.ping-devops.com/{DOOR}/mcp"
LAB_ENV = os.path.expanduser("~/Development/AI-DEMO-Standalone/standalone/hitl-mfa-lab-LAB/.env")
BACKUPS = os.path.expanduser("~/.config/demo-kit/backups/hitl-mfa-" + time.strftime("%Y%m%d-%H%M%S"))
CT = {"Map": {"purpose": "hitl-mfa-lab", "source": "ai-demo-standalone", "env": "demo"}}
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
    c, d = call("GET", f"{k}?ObjectMeta.Namespace=default")
    if c != 200: sys.exit(f"GET {k} -> {c}")
    return {o["ObjectMeta"]["Name"]: o for v in d.values() if isinstance(v, list) for o in v}


def fresh(o, name):
    o = copy.deepcopy(o)
    for k in ("UUID", "CreatedAt", "UpdatedAt", "RevisionID"): o["ObjectMeta"].pop(k, None)
    o["ObjectMeta"].update({"Name": name, "ID": b64(f"{T}@@@default@@@{name}"), "CTags": CT})
    return o


apps, pols, keys, users, aip = lst("applications"), lst("pacpolicys"), lst("agentaccesskeys"), lst("users"), lst("aipolicys")
for n in (T_DOOR, T_PERMIT, T_HOLD, T_GRANT):
    assert n in apps or n in pols or n in aip, f"template {n} missing"
uname = {u["Spec"]["UserName"]: n for n, u in users.items()}
cust_id = uname.get(CUSTODIAN) or uname.get(f"cmuir+{CUSTODIAN}@pingone.com")
assert cust_id, f"user {CUSTODIAN} missing"
tools = pols[T_PERMIT]["Spec"]["ActionMap"]["MCP"]["PolicyRule"][0]["Capabilities"]["Map"]["tools"]["Elems"]
print(f"tenant {T} | templates ok | custodian {CUSTODIAN}={cust_id[:8]} | permit tools {tools}")
plan = []

if DOOR not in apps:
    a = fresh(apps[T_DOOR], DOOR); mc = a["Spec"]["McpAppConfig"]
    mc["FrontEndName"] = {"Elems": [e.replace(T_DOOR + ".", DOOR + ".", 1) for e in mc["FrontEndName"]["Elems"]]}
    a["Spec"]["Description"] = f"hitl-mfa-LAB door: banking tools; {TOOL} is held for one human approval ({HOLD})."
    assert T_DOOR not in json.dumps(a), "template name left in the door"
    plan.append(("applications", DOOR, a))
if PERMIT not in pols:
    p = fresh(pols[T_PERMIT], PERMIT)
    for r in p["Spec"]["ActionMap"]["MCP"]["PolicyRule"]: r["ObjectRef"] = ref("Application", DOOR)
    p["Spec"]["Description"] = f"Permit for the door {DOOR} (users of {T_DOOR})."; p["GivenName"] = PERMIT
    plan.append(("pacpolicys", PERMIT, p))
if HOLD not in aip:
    h = fresh(aip[T_HOLD], HOLD); sp = h["Spec"]
    cedar = sp["Cedar"]
    cedar = re.sub(r'resource == Tool::"[^"]*"', f'resource == Tool::"{TOOL}"', cedar)
    cedar = re.sub(r'context\.app == "[^"]*"', f'context.app == "{DOOR}"', cedar)
    cedar = re.sub(r'@reason\("[^"]*"\)', '@reason("hitl-mfa-LAB: money movement needs a human")', cedar)
    form = json.loads(base64.b64decode(sp["BuilderForm"]))
    form.update(scopeName=DOOR, resourceName=TOOL, reason="hitl-mfa-LAB: money movement needs a human")
    sp.update(Cedar=cedar, BuilderForm=b64(json.dumps(form, separators=(",", ":"))), Description=f"Hold {TOOL} on {DOOR} for one human approval (stage 1, no PingID).")
    h["State"] = "Active"
    assert f'Tool::"{TOOL}"' in cedar and f'"{DOOR}"' in cedar and "@approvers(" in cedar
    plan.append(("aipolicys", HOLD, h))
now = datetime.datetime.utcnow(); nb = (now - datetime.timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
if KEY not in keys:
    tpl = next(k for n, k in keys.items() if k["Spec"].get("Scopes", {}).get("Elems") == ["mcp"] and not k["Spec"].get("Provider")
               and n in ("lab-opensearch-hitl-key", "agg-guest", "lab-agent"))
    k = fresh(tpl, KEY)
    k["Spec"].update({"VirtualKey": "", "RealKey": "", "Revoked": False, "Scopes": {"Elems": ["mcp"]}, "UserRef": ref("User", cust_id), "NotAfter": EXPIRY})
    if "CustodianRef" in k["Spec"]: k["Spec"]["CustodianRef"] = {"RefKind": "", "RefID": ""}  # a human custodian is UserRef only
    plan.append(("agentaccesskeys", KEY, k))
if GRANT not in pols:
    g = fresh(pols[T_GRANT], GRANT)
    g["IssuedTo"] = {"ObjectRef": [ref("User", cust_id)]}
    rule = g["Spec"]["ActionMap"]["MCP"]["PolicyRule"][0]
    rule["ObjectRef"] = ref("Application", DOOR); rule["Attributes"] = {"Map": {"agentaccesskey": b64(f"{T}@@@default@@@{KEY}")}}
    rule["Capabilities"]["Map"]["tools"] = {"Elems": tools}
    g["Spec"]["ActionMap"]["MCP"]["PolicyRule"] = [rule]
    g["Spec"]["Description"] = f"Key-bound grant for {KEY} on {DOOR} (the hold {HOLD} narrows on top)."
    g["NotBefore"], g["NotAfter"], g["GivenName"] = nb, EXPIRY, GRANT
    g["Status"] = {"Status": "", "AppRoles": {"ObjectRef": []}, "Error": "", "ApprovalReq": {"RefKind": "", "RefID": ""}}
    g["Type"] = g.get("Type") or "App"
    plan.append(("pacpolicys", GRANT, g))

for kind, name, _ in plan: print(f"  would create {kind}: {name}")
if not plan: print("  all five objects exist already")
if not APPLY: print("(dry run)"); sys.exit(0)

for kind, name, body in plan:
    c, r = call("POST", kind, body); print(f"POST {kind}/{name}: {c}" + ("" if c in (200, 201) else f" {str(r)[:200]}"))
    if c not in (200, 201): sys.exit(1)
    time.sleep(3)

a2, p2, k2, aip2 = lst("applications"), lst("pacpolicys"), lst("agentaccesskeys"), lst("aipolicys")
kk = k2.get(KEY, {}); vk = kk.get("Spec", {}).get("VirtualKey") or ""
print("read-back: door", DOOR in a2, "| permit", PERMIT in p2, "| hold State", aip2.get(HOLD, {}).get("State"),
      "| key present", bool(vk), "revoked", kk.get("Spec", {}).get("Revoked"), "| grant IssuedTo", len(p2.get(GRANT, {}).get("IssuedTo", {}).get("ObjectRef", [])))
if vk:
    os.makedirs(BACKUPS, mode=0o700, exist_ok=True)
    bk = os.path.join(BACKUPS, "hitl-mfa-lab.env.bak"); shutil.copy2(LAB_ENV, bk); os.chmod(bk, 0o600)
    lines = open(LAB_ENV).read().split("\n"); seen = set()
    for i, l in enumerate(lines):
        m = re.match(r"^(\s*)(HMLAB_REAL_URL|HMLAB_REAL_AGENT_KEY)=", l)
        if m:
            lines[i] = f"{m.group(1)}{m.group(2)}=" + (GW_URL if m.group(2) == "HMLAB_REAL_URL" else vk); seen.add(m.group(2))
    for v in ("HMLAB_REAL_URL", "HMLAB_REAL_AGENT_KEY"):
        if v not in seen: lines.append(f"{v}=" + (GW_URL if v == "HMLAB_REAL_URL" else vk))
    mode = os.stat(LAB_ENV).st_mode & 0o777; open(LAB_ENV, "w").write("\n".join(lines)); os.chmod(LAB_ENV, mode)
    print("lab .env updated (HMLAB_REAL_URL, HMLAB_REAL_AGENT_KEY); backup", bk.replace(os.path.expanduser("~"), "~"))
print("done")
