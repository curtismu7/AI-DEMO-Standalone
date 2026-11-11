# Standalone UI patterns standard

Written for: anyone building or reviewing a standalone app's pages. This sits under
`STANDALONE-STANDARD.md` §6 and `STANDALONE-CSS-STANDARD.md` (which owns colours, fonts
and selectors). This file owns the **layout and component patterns** — what a page is
made of. The visual reference is `shared/ui-standard-mock.html` (open it in a browser);
the mock is normative: if this doc and the mock disagree, fix one of them.

Check conformance with `node scripts/check-ui-patterns.mjs` (run from this repo's root; the older
`scripts/check-ui-patterns.sh` is a thin wrapper around it). It checks every PAGE of every app against
the rules in section 11 and enforces an allowlist: a page listed in `scripts/ui-pattern-converted.txt`
must have no DRIFT (CI fails otherwise); every other page is advisory and only reported. To convert a
page: fix it, then add its `<app>/<page>` line to the allowlist in the same PR.

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

## 8c. Token-chain evidence: sequence view, movie reel, step detail (owner, 2026-11-08)

Any lab that shows a chain of hops uses the shared evidence screens in `shared/evidence/` (vendored into `web/src/evidence/`) fed by `demo-hop/1` hops from `shared/hop-detail/`. Do not draw a new sequence diagram or filmstrip by hand.

- Every box opens detail: actor tiles and lifeline boxes open the actor card; step rows and reel frames open the step detail (what happened, gateway filter chain, decision, what changed, request and response, why / what the spec requires / common failure mode).
- Lane colours are the shared `--lane-*` tokens (browser blue, agent orange, tool and gateway green, identity amber, back-end pink). Borders and strokes only, never text colour.
- The teaching text comes from the shared hop catalog; a lab adds catalog entries for its own hop kinds there first, then re-vendors.
- Mock shows MOCK tokens raw; Real redacts on the server; secrets are always write-only.

## 8d. Every modal is a FloatingDialog: movable, resizable, pop-out (owner 2026-11-09, from AI-DEMO2's DraggableModal)

- Every dialog, modal, drawer or floating card renders inside `FloatingDialog` from `shared/floating-dialog/`
  (vendored into `web/src/floating-dialog/` byte for byte, pinned by `floating-dialog.sha256`). Do not hand-roll `role="dialog"` / `aria-modal`.
- It gives: drag by the title bar, resize from 8 edges and corners, keyboard move (arrows, Shift = farther) and resize
  (Alt + arrows) from the focused title bar, pop-out to a real same-origin window that stays live, close button +
  Escape, focus in on open and back to the opener on close, remembered position and size (`storageKey`).
- Modal by default (backdrop, `aria-modal`, Tab held in). A card that floats beside the page uses `noBackdrop`.
- At 600px and below it becomes a full-width bottom sheet; drag and resize are off.
- First user: the evidence actor card (`shared/evidence/ActorCard.jsx`). `scripts/check-ui-patterns.sh` reports a
  hand-rolled dialog as P11 WARN (advisory, never a failure) so apps converge when they next touch the page.

## 8e. Return link: the way back after a hand-off (2026-11-09)

An app that Customer Agent LAB can hand a use case to vendors `shared/return-link/` into `web/src/return-link/` (byte for byte,
pinned by `return-link.sha256`).

- Opened with `?from=customer-agent&uc=<id>&vertical=<id>`: a strip right BELOW the simulation banner (the banner stays first),
  "Opened from Customer Agent LAB · <uc>", with a **Back to Customer Agent LAB** button; the same button, compact
  (`variant="header"`), in the shell bar's right side.
- Back navigates the same tab. The target comes only from the fixed list in `returnTargets.js`, never from the address bar:
  the proxy path when the page sits under a directory prefix (`/<app>/...`, the lab proxy, also on loopback :8443), the
  direct loopback URL when the app is served at its root. Unknown `from` or a bad id renders nothing.
- Preselect the app's own scenario from `uc` / `vertical` only where it obviously maps; otherwise show the strip only.
- Theme tokens only (the strip's left edge is `--focus`, not the accent, so it never reads as the simulation banner).

## 9. Buttons and tabs

- Primary action: `class="primary"` (shared gradient rule). One primary per view.
- Destructive actions use `--danger-text` text, not a filled red button.
- Selected tab/toggle state lives in `aria-selected` / `aria-pressed` (shared rule
  fills it accent). No extra state classes. `aria-current` is a navigation hint, not a selected
  state: a button that only carries `aria-current` is a plain action to the checker (P9).

## 10. What app CSS may not do

- No colours (CSS standard §1). No restyling of shared controls, `.banner`, chips or
  diagram boxes — only layout. New pattern-level styles that would be reused across
  apps belong in the shared stylesheet, not in each app.

## 11. The static check: rules and allowlist

`node scripts/check-ui-patterns.mjs` (options: `--root <dir>`, `--app <name>`, `--json`, `--strict`,
`--list-advisory`, `--verbose`, `--rules`) reads each app's files, with no browser and no network. A page is a
served `.html` file, or a view of a React app (found from its route table). Its markup, the CSS it loads and its
inline styles are judged together. A status is PASS, DRIFT, WARN or INFO; only DRIFT on an enforced page fails.

| Rule | What it checks |
| --- | --- |
| P1 | One `shell-bar` (or InspectorShell) and one page header, styled (section 1) |
| P2 | The simulation banner is the first content element, has text, and does not hardcode "live" (section 2) |
| P3 | Content in `<main>` inside a centred max-width frame (section 3) |
| P4 | Cards bordered, top edge from tokens (section 4) |
| P6 | Inspector layout has tree + form + output where used (section 6) |
| P7 | Chips carry text and a semantic tone, never colour alone (section 7) |
| P9 | Exactly one primary button per view state, judged on what renders (components expanded at their use sites); a dialog is its own state (section 9) |
| P10 | Button colours read only shared tokens; the primary resolves to the fixed Ping Red gradient |
| P11 | Every modal is a FloatingDialog (section 8d); advisory |
| H1 | Exactly one `h1` and one `main` landmark |
| H2 | Heading levels do not skip, in render order through child components; advisory |
| H3 | No inline style colours or font-size, no colour literals in markup attributes |
| T1 | Theme tokens only in the app's own CSS; no purple, violet or indigo hues |
| T2 | Font-size floor of 10px |
| T3 | Dark and light themes both defined |
| A1 | Buttons, links and form controls have an accessible name |
| A2 | No `outline: none` without a replacement focus style |
| A3 | Every `img` has `alt` |
| V1 | The page loads a `standalone-ui.css` identical to `shared/standalone-ui.css` |
| M1 | A visible Mock / Real toggle wired to `/api/mode` (rule 19) |
| C1 | Token contrast: primary gradient, chips, muted text, borders, and the focus ring on content surfaces and on the dark shell bar (4.5:1 text, 3:1 non-text) |

Not checked statically: contrast of colours computed in the browser (only the shared tokens and the focus ring are), horizontal overflow at 375px, keyboard
behaviour, markup built at run time (`innerHTML`, `createElement`), CSS-in-JS. Keep doing the browser checks
in light, dark and 375px. A clean run means none of these patterns were found, not that the page is right.
An unavoidable exception is written as a comment `ui-pattern: allow <RULE> <reason of 8+ characters>` on the
finding's line or the line above; every escape is listed in the report.

### What P9 and H2 follow (the render forest)

P9 and H2 are judged on what the page renders, not on the flat list of elements in its files:

- **Ternary arms, early returns and conditions.** Arms of a ternary are alternatives whether they are single elements,
  components or fragments (`cond ? (<>..</>) : (<>..</>)`), also chained (`a ? X : b ? Y : Z`) and nested. So are the
  states of one function written as `if (..) return`, `else return`, `case x: return`, `default: return`, and sibling
  conditions on one expression with different literals (`tab === "a" && <A/>` next to `tab === "b" && <B/>`; also through
  `const isA = tab === "a"`). Exclusivity that is not written this way (a variable assigned in an `if`, a loose boolean)
  is not proven, so both count.
- **Conditional primary class.** `className={step === 0 ? "btn primary" : "btn"}` on several buttons, each with a
  different literal of the same expression, is at most one primary at a time. Literals of different expressions,
  `>=`, a variable instead of a literal, or one button that is always primary are not proven and count together.
- **Components.** A component used on the page (same file, or imported from under the app root) is expanded where it is
  used: a primary inside a component used in one ternary arm belongs to that arm, a component used twice counts twice,
  and one used in a `.map()` repeats. A component's early-return states are exclusive with the children passed through
  it. Another page's view is never expanded. The page's own view is mounted at the layout's `{children}` slot.
- **JSX in an attribute** (`render={() => <b/>}`, `actions={<b/>}`, `banner={<>..</>}`) is parsed. Assumption: it renders
  where its host element renders. The checker does not read the receiving component to see where inside it the prop is
  used; if the host sits in a ternary arm or a dialog, so does the attribute JSX.
- **Chrome.** Only the app shell bar is chrome (`.shell-bar`, `role="banner"`, a page-level legacy top bar, `<nav>`, skip
  links): its buttons are not page actions. A `<header>` inside `<main>`, a section, an article, an aside, a form, a list
  item, a table or a dialog is page content, so a primary-styled button in it is counted and a plain action button in it
  still needs a primary on the page.
- **Selectors and disclosures** (`aria-selected`, `aria-pressed`, `aria-expanded`, `aria-checked`, `role` tab, switch,
  checkbox, radio, or a tab/toggle/chip/pill class) are not actions: they never need a primary, and they are not counted
  unless they are styled `.primary`. `aria-current` is not a selector (section 9), so a button with only `aria-current` is a
  plain action.
- **A conditional button in the app layout** (for example `{signedOut && <button className="primary">Sign in</button>}`
  in `App.jsx`) counts as page content on every page. A layout primary plus a view primary is two primaries; make the
  layout button secondary, or put it in an early-return state of the layout.
- **H2** walks the same tree in render order. Arms of one ternary and different early returns each start from the heading
  level before them, and what follows is judged from the lowest level any of them leaves. A skip inside a child component
  is reported at the component's own file and line.
- **C1 focus ring.** The ring is resolved from the CSS: the `--focus` token, or the `outline` / `outline-color` of the
  most specific `:focus-visible` rule that reaches each focusable element in the shell bar, with a `--focus` override
  scoped to the bar honoured. It is compared (3:1, non-text) with the bar's own background and, for content, with
  `--bg`, `--surface` and `--surface-2`, in light and dark. The shared ring is dark blue in the light theme and measures
  2.29:1 on the dark bar. When that shared token is what fails and the app does not override the ring on the bar, C1 is a
  **WARN** that names the token and the surface; the owner decides whether the shared token should change. When the app's
  own CSS sets the ring to something faint on the bar (for example `button:focus-visible { outline: 2px solid var(--brand-blue) }`, which also applies inside the bar),
  or a content ring fails, C1 is **DRIFT**. The usual fix is `.shell-bar :focus-visible { outline: 3px solid var(--on-box); outline-offset: 2px; }`.

Honest limits, still: the check is static. It does not compute colours beyond the tokens and the ring, and it does not see
markup built at run time (`innerHTML`, `createElement`), CSS-in-JS, or values set at run time (customer accent, skin). It does
not follow render helpers called as functions (`{renderRow()}`), components held in variables (`const C = cond ? A : B;
<C/>`, `{ a: A, b: B }[tab]`) or a prop used as a component; that markup counts once where it is written. A conditional
that is not written as one of the shapes above is not proven exclusive, so a state-dependent primary can be flagged although
only one renders (rewrite it as a ternary, an early return or a literal comparison, or write a `ui-pattern: allow` escape
with the reason).

### Checker changelog

- 2026-11-10 (weak spots A-H): fragments are nodes, so fragment arms, nested and chained ternaries and `else`/`case`/`default`
  returns are exclusive states; JSX in attributes is parsed; P9 and H2 follow components (same file and imported) to their use
  sites, so a component's primary counts once per use site and heading order runs through child components; sibling buttons
  with a conditional primary class on distinct literals of one expression are exclusive; only the shell bar is chrome and
  a disclosure is not an action; C1 checks the focus ring on the shell bar and on content surfaces. Documented, unchanged:
  layout-level conditional buttons count as page content; `aria-current` is not a selected state.
- 2026-11-10 (first release, #174): per-page rules P1-P11, H1-H3, T1-T3, A1-A3, V1, M1, C1, the allowlist and the mutation tests.
