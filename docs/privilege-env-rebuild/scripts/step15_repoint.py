#!/usr/bin/env python3
"""Step 15: repoint AI-DEMO2 and the labs from the OLD Privilege tenants to the NEW one. Dry run by default; --apply writes.

For every env file (AI-DEMO2 demo_api_server/.env, ~/Development/.env, standalone/*/.env):
  * a variable whose value equals a known OLD agent key (matched by SHA-256 against old exports, never printed) is replaced
    with the same-named key's value on the new tenant (virtual keys are generated per tenant);
  * old tenant / environment ids (4cb38c18, 0428ba4f) in values are replaced with the new environment id;
  * OIDC client id / secret that belong to the old PingOne Privilege app are replaced with the new app's.
Anything that cannot be mapped is reported by name only. Each changed file is backed up (mode 600) before the write; modes are kept.
Usage: python3 -I step15_repoint.py [--apply] [--files path1,path2]
"""
import glob, hashlib, json, os, re, shutil, ssl, sys, time, urllib.request, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
ST = json.load(open(os.path.join(HERE, "..", "state.json")))
NEW = ST["env_id"]; NEW_APP = ST["privilege_app_id"]
OLD_ENVS = ["4cb38c18-691a-4201-a99d-b4b8842ca786", "0428ba4f-169c-436b-aff9-b230496e0e3b", "ea040334-d50b-4ded-8d98-4d5cd14dbd4d"]
OLD_APPS = ["33bb98ce-c805-43fa-9b01-1a7dc746ce53", "d6120528-3b53-4258-bd03-0ab100cab878", "1a403855-81f6-45eb-b233-fed59abc5c73",
            "ec787511-2fa5-460a-96ff-20d4eaa10e7e"]  # ec787511: ea040334's Privilege app (2026-11-24 move)
APPLY = "--apply" in sys.argv
# Variables that hold an environment id for something other than Privilege: the hitl lab pushes PingID through the old `pingid` env.
KEEP = {"HMLAB_PINGONE_ENV_ID"}
DK = os.path.expanduser("~/.config/demo-kit")
BACKUPS = os.path.join(DK, "backups", "repoint-" + time.strftime("%Y%m%d-%H%M%S"))
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()

# --- old key values -> key name (hash only)
old = {}
for src in ("privilege-export-0428ba4f-2026-11-17", "privilege-pingid-state-2026-11-17", "privilege-import-staging-2026-11-17"):
    p = os.path.join(DK, src, "agentaccesskeys.json")
    if os.path.exists(p):
        d = json.load(open(p)); v = next((x for x in d.values() if isinstance(x, list)), []) if isinstance(d, dict) else d
        for k in v:
            for f in ("VirtualKey",):
                val = k.get("Spec", {}).get(f) or ""
                if val: old[sha(val)] = k["ObjectMeta"]["Name"]
for f in glob.glob(os.path.join(DK, "*key*.txt")) + glob.glob(os.path.join(DK, "*key*.env")):
    n = os.path.basename(f)
    for l in open(f, errors="replace"):
        l = l.strip()
        if l and not l.startswith("#"):
            val = l.split("=", 1)[1].strip().strip("\"'") if "=" in l else l
            if len(val) > 20: old.setdefault(sha(val), "file:" + n)

# --- history (2026-11-24 move): consumers hold keys of an intermediate tenant (ea040334) that cannot be read any more.
# The earlier repoint runs backed up each env file before writing; a variable's value there is an export key, which names it.
hist = {}
for bdir in sorted(glob.glob(os.path.join(DK, "backups", "repoint-*"))):
    for bk in glob.glob(os.path.join(bdir, "*.bak")):
        target = os.path.basename(bk)[:-4]  # same naming as the backups this script writes
        for l in open(bk, errors="replace"):
            mm = re.match(r"^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$", l)
            if not mm: continue
            v = mm.group(2).strip().strip("\"'")
            if len(v) > 20 and old.get(sha(v), "file:").split(":")[0] != "file":
                hist.setdefault((target, mm.group(1)), old[sha(v)])

# --- new tenant keys and the new app secret
ctx = ssl._create_unverified_context(); H = {"x-procyon-session-id": str(uuid.uuid4()), "accept": "application/json"}
def console(kind):
    r = urllib.request.urlopen(urllib.request.Request(f"https://local.procyon.ai:8643/api/{NEW}/v1/{kind}?ObjectMeta.Namespace=default", headers=H), context=ctx, timeout=60)
    return next(v for v in json.loads(r.read()).values() if isinstance(v, list))
newkeys = {k["ObjectMeta"]["Name"]: k["Spec"].get("VirtualKey") or "" for k in console("agentaccesskeys")}
sys.path.insert(0, HERE)
from p1lib import load_env_file, token, api, NEW_ENV_CREDS
d = load_env_file(NEW_ENV_CREDS); pt = token(NEW, d["WORKER_CLIENT_ID"], d["WORKER_CLIENT_SECRET"])
c, sec = api(pt, f"/environments/{NEW}/applications/{NEW_APP}/secret"); NEW_APP_SECRET = sec["secret"]

files = [os.path.expanduser("~/Development/AI-DEMO2/demo_api_server/.env"), os.path.expanduser("~/Development/.env")]
files += sorted(glob.glob(os.path.expanduser("~/Development/AI-DEMO-Standalone/standalone/*/.env")))
if "--files" in sys.argv:
    files = [os.path.expanduser(x) for x in sys.argv[sys.argv.index("--files") + 1].split(",")]

# Variables that hold a key by NAME (from ~/Development/HANDOFF-2026-11-19-tools/pingid-cutover/repoint-gw-keys.sh, plus main/worker/openrouter)
NAME_MAP = [(r"_GW_KEY_LAB_AGENT$", "lab-agent"), (r"_GW_KEY_AGG_GUEST$", "agg-guest"), (r"_GW_KEY_AGG_DELEGATE$", "agg-delegate"),
            (r"^(APL_GW_KEY_MAIN_AGENT|SPIFFE_GW_KEY_MAIN|MAIN_AGENT_KEY)$", "main-agent"), (r"^WORKER_AGENT_KEY$", "worker-agent"),
            (r"^PRIVILEGE_LLM_VIRTUAL_KEY_OPENROUTER$", "ollama"),
            (r"^(PRIVILEGE_LLM_VIRTUAL_KEY_CUSTOM|HOSTED_LLM_VIRTUAL_KEY)$", "llama.cpp"), (r"^PRIV_LOG_AGENT_KEY$", "priv-log-agent")]
total = 0
for f in files:
    if not os.path.exists(f): continue
    lines = open(f, errors="replace").read().split("\n"); out = []; notes = []; idrep = set(); unmapped = []
    for l in lines:
        m = re.match(r"^(\s*(?:export\s+)?)([A-Za-z0-9_]+)(\s*=\s*)(.*)$", l)
        if not m or l.lstrip().startswith("#"): out.append(l); continue
        pre, var, eq, raw = m.groups(); val = raw.strip().strip("\"'"); q = raw.strip()[:1] if raw.strip()[:1] in "\"'" else ""
        new = None; why = None
        if var in KEEP:
            out.append(l); notes.append(f"  {var}: kept on purpose (not a Privilege id)"); continue
        kn = old.get(sha(val)) if len(val) > 20 else None
        if kn and not kn.startswith("file:") and kn in newkeys and newkeys[kn]:
            new, why = newkeys[kn], f"agent key '{kn}' -> new tenant key"
        elif kn and kn.startswith("file:"):
            notes.append(f"  {var}: old key from {kn[5:]} has no same-named key on the new tenant (left unchanged)") if False else None
        elif kn:
            notes.append(f"  {var}: old key '{kn}' has no value on the new tenant (left unchanged)")
        elif (f.replace("/", "_").lstrip("_"), var) in hist and len(val) > 20 and val not in set(newkeys.values()):
            hn = hist[(f.replace("/", "_").lstrip("_"), var)]
            if newkeys.get(hn): new, why = newkeys[hn], f"key '{hn}' (named via the 2026-11-23 repoint backup) -> new tenant key"
            else: unmapped.append(var + f" (was key '{hn}', not on the new tenant)")
        elif any(e in val for e in OLD_ENVS):
            new = val
            for e in OLD_ENVS: new = new.replace(e, NEW)
            why = "old environment id -> new"
        elif val in OLD_APPS:
            new, why = NEW_APP, "old Privilege OIDC client id -> new app"; idrep.add(var[:-len("_CLIENT_ID")] if var.endswith("_CLIENT_ID") else var)
        elif var.endswith("_CLIENT_SECRET") and var[:-len("_CLIENT_SECRET")] in idrep:
            new, why = NEW_APP_SECRET, "OIDC client secret follows its client id -> new app secret"
        elif len(val) > 20 and any(re.search(rx, var) for rx, _ in NAME_MAP) and not kn:
            kname = next(n for rx, n in NAME_MAP if re.search(rx, var))
            if newkeys.get(kname) and val != newkeys[kname]:
                new, why = newkeys[kname], f"key by name '{kname}' -> new tenant key"
            elif newkeys.get(kname):
                out.append(l); notes.append(f"  {var}: already the new-tenant key '{kname}'"); continue
            else:
                unmapped.append(var + f" (wanted key '{kname}')")
        elif len(val) > 20 and val in set(newkeys.values()):
            out.append(l); notes.append(f"  {var}: already a new-tenant key ('{[n for n, v in newkeys.items() if v == val][0]}')"); continue
        elif re.search(r"(GW_KEY|VIRTUAL_KEY|AGENT_KEY)", var) and len(val) > 20 and not kn:
            unmapped.append(var)
        if new is not None and new != val:
            out.append(f"{pre}{var}{eq}{q}{new}{q}"); notes.append(f"  {var}: {why}"); total += 1
        else: out.append(l)
    for u in unmapped: notes.append(f"  {u}: NOT MAPPED, no known old key matches it; needs a new key on the new tenant (left unchanged)")
    if notes:
        print(f"{f.replace(os.path.expanduser('~'), '~')}")
        for n in notes: print(n)
        if APPLY and "\n".join(out) != "\n".join(lines):
            os.makedirs(BACKUPS, exist_ok=True)
            bk = os.path.join(BACKUPS, f.replace("/", "_").lstrip("_") + ".bak"); shutil.copy2(f, bk); os.chmod(bk, 0o600)
            mode = os.stat(f).st_mode & 0o777
            with open(f, "w") as fh: fh.write("\n".join(out))
            os.chmod(f, mode); print("  -> written; backup", bk)
print(f"\n{'APPLIED' if APPLY else 'DRY RUN'}: {total} value(s) {'changed' if APPLY else 'would change'}")
