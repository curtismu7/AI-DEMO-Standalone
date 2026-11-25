# HITL MFA lab on Privilege tenant 5bfb4e12: stage 1 (the hold, no PingID) spec

**Status:** verified 2026-11-25 (criteria 1-5; criterion 6 is owner-run)   **Owner:** Curtis

## Goal
hitl-mfa-LAB's Real mode called the door `pingid-hitl` on the retired `pingid` tenant (4cb38c18), which no longer serves through the gateways. Give it a door on `5bfb4e12` that holds its real tool `transfer_funds` for one human approval, so Real mode works again. PingID-confirmed approval (tenant MFA) is stage 2, separate.

## What gets built (names per AI-DEMO2 `privilege/NAMING-CONVENTION.md`: system `hitl`, variant `mfa`, a feature word like `lab-obo-pf`)
- Door `lab-hitl-mfa`: clone of `lab-banking-full` (banking MCP upstream `mcpdemo`, AuthMode none, mesh `ai-demo-cmuir`), FrontEndName renamed.
- Permit `lab-hitl-mfa-permit`: clone of `lab-banking-full-permit` (all tools, same 3 users), bound to the new door.
- Hold `lab-hitl-mfa-hold`: clone of `opensearch-hitl2-hold` with `resource == Tool::"transfer_funds"`, `context.app == "lab-hitl-mfa"`, same approver group, one approval, grant for one transaction, retry window 120 s, request open 300 s, State Active.
- Key `lab-hitl-mfa-key` (scope mcp, custodian `aidemo` as UserRef, expiry 2027-02-20) and key-bound grant `lab-hitl-mfa-key-grant` (tools = the permit's tools).
- hitl-mfa-LAB `.env`: `HMLAB_REAL_URL=https://mcpgw.ai-demo.ping-devops.com/lab-hitl-mfa/mcp`, `HMLAB_REAL_AGENT_KEY` = the new key, `HMLAB_REAL_TOOL=transfer_funds` (unchanged). Backup first; the key is never printed.

## Acceptance criteria
1. Script dry run lists exactly the five objects to create; `--apply` creates them; read-back shows the hold `Active`, the key present and not revoked, the grant issued to the custodian.
2. Through the gateway with the new key: `tools/list` on `lab-hitl-mfa` returns the banking tools, including `transfer_funds` (HTTP 200).
3. A tool that is not held (a read tool from the list) returns 200 on `tools/call`.
4. `transfer_funds` returns HTTP 403 `pending_approval` with an instruction id.
5. After the owner approves that request in the Privilege console (HITL Requests), the retry with `X-Procyon-Approval-Id` returns 200; a second retry is held again (grant for one transaction).
6. The lab's own Real check (`npm run privilege-verify`, owner-run) reports the held answer and the approved retry.

## Unhappy paths
- Re-run: idempotent (existing names are skipped, nothing duplicated).
- Bad or no key: 401 (gateway refuses before the hold).
- Approver denies or the request lapses (300 s): the retry stays refused; the test reports it and exits non-zero.
- Console slow or wedged (TLS handshake 4-26 s seen): calls use a 110 s timeout; a failed POST stops the script before the next object.
- Policy propagation to the gateway takes about 4 minutes: the test retries discovery for up to 6 minutes before failing.

## Out of scope
Stage 2 (PingID push, tenant MFA: the lockout switch, owner-only), the lab's `HMLAB_PINGONE_*` settings (still the old `pingid` env, used only by stage 2), tag-map (`apply-tag-schema.mjs`) beyond reporting `orphan` count.

## Protected / must not break
The template objects (`lab-banking-full`, its permit, `opensearch-hitl2-hold`) are read only. No tenant setting changes. The desktop agent is not touched.

## Verification plan
Criteria 1-5 by `step21_hitl_mfa_door.py` and `step21_hitl_mfa_test.py` (the owner approves once in the console when asked). Criterion 6 by the owner. NAMING-CONVENTION change log updated in an AI-DEMO2 PR; this spec and the scripts in an AI-DEMO-Standalone PR; `/code-review` on the script diff before merge.

## Evidence (2026-11-25)
1. `step21_hitl_mfa_door.py` dry run listed the five objects; `--apply`: POST 200 x5; read-back door/permit present, hold `Active`, key present, not revoked, grant IssuedTo 1. Lab `.env` updated (backup `~/.config/demo-kit/backups/hitl-mfa-20261125-092438/`).
2. `step21_hitl_mfa_test.py`: `tools/list` 19 tools, `transfer_funds` listed.
3. CONTROL `list_entitlements`: 200.
4. HELD `transfer_funds`: 403 `pending_approval`, instruction `ins_c7e0…`.
5. Approved by the owner in the console after 9 s; retry with `X-Procyon-Approval-Id`: 200; second call without the id: 403. ALL PASS.
- hitl-mfa-LAB restarted (shelf start command): health OK; `GET /api/privilege/real` reports `ok: true`, url `/lab-hitl-mfa/mcp`, tool `transfer_funds`.
6. Owner: `npm run privilege-verify` in hitl-mfa-LAB (owner-run Real check).
