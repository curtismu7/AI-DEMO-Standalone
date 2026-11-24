# Privilege SIEM through Cribl to Elasticsearch: test report

**Date:** 2026-11-24 · **Environment:** SE cluster `us`, namespace `ping-devops-curtismuir` · **Status:** live for the SIEM feed; gateway sidecar path built, not deployed
**Code:** `shared/cribl-siem` in AI-DEMO-Standalone (PRs #561, #568, merged) and the `agentless-mcpgw` chart option in AI-DEMO2 (PR #3696, merged) · **Numbers as of 24 Nov 2026, 14:10 UTC** · **Spec:** `docs/specs/2026-11-24-cribl-gateway-events.md`

## 1. Summary

- Privilege's SIEM setting (Provider: Elastic) now sends to **Cribl Stream** instead of straight to Elasticsearch. Cribl masks secrets, adds searchable fields, and writes to the same index, `ping-siem-events-v2`.
- Both sign-in options in the Privilege form work: **Username and password** and **API key**.
- It passed a 53-check local test and live checks. 69 real Privilege events have gone through so far, with **0 secrets found** in a scan of all of them.
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
| 7 | Secret masking | Local test, then a live scan | Passwords, `*token*`/`*apikey*`/`virtualkey` values, `sk-` keys, Bearer values and JWTs are masked, including inside `DataText` and nested `Resources`. **69 of 69** live Cribl-written events scanned: 0 possible leaks |
| 8 | Fields promoted for filtering | Local test, then a live event | **Passed.** `gw_user`, `gw_agent_key`, `gw_policy_ids`, `gw_decision`, ... added; `Data` left intact; absent keys stay absent; a live `proxy-audit-log` event showed `gw_user`, `gw_path`, `gw_method`, `gw_host`, `gw_tenant` |
| 9 | Sensitive headers | Local test; live check of 27 events | `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key`, `Proxy-Authorization` are removed if present. **None seen** in live events: Privilege strips them upstream |
| 10 | Least privilege | Live | The Elasticsearch user `cribl_siem` can write `ping-siem-events*` and `gateway-events*` only. Reading refused (403); writing any other index refused (403) |
| 11 | Cribl's own port | Second-container test; mutation test | Cribl listens on 127.0.0.1 only; nginx is the only way in. Binding it to 0.0.0.0 makes the test fail, as it should |
| 12 | Gateway sidecar path (Cribl side) | Local test and a live POST | Gateway login accepted on `POST /gateway-events/_doc` only; Privilege logins refused there; the gateway login is refused everywhere else. Event stored masked with `@timestamp` set (test document then deleted) |
| 13 | OpenSearch route | Local test, both modes | Off: nothing reaches OpenSearch. On: one copy each in Elasticsearch and OpenSearch. Off for now so events are not stored twice |
| 14 | Helm chart option | `helm template` | Off by default: output **byte-identical** to today's (567 lines). On: only the added lines differ. Generated shell passes `sh -n` |
| 15 | Sidecar on a **real gateway** | `agentless-mcpgw-pingid` (the live gateway) upgraded with `helm upgrade --reuse-values` from the merged AI-DEMO2 chart (revision 4, atomic, 47 s; the dry-run diff showed only the intended sidecar lines). One real Anthropic call (claude-sonnet-4-5) sent through the gateway's own host | **Passed on a real gateway.** The gateway's own JSON `LLM request` line reached OpenSearch (+1) and Elasticsearch through Cribl (+1), exactly once each; key shortened to `prefix...last4`, no `Headers`, `@timestamp` set, `cribl_pipe: gateway_mask`. The gateway came back healthy (pod 2/2, 0 restarts, home page 200). **Found and fixed:** in Elasticsearch the numeric and boolean fields (`HTTPStatus`, token counts, `CostUSD`, `LatencyMs`, `Streaming`) arrived as strings and were indexed as `text`, while OpenSearch had them as numbers. Cause: Cribl's mask function stringifies every value it visits (proved by disabling it). Fixed in PR #576 (the 13 typed fields are excluded from masking), the local test failed before and passes after, and a second real call showed `int`/`float`/`bool` and a `long`/`float`/`boolean` mapping. **Not exercised on the real gateway:** `AIGuard` and A2A lines (calls to the gateway root and an unauthenticated A2A path produced nothing the sidecar ships; the A2A demo's traffic was pinned by the load balancer to the other namespace's gateway). Test documents deleted. An earlier simulated-source run covered all four shipped kinds |
| 16 | Prompt logging: sealed records demo | A new **Prompt logging** tab in `privilege-logging-LAB` (PR #40, merged and pinned): real HPKE (RFC 9180) sealing of sample prompts in the browser; local tests and a real-browser run | **Passed for the mechanism.** 61 new tests (43 crypto with no mocks of the crypto, 18 page); web suite 176 to 237, server 220, all passing. Real browser (Chromium): desktop and 375 px, light and dark, no horizontal scroll, 0 network requests while sealing and opening, no console errors. Wrong key id, a wrong key with the same id, tampering with any readable field, truncation and key rotation each behave as the console describes. **Not** Privilege's real records or wire format, and it does not measure what a real SIEM receives |
| 17 | Prompt logging in the **real** SIEM | Read the live `ping-siem-events-v2` index; a control call with a unique marker in the prompt, then a search of every store that could hold it | **Observed.** 159 sealed `prompt-log` records (fields and algorithm above). The marker and the sample words were absent everywhere searched. The real algorithm, `HPKE-X25519-SHA256-AES256GCM-EXPORT` (HPKE export mode feeding AES-256-GCM, one encapsulation per request), differs from the suite the demo seals with (base mode, AES-128-GCM single shot), so the demo shows the mechanism, not this wire format. **Not done:** opening a real record, which needs the private key for the tenant's key id |

**Local test:** `shared/cribl-siem/test/run-local.sh` runs Cribl and nginx against mock Elasticsearch and OpenSearch containers in OrbStack. 53 checks pass.

## 3. What is in the log (useful fields)

Privilege's SIEM feed delivers several kinds of event. The `Index` field says which:

| `Index` | Meaning | Fields worth using |
|---|---|---|
| `audit-log` | A console change | `Message` (method and object), `Status`, `User`, `Device`, `Module`, `Region`, `DataText`, `Resources` |
| `policy-decision-log` | A policy decision on an agent call | **User, agent key (`AgentKey`), `App`, `PolicyIDs`, `Decision` (allow / hitl / deny), `Reason`**, `Event`, `Stage`, `Flow`, `Target` (tool), `Method`, `Principal`, `PrincipalKind`, `RequestID`, `GrantShape`, `InstructionID`, `BaselinePhase` |
| `aiguard-log` | Guardrail verdict, rate-limit refusal, model call | `User`, `Decision`, `Event`, `Reason`, `ControlID`, `ResourceName`, `KeyType`, `Client`, compliance mappings (NIST AI RMF, OWASP, MITRE), `RequestID` |
| `proxy-audit-log` | A request the gateway accepted | `User`, `Method`, `Path`, `Host`, `Device`, `Headers`, `Tenant` |

Seen in the index in total: 1,741 `audit-log`, 677 `aiguard-log`, 366 `proxy-audit-log`, 298 `policy-decision-log`, plus older `proxy-event-log` (219) and `event-log` (4) that stop on 18-19 Nov. The runtime kinds first appear on 12 Oct (`aiguard-log`), 13 Oct (`policy-decision-log`) and 8 Nov (`proxy-audit-log`); the October write-up of this feed described console changes only.
Cribl adds top-level `gw_user`, `gw_agent_key`, `gw_app`, `gw_policy_ids`, `gw_decision`, `gw_decision_reason`, `gw_decision_event`, `gw_stage`, `gw_target`, `gw_flow`, `gw_method`, `gw_path`, `gw_host`, `gw_principal`, `gw_principal_kind`, `gw_request_id`, `gw_tenant`, `gw_control_id`, `gw_resource_name`, `gw_key_type`.

Kibana example: `gw_decision : "hitl"` finds approval-required decisions; `gw_agent_key : "<key name>"` follows one agent.

## 4. Restrictions and things to know

- **Prompt logs (verified live 24 Nov): the SIEM receives them SEALED.** Privilege already sends `Index: prompt-log` events (`Message: PromptLog`): 159 in the first 66 minutes (14:12 to 15:18 UTC), over LLM (81), agent-to-agent (42) and MCP (36) traffic, request and response as separate records. Each carries clear metadata (`App`, `User`, `AgentKey`, `KeyType`, `PrincipalKind`, `Tenant`, `RequestID`, `Direction`, `Flow`, `Bytes`, `UnitCount`) and the **sealed content**: `Content` (ciphertext, base64), `Enc` (the 32-byte encapsulated key), `Alg` = `HPKE-X25519-SHA256-AES256GCM-EXPORT` and `KeyID` (one key so far, `prompt-log-2026-11-24-a3ad`). A request and its response share one `Enc`. A control run with a unique marker in a real prompt found the marker in **none** of: the SIEM index, Elasticsearch and OpenSearch `gateway-events`, or the gateway's own `LLM request` line; sample words from the prompt were not visible in any `Content`. So the console's statement holds in this form: the SIEM never receives the plaintext, but it does hold the encrypted content, so whoever holds the private key and can read the index can open every prompt. Cribl does not mask or change these events (they are ciphertext). Watch index growth: roughly 2.4 records a minute here, about 3.4 KB at most so far (the size limit allows up to 131,072 bytes per record).
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
| Sidecar on a real gateway | **Done** on `agentless-mcpgw-pingid` (namespace `ping-devops-curtismuir`, load-balancer pool 2) with the owner's go; the upgrade took 47 s. Rollback: `helm rollback agentless-mcpgw-pingid 3`. `agentless-mcpgw3` (annotated "Leave parked") was not started. The gateways in `ping-devops-cmuir` were not touched, and the load balancer sends some clients to them, so their events do not go through Cribl |
| Phase 2: sidecar posts to Cribl only; set `GW_OPENSEARCH=true` | Needs the owner's go-ahead. The real-gateway rollout it depended on is done |
| Prompt logging: confirm what the SIEM receives (metadata only, or content) | Not tested. Needs prompt logging switched on with a public key. Planned as a test in the Privilege logging lab |
| Logins saved to Bitwarden | Done by the owner |
| Prompt logging demo (`privilege-logging-LAB` PR #40): merge, then pin the lab in AI-DEMO-Standalone | **Done** 24 Nov: #40 squash-merged (lab CI green), pinned at `e337abe` by AI-DEMO-Standalone PR #572 |
| Live check of what the SIEM receives with prompt logging on | **Done** (row 17): sealed content plus metadata and request id; no plaintext found |
| Open a real Privilege prompt record | Not done. The sealed records are in the SIEM; needs the private key for the tenant's key id (or a rotation to a key held for this) and then the demo can be extended to the real `HPKE-...-EXPORT` layout |
| `privilege-logging-LAB` CI flake (`verify-mark-header.test.jsx`, an unhandled rejection after teardown) | Pre-existing: it also failed `main`'s last push. Not fixed here |
| Persistent queue in Cribl | Not built |

## 6. Prompt logging demo (new)

The Privilege console's **Prompt Logging** page (screenshot reviewed 24 Nov) says: prompts, tool calls and, optionally, responses are encrypted to a public key you hold (X25519 JWK, HPKE RFC 9180, one encapsulation per record); Privilege cannot read them; only the private key opens them, in the browser; and **a SIEM receives the metadata and the request id, never the content**. Settings: record prompts and tool calls, record responses as well, surfaces (LLM traffic, MCP tool calls, agent-to-agent, coding agents), size limit (0 = 65,536 bytes, maximum 131,072), public key, key id. The settings live on the `tenantprofiles` object (`Spec.PromptLog.*`); the API catalog has no endpoint or record format for reading the sealed records.

**What was built:** a **Prompt logging** tab in `privilege-logging-LAB` (PR #40, merged; pinned in AI-DEMO-Standalone by PR #572), web only, no server route. It generates the key pair (key id defaults to the RFC 7638 thumbprint), seals sample prompts with real cryptography (`@hpke/core` + `@hpke/dhkem-x25519`, MIT, pinned, 0 advisories), shows the sealed record beside what a SIEM receives (metadata and request id only), and opens it with the private key in the tab. It also shows what goes wrong: a different key id is named before decrypting; a wrong key claiming the same id, a flipped byte or any changed readable field fails to open (every readable field is bound to the ciphertext); a cut record cannot be made to look complete; an old record still opens with its retired key. Nothing leaves the tab, the private key is never stored, and the tab works with the lab server down.

**What it is not:** Privilege's wire format (the real records use `HPKE-X25519-SHA256-AES256GCM-EXPORT`, seen live; the demo seals with base mode and AES-128-GCM), a reader of real Privilege records, or a measurement of a real SIEM. Its "SIEM receives" pane applies the console's statement to the record. The live SIEM check was done separately and agrees: metadata and request id in the clear, content sealed.

**Still open for prompt logging:** opening a real record. The records are in the SIEM already; what is missing is the private key for `prompt-log-2026-11-24-a3ad` (or rotating the tenant's key to one held for this purpose) and the exact record layout (export context, nonce and AAD handling), which can only be confirmed by decrypting one.

## 7. Why the gateway sidecar path is on hold

Privilege's own feed already delivers the same gateway runtime logs through Cribl, so the sidecar adds little today. It stays built and un-deployed as a second route (it also carries `A2A policy denied` lines). The script has been tested live with a simulated log source, not yet on a real gateway.

## 8. How to repeat the checks

```sh
shared/cribl-siem/test/run-local.sh                         # 53 local checks (needs OrbStack)
# prompt logging demo (lab repo privilege-logging-LAB): cd web && npx vitest run src/lib/promptSeal.test.js src/PromptLogging.test.jsx   # 61 tests
kubectl --context us -n ping-devops-curtismuir get pods -l app=cribl-siem    # 3/3 Running
curl -s -o /dev/null -w '%{http_code}\n' https://cmuir-cribl.ping-devops.com/   # 401 without a credential
```

Then in the Privilege console: SIEM Config, Health Check, Save, change something small, and search Kibana (`ping-siem-events*`) for `cribl_pipe : "siem_mask"`.
