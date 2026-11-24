#!/usr/bin/env python3
"""Step 14: standing demo doors + the privilege-gateway-client-LAB keys on the NEW tenant.

Spec: cmuir-c6's request (see SPEC.md) and ~/Development/HANDOFF-2026-11-21-scripts/make-demo-doors.py + make-pgc-keys.py,
rebuilt from objects that exist in this tenant (the old scripts' templates NiagaraRiver-* and hitl-video do not).
  doors: lab-banking-full, lab-banking-limited, lab-banking-blocked  (clones of app a2a-mcp-tools, auth none; blocked has NO policy)
  keys : lab-banking-full-key (+grant, all tools), lab-banking-limited-key (+grant, 7 tools), lab-banking-blocked-key (no grant), pgc-agent-llm (llm only)
Custodian aidemo, expiry 2027-02-20, CTags purpose=privilege-gateway-client-lab.
Key values are NEVER printed. Written to the lab .env (backup first, only the 3 PGC_GW_KEY_* lines) and
~/.config/demo-kit/pgc-hosted.env (PGC_LLM_VIRTUAL_KEY). Dry run by default; --apply writes. Idempotent.
"""
import base64, copy, datetime, json, os, re, shutil, ssl, sys, time, urllib.request, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
T = json.load(open(os.path.join(HERE, "..", "state.json")))["env_id"]
BASE = f"https://local.procyon.ai:8643/api/{T}/v1"
CTX = ssl._create_unverified_context()
LAB_ENV = os.path.expanduser("~/Development/AI-DEMO-Standalone/standalone/privilege-gateway-client-LAB/.env")
HOSTED_ENV = os.path.expanduser("~/.config/demo-kit/pgc-hosted.env")
PROVIDER_ENV = os.path.expanduser("~/.config/demo-kit/provider-keys.pingid.env")
BACKUPS = os.path.expanduser("~/.config/demo-kit/backups")
APPLY = "--apply" in sys.argv
WRITE_ENV = "--write-env" in sys.argv  # the env-file writes repoint the lab: only after the gateways serve this tenant (step 15)
EXPIRY = "2027-02-20T00:00:00.000Z"
SOME = ["list_entitlements", "who_has_role", "get_access_grants", "get_portfolio_summary",
        "get_investment_accounts", "get_investment_balance", "get_investment_transactions"]
PURPOSE = {"purpose": "privilege-gateway-client-lab", "source": "ai-demo2", "env": "demo"}
b64 = lambda s: base64.b64encode(s.encode()).decode()
ref = lambda kind, name: {"RefKind": kind, "RefID": b64(f"{T}@@@default@@@{name}")}
HDR = {"x-procyon-session-id": str(uuid.uuid4()), "accept": "application/json", "content-type": "application/json"}


def call(method, path, body=None):
    req = urllib.request.Request(f"{BASE}/{path}", method=method, headers=HDR, data=json.dumps(body).encode() if body is not None else None)
    try:
        r = urllib.request.urlopen(req, context=CTX, timeout=110); raw = r.read()
        return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")[:300]


def listing(kind):
    c, d = call("GET", f"{kind}?ObjectMeta.Namespace=default")
    return {o["ObjectMeta"]["Name"]: o for v in d.values() if isinstance(v, list) for o in v}


def strip(o):
    for k in ("UUID", "CreatedAt", "UpdatedAt", "RevisionID"):
        o["ObjectMeta"].pop(k, None)


def rename(o, old, new):
    if isinstance(o, dict): return {k: rename(v, old, new) for k, v in o.items()}
    if isinstance(o, list): return [rename(v, old, new) for v in o]
    if isinstance(o, str) and old in o and "svc.cluster.local" not in o: return o.replace(old, new)
    return o


apps, pols, keys, users = listing("applications"), listing("pacpolicys"), listing("agentaccesskeys"), listing("users")
uname = {u["Spec"]["UserName"]: n for n, u in users.items()}
# the Privilege UserName is the PingOne username, which differs per environment (5bfb4e12: emails)
for short, real in {"demoAdmin": "demoAdmin@pingone.com", "aidemo": "cmuir+aidemo@pingone.com"}.items():
    if short not in uname and real in uname: uname[short] = uname[real]
for u in ("demoAdmin", "demouser", "aidemo"):
    assert u in uname, f"user {u} missing in the Privilege tenant"
AIDEMO = uname["aidemo"]
tpl_app = apps["a2a-mcp-tools"]
assert tpl_app["Spec"]["McpAppConfig"]["AuthMode"] == "none"
tpl_grant = pols["MainAgentA2aMcpTools"]
tpl_mcp = next(k for n, k in keys.items() if k["Spec"].get("Scopes", {}).get("Elems") == ["mcp"] and not k["Spec"].get("Provider") and n in ("meridian-agent", "muse-agent", "testobo-agent", "agg-guest"))
tpl_llm = keys["anthropic"]
now = datetime.datetime.utcnow(); fmt = "%Y-%m-%dT%H:%M:%S.000Z"
nb = (now - datetime.timedelta(minutes=2)).strftime(fmt)
status0 = {"Status": "", "AppRoles": {"ObjectRef": []}, "Error": "", "ApprovalReq": {"RefKind": "", "RefID": ""}}

DOORS = [("lab-banking-full", "Standing demo door: every tool is permitted.", [".*"]),
         ("lab-banking-limited", "Standing demo door: only 7 read-only, non-sensitive tools are permitted; open_ticket and every sensitive_* tool are refused.", SOME),
         ("lab-banking-blocked", "Standing demo door: NO policy grants access, so Privilege refuses every caller (no policy = deny all).", None)]
KEYS = [("lab-banking-full-key", "PGC_GW_KEY_LAB_BANKING_FULL", "lab-banking-full", [".*"]),
        ("lab-banking-limited-key", "PGC_GW_KEY_LAB_BANKING_LIMITED", "lab-banking-limited", SOME),
        ("lab-banking-blocked-key", "PGC_GW_KEY_LAB_BANKING_BLOCKED", None, None)]

print(f"tenant {T}\ncustodian aidemo = user {AIDEMO[:8]}; template key for mcp keys: {tpl_mcp['ObjectMeta']['Name']}")
plan = []  # (kind, name, body)
for name, desc, tools in DOORS:
    if name not in apps:
        a = copy.deepcopy(tpl_app); strip(a); a = rename(a, "a2a-mcp-tools", name)
        a["ObjectMeta"]["Name"] = name; a["ObjectMeta"]["ID"] = b64(f"{T}@@@default@@@{name}")
        a["ObjectMeta"]["CTags"] = {"Map": {"capability": "standing-demo-door", "demo": "none", "env": "demo", "protection": "governed",
                                            "purpose": "demo-" + ("blocked" if tools is None else "all" if tools == [".*"] else "some"), "source": "ai-demo2"}}
        a["Spec"]["Description"] = desc
        plan.append(("applications", name, a))
    pname = f"{name}-permit"
    if tools is not None and pname not in pols:
        p = copy.deepcopy(tpl_grant); strip(p); p["ObjectMeta"]["Name"] = pname; p["ObjectMeta"]["ID"] = b64(f"{T}@@@default@@@{pname}")
        p["ObjectMeta"]["CTags"] = {"Map": {"capability": "standing-demo-door", "demo": "none", "env": "demo", "protection": "governed",
                                            "purpose": "demo-all" if tools == [".*"] else "demo-some", "source": "ai-demo2"}}
        p["IssuedTo"] = {"ObjectRef": [ref("User", uname[u]) for u in ("demoAdmin", "demouser", "aidemo")]}
        rule = p["Spec"]["ActionMap"]["MCP"]["PolicyRule"][0]
        rule["ObjectRef"] = ref("Application", name); rule["Attributes"] = {"Map": {}}
        rule["Capabilities"] = {"Map": {"tools": {"Elems": tools}}}
        p["Spec"]["ActionMap"]["MCP"]["PolicyRule"] = [rule]
        p["Spec"]["Description"] = f"{desc} Issued to demoAdmin, demouser, aidemo."
        p["NotBefore"], p["NotAfter"] = nb, EXPIRY; p["Status"] = status0; p["GivenName"] = p["ObjectMeta"]["Name"]; p["Type"] = p.get("Type") or "App"
        plan.append(("pacpolicys", pname, p))
for name, envname, app, tools in KEYS:
    if name not in keys:
        k = copy.deepcopy(tpl_mcp); strip(k); k["ObjectMeta"]["Name"] = name; k["ObjectMeta"]["ID"] = b64(f"{T}@@@default@@@{name}")
        k["ObjectMeta"]["CTags"] = {"Map": PURPOSE}
        sp = k["Spec"]; sp.update({"VirtualKey": "", "RealKey": "", "Revoked": False, "Scopes": {"Elems": ["mcp"]}, "UserRef": ref("User", AIDEMO), "NotAfter": EXPIRY})
        if "CustodianRef" in sp: sp["CustodianRef"] = {"RefKind": "", "RefID": ""}  # human custodian = UserRef only
        plan.append(("agentaccesskeys", name, k))
    gname = f"{name}-grant"
    if app and gname not in pols:
        g = copy.deepcopy(tpl_grant); strip(g); g["ObjectMeta"]["Name"] = gname; g["ObjectMeta"]["ID"] = b64(f"{T}@@@default@@@{gname}")
        g["ObjectMeta"]["CTags"] = {"Map": PURPOSE}; g["IssuedTo"] = {"ObjectRef": [ref("User", AIDEMO)]}
        rule = g["Spec"]["ActionMap"]["MCP"]["PolicyRule"][0]
        rule["ObjectRef"] = ref("Application", app); rule["Attributes"] = {"Map": {"agentaccesskey": b64(f"{T}@@@default@@@{name}")}}
        rule["Capabilities"]["Map"]["tools"] = {"Elems": tools}
        g["Spec"]["ActionMap"]["MCP"]["PolicyRule"] = [rule]
        g["Spec"]["Description"] = f"Key-bound grant for the agent key {name}: {app}."
        g["NotBefore"], g["NotAfter"] = nb, EXPIRY; g["Status"] = status0; g["GivenName"] = g["ObjectMeta"]["Name"]; g["Type"] = g.get("Type") or "App"
        plan.append(("pacpolicys", gname, g))
if "pgc-agent-llm" not in keys:
    penv = {}
    for l in open(PROVIDER_ENV):
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", l.rstrip("\n"))
        if m: penv[m.group(1)] = m.group(2).strip().strip("\"'")
    real = penv.get("ANTHROPIC_API_KEY", "")
    assert real.startswith("sk-ant-") and len(real) >= 90, "ANTHROPIC_API_KEY in provider-keys file is missing or invalid"
    k = copy.deepcopy(tpl_llm); strip(k); k["ObjectMeta"]["Name"] = "pgc-agent-llm"; k["ObjectMeta"]["ID"] = b64(f"{T}@@@default@@@pgc-agent-llm")
    k["ObjectMeta"]["CTags"] = {"Map": PURPOSE}
    sp = k["Spec"]; sp.update({"VirtualKey": "", "RealKey": real, "Revoked": False, "Scopes": {"Elems": ["llm"]}, "UserRef": ref("User", AIDEMO),
                               "NotAfter": EXPIRY, "AllowedModels": {"Elems": ["claude-sonnet-4-5"]}})
    plan.append(("agentaccesskeys", "pgc-agent-llm", k))

for kind, name, _ in plan:
    print(f"  would create {kind[:-1] if kind != 'pacpolicys' else 'grant/policy'}: {name}")
if not plan:
    print("  nothing to create (all objects exist)")
if not APPLY:
    print("(dry run)"); sys.exit(0)

for kind, name, body in plan:
    c, r = call("POST", kind, body)
    print(f"POST {kind}/{name}: {c}" + ("" if c in (200, 201) else f" {str(r)[:200]}"))
    if c not in (200, 201):
        sys.exit("stopping on first failure")
    time.sleep(3)

if not WRITE_ENV:
    print("env files NOT touched (pass --write-env after the gateways serve this tenant; step15_repoint.py reads the keys by name)")
    print("done"); sys.exit(0)
# capture key values (never printed) and write them
keys = listing("agentaccesskeys")
vals = {n: (keys[n]["Spec"].get("VirtualKey") or "") for n in ("lab-banking-full-key", "lab-banking-limited-key", "lab-banking-blocked-key", "pgc-agent-llm")}
print("key values present:", {n: bool(v) for n, v in vals.items()})
if all(vals[n] for n in ("lab-banking-full-key", "lab-banking-limited-key", "lab-banking-blocked-key")) and os.path.exists(LAB_ENV):
    os.makedirs(BACKUPS, exist_ok=True)
    bk = os.path.join(BACKUPS, f"privilege-gateway-client-LAB.env.{time.strftime('%Y%m%d-%H%M%S')}.bak")
    shutil.copy2(LAB_ENV, bk); os.chmod(bk, 0o600)
    m = {"PGC_GW_KEY_LAB_BANKING_FULL": "lab-banking-full-key", "PGC_GW_KEY_LAB_BANKING_LIMITED": "lab-banking-limited-key", "PGC_GW_KEY_LAB_BANKING_BLOCKED": "lab-banking-blocked-key"}
    out, done = [], set()
    for l in open(LAB_ENV).read().split("\n"):
        hit = [e for e in m if l.lstrip("# ").startswith(e + "=")]
        if hit and hit[0] not in done: out.append(f"{hit[0]}={vals[m[hit[0]]]}"); done.add(hit[0])
        else: out.append(l)
    for e in m:
        if e not in done: out.append(f"{e}={vals[m[e]]}")
    fd = os.open(LAB_ENV, os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f: f.write("\n".join(out))
    print("lab .env updated (lines:", sorted(done | {e for e in m}), ") backup:", bk)
if vals["pgc-agent-llm"]:
    lines = open(HOSTED_ENV).read().split("\n") if os.path.exists(HOSTED_ENV) else []
    lines = [l for l in lines if not l.startswith("PGC_LLM_VIRTUAL_KEY=")]
    while lines and lines[-1] == "": lines.pop()
    lines.append(f"PGC_LLM_VIRTUAL_KEY={vals['pgc-agent-llm']}")
    fd = os.open(HOSTED_ENV, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f: f.write("\n".join(lines) + "\n")
    print("pgc-hosted.env updated (PGC_LLM_VIRTUAL_KEY), mode 600")
print("done")
