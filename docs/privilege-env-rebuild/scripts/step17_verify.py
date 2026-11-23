#!/usr/bin/env python3
"""Verify the lab-agent grants: tools/list on each aggregate door with the lab-agent key from ~/Development/.env (never printed)."""
import json, os, re, subprocess, sys, tempfile
HOST = "mcpgw.ai-demo.ping-devops.com"
def envfile(p):
    d = {}
    for l in open(p, errors="replace"):
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", l.rstrip("\n"))
        if m: d[m.group(1)] = m.group(2).strip().strip("\"'")
    return d
def post(url, key, body, extra=None):
    h = {"Authorization": "Bearer " + key, "Content-Type": "application/json", "Accept": "application/json, text/event-stream"}; h.update(extra or {})
    hf = tempfile.NamedTemporaryFile(delete=False, suffix=".hdr"); hf.close()
    cfg = [f'url = "{url}"', "request = POST", "silent", "insecure", "max-time = 60", 'write-out = "\\n__HTTP__%{http_code}"', f'dump-header = "{hf.name}"']
    cfg += [f'header = "{k}: {v}"' for k, v in h.items()] + ["data = " + json.dumps(json.dumps(body))]
    out = subprocess.run(["curl", "-K", "-"], input="\n".join(cfg), capture_output=True, text=True).stdout
    txt, _, code = out.rpartition("\n__HTTP__"); hd = {}
    for l in open(hf.name, errors="replace"):
        if ":" in l: a, b = l.split(":", 1); hd[a.strip().lower()] = b.strip()
    os.unlink(hf.name); return int(code or 0), txt, hd
def tools(door, key):
    u = f"https://{HOST}/{door}/mcp/"
    c, b, h = post(u, key, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "v", "version": "1"}}})
    if c != 200: return c, None, "initialize refused"
    sid = h.get("mcp-session-id"); ex = {"Mcp-Session-Id": sid} if sid else {}
    post(u, key, {"jsonrpc": "2.0", "method": "notifications/initialized"}, ex)
    c, b, _ = post(u, key, {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, ex)
    m = re.search(r"\{.*\}", b, re.S)
    try:
        j = json.loads(m.group(0))
        if "error" in j: return c, [], "JSON-RPC error: " + str(j["error"].get("message"))[:120]
        return c, [t["name"] for t in j["result"]["tools"]], ""
    except Exception: return c, [], "unparsed: " + b[:100].replace("\n", " ")
env = envfile(os.path.expanduser("~/Development/.env")); key = env["AGG_ENT_GW_KEY_LAB_AGENT"]
res = {}
for door in ("aggregate", "aggregate-limited", "aggregate-none"):
    c, n, note = tools(door, key); res[door] = (c, n)
    print(f"lab-agent on {door:18} HTTP {c} | {len(n) if n is not None else 0:2} tools" + (f" | {note}" if note else "") + (f" | {sorted(n)[:6]}" if n and len(n) <= 6 else ""))
ok = res["aggregate"][1] and res["aggregate-limited"][1] and len(res["aggregate-limited"][1]) <= 6 and not res["aggregate-none"][1] and res["aggregate-none"][0] in (200, 401, 403)
print("RESULT:", "PASS" if ok else "NOT YET")
sys.exit(0 if ok else 1)
