# HITL test case: hold a tool call for human approval (door `opensearch-hitl2`)

**Status:** stage 1 verified 2026-11-24 on `ea040334` (no PingID); re-run it on `5bfb4e12` after the move. Stage 2 (PingID step-up) not started.   **Owner:** Curtis

## Goal
A repeatable check that Privilege holds a tool call for a human, and that the call goes through only after an approver acts, on the Privilege tenant (`5bfb4e12-8d71-4b81-8ef8-940b91728c05` from 2026-11-24; stage 1 first ran on `ea040334`).

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

## Stage 2 (not done)
PingID step-up needs the PingID capability on `Pingid-privilege` and a paired phone, then tenant `EnableMFA` on, tested before anything else depends on it (see "Lockout rules"). Today approval is a console click (`channel chat`).

## Not covered
Human (user-token) calls to this door: `demouser` is still denied on the `lab-banking-*` doors ("no policy grants this principal access"). This test uses the key path only.
