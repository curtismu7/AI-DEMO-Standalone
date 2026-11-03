# Standalone UI patterns standard

Written for: anyone building or reviewing a standalone app's pages. This sits under
`STANDALONE-STANDARD.md` §6 and `STANDALONE-CSS-STANDARD.md` (which owns colours, fonts
and selectors). This file owns the **layout and component patterns** — what a page is
made of. The visual reference is `shared/ui-standard-mock.html` (open it in a browser);
the mock is normative: if this doc and the mock disagree, fix one of them.

Check conformance with `scripts/check-ui-patterns.sh` (run from this repo's root).
It is advisory on first run: it reports PASS / DRIFT / INFO per pattern so existing apps can
converge in their next PR.

## Baseline, 2026-11-03

First run of `check-ui-patterns.sh` across the family: every app passes the shell and
banner patterns. Known convergence work for next PRs:

| App | Gap |
| --- | --- |
| id-jag-standalone | P7: status pill styled without semantic tokens; vendored stylesheet missing (uses its own tokens — migrate to `standalone-ui.css`) |
| privilege-demo-LAB | P2: banner markup not found by the checker (verify it renders the simulation banner) |
| mcp-tools-LAB, pingone-lab, ai-gateway-client-LAB, mcp-demo-client-privilege-LAB | Vendored `standalone-ui.css` differs from canonical (pre-existing; tracked by `check-drift.sh`) |


---

## 1. App shell (every page)

- Header bar, Core Dark (`--box-dark`) in both themes, containing: logo + app name,
  pill-shaped nav links, right side: signed-in user, sign-in/out, presenter toggle,
  theme toggle.
- A 3px Ping Red gradient rule under the bar (`border-image: var(--accent-gradient) 1`).
- Nav links: `border-radius: 999px`; current page uses `aria-current="page"` and gets
  the accent-gradient fill.
- The bar wraps at 600px: nav drops to its own row (`flex-basis: 100%`).
- Markup names: `shell-bar`, `shell-brand`, `shell-nav`, `shell-right` (BEM children
  allowed). A light `.topbar` is the legacy pattern — migrate when touching the page.

## 2. Simulation / status banner (every page)

- First element inside the page, above the title. `class="banner"`, `role="note"`.
- Mock mode: left edge is the accent (`--accent`), text names the mode and what is
  simulated. Live mode: `data-state="live"` (left edge `--focus`). Never recolour it
  in app CSS.

## 3. Page frame

- One `max-width: 1100px` centered container, top padding small, bottom ≥ 2rem.
- Page title is `h1` below the banner. Body text 14px base (per shared stylesheet).
- Sections are labelled with a small uppercase kicker (`section-label` style) or an
  `h2` — not bare whitespace.

## 4. Cards (summary / status surfaces)

- `card`: bordered (`--border`), radius 10px, `--surface` background, padding ~1rem,
  **4px accent top edge** by default.
- Semantic variants carry meaning by top-edge colour AND a status chip (never colour
  alone): `card--ok` (`--status-ok`), warn, danger. Neutral cards use `card--neutral`
  (top edge `--border`).
- Laid out in `card-grid`: `repeat(auto-fit, minmax(0, 1fr))`, gap 0.75rem, children
  `min-width: 0`.
- Card titles `h3` at 1rem; supporting text 0.85rem.

## 5. Key-value data

- `kv`: definition list, `grid-template-columns: minmax(9rem, max-content) 1fr`,
  keys `--muted` 600 weight, values regular; values that are tokens/ids/code use
  the mono font. Collapses to one column at 600px.

## 6. Inspector layout (Tester/Tool tier pages that probe something)

- Three columns: tree (≈220px) + form (1fr) + output (≈1.2fr), gap 0.75rem; each
  column is a bordered panel.
- Tree items are buttons with `aria-selected`; selected = accent fill (shared rule).
- Output has Pretty / Wire tabs (`aria-selected` state) and a `pre.code` block
  (`--surface-2`, bordered, mono, `overflow-x: auto`).
- 900px: two columns, tree becomes a horizontal row. 600px: single column.
- Apps that already use the shared `InspectorShell` component satisfy this pattern.

## 7. Status chips

- `chip`: pill, 1px border, 0.75rem/700 text, leading dot. Colour from the semantic
  tokens only: `chip--ok|warn|info|danger`. Always paired with a word (the chip text
  itself). Never a bare coloured dot.

## 8. Diagram boxes

- Use `--box-dark|blue|grey|red` fills with `--on-box` text, radius 8px, visible
  border in dark theme, dark in BOTH themes. Arrows/edges are `--muted`. (Rule 17:
  real diagrams come from diagram-studio data; these are the box styles.)

## 8b. Diagram edges — per-edge phase colors (owner, 2026-11-03)

- An edge in diagram-studio/1 data may carry `"color": "<role>"` (same six roles as
  groups: red dark grey blue green amber). Validators accept it; unknown colors fail.
- Renderers stroke the edge with the role's `--dg-<role>` token (shared stylesheet).
  The ACTIVE hop still wins: `--accent`, thicker, and its numbered badge accented.
- Phase vocabulary when colouring: requests/setup = blue, person actions/tokens
  returned = green, decisions (deny/permit/policy) = red, results/background = dark,
  neutral = grey, pending/warning = amber. Node and edge colors are independent.
- Reference: pingone-lab `#/run/device` (colored), ciba-hitl-lab (24 edges by phase).
  CSS lives in each app's stylesheet for now; promote to the shared file when the
  second renderer converges (it already has, three times — next touch migrates).

## 9. Buttons and tabs

- Primary action: `class="primary"` (shared gradient rule). One primary per view.
- Destructive actions use `--danger-text` text, not a filled red button.
- Selected tab/toggle state lives in `aria-selected` / `aria-pressed` (shared rule
  fills it accent). No extra state classes.

## 10. What app CSS may not do

- No colours (CSS standard §1). No restyling of shared controls, `.banner`, chips or
  diagram boxes — only layout. New pattern-level styles that would be reused across
  apps belong in the shared stylesheet, not in each app.
