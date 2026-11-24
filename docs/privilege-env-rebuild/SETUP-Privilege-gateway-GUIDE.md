# Rebuild a PingOne Privilege environment you fully control

For: anyone who needs a fresh PingOne environment with PingOne Privilege (agent mode), PingID, users and admins, and who wants to avoid getting locked out again. Written during the 2026-11-23 rebuild of `pingid` into **Pingid-privilege** (`645f6ca6-a107-404d-99ae-1f908f84a9bb`). Steps 1–6 are done and verified; later steps are filled in as they are done.

Scripts: `~/Development/privilege-env-rebuild/scripts/`. Run each with `python3 -I <script>`. Every script is safe to re-run: it matches by name and reuses what already exists. Ids (no secrets) are kept in `state.json` next to this guide.

## Rule zero: a PERSON creates the environment, in the console

**PingOne Privilege Administrator is granted automatically (`readOnly: true`) only to the person who creates the environment with Privilege in the PingOne console, and nobody can grant it afterwards.** The role's `canAssign` requires the assigner to hold it at the same or a broader scope, and no one holds it org-wide.

The first attempt (2026-11-23, env `645f6ca6`, created by `step01` through the API by a worker) ended with:
- no Privilege admin anywhere, so the console hid the Nodes page and refused tenant-profile edits ("user not authorized to edit");
- a half-provisioned tenant: `AgentLess: false`, empty `IdpType`/`OidcDomain`/`ClientSecret`, and 0 users synced;
- no sign-on policy at all.

It was deleted and re-created by the owner in the console. `step01_create_env.py` is kept only for non-Privilege environments.

**Mode for a tenant that uses the local desktop agent and AI gateways:** create Privilege in **agentless (AI gateway)** mode, then switch the product tag to `AUTHENTICATION_MODE_AGENT` (`PUT /environments/{id}/billOfMaterials` with the product list unchanged except that tag). The result is `AgentLess: true` (the Nodes page) plus agent onboarding links; that is how `pingid` was built. Creating directly in agent mode gave `AgentLess: false`.

## Before you start: credentials and who can do what

| What | Where | Can do |
|---|---|---|
| Org-admin worker (the `pingid` env's "worker app") | `~/.config/demo-kit/pingid-env.env` | **Organization Admin** at org scope: create environments |
| Org worker | `~/.config/demo-kit/provisioning.json` | Environment Admin at org scope. **Cannot create environments** (403) |
| New env worker | `~/.config/demo-kit/pingid-privilege-env.env` (written by step 2) | Identity Data Admin + Environment Admin in the new env |
| Console logins (Administrators env `9e2f2f0c`) | `cmuir@pingidentity.com`, `cmuir@pingone.com` | Organization Admin; need **Identity Data Admin on the env** to see Users |

Never print a secret. Every file above is mode 600.

## Naming: follow the rulebook (binding)
Every Privilege app, agent key, policy and gateway created, renamed or removed by this runbook follows `AI-DEMO2/privilege/NAMING-CONVENTION.md` (grammar `lab-<system>-<variant>`, the full/limited/blocked trio, `lab-<system>[-<role>]-key`, gateways `mcpgw-<where>-<role><n>`), and that file and its change log are updated in the same change. The names written by `step14_pgc_doors_keys.py` (`demo-all-tools`, `demo-some-tools`, `demo-blocked`, `pgc-*`) and `step17` (`lab-agent-*`) are the pre-cleanup names: the 2026-11-23 cleanup (PR #3686) renamed them to `lab-banking-*`, `lab-agg-*` and `lab-*-key`. When you re-run or copy a step, use the convention names, not those. Check a tenant with `node privilege/scripts/apply-tag-schema.mjs --dry-run`: it must report `orphan 0`.

## Step 1: create the environment (a person, PingOne console) — done 2026-11-23 as `ea040334-d50b-4ded-8d98-4d5cd14dbd4d`
Signed in to the Administrators environment as an admin login, go to Environments → **+**:
1. **Name** `Pingid-privilege`, a description, licence type **Paid**, use case **Workforce**, type **Sandbox**.
2. **License:** the one with Privilege (`INTERNAL 2019-06-06`, id `d58965b8…`; `GET /organizations/{org}/licenses` shows `privilege.allowPrivilege`). Capabilities: PingOne SSO, Protect, Authorize, DaVinci, **Privilege**. PingID can be ticked too, but it asks for a PingID admin login ("Use Existing") or a new account. It was skipped this time, to be added later for HITL pushes.
3. **Privilege → Authentication Mode → Endpoint Controller.** That option is the local desktop agent and sets `PING_ONE_PAM` tag `AUTHENTICATION_MODE_AGENT`.
4. Save, then run `step01_create_env.py`: it finds the environment by name, records its id in `state.json` and creates nothing.

What the console creation gives you that the API does not: the signed-in person gets **PingOne Privilege Administrator (read-only)**, the "PingOne Privilege" app is created, and there is a default `Single_Factor` sign-on policy. In 2026-11-23's run that person was `cmuir@pingone.com`, whichever login the browser was signed in with.

## Step 1b: give the worker its roles (a person, console)
Because a person created the environment, no worker holds Identity Data Admin there, so step 02 cannot grant it (CONSTRAINT error) and group creation gets 403. As the creator, go to the environment → Applications → **privilege-rebuild worker** → Roles → Grant Roles. Tick **Identity Data Admin** on Pingid-privilege (search the list; leave the other environments alone) and **PingOne Privilege Administrator** on Pingid-privilege, then Save. After that the worker can grant Privilege Administrator to users by API (step 04/04b).

Historic (do not use for Privilege): `step01_create_env.py [--name …]` creates the environment through the API.

Creates a SANDBOX environment in NA with the licence of `pingid` and the products Base, Risk, DaVinci, **Privilege (`PING_ONE_PAM`, tag `AUTHENTICATION_MODE_AGENT`)**, Authorize, PingID (Workforce). PingOne creates the "PingOne Privilege" web app, PingID Mobile/Desktop apps and a Default population on its own.

Gotchas:
- The environment description may not contain `~ $ + < = > ^ \` |`.
- `name eq` is not a valid environment filter; use `name sw` and compare exactly.
- Only an **Organization Admin** can create environments.

Check: the script prints the product list; `PING_ONE_PAM ['AUTHENTICATION_MODE_AGENT']` must be there.

## Step 2: give the new environment its own worker
`step02_worker.py` (add `--org-admin` only with the owner's explicit OK)

Creates "privilege-rebuild worker", grants Identity Data Admin + Environment Admin on the new env and writes its credentials to `~/.config/demo-kit/pingid-privilege-env.env`.

Gotchas:
- A worker created through the API needs `"protocol": "OPENID_CONNECT"`.
- **It inherits every role of the worker that created it** (here: Organization Admin and Identity Data Admin on 54 other environments). Treat its secret as an org-admin secret, or strip the inherited roles in the console.
- "UNIQUE" on a role grant means the role is already held. That is not a failure.

Check: the new worker gets HTTP 200 on `GET /environments/<new>/users`.

## Step 3: copy users, groups and attributes
`step03_copy_users.py [--dry-run]` (always dry-run first)

Copies from `pingid`: custom schema attributes (10), populations, all users (83) with the demo password, groups (`PrivilegeAdmins`) and memberships (21). The old→new id map holds usernames, so it goes to `~/.config/demo-kit/privilege-rebuild-idmap.json` (mode 600).

Gotchas:
- PingOne **ignores `password` on create**: set it afterwards with `PUT /users/{id}/password`, content type `application/vnd.pingidentity.password.set+json`, `forceChange: false`.
- MFA devices (PingID pairings) are **not** copied. Users re-pair PingID before any MFA is switched on.

## Step 4: admins who can see Users, and the Privilege app restriction
`step04_admins_and_app.py`

- Grants Identity Data Admin + Environment Admin on the new env to both console logins and to `demouser`, `demoAdmin`, `cmuir+AgentAdmin@pingone.com`.
- Restricts the **PingOne Privilege** app to `PrivilegeAdmins` (`accessControl.group`). The script does GET, then a backup to `~/.config/demo-kit/backups/`, then a change to that one field and a PUT of the whole object. A partial PUT silently drops `accessControl`; that caused the "designated group" lockout on 2026-11-20.

**Local admin inside the environment:** `step04b_local_admin.py --username cmuir@pingidentity.com` makes sure a user of that name exists *in the new env*: it creates it if missing (Default population, demo password), adds it to `PrivilegeAdmins` and grants Identity Data Admin + Environment Admin there. This is separate from the Administrators-env login of the same name: the local one signs in to the environment's own apps (Privilege console, portal). Check membership with `GET /users/{id}/memberOfGroups`; `?expand=memberOfGroups` on the user returns nothing.

**Signing in to the new env's own console needs MFA, and here that means PingID.** PingOne forces MFA for admin-console sign-ins: on the first one it creates the device policy `PingOne_Admin_MFA` and sends the user to `MFA_REGISTRATION_REQUIRED`. This env has PingID (`PING_ONE_ID`) instead of PingOne MFA, so email/SMS devices cannot be added (`POST /users/{id}/devices` type EMAIL returns a generic 400), and copied users have no devices. Result on 2026-11-23: `demouser` signed in and the page spun on MFA registration. **Do admin work through the Administrators-env logins** (`console.pingone.com/?env=9e2f2f0c-…`), whose MFA already works. A local admin login only works after that user pairs PingID in the new env.

**Why users were invisible last time:** `cmuir@pingone.com` held **no roles at all** on `pingid`. Organization Admin alone does not show the Users page; **Identity Data Admin on that environment** does. Read-back after step 4: both logins hold Identity Data Admin on Pingid-privilege.

**Console step (the API cannot do it):** *PingOne Privilege Administrator* can only be granted by someone holding it at the same or a broader scope, and no worker does. In the PingOne admin console, as an Organization Admin, grant it on Pingid-privilege to the two console logins and `demouser`.

## Step 5: sign-on policies (an API-made environment has none)
`step05_signon_policies.py [--only Single_Factor]`

Symptom without it: MyAccount, the app portal and every app sign-in show "Something went wrong while signing you in … There was an unexpected error with the service". Only the admin console works, because it has a built-in policy. The script copies `Single_Factor` (LOGIN) from the source env and makes it the **default**; PingOne ignores `default` on create, so the script sets it with a PUT. `Multi_Factor` (LOGIN + PINGID_AUTHENTICATION) can be copied the same way, but do not attach it to the Privilege app until every approver has paired PingID.

Check: `GET /signOnPolicies` shows `Single_Factor` with `default: true`.

## Step 6: pair the desktop agent and pick the tenant
1. Generate the onboarding link for `demouser` in the new tenant and open it on the Mac. Onboarding **adds** the tenant to the device's list; it does not remove the others.
2. **Set the preferred tenant.** Otherwise the agent "falls back to default", which on this Mac is the old "AI Agent" tenant (`0428ba4f`). That tenant has Privilege MFA on and its MFA start fails, which gives the "Failed to initiate MFA verification" dialog. Use the app's Settings → **Preferred Tenant** → Pingid-privilege → Update, or the same call on the local service:
   `curl -s -X POST -H 'Content-Type: application/json' -d '{"Tenant":"<new env id>"}' http://127.0.0.1:8008/setpreftenant`
   The value is the tenant **id**. `""` resets it to the default.
3. Check: `curl -s http://127.0.0.1:8008/status` shows `AgentState: connected` and `PrefTenant: <new env id>`. `/Library/Logs/Procyon/procyon-agent.log` shows `Got TenantProfile <new env id>` with `EnableMFA:false`, and `https://local.procyon.ai:8643/ui/` answers.

Done 2026-11-23 06:28: connected to Pingid-privilege, `EnableMFA:false`, console up.

Diagnosis aids: the app log is `~/Library/Logs/PingOne Privilege/main.log`; the root agent log (`/Library/Logs/Procyon/procyon-agent.log`) is the one with the real reason. That root log also prints the tenant's OIDC client secret in plain text, so never paste it anywhere.

## Step 7: make the Privilege app the gateways' OIDC client
`step07_gateway_oidc_app.py [--dry-run]`: adds `https://<host>/callback` for every gateway host to the new env's **PingOne Privilege** app (union, GET → back up → PUT the whole app). It also mirrors the source app's resource grant (`openid`: openid, profile) by name, because resource ids differ per env. Without the grant, a gateway asking for `openid profile email` fails at sign-in.

## Step 8: gateway settings for the new tenant (no cluster change)
`step08_gateway_values.py` writes `~/.config/demo-kit/rebuild-gw/oidc-new.values.yaml` (`oidc.clientId/clientSecret/authUrl/tokenUrl/userUrl/scopes`) and `local-pingone.env`, both mode 600. Each release keeps its own `serverUrl`/hostname through `--reuse-values`.

Before the window: back up every release (values, manifest, Secrets, Deployment, `/procyon/ssl` tar) to `~/.config/demo-kit/backups/gw-rebuild-<ts>/`. Then run `helm upgrade --dry-run=server` and diff against `helm get manifest`. 2026-11-23 result: only `OIDC_*` and the image changed, so there was no chart drift. **Mask `KEY=value` lines in any diff.** A JWT-only mask leaked three OIDC client secrets into a chat; the new one was rotated straight away (`POST /applications/{id}/secret`).

## Step 9: the cutover window (`step09_gateway_cutover.sh`)
Owner, per gateway: in the **new** tenant's Privilege console, Cloud → Nodes → Add New → **AI GW** form, Cluster ID `ai-demo-cmuir`, Host IP = the node's in-cluster Service name (not the pre-filled `ai-demo.ping-devops.com`). Save the `eyJ…` as one line `ENV_PROXY_TOKEN=eyJ…` in `~/.config/demo-kit/rebuild-gw/token-<tag>.env`, mode 600, with no spaces around it. Tokens are single-use and last about 2 h.

| tag | Host IP for the AI GW form | public host |
|---|---|---|
| `cmuir-pingid` | `agentless-mcpgw-pingid.ping-devops-cmuir.svc.cluster.local` | `mcpgw-pingid.ai-demo…` (HAProxy pingid-1) |
| `cmuir-pingid2` | `agentless-mcpgw-pingid2.ping-devops-cmuir.svc.cluster.local` | `mcpgw-pingid2.ai-demo…` (pingid-2) |
| `curtismuir-pingid3` | `agentless-mcpgw-pingid.ping-devops-curtismuir.svc.cluster.local` | `mcpgw-pingid3.ai-demo…` (pingid-3) |
| `cmuir-mcpgw2` | `agentless-mcpgw.ping-devops-cmuir.svc.cluster.local` | `mcpgw2.ai-demo…` |
| `local` | `pingid-gw.local.ping-devops.com` | local Docker (dropped 2026-11-23, not used; see the local Docker guide) |

Order per gateway: `check` → `upgrade <tag>` → `identity <tag>` (prints the in-pod command; the **owner** runs it because the harness blocks file moves in pods; old files are moved to a subfolder, not deleted) → `restart <tag>` → `verify <tag>`. Do the three HAProxy backends back to back so the pool never mixes tenants. Rollback: restore the backed-up Secret and `ssl` tar, restart.

## Step 13: replay a saved Privilege export (`step13_replay_export.mjs`)
A new tenant has users and the `PrivilegeAdmins` group (synced from PingOne) and nothing else. Apps, grants, policies and keys come from a saved export of another tenant, rewritten for this one. The rewrite is `~/Development/PINGID-MIGRATION/lib.mjs`: every cross-object reference is `base64(tenant@@@namespace@@@name)`, so the tenant id changes everywhere, users are matched by `UserName`, the group id is mapped, and secret fields are blanked.

`node step13_replay_export.mjs` is a dry run (counts, unmapped users, secrets to re-enter). Add `--apply` to write, `--keys` to include agent keys, `--kinds a,b` to choose kinds. It is idempotent (existing names are skipped) and refuses to write any object that still names the old tenant. It also rewrites references stored as plain strings (the `agentaccesskey` attribute in key-bound grants), which the library does not.

Result 2026-11-23 on `ea040334` from the 11-17 export of the old tenant: 10/10 NHIs, 31/31 apps, 24/25 grants (one had no rule left), 15/15 AI policies, 18/18 tag policies, 9/9 shadow-AI policies, 22/23 agent keys. No reference to another tenant remains and every object reports valid.

Things that failed first time, and the fix:
- **Aggregate apps** (`aggregate`, `aggregate-limited`, `aggregate-none`, `banking-aggregate`) failed with "member ... does not exist": their member apps were created later in the same run. Run the apps kind again.
- **NHIs with a docker or kubernetes platform** failed with "Federation.Audience is generated": drop that field and Privilege generates it.
- **LLM keys** failed with "RealKey is required": the real provider key is never in an export. The script fills it from `~/.config/demo-kit/provider-keys.pingid.env` (names only in logs), checks the key's format, and renews already-expired keys by 90 days. A key with an invalid value is refused (the Google one was).

Still to re-enter by hand (values cannot be copied): `agent-gateway` and `banking-mcp` (`McpAppConfig.AuthToken`), `muse-ig` (`McpAppConfig.Headers`), `mcp-grafana` (`GRAFANA_SERVICE_ACCOUNT_TOKEN`), the virtual keys of the 16 provider-backed or backed keys, the 2 secrets and their secret-store account, and the provider key for `google`. Not replayed on purpose: approval requests, notification subscriptions, Slack and Mattermost integrations, the proxy controller (a gateway re-registers it).

## HAProxy pool and the spare gateway (decision 2026-11-23)
All three new gateways (`agentless-mcpgw-pingid`, `-pingid2` in `ping-devops-cmuir`, `agentless-mcpgw-pingid` in `ping-devops-curtismuir`) are enrolled to the new environment only. `pingid2` is kept running but **parked** in the HAProxy pool (`mcpgw-lb` in `ping-devops-curtismuir`) so it takes no traffic through `mcpgw.ai-demo…`; it stays available as a spare for migration. Parking is two things: `disabled` on its `server gateway-pingid-2` line in the `mcpgw-lb-config` ConfigMap (survives restarts; the ConfigMap is Helm-owned, so a future `helm upgrade` of release `agentless-mcpgw` would undo it) and, live, `echo "set server gateways/gateway-pingid-2 state maint" | nc 127.0.0.1 9999` inside each LB pod. Check: `echo "show servers state gateways" | nc 127.0.0.1 9999` shows admin state 1 for it. The original ConfigMap is in `~/.config/demo-kit/backups/gw-rebuild-*/curtismuir-mcpgw-lb-config.before-pingid2-park.yaml`. Rule: every backend in the pool must be on the same tenant; a parked one may be on any.

**Decision (later the same day): the new environment has two nodes only,** one in `ping-devops-cmuir` (`mcpgw-cm-pool1`) and one in `ping-devops-curtismuir` (`mcpgw-ct-pool2`). `pingid2` (`mcpgw-cm-spare1`) stays parked and is not re-enrolled, so it may still be enrolled to the old tenant; a parked backend may be on any tenant. Tokens needed: `token-cmuir-pingid.env` and `token-curtismuir-pingid3.env`. `mcpgw-cm-nyl` and the local Docker gateway are not moved.

## Cutover record and lessons (2026-11-23, two nodes: `mcpgw-cm-pool1`, `mcpgw-ct-pool2`)
Order that worked: `upgrade` both releases (new token, new `oidc.*`, image) -> owner moves the old `proxy-*` identity files into `pre-<tenant>-move` inside each pod -> restart both -> verify. Result: both nodes show in the new tenant's console, command stream established to `ea040334`, registry loaded.

Lessons (each cost time):
- **`oidc.serverUrl` must equal the release's own host.** On `agentless-mcpgw-pingid` (curtismuir) it pointed at the cmuir host, so the chart rendered ingress `backend-protocol: HTTP` and `helm upgrade` failed with an SSA conflict against the hand-set `HTTPS` annotation (`kubectl-annotate`). Fix: `--set oidc.serverUrl=https://mcpgw-pingid3.ai-demo.ping-devops.com` (`EXTRA_HELM_ARGS` in `step09_gateway_cutover.sh`). Check what the chart renders first: `helm template … | grep backend-protocol`. Never `--force-conflicts`.
- **Image v1.261120 validates the TLS certificate against `SERVER_URL`.** A mismatch logs "certificate not valid for hostname", falls back to HTTP mode, and the ingress answers 502. The older NYL image did not check.
- **A changed Secret does not restart a pod.** After `helm upgrade` the pod keeps the old `SERVER_URL`, OIDC and token until it is restarted. A failed upgrade can still have applied the Secret and Deployment.
- **HAProxy holds a restarted backend out for 10 minutes** (`rise 60`, check every 10 s), so the shared host returns 503 meanwhile. Promote live: `echo "set server gateways/<backend> health up" | nc 127.0.0.1 9999` in each LB pod; its own checks demote it again if it is really down.
- **Mesh noise:** the two nodes log `Error connecting to the server <other>:8690 ... context deadline exceeded` because their Services expose only 80 and 8623, not the 8690 tunnel port. Each node serves every app itself, so this does not block traffic. Not fixed.
- A token's Host IP and Server URL form fields do not end up in the token; only Cluster ID and type do.

## Step 14: demo doors and the privilege-gateway-client-LAB keys (`step14_pgc_doors_keys.py`, `step14_verify.py`)
Doors `demo-all-tools`, `demo-some-tools`, `demo-blocked` (clones of `a2a-mcp-tools`, auth none; blocked has no policy) with permit policies issued to `demoAdmin`, `demouser`, `aidemo`, then agent keys `pgc-all-tools`, `pgc-some-tools` (each with a key-bound grant), `pgc-blocked` (no grant) and `pgc-agent-llm` (scope llm, anthropic, model `claude-sonnet-4-5`, real key from `provider-keys.pingid.env`). The old make-demo-doors / make-pgc-keys scripts cloned objects that only existed on `pingid` (`NiagaraRiver-*`, `hitl-video`); the new script clones from objects the export replay creates (`a2a-mcp-tools`, `MainAgentA2aMcpTools`, `agg-guest`, `anthropic`). Dry run by default; `--apply` writes the objects, backs up the lab `.env`, replaces only the three `PGC_GW_KEY_*` lines and writes `PGC_LLM_VIRTUAL_KEY` to `~/.config/demo-kit/pgc-hosted.env`. Key values are never printed.
Verified 2026-11-23 through the gateway: all-tools 18 tools, some-tools exactly the 7, blocked refused 403 on `demo-blocked`, bad key 401, LLM key HTTP 200. A key acts for its custodian: the blocked key on `demo-all-tools` sees all tools because the door's permit policy is issued to `aidemo`. Test a key against its own door.

## Step 15: repoint AI-DEMO2 and the labs (`step15_repoint.py`, `step15_verify.py`)
`step15_repoint.py` rewrites env files (`AI-DEMO2/demo_api_server/.env`, `~/Development/.env`, `standalone/*/.env`): old tenant and environment ids become the new one, the old PingOne Privilege OIDC client id and its secret become the new app's, and agent-key variables get the same-named key's value on the new tenant. Keys are matched by hash against old exports, or by name where the variable name says which key it holds (`*_GW_KEY_LAB_AGENT` = `lab-agent`, `*_AGG_GUEST` = `agg-guest`, `*_AGG_DELEGATE` = `agg-delegate`, `MAIN_AGENT_KEY` and `*_MAIN_AGENT` = `main-agent`, `WORKER_AGENT_KEY` = `worker-agent`, `PRIVILEGE_LLM_VIRTUAL_KEY_OPENROUTER` = `ollama`). Dry run by default, `--apply` writes with a mode-preserving backup in `~/.config/demo-kit/backups/repoint-<ts>/`. Nothing is printed except variable names. `HMLAB_PINGONE_ENV_ID` is deliberately kept: the hitl lab pushes PingID through the old `pingid` environment, which the new one lacks.
Done 2026-11-23: 31 values in 9 files. Learned: keys imported from an export can arrive **revoked** (`agg-guest`, `agg-delegate`: 401 until un-revoked with `PUT .../agentaccesskeys/default/<name>` and `Revoked: false`; the virtual key does not change); `lab-agent` did not exist in any export (created on `pingid` by hand), so it was recreated from `audit-test` (anthropic, scopes llm/mcp/a2a, expiry 2027-02-20) and has no grants yet; `main-agent`'s grant on `a2a-mcp-tools` has an empty tool list, so a 403 there is correct.
Not mapped (no matching key on the new tenant): `PRIVILEGE_LLM_VIRTUAL_KEY_GOOGLE` (the google key is refused: invalid provider key), `PRIVILEGE_LLM_VIRTUAL_KEY_CUSTOM`, `HOSTED_LLM_VIRTUAL_KEY`, `PRIV_LOG_AGENT_KEY`, `HMLAB_REAL_AGENT_KEY` (HITL door and key were built on `pingid` after the export). Running containers keep their old values until restarted.

## Step 16: restart what reads the repointed env (`step16_restart_labs.py`)
A container keeps its old environment until it is recreated. `docker compose up -d` (the tile's start command, without its trailing `open`) recreates a service whose `env_file` values changed, without stopping other demos. Do not use the tile's Stop then Start when the shelf is at its running limit: the Start then stops the oldest other demo (`control.js`, over the limit it refuses with `too-many-running`). Check per lab that the new value is inside the container by comparing SHA-256 of the container's env values with the file's, never printing them. AI-DEMO2 is its own compose project: `cd ~/Development/AI-DEMO2 && docker compose up -d demo-api-server` (env_file changes need a recreate, not a restart), then `bash scripts/preflight-demo.sh`. Done 2026-11-23: five labs and AI-DEMO2 PASS; logged in `~/Development/SHELF-START-SWEEP.md`.

## Step 13b: restore the top-level fields the replay drops (`step13b_restore_toplevel.mjs`) - REQUIRED after step 13
`PINGID-MIGRATION/lib.mjs` `toCreateBody` carries only `ObjectMeta` and `Spec`. The exported objects also have top-level fields that change behaviour, and step 13 therefore created them without these:
- **grants (`pacpolicys`)**: `IssuedTo`, `NotBefore`, `NotAfter`, `GivenName`, `Type`, `ReqType`. Without `IssuedTo` and the validity window a key-bound grant denies (symptom: `access denied for <door>`, HTTP 200 with a JSON-RPC error, however long you wait).
- **AI policies (`aipolicys`)**: `State`. Without `Active` the gateway only shadows the policy and the gate is inert ("has no active policy").
- **tag policies (`tagpolicys`)**: `RegExPattern`, `KindMap`, `Tags`, `FixedPatterns`, `PolicyOrigin`; without them a tag policy tags nothing.
Run `node step13b_restore_toplevel.mjs` (dry run) then `--apply`: it reads the live objects, merges the exported values (users and tenant rewritten like step 13) and PUTs the whole object to `/<kind>/default/<name>`. Grants whose `NotAfter` is already past are renewed by 90 days. Result 2026-11-23: 22 grants, 14 AI policies, 18 tag policies, plus the three `lab-agent` grants from step 17 (their template was a grant already missing `IssuedTo`). Afterwards both gateways logged `compiled 8 policies`, `main-agent` went from 403 to 18 tools on `a2a-mcp-tools`, and `lab-agent` lists 35 / 2 / 0 tools on `aggregate` / `aggregate-limited` / `aggregate-none`. The dry run keeps reporting the two renewed grants, because the 90-day renewal is recomputed on every run; that is not a real difference.
Check after any replay: a key-bound grant needs top-level `IssuedTo` and `NotBefore`/`NotAfter`; an AI policy needs `State`. Test the doors with `step14_verify.py`, `step15_verify.py` and `step17_verify.py`.

## Step 17: `lab-agent` key and grants
`lab-agent` was a hand-made key on the old `pingid` tenant (no export has it). Recreated from `audit-test` (anthropic, scopes llm/mcp/a2a, expiry 2027-02-20). The labs (`aggregate-entitlement`, `agent-audit-trail`, `pf-array-claims`, `ai-policies`, `privilege-demo`, `mcp-tools`) call the doors in their `*_GW_APPS`: `aggregate`, `aggregate-limited`, `aggregate-none`. The doors carry their own tool filters (all / 4 tools / none), so `step17_lab_agent_grants.py` creates one key-bound grant per door with tools `.*`, and step 13b gives them `IssuedTo` (the key's custodian) and the validity window. `aggregate-limited` returns only the banking tools (2), not the opensearch ones; not investigated.

## Step 18: the last key variables (`step18_priv_log_key.py`, mapping in `step15_repoint.py`)
- `PRIVILEGE_LLM_VIRTUAL_KEY_CUSTOM` (AI-DEMO2) and `HOSTED_LLM_VIRTUAL_KEY` (mcp-demo-client-privilege-LAB) both use the `/llm/custom/v1/chat/completions` lane, so both map to the `llama.cpp` key (provider custom, upstream `https://ai-demo.ping-devops.com/llm-gw`). Verified: HTTP 200 with model `gpt-oss-20b`; model `llama.cpp` returns 402 "no configured price" (add a rate for the model under the key's settings, or use `gpt-oss-20b`); the hosted lab's default model `llama3.2:1b` is not in the key's allowed models.
- `PRIV_LOG_AGENT_KEY` (privilege-logging-LAB, door `hostile-mcp`): no export has a key for that door, so `priv-log-agent` was created (cloned from the working `pgc-all-tools` key and grant; custodian aidemo, scope mcp, expiry 2027-02-20, key-bound grant `.*` on `hostile-mcp`). Verified: initialize 200, bad key 401.
- Still unmapped: `PRIVILEGE_LLM_VIRTUAL_KEY_GOOGLE` (needs a valid `GOOGLE_API_KEY` in `provider-keys.pingid.env`; the current value fails the format check; fill it from Bitwarden with `fill-provider-keys.py` after `export BW_SESSION=...`, then re-run step 13 `--kinds agentaccesskeys` and step 15) and `HMLAB_REAL_AGENT_KEY` (needs the HITL door and a PingID push; stays on the old `pingid` environment, see NOT MIGRATED: PingID).
- Two traps: the shelf's own POST endpoints (`/api/demos/<id>/stop`) require the header `Origin: http://127.0.0.1:4400`; and step16 started a lab that was down (it only restarts running labs; check status first). A lab compose that takes its key from the shared settings file at start does not show it in the container environment, so the env-hash check does not apply to it.

## Redis password rotation without downtime (`step19_redis_phaseA.py`, `step19_roll.sh`) - done 2026-11-23
Setup: Deployment `privilege-redis` (`ping-devops-cmuir`, AOF on a volume, password from secret `privilege-redis/password` via `--requirepass`); URL secret `privilege-redis-url` (key `url`, `redis://:<password>@privilege-redis.ping-devops-cmuir.svc.cluster.local:6379/0`) in BOTH namespaces; read at start by every gateway deployment (pods do not restart on a Secret change). Not Helm-managed.
Method (nothing ever fails to authenticate): (A) generate the new password (kept mode 600 in `~/.config/demo-kit/redis-rotation-<date>/`), back up the three secrets, `ACL SETUSER default >NEW` so Redis accepts BOTH passwords, prove both with `PING`, patch the three secrets with `kubectl patch --patch-file` (never `kubectl apply`: it stores the value in the `last-applied` annotation); (B) restart each consumer and check its env holds the new password and its log has no `WRONGPASS`/`NOAUTH`: first the gateways that take no pool traffic, then pool members ONE AT A TIME, promoting each in HAProxy (`set server gateways/<name> health up`) before touching the next; (C) confirm every Redis client address belongs to one of our pods, then `ACL SETUSER default <OLD`, and prove the old password is rejected, the new one works, the key count is intact, exactly one password hash remains, AOF is healthy and every door still answers. Redis itself is not restarted: its Deployment reads the (already new) secret on its next start, so the running and configured passwords agree.
Gotchas: feed passwords to `kubectl exec -i ... sh -c` through stdin and use `read -r A; read -r B` (two `sed -n` calls on one stream give an empty second value and a silent NOAUTH); a single Redis user can hold several passwords, which is what makes this safe; rotate the parked gateways' URL secret too (they share it); keys written by gateways (OAuth token store, baselines) survive.

## Step 20: HITL test case (`step20_hitl_door.py`, `step20_hitl_test.py`) - stage 1 verified 2026-11-24
Makes the replayed door `opensearch-hitl2` hold `SearchIndexTool` for a human: hold policy State Active, key `lab-opensearch-hitl-key` with a key-bound grant, approver group `f3defcdb-...`. The test (`step20_hitl_test.py`) raises the hold, waits for an approver to act in the console (HITL Requests, sign in as `demouser`), then retries with `X-Procyon-Approval-Id`. Full spec, criteria and lessons (`@approvers` is a group id; the Awaiting tab is empty once the 300 s window passes; a human custodian is `UserRef` only): `HITL-TEST-CASE.md`. PingID step-up (stage 2) is not done.

## Next steps (to be written as they are done)
7. Replay the 2026-11-17 Privilege export with id rewrites.
8. Re-enrol the mcpgw gateways in place (cluster: only after the owner's go).

## NOT MIGRATED: PingID (open item, recorded 2026-11-23)
The new environment `Pingid-privilege` (`ea040334-d50b-4ded-8d98-4d5cd14dbd4d`) was created **without the PingID service** and without the `Multi_Factor` sign-on policy. The console's "Add Capability" step asks for a PingID admin login (Use Existing) or a new PingID account, which an agent cannot type, so it was skipped on purpose; this was only a side remark until now. Consequences:
- **No PingID push for HITL approvals on the new tenant.** The hitl-mfa-lab's real push still goes through the old `pingid` environment (`4cb38c18`), where `demouser`'s iPhone is paired (`PINGID_MOBILE`); `HMLAB_PINGONE_ENV_ID` is kept pointed there on purpose. Tenant MFA in the new Privilege tenant is OFF (`EnableMFA: false`).
- **Copied users have no MFA devices** (devices are not copied); the new env's admin-console sign-in also forces MFA registration, which only works for the Administrators-environment logins until PingID or PingOne MFA is set up.
- The PingID apps (`PingID Desktop`, `PingID Desktop Gen2`, `PingID Mobile`) and the old env's `Multi_Factor` policy do not exist in the new environment.
To finish it (owner decision, needs a person): in the console, Pingid-privilege -> add the PingID capability with a PingID admin login (or create a PingID account); then pair `demouser`'s phone; then `step05_signon_policies.py --only Multi_Factor` and test one HITL push **before** turning tenant MFA on (see "Lockout rules"). A PingID account (deployment `35200c13-a439-42bc-87cf-b06a0af4ea20`) is attached to the old `pingid` environment: do not try to re-attach it to the new one by API without deciding what happens to the old environment's paired devices.

## Move to `5bfb4e12` (2026-11-24): what was done and what it taught
`5bfb4e12-8d71-4b81-8ef8-940b91728c05` ("Pingid_Privillege", SANDBOX, NA) was made by the owner in the console in one wizard, which is the only way to get a PingID deployment (the API accepts `PING_ONE_ID` but provisions no deployment). The earlier plan to attach the old PingID account to `ea040334` ("Use Existing") was dropped for this.
Done by API with the environment's own worker (read-backs saved under `~/.config/demo-kit/backups/move-5bfb4e12-2026-11-24/`):
- Privilege mode flipped agentless to agent (`PUT billOfMaterials`, only the `PING_ONE_PAM` tag changed).
- Group `PrivilegeAdmins` created and all 19 users added (old members matched by **email**, not username: `aidemo` is `cmuir+aidemo@pingone.com`, `jordan.ellis` is `cmuir+jordan@pingone.com`, `demoUser-new` is `cmuir+4@pingidentity.com`).
- Privilege app `accessControl` set to that group (whole-object PUT). Without it the console says "This user does not have access ... designated group".
- Agent onboarded with a link made inside the new tenant (private window), then `POST /setpreftenant`.

Lessons:
- **Onboarding adds a tenant, it does not select it.** Until `PrefTenant` is set the agent falls back to an old onboarded tenant that demands MFA and shows `mfa-required` although the new tenant has MFA off. Fix: `POST /setpreftenant {"Tenant":"<id>"}`; the agent goes disabled, enabled, connected in about 10 s.
- **Restarting the agent daemon (`launchctl kickstart -k system/com.procyon.ai`) clears `PrefTenant`.** Set it again straight after, or the fallback tenant's MFA error ("Error initiating Ping MFA ... failed after 2 attempts", a Privilege-side failure) returns.
- **`connected` is not enough for the local console.** `AgentState connected` with controller and proxy READY can still leave `https://local.procyon.ai:8643` accepting TCP but never answering the TLS hello (seen after a tenant switch and a daemon restart; a disable/enable cycle did not clear it). Check the console, not just `/status`, before running a script.
- **Switching the agent back to the previous tenant is not safe.** After the move, switching to `ea040334` gave `mfa-required`, so a live export of the old tenant is not available once the agent has left it. Export first, then move.
- A worker made by a person inherits all that person's roles (here 180, read-only, across 60 environments). It cannot trim itself ("May not change role assignments for self"); another principal must, or a fresh worker made by the setup script (PR #579) is trimmed to two roles.
- A role-assignment API listing can show one row per environment; count by scope id before concluding "duplicates".
- PingID itself was not paired on this environment; tenant MFA stays off until stage 2 of the HITL test case.

Replay into `5bfb4e12` (2026-11-24), in this order, each read back from the tenant: step 13 (10 identities, 31 apps, 24 permits, 15 AI policies, 18 tag policies, 9 shadow-AI policies; run `--kinds applications --apply` a second time for the 4 aggregate apps), 13b (54 objects), 13 `--kinds agentaccesskeys --keys` (22 keys; un-revoke `agg-guest` and `agg-delegate` with a whole-key PUT; `google` is refused until a valid `GOOGLE_API_KEY` is filled), 14 (doors `lab-banking-full|limited|blocked`, permits, keys `lab-banking-<variant>-key` and grants, `pgc-agent-llm`), 17a (`lab-agent`, cloned from `audit-test`; no export has it), 17 (three grants), 18 (`priv-log-agent`). Totals afterwards: 34 apps, 32 policies, 28 keys.
- Users are matched to the new tenant by `EmailID` (then two confirmed aliases) in `map-users.mjs`, because `buildMaps` compares usernames and they differ after the move (12 of 12 map).
- `step14` no longer touches the lab `.env` or `pgc-hosted.env` unless `--write-env` is passed: those writes repoint the lab, and must wait until the gateways serve this tenant (step 15).
- A key whose custodian is a person has `UserRef` only; a template key's `CustodianRef` (NonHumanIdentity) must be cleared or the POST is a 400.
- **The local console listener wedges under a burst of calls** (after a few hundred in a row it stopped accepting for about 30 s, then recovered). Run replay steps one at a time and retry a failed read once.
- 13b renews an already-past `NotAfter` by 90 days on every run, so it always reports two updates; the `lab-agent-*` grants end 2026-12-08 and need a longer window set by hand before then.
- Not done on `5bfb4e12`: `apply-tag-schema.mjs` (needs the tenant API key; `orphan 0` unchecked), the cluster cutover (gateways still enrolled to `ea040334`), `step15` repointing, the HITL door (`step20`), the secrets that must be re-entered by hand.

## Lockout rules (learned the hard way)
- **Keep Privilege tenant MFA (`EnableMFA`) off** until a full agent Disconnect/Connect with MFA on has been proven. The console and its API only exist while the agent is connected. If the agent's MFA fails, nothing can turn MFA off again except the Privilege team.
- Never use an onboarding link from another tenant on the demo Mac: it re-binds the device (2026-11-23 04:25 moved it to the old tenants).
- After any change to the Privilege app, its groups or the product mode, re-read `accessControl`.
