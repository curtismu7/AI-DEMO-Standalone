# cribl-siem: Cribl Stream between Privilege's SIEM feed and Elasticsearch

Privilege's SIEM setting sends console audit events to an Elasticsearch URL (see `AI-DEMO2/privilege/GATEWAY-LOGGING-WITH-ELASTICSEARCH.md`).
This puts Cribl Stream at that URL. Cribl masks secrets in the events, then always writes them to the index `ping-siem-events-v2` (where the existing history is; Privilege's sender itself names `audit-log`, which Cribl overrides),
in the same Elasticsearch (`elasticsearch-siem`, namespace `ping-devops-curtismuir`, context `us`).

```text
Privilege cloud --HTTPS (Basic or ApiKey)--> cmuir-cribl.ping-devops.com --> nginx (checks the credential) --> Cribl on 127.0.0.1:9201 (in_elastic -> siem_mask -> es_siem) --> elasticsearch-siem:9200
```

## Credentials

Two separate logins, each in its own Secret in `ping-devops-curtismuir` (created by hand, never in git, values never printed):

| Secret | Used for | Keys |
|---|---|---|
| `cribl-siem-privilege-login` | What the **Privilege SIEM form** signs in to Cribl with (Username and password) | `username` (`privilege`), `password` (random) |
| `cribl-siem-privilege-apikey` | What the Privilege SIEM form sends when Authentication is **API key** (`Authorization: ApiKey <value>`; paste the value into the form's API Key field) | `username` (`apikey`), `password` (the key, base64-style like an Elastic "encoded" key) |
| `cribl-siem-admin` | Cribl's admin **UI** login (port-forward only; applied by the `set-admin-password` sidecar) | `username` (`admin`), `password` (random) |
| `cribl-siem-es-writer` | What **Cribl** signs in to Elasticsearch with: user `cribl_siem`, role `privilege_siem_writer` (write on `ping-siem-events*`, cluster `monitor`, no read) | `username`, `password` (random) |

Read the values for the Privilege form on your own machine (the last part copies it to the clipboard instead of printing it):

```sh
kubectl --context us -n ping-devops-curtismuir get secret cribl-siem-privilege-login -o jsonpath='{.data.username}' | base64 -d | pbcopy   # paste into Username
kubectl --context us -n ping-devops-curtismuir get secret cribl-siem-privilege-login -o jsonpath='{.data.password}' | base64 -d | pbcopy   # paste into Password
```

Do **not** use Cribl's own `admin` login (Secret `cribl-siem-admin`) in the Privilege form: that is the Cribl UI account, and Cribl rejects it on the Elasticsearch port (the console shows "The token or API key was rejected").
The older Secret `elasticsearch-siem-privilege-credentials` (user `privilege_siem`) no longer matches Elasticsearch's password for that user (401 on 2026-11-24), so nothing here uses it.

## What is proven, and what is not

Proven here (`test/run-local.sh`, 14 checks, run 2026-11-23): Cribl 4.13.0 in front of a mock Elasticsearch refuses missing and wrong credentials (401),
accepts a `_bulk` request, writes it to `ping-siem-events-v2` (even when the sender names `audit-log`) with the writer user's credentials, masks `password`/`*token*`/`*apikey*`/`virtualkey`-style
values in `Data`, `sk-` keys, Bearer values and JWTs, keeps the other fields, and strips Cribl's `_time`. Passwords with `' & \ $` render correctly.
The manifests pass `kubectl apply -k . --dry-run=server` against `us`.

**Not proven: that Privilege's SIEM sender can talk to Cribl.** Cribl's Elasticsearch source only parses `_bulk` requests
(`/_bulk` and `/<index>/_bulk`). A single-document write (`POST /<index>/_doc`) gets `404 could not find parser`, and `PUT /<index>/_doc/<id>`
returns `{}` but is not forwarded. The runbook says a successful Privilege write returns 201, which is what a single-document write returns
(`_bulk` returns 200), so Privilege may use `_doc`. Nobody has captured its request. Also unknown: whether it needs the `X-elastic-product` response header
(Cribl's `GET /` reply does not send it), and which paths its health check calls.

So deployment is step one of a test, not the finish. The console's SIEM health check against Cribl shows the answer:
`kubectl --context us -n ping-devops-curtismuir logs deploy/cribl-siem -c cribl | grep "Could not find parser"` prints the path Privilege used.

If Privilege uses `_doc`: add a small nginx in front of Cribl that rewrites `POST /<index>/_doc` into a `_bulk` body and adds the `X-elastic-product: Elasticsearch` header.
Not built, because it is only worth building against the real request.

## Status

Deployed 2026-11-23 to context `us`, namespace `ping-devops-curtismuir` (owner's go in session). Checked: pod running with no errors, public HTTPS returns 401 without
credentials, the Privilege ingestion user gets 200 from inside the cluster. **The Privilege SIEM URL has not been switched yet**, so no real event has gone through Cribl.
The Cribl destination names its Elasticsearch version (`elasticVersion: '7'`) because the write-only ingestion user is refused on the version check (`GET /`).

## Deploy (changes the shared cluster: needs the owner's go)

```sh
cd shared/cribl-siem
test/run-local.sh                                   # local proof first
kubectl --context us apply -k . --dry-run=server    # then, with the go:
kubectl --context us apply -k .
kubectl --context us -n ping-devops-curtismuir rollout status deploy/cribl-siem
curl -s -u "$USER:$PASS" https://cmuir-cribl.ping-devops.com/ | head -c 200   # Cribl answers like Elasticsearch
```

Then in the Privilege console: SIEM configuration, **Elastic**, set URL to `https://cmuir-cribl.ping-devops.com`, enter the `cribl-siem-privilege-login` username and password (the form has no Index field now), run the health check, **Save Changes**,
and change something small. Check the count (`GET /ping-siem-events-v2/_count`) rises, and that `Data` shows `***` where a key would be.

Open Cribl's UI with `kubectl --context us -n ping-devops-curtismuir port-forward deploy/cribl-siem 9000:9000`, then <http://127.0.0.1:9000>.
The UI has no Service or Ingress on purpose. Its `admin` password is in Secret `cribl-siem-admin` (key `password`) and, if saved, Bitwarden.
Because Cribl rebuilds its users file as `admin`/`admin` on every pod start, the `set-admin-password` sidecar logs in with the default and sets the Secret's password
through Cribl's API (and re-applies it every 5 minutes if it is ever back to the default). Cribl's policy needs 3 of lower/upper/digit/symbol, so the Secret is random hex plus `-Aa`.
Create the Secret once, by hand, before deploying: `kubectl -n ping-devops-curtismuir create secret generic cribl-siem-admin --from-literal=username=admin --from-literal=password="$(openssl rand -hex 20)-Aa"`.

## Test it

1. Health check in the console passes (Cribl logs a `GET /`, `HEAD /audit-log` and a `POST /_bulk`, all 200). That health check writes one event.
2. **Save Changes**, then change something harmless in the console (rename an app description and put it back).
3. Count and read the newest events (needs the Elasticsearch `elastic` login; port-forward `svc/elasticsearch-siem` 9200):
   `GET /ping-siem-events-v2/_search?size=3&sort=@timestamp:desc`. The `cribl_siem` user itself is write-only, so it cannot read.
4. In the newest event, `Data` must show `***` for any password, key or token, and the event has `cribl_pipe: siem_mask`.
5. Cribl's own view: `kubectl --context us -n ping-devops-curtismuir logs deploy/cribl-siem -c cribl | grep "Destination failed"` prints nothing when writes succeed.

## Basic or API key

The SIEM form offers both. Cribl's Elasticsearch source accepts only one auth mode and refuses the `ApiKey` scheme (it takes `Bearer <token>` or a bare token), so an `auth-proxy` nginx container in the same pod checks the credential
(`config/nginx.conf.tpl`: `Basic` = the `cribl-siem-privilege-login` pair, `ApiKey` = `cribl-siem-privilege-apikey`) and Cribl listens on 127.0.0.1:9201 with no auth of its own. Both modes reach the same pipeline and index.
Copy the key to the clipboard without printing it:
`kubectl --context us -n ping-devops-curtismuir get secret cribl-siem-privilege-apikey -o jsonpath='{.data.password}' | base64 -d | pbcopy`
Create the Secret once, by hand, before deploying: `kubectl -n ping-devops-curtismuir create secret generic cribl-siem-privilege-apikey --from-literal=username=apikey --from-literal=password="$(printf 'cribl-siem:%s' "$(openssl rand -hex 24)" | base64 | tr -d '\n')"`.
Verified (local test and live): no credential, wrong password, wrong key and `Bearer <key>` are all 401; Basic and ApiKey are 200 and both writes arrive masked. Not yet verified: what Privilege itself sends in API-key mode (expected `ApiKey`, the Elastic standard).

## What the events contain, and what Cribl adds

Privilege's own SIEM feed delivers more than console changes (the runtime kinds first appear in the index on 12 Oct, 13 Oct and 8 Nov). The `Index` field names the kind:

| `Index` | What it is | Useful fields (in `Data`, and promoted to `gw_*` by Cribl) |
|---|---|---|
| `audit-log` | A change made in the Privilege console | `Message` (method + object), `Status`, `User`, `Device`, `Module`, `Region`, `DataText`, `Resources` |
| `policy-decision-log` (`AIPolicyDecision`) | A policy decision on an agent call | `User`, `AgentKey`, `App`, `PolicyIDs`, `Decision` (allow / hitl / deny), `Reason`, `Event`, `Stage`, `Flow`, `Target` (tool), `Method`, `Principal`, `PrincipalKind`, `RequestID`, `GrantShape`, `InstructionID`, `BaselinePhase`, `Tenant` |
| `aiguard-log` (`AIGuard`, `AIGuardControl`, `LLM request`) | A guardrail verdict, a rate-limit refusal, a model call | `User`, `Decision`, `Event`, `Reason`, `ControlID`, `ResourceName`, `KeyType`, `Client`, compliance mappings (NIST AI RMF, OWASP, MITRE), `RequestID` |
| `proxy-audit-log` (`Received HTTP request`) | A request the gateway accepted | `User`, `Method`, `Path`, `Host`, `Device`, `Headers`, `Tenant` |

Cribl copies the fields people filter on to top-level `gw_user`, `gw_agent_key`, `gw_app`, `gw_policy_ids`, `gw_decision`, `gw_decision_reason`, `gw_decision_event`, `gw_stage`, `gw_target`, `gw_flow`, `gw_method`, `gw_path`, `gw_host`,
`gw_principal`, `gw_principal_kind`, `gw_request_id`, `gw_tenant`, `gw_control_id`, `gw_resource_name`, `gw_key_type` (only when the event has them). `Data` itself is left as sent. It also removes `Authorization`, `Cookie`, `Set-Cookie`,
`X-Api-Key` and `Proxy-Authorization` from `Data.Headers` if they ever appear (none seen in live events: Privilege strips them upstream). Still present and worth knowing: client IPs (`X-Forwarded-For`, `X-Real-Ip`) and `Mcp-Session-Id`.

**Prompt content.** "Unencrypted prompt logs delivery to SIEM" is in production as part of the 11/20 release (owner note). In the 6 `Index` kinds seen so far no field carries prompt text, so nothing here masks it. When that feature is on for the tenant,
prompt text will pass through Cribl into Elasticsearch in clear: restrict who can read the index, and add a masking rule here once the field names are known.

## Gateway traffic lines (LLM request, AIGuard, A2A)

Since Privilege's own feed already delivers the gateway's runtime logs (table above), this sidecar path is a second route for the same kinds of line (plus `A2A policy denied`). It is built and the Cribl side is deployed; no gateway uses it yet.

The gateways' `log-tailer` sidecars post one JSON line per event to `/<index>/_doc`. Cribl's Elasticsearch source refuses that, so nginx accepts `POST /<index>/_doc` (and only that path) with the **gateway login**
(Secret `cribl-siem-gateway-login`, user `gateway`) and rewrites it to a loopback Cribl HTTP source (`in_gateway`, `/cribl/_bulk`). Route `gateway-events` runs pipeline `gateway_mask` (shorten `VirtualKeyID` to `prefix...last4`,
remove `Headers`, mask `sk-` keys / Bearer / JWT, `@timestamp` from `time`) and the router `gw_router` sends to Elasticsearch `gateway-events` and, when `GW_OPENSEARCH=true`, to OpenSearch `gateway-events`.
The gateway login works on that path only, and the Privilege logins do not work on it (both checked).
Elasticsearch: user `cribl_siem` has a second role `cribl_gateway_writer` (write on `gateway-events*`, no read).

Phase 1 (now): the sidecar keeps posting to OpenSearch itself, plus to Cribl, so Cribl writes Elasticsearch only (no duplicates in OpenSearch). Phase 2 (cut-over, own go): the sidecar posts to Cribl only and `GW_OPENSEARCH` is set to `true` in `k8s/deployment.yaml`.
**Before deploying to a new cluster/namespace** (the Deployment reads these; a missing Secret leaves the pod in `CreateContainerConfigError` and stops the SIEM feed too):

1. Secret: `kubectl -n <ns> create secret generic cribl-siem-gateway-login --from-literal=username=gateway --from-literal=password="$(openssl rand -hex 24)"` (the gateways' sidecars use the same Secret via the chart's `logShipping.cribl.authSecret`).
2. Elasticsearch (as the `elastic` user): `PUT _security/role/cribl_gateway_writer` with cluster `monitor` and, on `gateway-events*`, privileges `auto_configure, create_index, create_doc, index, view_index_metadata`; then `PUT _security/user/cribl_siem` with `roles: [privilege_siem_writer, cribl_gateway_writer]`.
3. `OS_URL` in `k8s/deployment.yaml` is `http://opensearch:9200/_bulk`: the `opensearch` Service in the **same namespace** as Cribl, the one the sidecars post to (security off, so no login). Checked from the Cribl pod: 200.

Spec: `docs/specs/2026-11-24-cribl-gateway-events.md`. If Cribl or Elasticsearch is down, the Cribl copy of those events is lost (no queue); the OpenSearch copy is unaffected in phase 1.

## Field types

Cribl's mask function turns every value it visits into a string, even when no rule matches. For **gateway events** that would make `HTTPStatus`, the token counts, `CostUSD`, `LatencyMs` and the booleans text in Elasticsearch (found on a real gateway call, 24 Nov), so `config/gateway_mask.conf.yml` excludes those 13 fields (the numeric and boolean fields of OpenSearch's `gateway-events` mapping) and lists the exclusions **before** the `*`, because Cribl takes the first match. The local test checks `int`, `float` and `bool` survive.
For **SIEM events** nested values are still stringified, but `ping-siem-events-v2` already maps every `Data.*` leaf as `text` (also for events from before Cribl), so nothing changes there. A new typed field in the gateway log needs adding to that exclusion list.

## Roll back

Put the previous URL back in the Privilege SIEM form, then `kubectl --context us delete -k .`.

## Notes

- Config is rebuilt from the ConfigMap and Secret on every pod start (`render-config.sh`, in an init container). Changes made in the Cribl UI are lost on restart; change the files here.
- The masking rules are generic: the real field names inside `Data` have not been listed. After the first real events arrive, search `Data` for leftovers
  (`sk-`, `AKIA`, a password) and add a rule to `config/siem_mask.conf.yml`.
- Console housekeeping events (`carts`, `userpreferences`, a third of the feed) are kept. A drop rule would be one function in the pipeline.
- The gateway traffic lines (`LLM request`, `AIGuard`) are a separate feed and are not covered here. Cribl could replace the `log-tailer` sidecar for them too.
- Cribl Stream runs on its free license. Nothing is installed locally: the image is `cribl/cribl:4.13.0` (Docker Hub, pinned).
