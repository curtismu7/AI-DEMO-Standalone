#!/usr/bin/env python3
"""Step 17a: the `lab-agent` key (scopes llm/mcp/a2a, anthropic, expiry 2027-02-20), the key the labs call the aggregate doors with.
`lab-agent` was hand-made on the old tenants and is in no export, so step 17 (its grants) asserts it exists. Cloned from `audit-test`
(replayed by step 13 --keys). The real Anthropic key comes from ~/.config/demo-kit/provider-keys.pingid.env (mode 600, format-checked,
never printed). Dry run by default; --apply writes. Idempotent. The new virtual key is read from the tenant by step15_repoint.py, not printed."""
import base64, copy, json, os, re, ssl, sys, time, urllib.request, uuid

T = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "state.json")))["env_id"]
B = f"https://local.procyon.ai:8643/api/{T}/v1"; CTX = ssl._create_unverified_context()
H = {"x-procyon-session-id": str(uuid.uuid4()), "accept": "application/json", "content-type": "application/json"}
PROVIDER_ENV = os.path.expanduser("~/.config/demo-kit/provider-keys.pingid.env")
APPLY = "--apply" in sys.argv; NAME = "lab-agent"; EXPIRY = "2027-02-20T00:00:00.000Z"
b64 = lambda s: base64.b64encode(s.encode()).decode()


def call(m, p, body=None):
    try:
        r = urllib.request.urlopen(urllib.request.Request(f"{B}/{p}", method=m, headers=H, data=json.dumps(body).encode() if body is not None else None), context=CTX, timeout=90)
        raw = r.read(); return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")[:300]


c, tpl = call("GET", "agentaccesskeys/default/audit-test"); assert c == 200, "audit-test missing: run step 13 --keys first"
c, ex = call("GET", f"agentaccesskeys/default/{NAME}")
if c == 200:
    print(f"{NAME} exists (revoked={ex['Spec'].get('Revoked')}); nothing to do"); sys.exit(0)
penv = {}
for l in open(PROVIDER_ENV):
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", l.rstrip("\n"))
    if m: penv[m.group(1)] = m.group(2).strip().strip("\"'")
real = penv.get("ANTHROPIC_API_KEY", ""); assert real.startswith("sk-ant-") and len(real) >= 90, "ANTHROPIC_API_KEY in the provider file is missing or invalid"
k = copy.deepcopy(tpl)
for f in ("UUID", "CreatedAt", "UpdatedAt", "RevisionID"): k["ObjectMeta"].pop(f, None)
k["ObjectMeta"].update({"Name": NAME, "ID": b64(f"{T}@@@default@@@{NAME}"), "CTags": {"Map": {"purpose": "lab-agent", "source": "ai-demo-standalone", "env": "demo"}}})
k["Spec"].update({"VirtualKey": "", "RealKey": real, "Revoked": False, "NotAfter": EXPIRY})
print(f"would create key {NAME}: scopes {k['Spec']['Scopes']['Elems']}, provider {k['Spec']['Provider']}, expiry {EXPIRY[:10]}")
if not APPLY: print("(dry run)"); sys.exit(0)
c, r = call("POST", "agentaccesskeys", k); print("POST", c, "" if c in (200, 201) else r)
if c not in (200, 201): sys.exit(1)
time.sleep(3); c, g = call("GET", f"agentaccesskeys/default/{NAME}"); print("read-back: virtual key present", bool(g["Spec"].get("VirtualKey")), "| revoked", g["Spec"].get("Revoked"))
