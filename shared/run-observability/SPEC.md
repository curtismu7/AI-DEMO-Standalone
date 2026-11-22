# Spec: run observability in the labs (rule 27)

Status: draft for owner go, 2026-11-22. Tier 2 (colleagues and customers use these labs).

## What
Every lab that runs an agent, gateway or token flow shows, for one run, what each layer decided and logged, through the shared
`shared/run-observability/` panel (vendored byte-for-byte, sha256 pin). Six layers in time order: person, agent (OBO), Authorize,
Privilege, agent gateway, resource/MCP server. Each row has an exact timestamp and an origin tag:
`logged` | `simulated` (Mock) | `response` (a decision the lab holds as an API response, never a log) | `not-logged`.

## For whom
SEs presenting live, customers watching, and viewers of the recorded videos. They need to see that the person, the agent acting on
their behalf and every policy point each left a trace, and to see honestly where one did not.

## Acceptance criteria (per lab)
1. The shared files are vendored unmodified: the lab's pin test calls `checkPin(labRoot)` (vendored as `scripts/run-observability-checkPin.mjs`) and an edited copy fails. A lab that reads no logs (Mock only, or `response` rows only) vendors the core `server/src/runObservability.js` and the web files, NOT `runObservabilityReaders.js`, so it exempts no `fetch`/socket in its safety tests; a lab with Real log reading vendors both.
2. The page shows the panel under the lab's Run in Mock AND Real, behind the existing rule-19 toggle (toggle not touched), and passes the current mode as the required `source` prop.
3. Mock: rows are `simulated`, computed from what the lab's own mock actually did; none is shown as read from a log.
   Real: Elasticsearch reader by default (`RUN_OBS_ES_URL`, `RUN_OBS_ES_READ_APIKEY`); unconfigured shows `unreachable` with the reason, never blank.
4. The lab's own server logs each decision it makes (one timestamped line: actor, outcome) so Real has something to read.
5. No secret reaches the browser; `assertRunObservability` passes on a mock and a real (fake-Elasticsearch) record in the lab's tests.
6. README says where the logs live and where they can stream (the text in the shared README), and what is `not-logged`.
7. Lab tests and build pass (real counts); browser proof at 1280 and 375 wide, light and dark, Mock and Real, with long names and an empty state.
8. No Docker socket mount in the lab compose file.

## Unhappy paths
- Elasticsearch unreachable, key wrong or missing: panel shows `unreachable` + reason; the lab keeps working.
- No run yet: "Run the demo" empty state.
- Real mode on but the product writes no line for an event: `not-logged`, never inferred from a missing line.
- Gateway refusal / Part 1 block lines (shapes unconfirmed), Authorize (no log), PingFederate sign-in (audit.log not shipped): `not-logged` or `response`, until the follow-ups below land.
- Hostile input in a log line (tokens, long lines, markup, request text that imitates a decision line): masked server-side, rendered inert, and matchers are anchored so such text never becomes a `logged` decision row.
- A search cut at its cap (Elasticsearch 500 documents, a 2 MB file tail): the layer stays `not-logged` but reads **Not found (partial search)** and says absence is not proof.
- Two runs overlapping in time can interleave window-matched rows; rows matched by an id from the run are tagged `id`.
- Record `source` differs from the page mode: refused on screen.

## Out of scope (follow-ups, owner-gated)
PingOne audit/activity reader (endpoint to be verified; owner supplies a read-only token); shipping PingFederate `audit.log`
(collector change, owner-run); gateway refusal/block matchers (after the A2A video session reports real line shapes); a CI hook for
the shared server test; changing any lab's toggle, scopes or flows.

## Rollout order and gates
A2A (a2a-lab-LAB, hostile-a2a-LAB, meridian-a2a-hop-LAB; privilege-a2a-anthropic-demo-LAB is the video session's), then CIMD, OBO,
SPIFFE. Order of merging: the shared panel PR first, then each lab's PR. Each batch gets an independent `/code-review` of its diffs
before PRs; the owner says go before any merge or deploy.
