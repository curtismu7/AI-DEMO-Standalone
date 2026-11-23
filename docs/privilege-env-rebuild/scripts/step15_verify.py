#!/usr/bin/env python3
"""Verify repointed keys against doors through the gateway. Key values come from ~/Development/.env and are never printed.
Prints, per key, the door tried and whether tools came back or the key was refused."""
import json, os, re, sys
HOST = "mcpgw.ai-demo.ping-devops.com"
SOME = set()
def envfile(p):
    d = {}
    for l in open(p):
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", l.rstrip("\n"))
        if m: d[m.group(1)] = m.group(2).strip().strip("\"'")
    return d


def post(url, key, body, extra=None):
    """POST with curl; the key and body go through `curl -K -` on stdin so they never show in a process list."""
    import subprocess, tempfile
    h = {"Authorization": "Bearer " + key, "Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    h.update(extra or {})
    cfg = [f'url = "{url}"', "request = POST", "silent", "insecure", "max-time = 60", 'write-out = "\\n__HTTP__%{http_code}"', "dump-header = \"%s\""]
    hf = tempfile.NamedTemporaryFile(delete=False, suffix=".hdr"); hf.close()
    cfg[-1] = f'dump-header = "{hf.name}"'
    for k, v in h.items():
        cfg.append(f'header = "{k}: {v}"')
    cfg.append("data = " + json.dumps(json.dumps(body)))
    out = subprocess.run(["curl", "-K", "-"], input="\n".join(cfg), capture_output=True, text=True).stdout
    txt, _, code = out.rpartition("\n__HTTP__")
    hdrs = {}
    for l in open(hf.name, errors="replace"):
        if ":" in l: a, b = l.split(":", 1); hdrs[a.strip().lower()] = b.strip()
    os.unlink(hf.name)
    class H(dict):
        def get(self, k, d=None): return super().get(k.lower(), d)
    return int(code or 0), txt, H(hdrs)


def tools(door, key):
    u = f"https://{HOST}/{door}/mcp/"
    c, body, h = post(u, key, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "step14-verify", "version": "1"}}})
    if c != 200: return c, None
    sid = h.get("Mcp-Session-Id") or h.get("mcp-session-id")
    ex = {"Mcp-Session-Id": sid} if sid else {}
    post(u, key, {"jsonrpc": "2.0", "method": "notifications/initialized"}, ex)
    c, body, _ = post(u, key, {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, ex)
    m = re.search(r"\{.*\}", body, re.S)
    try: names = [t["name"] for t in json.loads(m.group(0))["result"]["tools"]]
    except Exception: return c, None
    return c, names



env = envfile(os.path.expanduser("~/Development/.env"))
tests = [("agg-guest", "AGG_ENT_GW_KEY_AGG_GUEST", "aggregate-limited"), ("agg-delegate", "AGG_ENT_GW_KEY_AGG_DELEGATE", "aggregate-limited"),
         ("main-agent", "APL_GW_KEY_MAIN_AGENT", "a2a-mcp-tools"), ("lab-agent", "AGG_ENT_GW_KEY_LAB_AGENT", "aggregate-limited"),
         ("lab-agent", "MCP_TOOLS_GW_KEY_LAB_AGENT", "a2a-mcp-tools")]
for name, var, door in tests:
    c, n = tools(door, env[var])
    print(f"{name:13} on {door:18} -> HTTP {c}, " + (f"{len(n)} tools" if n else "no tools (refused or empty)"))
