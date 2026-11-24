# model-gateway-sim: the shared mock for the model-gateway labs

The five labs for the 2026-11-21 Privilege model-gateway features (fallback, semantic cache, Model Armor, Bedrock assume role, rate limit) all need the same three small things: a clock they control, a mock LLM provider that can fail in named ways, and an LLM key with a token budget and a Usage counter. They live here once and are vendored byte-for-byte into each lab.

Every state, status code, latency and unit in these files is **the lab's own model, UNVERIFIED against the product**. A lab that shows one of them must say so.

## Files

| File | Vendor to | What |
|---|---|---|
| `labClock.js` | `server/src/model-gateway-sim/labClock.js` | virtual time in ms, moved only by the lab; rejects negative and non-numeric time; `set` can only move forward |
| `providerStub.js` | `server/src/model-gateway-sim/providerStub.js` | mock provider, states `healthy`, `down` (503), `overloaded` (429), `timeout` (504), `slow` (10x latency, and a timeout if that reaches `timeoutMs`); every failure carries `origin: 'provider'`; charges each call's latency to the clock; needs a clock at construction; refuses non-string or over-20000-character prompts |
| `llmKey.js` | `server/src/model-gateway-sim/llmKey.js` | `createLlmKey({ id, budgetTokens })` with a ledger (never overdraws; `limit` is read-only; a zero-token spend always succeeds) and a Usage counter (Requests, From cache, Saved tokens); the key has no credential field |
| `model-gateway-sim.sha256` | beside the lab's pin test | byte-for-byte pin; re-pin after any change |
| `model-gateway-sim.test.mjs` | not vendored | runs here: `node --test shared/model-gateway-sim/*.test.mjs` |

Vendor byte-for-byte, never hand-edit. Each lab adds a pin test that hashes its vendored files and compares them with `model-gateway-sim.sha256` (a worked example: gateway-claims-LAB `scripts/gateway-trace.test.mjs`). A change goes to this folder first, then the pin is regenerated:

```sh
cd shared/model-gateway-sim && for f in labClock.js providerStub.js llmKey.js; do printf '%s  server/src/model-gateway-sim/%s\n' "$(shasum -a 256 $f | cut -d' ' -f1)" "$f"; done > model-gateway-sim.sha256
```

## Not here on purpose

- Trace records: use `shared/gateway-trace` (`gatewayTrace.js`) and `shared/trace` (traceparent).
- Each feature's engine (fallback chain, cache, bucket, IAM evaluator, inspector): that is the lab's own logic.
- Real provider calls: none. This kit makes no network calls.
