"""Step 08: write the gateway settings for the new tenant (no cluster change).

Outputs (mode 600, never printed):
  ~/.config/demo-kit/rebuild-gw/oidc-new.values.yaml   helm values: oidc.* for the new env
  ~/.config/demo-kit/rebuild-gw/local-pingone.env       for ~/Development/pingid-gateway
The OIDC client is the new env's "PingOne Privilege" app (step 07 prepared it).
serverUrl and hostnames are NOT in the file: each release keeps its own via --reuse-values.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p1lib import api, token, load_env_file, read_state, NEW_ENV_CREDS

OUT = os.path.expanduser("~/.config/demo-kit/rebuild-gw")
os.makedirs(OUT, mode=0o700, exist_ok=True)
d = load_env_file(NEW_ENV_CREDS); D = d["ENV_ID"]
t = token(D, d["WORKER_CLIENT_ID"], d["WORKER_CLIENT_SECRET"])
APP = read_state()["privilege_app_id"]
c, s = api(t, f"/environments/{D}/applications/{APP}/secret")
if c != 200:
    sys.exit(f"cannot read app secret: {c}")
secret = s["secret"]
base = f"https://auth.pingone.com/{D}/as"


def write(path, text):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(text)


write(os.path.join(OUT, "oidc-new.values.yaml"),
      "# Pingid-privilege OIDC for the gateways. Written by step08_gateway_values.py. SECRET.\n"
      "oidc:\n"
      f"  clientId: \"{APP}\"\n"
      f"  clientSecret: \"{secret}\"\n"
      f"  authUrl: \"{base}/authorize\"\n"
      f"  tokenUrl: \"{base}/token\"\n"
      f"  userUrl: \"{base}/userinfo\"\n"
      "  scopes: \"openid profile email\"\n")

# OPTIONAL, only if you run a local Docker gateway (we dropped ours on 2026-11-23): same keys as its current pingone.env, values for the new env.
cur = load_env_file(os.path.expanduser("~/Development/pingid-gateway/procyon/config/pingone.env"))
cur.update({"PINGONE_ENVIRONMENT_ID": D, "OIDC_CLIENT_ID": APP, "OIDC_CLIENT_SECRET": secret,
            "OIDC_AUTH_URL": f"{base}/authorize", "OIDC_TOKEN_URL": f"{base}/token",
            "OIDC_USER_URL": f"{base}/userinfo", "OIDC_SCOPES": "openid profile email"})
write(os.path.join(OUT, "local-pingone.env"), "".join(f"{k}={v}\n" for k, v in cur.items()))
print("written (mode 600):", os.listdir(OUT))
