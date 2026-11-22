# run-observability: "What each layer logged for this run" (Rule 27)

For ONE run of a demo, the log lines (and decisions) each of six layers left behind, in time order, with the exact timestamp the product wrote,
an outcome, a short message and an honest origin tag. One component and one collector, so every lab shows the same thing the same way.
It is an **excerpt**: ids, tokens, addresses and hostnames are masked, and the panel says so.

## Files

| File | Vendor to | Who vendors it | What |
|---|---|---|---|
| `runObservability.js` | `server/src/runObservability.js` | every lab (the CORE) | masker, anchored line matchers, `collectRun`, `assertRunObservability`, `defaultLayers`, `saasLayer`, lab-matcher support. No imports, no network, no file access: a lab that reads no logs vendors only this and exempts nothing in its safety tests |
| `runObservabilityReaders.js` | `server/src/runObservabilityReaders.js` | labs that read logs (Real mode) | `ElasticsearchReader`, `DockerLogReader` (and the file reader), `readersFromEnv`. Uses `fetch`, `node:http` and `node:fs`, so its lab exempts those in its safety test. Imports only the core |
| `RunObservability.jsx` | `web/src/run-observability/RunObservability.jsx` | every lab | the panel. It imports `../components/JsonPane` (Rule 24): the lab's JsonPane must live at `web/src/components/JsonPane.jsx` (path coupling, the same as `gateway-trace`) and export `setJsonView` for the tests |
| `run-observability.css` | `web/src/run-observability/run-observability.css` | every lab | tokens only, no purple, light and dark, usable at 375px |
| `run-observability.test.jsx` | `web/src/run-observability/run-observability.test.jsx` | every lab | vitest + Testing Library; runs in the lab |
| `fixtures.js` | `web/src/run-observability/fixtures.js` | every lab | masked records (mock, real, long names, empty, partial, error) for tests |
| `run-observability.sha256` | `web/src/run-observability/run-observability.sha256` | every lab | the pin: `<sha256>  <path relative to the lab root>` per file (see below) |
| `checkPin.mjs` | `scripts/run-observability-checkPin.mjs` | every lab | the ONE pin check (`checkPin(labRoot)` returns problems; also a CLI). Dependency-free |
| `runObservability.test.mjs`, `checkPin.test.mjs` | not vendored | | server and pin tests; run here: `node --test shared/run-observability/*.test.mjs` (a glob, never a directory; heavy runs go to the Air with `air-test`) |

**A lab without a log reader** (Mock only, or a lab that only shows `response` rows) vendors the core, the web files, the pin and `checkPin.mjs`, and no readers file.
**A lab that reads logs** also vendors `runObservabilityReaders.js`.

Vendor byte-for-byte, never hand-edit (like `shared/gateway-trace`). **Pin test:** the lab calls the helper instead of hand-mapping names:

```js
import { checkPin } from '../scripts/run-observability-checkPin.mjs';
assert.deepEqual(checkPin(labRoot), []);      // or:  node scripts/run-observability-checkPin.mjs <labRoot>
```

`checkPin` verifies every pinned file that exists in the lab, fails on a mismatch, fails when the core is missing from the lab or the pin, fails on a pin line it cannot read or one that points outside the lab,
and fails when a known vendored file exists in the lab but is not in the pin. A lab without the readers file passes (the readers line is skipped). Re-pin (in this folder): `shasum -a 256` each vendored file and write
`<hash>  <lab-relative path>` (the table above gives the paths).

## The six layers

| # | Layer | What it shows | Where the lines come from today |
|---|---|---|---|
| 1 | **Person** | who signed in (sub / user) from the IdP | PingFederate `audit.log` (MEASURED shape). PingOne and AIC sign-in: `not-logged` (see Follow-ups) |
| 2 | **Agent** | the act claim / actor client id, the delegation | PingFederate audit lines with no subject; the Privilege gateway "Access token found for user, client" line |
| 3 | **Authorize** | PingOne Authorize permit / deny and policy | `P1AZ` lines in PingGateway stdout (MEASURED); otherwise a `response` row the lab supplies, or `not-logged` |
| 4 | **Privilege** | policy decisions, AI Guard and Prompt-Guard verdicts, approvals | Privilege SIEM index `ping-siem-events-v2`, gateway JSON documents, `aiguard: blocked` line, Prompt-Guard sidecar |
| 5 | **Agent gateway** | allowed / refused / blocked | Privilege gateway log, PingGateway access audit JSON |
| 6 | **Resource server** | the MCP tool call served or refused | the MCP server's stdout (header lines MEASURED; refused / served wording UNVERIFIED) |

## The honesty rule (Rule 25, applied to logs)

Every row has an **origin**. The panel and `assertRunObservability` enforce it.

| Origin | Means | Never |
|---|---|---|
| `logged` | a real line read, read-only, from the product's own log or log index, shown with that line's own timestamp, ids and tokens masked | a decision the lab got from an API; anything a mock made |
| `response` | a decision the lab already holds as an API response (for example a PingOne Authorize permit or deny and its policy) | tagged or counted as `logged` |
| `simulated` | the lab's mock computed it (Mock mode) | presented as read from a log |
| `not-logged` | no line was found for this run in the window; the product may not log this event. The panel SAYS so | a claim that a line exists. A missing event is never invented |

- Mock mode produces `simulated` rows; Real mode produces `logged`, `response` and `not-logged`. A real record cannot hold a `simulated` row, a mock record cannot hold `logged` or `response`.
- An `info` row (a hold, a verdict that does not say what the gateway did, a pass-through) is **never counted as passed**: the summary counts `info` apart ("for information").
- Rows whose line shape nobody has measured carry `basis: "unverified-shape"` and the panel tags them `UNVERIFIED shape`.
- A row matched only by the run's time window (not by an id from the run) carries `matchedBy: "window"` and the panel says so.
- Per layer, `coverage` is one of `logged | simulated | response | not-logged | unreachable`, and it is exactly what the rows support (a logged row wins over a response row, which wins over a simulated one). `unreachable` always comes with a reason (Rule 23: structured, never an empty 200 or an HTML page).
- **Caps and partial searches.** A record holds at most 500 rows, counting the `not-logged` rows. Past that the OLDEST rows go first, from the layer holding the most, so every layer keeps its newest rows; `truncated` is set and `coverage` is rebuilt from the rows that are left (a layer that lost every row becomes `not-logged` and says so). `summary` counts the rows in the record.
  The Elasticsearch reader asks newest first and takes at most 500 documents; a reader that read only the tail of a file, or hit a cap, reports `truncated`. When a layer found no line AND the search was cut, it stays `not-logged` but `partial[layer]` is true and the reason says "the search was cut at the cap, so absence is not proof"; the panel chip then reads **Not found (partial search)**. Narrow the run's window to see more.

## Use

Server (Real mode: Elasticsearch):

```js
import { createRunObservability, defaultLayers, saasLayer } from './runObservability.js';
import { readersFromEnv } from './runObservabilityReaders.js';          // only in a lab that reads logs; the core alone takes readers: []

const obs = createRunObservability({ readers: readersFromEnv() });      // readers default to [] (the core reads no environment); clock, masker and matchers are optional
const record = await obs.collectRun({
  runId, startedAt, endedAt,                                             // ISO strings or epoch ms; the run's window
  correlation: { sub, actClientId, traceId, requestIds: [] },           // ids from this run (raw; compared before masking)
  layers: [                                                              // which products each layer reads; defaultLayers() is a start
    ...defaultLayers().filter((l) => l.layer !== 'authorize'),
    saasLayer('authorize', [{ at, outcome: 'allowed', message: 'PERMIT for tool x under policy y', detail: { policy: 'y' } }]), // a response row
  ],
  source: 'real',
});
res.json(record);
```

Mock mode: `source: 'mock'` and give each layer `simulated: [{ at, product?, outcome, message, detail? }]`; no readers are used. A layer with no events is
`not-logged` with the reason you give (`reason`). On a failure answer `{ error, message }` as JSON (Rule 23) and pass that to the panel.

`collectRun` throws `RunObsError` (`code`, `status`) for a bad window, layer, row or lab matcher: answer it as JSON. A layer the lab does not list is `not-logged` ("This lab did not ask for this layer."), so every record names all six.
`at` on a simulated or response row, like the window, is an ISO string or epoch milliseconds; the record always carries ISO text.

Page: `<RunObservability record={record} source="mock" | "real" streams={[{ product, lives, streams }]} />`, under the lab's Run. `source` is REQUIRED (the page's current mode): without it, or with any other value, the panel shows an alert and nothing else, and never guesses from the record. A new record starts a clean panel (open rows and the layer filter reset).
Optional `title` and `hot` (extra JsonPane highlight keys; default `["outcome","origin","basis"]`). A `record` whose `source` differs from the
`source` prop is refused on screen, not shown under the wrong label. `streams` feeds the collapsible "Where these logs live and where they
stream" block (Rule 27: the lab's README says the same); an empty `streams` says the lab has not said.

Record (what `collectRun` returns and the panel reads):

```
{ runId, window: { from, to }, source: 'mock'|'real', excerpt: true, truncated,
  rows: [{ id, at (ISO, null for not-logged), atExact (the source's own timestamp text), layer, product, outcome: 'allowed'|'refused'|'blocked'|'info',
           message, origin: 'logged'|'simulated'|'response'|'not-logged', basis?, matchedBy?, matcher?, detail? }],
  coverage: { <layer>: 'logged'|'simulated'|'response'|'not-logged'|'unreachable' },
  reasons: { <layer>: string }, partial: { <layer>: true }, summary: { allowed, refused, blocked, info } }
```

Tests: `assertRunObservability(record)` returns a list of problems (empty = fine); every lab test calls it on a real and a mock record. It fails on an unmasked
bearer, JWT, `sk-` key, secret-named field or IPv4 address; a `logged` row without a timestamp; a `simulated` row in a real record (or a `logged` / `response` row in a mock one);
a `simulated` or `response` row presented as read from a log; a missing summary or a layer missing from `coverage`; a coverage tag the rows do not support, in either direction
(`not-logged` beside a logged row fails, `logged` with no logged row fails); a partial search that does not say absence is not proof; and an `info` row counted as passed. It also scans every string in the record
(timestamps included) for unmasked Bearer, Basic, ApiKey, JWT, `sk-`, Slack and cloud tokens, secret-named fields (`token=`, `session_id=`, `sid=`, `pwd=`, `pass=`, `secret_key=` ...), credential headers, IPv4 and IPv6 addresses, emails and hostnames.

## Reader selection and environment

Owner decision 2026-11-22: **Elasticsearch is the default reader. The Docker reader is opt-in** (ad-hoc runs and video capture), off unless `RUN_OBS_DOCKER=1`.
`readersFromEnv()` returns them in that order. For each product the first reader that can read it and does not fail wins; a failure falls to the next reader,
and the fallback is recorded in the layer's `reasons` (never silent). A reader that answers with no lines is an answer (`not-logged`), not a failure. If no reader is configured,
or all fail, the layer is `unreachable` and the reason says what to set.

| Variable | Meaning |
|---|---|
| `RUN_OBS_ES_URL` | a LOOPBACK Elasticsearch origin (a port-forward), for example `http://127.0.0.1:9200`; anything else is refused |
| `RUN_OBS_ES_READ_APIKEY` | a read-only Elasticsearch API key (the owner creates it; the collector's write key is a different key). Never returned, logged or put in an error |
| `RUN_OBS_DOCKER` | `1` turns the Docker reader on. Anything else leaves it off, even when the next two are set |
| `RUN_OBS_CONTAINERS` | `product=container,product=container` for the Docker reader |
| `RUN_OBS_LOG_FILES` | `product=/absolute/path` of a log file mounted read-only (the Privilege gateway writes `cyonproxy.log` to a file, not stdout) |
| `RUN_OBS_DOCKER_SOCKET` | default `/var/run/docker.sock` |

Product ids: `pingfederate`, `pinggateway`, `privilege-gateway`, `privilege-siem`, `promptguard`, `mcp-server`.

**Elasticsearch reader.** ONE read-only `POST /<index>/_search` per product to the loopback URL, `Authorization: ApiKey <read key>`. Indexes: `ping-logs-*,demo-logs-*`
(filtered by `ping_product` or `demo_service`) and `ping-siem-events-v2` for `privilege-siem`; fields `@timestamp`, `ping_product`, `ping_component`, `host`, `message`, `level`, `request_id`
(the collector in `shared/ping-log-collector` ships these). It asks newest first, never follows a redirect, caps the time (8 s, also while the body drips in: `es_timeout`), the answer (2 MB) and the hits (500; hitting the cap marks the answer partial), skips any document whose `@timestamp` is not ISO 8601, and scrubs secret-looking fields again.
Inside a lab container, loopback is the container: use a forwarder in the lab's network namespace (the same approach observability-LAB's `siem` profile uses with `alpine/socat`).

**Docker reader (opt-in).** Only `GET /containers/{name}/logs?stdout=1&stderr=1&timestamps=1&since&until` on the Docker engine socket: never POST, never exec, never another path. It reads the
file log for a product if `RUN_OBS_LOG_FILES` names one.

**Why Docker is not the default, and why a compose file must NOT mount the socket by default.** Mounting `/var/run/docker.sock` into a lab breaks the loopback-only, non-root,
read-only-filesystem rules: even `:ro` the socket exposes the whole Docker API (a client can still create containers through it). The collector (`shared/ping-log-collector`) is the one thing that holds the
socket and ships to Elasticsearch; a lab only needs a read key. Mount the socket (or a log file volume `:ro`) only in a throwaway override file for an ad-hoc run or a video capture, never in the lab's
committed `docker-compose.yml`:

```yaml
# docker-compose.run-obs-docker.yml  (ad-hoc only; start with:  docker compose -f docker-compose.yml -f docker-compose.run-obs-docker.yml up)
services:
  lab:
    environment: { RUN_OBS_DOCKER: "1", RUN_OBS_CONTAINERS: "pingfederate=<pf container>,pinggateway=<gateway container>" }
    volumes: ["/var/run/docker.sock:/var/run/docker.sock:ro"]
```

## Privilege agent gateway

The Privilege agent gateway writes `cyonproxy.log` to a **volume**, not stdout. The default path to it is Elasticsearch: the collector's file source reads that volume read-only and ships it to
`ping-logs-privilege-gateway` (`ping_product: privilege-gateway`), which the Elasticsearch reader queries. The log volume can also be mounted read-only into a lab and named in `RUN_OBS_LOG_FILES` (Docker reader, ad hoc).

The **hosted** gateway (`gw-switch pingid`) is never a local container: its events exist only in the SIEM index `ping-siem-events-v2` (read with product `privilege-siem`) or in the console Activity Logs.

**Refusal and block lines are not yet confirmed in any gateway log.** Measured on the local gateway: a rejected MCP request left no line in `cyonproxy.log` (observability-LAB `docs/privilege-logging-test-plan.md` 8a), and
the Prompt-Guard flags had no matching block line. So, until a real line is found, refusal and block rows for the gateway are `not-logged`. The matchers below only produce a row when a real line is present; nothing is inferred
from a missing one, and a flag or a verdict document that does not say what the gateway did is `info`, never `blocked`.

## What is measured and what is UNVERIFIED

Per-layer parsers are a small table in `runObservability.js` (`layerMatchers`). A matcher maps one product's log line to `{ layer, outcome, message }`; an unrecognised line is dropped, never guessed.
`measured` = the shape was seen on a real run (sources: `shared/ping-log-collector`, observability-LAB `README.md` and `docs/privilege-logging-test-plan.md`, AI-DEMO2 `privilege/GATEWAY-LOGGING-WITH-ELASTICSEARCH.md`, read-only).
`UNVERIFIED` = nobody has captured the shape: its rows carry `basis: "unverified-shape"`. Do not promote one without a capture.

| Matcher | Product | Layer | Status |
|---|---|---|---|
| `pf-audit` (positional `audit.log` line; subject present = person, absent = agent) | pingfederate | person / agent | measured for `failure` and `inprogress`; a `success` status is UNVERIFIED |
| `p1az-decision` (`[P1AZ] DECISION: PERMIT ...`; PERMIT with `obligation=hitl` is a hold = `info`) | pinggateway | authorize | measured for PERMIT; any other decision is UNVERIFIED (DENY is `refused`; INDETERMINATE, NOT_APPLICABLE, ERROR and the rest are `info`) |
| `p1az-hitl` (`INDETERMINATE - HITL challenge ... minted`) | pinggateway | authorize | measured |
| `pinggateway-access` (`OPENIG-HTTP-ACCESS` JSON; 401/403 refused; any other status is `info`, because the line shows no response body and an MCP error can ride in a 200) | pinggateway | gateway | measured |
| `pinggateway-mcp` (`PING-GATEWAY-MCP` JSON) | pinggateway | gateway | measured |
| `pgw-token-found`, `pgw-mcp-call` | privilege-gateway | agent / gateway | measured |
| `pgw-policy-denied`, `pgw-auth-rejected`, `pgw-proxying` (the only evidence of an allow) | privilege-gateway | gateway | measured on the hosted pod log; absent from the local file log for a rejected MCP call |
| `pgw-aiguard-blocked` (`aiguard: blocked mcp response`) | privilege-gateway | privilege | measured |
| `pgw-json-denied` (`MCP/A2A policy denied` JSON), `pgw-json-aiguard` (verdict, `info`) | privilege-gateway | privilege | field names measured, values are examples |
| `siem-policy-decision` (`Index: policy-decision-log`, `Data.Decision`), `siem-aiguard` | privilege-siem | privilege | shape relayed (not read by this folder's authors) |
| `siem-approval` (`agent-approval-log`) | privilege-siem | privilege | **UNVERIFIED** |
| `promptguard-allow`, `promptguard-flagged` (flag is `info`) | promptguard | privilege | measured |
| `mcp-server-validation` (`[time] INFO: token audience validated`) | mcp-server | resource | measured |
| `mcp-server-refused` (any of denied, refused, forbidden, unauthorized, insufficient, invalid, failed, expired, mismatch, rejected, not allowed), `mcp-server-served` | mcp-server | resource | **UNVERIFIED** |

The `privilege-gateway` file log's `time=` prefix format is UNVERIFIED: a line whose time is not an ISO 8601 timestamp is skipped, never given a guessed time. An Elasticsearch document whose `@timestamp` is not ISO is skipped the same way.

**Anchoring (why request text cannot fake a decision).** A line is JSON (it parses as an object) or text. A JSON line is read only through its own fields (`eventName`, `msg`, `Index`), and a text matcher is never run on it; a text matcher sees only the first line of the
entry and starts at the beginning with the product's own prefix (PingGateway's logback prefix `[thread] LEVEL logger @route - `, the logfmt `level=... msg="..."` wrapper, the PingFederate `| tid:` columns) and ends at the end. So a request path that contains
`[P1AZ] DECISION: PERMIT`, or a message body that says `Proxying to:`, is not a decision. Every row's timestamp text is ISO and passes the masker.

**Correlation.** A line is `matchedBy: "id"` when it contains, as a WHOLE token, an id from `correlation` (sub, actor client id, trace id, request ids) of 6 or more characters (shorter ones are ignored for matching, so a sub of `user` marks nothing); any other line in the window is `matchedBy: "window"`.
Lines with no ids in them (the gateway's "Proxying to" line) can only ever be window-matched, so **two runs that overlap in time can interleave** their window-matched rows. Keep a lab's runs apart in time, or read only the `id` rows as evidence of this run.

## Lab matchers (your own decision line)

A lab that writes its own timestamped decision line adds a matcher; nothing in the shared file changes. Matchers run after the built-ins, only on text lines a reader really returned, and cannot create a row without one or choose its origin (it is always `logged`).

```js
const obs = createRunObservability({
  readers: readersFromEnv(),
  matchers: [{
    id: 'lab-decision',                      // unique, lower-case letters, digits and hyphens
    product: 'my-lab',                       // the product id the reader reads (ping_product / demo_service / container name)
    layer: 'resource',                       // one of person agent authorize privilege gateway resource
    basis: 'measured-shape',                 // 'measured-shape' only if you captured a real line; else 'unverified-shape'
    pattern: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z my-lab decision actor=(\S+) outcome=(allowed|refused)$/,   // MUST start with ^, end with $, no m flag
    build: (m) => ({ outcome: m[2], message: `The lab decided ${m[2]} for ${m[1]}`, detail: { actor: m[1] } }),
  }],
});
// the lab logs exactly:  2026-11-22T10:00:03.250Z my-lab decision actor=user-7 outcome=refused
// and lists the product:  layers: [{ layer: 'resource', products: ['my-lab'] }]
```

An unanchored pattern, an unknown layer or basis, a duplicate id, or a missing `build` throws `RunObsError` (`bad_matcher`) when the panel is created. A line that does not match the whole pattern (for example one with text typed by a caller in front of it) is dropped. JSON log lines are not supported for lab matchers yet.

## Masking

Applied to every text field of every row (message, product, host, timestamp text, detail; also `simulated` and `response` rows) before it leaves the server, with the same intent as the collector (`shared/ping-log-collector/vector.yaml`): the values of `Authorization`, `Proxy-Authorization`,
`Cookie`, `Set-Cookie`, `X-Api-Key`, `X-Amz-Security-Token` and `X-Auth-Token` headers; `Bearer`, `Basic`, `DPoP` and `ApiKey` credentials (only a credential-shaped value: "Basic Authentication failed" and "bearer token expired" keep their words); JWTs (`<jwt>`, also a lone header or payload segment);
`sk-`, Slack, GitHub and AWS keys; the values of `client_secret`, `password`, `passwd`, `pwd`, `passphrase`, `secret`, `secret_key`, `private_key`, `api_key`, `client_assertion`, `assertion`, `code_verifier`, `session_id`, any `*_token` (access, refresh, id, subject, actor, auth), and
`token=`, `pass=`, `sid=`, `session=` and `code` parameters (same line, JSON with escaped quotes, and the multi-line dump form); zero-width and other format characters are stripped first so they cannot hide a token; plus IPv4 and IPv6 addresses (`<ip>`), emails, hostnames under known suffixes (`<host>`),
and ids (UUIDs, long hex, long mixed strings) shortened to their first 4 and last 2 characters. Objects are walked to a bounded depth and width, and a value under a secret-looking key is dropped. Tokens a lab shows raw elsewhere (Rule 4) are not shown here.

## Where these logs live and where they stream (Rule 27)

Every lab README says this for its own products, and passes the same to `streams`. For the family's local Ping products:

| Product | Lives in | Streams to |
|---|---|---|
| PingFederate | container stdout (the image tails `audit.log` and `server.log`) | the collector to `ping-logs-pingfederate`, then a SIEM |
| PingGateway | container stdout (logback, access and MCP audit JSON, `[P1AZ]` lines) | the collector to `ping-logs-pinggateway` |
| Privilege agent gateway (local) | `cyonproxy.log` in its log volume | the collector's file source to `ping-logs-privilege-gateway` |
| Privilege hosted gateway and console | the SIEM index `ping-siem-events-v2`, the console Activity Logs | the Privilege SIEM export |
| MCP server, MCP gateway, LLM proxy | container stdout | the collector to `demo-logs-<service>` |
| PingOne (sign-in, Authorize) | the PingOne audit activity API (SaaS) | not shipped by this folder |

## Follow-ups (not in this build)

Until these exist, layer 3 is `not-logged` or `response`, PingFederate sign-in is `not-logged`, and gateway refusal and block rows are `not-logged`.

1. **PingOne audit reader.** A read-only reader for the PingOne audit / activity API for layers 1 and 3. Verify the endpoint and fields against the current PingOne docs first (none is guessed here),
   use a read-only token supplied by the owner, never write.
2. **PingFederate `audit.log` shipping.** Today only `server.log` and `init.log` reach stdout, so the collector does not ship `audit.log` (collector change, owner-run).
3. **Gateway refusal and block line matchers.** To be added as MEASURED once the A2A video session reports the real line shapes.
