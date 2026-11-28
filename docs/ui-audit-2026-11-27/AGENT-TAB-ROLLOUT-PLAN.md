# Rollout plan: live "Agent" evidence tab across the -LAB fleet

Owner draft, 2026-11-28 · branch `audit/ui-consistency-2026-11-27` (PR #695) ·
Reference implementation: `mock-e/web/` in this branch (open questions from the owner are marked **Q**).

## 0. What the feature is (and is not)

One new, **additive** tab per demo — "Agent run" (working name) — that shows a run as an
agent conversation feeding real-time evidence:

- The **chat turn** (You / AI avatars, "Working on it…", reply derived from the run, outcome tag,
  "See evidence →" link) — the pattern customer-agent-LAB already ships (`Turn.jsx`).
- The **real shared evidence components** (`SequenceView`, `MovieReel` re-flowed vertical,
  `StepDetailPanel`) filling in **hop by hop as the run executes** — all four views share one
  `selected` hop. Mock E is the proof (screenshots `mock-h-*.png`, `mock-i-*.png`).

It does **not** replace anything: no existing tab, page, view or behaviour changes. If the tab is
closed, the demo is byte-for-byte what it was. The existing full SequenceView tab, topology tab
and any walkthrough stay exactly where they are.

**Q1**: tab name — "Agent run", "Live run", "Agent", other?

## 1. Fleet inventory (measured 2026-11-28, 110 labs)

| Cohort | Count | Labs | Verdict |
|---|---|---|---|
| **A. Ready now** | 7 | ai-demo-standalone, appfire-agent-governance, customer-agent, meridian-air, pingcli, privilege-gateway-client, privilege-owasp-lab | Already vendor `evidence/` + `hopDetail.mjs` + TopMenu. The tab is a new view over data they already produce. Low risk. |
| **B. Ready with an engine hop feed** | ~10 | id-jag-standalone, idjag-runner, ciba-approval-sequence, hitl-mfa-lab, delegation-lab, obo-lab, meridian-a2a-hop, a2a-lab, hostile-mcp, mcp-gateway-lab (TBC per lab) | Have run engines and TopMenu but vendor no `evidence/`. Need: vendor `shared/evidence/` + emit `demo-hop/1` hops from their existing engine steps (the catalog covers most hop kinds already). Medium effort, medium risk — the engine change is the only invasive part. |
| **C. Diagram-only labs** | ~51 | diagram-studio, ciba-*, gateway-*, cedar-*, stolen-token, wimse, workload-*, session, spiffe, … | Draw `diagram-kit` box/edge diagrams, not hop chains. The Agent tab works if the engine can name hops; otherwise **do not force it** — these get the tab only when their engine is extended, never by faking hops. |
| **D. Not applicable** | ~35 | demo-shelf, demo-map, learning-hub, demo-field-guide, field-notes, coding-agents, pdf-to-md, deploy-test, privilege-map, mcp-discovery, muse, attack-gallery, ping-services-stub, … | Reference/catalog/no-run pages. No engine, nothing to stream. **Excluded** — adding a run tab would be a fake. |

(Rolled up: 110 labs. The 8 labs without TopMenu — demo-field-guide, deploy-test, learning-hub,
mcp-demo-client-privilege, mcp-resource-server, pdf-to-ml, privilege-k8-kits, privilege-map —
are mostly in cohort D anyway; cohort B/C labs that lack TopMenu get it first per the existing
standard.)

## 2. What must be true before a lab gets the tab (gate, not wish)

1. The lab's engine can emit `demo-hop/1` hops **incrementally** (one per step) — this is the
   existing evidence contract (`shared/hop-detail/`), already met by all 7 cohort-A labs.
2. The lab vendors `shared/evidence/` byte-for-byte (sha256 pins) and `top-menu`.
3. The tab is a **separate route/view**; default route unchanged. Bookmarks, deep links, tests
   and muscle memory are untouched.
4. Nothing is deleted: the old sequence/evidence views stay for comparison until the owner
   retires them explicitly.
5. Mock-only at first: the live reveal works from the engine's existing step events; **Real-mode
   labs stream from whatever they stream today** — if a lab's real mode has no step stream, its
   Agent tab shows the completed run (no fake streaming). Ever.

## 3. What we will NOT do (do-not-break contract)

- No change to `SequenceView`/`MovieReel`/`StepDetailPanel`/`lanes.js` semantics — the live feed
  is the parent slicing `hops` (Mock E pattern: `hops.slice(0, revealed)`), not a component change.
- No new colours, no restyled shared controls, no new CSS outside the lab layout file.
- No engine behaviour change: same decisions, same verdicts, same redaction. The tab renders
  what the engine already produces, as it produces it.
- No lab outside cohorts A/B touched in v1.
- Every lab ships with its existing test suite green plus one new test: "tab exists, default
  route unchanged, old views intact".

## 4. Rollout order (small, reversible, one PR per lab)

- **Wave 0 (done)** — Mock E reference in this branch; owner sign-off on the pattern. ✅
- **Wave 1 (1 pilot)** — customer-agent-LAB: it invented the Turn pattern and has the richest
  engine. The tab there is mostly rearranging existing pieces. Gate: `npm run test:unit`,
  UI build, one Playwright pass (idle → mid-run → done → deny).
- **Wave 2 (rest of cohort A, 6 labs)** — mechanical: add the tab, feed the engine's hop stream
  through the same `revealed` slice. One lab per PR, per-lab revert = close the PR.
- **Wave 3 (cohort B, ~10 labs)** — add evidence vendoring + hop emission. Each lab needs a
   hop-kind review (add catalog entries for its own kinds first, per the hop-detail README).
- **Waves 4+ (cohort C)** — only per-lab, only when the owner asks for that lab by name.
- **Cohort D** — never, unless the lab gains a real engine.

After Wave 2: promote the Agent-tab shell (the turn + live-slice wiring, ~150 lines) to
`shared/agent-run/` so waves 3+ vendor it instead of copying (the "shared means change it
once" rule).

## 5. Per-lab work estimate

| Cohort | Effort per lab | Risk |
|---|---|---|
| A | 0.5–1 day (tab + wiring + tests) | Low — additive view only |
| B | 2–3 days (evidence vendor + hop emission + tab) | Medium — engine touch |
| C | case by case | — |
| D | none | none |

## 6. Open questions for the owner

- **Q1** tab name (§0).
- **Q2** Wave 1 pilot: customer-agent-LAB as proposed, or a quieter lab first?
- **Q3** In cohort-B labs that already have their own sequence drawing, does the Agent tab
  replace it (after a soak period) or do both live forever?
- **Q4** Presenter/Talk-track interplay: should Present mode auto-open the Agent tab?
