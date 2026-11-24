# Cribl for the gateway traffic lines spec

**Status:** built (Cribl side deployed and verified live; gateway change pending Curtis's go)   **Owner:** Curtis (decides go for any gateway change)

## Goal
The Privilege gateway's `LLM request`, `AIGuard`, A2A-accepted and `A2A policy denied` log lines go through Cribl (masked, routed) into Elasticsearch
(`gateway-events`, searchable in Kibana), and later also into OpenSearch, instead of only the shell `log-tailer` posting straight to OpenSearch.
Decided 2026-11-24: destinations OpenSearch + Elasticsearch; rollout = add Cribl beside the existing OpenSearch post, one gateway first.

## Design
- Sidecar change is values-only plus a small chart template addition in AI-DEMO2 (`pingone-privgateway-helm-main/agentless/agentless-mcpgw`): a second `ship` target, set by `logShipping.cribl.url` (+ `authSecret`), off by default.
- Cribl side (this repo, `shared/cribl-siem`): nginx accepts `POST /<index>/_doc` (what the sidecar sends; Cribl's own Elastic source refuses `_doc`) with its own Basic credential (`cribl-siem-gateway-login`), forwards to a loopback Cribl HTTP source; pipeline `gateway_mask`; Output Router to Elasticsearch `gateway-events` and (disabled in phase 1) OpenSearch.
- Phase 1: sidecar posts to OpenSearch (unchanged) AND Cribl; Cribl writes Elasticsearch only (no duplicates in OpenSearch). Phase 2 (own go): sidecar posts to Cribl only, Cribl also writes OpenSearch.
- Elasticsearch: `cribl_siem` gets a second role `cribl_gateway_writer` (write on `gateway-events*`, no read).

## Acceptance criteria (each a runnable check)
1. Local test: `POST /gateway-events/_doc` with the gateway Basic login returns 2xx and exactly one document reaches the Elasticsearch mock in index `gateway-events`, with `@timestamp` set from `time`.
2. Local test: the same POST with the privilege login, the API key, no credential or a wrong password returns 401; the gateway login on `POST /_bulk` returns 401 (least privilege both ways).
3. Local test: `VirtualKeyID` longer than 16 characters is shortened, `sk-orion-...`, Bearer and JWT strings are masked, `Headers` is removed, `_time` is removed.
4. Local test: with the OpenSearch route disabled, nothing reaches the OpenSearch mock; enabled, one copy reaches each.
5. Existing 22 SIEM checks still pass (nothing in the SIEM path changes).
6. Live (Cribl only, before any gateway change): `cribl_siem` can write `gateway-events` and cannot read it (403), cannot write other indices.
7. Live, gateway `agentless-mcpgw-pingid` after upgrade: new `LLM request`/`AIGuard` lines appear in Elasticsearch `gateway-events`; OpenSearch `gateway-events` still gets every event once; `kubectl logs -c log-tailer` still works.

## Unhappy paths
- Cribl down or slow: the Cribl post must not block or lose the OpenSearch post (separate wget, short timeout, errors ignored; OpenSearch post stays first). Events during the outage are lost on the Cribl side only (no queue), stated in the README.
- Elasticsearch down: Cribl logs `Destination failed`; OpenSearch copy unaffected in phase 1.
- Wrong or missing credential: 401, nothing written.
- Retry/duplicate post from the sidecar: not retried by the sidecar; Cribl writes auto-ids, so a duplicate post is a duplicate document (accepted, same as today).
- Hostile line: a log line with a `Headers` object, a bearer token or a long key never reaches Elasticsearch unmasked.
- Large/odd body: nginx caps at 20m; a non-JSON body is dropped by Cribl, not forwarded.

## Out of scope
The other gateways (`agentless-mcpgw`, `agentless-mcpgw3`) until pingid is verified; the `ping-devops-cmuir` namespace gateways; phase 2 cut-over; a persistent queue in Cribl; replacing the shell sidecar with Cribl Edge.

## Protected / must not break
The SIEM feed (Basic and ApiKey on `/`, `_bulk`); gateway traffic (pingid takes HAProxy pool traffic and serves spiffe-issuer-LAB, so its pod restart must be a rolling one with the gateway ready before the old pod stops); OpenSearch `gateway-events` readers (the MCP inspector's door); `kubectl logs` on the sidecar; flags default OFF (`logShipping.cribl` off unless set).

## Verification plan
Local `test/run-local.sh` (SIEM + gateway cases) and a chart render check (`helm template` with and without `logShipping.cribl`, diff only the added lines). Deploy Cribl side to `us` / `ping-devops-curtismuir` (additive), run criterion 6. Chart change in AI-DEMO2 via worktree + PR + `/code-review`. **Gateway upgrade only after Curtis says go** in this conversation; first `agentless-mcpgw-pingid` with `helm upgrade --reuse-values`, check criterion 7, then ask before the other two.

## Evidence (Cribl side, 2026-11-24)
1. `test/run-local.sh`: 40 checks pass (22 SIEM, 18 gateway/router). Criteria 1-5: pass.
2. Live: gateway login `POST /gateway-events/_doc` over public HTTPS 200; privilege login on `_doc` 401; Basic/ApiKey on `/` still 200; no credential 401.
3. Live: stored event had `VirtualKeyID` `sk-orion-...9999`, `Headers` absent, `@timestamp` from `time`, `cribl_pipe: gateway_mask`, index `gateway-events` (test document deleted afterwards).
4. Live: `cribl_siem` read `gateway-events` 403, write to another index 403 (criterion 6). No Cribl `Destination failed` / error lines.
5. Criterion 7 (gateway upgrade) not run yet.
