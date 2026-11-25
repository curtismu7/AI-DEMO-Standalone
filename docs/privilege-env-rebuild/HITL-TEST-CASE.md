# HITL test case: hold a tool call for human approval (door `opensearch-hitl2`)

**Status:** stage 1 verified 2026-11-24 on `ea040334` (retired) and **2026-11-25 on `5bfb4e12`** (full chain: hold 403 → console approval by `HitlApprovers` within 10 s → retry with `X-Procyon-Approval-Id` 200 → second call without the id 403, transaction-only grant confirmed). Stage 2 (PingID step-up): runbook written 2026-11-25 (below), not executed — needs the owner at the console.   **Owner:** Curtis

## Goal
A repeatable check that Privilege holds a tool call for a human, and that the call goes through only after an approver acts, on the current Privilege tenant `5bfb4e12-8d71-4b81-8ef8-940b91728c05` ("Pingid_Privillege"). (History: stage 1 first ran on `ea040334`, retired.)

## Setup (`scripts/step20_hitl_door.py`, dry run by default, `--apply` writes, idempotent)
- Door `opensearch-hitl2` (existing, auth `user-token`, upstream `opensearch-mcp-server` on mesh cluster `ai-demo-cmuir`).
- Hold policy `opensearch-hitl2-hold`: `forbid mcp:InvokeUnattended` on `SearchIndexTool`, one approval, grant for one transaction, retry window 120 s, request open 300 s. **State must be Active** (blank = the gateway only shadows it).
- Agent key `lab-opensearch-hitl-key` (scope mcp, custodian `aidemo`, a human custodian is `UserRef` only, `CustodianRef` must be empty) and key-bound grant `lab-opensearch-hitl-key-grant` (tools = the door permit's 9). Key value goes to `~/.config/demo-kit/hitl-opensearch.env` (mode 600), never printed.
- **`@approvers` takes a GROUP id, not a user id** (the approval object records `RefKind: Group`). The group `f3defcdb-...` (PingOne Privilege administrators and HITL approvers) holds `demouser`, `cmuir@pingidentity.com` and the other admins. A user id there matches nobody and the request is invisible to everyone.

## Acceptance criteria (`scripts/step20_hitl_test.py`, needs a person to approve)
1. `ListIndexTool` (not held) returns 200.
2. `SearchIndexTool` returns 403 with `status: pending_approval`, `policy_ids: opensearch-hitl2-hold:1` and an `instruction_id`.
3. The request shows under **HITL Requests > Awaiting A Decision** for an approver (sign in as `demouser`); approving it sets the approval object to `Approved`, `approvedBy` 1.
4. Retry with header `X-Procyon-Approval-Id: <instruction_id>` returns 200.
5. A second call without the id returns 403 (a transaction grant is spent).

## Unhappy paths
- Nobody acts within 300 s: the object becomes `Expired` ("no approver acted before ...") and the retry returns 403. Expired requests are listed on the **All** and **Expired** tabs, never on Awaiting.
- The gateway reuses an open request for an identical call (same field hash), so after changing approvers wait for the old request to expire before testing.
- Retrying without an approval raises a new pending request.
- Not yet tested: deny, two approvers, the approver being the requester.

## Evidence (2026-11-24)
Request `ins_48f86147...`: control 200; held 403 pending_approval; approved by `demouser` (channel chat) 37 s after the hold; retry 200; second call 403. Earlier requests expired unanswered (7 listed Expired, 0/1).

## Stage 2 (runbook, written 2026-11-25; not executed)

Good news versus the old `ea040334` plan: `5bfb4e12` already has the PingID capability, a deployment, the `Multi_Factor` + `Single_Factor` policies, `PrivilegeAdmins` as the app's `accessControl` group, and `demouser` has a paired, ACTIVE `PINGID_MOBILE` device (iPhone) plus Touch ID. The `Single_Factor` policy exists as the rollback target.

Steps, in order (the owner does every agent-control and console step; the guard hook blocks agent control from agents):

1. **Read back the current state** before touching anything: tenant `EnableMFA` (it has flipped unexpectedly before — trust only a fresh read), the app's `accessControl` group (still `PrivilegeAdmins`), and that `Single_Factor` exists and is NOT attached to the Privilege app.
2. **Write down the rollback** before enabling anything: tenant `EnableMFA` -> `false` is the rollback (the desktop agent's console API answers only while the agent is connected — if the agent's MFA fails after enabling, ONLY the Privilege team can recover, which is why step 3 comes first). Note the exact API shape used to read it so the disable is a one-field change.
3. **Prove an agent Disconnect/Connect with MFA ON before enabling tenant MFA**: enable MFA on the *agent's* console identity path (or the app restriction), Disconnect the desktop agent (owner runs the control call), Connect again, complete the PingID push on `demouser`'s phone, and confirm the console answers (`curl -sk https://local.procyon.ai:8643/ui/` -> 302/200) and the tenant is reachable. If the agent cannot reconnect, roll back immediately (MFA off on that path) and stop.
4. **One HITL push with MFA on, before tenant MFA**: run `step20_hitl_test.py`, approve as `demouser` — the approval should now arrive through a PingID push (or the console, if the hold policy's channel is unchanged); record which.
5. **Tenant `EnableMFA` on, last.** Immediately after: re-read it, prove the agent still answers, run `step20_hitl_test.py` once more, and sign in to the console as `demouser` (multi-factor path). Then write the result here.
6. If anything fails at any step: MFA off, re-read, verify the agent answers, and record what failed in this file.

Today stage 1 approval is a console click (`channel chat`); a push-based approval needs step 4 to prove the channel.

## Not covered
Human (user-token) calls to this door: `demouser` is still denied on the `lab-banking-*` doors ("no policy grants this principal access"). This test uses the key path only.
