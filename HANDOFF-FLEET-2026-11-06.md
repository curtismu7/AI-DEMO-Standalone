# HANDOFF — Standalone -LAB fleet convergence (2026-11-06, machine load ~165: run heavy suites on the Air via `air-test` or wait for load < 60)

Read this top to bottom before acting. Rules live in `~/Development/STANDALONE-RULES.md` and `~/Development/STANDALONE-CSS-STANDARD.md`; GitHub account is **`curtismu7` ALWAYS** (`gh auth switch --user curtismu7` if a push 403s); Docker is OrbStack, never Docker Desktop; labs are served by the shared lab-proxy at `https://local.ping-devops.com:8443/<app>/`.

## 1. What was done (all committed and pushed)

Every one of the ~65 `-LAB` submodules under `AI-DEMO-Standalone/standalone/` received, per repo (edit → build → test → commit → push):

1. **Theme picker** — auto/light/dark `<select>` in the header, localStorage key `<app>.theme`, only sets `data-theme` on `<html>`. Canonical styles now live in `shared/standalone-ui.css` (`.shell-theme` block). Reference: `privilege-demo-LAB/web/src/AppShell.jsx`.
2. **Shelf back-button** — `ShelfLink.jsx` component + vendored `lib/shelfLink.js`/`server/src/shelfLink.js` + `GET /api/shelf` (`SHELF_URL` from `~/Development/.env`). Service source: `AI-DEMO-Standalone/shared/shelf-link/`. Reference: `privilege-map-LAB`.
3. **Canonical stylesheet re-vendor** — all 56 vendored `standalone-ui.css` copies match `shared/standalone-ui.css`. `scripts/check-ui-standard.sh` rewritten to auto-scan every copy (currently exits 0). Dead duplicate copies deleted in ciba-hitl, gateway-claims, jev-lab, obo-lab, jit-lab.
4. **Rule 19 Mock/Real toggle** — `POST /api/mode` (body exactly `{source: "mock"|"real"}`), `GET /api/info` (`{source, realAvailable, realReason}`), 409 `real_not_available`, header toggle with disabled-Real + tooltip, banner reflects mode, tests for both directions. 12 labs were already compliant (verified). Reference: `pingfederate-LAB/server/src/app.js` (~lines 155-200) + its App.jsx.
5. **Family-standard artifacts** — `docs/talk-track.md` (8 labs), `npm run doctor` (deploy-test-LAB, muse, mcp-demo-client-privilege, privilege-a2a), `docs/shelf-entry.json` (mcp-demo-client-privilege, privilege-a2a), demo-health/1 health endpoints (privilege-a2a, mcp-demo-client-privilege).
6. **Demo-shelf** — Kind and Status dropdowns removed (`web/src/App.jsx`, tests updated); Ping products dropdown is the primary filter; product tags audited across `.data/demos.local.json` (72 demos, all with ≥1 product tag); seed registry description-length bug fixed.
7. **Meta-repo** — all submodule pins bumped and pushed (`5e20cb1`, plus later pin commits).

Two live demos were rebuilt and verified through the proxy (see §5).

## 2. Known-good state right now

- `bash scripts/check-ui-standard.sh` from `AI-DEMO-Standalone/` → exit 0.
- `cd standalone/demo-shelf-LAB && npm run doctor` → `Registry valid (72 demos)` (only pre-existing "Port 4400 is free" FAIL if the shelf is running elsewhere — that check is about the shelf's own port).
- id-jag-standalone-LAB: `main` now contains the merged `pfpf-union` line (merge commit `c291c85`, content identical to `7c8c2bd`). Web build green. 873-874 of 876 web tests pass.
- muse: `main` contains `agent-connect-rename` (doctor + health), 142/142 server tests, pushed.

## 3. OPEN WORK — what you need to finish

### 3a. id-jag-standalone-LAB: 2-3 flaky web tests under machine load (BLOCKING: do not push until understood)
`cd standalone/id-jag-standalone-LAB && git status` shows the merge **committed locally but NOT pushed** (origin/main is behind). Verify with `git log origin/main..HEAD --oneline` (should be 1-2 commits: the theme commit + merge).

Failures seen in full `npx vitest run` (web/), all pass in isolation:
- `src/mode/__tests__/ModeToggle.test.jsx` — "marks Mock as on" (aria-pressed false; passed on re-run)
- `src/customer/__tests__/CustomerConfig.test.jsx` — brand variable `''` vs `'#0b6bcb'` (passed in isolation)
- `src/utils/__tests__/idJagLabelPlacement.test.js` — 60s timeout on the 5-diagrams sweep (deterministic-slow; the canary)
- `src/utils/__tests__/orthoRoute.test.js` — timeout (passed in isolation)

Local load was 165-250 when these ran. **Action:** re-run the full web suite on the Air: `air-test id-jag-standalone-LAB -- sh -c 'cd web && npx vitest run'` (or locally when load < 60). If green on the Air, push: `git push origin main`. If the label-placement timeout persists even unloaded, raise its `testTimeout` (only that test) or mark it `.concurrent`-off and note it in the commit message.

### 3b. Meta-repo pin bump for id-jag
After 3a is pushed: from `AI-DEMO-Standalone/`, `git add standalone/id-jag-standalone-LAB && git commit -m "pin: id-jag-standalone-LAB -> pfpf-union merged to main" && git push`.

### 3c. Owner decisions still open (ask, don't assume)
- **mcp-resource-server-LAB rule-19 waiver**: headless API-only Tool tier, no UI to host a toggle. Options: write `docs/rule-19-waiver.md` mirroring idjag-runner's, or leave it as conformance WARN. Owner preference unknown.
- **privilege-a2a-anthropic-demo-LAB + mcp-demo-client-privilege-LAB**: both registered in the shelf with `catalogId` omitted (no catalog row matches; D118 is taken by gateway-suite). If the owner wants catalog rows, that's a catalog.json edit + tags.

### 3d. Leftover hygiene (small, optional)
- `id-jag-kit-wip/web/src/standalone-ui.css` was re-vendored but id-jag-kit-wip is an untracked folder in the meta-repo (`?? id-jag-kit-wip/`) — ask the owner whether to submodule it or leave it.
- The wave-1 theme agent appended `.shell-theme` into the vendored stylesheet of agent-mcp-door-demo-LAB / agentcore-pingone-demo-LAB / federated-identity-LAB before the canonical block existed; those were overwritten by the canonical copy, so nothing to do — but if a repo's header looks unstyled, check the app CSS still has no `.shell-theme` duplicate.
- Two commits mention "1 ahead" ghost state in ai-gateway-client-LAB — resolved (stale ref); everything is pushed.

## 4. Repo-state gotchas you will hit

- Many labs sit on **detached HEAD** in the meta-repo checkout. Push with `git push origin HEAD:main`. Before editing, `git fetch origin && git log origin/main..HEAD` to see if you're behind.
- `gh` periodically reverts to the `cmuir_pingcorp` account (403 on push). Switch back every time: `gh auth switch --user curtismu7`.
- `npm ci` is needed in any repo with missing node_modules before tests. Vitest for web, node:test or vitest for server — check each package.json.
- Commit rule: **no Co-Authored-By trailers**, no AI attribution. Push as curtismu7.
- Worktree hook: `Write`/`Edit` is denied in some main checkouts (AI-DEMO2 rule); standalone submodules are writable directly.
- Pre-existing test failures NOT caused by this work (verified by stash-testing): demo-shelf-LAB `entrypoints.test.js` ("npm run agent keeps running…"), customer-agent-LAB App.test workspace header. Leave them; mention, don't fix.
- The 60s label-placement timeout pattern: heavy geometry tests time out when load > 60. Prefer `air-test` for full suites.

## 5. Live demos (running now, owner-test URLs)

- **Privilege A2A Anthropic Demo** — `https://local.ping-devops.com:8443/privilege-a2a/` — `runtime: live` (real Anthropic key from AI-DEMO2's env copied into repo-local `.env`, git-ignored). Compose: one image, 3 containers (main 6881 / worker 6882 / MCP 6883). Compose file added at `standalone/privilege-a2a-anthropic-demo-LAB/docker-compose.yml` (pushed `54af9a9`).
- **MCP Demo Client for Privilege** — `https://local.ping-devops.com:8443/mcp-demo-client/` — `runtime: offline` (mock; configure a gateway URL in its UI to go live). Dockerfile + compose added (`3004e75`; `server.js` got a `HOST` env override so the container binds 0.0.0.0 while the host publish stays loopback-only).
- Both proxy routes fixed in `shared/lab-proxy/nginx.conf` (prefix locations + prefix-strip **rewrite** — variable `proxy_pass` does NOT strip path prefixes; this cost an hour, see commit `e40016b`).

## 6. Verify-before-done checklist

1. `bash scripts/check-ui-standard.sh` → exit 0.
2. Per repo you touch: build + full test suite green (or Air-verified), commit pushed, `git log origin/<branch>..HEAD` empty.
3. For any URL claim: `curl -sk https://local.ping-devops.com:8443/<app>/api/health` and paste the JSON.
4. Never claim done from a piped exit code; inspect `PIPESTATUS` or redirect output.
