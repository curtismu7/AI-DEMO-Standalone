# HANDOFF 2 — Standalone -LAB fleet (2026-11-06 late, supersedes HANDOFF-FLEET-2026-11-06.md where they overlap)

Machine load has been 90–250 all evening. **Do not run full test suites locally** — use `air-test <repo>` or wait for load < 60. This file is the current state; the earlier handoff still has useful per-workstream background but its "open work" section is superseded by this one.

**UPDATE 2026-11-07 — §2a and §2c below are RESOLVED (see "Resolved" at the end of §2). The warning that follows is kept for history only.**

**(RESOLVED, was:) `scripts/check-ui-standard.sh` appears to HANG on this machine right now.** It ran clean (exit 0) several times earlier today, then began hanging with load > 90. Diagnosis so far: `find` over `standalone/` returns 64 copies in seconds, the script itself produces zero output even after minutes. Possible causes to check first: (a) pure CPU starvation from the parallel agent sessions still finishing (three other sessions were running Playwright proofs on delegation-lab and writing progress docs), (b) a new submodule added today (`delegation-lab-LAB`) whose tree contains something pathological, (c) the script's `find` unlinked from a pipe. Fix: add `-prune` for node_modules/dist instead of `-not -path` (find still *walks* those trees), or test on the Air. Until it passes again, do not trust "exit 0" claims from it.

## 1. Everything committed and pushed (verified)

- **All ~65 labs**: theme picker (auto/light/dark select, `data-theme` on `<html>`), shelf back-button (`ShelfLink` + `GET /api/shelf`), rule-19 Mock/Real toggle (`POST /api/mode` `{source}`, `GET /api/info` `{source, realAvailable, realReason}`, 409, disabled-Real + tooltip), canonical `standalone-ui.css` re-vendored everywhere, doctor scripts, talk tracks, health endpoints, shelf entries. `git status` clean in the meta-repo; `origin/main..HEAD` empty in every submodule.
- **Meta-repo** `curtismu7/AI-DEMO-Standalone` main is pushed through `e92cf80` (another session's delegation-lab progress commit) — zero unpushed commits.
- **id-jag-standalone-LAB**: `pfpf-union` merged to main; PR #2 (forbidden-strings CI fix + stylesheet guard) merged via REST API — GraphQL `pr merge` fails on this EMU account, use `gh api -X PUT repos/<owner>/<repo>/pulls/N/merge -f merge_method=merge`. Main CI green (run 42334353161). Local checkout fast-forwarded to `b4044c4`.
- **muse**: `agent-connect-rename` merged to main, 142/142 tests, pushed.
- **Demo-shelf**: Kind/Status dropdowns removed, Ping products dropdown primary, 72 demos registered all with product tags, registry-valid.
- **Two live demos running** (owner-test URLs):
  - `https://local.ping-devops.com:8443/privilege-a2a/` — `runtime: live` (Anthropic key from AI-DEMO2 env in repo-local `.env`, git-ignored). Compose: one image, 3 containers (6881/6882/6883).
  - `https://local.ping-devops.com:8443/mcp-demo-client/` — `runtime: offline` (mock by design).
  - Proxy lesson (do not relearn): variable `proxy_pass` does **not** strip a path prefix — the two labs' prefix locations use `rewrite ^/<app>(/.*)$ $1 break; proxy_pass http://$up;` (commit `e40016b`).

## 2. OPEN — what remains

### 2a. Re-verify `check-ui-standard.sh` (top priority, cheap)
When load < 60 (or on the Air): `bash scripts/check-ui-standard.sh` must exit 0 over all vendored copies (was 56, plus delegation-lab if it vendors one). If it still hangs unloaded, apply the `-prune` fix described above and commit. This is the drift gate for the whole family — a red/hanging gate means future edits can silently diverge the stylesheet again.

### 2b. delegation-lab-LAB (new today, owned by another session)
Another agent session landed `delegation-lab-LAB` (UC1/UC9/UC9A/UC21, catalog D120) and pushed pins + a progress commit (`e92cf80`). Its handoff is at `standalone/delegation-lab-LAB/90fab0a` ("docs: handoff"). **Do not duplicate its work** — read its handoff first. It also dirties the meta-repo pin (`M standalone/delegation-lab-LAB` as of this writing): bump the pin only after its session finishes, or coordinate.

### 2c. Owner decisions still open (ask, don't assume)
1. **mcp-resource-server-LAB rule-19 waiver** — headless API-only Tool tier, no UI for a toggle. Options: write `docs/rule-19-waiver.md` mirroring idjag-runner's, or leave as conformance WARN.
2. **Catalog ids** for privilege-a2a-anthropic-demo-LAB and mcp-demo-client-privilege-LAB — both registered in the shelf with catalogId omitted (no matching row; D118 taken by gateway-suite). Adding rows = `demo-shelf-LAB/data/catalog.json` + `catalog-tags.json` edit, owner-approved ids.
3. **id-jag-kit-wip/** — untracked folder in the meta-repo (not a submodule). Submodule it or leave it.

### Resolved 2026-11-07
- **2a** — `-prune` fix committed and pushed (`d89f85d`). The gate now exits 0 over 64 vendored copies in seconds (re-run after the id-jag-kit-wip removal below).
- **2c.1** — mcp-resource-server-LAB: `docs/rule-19-waiver.md` merged (owner decision 2026-11-07; PR #1).
- **2c.2** — privilege-a2a-anthropic-demo registered as **D121** (demo-shelf-LAB PR #4). mcp-demo-client-privilege already had D2 on main, so no new id for it. The shelf repo's CI does not start on PRs here: run it by hand (`gh workflow run CI --ref <branch>`) before merging.
- **2c.3** — id-jag-kit-wip was a stale duplicate clone of id-jag-standalone-LAB (already a submodule), not a separate project. Owner chose delete; checked first that every commit was on a remote, then removed the folder, its worktree, its `.gitignore` line and its `check-ui-standard.sh` reference.
- Parent pins bumped for demo-shelf-LAB and mcp-resource-server-LAB (`65682b3`).

### 2d. Flaky-test watchlist (no action unless they block a PR)
- id-jag web: `idJagLabelPlacement` (60s timeout sweep), `orthoRoute`, `CustomerConfig` brand-var, `ModeToggle` aria-pressed — all pass in isolation, all failed under load ≥ 90. If a CI run hits them, re-run once before investigating.
- Pre-existing, NOT ours (stash-verified): demo-shelf `entrypoints.test.js` (agent keepalive), customer-agent-LAB workspace-header test.

## 3. Traps (all of these actually happened)

- **GitHub account**: `gh` drifts back to `cmuir_pingcorp` constantly. 403 on push → `gh auth switch --user curtismu7`. On EMU repos `gh pr merge` (GraphQL) is Unauthorized — use the REST PUT above.
- **Detached HEADs**: many labs sit detached in the meta-repo checkout. `git push origin HEAD:main`. Always `git fetch origin && git log origin/main..HEAD` before editing.
- **`npm ci` first** in any repo with missing node_modules. Vitest for web, node:test or vitest for server — check package.json.
- **Commits**: no Co-Authored-By, no AI attribution, ever.
- **Rule 19 shape is strict**: body exactly `{source: "mock"|"real"}` (extra keys → 400); 409 error code `real_not_available` with a how-to reason; mock-only labs keep Real visible but disabled with an honest reason (reference: `pingfederate-LAB/server/src/app.js` ~155-200).
- **Theme picker contract**: select Auto/Light/Dark; "auto" = remove `data-theme` (not set it to "auto"); localStorage key `<app>.theme`, removed on auto. Styles come from the shared `.shell-theme` block only — app CSS must not redefine it (id-jag's dark-bar override is scoped layout/color only).
- **Registry validation**: catalogId/description/composeFile constraints — omit fields rather than null them (registry rejects null strings); descriptions ≤300 chars; the two shelf entries for the new demos demonstrate the omit pattern.
- **Pre-existing failures**: leave them, cite them, don't fix them into your PRs.

## 4. Verify-before-done

1. `bash scripts/check-ui-standard.sh` → exit 0 (after fixing 2a).
2. Per repo touched: build + suite green (Air for full suites), pushed, `git log origin/<branch>..HEAD` empty.
3. URL claims: paste real `curl -sk https://local.ping-devops.com:8443/<app>/api/health` JSON.
4. Never trust piped exit codes; inspect output.
