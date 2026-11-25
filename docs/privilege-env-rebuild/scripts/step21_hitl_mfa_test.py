#!/usr/bin/env python3
"""Step 21 test: hitl-mfa-LAB stage 1 through the shared gateway (spec: docs/specs/2026-11-25-hitl-mfa-stage1.md, criteria 2-5).
Reads HMLAB_REAL_URL, HMLAB_REAL_AGENT_KEY, HMLAB_REAL_TOOL and HMLAB_REAL_ARGS from hitl-mfa-LAB/.env (the key is never printed).
  2. tools/list on the door lists the tool (waits up to --settle seconds for policy propagation, about 4 minutes)
  3. CONTROL: a read tool that is not held -> 200
  4. HELD: the lab's tool -> 403 pending_approval with an instruction id
  5. after the approver approves in the console (HITL Requests), the retry with X-Procyon-Approval-Id -> 200,
     and a second call without the id is held again (the grant is for one transaction)
Usage: python3 -I step21_hitl_mfa_test.py [--wait 300] [--settle 360]   Exit 0 only when every case passes."""
import json, os, re, ssl, sys, time, urllib.error, urllib.request, uuid
HERE = os.path.dirname(os.path.abspath(__file__)); T = json.load(open(os.path.join(HERE, "..", "state.json")))["env_id"]
arg = lambda n, d: sys.argv[sys.argv.index(n) + 1] if n in sys.argv else d
WAIT, SETTLE = int(arg("--wait", "300")), int(arg("--settle", "360"))
env = {}
for l in open(os.path.expanduser("~/Development/AI-DEMO-Standalone/standalone/hitl-mfa-lab-LAB/.env")):
    m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)$", l.rstrip("\n"))
    if m: env[m.group(1)] = m.group(2).strip().strip("\"'")
URL, KEY, TOOL = env["HMLAB_REAL_URL"].rstrip("/") + "/", env["HMLAB_REAL_AGENT_KEY"], env["HMLAB_REAL_TOOL"]
ARGS = json.loads(env.get("HMLAB_REAL_ARGS") or "{}")
CTX = ssl._create_unverified_context(); SID = {"x-procyon-session-id": str(uuid.uuid4()), "accept": "application/json"}


def rpc(body, sid=None, hdr=None):
    h = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Accept": "application/json, text/event-stream",
         **({"Mcp-Session-Id": sid} if sid else {}), **(hdr or {})}
    try:
        r = urllib.request.urlopen(urllib.request.Request(URL, data=json.dumps(body).encode(), headers=h, method="POST"), timeout=60)
        return r.status, dict(r.headers), r.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode(errors="replace")


def body_json(b):
    b = b.strip()
    if b.startswith("event:") or b.startswith("data:"): b = [l[5:].strip() for l in b.splitlines() if l.startswith("data:")][-1]
    return json.loads(b)


def session():
    c, h, _ = rpc({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "hitl-mfa-test", "version": "1"}}})
    sid = h.get("Mcp-Session-Id") or h.get("mcp-session-id")
    if c == 200: rpc({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid)
    return c, sid


call = lambda i, name, args, sid, hdr=None: rpc({"jsonrpc": "2.0", "id": i, "method": "tools/call", "params": {"name": name, "arguments": args}}, sid, hdr)
print(f"door {URL.split('/')[3]} | tool {TOOL} | args keys {sorted(ARGS)}")
ok = True; t0 = time.time(); names = []
while True:  # criterion 2, allowing for policy propagation
    c, sid = session()
    if c == 200:
        c2, _, b = rpc({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, sid)
        try: names = [t["name"] for t in body_json(b)["result"]["tools"]]
        except Exception: names = []
        if TOOL in names: break
    if time.time() - t0 > SETTLE: break
    print(f"  [{int(time.time()-t0):3d}s] initialize {c}, {len(names)} tools listed; waiting for propagation", flush=True); time.sleep(30)
print(f"2. tools/list: {len(names)} tools, {TOOL} listed: {TOOL in names}  expect True"); ok &= TOOL in names
if TOOL not in names: sys.exit(1)
ctrl = next((n for n in names if re.match(r"(get|list)_", n) and n != TOOL), None)
c, h, b = call(3, ctrl, {}, sid); print(f"3. CONTROL {ctrl} (not held): {c}  expect 200"); ok &= c == 200
c, h, b = call(4, TOOL, ARGS, sid)
d = (body_json(b).get("error", {}).get("data", {}) if c == 403 else {})
print(f"4. HELD {TOOL}: {c} {d.get('status')}  expect 403 pending_approval | instruction {d.get('instruction_id')}")
ok &= c == 403 and d.get("status") == "pending_approval"
if not d.get("instruction_id"): sys.exit("no hold raised, stopping")
iid = d["instruction_id"]
print(f"\n>>> Approve request {iid} in the Privilege console (HITL Requests) within {WAIT}s.\n", flush=True)
t1, last, state = time.time(), None, None
while time.time() - t1 < WAIT:
    try:
        a = json.load(urllib.request.urlopen(urllib.request.Request(f"https://local.procyon.ai:8643/api/{T}/v1/agentapprovals/default/{iid}", headers=SID), context=CTX, timeout=60))
        state = (a.get("State"), len(a.get("Status", {}).get("ApprovedBy", {}).get("ObjectRef", [])))
    except Exception as e:
        state = ("unreadable", 0)
    if state != last: print(f"  [{int(time.time()-t1):3d}s] approval state {state[0]} approvedBy {state[1]}", flush=True); last = state
    if state[0] not in ("New", "Pending", "", "unreadable") or state[1] > 0: break
    time.sleep(3)
c, h, b = call(5, TOOL, ARGS, sid, {"X-Procyon-Approval-Id": iid})
print(f"5a. RETRY with X-Procyon-Approval-Id: {c}  expect 200"); ok &= c == 200
c2, h2, b2 = call(6, TOOL, ARGS, sid); print(f"5b. SECOND call without the id: {c2}  expect 403 (one transaction)"); ok &= c2 == 403
print("ALL PASS" if ok else "FAILED"); sys.exit(0 if ok else 1)
