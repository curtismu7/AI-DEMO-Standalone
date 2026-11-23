#!/usr/bin/env python3
"""Redis password rotation, phase A (no consumer is affected): new password + backups + add it as a SECOND valid password + update secrets.
Never prints a password. State: ~/.config/demo-kit/redis-rotation-<date>/ (mode 700; new-password mode 600)."""
import base64, json, os, re, secrets, string, subprocess, sys, time
NSC, NST = "ping-devops-cmuir", "ping-devops-curtismuir"
BK = os.path.expanduser("~/.config/demo-kit/redis-rotation-20261123"); os.makedirs(BK, mode=0o700, exist_ok=True)
def sh(args, inp=None):
    r = subprocess.run(args, input=inp, capture_output=True, text=True); return r.returncode, r.stdout, r.stderr
def secret(ns, name):
    c, o, e = sh(["kubectl", "-n", ns, "get", "secret", name, "-o", "json"]); assert c == 0, e; return json.loads(o)
# backups of both secrets (mode 600)
for ns, n in ((NSC, "privilege-redis"), (NSC, "privilege-redis-url"), (NST, "privilege-redis-url")):
    p = os.path.join(BK, f"{ns}.{n}.before.yaml"); c, o, _ = sh(["kubectl", "-n", ns, "get", "secret", n, "-o", "yaml"])
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600); os.write(fd, o.encode()); os.close(fd)
old = base64.b64decode(secret(NSC, "privilege-redis")["data"]["password"]).decode()
npath = os.path.join(BK, "new-password")
if os.path.exists(npath): new = open(npath).read().strip(); print("reusing the new password already generated")
else:
    new = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(40))
    fd = os.open(npath, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600); os.write(fd, new.encode()); os.close(fd)
print("new password generated and stored (mode 600):", len(new), "chars; differs from old:", new != old)
# the URL secrets must have the exact shape redis://:<old>@host:port/db
for ns in (NSC, NST):
    u = base64.b64decode(secret(ns, "privilege-redis-url")["data"]["url"]).decode()
    m = re.match(r"^(rediss?://):([^@]*)@(.+)$", u); assert m and m.group(2) == old, f"{ns} url secret does not match the old password / expected shape"
    print(f"{ns}: url secret has the expected shape and the old password")
# add the new password as a second valid password on the running server (value goes through stdin only)
redis = ["kubectl", "-n", NSC, "exec", "-i", "deploy/privilege-redis", "--", "sh", "-c"]
c, o, e = sh(redis + ['NEWPW=$(cat); redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ACL SETUSER default ">$NEWPW"'], new); print("ACL add new password:", o.strip() or e.strip()[:80])
c, o, e = sh(redis + ['NEWPW=$(cat); echo "new password: $(redis-cli -a "$NEWPW" --no-auth-warning ping 2>&1 | head -1)"; echo "old password: $(redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping 2>&1 | head -1)"; redis-cli -a "$NEWPW" --no-auth-warning dbsize | sed "s/^/keys: /"'], new); print(o.strip())
if "new password: PONG" not in o: sys.exit("new password does not authenticate; stopping before touching any secret")
# update the secrets (patch with stringData from a 600 temp file: no last-applied annotation, value not in argv)
def patch(ns, name, field, value):
    pf = os.path.join(BK, ".patch.json"); fd = os.open(pf, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600); os.write(fd, json.dumps({"stringData": {field: value}}).encode()); os.close(fd)
    c, o, e = sh(["kubectl", "-n", ns, "patch", "secret", name, "--type", "merge", "--patch-file", pf]); os.unlink(pf); return c == 0
print("patch secret privilege-redis/password:", patch(NSC, "privilege-redis", "password", new))
for ns in (NSC, NST):
    u = base64.b64decode(secret(ns, "privilege-redis-url")["data"]["url"]).decode()
    print(f"patch secret {ns}/privilege-redis-url:", patch(ns, "privilege-redis-url", "url", u.replace(f":{old}@", f":{new}@", 1)))
for ns, n, f in ((NSC, "privilege-redis", "password"), (NSC, "privilege-redis-url", "url"), (NST, "privilege-redis-url", "url")):
    v = base64.b64decode(secret(ns, n)["data"][f]).decode(); print(f"read-back {ns}/{n}: new value present = {new in v}, old value present = {old in v}")
