# hop-detail: the `demo-hop/1` format and the hop catalog

Shared by every -LAB that draws a token chain (sequence view, movie reel, step detail). Owner decision 2026-11-08: one shared catalog, **vendored** (copied) into each app, never imported across repos.

Files:

| File | What it is | Copy to |
|---|---|---|
| `hop-catalog.json` | Teaching text per hop kind: title, narrative, spec (mandate / why / failure / refs), the one-line reel fact | `server/src/vendor/hop-catalog.json` |
| `hopDetail.mjs` | `enrichHop`, `claimDiff`, `redact`, `validateHop` (no dependencies) | `server/src/vendor/hopDetail.mjs` |
| `hopDetail.test.mjs` | The tests the copy must keep passing | `server/test/hopDetail.test.mjs` |

Each copy starts with a header line naming this folder and the commit it came from. Change the text here first, then re-copy.

## `demo-hop/1`

A hop is one arrow in the chain. The engine already fills the **raw** fields; `enrichHop` adds the **teaching** fields from the catalog and the tokens.

```js
{
  // raw (engine)
  n: 4,                               // 1-based order in the run
  kind: 'token-exchange',             // catalog key
  label: 'Token exchange (RFC 8693) ...', // engine's own sentence, may carry cast names
  from: 'bff', to: 'idp',             // actor ids (see Actors)
  verdict: 'ok',                      // ok | deny | held | obligation | skip
  note: 'optional engine note',
  mock: true,
  traceparent: '00-...-...-01',
  request:  { method, url, headers, body },   // redacted before it leaves the server
  response: { status, headers, body },

  // teaching (enrichHop)
  title: 'Exchange',                  // short, for reel frames and arrows
  narrative: 'What happened, one or two sentences.',
  fact: 'scope narrowed 4 -> 1',      // one line for the reel frame
  spec: { mandate, why, failure, refs: [{ label: 'RFC 8693 §4.1', url }] }
     // or { none: true, why, failure } when no specification governs the hop
  stages: [{ name: 'Audience', result: 'pass', note: 'gateway.example' }], // gateway filter chain, optional
  decision: { outcome: 'PERMIT', by: 'authorize policy', reasons: ['...'] }, // optional
  claimDiff: { before: {...}, after: {...}, changed: ['aud', 'scope', 'act'] }, // optional
  kv: [['grant_type', 'token-exchange']],  // optional extra facts
}
```

### Actors

`browser`, `page`, `agent`, `bff`, `idp`, `mcp-as`, `gateway`, `authorize`, `mcp`, `a2a`, `hitl`, `privilege`, `registry`, `credentials`. An app may add its own; the screens fall back to a neutral lane colour for an unknown id.

### Rules

- Every `kind` an engine can emit has a catalog entry. A hop no specification governs says so (`spec.none: true`) instead of being left out.
- Catalog text has no tenant ids, client ids, real hostnames or customer names. Hosts are `.example` or `.invalid`.
- Secrets and keys are always `[write-only]`, in both modes: `client_secret`, `password`, `secret`, API keys (`api_key`, `x-api-key`), `private_key`, `code_verifier`, and Basic credentials. Keys match in any spelling (`clientSecret`, `client-secret`). JSON-string bodies, URL fragments and header pairs are walked too; the walk is depth-limited and cycle-safe. **Mock mode** keeps MOCK tokens raw, because the rulebook shows tokens raw for teaching (`enrichHop(hop, catalog, extra, { tokens: 'raw' })`). **Real mode** redacts: token-bearing keys (`access_token`, `id_token`, `refresh_token`, `subject_token`, `actor_token`, `assertion`, `client_assertion`, `authorization`, `cookie`, `set-cookie`) become `[redacted]`, any JWT-shaped string becomes `[redacted-jwt]`, `client_secret` and `password` become `[write-only]`. Decoded mock token claims are shown separately (and labelled MOCK).
- `validateHop` returns a list of problems; an empty list means valid.
