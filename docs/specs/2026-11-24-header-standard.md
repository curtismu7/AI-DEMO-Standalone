# Spec: Standalone header brand standard (header sweep 2026-11-24)

Tier 2 — changes the shared UI standard every lab depends on.

## What
Add explicit brand sizing to the shared shell-bar standard, in one place
(`shared/standalone-ui.css` + `STANDALONE-UI-PATTERNS.md` §1), and roll it out to
every `shell-bar` lab so all headers are the same size.

## Proposed sizes (from privilege-gateway-client-LAB, lab PR #20)
```css
.shell-brand__text { display: inline-flex; flex-direction: column; gap: 2px; min-width: 0; line-height: 1.2; }
.shell-brand__name { font-size: 1.4rem; overflow-wrap: anywhere; }
.shell-brand__tag { font-weight: 400; font-size: 0.9rem; letter-spacing: 0; opacity: 0.85; overflow-wrap: anywhere; }
.brand-mark { font-size: 1.4rem; }
@media (max-width: 600px) {
  .shell-brand__name, .brand-mark { font-size: 1.15rem; }
  .shell-brand__tag { display: none; }
}
```
rem units → scales with the TopMenu Text-size control. Visual reference:
`shared/header-standard-mock.html` (new).

## Acceptance criteria
1. Every `shell-bar` lab renders the name at 22.4px and the tagline at 14.4px at
   text size M (1440px), and 18.4px name at 390px — verified in a real browser.
2. Nothing scrolls horizontally at 390px in any lab.
3. `check-ui-patterns.mjs` flags any lab CSS that sets `font-size` on
   `.shell-brand*` itself (WARN now, DRIFT/enforced at the end of the rollout);
   fails without this change.
4. All per-lab brand size rules deleted; all `standalone-ui.sha256` pins bumped.

## Unhappy paths
- **Stale-copy CI trap:** once the size rules merge into the canonical file, every
  lab's CI fails on the vendored-copy check until that lab re-vendors. Mitigation:
  pilot 3 labs have branches ready before the canonical merge; batches follow immediately.
- **Labs without name/tagline markup:** labs whose brand has no separate name and
  tagline elements get the markup fixed in their PR (step 2's survey tells which).
- **8 labs not on `shell-bar`:** owner decision pending — move onto `shell-bar`, or
  size-match only.
- **Does "headers" include the page `h1`?** Owner decision pending; measured either way.
- Labs that fail to start from the shelf are logged, not fixed, in this sweep.

## Out of scope
- Hosted SE-cluster redeploys (listed for the owner; only owner-picked ones redeploy).
- Any other visual change to the bar (colors, nav, spacing).

## Verification
Measure-one script generalized across the shelf before/after (RESULTS.md);
`npm run ci:local`-equivalent parent checks; per-lab CI green before merge;
owner go before each merge ("merge N").
