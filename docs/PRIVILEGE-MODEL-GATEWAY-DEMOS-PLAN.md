# Plan: demos for the new Privilege model-gateway features (2026-11-23)

Status: PLAN, not built. The build is Tier 2 (colleagues will present it): spec first, independent review, owner "go" before any repo or publish.

Source: the vendor release notes "Stable, released November 21, 2026", pasted by the owner on 2026-11-23. They are the only source so far. Anything the notes do not say is marked **UNVERIFIED (model)** and the lab must label it the same way.

Owner decisions 2026-11-23: five separate labs; Model Armor is Google Cloud (GCP) Model Armor. **Correction:** the owner first said Assume Role meant the AgentCore account connect; the release notes say it is an LLM key calling Bedrock under an assumed IAM role. This plan follows the release notes. Say so if the first answer was meant.

## 1. What the release notes say (the five features)

| Feature | What the notes say | Existing coverage |
|---|---|---|
| LLM Model Fallback | An LLM key names a second model to answer with when its first is **down, overloaded or out of budget**. It can be a different provider. The fallback **carries its own budget**, so the agent keeps serving within a known ceiling. | None |
| Semantic Cache | LLM keys reuse earlier answers for semantically similar prompts. **Each key names its own embedding model and vector Redis**, sets **match strictness and TTL**. The Usage tab shows **Requests, From cache, Saved**. | None |
| Model Armor in AI Guard | A key's external guardrail can be **GCP Model Armor, Azure AI Content Safety or Amazon Bedrock Guardrails** (besides the self-hosted ML sidecar). **One inspector per key**, with an **authority cap** that can hold it **advisory** while it is evaluated on live traffic. | `ai-guard-sidecar-LAB` covers only the generic sidecar contract |
| Bedrock Assume Role | An LLM key reaches Bedrock **under an assumed IAM role**: **no provider credential stored on the key**; **metering, AI Guard and audit intact**. Also works as a **fallback target**. (Vertex service accounts are the sibling feature in the same bullet.) | None. `agentcore-pingone-demo-LAB` is about agent identity, not this |
| Rate Limit and Spike Protection | Request-rate caps run on a **continuously refilling bucket**; an **in-flight cap for LLM calls**; limits can be **shared across the gateway cluster through Redis**; **MCP and A2A applications get their own app-wide RPM and max-concurrent caps**. | None for these |

Out of scope (in the same release, not requested): Databricks/Vertex AI platform agents, Gemini Live, MDM onboarding. Ask if any should be added.

The common thread: these act on the **LLM key** and the model call. Our ~20 Privilege labs cover the MCP tool call. That is the gap.

## 2. Decision: five separate labs

Each is a Demo-tier, mock-by-default lab (own repo, port, shelf entry, catalog id). Claim ports one at a time from `npm run ports -- --next` in demo-shelf-LAB (7836 was next free on 2026-11-23); nothing is claimed yet.

| Lab (proposed name) | Design | Pattern to copy |
|---|---|---|
| `privilege-model-fallback-LAB` | 3.1 | `privilege-gateway-client-LAB` (verdict first, GatewayTrace) |
| `privilege-semantic-cache-LAB` | 3.2 | `intent-console-lab-LAB` (stand-in encoder, doctor-checked scenarios) |
| `privilege-model-armor-LAB` | 3.3 | `ai-guard-sidecar-LAB` (fork per the rulebook's fork section, strip identity) |
| `privilege-bedrock-assume-role-LAB` | 3.4 | `salesforce-privilege-LAB` (scripted failures and fixes) |
| `privilege-rate-limit-LAB` | 3.5 | `privilege-logging-LAB` (what each decision logs) |

Shared, built once and vendored: the mock provider stub (healthy, down, overloaded, over budget, timeout, slow), an LLM-key object with a Usage view, the request-trace shape, one diagram-studio entry per lab. Staging: Fallback and Rate Limit first (they interact), then Assume Role (fallback target), Model Armor, Semantic Cache.

## 3. Per-lab design

Every lab: Mock/Real toggle (rule 19), simulation banner (rule 2), `GatewayTrace` on each hop (rule 25), a "what this run left behind" log panel (rule 27), JsonPane for JSON (rule 24), diagram from diagram-studio data (rule 17), no outbound calls (netguard). The primary object on every page is an **LLM key** with a small config form, because every feature is configured per key.

### 3.1 LLM Model Fallback
Story: the primary model fails and the request is answered by the key's second model, within the fallback's own budget.
Scenarios:
- primary healthy: no fallback.
- primary **down**: fallback answers; trace shows both attempts and which model served.
- primary **overloaded**: fallback answers.
- primary **out of budget**: fallback answers.
- fallback is a **different provider**.
- **fallback budget exhausted** too: a named refusal, never a blank page (rule 23). This shows the "known ceiling".
- fallback target is a Bedrock assumed-role model (links to 3.4).
UNVERIFIED (model): what counts as "overloaded" (429 or 5xx?), whether a retry comes first, behaviour mid-stream, whether the guard re-runs on the fallback's answer, how the response names the model that served it.

### 3.2 Semantic Cache
Story: a similar question is answered from the key's cache; the Usage tab shows the saving.
Config shown per key: embedding model, vector Redis, match strictness, TTL (the four things the notes name).
Mock encoder: a deterministic stand-in labelled as not a real embedding model, so tests are stable.
Scenarios:
- exact repeat: hit. Paraphrase: hit. Unrelated: miss.
- a strictness control moves the threshold; the same pair flips hit/miss.
- TTL expiry: miss.
- Usage tab: Requests, From cache, Saved update after each call.
- two keys with different embedding models and Redis do not share answers.
UNVERIFIED (model): how Saved is computed (tokens? cost?), whether the cache is scoped by user or only by key (the leak question: two principals on one key), whether the guard runs before or after the lookup, what a Redis outage does. Do not show a leak scenario until the owner confirms the scoping; if unknown, show it as an open question card, not a result.

### 3.3 Model Armor in AI Guard
Story: the key's single external inspector is Model Armor; a finding blocks the call and the refusal is the gateway's own.
Scenarios: clean prompt; injection or jailbreak; sensitive data in prompt; sensitive data in response; malicious URL (filter names from Google's public docs, to re-check); the inspector unreachable (fail-closed vs fail-open as the two configs, UNVERIFIED which the product offers); slow inspector times out.
From the notes (sourced): one inspector per key; a selector swaps in Azure AI Content Safety or Bedrock Guardrails (stub decisions only); **authority cap**: switch the inspector to **advisory** and the same finding is logged but not blocked, then back to enforcing. That advisory-versus-enforcing pair is the page's main lesson ("evaluate on live traffic without risk").
Stub rules, never a claim about Google's detection quality. Real mode: owner-run with a GCP project; credentials write-only.

### 3.4 Bedrock Assume Role
Story: an LLM key that stores no AWS credential still reaches Bedrock; the gateway assumes a role, and metering, AI Guard and audit still see the call.
Scenarios:
- key with a stored provider key versus key with assumed role: the key object shows no credential in the second (sourced).
- success: role assumed, call served, usage metered, guard ran, audit entry written.
- trust policy names the wrong principal.
- external ID mismatch (our own notes record a silent `failed to assume role` for a related AWS account connect; do not claim it is the same behaviour here).
- role lacks Bedrock invoke permission for the model.
- model not enabled in the region.
- session expires and is refreshed.
- used as a fallback target (links to 3.1).
Optional second tab if the owner wants it: Vertex AI as the gateway's own service account (same story, GCP).
UNVERIFIED (model): the role/trust/external-ID setup fields in the console, the session duration, the error text. Real mode: owner-run, read-only. IAM snippets use placeholder account ids only.

### 3.5 Rate Limit and Spike Protection
Story: callers share a gateway; a burst or a slow-call pile-up is stopped without starving the rest.
Scenarios, each with a load generator and a live chart (use the `dataviz` skill):
- **continuously refilling bucket**: send a burst, watch tokens drain and refill smoothly. Contrast with a fixed window, where a limit resets all at once. This is the "spike protection" lesson; the notes define spike protection no further, so do not invent a baseline-jump detector.
- **in-flight cap for LLM calls**: slow calls hold slots; the next call is refused though the request rate is low.
- **cluster sharing via Redis**: two gateway nodes, with and without shared limits; without it a client gets double the limit.
- **MCP and A2A apps**: app-wide RPM and max-concurrent caps, separate from the per-key caps; one agent can exhaust the app's cap for the others.
- the refusal the client sees (status, retry hint): UNVERIFIED (model) until sourced.
UNVERIFIED (model): bucket parameters and units, what the client receives, whether a rate-limit refusal can trigger fallback (it must not, or the limit is bypassed; show as an open question), Redis outage behaviour.

## 4. Open questions (blockers marked)

1. **Blocker: more source.** The release notes give the shape, not the numbers or messages. Console screens, swagger or a tenant with these on would turn UNVERIFIED items into sourced ones. Without them the labs stay a model of the notes.
2. Real mode: is any tenant or node running this release? If not, Mock only everywhere.
3. Assume Role: AgentCore reading (first answer) or LLM-key reading (release notes)? This plan assumes the notes.
4. Include Vertex service account as a second tab in 3.4?
5. Include the other release items (Gemini Live, MDM onboarding, Databricks/Vertex agents) later?

## 5. Build steps and done

Per lab, in the order of section 2. Use the `standalone-demo` skill and `~/Development/STANDALONE-RULES.md`; `spec-first` spec saved in each new repo; work in a worktree per lab; heavy tests on the Air (`air-test`); no AI attribution; GitHub account `curtismu7`.

0. **Sourcing**, once for all five: answer section 4, produce "what we know and how we know it" per feature.
1. **Core**: engine and stub providers, Node 26 tests with real counts (one per scenario), hostile input (huge prompts, bad thresholds, negative limits), netguard self-test. Independent reviewer reruns from a clean clone.
2. **Web**: verify in a real browser, desktop and 375px, dark and light, long names and empty states; read the screenshots.
3. **Integration**: shelf entry, catalog id (owner assigns), `content-pack.json`, `GET /api/health`, doctor, Reset, presenter mode, talk track, `ci.yml`, history scan 0, gitleaks, conformance `--new`, Privilege Shelf card, `RELEASE_NOTES.md`, `UPDATES.md`, VERSION minor bump.
4. **Ship**: repo creation (one approval each) and publish only after the owner says go. Verify through the proxy URL in a browser.

Done: everything above evidenced (test counts, screenshots, conformance output); every behaviour sourced or labelled UNVERIFIED; no scenario shows a result the product was not seen or described to produce.

## 6. Risks

- **Invented behaviour** is the main risk. Mitigated by section 3's UNVERIFIED lists and by step 0.
- **Interactions** (fallback, rate limit, cache, guard) are not specified in the notes; each lab states its assumption on its page.
- **Scope**: five repos means five ship checklists. Cut order if needed: Fallback, Rate Limit, Assume Role, Model Armor, Semantic Cache.
- **Shared-code drift**: the vendored stub and trace shape must stay byte-identical; copy from one canonical place.

## 7. Full build plan (2026-11-24)

Ground rules for every phase: `standalone-demo` skill and `~/Development/STANDALONE-RULES.md`; one worktree and one branch per lab, one writer per repo; subagent prompts name the worktree path and say: check skills first, use the `curtismu7` account, no AI attribution, heavy tests on the Air (`air-test`, `git add` new files first). Tier 2: `spec-first` spec in each repo, a test for each bug fix, local gate output pasted, independent `/code-review` of the diff before merge. Repo creation needs owner approval each time; the owner sets `FORBIDDEN_STRINGS`; publish only after the owner's go. Stack: Node 26, ESM, Express, React, Vite, npm workspaces (`server/`, `web/`), `node --test test/*.test.js`.

### Phase 0: sourcing (blocks everything below)
The owner sends console screens, swagger or tenant access, and says whether any tenant runs this release. Output: one page per feature saying what is known and how, with a source for each behaviour or an UNVERIFIED label; the Mock-only or Real answer; the settled Assume Role reading.

### Phase A: shared foundation (one PR in AI-DEMO-Standalone, before any lab)
1. `shared/model-gateway-sim/`, vendored byte-for-byte into each lab: mock LLM provider stub (healthy, down, overloaded, over budget, timeout, slow), LLM-key object with a Usage view, a lab clock (tests run on virtual time), the request-trace shape (`traceparent` per hop, feeding `GatewayTrace`).
2. One diagram-studio entry per lab (new labs load diagrams by name, rule 17).
3. Five one-page specs with acceptance criteria and unhappy paths.
4. Test for the shared kit and a vendoring drift check.

### Phases B to D: per-lab work packages
Each lab: pure-function engine on the lab clock with a table-driven test per scenario; server API; web pages; docs and scripts.

| Wave | Lab | Engine | Web | Pattern to copy |
|---|---|---|---|---|
| B | `privilege-model-fallback-LAB` | Ordered chain per key; triggers down, overloaded, out of budget; per-model budget ledger; names the serving model; named refusal when the chain and budgets are exhausted | Key form, scenario buttons, attempt-by-attempt trace, budget meters | `privilege-gateway-client-LAB` |
| B | `privilege-rate-limit-LAB` | Refilling token bucket vs fixed window; in-flight semaphore; two-node cluster with and without a shared Redis stand-in; app-wide MCP/A2A caps | Sliders, load generator, live chart (`dataviz` skill), cluster view | `privilege-logging-LAB` |
| C | `privilege-bedrock-assume-role-LAB` | Pure IAM evaluator (trust policy, external ID, permission policy, model access, region, session expiry); key object with no credential; hops show metering, AI Guard and audit still firing | Stored credential vs assumed role, failure scenarios with fixes, copy-paste IAM snippets (placeholder ids only) | `salesforce-privilege-LAB` |
| C | `privilege-model-armor-LAB` | Inspector adapter with stub inspectors (Model Armor, Azure AI Content Safety, Bedrock Guardrails); one per key; authority cap enforcing vs advisory; fail-open vs fail-closed | Prompt and response panes, findings, enforcing/advisory switch, inspector-down case | Fork of `ai-guard-sidecar-LAB` (strip identity, honest "fork of" line, replace its pinned tests) |
| D | `privilege-semantic-cache-LAB` | Stand-in encoder (deterministic n-gram vectors, labelled not a real embedding model); per-key store; strictness; TTL; Requests / From cache / Saved counters | Per-key config, paraphrase tester, threshold slider, Usage tab | `intent-console-lab-LAB` |

Every lab (Demo tier): Mock/Real toggle and banner (Real disabled if no tenant), stories as data with `{{cast}}` tokens, Story mode (`story-mode` skill), TopMenu, JsonPane, "what this run left behind" panel, `doctor`, Reset, presenter mode, talk track, `content-pack.json`, `customer.config`, workspace id, `GET /api/health` returning `demo-health/1`, Dockerfile and compose (127.0.0.1 publish, `restart: unless-stopped`, non-root), `ci.yml` on GitHub-hosted Node 26.

### Phase E: integration and ship (strictly one lab at a time)
These steps touch shared files (ports registry, `nginx.conf`, `VERSION`, release notes), so parallel PRs would conflict. Per lab, in the rulebook's order: (1) claim a port (`npm run ports -- --next`) and a board row; (2) create the repo (owner approval), single clean commit, history scan 0, gitleaks clean, conformance `--new` 0 FAIL, owner sets `FORBIDDEN_STRINGS`, CI green; (3) shelf registry PR; (4) AI-DEMO-Standalone PR (lab-proxy route, submodule pin); (5) release (VERSION minor bump, `RELEASE_NOTES.md`, `UPDATES.md`; owner decision 2026-11-24: **one release per wave**, so waves B, C and D each get one bump covering that wave's labs); (6) local proof through the shelf tile and in a browser at `https://local.ping-devops.com:8443/<lab>/`, logged in `SHELF-START-SWEEP.md`.

### Gates per lab (evidence pasted)
Real test counts on Node 26 (one per scenario, mutation of each core behaviour, hostile input such as huge prompts, negative limits, bad thresholds and malformed trust JSON, netguard self-test with zero outbound calls); Playwright at desktop and 375px, dark and light, long names and empty states, screenshots read; every behaviour sourced or UNVERIFIED with the same wording in banner, README and talk track; an independent reviewer reruns from a clean clone.

### Order
Phase 0, then A, then B (Fallback and Rate Limit in parallel), then C (Assume Role and Model Armor in parallel), then D (Cache). Phase E follows each merge. Fallback uses Assume Role only as an optional target, so B does not wait on C. Rough size: foundation M; Fallback M; Rate Limit L; Assume Role M; Model Armor M; Cache M.

## 8. Additional features: extend existing labs (2026-11-24)

Source: `docs/privilege-feature-demo-options-2026-11-24.md`, on branch `docs/privilege-demo-options` (not yet on `main`; written by another session). It concerns a **different release list**: the 2026-11-02 list tracked in `standalone/gateway-claims-LAB` (entitlement-aware discovery, aggregate cap, OBO redeem, scope layers, hold). None is measured on our tenant; the gateway-image claims are read from binaries and unverified. These items are **not new labs**: each is a mock tab or story added to an existing lab, labelled unverified, which avoids the full standalone rulebook.

| # | Feature | Where | Mock work | Real run needs |
|---|---|---|---|---|
| 1 | Entitlement-aware discovery (two keys, two tool lists) | `privilege-gateway-client-LAB` | Mock tab "Ping claim, unverified" | A second, lower-entitled agent key (tenant write) |
| 2 | Aggregate cap (one cap across calls) | `gateway-claims-LAB`, new tab | Mock burst until first refusal | A low-cap test key and a small burst |
| 3 | OBO redeem (one token) | `gateway-claims-LAB` OBO tab or `pf-privilege-obo-LAB` | Mock "redeem" step | A real PingFederate token acting for a user |
| 4 | Hold: a rejected approval is not held again | `ciba-approval-sequence-LAB` or story S04 in `privilege-gateway-client-LAB` | Mock | A real held call |
| 5 | Scope layers | `gateway-claims-LAB` | Re-run the measured tiers on the new image and compare tool counts | A quick live rerun (cheapest real measurement) |
| 6 | SPIFFE workload identity to a door | `spiffe-issuer-LAB` | Nothing to build; verified | Nothing |
| 7 | Support P1 time-boxed Salesforce access | `salesforce-privilege-LAB` (3.14) | Nothing to build | One open check: does the end time end access by itself? |

Build approach for #1 to #5: same rules as above for extending an existing lab (keep its Mock/Real toggle and unverified labels, claim only what a real run showed, worktree per lab, browser check). Real measurements only after the owner's go in the conversation. Owner decisions 2026-11-24: #1 to #5 are in scope as mock tabs (#4 and #5 together as one item); #6 and #7 need no build. Start order for the real measurements is still open; #5 is the suggested first, and every real run waits for the owner's go.

## 9. Build status and never-repeat lessons (2026-11-24)

### Where the five labs stand
All five repos are public under `curtismu7`, each with a step-1 core on `main` and a step-2 web PR (open, under review). Ports are claimed on the board and provisional until the shelf registry PR (step 3).

| Lab | Port | Notes |
|---|---|---|
| `privilege-model-fallback-LAB` | 7836 | |
| `privilege-rate-limit-LAB` | 7837 | |
| `privilege-bedrock-assume-role-LAB` | 7838 | includes the Vertex tab |
| `privilege-model-armor-LAB` | 7846 | moved from 7839 |
| `privilege-semantic-cache-LAB` | 7847 | moved from 7840; no cross-user leak scenario, scope is an open question |

The diagrams (`model-fallback`, `semantic-cache`, `model-armor-inspector`, `bedrock-assumed-role`, `rate-limit-bucket`) are merged in diagram-studio-LAB (`c662412`). Each lab pins its exported copy; re-export after any diagram change.

### Never-repeat lessons
Found by independent `/code-review` of the first labs; each was copied into the next lab before it was caught. Every lab's `CLAUDE.md` carries the same list.

- **Ports:** before claiming a port, check running containers and compose files (`docker ps`), not only the shelf registry. The `ap-*` labs run on 7839 to 7843 and are not in the registry; two claims had to move.
- **Docker:** a Dockerfile `COPY` source must not be excluded by `.dockerignore`. A compose test checks every COPY source, and a real OrbStack build is the proof; a text grep is not.
- **Branding:** the first story and talk-track load sends no `vertical`; a default parameter that turns undefined into `retail` hides the configured customer.
- **Hash scenarios:** Reset, mode switch and vertical change clear the scenario hash. A page runs a hash scenario only on a deliberate navigation, so Reset does not re-run it.
- **Mock button:** pressing the already-active Mock button changes nothing.
- **Workspace ids:** the client pattern equals the server's, and the random fallback fills its array in place (`Uint8Array.map` returns a new array).
- **`npm run reset`:** it takes a workspace id and sends `X-Workspace`; otherwise it resets only `default`.
- **Netguard:** allow literal IPs for an opted-in bind; the guarded `dns.lookup` otherwise blocks them.
- **Shortcut keys:** ignore Ctrl, Cmd and Alt, repeats and focused controls.
- **Tests:** they pass with and without `web/dist`. Static scans skip `.github/` and the shared attribution script.
- **Reading stored runs:** presenter and link code uses the stored run's real field names, with a test that has a run present.

