# Privilege SIEM through Cribl to Elasticsearch: test report

**Date:** 2026-11-24 · **Environment:** SE cluster `us`, namespace `ping-devops-curtismuir` · **Status:** live for the SIEM feed; gateway sidecar path built, not deployed
**Code:** `shared/cribl-siem` in AI-DEMO-Standalone (PRs #561, #568) and the `agentless-mcpgw` chart option in AI-DEMO2 (PR #3696) · **Spec:** `docs/specs/2026-11-24-cribl-gateway-events.md`

## 1. Summary

- Privilege's SIEM setting (Provider: Elastic) now sends to **Cribl Stream** instead of straight to Elasticsearch. Cribl masks secrets, adds searchable fields, and writes to the same index, `ping-siem-events-v2`.
- Both sign-in options in the Privilege form work: **Username and password** and **API key**.
- It passed a 53-check local test and live checks. 66 real Privilege events have gone through so far, with **0 secrets found** in a scan of all of them.
- Privilege's own feed already carries the gateway runtime logs (policy decisions, guardrail verdicts, accepted requests), including **user, agent key, policy ids and decision**. Cribl promotes those to top-level `gw_*` fields.
- Not done yet: a sidecar on a real gateway (the script was tested live with a simulated log source), and masking of prompt text, because no prompt field has appeared yet (see section 4).

```text
Privilege cloud --HTTPS (Basic or ApiKey)--> nginx (checks the credential) --> Cribl (mask, add gw_* fields) --> Elasticsearch ping-siem-events-v2
                                              |                                                                  
Gateway log-tailer sidecar --POST /_doc (own login)--> nginx --> Cribl --> Elasticsearch gateway-events   (built, not deployed on any gateway)
```

## 2. What we tested and the results

| # | What | How | Result |
|---|---|---|---|
| 1 | Privilege can reach Cribl | Console health check against the Cribl URL | **Passed** (after fixing the credentials) |
| 2 | Privilege can save the setting | Console Save | **Passed.** The first two Saves returned HTTP 500 from Privilege's own API; the successful one was a `PUT` to the existing config |
| 3 | What Privilege actually sends | Ingress and Cribl logs | `GET /`, `HEAD /audit-log`, `POST /_bulk` from the Go client `elastic/7.0.22`. Single-document `_doc` is **not** used |
| 4 | Events land in Elasticsearch | Count and read back | **Passed.** Console, guardrail, policy-decision and proxy-audit events arrive with `cribl_pipe: siem_mask` set |
| 5 | Username and password auth | Local test and live HTTPS | **Passed.** No credential, a wrong password and the wrong user are refused (401) |
| 6 | API key auth | Local test and live HTTPS | **Passed** with `Authorization: ApiKey ...`. A wrong key and a key sent as `Bearer` are refused (401). Lower-case scheme names (`apikey`, `basic`) also work |
| 7 | Secret masking | Local test, then a live scan | Passwords, `*token*`/`*apikey*`/`virtualkey` values, `sk-` keys, Bearer values and JWTs are masked, including inside `DataText` and nested `Resources`. **66 of 66** live Cribl-written events scanned: 0 possible leaks |
| 8 | Fields promoted for filtering | Local test, then a live event | **Passed.** `gw_user`, `gw_agent_key`, `gw_policy_ids`, `gw_decision`, ... added; `Data` left intact; absent keys stay absent; a live `proxy-audit-log` event showed `gw_user`, `gw_path`, `gw_method`, `gw_host`, `gw_tenant` |
| 9 | Sensitive headers | Local test; live check of 24 events | `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key`, `Proxy-Authorization` are removed if present. **None seen** in live events: Privilege strips them upstream |
| 10 | Least privilege | Live | The Elasticsearch user `cribl_siem` can write `ping-siem-events*` and `gateway-events*` only. Reading refused (403); writing any other index refused (403) |
| 11 | Cribl's own port | Second-container test; mutation test | Cribl listens on 127.0.0.1 only; nginx is the only way in. Binding it to 0.0.0.0 makes the test fail, as it should |
| 12 | Gateway sidecar path (Cribl side) | Local test and a live POST | Gateway login accepted on `POST /gateway-events/_doc` only; Privilege logins refused there; the gateway login is refused everywhere else. Event stored masked with `@timestamp` set (test document then deleted) |
| 13 | OpenSearch route | Local test, both modes | Off: nothing reaches OpenSearch. On: one copy each in Elasticsearch and OpenSearch. Off for now so events are not stored twice |
| 14 | Helm chart option | `helm template` | Off by default: output **byte-identical** to today's (567 lines). On: only the added lines differ. Generated shell passes `sh -n` |
| 15 | Real sidecar script on the live path | A short-lived pod in the namespace ran the `log-tailer` script rendered from the PR #3696 chart (real busybox), tailing a log file fed with realistic gateway lines, posting to the live Cribl service and OpenSearch | **Passed, with a simulated log source.** Cribl up: +4 events in OpenSearch in 3 s; all 7 log lines still echoed (so `kubectl logs` keeps working); the `/mcp` request, `AIPolicyDecision` and plain lines were not shipped; the same 4 reached Elasticsearch `gateway-events` via Cribl, key shortened to `sk-orion-...9999`, no `Headers`, `@timestamp` set. Cribl black-holed: OpenSearch still got all 4 (8 s, 2 s per event as designed) and nothing reached Elasticsearch. Test data deleted. **Not a real gateway:** `agentless-mcpgw3` is annotated "Leave parked" (old tenant), so it was not started. Finding: the sidecar's `sed` strips `Headers` only when another key follows it. Real lines put it in the middle (key order `Device`, `Headers`, `Host`, ...), but in the test fixture it was last, so two OpenSearch documents kept it with the key masked; Cribl removed it for the Elasticsearch copy |

**Local test:** `shared/cribl-siem/test/run-local.sh` runs Cribl and nginx against mock Elasticsearch and OpenSearch containers in OrbStack. 53 checks pass.

## 3. What is in the log (useful fields)

Privilege's SIEM feed delivers several kinds of event. The `Index` field says which:

| `Index` | Meaning | Fields worth using |
|---|---|---|
| `audit-log` | A console change | `Message` (method and object), `Status`, `User`, `Device`, `Module`, `Region`, `DataText`, `Resources` |
| `policy-decision-log` | A policy decision on an agent call | **User, agent key (`AgentKey`), `App`, `PolicyIDs`, `Decision` (allow / hitl / deny), `Reason`**, `Event`, `Stage`, `Flow`, `Target` (tool), `Method`, `Principal`, `PrincipalKind`, `RequestID`, `GrantShape`, `InstructionID`, `BaselinePhase` |
| `aiguard-log` | Guardrail verdict, rate-limit refusal, model call | `User`, `Decision`, `Event`, `Reason`, `ControlID`, `ResourceName`, `KeyType`, `Client`, compliance mappings (NIST AI RMF, OWASP, MITRE), `RequestID` |
| `proxy-audit-log` | A request the gateway accepted | `User`, `Method`, `Path`, `Host`, `Device`, `Headers`, `Tenant` |

Seen in the index in total: 1,741 `audit-log`, 677 `aiguard-log`, 362 `proxy-audit-log`, 298 `policy-decision-log`, plus older `proxy-event-log` (219) and `event-log` (4) that stop on 18-19 Nov. The runtime kinds first appear on 12 Oct (`aiguard-log`), 13 Oct (`policy-decision-log`) and 8 Nov (`proxy-audit-log`); the October write-up of this feed described console changes only.
Cribl adds top-level `gw_user`, `gw_agent_key`, `gw_app`, `gw_policy_ids`, `gw_decision`, `gw_decision_reason`, `gw_decision_event`, `gw_stage`, `gw_target`, `gw_flow`, `gw_method`, `gw_path`, `gw_host`, `gw_principal`, `gw_principal_kind`, `gw_request_id`, `gw_tenant`, `gw_control_id`, `gw_resource_name`, `gw_key_type`.

Kibana example: `gw_decision : "hitl"` finds approval-required decisions; `gw_agent_key : "<key name>"` follows one agent.

## 4. Restrictions and things to know

- **Prompt logs.** "Unencrypted prompt logs delivery to SIEM" is in production as part of the 11/20 release (owner note). In the six event kinds seen so far **no field carries prompt text**, so nothing masks it. If it is turned on for the tenant, prompt text will pass through Cribl into Elasticsearch **in clear**. Limit who can read the index, and add a masking rule once the field names are known. Cribl today masks secrets, not personal data or prompts.
- **Request shape.** Cribl's Elasticsearch source accepts only `_bulk` and takes one auth mode, and it refuses the `ApiKey` scheme. An nginx container in the same pod therefore checks Basic or ApiKey and talks to Cribl on localhost.
- **Index name.** Privilege's current form has no Index field and sends the index `audit-log`. Cribl overrides it and always writes `ping-siem-events-v2`.
- **No queue.** Cribl holds no persistent queue. If Elasticsearch is down, or the pod restarts, events in that window are lost. The pod uses a `Recreate` strategy, so each deploy leaves about a minute with no feed.
- **Still in the events:** client IPs (`X-Forwarded-For`, `X-Real-Ip`) and `Mcp-Session-Id`. Treat the index as sensitive.
- **Access.** The public endpoint needs HTTPS plus a credential. Cribl's admin UI has no public route (port-forward only). All credentials are in cluster Secrets and in Bitwarden, none in git.
- **Privilege Save.** The first Saves returned HTTP 500 with no message. The cause is not proven; the later Save used `PUT` and worked. If it returns, check whether a config already exists.
- **Known CI state.** The `gh-labs-drift` check is red on `main` and on these PRs because five other `privilege-*-lab` repos are not registered as submodules. It is unrelated to this work.

## 5. Open items

| Item | State |
|---|---|
| Merge #561, #568 (AI-DEMO-Standalone) and #3696 (AI-DEMO2) | **Done** 24 Nov, after review. CI green except the unrelated `gh-labs-drift` |
| Sidecar on a real gateway (`agentless-mcpgw3`, then `agentless-mcpgw-pingid`) | **Not done.** `mcpgw3` is annotated "Leave parked" (old tenant), so it was not started. `pingid` is one replica on `Recreate`: about 1-2 minutes of outage. Needs the owner's go-ahead. The sidecar script itself passed a live test (row 15) |
| Phase 2: sidecar posts to Cribl only; set `GW_OPENSEARCH=true` | Needs the owner's go-ahead; follows a real gateway rollout |
| Prompt text masking | Waiting for the field names once the feature is on |
| Logins saved to Bitwarden | Done by the owner |
| Persistent queue in Cribl | Not built |

## 6. Why the gateway sidecar path is on hold

Privilege's own feed already delivers the same gateway runtime logs through Cribl, so the sidecar adds little today. It stays built and un-deployed as a second route (it also carries `A2A policy denied` lines). The script has been tested live with a simulated log source, not yet on a real gateway.

## 7. How to repeat the checks

```sh
shared/cribl-siem/test/run-local.sh                         # 53 local checks (needs OrbStack)
kubectl --context us -n ping-devops-curtismuir get pods -l app=cribl-siem    # 3/3 Running
curl -s -o /dev/null -w '%{http_code}\n' https://cmuir-cribl.ping-devops.com/   # 401 without a credential
```

Then in the Privilege console: SIEM Config, Health Check, Save, change something small, and search Kibana (`ping-siem-events*`) for `cribl_pipe : "siem_mask"`.
