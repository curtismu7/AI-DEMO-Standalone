# UI check baseline, 2026-11-10

First full run of the per-page checker (`scripts/check-ui-patterns.mjs`) over every app in the meta-repo. It is the state **before** any conversion work: the reference for choosing the first apps and for measuring progress.

## How the numbers were produced

- **State analysed: the exact submodule pins of `origin/main` of this repo, not the working copies.** All 81 app checkouts on this machine were present; 79 sit exactly on their pin, `demo-shelf-LAB` is ahead of its pin and has uncommitted changes, and `id-jag-standalone-LAB` has uncommitted changes. To avoid measuring local edits, each app was exported with `git archive <pin>` (tracked files only) into a scratch directory and the checker was run over that:
  `node scripts/check-ui-patterns.mjs --root <scratch> --json`
- The five apps recommended below had their pin compared with GitHub `main` (`gh api repos/curtismu7/<app>/commits/main`): all five are at their pin.
- Static analysis only. A clean page means none of the patterns were found, not that the page is right. Not checked: contrast of computed colours (only the shared tokens are checked), 375px overflow, keyboard behaviour, markup built at run time, CSS-in-JS.
- While preparing this baseline, three checker false-positive classes were found by reading the flagged source and fixed in the same PR, each with a regression fixture: a `({ children })` parameter taken for the JSX slot (made the banner look like it came after the page), early-return states (`if (loading) return <main>`) counted as extra landmarks, and parentheses inside string literals making a button look like it sat in a loop. Any number from an earlier run of this checker is superseded by this document.

## Headline

- **326 pages** in **77 apps** analysed; 4 apps have no UI pages (listed at the end).
- **8 pages are clean** (mcp-skills-LAB, privilege-demo-LAB); **318 pages have at least one DRIFT**.
- The 8 clean pages are on the allowlist (`scripts/ui-pattern-converted.txt`) and enforced from this PR on; every other page is advisory.
- WARN findings (advisory, never a failure): H2 64, T1 53, P2 27, P11 13, P1 9, P6 6, M1 5, P10 5 pages with at least one.

## Findings by rule (pages with DRIFT)

| rule | pages with DRIFT | | rule | pages with DRIFT |
|------|------|-|------|------|
| P1 | 266 | | V1 | 8 |
| P3 | 245 | | T1 | 7 |
| P9 | 203 | | H3 | 6 |
| P10 | 101 | | T3 | 5 |
| A2 | 61 | | C1 | 2 |
| H1 | 60 | | T2 | 2 |
| P2 | 60 | | P4 | 1 |
| M1 | 12 | | P6 | 1 |
| A1 | 9 | | P7 | 1 |

P1 (shell-bar), P3 (page frame) and P9 (one primary per view) dominate: most apps predate those conventions, render buttons in lists, or have a page whose only buttons are secondary. P1 and P3 are normally one edit in the app's shared header or main element, which clears every page of the app at once.

## Every app

Columns: pages found, pages with no DRIFT, pages with DRIFT, DRIFT findings (a finding is one rule on one page), the rules that drift most (with the number of pages when the app has more than one).

| app | tier | pages | clean | drift | findings | rules that drift most (pages) |
|-----|------|-------|-------|-------|----------|-------------------------------|
| a2a-lab-LAB | Demo | 3 | 0 | 3 | 10 | P1×3 P10×3 P3×2 P9×2 |
| agent-audit-trail-LAB | Demo | 6 | 0 | 6 | 22 | A2×6 P1×6 P3×6 P9×4 |
| agent-gateway-inspector-LAB | Tester | 1 | 0 | 1 | 4 | A2 P1 P3 P9 |
| agent-governance-LAB | Demo | 9 | 0 | 9 | 21 | P1×9 P3×9 P9×3 |
| agent-kill-switch-LAB | Demo | 1 | 0 | 1 | 4 | A2 P1 P10 P3 |
| agent-mcp-door-demo-LAB | Demo | 1 | 0 | 1 | 2 | P1 P3 |
| agent-preferences-lab | Demo | 3 | 0 | 3 | 10 | P1×3 P10×3 P3×2 P9×2 |
| agent-registry-demo-LAB | Demo | 5 | 0 | 5 | 16 | H1×5 P1×5 P3×5 P9×1 |
| agentcore-pingone-demo-LAB | Demo | 6 | 0 | 6 | 17 | P1×6 P9×6 P3×5 |
| aggregate-entitlement-LAB | Tester | 3 | 0 | 3 | 12 | A2×3 P1×3 P3×3 P9×3 |
| ai-demo-standalone-LAB | Demo | 3 | 0 | 3 | 16 | P1×3 P10×3 T3×3 V1×3 |
| ai-gateway-client-LAB | Tester | 2 | 0 | 2 | 10 | H1×2 P10×2 P2×2 P3×2 |
| ai-guard-sidecar-LAB | Demo | 1 | 0 | 1 | 5 | A2 P1 P3 P9 |
| ai-policies-LAB | Demo | 8 | 0 | 8 | 21 | P1×8 P3×8 P9×5 |
| attack-gallery-LAB | Demo | 8 | 0 | 8 | 24 | P1×8 P2×8 P9×5 P3×3 |
| chatgpt-mcp-flow-LAB | Demo | 3 | 0 | 3 | 10 | P1×3 P10×3 P3×3 P9×1 |
| ciba-hitl-lab | Demo | 2 | 0 | 2 | 10 | A2×2 H1×2 P1×2 P10×2 |
| cimd-LAB | Demo | 6 | 0 | 6 | 10 | P1×6 P9×4 |
| coding-agents-LAB | Demo | 6 | 0 | 6 | 20 | P1×6 P3×6 T1×6 P9×2 |
| customer-agent-LAB | Demo | 6 | 0 | 6 | 12 | P3×6 P9×6 |
| data-protection-LAB | Demo | 7 | 0 | 7 | 18 | P1×7 P3×7 P9×4 |
| delegation-lab-LAB | Demo | 3 | 0 | 3 | 10 | P1×3 P10×3 P3×2 P9×2 |
| demo-field-guide-LAB | Tool | 1 | 0 | 1 | 3 | C1 P1 P10 |
| demo-map-LAB | null | 1 | 0 | 1 | 3 | A2 P10 P9 |
| demo-shelf-LAB | Tool | 1 | 0 | 1 | 4 | H3 P1 P10 P9 |
| diagram-prove-lab | Tool | 1 | 0 | 1 | 4 | P1 P2 P3 P9 |
| diagram-studio-LAB | Tool | 1 | 0 | 1 | 4 | P1 P2 P3 P9 |
| env-map-LAB | Tool | 1 | 0 | 1 | 4 | A2 H1 P10 P9 |
| federated-identity-LAB | Demo | 9 | 0 | 9 | 27 | P1×9 P3×9 P9×9 |
| field-notes-LAB | Tool | 2 | 0 | 2 | 8 | A2×2 H1×2 P10×2 P9×2 |
| gateway-claims-LAB | Demo | 9 | 0 | 9 | 26 | P1×9 P9×9 P3×8 |
| gateway-suite-LAB | Demo | 2 | 0 | 2 | 9 | A2×2 H1×2 P1×2 P10×2 |
| hitl-mfa-lab-LAB | Demo | 3 | 0 | 3 | 10 | P1×3 P10×3 P3×2 P9×2 |
| hostile-a2a-LAB | Demo | 5 | 0 | 5 | 12 | P1×5 P3×5 P9×2 |
| hostile-mcp-LAB | Demo | 6 | 0 | 6 | 14 | P1×6 P3×6 P9×2 |
| id-jag-standalone-LAB | Demo | 9 | 0 | 9 | 18 | P10×9 P9×7 P3×1 P4×1 |
| idjag-runner-LAB | Tester | 7 | 0 | 7 | 39 | M1×7 P10×7 P2×7 P3×6 |
| intent-par-inspector-LAB | Demo | 5 | 0 | 5 | 23 | H1×5 P1×5 P2×5 P3×5 |
| intent-purpose-behaviour-LAB | Demo | 5 | 0 | 5 | 12 | P1×5 P3×4 P9×3 |
| jev-lab-LAB | Demo | 2 | 0 | 2 | 11 | A2×2 H1×2 P1×2 P10×2 |
| jit-lab-LAB | Demo | 1 | 0 | 1 | 5 | A2 H1 P1 P10 |
| mcp-auth-conformance-LAB | Tester | 6 | 0 | 6 | 18 | H1×6 P1×6 P3×6 |
| mcp-demo-client-privilege-LAB | Demo | 1 | 0 | 1 | 8 | A1 C1 H3 M1 |
| mcp-discovery-LAB | Tester | 1 | 0 | 1 | 3 | P1 P3 P9 |
| mcp-elicitation-LAB | Tester | 1 | 0 | 1 | 2 | P1 P9 |
| mcp-gateway-lab-LAB | Demo | 3 | 0 | 3 | 10 | P1×3 P10×3 P3×2 P9×2 |
| mcp-skills-LAB | Tester | 6 | 5 | 1 | 1 | P6×1 |
| mcp-surface-LAB | Demo | 11 | 0 | 11 | 41 | P1×11 P2×11 P3×11 P9×8 |
| mcp-tools-LAB | Tester | 8 | 0 | 8 | 33 | A2×8 P1×8 P3×8 P9×6 |
| meridian-a2a-hop-LAB | Demo | 1 | 0 | 1 | 4 | A1 P1 P10 P3 |
| mock-authorize-LAB | Tester | 5 | 0 | 5 | 12 | P1×5 P3×5 P9×2 |
| muse-LAB | Demo | 4 | 0 | 4 | 30 | P10×4 P2×4 P3×4 M1×3 |
| no-tool-no-promise-LAB | Demo | 1 | 0 | 1 | 4 | A2 P1 P3 P9 |
| obo-lab-LAB | Demo | 1 | 0 | 1 | 5 | A2 H1 P1 P10 |
| observability-LAB | Demo | 7 | 0 | 7 | 25 | P1×7 P10×7 P3×6 P9×5 |
| p1-third-party-exchange-LAB | Demo | 11 | 0 | 11 | 44 | P1×11 P10×11 P9×11 P3×9 |
| p1az-inspector-LAB | Tester | 3 | 0 | 3 | 5 | P1×3 P3×2 |
| personal-agent-demo-LAB | Demo | 1 | 0 | 1 | 4 | P1 P2 P3 P9 |
| ping-gateway-route-LAB | Demo | 6 | 0 | 6 | 32 | A2×6 H1×6 P1×6 P2×6 |
| pingcli-LAB | Demo | 5 | 0 | 5 | 6 | P9×5 P10×1 |
| pingfederate-LAB | Demo | 5 | 0 | 5 | 14 | P1×5 P3×5 P9×4 |
| pingone-events-LAB | Demo | 6 | 0 | 6 | 14 | P10×6 P3×5 P9×3 |
| pingone-LAB | Demo | 4 | 0 | 4 | 16 | P1×4 P10×4 P3×4 P9×4 |
| pingone-mcp-inspector-LAB | Tester | 8 | 0 | 8 | 39 | A2×8 H1×8 P1×8 P2×8 |
| pingone-signin-LAB | Demo | 8 | 0 | 8 | 35 | A2×8 H1×8 P1×8 P3×7 |
| poppy-agent-tester-LAB | Demo | 2 | 0 | 2 | 8 | P1×2 P10×2 P3×2 P9×2 |
| privilege-demo-LAB | Demo | 7 | 3 | 4 | 4 | P9×4 |
| privilege-k8-kits-LAB | null | 2 | 0 | 2 | 12 | H3×2 P1×2 P10×2 M1×1 |
| privilege-logging-LAB | Tester | 8 | 0 | 8 | 12 | P10×8 P9×4 |
| privilege-map-LAB | Demo | 2 | 0 | 2 | 6 | P1×2 P2×2 P3×2 |
| progressive-trust-ladder-LAB | Demo | 1 | 0 | 1 | 3 | P1 P2 P9 |
| saas-access-LAB | Demo | 9 | 0 | 9 | 22 | P1×9 P3×9 P9×4 |
| secrets-vault-LAB | Demo | 9 | 0 | 9 | 25 | P1×9 P3×9 P9×7 |
| session-LAB | Demo | 1 | 0 | 1 | 3 | P1 P3 P9 |
| stolen-token-LAB | Tester | 5 | 0 | 5 | 20 | A2×5 H1×5 P1×5 P3×5 |
| token-workbench-LAB | Demo | 2 | 0 | 2 | 8 | P1×2 P2×2 P3×2 P9×2 |
| worker-demo-LAB | Demo | 1 | 0 | 1 | 2 | P1 P9 |

Not analysed (no UI pages found):

- deploy-test-LAB (skipped: no UI files)
- mcp-resource-server-LAB (skipped: no UI files)
- ping-services-stub-LAB (skipped: no UI files)
- privilege-a2a-anthropic-demo-LAB (skipped: no UI files)


## The first-run list, at a glance

| app | tier | pages | clean | findings | dominant rules |
|-----|------|-------|-------|----------|----------------|
| mcp-demo-client-privilege-LAB | Demo | 1 | 0 | 8 | A1 C1 H3 M1 |
| privilege-a2a-anthropic-demo-LAB | | 0 | | | no UI pages (headless) |
| id-jag-standalone-LAB | Demo | 9 | 0 | 18 | P10×9 P9×7 P3×1 P4×1 |
| privilege-demo-LAB | Demo | 7 | 3 | 4 | P9×4 |
| pingone-LAB | Demo | 4 | 0 | 16 | P1×4 P10×4 P3×4 P9×4 |
| pingfederate-LAB | Demo | 5 | 0 | 14 | P1×5 P3×5 P9×4 |
| cimd-LAB | Demo | 6 | 0 | 10 | P1×6 P9×4 |
| gateway-claims-LAB | Demo | 9 | 0 | 26 | P1×9 P9×9 P3×8 |
| hostile-a2a-LAB | Demo | 5 | 0 | 12 | P1×5 P3×5 P9×2 |
| data-protection-LAB | Demo | 7 | 0 | 18 | P1×7 P3×7 P9×4 |

## Recommended first five

Criteria: (a) shown most (the owner's first-run list, `scripts/first-run-labs.txt`), (b) fewest findings, (c) variety (React and static HTML, Demo and Tester), (d) small enough for one PR. "Locations" counts distinct file:line spots, which is a better size guide than findings (one shared header counts once but shows on every page). Sizes: S is under about half a day, M about a day, L several PRs.

### 1. privilege-demo-LAB — Demo, React, first-run — S (3 of 7 pages already clean and enforced from this PR)

Pages left: policies, approvals, trace, learn. Only rule P9 is left, 6 locations, 4 findings:

- `web/src/pages/PoliciesPage.jsx:150`, `:174` and `web/src/components/TestRequest.jsx:73`: three primary buttons in one view state (Confirm reset, Save as Active, Test request)
- `web/src/pages/ApprovalsPage.jsx:62`: the per-row Approve is a primary inside a list, so it repeats
- `web/src/pages/TracePage.jsx:28`: two buttons, none primary (Refresh is the page action)
- `web/src/story/StoryPanel.jsx:63`: the Learn page's only buttons are story steps, none primary

**First step:** TracePage Refresh gets `className="primary"`; on Policies keep one primary (Save as Active) and demote the other two. Then add `privilege-demo-LAB/policies` and `/trace` to the allowlist in the same PR.

### 2. cimd-LAB — Demo, React, first-run — S

6 pages, 8 locations, 10 findings:

- P1 on all 6 pages, one cause: `web/src/App.jsx:125`, a `<header className="bar">` that is not the `shell-bar`
- P9 on 4 pages: the real-sign-in submit `App.jsx:153` and the diagram `Simulate` `web/src/DiagramView.jsx:95` are both primary next to the view's own primary (`views/PfView.jsx:26`, `:109`, `:133`; `views/LabView.jsx:30`; `views/H2View.jsx:165`)

**First step:** replace the header at `App.jsx:125` with the `.shell-bar` markup from `shared/ui-standard-mock.html` (clears P1 everywhere), then demote `Simulate` to a plain button. The banner already comes first.

### 3. hostile-a2a-LAB — Demo, React, first-run — S

5 pages, 6 locations, 12 findings:

- P1 on 5 pages: legacy `.top` header, `web/src/App.jsx:58`
- P3 on 5 pages: `<main>` without a page frame, `web/src/App.jsx:76`
- P9: `web/src/pages/RoundTrip.jsx:90`, `:102`, `:113` (three primary step buttons at once), and `web/src/story/StoryPanel.jsx:61` (the gallery page has buttons but no primary)

**First step:** shell-bar and page frame in `App.jsx` (two shared edits clear 10 of the 12 findings), then keep only the current step's button primary in RoundTrip.

### 4. mcp-skills-LAB — Tester, React, not on the first-run list — S (5 of 6 pages already clean and enforced from this PR)

It is the only app with clean pages today, so finishing it gives the first fully enforced app and the only Tester example. One finding left, page `skills`:

- P6 `web/src/pages/Skills.jsx:90`: `<div className="inspector">` has 2 parts (the tree `nav` and one `section`), the standard is tree + form + output

**First step:** split the right-hand section into a form part (Get by URI, Activate) and an output part, or decide that a 2-part inspector is acceptable and relax P6 for it. That is a design decision, not a mechanical fix. Then add `mcp-skills-LAB/skills`.

### 5. mcp-demo-client-privilege-LAB — Demo, static HTML (no React), first-run #1 — M

1 page (`index`), 14 locations across 8 rule families, which is why it is M rather than S, but it is the most-shown app and the only vanilla-HTML example:

- P1 `public/index.html:17` (`.topbar`), P3 `:45` (no frame), P9 `:69` (buttons, none primary: Sign In should be)
- A1 unlabelled fields `public/index.html:85`, `:98`, `:112`, `:113`, `:120`
- H3 `public/app.js:143`, `:144` (script sets `style.color` and `style.borderColor`; use a state class)
- P10 `public/styles.css:98` (button border reads the app's own `--line`)
- M1 no visible Mock / Real toggle (rule 19)
- C1 the app redefines `--muted` and `--line` in `public/styles.css:4-5`: muted text on surface is 3.08:1 in light mode (needs 4.5), the primary button boundary is 2.44:1 (needs 3)

**First step:** swap `.topbar` for the `shell-bar` markup and frame the `<main>`; then drop the app's colour token overrides in `styles.css` (clears P10 and C1 together).

### Not picked, and why

- **pingfederate-LAB** (M, 5 pages, 10 locations) and **pingone-LAB** (M, 4 pages, 10 locations + P10 `web/src/app.css:67` reads `--on-lab`): next in line; same two shared edits (header `App.jsx:146`/`:139`, frame `App.jsx:191`/`:185`) plus 8 (pingfederate) and 7 (pingone) primary-button spots.
- **gateway-claims-LAB** (9 pages, 26 findings): P1/P3 are two edits, but P9 needs a primary chosen on every one of 9 pages.
- **data-protection-LAB** (7 pages, 10 locations): same shape as pingfederate-LAB, with 8 button spots to fix in the tab components.
- **id-jag-standalone-LAB** (L): 69 locations, mostly its own `--th-*` / `--ijp-*` / `--brand-*` tokens read by buttons in 6 CSS files (P10). A theming migration, not a one-PR conversion.
- **privilege-a2a-anthropic-demo-LAB**: no UI pages (headless).

## Update, 2026-11-10: weak spots A-H fixed in the checker

The tables above were produced by the first release of the checker (#174) and are kept as they were. The checker was then changed for seven known weak spots (fragment arms, attribute JSX, component boundaries, sibling conditional primaries, header buttons, heading order through child components, focus-ring contrast; section 11 of `shared/STANDALONE-UI-PATTERNS.md` has the rules and the changelog). Headline numbers did not move: **326 pages, 8 clean, 318 with DRIFT, the same 8 enforced pages all still PASS.**

How it was re-measured: the same method as above, on the submodule pins of `origin/main` at `3c99219` (`git archive <pin>` of all 81 apps), run once with the old script and once with the new one, so only the checker differs. "Pages" below are pages with at least one result of that status for the rule.

| rule | status | before | after | why it moved |
|------|--------|--------|-------|--------------|
| P9 | DRIFT | 203 | 206 | +4 real (below), -1 false |
| H1 | DRIFT | 61 | 48 | -13 false: an early-return state wrapped in a fragment (`if (..) { return (<>..<main>..) }`) counted as a second `main` |
| A1 | DRIFT | 9 | 11 | +2 real: an unlabelled select and two inputs inside `banner={<>..</>}` attribute JSX, invisible before |
| C1 | DRIFT | 2 | 9 | +7 real: the app's own CSS sets a faint focus ring on the dark shell bar |
| C1 | WARN | 0 | 43 | the shared ring token (dark blue, 2.29:1 on the dark bar) in apps that do not override it on the bar; 10 apps |
| H2 | WARN | 64 | 120 | +87 pages: a real skip inside a child component (33 distinct heading locations, e.g. a shared `Bits.jsx` hop title that is an `h4` straight under the page `h1`), plus one page-local skip the old order did not read (`session-LAB`, h1 to h4); -31 pages: false skips caused by child-component headings the old check could not see |

Every changed result, classified (none is left as a false positive):

- **New DRIFT, real violations the old check missed (P9, 4 pages).** `agent-registry-demo-LAB/start-boxes`: the diagram tab renders `ScenarioBar` (imported from the lifecycle tab, its "Run story" is primary) next to its own "Simulate". `ai-policies-LAB/policies`: `Layer` (primary "Save layer") is rendered once per layer by `LAYERS.map`. `saas-access-LAB/approvals`: `Pending` (primary "Approve") is rendered once per pending request. `secrets-vault-LAB/governance`: `Proof`'s "Run the proof now" and the grant form's "Grant" are on the same tab (the old check treated an early-return state of one component as exclusive with everything else on the page).
- **New DRIFT, real (A1, 2 pages):** `ai-gateway-client-LAB/flow` and `templates`, `web/src/App.jsx:448`, `:462`, `:487`.
- **New DRIFT, real (C1, 7 pages):** `pingone-events-LAB` (6 pages: `button:focus-visible` and `select:focus-visible` use the page blue, 2.29:1 on the bar; only the nav links are overridden) and `muse-LAB/index` (`input:focus-visible` uses the dark accent, 1.42:1).
- **DRIFT removed, false (H1, 13 pages in 6 apps; P9, 1 page):** `ciba-hitl-lab`, `gateway-suite-LAB`, `jev-lab-LAB`, `jit-lab-LAB`, `obo-lab-LAB`, `stolen-token-LAB` (fragment-wrapped early return); `mcp-tools-LAB/gateway` (its real-gateway state and its mock state are separate early returns).
- **WARN only (never a failure):** C1 on 43 pages (the shared ring token; the owner decides whether to change `--focus`, or each app adds `.shell-bar :focus-visible { outline-color: var(--on-box) }`), H2 as above.
- **The 8 enforced pages and the three open app PRs** (`privilege-demo-LAB` #10, `cimd-LAB` #9, `hostile-a2a-LAB` #6, with their allowlist lines) PASS enforced with the new checker.

Re-measure with: `git archive <pin>` of every app into a scratch root, then `node scripts/check-ui-patterns.mjs --root <scratch> --json` with the old and the new script, and compare the per-page `results`.

