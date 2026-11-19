# gateway-trace: "What Privilege did" — the family's one trace panel (Rule 25)

For each call a lab makes to the Privilege gateway, the panel shows the exact request, the exact response, and
the decisions the gateway made in between, in the page, under the lab's Run. One component and one data builder,
so every Privilege demo shows the same thing the same way.

(`shared/trace` is something else: the W3C traceparent helpers. This folder is `gateway-trace`.)

## Files

| File | Vendor to | What |
|---|---|---|
| `GatewayTrace.jsx` | `web/src/gateway-trace/GatewayTrace.jsx` | the panel; imports `../components/JsonPane` (Rule 24) |
| `gateway-trace.css` | `web/src/gateway-trace/gateway-trace.css` | tokens only, no app classes |
| `gateway-trace.test.jsx` | `web/src/gateway-trace/gateway-trace.test.jsx` | vitest + Testing Library; runs in the lab |
| `gatewayTrace.js` | `server/src/gatewayTrace.js` | builds the records server-side; dependency-free |
| `gateway-trace.sha256` | beside the files | byte-for-byte pin; re-pin after any change |

Vendor byte-for-byte; never hand-edit. The lab adds a pin test so a drifted copy fails CI: hash every vendored file and compare it to
`gateway-trace.sha256`. The pin file lists the server file as plain `gatewayTrace.js` beside the web files, so `shasum -c` run in the web
folder fails on it; the test maps that one name to `server/src/gatewayTrace.js` (a worked example: gateway-claims-LAB `scripts/gateway-trace.test.mjs`).
The vendored `gateway-trace.test.jsx` calls `setJsonView` from the lab's `components/JsonPane`, so the lab's JsonPane must export it (the canonical one does).

## Use

Server (Real, through the shared hop): turn capture on, then build the trace from what the hop returned.

```js
import { createRealDoor } from './gatewayClient.js';          // shared/gateway-real, capture is off unless asked
import { traceFromDoor } from './gatewayTrace.js';

const door = createRealDoor({ config, capture: true });
const result = await door.list('my-app', 'caller');            // result.wire = every HTTP exchange, already redacted
res.json({ ...view(result), trace: traceFromDoor(result) });   // rpcMethod: 'tools/call' for a call
```

Server (Mock, a simulated gateway): `mockTrace({ url, authorization, rpc, status, body, decisions, record })` (`rpc` and `body` may be `null` when the simulation has no JSON-RPC message to show; do not invent one). The URL host
must be a non-real one (`.invalid`), and every decision is `checked` because the simulation computed it.
A lab that makes its own HTTP call to the real gateway uses `realTrace(...)` or `failureTrace(...)`.

Page: `<GatewayTrace exchanges={[{ step, title, status, trace }]} source="mock" | "real" />`, placed under the lab's Run.
Optional props: `title`, `basisNote`, and `hot` (a string that replaces the sentence under the heading saying what kind of gateway this is). Use `basisNote`
when the lab's "Real" mode is not the Privilege gateway (a local engine, say), where the default "Real mode shows the actual gateway" would be wrong.

`hot` (an array of key names) is the list of keys both JsonPanes (request and response) stand out. It REPLACES the panel's default list, which is
`["error", "isError", "tools", "result"]` (JsonPane adds its own claim keys to whatever is passed); leave it out and the output is unchanged, so a lab that
vendored an earlier copy and passes nothing behaves exactly as before. The default draws a successful reply's `result` in the same strong style as a
refusal's `error`, which can read as an alert on a 200. A lab that wants a success reply not drawn as an alert passes `hot={['error']}`: the refusal's
`error` stays marked, `result` and `tools` do not. `hot={[]}` marks none of the panel's own keys. Anything that is not an array is ignored (the default applies).

Optional builder options (all additive; leave them out and the output is unchanged):

- `requestHeaders` on `mockTrace`, `realTrace`, `failureTrace`: headers the lab really sends beyond the defaults (`traceparent`, a session header, a
  different `accept`). Names match case-insensitively, so `{ Accept: 'application/json' }` replaces the default `accept`; a `null` value removes a default header (`{ accept: null }` for a lab that sends no `accept`); `undefined` is ignored. Only headers that are safe to
  show: never a key, token or cookie (`assertTrace` still catches a full bearer token). `traceFromDoor` takes its headers from the capture, so it needs none.
- `grant: { label, pass, fail }` on `realDecisions`, `realTrace`, `traceFromDoor`: for a call that is not an MCP tool call (an AI Guard inspection, an LLM
  call) the default words about tools and a grant would mislead. `label` renames the second decision; `pass` and `fail` are a string or `(rpc, body) => string`.
  Outcomes and `basis` are unchanged: only the words are the lab's, so the honesty rule still holds. A reply's own refusal detail still wins over `fail`.

## The honesty rule

The real gateway answers with a status and a body, not a per-check breakdown. So in a real trace every decision is
`inferred` (read from the outcome, and labelled so) or `observed` (read from the response). `checked` is only for a lab's
own simulated gateway. `assertTrace(trace)` returns the problems; every lab test calls it on a real and a mock trace.
Do not word an inferred decision as something the gateway reported.

## What is never in a trace

- The agent key, a real token, a cookie, or a full session id. The hop redacts at capture (`wireRequestHeaders`,
  `wireResponseHeaders`: the auth header becomes its length, the session id is shortened, response headers are an allowlist),
  and every captured string is scrubbed of every configured key. `bearerForDisplay` does the same for a lab that builds its own.
- Anything cut mid-JSON: bodies are shown whole through JsonPane (full view, Form | JSON).

## Decisions it builds (`realDecisions`)

| Reply | Agent key / token | Grant |
|---|---|---|
| 200 | pass, inferred | pass, inferred (lists the tools it saw) |
| 200 with a JSON-RPC error | pass, inferred | `result` fail, observed |
| 401 | fail, inferred | not reached |
| 403 | pass, inferred | fail, inferred |
| other | one `info` line, observed | |

Pass Agent Token (`forward`) is added by a lab that can compare the claims its backend reports; it is `observed`.
