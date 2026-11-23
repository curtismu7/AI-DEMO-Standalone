#!/usr/bin/env python3
"""Step 16: restart running labs so they read the repointed env, using each tile's own start command from the shelf
(`docker compose -f <file> up -d`, which recreates a container whose environment changed, and does not touch other demos or the
shelf's running cap). The `open <url>` at the end of the tile command is skipped. Env values are compared by SHA-256, never printed.
Usage: python3 -I step16_restart_labs.py <demo-id> [<demo-id> ...]   (add --dry-run to only run the before-check)
"""
import hashlib, json, os, re, subprocess, sys, time, urllib.request

SHELF = "http://127.0.0.1:4400/api/shelf"
DEV_ENV = os.path.expanduser("~/Development/.env")
# demo id -> variables whose NEW values must be inside the container afterwards
CHECK = {"privilege-api-explorer": ["PRIV_LOG_CONSOLE_TENANT"], "pf-array-claims-lab": ["PAC_GW_KEY_LAB_AGENT", "PAC_GW_KEY_AGG_GUEST", "PAC_GW_KEY_AGG_DELEGATE"],
         "meridian-air-lab": ["MA_REGISTRY_TENANT"], "privilege-a2a-anthropic-demo": ["MAIN_AGENT_KEY", "WORKER_AGENT_KEY"], "spiffe-issuer": ["SPIFFE_GW_KEY_MAIN"]}
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()


def envfile(p):
    d = {}
    if os.path.exists(p):
        for l in open(p, errors="replace"):
            m = re.match(r"^\s*(?:export\s+)?([A-Za-z0-9_]+)=(.*)$", l.rstrip("\n"))
            if m and not l.lstrip().startswith("#"): d[m.group(1)] = m.group(2).strip().strip("\"'")
    return d


def container_env_hashes(compose_file):
    ids = subprocess.run(["docker", "compose", "-f", compose_file, "ps", "-q"], capture_output=True, text=True).stdout.split()
    hs = set()
    for i in ids:
        out = subprocess.run(["docker", "inspect", "-f", "{{json .Config.Env}}", i], capture_output=True, text=True).stdout
        try:
            for kv in json.loads(out): hs.add(sha(kv.split("=", 1)[1] if "=" in kv else ""))
        except Exception: pass
    return len(ids), hs


demos = {x["id"]: x for x in json.load(urllib.request.urlopen(SHELF, timeout=30))["demos"]}
dry = "--dry-run" in sys.argv
for did in [a for a in sys.argv[1:] if not a.startswith("--")]:
    x = demos[did]; cf = x["composeFile"]; labdir = os.path.dirname(cf)
    env = {**envfile(DEV_ENV), **envfile(os.path.join(labdir, ".env"))}
    want = {v: sha(env[v]) for v in CHECK.get(did, []) if env.get(v)}
    n0, h0 = container_env_hashes(cf)
    before = {v: (hv in h0) for v, hv in want.items()}
    print(f"\n== {did}: {n0} container(s) up | new value already inside before restart: {before}")
    if dry: continue
    if n0 and all(before.values()) and want:
        print("   already running with the new values; nothing to do"); continue
    cmd = x["startCommand"].split(" && echo ")[0]  # cd <dir> && docker compose -f <file> up -d
    t0 = time.time(); r = subprocess.run(["bash", "-c", cmd], capture_output=True, text=True, timeout=600)
    print(f"   start command: exit {r.returncode} in {time.time()-t0:.0f}s" + ("" if r.returncode == 0 else " | " + (r.stderr or r.stdout)[-300:]))
    url = x["url"].rstrip("/") + "/api/health"; ok = False
    for _ in range(24):
        try:
            if urllib.request.urlopen(url, timeout=5).status < 400: ok = True; break
        except Exception: pass
        time.sleep(5)
    n1, h1 = container_env_hashes(cf)
    after = {v: (hv in h1) for v, hv in want.items()}
    print(f"   health {url.replace('http://127.0.0.1','127.0.0.1')}: {'OK' if ok else 'NOT READY'} | containers {n1} | new values inside now: {after}")
    print("   " + ("PASS" if ok and all(after.values()) else "CHECK"))
