# UI check baseline — 2026-11-10

First full run of the new per-page checker (`scripts/check-ui-patterns.mjs`) over all
76 checked-out labs. This is the state **before** any conversion work; it is the
reference for picking the first apps to convert and for measuring progress.

Numbers were produced with:

```
node scripts/check-ui-patterns.mjs --root ~/Development/AI-DEMO-Standalone/standalone --json
```

(this machine's submodule pins of 2026-11-10; CI runs the same checker on its own
checkout, where the enforced allowlist `scripts/ui-pattern-converted.txt` is the gate).

## Headline

- **323 pages** in **76 apps** analysed (4 apps skipped: no UI or not checked out)
- **5 pages clean** (all in mcp-skills-LAB), **318 with at least one DRIFT rule**
- 5 clean pages are now enforced via the allowlist; the rest are advisory

## Findings by rule (pages affected)

| rule | pages | rule | pages |
|------|-------|------|-------|
| P1 shell | 263 | A2 focus | 61 |
| P3 page frame | 243 | V1 vendored CSS | 23 |
| P9 one primary | 205 | T3 dark theme | 18 |
| P10 button tokens | 98 | M1 toggle | 11 |
| H1 one h1/main | 82 | A1 labels | 9 |
| P2 banner | 74 | T1 literals | 7 |

(H3 4, T2 2, P4/P6/P7/C1 ≤ 1 each.)

P1/P3/P9 dominate: most apps predate the shell-bar/page-frame/primary-button
conventions, or render buttons in loops (cards, tables).

## First-run apps (the shelf's default list), per app

| app | pages | findings | dominant rules |
|-----|-------|----------|----------------|
| mcp-demo-client-privilege-LAB | 1 | 8 | P1 P3 P9 P10 + M1 C1 (static HTML page) |
| privilege-a2a-anthropic-demo-LAB | 0 | — | headless (no UI pages found) |
| id-jag-standalone-LAB | 9 | 27 | P10 (36+ button-token literals), P9, P2 |
| privilege-demo-LAB | 7 | 18 | P2 (banner after content), P9, H1 |
| pingone-LAB | 4 | 16 | P1 (legacy `.top`), P3, P9, P10 |
| pingfederate-LAB | 5 | 14 | P1, P3, P9 |
| cimd-LAB | 6 | 10 | P1, P9 (fewest of the first-run set) |
| gateway-claims-LAB | 9 | 26 | P1, P3, P9 on every page |
| hostile-a2a-LAB | 5 | 12 | P1/P3/P9 family |
| data-protection-LAB | 7 | 18 | P1, P3, P9 |

## What the checker cannot see (stated limits)

- Static analysis only: no computed contrast in the browser, no 375px overflow,
  no keyboard behaviour. The browser checks in light/dark/375px still apply.
- Runtime-built markup (`innerHTML`, `createElement`), CSS-in-JS, and values set
  at run time (customer accent/skin/theme from storage) are invisible.
- A clean run means "none of these patterns found", not "the page is right".

## Method for the five first apps

Picked from this baseline by: first-run-list order (how often an app is shown),
fewest findings, variety of rule families, and whether one PR can fix an app.
Each entry: exact findings, size, and the first step.

### 1. cimd-LAB — S/M (6 pages, 10 findings)

- P1 on all 6 pages: one shared cause — `<header>` without `.shell-bar` at
  `web/src/App.jsx:125`
- P9 on 4 pages: primary rendered inside a loop at `web/src/DiagramView.jsx:95`
  plus "buttons but none primary" pages
- One PR: convert the single shared header and fix the DiagramView loop button.
  **First step:** replace the `App.jsx:125` header with the `.shell-bar` markup
  from shared/ui-standard-mock.html.

### 2. pingfederate-LAB — M (5 pages, 14 findings)

- P1 on all pages: legacy `.top` header at `web/src/App.jsx:146`
- P3 on all pages: `<main>` (App.jsx:191) has no centred max-width frame
- P9 on 4 pages: primary in a loop (`web/src/views/Shelf.jsx:41`)
- **First step:** add `.shell-bar` + the standard page frame to App.jsx —
  two shared edits fix P1+P3 everywhere; then promote the Shelf row button.

### 3. pingone-LAB — M (4 pages, 16 findings)

- P1 (legacy `.top`, App.jsx:139), P3 (no frame, App.jsx:185) on all 4 pages —
  same two-fix shape as pingfederate-LAB
- P10 on all pages: buttons read `--on-lab` (`web/src/app.css:67`), not shared
  tokens — a real brand-token drift, not just shell
- **First step:** App.jsx shell+frame swap, then replace `--on-lab` on button
  rules in app.css with `--on-accent`/`--control-border`.

### 4. hostile-a2a-LAB — S (5 pages, 12 findings)

- P1: legacy `.top` header at `web/src/App.jsx:58`; P3: no page frame (App.jsx:76)
- P9: StoryPanel.jsx:61 renders buttons with no primary action
- Smallest of the family: two shared edits + one button class.
  **First step:** shell-bar swap in App.jsx, then mark the StoryPanel CTA.

### 5. privilege-demo-LAB — M (7 pages, 18 findings, different rule mix)

- P2 on all 7 pages: page content (e.g. `<h1>` in PoliciesPage.jsx:119) renders
  before the banner that AppShell.jsx:86 mounts — a layout-order bug in the
  shared AppShell, fixed once for all pages
- H1 on 5 pages: no `<main>` landmark; P9 on 6 pages
- Adds variety: exercises P2/H1 rather than P1/P3.
  **First step:** move the banner mount above the view slot in AppShell.jsx,
  then add `<main>` around the slot.

Not picked: mcp-demo-client-privilege-LAB (8 findings on one static HTML page
but mixes 8 rule families incl. C1 contrast — better as a dedicated conversion);
id-jag-standalone-LAB and gateway-claims-LAB (27/26 findings across many pages
and components — an L-sized PR each); privilege-a2a-anthropic-demo-LAB (headless,
no UI pages to convert).
