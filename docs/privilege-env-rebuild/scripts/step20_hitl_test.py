#!/usr/bin/env python3
"""Step 20 test: HITL on door opensearch-hitl2 through the shared gateway (stage 1, no PingID).
Cases: CONTROL ListIndexTool (not held) -> 200 | HELD SearchIndexTool -> 403 pending_approval | then waits for the human decision
(approve or deny in the console as the approver, `demouser`), polls the approval object, and retries with X-Procyon-Approval-Id.
Prints status codes, instruction id and result only; the key (LAB_OPENSEARCH_HITL_KEY in ~/.config/demo-kit/hitl-opensearch.env) is never printed.
Usage: python3 -I step20_hitl_test.py [--wait 300] [--url <door url>]"""
import json, os, ssl, sys, time, urllib.error, urllib.request, uuid
HERE = os.path.dirname(os.path.abspath(__file__)); T = json.load(open(os.path.join(HERE, "..", "state.json")))["env_id"]
arg = lambda n, d: sys.argv[sys.argv.index(n) + 1] if n in sys.argv else d
URL = arg("--url", "https://mcpgw.ai-demo.ping-devops.com/opensearch-hitl2/mcp/"); WAIT = int(arg("--wait", "300"))
KEY = [l.split("=", 1)[1].strip() for l in open(os.path.expanduser("~/.config/demo-kit/hitl-opensearch.env")) if l.startswith("LAB_OPENSEARCH_HITL_KEY=")][0]
CTX = ssl._create_unverified_context(); SID = {"x-procyon-session-id": str(uuid.uuid4()), "accept": "application/json"}
def rpc(body, sid=None, hdr=None):
    h = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Accept": "application/json, text/event-stream", **({"Mcp-Session-Id": sid} if sid else {}), **(hdr or {})}
    try:
        r = urllib.request.urlopen(urllib.request.Request(URL, data=json.dumps(body).encode(), headers=h, method="POST"), timeout=60); return r.status, dict(r.headers), r.read().decode(errors="replace")
    except urllib.error.HTTPError as e: return e.code, dict(e.headers), e.read().decode(errors="replace")
def approval(iid):
    d = json.load(urllib.request.urlopen(urllib.request.Request(f"https://local.procyon.ai:8643/api/{T}/v1/agentapprovals/default/{iid}", headers=SID), context=CTX, timeout=30)); return d
def body_json(b):
    b = b.strip()
    if b.startswith("event:"): b = [l[5:].strip() for l in b.splitlines() if l.startswith("data:")][0]
    return json.loads(b)
call = lambda i, name, args, sid, hdr=None: rpc({"jsonrpc": "2.0", "id": i, "method": "tools/call", "params": {"name": name, "arguments": args}}, sid, hdr)
ok = True
c, h, b = rpc({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "hitl-test", "version": "1"}}}); sid = h.get("Mcp-Session-Id") or h.get("mcp-session-id")
rpc({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid); print(f"initialize: {c}"); ok &= c == 200
c, h, b = call(2, "ListIndexTool", {}, sid); print(f"CONTROL ListIndexTool (not held): {c}  expect 200"); ok &= c == 200
SEARCH = {"index": "_all", "query_body": {"query": {"match_all": {}}, "size": 1}}
c, h, b = call(3, "SearchIndexTool", SEARCH, sid); d = json.loads(b).get("error", {}).get("data", {}) if c == 403 else {}
print(f"HELD SearchIndexTool: {c} {d.get('status')}  expect 403 pending_approval | instruction {d.get('instruction_id')} expires {d.get('expires_at')}"); ok &= (c == 403 and d.get("status") == "pending_approval")
if not d.get("instruction_id"): sys.exit("no hold raised, stopping")
iid = d["instruction_id"]; print(f"\n>>> Approve (or deny) request {iid} in the console as demouser within {WAIT}s: HITL Requests page.\n", flush=True)
t0, last, state = time.time(), None, None
while time.time() - t0 < WAIT:
    a = approval(iid); state = (a.get("State"), len(a.get("Status", {}).get("ApprovedBy", {}).get("ObjectRef", [])))
    if state != last: print(f"  [{int(time.time()-t0):3d}s] state {state[0]} approvedBy {state[1]}", flush=True); last = state
    if state[0] not in ("New", "Pending", "") or state[1] > 0: break
    time.sleep(3)
print(f"final approval state: {state}")
c, h, b = call(4, "SearchIndexTool", SEARCH, sid, {"X-Procyon-Approval-Id": iid})
print(f"RETRY with X-Procyon-Approval-Id: {c}  (200 = approved, 403 = denied/expired)  {'' if c == 200 else b[:300]}")
c2, h2, b2 = call(5, "SearchIndexTool", SEARCH, sid); print(f"SECOND call without the id (grant is transaction-only): {c2}  expect 403")
