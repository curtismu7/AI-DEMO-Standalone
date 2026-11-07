# HANDOFF — Privilege live-decision wiring (2026-11-06 evening session)

Read `HANDOFF-FLEET-2026-11-06.md` first for the fleet-wide rules and standard. This file covers ONLY the "make the demos go through live Privilege" work and what is still open. GitHub account **`curtismu7` ALWAYS**; OrbStack, never Docker Desktop; `gh auth switch --user curtismu7` if a push 403s.

## 1. What this session built (all committed, pushed, verified live)

### AI-DEMO2 (main, PRs #3403 + #3404 merged; local main == origin/main at `93182ff9d…` or later)
- **`POST /api/privilege/decision`** (`demo_api_server/routes/privilegeDecisionDemo.js`, mounted in `server.js` next to `/api/privilege-user-api-keys`): session-guarded, fixed tool allowlist (18 tools), args size cap. Opens an MCP session against the tenant's Privilege AI Gateway mesh frontend `https://a2a-mcp-tools.default.applications.procyon.ai:8643/mcp` with the agent key from the vault (`configStore.getEffective('PRIVILEGE_A2A_MAIN_AGENT_KEY')`), reusing `getProcyonDispatcher()` from `privilegeMcpClient.js` for the container DNS/TLS path. A gateway 403 is surfaced as `decision: "denied", by: "privilege-gateway"` — a real policy verdict, NOT an error.
- **`PrivilegeLiveCheck` component** (`demo_api_ui/src/components/privilege/`) on all five platform pages (`/privilege-intent-triage`, `/privilege-coding-agents`, `/privilege-saas-access`, `/privilege-prompt-log`, `/privilege-pii-detection`): one button runs the page's mapped tool through the gateway and renders the real verdict, latency, upstream payload next to the documented-behaviour model.
- **All five pages live-verified via Playwright** on the running stack: HTTP 200, ~1.2–1.7 s, real payloads (entitlement ledger, investment transactions, KYC record).
- **Tests**: route 7/7 (`tests/routes/privilegeDecisionDemo.test.js`), UI 156/156, build green.
- PR #3404 (diagram v1.0 rename on PersonalAgentFlowPage) was another session's work that this session committed for them.

### Standalone labs (each: aiguardProbe + endpoint + UI panel + tests, all pushed, pins bumped at meta `65f7a7a` and later `541b5a4`)
The shared pattern (canonical file per lab: `server/src/aiguardProbe.js`): the family's **measured A2A JSON-RPC wire** to the SE-cluster AI Gateway `https://bxaigateway.pingidentity.cloud:8623/workeragentdemo/a2a/jsonrpc` (bearer from `CENTRAL_AGENT_A2A_*` in `~/Development/.env`). Measured answer mapping: `completed` → allow (`ALLOW-AIGUARD-CLEAN`), `error "request blocked by security policy"` → deny (`DENY-AIGUARD-BLOCKED`), echoed `[REDACTED:<kind>]` → deny (`DENY-AIGUARD-REDACTED`).

1. **coding-agents-LAB** — no new code; already had Real mode. `CODING_AGENTS_LAB_MODE=real` appended to `~/Development/.env` → the page OPENS in Real mode and every hook decision is the live gateway. Verified: credential prompt → real `DENY-AIGUARD-REDACTED` rendered. Direct URL `http://127.0.0.1:7150` (proxy 403s it by design — loopback-only host guard; shelf card opens the loopback URL).
2. **data-protection-LAB** — `POST /api/privilege-check` + `PrivilegeCheck` panel on the Detect tab; netguard gained a single-host allowlist (Real mode's one outbound); `settings.js` takes `CENTRAL_AGENT_A2A_*`; compose `env_file`s the shared settings. Tests 370/370 (incl. 4 new). Verified live: allow + deny paths both rendered.
3. **intent-purpose-behaviour-LAB** — same wiring on the Three Signals tab. Tests 148/148. Verified live.
4. **saas-access-LAB** — same wiring on the Request tab; route table test updated (23 routes); its `repo.test.mjs` CSS standard bans colour literals → the panel CSS uses `color-mix` over tokens. Tests 251/251. Verified live.

**Shelf** (`demo-shelf-LAB`, pushed `0b77913`): presenter text for all four labs states the Mock/Live/Real basis and that each reaches the live AI Guard. Registry tests pass, image rebuilt, `/api/shelf` verified serving the new text.

## 2. Credentials / config you need
- `~/Development/.env` (mode 600): `CENTRAL_AGENT_A2A_URL`, `CENTRAL_AGENT_A2A_BEARER` (SE gateway), `CODING_AGENTS_LAB_MODE=real`.
- AI-DEMO2: `demo_api_server/.env` has `VAULT_PASSWORD` (line 19); the agent key lives in `~/Development/AI-DEMO2/secrets.vault` as `PRIVILEGE_A2A_MAIN_AGENT_KEY`.
- The Privilege console API (tenant `0428ba4f-169c-436b-aff9-b230496e0e3b`, base `https://local.procyon.ai:8643`) needs header auth `x-api-key`/`x-api-secret` + `x-procyon-session-id` (any UUID). `PROCYON_KEY`/`PROCYON_SECRET` in `demo_api_server/.env` (241-243).

## 3. OPEN WORK — what is left
1. **UI image rebuild for AI-DEMO2** (low priority): the running `ai-demo-*` stack was last built before PR #3404 merged. The page works live anyway (the working tree is bind-mounted), but if you want the image to match main, run `./run-docker.sh` (a plain `docker compose up -d --build ui` timed out at 15 min once — use `run-docker.sh` and let it finish, or check whether `docker compose -f docker-compose.yml build ui` needs the full profile context).
2. **Debug-log check** (trivial): `data-protection-LAB/server/src/app.js` — confirm no `PROBE` console.error remains (one was added and removed during debugging; a `git grep -n "PROBE route reached"` across the four labs is a 10-second check).
3. **id-jag-standalone-LAB** — this session pushed its 36-commit local merge (`c291c85`) to origin/main and bumped the meta pin (`541b5a4`). The fleet handoff says its web suite has 2-3 flaky tests under load; not investigated here.
4. **`mcp-demo-client-privilege-LAB`**: `git status` shows `?` — untracked content inside the submodule (another session's WIP). Left untouched.
5. **Meta-repo stale worktrees** (prunable, other sessions'): `git worktree prune` is safe but was not run.
6. **Pre-existing failures, not this session's**: demo-shelf entrypoints/tags tests (see fleet handoff §"Known-good"); AI-DEMO2 had none from this work.
7. **The 5 AI-DEMO2 pages' tool mapping is deliberately narrow** — each page maps exactly one scenario to one allowlisted gateway tool. If you want deeper integration (e.g. the intent-triage scenarios driving real policy decisions per scenario), that is new product work, not a fix.

## 4. How to verify everything still works (5 minutes)
```
# AI-DEMO2 pages (sign in demouser / Baseball123!):
open https://local.ping-devops.com:4000/privilege-intent-triage   # click the live check under the verdict
# Labs (direct loopback URLs; the proxy 403s coding-agents by design):
open http://127.0.0.1:7150   # coding-agents — opens in Real mode; Evaluate tab runs the real gateway
open http://127.0.0.1:7200   # data-protection — Detect tab → "Run the same text through live Privilege"
open http://127.0.0.1:7100   # intent-purpose-behaviour — same-named button
open http://127.0.0.1:7250   # saas-access — "Send the request text through live Privilege"
# Shelf:
open https://local.ping-devops.com:8443   # search "privilege"; four cards carry the live wording
# Repo state:
cd ~/Development/AI-DEMO2 && git status --short | grep -v '^??' | wc -l      # expect 0
cd ~/Development/AI-DEMO-Standalone && git status --short | grep -v '^??' | grep -v '^ m'   # expect only mcp-demo-client '?'
```
If a push 403s: `gh auth switch --user curtismu7`. If the proxy 502s a lab: `scripts/lab-proxy-watchdog.sh` (auto-attaches networks, self-heals).
