"""Small PingOne API helper for the Privilege environment rebuild.

Never prints secrets. Credentials come from env-style files in ~/.config/demo-kit (mode 600).
State (ids only, no secrets) is kept in ../state.json so every step can be re-run safely.
"""
import base64, json, os, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(os.path.dirname(HERE), "state.json")
ORG_CREDS = os.path.expanduser("~/.config/demo-kit/provisioning.json")
# Env var overrides the target environment's worker creds file (2026-11-24 move: privilege-env-5bfb4e12.env).
# P1_NEW_ENV_CREDS is the canonical name; PRIV_ENV_CREDS is accepted as the older alias.
CREDS_OVERRIDE = os.environ.get("P1_NEW_ENV_CREDS") or os.environ.get("PRIV_ENV_CREDS")
NEW_ENV_CREDS = os.path.expanduser(CREDS_OVERRIDE or "~/.config/demo-kit/pingid-privilege-env.env")
TLD = "com"  # NA region


def load_env_file(path):
    d = {}
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            d[k] = v.strip().strip('"').strip("'")
    return d


def token(env_id, client_id, secret):
    auth = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
    req = urllib.request.Request(
        f"https://auth.pingone.{TLD}/{env_id}/as/token",
        data=b"grant_type=client_credentials",
        headers={"Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded"},
    )
    return json.load(urllib.request.urlopen(req))["access_token"]


ORG_ADMIN_CREDS = os.path.expanduser("~/.config/demo-kit/pingid-env.env")


def org_token():
    """Org worker (Environment Admin at org scope). Cannot create environments."""
    p = load_env_file(ORG_CREDS)
    return token(p["PINGONE_ADMIN_ENV_ID"], p["PINGONE_ADMIN_CLIENT_ID"], p["PINGONE_ADMIN_CLIENT_SECRET"])


def org_admin_token():
    """A worker holding Organization Admin at org scope (needed to create environments).

    Prefers the new environment's own worker once step02 has written it, so the rebuild
    does not depend on the old `pingid` environment surviving.
    """
    if os.path.exists(NEW_ENV_CREDS):
        p = load_env_file(NEW_ENV_CREDS)
        if p.get("ORG_ADMIN") == "true":
            return token(p["ENV_ID"], p["WORKER_CLIENT_ID"], p["WORKER_CLIENT_SECRET"])
    p = load_env_file(ORG_ADMIN_CREDS)
    return token(p["PINGID_ENV_ID"], p["PINGID_WORKER_CLIENT_ID"], p["PINGID_WORKER_CLIENT_SECRET"])


def api(tok, path, method="GET", body=None, content_type="application/json"):
    url = path if path.startswith("http") else f"https://api.pingone.{TLD}/v1{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, method=method, data=data,
                                 headers={"Authorization": "Bearer " + tok, "Content-Type": content_type})
    try:
        resp = urllib.request.urlopen(req)
        raw = resp.read()
        return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw[:800]


def q(s):
    return urllib.parse.quote(s)


def read_state():
    return json.load(open(STATE)) if os.path.exists(STATE) else {}


def write_state(**kv):
    s = read_state()
    s.update(kv)
    json.dump(s, open(STATE, "w"), indent=2)
    return s


def write_secret_file(path, lines):
    """Write KEY=VALUE lines to a mode-600 file. Values are never echoed."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write("\n".join(lines) + "\n")
    os.chmod(path, 0o600)
