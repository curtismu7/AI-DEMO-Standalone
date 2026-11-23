"""Step 10: finish the Privilege tenant profile that API provisioning left half-done.

An env created by API with PING_ONE_PAM tagged AUTHENTICATION_MODE_AGENT gets a tenant profile with
AgentLess=false (no Nodes / AI-gateway pages) and no PingOne IdP (IdpType, OidcDomain,
ClientSecret empty -> 0 users synced). `pingid` had AgentLess=true + IdpType=Ping.
Sets: AgentLess=true, IdpType=Ping, OidcAttributes.OidcDomain, OidcAttributes.ClientSecret
(ClientID is already the env's PingOne Privilege app). EnableMFA is forced to stay false.
Local console API (agent must be connected to this tenant). GET -> back up -> PUT whole object.
Usage: python3 -I step10_tenant_profile.py [--dry-run]
"""
import json, os, ssl, sys, time, urllib.request, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p1lib import api, token, load_env_file, read_state, NEW_ENV_CREDS

DRY = "--dry-run" in sys.argv
d = load_env_file(NEW_ENV_CREDS); T = d["ENV_ID"]
BASE = f"https://local.procyon.ai:8643/api/{T}/v1"
CTX = ssl._create_unverified_context()  # local console uses a self-signed cert
HDR = {"x-procyon-session-id": str(uuid.uuid4()), "accept": "application/json", "content-type": "application/json"}
BACKUPS = os.path.expanduser("~/.config/demo-kit/backups")


def console(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, headers=HDR,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        r = urllib.request.urlopen(req, context=CTX, timeout=30)
        raw = r.read(); return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")[:500]


def show(spec):
    o = spec.get("OidcAttributes", {})
    return {"AgentLess": spec.get("AgentLess"), "IdpType": spec.get("IdpType"), "EnableMFA": spec.get("EnableMFA"),
            "ClientID": o.get("ClientID"), "OidcDomain": o.get("OidcDomain"), "ClientSecret": f"<{len(o.get('ClientSecret') or '')} chars>"}


c, lst = console("GET", "/tenantprofiles?ObjectMeta.Namespace=default")
if c != 200:
    sys.exit(f"GET tenantprofiles -> {c} {lst}")
obj = lst["TenantProfiles"][0]
print("before:", show(obj["Spec"]))

pt = token(T, d["WORKER_CLIENT_ID"], d["WORKER_CLIENT_SECRET"])
app = read_state()["privilege_app_id"]
if obj["Spec"]["OidcAttributes"].get("ClientID") != app:
    sys.exit(f"profile ClientID {obj['Spec']['OidcAttributes'].get('ClientID')} is not the env's Privilege app {app}: stop")
c, s = api(pt, f"/environments/{T}/applications/{app}/secret")
if c != 200:
    sys.exit(f"cannot read Privilege app secret: {c}")

new = json.loads(json.dumps(obj))
sp = new["Spec"]
sp["AgentLess"] = True
sp["IdpType"] = "Ping"
sp["EnableMFA"] = False
sp["OidcAttributes"]["OidcDomain"] = f"https://auth.pingone.com/{T}/as"
sp["OidcAttributes"]["ClientSecret"] = s["secret"]
print("after (planned):", show(sp))
if DRY:
    sys.exit(0)

os.makedirs(BACKUPS, exist_ok=True)
bk = os.path.join(BACKUPS, f"tenantprofile-{T[:8]}-{time.strftime('%Y%m%d-%H%M%S')}.json")
fd = os.open(bk, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump(obj, f, indent=1)
print("backup:", bk)

c, r = console("PUT", f"/tenantprofiles/default/{obj['ObjectMeta']['Name']}", new)
print("PUT:", c, "" if c == 200 else str(r)[:300])
time.sleep(3)
c, lst = console("GET", "/tenantprofiles?ObjectMeta.Namespace=default")
print("read-back:", show(lst["TenantProfiles"][0]["Spec"]))
