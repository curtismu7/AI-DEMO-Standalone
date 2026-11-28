# Standalone Fleet UI Consistency Audit — 2026-11-27

Scope: all 117 checked standalone `-LAB` apps (124 dirs; 6 skipped — no UI or not checked out),
via the pattern checker, the shell/CSS checker, and 20 live screenshots through the lab-proxy.

## 1. Overall verdict

The fleet is in good shape and better than most 100-app families: a shared token stylesheet
(`standalone-ui.css`), a written pattern standard (`shared/STANDALONE-UI-PATTERNS.md`), a static
checker with an enforced allowlist, and a normative visual mock all exist and mostly pass.

- Shell/CSS check: **all apps pass** vendored-copy check.
- Pattern check: **462 pages — 319 clean, 143 with drift; 265 enforced; 1 enforced FAIL**
  (`poppy-demo-LAB/chat`, P10).
- Drift is concentrated, not spread: the top 10 apps carry ~60% of all drift findings.

## 2. What is already consistent (working — keep)

- Core Dark shell bar, Ping Red gradient rule, pill nav, theme/text-size controls — every lab.
- Simulation/status banner naming mock vs live on every page.
- Numbered story layout (`.step-num`, full-width sections) on converted labs
  (a2a-lab, hitl-mfa, wimse, stolen-token, token-workbench, meridian, ai-guard…).
- Semantic status chips, diagram walkthrough controls (Simulate/Pause/Step), Shelf↵ return link.

## 3. Findings (screenshots in this folder)

### F1. Header bar is overloaded and arranged differently per lab (biggest inconsistency)
The right cluster (Mode, Vertical, Presenter, Talk track, Help, version, Postman, Reset,
Demo|Story, Shelf↵, Theme, Text size) appears in a **different order and different subset on
every lab**. Screenshots: `token-workbench.png` (Mode/Talk/Help/3.0.0/Postman/Reset/Shelf),
`hitl-mfa-lab.png` (adds Vertical + Demo|Story), `poppy-demo.png` (adds Vertical, orders Shelf
before Help), `mcp-tools.png` (no version, no Demo|Story), `wimse-lab.png` (no Shelf, no
Demo|Story). Fix: a canonical right-cluster order, enforced as a new checker rule (P12).

### F2. Enforced failure: poppy-demo-LAB/chat (P10)
`web/src/components/DiagramReel.css:31-36` — button colours read `--th-bg-card`, `--th-text`,
`--th-status-info` (brand/vertical tokens) instead of shared tokens. Quick fix, unblocks CI.

### F3. Top drift offenders (advisory; convert + allowlist)
| App | Drift pages | Main rules |
|---|---|---|
| id-jag-standalone-LAB | 9 | P2, P9, P10, C1 (own tokens, multi-primary buttons) |
| privilege-logging-LAB | 8 | P9, P10, J1 (hand-rolled JSON) |
| meridian-air-LAB | 8 | P9, P10 |
| idjag-runner-LAB | 7 | P9, P10 |
| appfire-agent-governance-LAB | 7 | P9, P10 |
| customer-agent-LAB | 6 | P9, P10 |
| ai-demo-standalone-LAB | 5 | P9, P10 |
| privilege-bedrock-assume-role-LAB | 4 | P9, P10 |
| poppy-verification-LAB | 4 | P9, P10 |
| pingone-signin-LAB | 4 | P9, P10 |

### F4. Rule frequency (what to attack first)
P9 multiple-primary-buttons: 69 page findings · P10 non-shared button colours: 47 ·
P2 banner not first/hardcoded live: 33 · H1 h1/main landmark: 38 · C1 contrast: 23 ·
V1 vendored css differs: 16 · J1 hand-rolled JSON: 14 · A2 focus styles: 16.

### F5. Learning Hub breaks the family shell
`learning-hub.png`: serif system font, no pill nav, no theme toggle, no simulation banner,
serif "Page not found". It is the family's front door for learners — it should be the best
citizen, not an outlier.

### F6. trusted-issuers-LAB breaks the shell
`trusted-issuers.png`: bare text link title, no shell bar, no brand block, banner close but
chrome entirely nonstandard. Already flagged P3/P10/A1.

### F7. Empty/loading states are inconsistent
`mcp-tools.png` shows "No saved connections yet." as a plain paragraph; other labs use
dashed-border placeholders ("Run a use case to draw its sequence", appfire) or nothing. Fix:
one `.empty-state` pattern (dashed border, muted text, optional action button).

### F8. Banner styling drift
mcp-tools uses a beige "Ping release claim, UNVERIFIED" banner variant and ai-guard a
gold-bordered claim strip; neither is in the standard. Legit need (evidence-status banner) —
standardize as a third banner variant `data-claim="unverified"` with fixed tokens.

### F9. Lab-proxy 502s during audit
a2a-lab, privilege-demo, idjag-runner, customer-agent, saas-access, pingone-lab were down
(not started). Not a UI bug, but screenshots + demo readiness suffer; the shelf marks green
correctly for these.

## 4. The new standard — what to add to `STANDALONE-UI-PATTERNS.md`

New rules (mock: `shared/ui-standard-mock.html` stays normative for layout; this audit adds a
header/cluster mock — proposed: `shared/header-standard-mock.html` already exists, extend it):

1. **P12 — right-cluster order (enforced):** after the pill nav, the fixed order is
   `Mode · [Vertical] · Presenter · Talk track · Help · [version] · [Postman] · Reset ·
   Demo|Story · Shelf↵ · Theme · Text size`. Optional items may be omitted, never reordered.
2. **P13 — empty state (enforced):** every empty list/panel uses `.empty-state`
   (dashed 1.5px `--border` border, radius 10px, `--muted` text 0.9rem, optional one
   secondary action). No bare paragraphs, no blank space.
3. **P14 — evidence-claim banner (enforced):** the UNVERIFIED/claim banner is a variant of the
   standard banner: same position (first content element), `class="banner" data-claim="unverified"`,
   `--status-warn` left edge + `--status-warn` strong label, body `--text-body`. Apps must not
   invent their own colours.
4. **H1 promoted to enforced** for converted pages (it already is in spirit; make allowlisted
   pages fail on it).
5. **Fleet landing page rule:** Learning Hub and demo-shelf use the standard shell too
   (Montserrat, pill nav, theme toggle). Serif/system-font landing pages are drift.

### Mock

A new mock showing the canonical header order + empty state + claim banner:
`shared/header-standard-mock.html` (extend the existing file — see commit in this branch).

## 5. Prioritized fix list

| # | Item | Effort | Where |
|---|---|---|---|
| 1 | Fix poppy-demo P10 (DiagramReel.css → shared tokens) | 15 min | poppy-demo-LAB |
| 2 | Convert top-10 drift apps to allowlist (P9 one-primary, P10 tokens) | 2–3 days | per-app repos |
| 3 | Add P12/P13/P14 rules to checker + mocks; migrate the 12 labs visibly out of order | 1 day | meta-repo + labs |
| 4 | Learning Hub re-shell (Montserrat, pill nav, banner) | 0.5 day | learning-hub-LAB |
| 5 | trusted-issuers shell rebuild | 0.5 day | trusted-issuers-LAB |
| 6 | J1: replace hand-rolled JSON with shared JsonPane (privilege-logging, wimse, token-workbench, id-jag) | 1 day | per-app |
| 7 | A2 focus styles + C1 contrast fixes in flagged apps | 1 day | per-app |
| 8 | Stand up the six 502 labs before the next demo day | — | ops |

## 6. Screenshots

All in this folder (`docs/ui-audit-2026-11-27/*.png`), 1440×900, light theme, via lab-proxy.
