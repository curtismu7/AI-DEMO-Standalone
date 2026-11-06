# UC conversion recipe: AI-DEMO2 use cases → standalone labs

How to convert an AI-DEMO2 use case (or cluster of related use cases) into a standalone `-LAB` app.
Written 2026-11-06 after the UC40 (ID-JAG) conversion; the pilot for this recipe is
`mcp-gateway-lab-LAB` (UC30 + UC31 + UC32). The rulebook (`~/Development/STANDALONE-RULES.md`)
always wins; this doc adds the conversion-specific pieces.

## Scope decisions (owner, 2026-11-06)

- **High-value clusters, not all 49.** Related use cases merge into one lab; one lab per cluster.
- **Mock-first** is the default for every converted lab (rule 1); Real is owner-run per rule 19.
- **Shelf rollout**: every converted lab is colleague-ready — public/Internal repo under `curtismu7`,
  shelf entry, lab-proxy route, meta-repo pin.
- **Cross-lab calls are opt-in, never a dependency.** A converted lab's primary flow must be fully
  self-contained in Mock mode. Where calling another lab genuinely helps (e.g. diagram-studio data),
  the lab calls it over the lab-proxy and says so in its README — but must run without it.

## The cluster map

| Lab (planned) | UCs | Story | Priority |
|---|---|---|---|
| mcp-gateway-lab-LAB (pilot) | UC30, UC31, UC32 | Third-party MCP server scoped at the gateway; live policy reconfigure | 1 |
| hitl-mfa-lab-LAB | UC7, UC8, UC22 | MFA step-up, HITL consent, CIBA out-of-band approval | 2 |
| delegation-lab-LAB | UC1, UC9/UC9A, UC21 | Consent-only delegation, entitlement checks, tiered capabilities | 3 |
| a2a-lab-LAB | UC2, UC2.5, UC2.6, UC2.7 | A2A delegation family (distinct from existing A2A wire-protocol labs) | 4 |
| attack-defense-lab-LAB | UC4, UC5, UC10–UC18 | Attack/defense scenarios, one per UC, tester-style | 5 |
| resilience-lab-LAB | UC29, UC18 | Fail-closed token validation, overload defense | 6 |
| Later | UC19, UC20, UC33–UC35, UC46/46A/47, UC-TOOL1–3, UC-MUSE1, verticals | Decide after the pilot proves the recipe; UC46 may reuse existing privilege labs | — |

## Conversion steps

1. **Read the source use cases** in `AI-DEMO2/demo_api_server/config/useCases.js` (read-only; the
   shared AI-DEMO2 checkout is never edited). Extract: buyer story, trigger, expected outcome,
   product roles, and the real enforcement logic (routes/scripts) for behavioral parity.
2. **Rewrite customer-neutral.** No AI-DEMO2 identifiers: no repo names, tenant ids, client ids,
   hostnames, catalog ids. Only `.invalid`/`.example` hosts. Copy patterns, never import.
3. **Scaffold** from the freshest existing lab (as of this writing: `agent-preferences-lab`).
   Structure: npm workspaces `server` (Express, node:test) + `web` (React/Vite/Vitest), plus
   `scripts/`, `docs/`, `Dockerfile`, `docker-compose.yml`, `ci.yml`.
4. **Claim the lab on the board** (`STANDALONE-COORDINATION.md`): repo row, port block, catalog id.
5. **Build in 3 reviewed stages** (core, web, integration), each with an independent skeptical
   reviewer (told to load the `standalone-demo` skill and read the rulebook) and a fix pass.
6. **Conformance gate** `node ~/Development/demo-kit-base/scripts/conformance.mjs <repo> --new`
   → zero FAIL. **Owner approval** before repo creation, every time.

## What every converted lab ships (rulebook essentials, conversion-flavored)

- **Mock engine**: in-process mock issuer/gateway/backends with real crypto (ES256 via
  `createECDH` + `createPrivateKey` — never `crypto.generateKeyPairSync('ec')`). Mock tokens carry
  `"mock": true` and a `mock-` kid; raw token display is education (rule 4); secrets write-only.
- **netguard** with self-test: zero real outbound; the mock's behavior parity with the real product
  logic is the point of the conversion.
- **Rule 19 toggle**: `GET /api/info` → `{ source, realAvailable, realReason }`;
  `POST /api/mode` with exactly `{ source: "mock"|"real" }`; 409 + disabled-Real tooltip when
  unconfigured; Real settings from `~/Development/.env` (owner-verified); banner on every page
  says what is simulated (rule 2). Canonical `standalone-ui.css` pin + `check-ui-standard.sh`.
- **Playground UI**: the use-case scenarios as runnable steps with request/token/verdict panes,
  ReactFlow diagrams loaded by name from diagram-studio data (rules 5/17), presenter mode +
  `docs/talk-track.md`, stories as data with `{{cast}}` tokens (rule 10), 375px + dark/light.
- **Packaging**: `GET /api/health` → `demo-health/1`; doctor; Reset (API + script); workspace id;
  Docker (OrbStack, loopback publish, non-root, read-only); `ci.yml` Node 26 + gitleaks +
  forbidden-strings; Learning Hub `content-pack.json`; `docs/shelf-entry.json` (with
  `pingProducts: []` per rule 20); `CLAUDE.md`; history scan 0.

## Port blocks and lab-proxy

- Claim a free port block on the board; per-lab port ranges stay inside it; never use the
  forbidden ports (8080, 5173, 4000, 4400, 4510, 4600–4601, 18080, 19080, 19090).
- Users reach the lab at `https://local.ping-devops.com:8443/<app>/` (lab-proxy; `LAB_ALLOWED_HOSTS`
  lets the lab answer the proxy Host). Adding a lab = one runtime-resolved proxy entry + cookie-map
  pair in `shared/lab-proxy/nginx.conf`; run `shared/lab-proxy/check-config.sh` before committing.
- Pin the lab as a submodule of `AI-DEMO-Standalone` once merged (`standalone/<name>-LAB`).

## Sync-back to AI-DEMO2 (optional, per shared idea)

Converted labs and the app tell the same story; keep them honest the way `id-jag-kit-wip` does:
- **Vendored files** (plain functions/data) copied by script, CI-enforced, manifest naming the kit commit.
- **Feature matrix** in the lab's docs ("app has / lab has / gap") updated in the same PR as the feature.
- PR checklist question: did this change a shared idea, and is the other repo updated or issued?

## Done (per lab)

Real test counts on Node 26; conformance 0 FAIL; CI green on GitHub-hosted runners; Playwright
browser proof through `https://local.ping-devops.com:8443/<app>/` (desktop + 375px, both themes);
shelf card live; board row updated; no cross-lab dependency in the primary path.
