# Privilege environment rebuild spec ("Pingid-privilege")

> **History (2026-11-24):** this spec built `ea040334` ("Pingid-privilege") on 2026-11-23. Privilege moved on 2026-11-24 to `5bfb4e12-8d71-4b81-8ef8-940b91728c05` ("Pingid_Privillege"); the move follows `~/Development/HANDOFF-2026-11-24-privilege-move-to-5bfb4e12.md` and `HANDOFF-2026-11-24-finish-move-to-5bfb4e12.md`. Its acceptance criteria are the template; the ids are not current.

**Status:** in progress (steps 1–4 built and read back; criterion 2 partly: worker inherited org-wide roles; criterion 4 awaits owner confirmation)   **Owner:** Curtis (decides every step marked GO)   **Written:** 2026-11-23

## Goal
Replace the locked-out `pingid` setup (PingOne env `4cb38c18`, Privilege tenant of the same id) with a new PingOne environment **Pingid-privilege** that we fully control through the API: users, groups, roles, apps, the Privilege tenant and its MFA switch. Then re-pair this Mac's desktop agent to it and point the mcpgw gateways at it. The rebuild is scripted and written up (setup guide + skill) so it can be repeated.

## Why now (evidence, 2026-11-23)
- The desktop agent is stuck in `mfa-required`. Privilege's server fails to start MFA ("Error initiating Ping MFA: failed after 2 attempts", HTTP 500). The console, and therefore the API that could turn `EnableMFA` off, only exists while the agent is connected.
- A 04:25 onboarding moved the agent to the old `cmuir+agent` tenants (0428ba4f and three others), which also demand MFA.
- The owner cannot see users in `pingid` in the admin console. Through the API, the `pingid` worker still reads all 83 users.

## Acceptance criteria (each one a runnable check)
1. `GET /environments?filter=name eq "Pingid-privilege"` returns one environment. Its bill of materials holds the agreed products, with `PING_ONE_PAM` tagged `AUTHENTICATION_MODE_AGENT`.
2. A worker app in the new environment holds Identity Data Admin and Environment Admin there, and nothing it inherited elsewhere. Its credentials are in `~/.config/demo-kit/pingid-privilege-env.env` (mode 600, never printed).
3. Users and groups exist: `demouser`, `demoAdmin` and the owner's admin accounts, plus group `PrivilegeAdmins`. A user count and a list of group members prove it.
4. The owner's console admin account can open Users in the new environment, confirmed by the owner, with a screenshot if possible.
5. The PingOne Privilege app has `accessControl` restricted to `PrivilegeAdmins` (`privilege-access-check`-style read returns the group).
6. The Privilege tenant's `EnableMFA` is **false** after setup, and is read back from `tenantprofiles`.
7. The desktop agent shows `AgentState: connected` with `OnboardedTenants` = {new env id} in `/Library/Logs/Procyon/procyon-agent.log`, and it survives one Disconnect/Connect cycle and one sleep.
8. Each re-pointed gateway: the pod is Running, its log shows the new tenant id, and one door returns 401 without a token and 200 with a valid key.
9. `SETUP-Privilege-gateway-GUIDE.md` plus a `privilege-env-rebuild` skill exist, and a dry read of the guide reaches step 8 without missing commands.

## Unhappy paths (each needs a check)
- **API can't add `PING_ONE_PAM` or `PING_ONE_ID`** (licence/deployment): stop and report; the owner adds it in the console. No retries that create duplicate environments (check by name first, so re-runs are idempotent).
- **The new Privilege tenant never appears / no console:** documented fallback is the cloud route (console.pingone.com → Privilege tile as `demouser`). Wait 15–20 min before retrying (11-20 lesson).
- **MFA lockout again:** `EnableMFA` stays off. Turning it on is a separate, owner-approved step that first proves a full agent reconnect with MFA on, with a break-glass plan written down.
- **Partial PUT drops fields** (`accessControl` lesson): every PingOne/Privilege write is GET → back up → change one field → PUT the whole object.
- **Gateway enrolment token:** the owner pastes it into a 600 file, never into chat. Tokens expire within hours; keep only the newest.
- **Cluster gateways are shared:** nothing on the cluster changes without GO. The old releases stay until the new tenant serves a 200.

## Key step: privilege-gateway-client-LAB keys (request from cmuir-c6 via ai-demo-standalone-0a, 2026-11-23)
Runs AFTER the gateways are enrolled to the new tenant and the doors exist. This rebuild is the single writer of agent keys on `ea040334`.
- Spec source: `~/Development/HANDOFF-2026-11-21-scripts/make-pgc-keys.py` (pins old tenant `4cb38c18` and the `aidemo` user ref; both need the new tenant's values) and `make-demo-doors.py` for the doors `demo-all-tools`, `demo-some-tools`, `demo-blocked`.
- Four keys, custodian `aidemo`, expiry 2027-02-20, CTags `purpose=privilege-gateway-client-lab`: `pgc-all-tools` (scope mcp, grant `pgc-all-tools-grant` on `demo-all-tools`, tools `.*`); `pgc-some-tools` (scope mcp, grant `pgc-some-tools-grant` on `demo-some-tools`, 7 tools: list_entitlements, who_has_role, get_access_grants, get_portfolio_summary, get_investment_accounts, get_investment_balance, get_investment_transactions); `pgc-blocked` (scope mcp, NO grant, must be refused at discovery); `pgc-agent-llm` (scope llm only, provider anthropic, allowed model `claude-sonnet-4-5` per owner, upstream key and limits copied from the existing llm key).
- Values never printed. Written to `privilege-gateway-client-LAB/.env` (only `PGC_GW_KEY_DEMO_ALL_TOOLS`, `PGC_GW_KEY_DEMO_SOME_TOOLS`, `PGC_GW_KEY_DEMO_BLOCKED`, backup first, all other lines kept) and `~/.config/demo-kit/pgc-hosted.env` (`PGC_LLM_VIRTUAL_KEY`, append). `PGC_GW_URL` updated if the host changes.
- Check per key: door call 200 (all-tools), 200 for the 7 tools only (some-tools), refused at discovery (blocked), llm bearer call answers (agent-llm).
- Notify cmuir-c6 when done.

## Not done (known gap)
PingID was not added to the new environment (needs a PingID admin login; owner decision). See SETUP-Privilege-gateway-GUIDE.md, "NOT MIGRATED: PingID".

## Out of scope
Deleting `pingid` (4cb38c18) or the old tenant 0428ba4f (owner's decision, irreversible). Fixing Privilege's MFA 500 (Privilege team). Changing OAuth scopes in AI-DEMO2.

## Protected / must not break
AI-DEMO2's own env `01d89b06` and its apps. The Meridian A2A lab gateway `ai-demo-ping-mcpgw`. Other people's namespaces on the SE cluster. Feature flags stay default off.

## Decisions (owner, 2026-11-23)
- **D1 products:** copy `pingid`'s list: Base, Risk, DaVinci, Privilege (`AUTHENTICATION_MODE_AGENT`), Authorize, PingID.
- **D2 config:** replay the 2026-11-17 export (`~/.config/demo-kit/privilege-export-0428ba4f-2026-11-17`, `privilege-pingid-state-2026-11-17`) with id rewrites per `PINGID-PRIVILEGE-MIGRATION-PLAN.md`. Work done on `pingid` after 11-17 (HITL door, kill-switch, SPIFFE, OBO, Salesforce) is rebuilt afterwards from its handoff docs.
- **D3 gateways:** re-enrol the existing releases in place (same hostnames). Cluster changes still wait for GO.

## Verification plan
API read-backs after each step (scripts print ids and status only). Agent log check for criterion 7. Live door calls for criterion 8. Cluster changes only after the owner's GO in this conversation.
