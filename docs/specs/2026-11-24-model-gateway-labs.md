# Model-gateway labs: shared kit and five lab specs

**Status:** draft for owner review   **Owner:** Curtis Muir (decides)   **Source:** the 2026-11-21 vendor release notes (the only source so far); plan: `docs/PRIVILEGE-MODEL-GATEWAY-DEMOS-PLAN.md`

Each lab section below is one page, to be copied into its repo at creation as `docs/spec.md`. Everything the release notes do not say is **UNVERIFIED (model)** and the lab shows that label.

## Owner decisions (2026-11-24)
- Five separate labs; one release per wave (B, C, D).
- Assume Role = an LLM key reaching Bedrock under an assumed IAM role (release notes), with a second tab for Vertex AI as the gateway's own service account.
- Source: the release notes only. Build from them; label the rest.
- Real mode: possible for some features, which ones not yet named. Until named, every lab ships Mock with a disabled Real toggle that says why.

## Shared kit: `shared/model-gateway-sim/` (this PR)
**Goal:** one clock, one mock provider and one key model for all five labs. **Acceptance:** `node --test shared/model-gateway-sim/*.test.mjs` passes; the provider refuses non-string and over-20000-character prompts; the ledger never overdraws; the key has no credential field; the pin file matches the files. **Unhappy paths:** negative or NaN time, unknown provider state, negative budget, a hand-edited vendored copy (lab pin test fails). **Out of scope:** trace records (use `shared/gateway-trace`), each lab's engine, any network call.

Common acceptance for every lab (Demo tier): Mock works offline with a banner naming what is simulated; Mock/Real toggle visible, Real disabled with a plain reason when no tenant; `GET /api/health` returns `demo-health/1`; `doctor`, Reset, presenter mode, talk track; `GatewayTrace` on every hop; what-this-run-left-behind panel; JsonPane for all JSON; diagram loaded by name from diagram-studio data; zero outbound calls (netguard self-test); readable at 375px in dark and light; `restart: unless-stopped`; `ci.yml` on Node 26; conformance `--new` has 0 FAIL.

## Lab 1: privilege-model-fallback-LAB (wave B)
**Goal:** show an LLM key answering from a second model when its first is down, overloaded or out of budget, within the fallback's own budget.
**Acceptance (one test each):**
1. Primary healthy: primary serves, no fallback attempt in the trace.
2. Primary down, overloaded, then out of budget: the fallback serves and the response names the serving model; the trace lists both attempts with their latency.
3. Fallback on a different provider serves.
4. Fallback budget exhausted as well: a named refusal that says which budgets ran out, never a blank page.
5. The fallback's spend is charged to its own ledger, not the primary's.
6. The Bedrock assumed-role model works as a fallback target (once lab 4's evaluator exists; until then a stub target, labelled).
**Unhappy paths:** both providers down; zero budget; an empty or one-model chain (no fallback configured); prompt over the size limit. **UNVERIFIED (model):** what "overloaded" means (429 or 5xx), retry before fallback, mid-stream failure, whether the guard re-runs on the fallback's answer. **Out of scope:** real provider calls; streaming.

## Lab 2: privilege-semantic-cache-LAB (wave D)
**Goal:** show per-key semantic caching: similar prompts answered from cache, with the Usage view (Requests, From cache, Saved).
**Acceptance:** exact repeat hits; a paraphrase above the strictness hits and shows its similarity score; an unrelated prompt misses; moving the strictness control flips the same pair between hit and miss; a hit after the TTL (on the lab clock) misses; Usage counts match the calls; two keys with different embedding settings never share an answer.
**Encoder:** a deterministic stand-in (hashed character n-gram vectors, cosine), labelled "not a real embedding model", so tests are stable.
**Unhappy paths:** empty prompt; huge prompt; strictness outside 0 to 1; TTL zero; Redis stand-in unavailable (named error, UNVERIFIED which behaviour the product has). **UNVERIFIED (model):** how Saved is computed, whether the cache is scoped by user or only by key, whether the guard runs before or after the lookup. The cross-user leak scenario is **not built** until the owner confirms the scoping; the page carries an open-question card instead. **Out of scope:** real embeddings or Redis.

## Lab 3: privilege-model-armor-LAB (wave C)
**Goal:** show one external inspector per key (Model Armor, with Azure AI Content Safety and Bedrock Guardrails as stub alternatives) and the authority cap that holds it advisory.
**Acceptance:** a clean prompt passes; an injection, a sensitive-data prompt, a sensitive-data response and a malicious URL each produce a finding and, when enforcing, the gateway's own refusal; with the cap set to advisory the same finding is logged and the call goes through; switching back to enforcing blocks again; selecting a second inspector replaces the first (one per key); inspector unreachable behaves per the chosen fail-open or fail-closed setting; a slow inspector hits its timeout.
**Build:** fork of `ai-guard-sidecar-LAB` per the rulebook's fork section (copy, strip identity, "fork of" line, replace pinned tests).
**Unhappy paths:** inspector returns malformed findings (treated as a named error, not a pass); oversized prompt; two inspectors configured (refused). **UNVERIFIED (model):** filter names (check Google's public docs), fail-open or fail-closed availability, timeout value. Stub rules never claim Google's detection quality. **Out of scope:** calling Model Armor.

## Lab 4: privilege-bedrock-assume-role-LAB (wave C)
**Goal:** show an LLM key that stores no AWS credential reaching Bedrock under an assumed role, with metering, AI Guard and audit still seeing the call; plus a Vertex service-account tab.
**Acceptance:** the key object shows no credential field in assumed-role mode and a stored key in the old mode; success serves the call and the trace shows metering, guard and audit hops; each failure has its own named result and fix: wrong trust principal, external ID mismatch, missing invoke permission, model not enabled in the region, expired session (refreshed on the lab clock); the evaluator is a pure function of (trust policy, external ID, permission policy, model, region, now) and is tested on a table of cases; Vertex tab: service account with and without the needed role.
**Unhappy paths:** malformed or oversized policy JSON (named error, never evaluated by `eval`); wildcard principals; empty external ID where one is required. **UNVERIFIED (model):** console fields, session length, error text. IAM snippets use placeholder ids only; no real account id or role name. **Out of scope:** AWS or GCP calls; creating roles (Real mode, if any, is owner-run and read-only).

## Lab 5: privilege-rate-limit-LAB (wave B)
**Goal:** show a refilling bucket, the in-flight cap, cluster sharing through Redis and the app-wide MCP and A2A caps.
**Acceptance (all on the lab clock):** a burst drains the bucket and it refills continuously (tokens at time t are a tested function); the same load against a fixed window resets all at once, shown side by side; slow calls hold in-flight slots and the next call is refused at a low request rate; two nodes without sharing each allow the full limit, with a shared store they allow it once; an MCP or A2A app-wide cap is separate from the per-key cap and one agent can exhaust it for the others; a refusal records what the client sees.
**Unhappy paths:** zero or negative limits (refused at config); burst larger than capacity; clock set backwards (refused); Redis stand-in unavailable. **UNVERIFIED (model):** units and parameters, the client's refusal shape, whether a rate-limit refusal may trigger fallback (it must not; the page asks, it does not answer), Redis outage behaviour. Spike protection is shown only as the bucket's burst; **no baseline-jump detector** (not in the release notes). **Out of scope:** real traffic.

## Not in this spec
Ports, repos, catalog ids, diagram-studio entries (one per lab, added in the diagram-studio repo before each lab), and the Phase E ship steps. Each needs its own owner step.
