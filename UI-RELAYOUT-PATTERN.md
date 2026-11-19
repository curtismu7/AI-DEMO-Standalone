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

### Batch 4 (2026-11-19)

| App | Repo | Notes |
|---|---|---|
| agent-mcp-door-demo | `agent-mcp-door-demo-LAB` | Talk-track sections numbered 1–4; Dockerfile fixed to `COPY docs docs` |
| agent-registry-demo | `agent-registry-demo-LAB` | Talk-track tab numbered; digit via `data-n`/`::before` |
| agentcore-pingone-demo | `agentcore-pingone-demo-LAB` | Sections numbered 1–5; Dockerfile fixed to `COPY docs docs` |
| aggregate-entitlement | `aggregate-entitlement-LAB` | Decision sections numbered; `.hops-grid` for hop cards |
| ai-demo-standalone | `ai-demo-standalone-LAB` | Landing page sections numbered; grid stacks <900px |
| ai-guard-sidecar | `ai-guard-sidecar-LAB` | Talk-track component numbered 1–4; `.duo` pairing |
| appfire-agent-governance | `appfire-agent-governance-LAB` | Governance sections numbered; mosaic → stacked full-width sections |
| cimd | `cimd-LAB` | Flow sections numbered 1–5; `@media` stacking |
| coding-agents | `coding-agents-LAB` | Agent sections numbered; `.cols` → paired 2-col grids |
| customer-agent | `customer-agent-LAB` | Story sections numbered via `data-n`/`::before` |
| data-protection | `data-protection-LAB` | Protection layers numbered 1–4; `.hops-grid` |
| demo-map | `demo-map-LAB` | CSS only: `.cols` mosaic → stacked sections, `@media` stacking |
| diagram-prove-lab | `diagram-prove-lab` | Talk-track sections numbered; Dockerfile fixed to `COPY docs docs` |
| diagram-studio | `diagram-studio-LAB` | CSS only: grids stacked <900px; Dockerfile fixed to `COPY docs docs` |
| env-map | `env-map-LAB` | Sections numbered 1–5; Dockerfile fixed to `COPY docs docs` |
| field-notes | `field-notes-LAB` | CSS only: mosaic → full-width stacked sections |
| intent-par-inspector | `intent-par-inspector-LAB` | PAR flow numbered 1–4; Dockerfile fixed to `COPY docs docs` |
| intent-purpose-behaviour | `intent-purpose-behaviour-LAB` | Three-part sections numbered; `.duo` pairing |
| mcp-auth-conformance | `mcp-auth-conformance-LAB` | Conformance checks numbered; `.hops-grid` for hops |
| mcp-discovery | `mcp-discovery-LAB` | Discovery sections numbered; Dockerfile fixed to `COPY docs docs` |
| mcp-gateway-lab | `mcp-gateway-lab-LAB` | Gateway sections numbered 1–5; grid stacks <900px |
| mcp-scanner-lab | `mcp-scanner-lab-LAB` | CSS only: `.cols` converted; TalkTrack layout untouched |
| mcp-skills | `mcp-skills-LAB` | Skill sections numbered via `data-n`/`::before` |
| mcp-surface | `mcp-surface-LAB` | CSS only: mosaic → paired 2-col grids |
| mcp-tools | `mcp-tools-LAB` | CSS only: grids stacked <900px |
| mfa-admin-mcp-lab | `mfa-admin-mcp-lab` | Admin sections numbered 1–4; `.duo` pairing |
| no-tool-no-promise | `no-tool-no-promise-LAB` | Sections numbered 1–5; Dockerfile fixed to `COPY docs docs` |
| observability | `observability-LAB` | Panels numbered; `.hops-grid` for hop cards |
| p1-third-party-exchange | `p1-third-party-exchange-LAB` | CSS only: `.cols` mosaic → stacked sections |
| p1az-inspector | `p1az-inspector-LAB` | Inspector sections numbered; Dockerfile fixed to `COPY docs docs` |
| pf-agent-client-sync-lab | `pf-agent-client-sync-lab` | Sync sections numbered 1–4; grid stacks <900px |
| ping-gateway-route | `ping-gateway-route-LAB` | Route sections numbered; `.hops-grid` for hops |
| pingcli | `pingcli-LAB` | CLI demo sections numbered; `.duo` pairing |
| pingfederate | `pingfederate-LAB` | CSS only: grids stacked <900px |
| pingone | `pingone-LAB` | CSS only: `.cols` converted; TalkTrack untouched |
| pingone-events | `pingone-events-LAB` | Event sections numbered via `data-n`/`::before` |
| pingone-mcp-inspector | `pingone-mcp-inspector-LAB` | Inspector sections numbered 1–5; mosaic → stacked |
| pingone-signin | `pingone-signin-LAB` | Sign-in flow sections numbered; `.duo` pairing |
| poppy-agent-tester | `poppy-agent-tester-LAB` | Tester sections numbered 1–4; grid stacks <900px |
| poppy-verification | `poppy-verification-LAB` | Verification sections numbered; Dockerfile fixed to `COPY docs docs` |
| privilege-bulk-users | `privilege-bulk-users-LAB` | Bulk-user sections numbered; `.hops-grid` for hops |
| privilege-google-secrets | `privilege-google-secrets-LAB` | Secret sections numbered via `data-n`/`::before` |
| privilege-logging | `privilege-logging-LAB` | Log sections numbered 1–5; grid stacks <900px |
| privilege-owasp-lab | `privilege-owasp-lab-LAB` | OWASP sections numbered; `.duo` pairing |
| saas-access | `saas-access-LAB` | Access sections numbered; mosaic → stacked sections |
| secrets-vault | `secrets-vault-LAB` | Vault sections numbered 1–4; `.hops-grid` |
| session | `session-LAB` | Session sections numbered; Dockerfile fixed to `COPY docs docs` |
| spiffe-issuer | `spiffe-issuer-LAB` | Issuer sections numbered via `data-n`/`::before` |
| stolen-token | `stolen-token-LAB` | Token sections numbered 1–5; grid stacks <900px |
| token-workbench | `token-workbench-LAB` | Workbench sections numbered; `.duo` pairing |
| wimse-lab | `wimse-lab-LAB` | WIMSE sections numbered; `.hops-grid` for hops |
| worker-demo | `worker-demo-LAB` | Worker sections numbered; Dockerfile fixed to `COPY docs docs` |
| workload-cert-lab | `workload-cert-lab-LAB` | Cert sections numbered 1–4; grid stacks <900px |

Not applicable in this batch (single-form/diagram/InspectorShell layouts, or dead-CSS-only): ai-gateway-client, gateway-suite, intent-console-lab, jev-lab, jit-lab, mcp-elicitation, obo-lab, pdf-to-md, personal-agent-demo, privilege-api-explorer.

## Gotcha: Docker builds that import files outside `web/`

If the web build imports from outside `web/` (e.g. `import x from "../../docs/talk-track.md?raw"`), the Dockerfile must `COPY` those paths into the build stage — a plain `COPY web web` fails inside Docker even when the local build passes. Also check `.dockerignore` — a `docs` exclusion line silently defeats the COPY. Batch 4 fixed this gap in 14 more repos (agent-mcp-door-demo, agentcore-pingone-demo, diagram-prove-lab, diagram-studio, env-map, intent-par-inspector, mcp-discovery, no-tool-no-promise, p1az-inspector, personal-agent-demo, poppy-verification, session, worker-demo, privilege-api-explorer) — grep for `talk-track.md?raw` imports when adding the pattern to any new app.

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
