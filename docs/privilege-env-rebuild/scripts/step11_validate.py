"""Step 11: validate the new environment against the source env (`pingid`) and the Privilege tenant.

Read-only. Prints PASS / FAIL / INFO per check, exits 1 if any FAIL. Never prints secrets.
Usage: python3 -I step11_validate.py
"""
import json, os, ssl, sys, urllib.request, uuid
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p1lib import api, token, load_env_file, read_state, NEW_ENV_CREDS, ORG_ADMIN_CREDS, q

fails = 0


def check(ok, label, detail=""):
    global fails
    fails += (not ok)
    print(("PASS " if ok else "FAIL ") + label + (f"  [{detail}]" if detail else ""))


def info(label, detail=""):
    print("INFO " + label + (f"  [{detail}]" if detail else ""))


def items(tok, path, key):
    out, url = [], path
    while url:
        c, d = api(tok, url)
        if c != 200:
            return None
        out += d.get("_embedded", {}).get(key, []); url = d.get("_links", {}).get("next", {}).get("href")
    return out


src = load_env_file(ORG_ADMIN_CREDS); S = src["PINGID_ENV_ID"]
st = token(S, src["PINGID_WORKER_CLIENT_ID"], src["PINGID_WORKER_CLIENT_SECRET"])
dst = load_env_file(NEW_ENV_CREDS); D = dst["ENV_ID"]
dt = token(D, dst["WORKER_CLIENT_ID"], dst["WORKER_CLIENT_SECRET"])
state = read_state()

print(f"== environment {D}")
c, b = api(dt, f"/environments/{D}/billOfMaterials")
prods = {p["type"]: p.get("tags") for p in b["products"]}
for t in ("PING_ONE_BASE", "PING_ONE_RISK", "PING_ONE_AUTHORIZE", "PING_ONE_DAVINCI", "PING_ONE_PAM"):
    check(t in prods, f"product {t}", str(prods.get(t) or ""))
info("PingID (PING_ONE_ID) in new env", "present" if "PING_ONE_ID" in prods else "absent: skipped on purpose, needs a PingID admin login")

print("== populations, attributes, users")
s_pops = {p["name"]: p["id"] for p in items(st, f"/environments/{S}/populations", "populations")}
d_pops = {p["name"]: p["id"] for p in items(dt, f"/environments/{D}/populations", "populations")}
for n in s_pops:
    check(n in d_pops, f"population {n}")
sch = lambda tok, e: api(tok, f"/environments/{e}/schemas")[1]["_embedded"]["schemas"][0]["id"]
s_attrs = {a["name"] for a in items(st, f"/environments/{S}/schemas/{sch(st,S)}/attributes", "attributes") if a.get("schemaType") == "CUSTOM"}
d_attrs = {a["name"] for a in items(dt, f"/environments/{D}/schemas/{sch(dt,D)}/attributes", "attributes") if a.get("schemaType") == "CUSTOM"}
check(s_attrs <= d_attrs, f"custom attributes ({len(s_attrs)} source)", ",".join(sorted(s_attrs - d_attrs)))
s_users = {u["username"].lower(): u for u in items(st, f"/environments/{S}/users", "users")}
d_users = {u["username"].lower(): u for u in items(dt, f"/environments/{D}/users", "users")}
check(set(s_users) <= set(d_users), f"all {len(s_users)} source users exist", ",".join(sorted(set(s_users) - set(d_users))[:5]))
bad = [k for k in s_users if k in d_users and s_users[k].get("email") != d_users[k].get("email")]
check(not bad, "emails match for copied users", ",".join(bad[:5]))
dis = [k for k, u in d_users.items() if not u.get("enabled", True)]
check(not dis, "no copied user disabled", ",".join(dis[:5]))
for must in ("demouser", "demoadmin", "cmuir+agentadmin@pingone.com", "cmuir+agentenduser@pingone.com", "aidemo", "cmuir@pingidentity.com"):
    check(must in d_users, f"required user {must}")
nopw = []
for k in ("demouser", "demoadmin", "aidemo", "cmuir@pingidentity.com"):
    if k in d_users:
        c, pw = api(dt, f"/environments/{D}/users/{d_users[k]['id']}/password")
        if c != 200 or pw.get("status") not in ("OK", "MUST_CHANGE_PASSWORD"):
            nopw.append(f"{k}:{pw.get('status') if isinstance(pw, dict) else c}")
check(not nopw, "key users have a password set", ",".join(nopw))

print("== groups")
s_groups = {g["name"]: g for g in items(st, f"/environments/{S}/groups", "groups")}
d_groups = {g["name"]: g for g in items(dt, f"/environments/{D}/groups", "groups")}
for n, g in s_groups.items():
    check(n in d_groups, f"group {n}")
    if n in d_groups:
        flt = lambda gid: q(f'memberOfGroups[id eq "{gid}"]')
        sm = {u["username"].lower() for u in items(st, f"/environments/{S}/users?filter={flt(g['id'])}", "users")}
        dm = {u["username"].lower() for u in items(dt, f"/environments/{D}/users?filter={flt(d_groups[n]['id'])}", "users")}
        check(sm <= dm, f"group {n} members ({len(sm)} source, {len(dm)} new)", ",".join(sorted(sm - dm)[:5]))
pa = d_groups.get("PrivilegeAdmins", {}).get("id")

print("== roles on the new env")
c, roles = api(dt, "/roles"); rn = {r["id"]: r["name"] for r in roles["_embedded"]["roles"]}
need = {"demouser": 3, "demoadmin": 3, "cmuir+agentadmin@pingone.com": 3, "cmuir@pingidentity.com": 3}
for k in need:
    if k not in d_users:
        continue
    c, ra = api(dt, f"/environments/{D}/users/{d_users[k]['id']}/roleAssignments")
    have = {rn.get(x["role"]["id"]) for x in ra["_embedded"]["roleAssignments"] if x["scope"]["id"] == D}
    want = {"Identity Data Admin", "Environment Admin", "PingOne Privilege Administrator"}
    check(want <= have, f"{k} roles", ",".join(sorted(want - have)))
for l, uid in (("cmuir@pingidentity.com (Administrators env)", "e2cd745d-40de-47bf-b4f3-eac10aa85192"), ("cmuir@pingone.com (Administrators env)", "b8dee851-212f-4092-ad9d-a99285aa7691")):
    c, ra = api(dt, f"/environments/9e2f2f0c-f9fa-46da-b6f0-7eda4d3ccca2/users/{uid}/roleAssignments")
    have = {rn.get(x["role"]["id"]) for x in ra["_embedded"]["roleAssignments"] if x["scope"]["id"] == D}
    check({"Identity Data Admin", "PingOne Privilege Administrator"} <= have, f"{l} roles on new env", ",".join(sorted(have)))

print("== apps and sign-on")
c, apps = api(dt, f"/environments/{D}/applications"); apps = {a["name"]: a for a in apps["_embedded"]["applications"]}
pr = apps.get("PingOne Privilege")
check(bool(pr), "PingOne Privilege app exists")
if pr:
    check((pr.get("accessControl") or {}).get("group", {}).get("groups", [{}])[0].get("id") == pa, "Privilege app restricted to PrivilegeAdmins")
    uris = pr.get("redirectUris") or []
    miss = [h for h in ("mcpgw-pingid", "mcpgw-pingid2", "mcpgw-pingid3", "mcpgw2", "mcpgw") if not any(f"://{h}." in u for u in uris)]
    check(not miss, "Privilege app has gateway callbacks", ",".join(miss))
    c, g = api(dt, f"/environments/{D}/applications/{pr['id']}/grants")
    check(bool(g.get("_embedded", {}).get("grants")), "Privilege app has the openid resource grant")
    check(pr.get("enabled"), "Privilege app enabled")
c, pol = api(dt, f"/environments/{D}/signOnPolicies"); pol = pol.get("_embedded", {}).get("signOnPolicies", [])
check(any(p.get("default") for p in pol), "a default sign-on policy exists", ",".join(p["name"] for p in pol))
s_app_names = set(a["name"] for a in items(st, f"/environments/{S}/applications", "applications"))
info("apps in pingid but not in new env (not copied by design)", ",".join(sorted(s_app_names - set(apps)))[:300])

print("== Privilege tenant (via local agent console API)")
H = {"x-procyon-session-id": str(uuid.uuid4()), "accept": "application/json"}
ctx = ssl._create_unverified_context()


def console(kind):
    try:
        r = urllib.request.urlopen(urllib.request.Request(f"https://local.procyon.ai:8643/api/{D}/v1/{kind}?ObjectMeta.Namespace=default", headers=H), context=ctx, timeout=20)
        return list(json.loads(r.read()).values())[0]
    except Exception as e:
        return None


tp = console("tenantprofiles")
if not tp:
    check(False, "Privilege console API answers for this tenant", "agent not connected to the new tenant?")
else:
    sp = tp[0]["Spec"]
    check(sp.get("EnableMFA") is False, "tenant MFA off (EnableMFA=false)")
    check(sp.get("AgentLess") is True, "AgentLess=true (Nodes / gateway pages)", str(sp.get("AgentLess")))
    check(sp.get("IdpType") == "Ping", "IdpType=Ping", str(sp.get("IdpType")))
    check(f"/{D}/" in (sp["OidcAttributes"].get("OidcDomain") or ""), "OidcDomain points at the new env")
    check(sp["OidcAttributes"].get("ClientID") == (pr or {}).get("id"), "OIDC client = the env's PingOne Privilege app")
    check(bool(sp["OidcAttributes"].get("ClientSecret")), "OIDC client secret present")
    pu = console("users"); pg = console("groups")
    pa_filter = q('memberOfGroups[id eq "%s"]' % pa) if pa else ""
    n_pa = len(items(dt, f"/environments/{D}/users?filter={pa_filter}", "users") or []) if pa else 0
    check(pu is not None and len(pu) == n_pa, f"Privilege tenant users == PrivilegeAdmins members ({n_pa})", str(len(pu) if pu is not None else None))
    check(pg is not None and len(pg) >= 1, "Privilege tenant has the PrivilegeAdmins group", str(len(pg) if pg is not None else None))
    for kind in ("applications", "pacpolicys", "aipolicys", "tagpolicys", "nonhumanidentities", "agentaccesskeys", "proxycontrollers"):
        v = console(kind)
        info(f"Privilege objects: {kind}", str(len(v) if v is not None else "n/a"))

print(f"\n{'ALL CHECKS PASSED' if not fails else str(fails) + ' CHECK(S) FAILED'}")
sys.exit(1 if fails else 0)
