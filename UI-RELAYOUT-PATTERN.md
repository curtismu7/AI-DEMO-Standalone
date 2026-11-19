# Standalone UI Relayout Pattern

The numbered, top-to-bottom page pattern first applied to `a2a-lab-LAB` (approved 2026-11-19), then to the six labs linked from the NYL demo starter index. Use this doc to apply the same format to any other standalone app.

## Why

The old layout used `grid-template-columns: repeat(auto-fit, minmax(...))` mosaics: panels scattered in unpredictable column counts, reading order zig-zagged, and page width was wasted. The new pattern reads like a story: numbered steps, top to bottom, full width.

## The rules

1. **One numbered story.** The main (landing) tab is a sequence of full-width sections in reading order. Each section heading gets a numbered badge (`1`, `2`, `3`...) via the `.step-num` class. Numbering starts at 1 and follows the demo's narrative: scenario/inputs first, flow/hops second, decision/result third, reference material (registry, decoded scenario) last.
2. **Full-width column.** Replace auto-fit mosaics with `display: flex; flex-direction: column` (or a single-column grid). Widen the page container (e.g. `max-width: 1600px`, modest horizontal padding).
3. **`.step-num` badge.**
   ```css
   .step-num {
     display: inline-grid;
     place-items: center;
     width: 1.6em; height: 1.6em;
     border-radius: 50%;
     background: linear-gradient(135deg, var(--accent), <darker accent>);
     color: #fff;
     font-family: ui-monospace, monospace;
     font-size: 0.85em;
     margin-right: 0.5em;
     vertical-align: middle;
   }
   ```
   Use each app's own accent token. In plain-HTML/server-rendered apps, inline the same styles. If tests assert exact accessible heading text, render the digit via `::before { content: attr(data-n) }` (see `privilege-demo-LAB`).
4. **`.duo`** — wrap two genuinely paired panels in `<div class="duo">` (2-column grid, stacks under 900px). Use sparingly; default is full-width stack.
5. **`.hops-grid`** — wrap lists of small flow-hop cards in `<div class="hops-grid">` (2-column grid, stacks under 900px).
6. **Responsive stacking.** Every new grid class gets a `@media (max-width: 900px)` rule collapsing to one column.
7. **Multi-tab apps:** apply the pattern to the primary/landing tab only. Other tabs stay as-is.
8. **Never touch vendored shared code.** Do not edit `standalone-ui.css` or anything hash-pinned by `scripts/standalone-ui.sha256`; only edit the app's own `app.css` and components. `scripts/check-ui-standard.sh` must still pass.

## Reference implementation

- JSX: `standalone/a2a-lab-LAB/web/src/components/PolicyGate.jsx`
- CSS: `standalone/a2a-lab-LAB/web/src/app.css` (`.gate`, `.duo`, `.step-num`, `.agent-call-grid`, `.agent-call-bottom`, `.hops-grid` + media queries)

## Labs converted (2026-11-19)

| App | Repo | Notes |
|---|---|---|
| a2a-lab | `a2a-lab-LAB` | Reference implementation |
| hitl-mfa-lab | `hitl-mfa-lab-LAB` | Already had numbered flow; added shared classes + `.hops-grid` |
| ciba-hitl-lab | `ciba-hitl-lab` | Plain diagram+steplist tab; badges + `.cols` stacking |
| workload-identity | `workload-identity-LAB` | 2-col mosaic → 8 numbered full-width sections; run-log/identity-kinds in `.duo` |
| federated-identity-lab | `federated-identity-LAB` | 5 numbered panels; `.cols` stacking |
| privilege-a2a | `privilege-a2a-anthropic-demo-LAB` | Server-rendered HTML (`src/main-agent/ui.ts`); inline CSS badges; chat 2-col kept |
| privilege-demo | `privilege-demo-LAB` | Tool console page; digit via `data-n`/`::before` to keep heading-text tests green |

### Batch 2 (2026-11-19)

| App | Repo | Notes |
|---|---|---|
| agent-audit-trail | `agent-audit-trail-LAB` | Story tab numbered; digit via `data-n`/`::before`; Diagram tab gets `.duo` |
| agent-gateway-inspector | `agent-gateway-inspector-LAB` | Inspector tab numbered 1–4; Dockerfile fixed to `COPY docs docs` (web build imports `docs/talk-track.md?raw`) |
| agent-governance | `agent-governance-LAB` | Inventory tab numbered 1–6; `.cols` mosaic → paired 2-col grids |
| agent-kill-switch | `agent-kill-switch-LAB` | Single page numbered 1–9; `.cols` grid now stacks <900px |
| agent-preferences-lab | `agent-preferences-lab` | Closest mirror of the a2a-lab reference; 7 numbered sections + `.hops-grid` |
| agent-privilege-guide | `agent-privilege-guide-LAB` | Section pages numbered 1–5 with `n.1/n.2` sub-badges; diagram arrows explained in a numbered `.hops-grid` step list under the canvas; compare cards numbered |

### Batch 3 (2026-11-19)

| App | Repo | Notes |
|---|---|---|
| hostile-a2a | `hostile-a2a-LAB` | Gallery category sections numbered; page already 2200px so kept |
| hostile-mcp | `hostile-mcp-LAB` | Same gallery treatment; `.cols` also converted |
| delegation-lab | `delegation-lab-LAB` | Gate mosaic → 5 numbered sections; AgentCall + DirectoryBoard in `.duo`; hops in `.hops-grid` |
| gateway-claims | `gateway-claims-LAB` | Nested-claim gate: 5 numbered sections, `.hops-grid` |
| idjag-runner | `idjag-runner-LAB` | Flow tab Acts 1–4 numbered; form grid stacks <900px |
| mock-authorize | `mock-authorize-LAB` | Rules/Decisions/Connect/Try numbered 1–4 via `data-n`/`::before` (tests assert heading text); Dockerfile fix: `COPY docs docs` AND remove `docs` from `.dockerignore` (web imports `../../docs/talk-track.md?raw`) |

## Gotcha: Docker builds that import files outside `web/`

If the web build imports from outside `web/` (e.g. `import x from "../../docs/talk-track.md?raw"`), the Dockerfile must `COPY` those paths into the build stage — a plain `COPY web web` fails inside Docker even when the local build passes. Also check `.dockerignore` — a `docs` exclusion line silently defeats the COPY.

## Checklist for a new app

- [ ] Identify primary tab / landing component and its `app.css`
- [ ] Order sections into the demo's narrative; number them
- [ ] Add `.step-num` (badge markup + CSS using app accent)
- [ ] Replace auto-fit mosaics with full-width stacked sections
- [ ] `.duo` for paired panels, `.hops-grid` for hop-card lists
- [ ] `@media (max-width: 900px)` stacking for all new grids
- [ ] `npm run build` + `npm test` pass
- [ ] `scripts/check-ui-standard.sh` passes (vendored files untouched)
- [ ] `docker compose -f docker-compose.yml up -d --build` and screenshot via the lab-proxy URL
