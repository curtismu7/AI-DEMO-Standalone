#!/usr/bin/env python3
"""Verify the privilege-gateway-client-LAB doors and keys through the gateway. Key values are read from the lab .env / pgc-hosted.env
and are never printed. Expected: all-tools lists tools; some-tools lists exactly the 7; blocked is refused; agent-llm answers an LLM call
(only with --llm, makes one tiny paid call). Usage: python3 -I step14_verify.py [--host mcpgw.ai-demo.ping-devops.com] [--llm]"""
import json, os, re, sys, urllib.request, urllib.error

HOST = sys.argv[sys.argv.index("--host") + 1] if "--host" in sys.argv else "mcpgw.ai-demo.ping-devops.com"
LAB = os.path.expanduser("~/Development/AI-DEMO-Standalone/standalone/privilege-gateway-client-LAB/.env")
HOSTED = os.path.expanduser("~/.config/demo-kit/pgc-hosted.env")
SOME = {"list_entitlements", "who_has_role", "get_access_grants", "get_portfolio_summary", "get_investment_accounts", "get_investment_balance", "get_investment_transactions"}


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


lab = envfile(LAB); bad = 0
def check(ok, label, detail=""):
    global bad; bad += (not ok); print(("PASS " if ok else "FAIL ") + label + (f" [{detail}]" if detail else ""))

c, n = tools("lab-banking-full", lab["PGC_GW_KEY_LAB_BANKING_FULL"]); check(n is not None and len(n) > 7, "lab-banking-full-key lists tools on lab-banking-full", f"HTTP {c}, {len(n) if n else 0} tools")
c, n = tools("lab-banking-limited", lab["PGC_GW_KEY_LAB_BANKING_LIMITED"]); check(n is not None and set(n) == SOME, "lab-banking-limited-key lists exactly the 7 tools on lab-banking-limited", f"HTTP {c}, {sorted(set(n) ^ SOME)[:4] if n else n}")
c, n = tools("lab-banking-blocked", lab["PGC_GW_KEY_LAB_BANKING_BLOCKED"]); check(c in (401, 403) or not n, "lab-banking-blocked-key is refused at discovery on lab-banking-blocked", f"HTTP {c}, {len(n) if n else 0} tools")
c, n = tools("lab-banking-full", "not-a-real-key"); check(c in (401, 403), "a bad key is refused", f"HTTP {c}")
if "--llm" in sys.argv:
    k = envfile(HOSTED)["PGC_LLM_VIRTUAL_KEY"]
    c, body, _ = post(f"https://{HOST}/llm/anthropic/v1/messages", k, {"model": "claude-sonnet-4-5", "max_tokens": 8, "messages": [{"role": "user", "content": "Say ok"}]}, {"anthropic-version": "2023-06-01", "x-api-key": k})
    check(c == 200, "pgc-agent-llm answers a tiny claude-sonnet-4-5 call", f"HTTP {c}" + ("" if c == 200 else " " + body[:160]))
print("ALL PASS" if not bad else f"{bad} FAILED")
sys.exit(1 if bad else 0)
