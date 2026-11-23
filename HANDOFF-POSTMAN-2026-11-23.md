# Postman Handoff — AI-DEMO-Standalone lab fleet (2026-11-23)

## What exists

**21 Postman collections** (one per standalone lab) + **5 companion MCP servers** + **CI enforcement** + **one-big import file**. All merged to `main` on GitHub (`curtismu7/AI-DEMO-Standalone`), all labs deployed locally, all health checks green.

## File layout

| Location | What |
|---|---|
| `standalone/<lab>/postman/` | **Authoritative** per-lab: `spec.json` (source), `<slug>.postman_collection.json` (generated), `<slug>.live.environment.example.json` (placeholders) |
| `postman/all-labs.postman_collection.json` | **One-big import** — all 21 labs, folder-per-lab, use-case-first descriptions |
| `postman/all-labs.live.environment.example.json` | Merged placeholder env for the one-big import (16 vars) |
| `postman/collections/<lab>/`, `postman/environments/<lab>/` | Master mirror (generated copy of each lab's files) |
| `postman/README.md` | Import guide + regeneration rules |
| `shared/postman/generator.mjs` | `spec.json` → Postman v2.1 collection |
| `shared/postman/fill-env.mjs` | Fills git-ignored live env from `~/Development/.env` |
| `shared/postman/bundle.mjs` | Mirrors labs → `postman/collections/`, `--check` for CI |
| `shared/postman/merge-all.mjs` | Merges mirror → one-big import, `--check` for CI |
| `shared/postman/ci-check.sh` | CI job: boot lab server, run newman, fail on assertion |
| `shared/postman/README.md` | Generator/fill-env conventions |

## Key conventions

- **Labs are authoritative.** Never hand-edit generated collections or the master mirror. Change `spec.json`, regenerate in the lab, re-bundle, re-merge.
- **Secrets never committed.** Committed envs are placeholders only. Filled files (`<slug>.live.environment.json`) are git-ignored; exist locally for cimd, id-jag-standalone, token-workbench, mcp-resource-server, privilege-api-explorer.
- **Bare-shape honesty.** Live-mode labs answer their honest refusal (`409 pf_not_configured` / `needs-setup`) in a bare checkout — tests accept it. Fill real values for full live runs.
- **`(MOCK ONLY)` folders** hit the lab's in-process simulation; no live form exists.
- **Deterministic IDs**: `_postman_id: postman-<slug>`; empty-string env placeholders.
- **Local port caution**: OrbStack lab-proxy holds 7813–7830 — run local ci-checks on ports outside that range.

## Regeneration flow (after changing any lab's collection)

```bash
# 1. In the lab repo: edit postman/spec.json, regenerate
cd standalone/<lab> && node ../../shared/postman/generator.mjs --spec postman/spec.json

# 2. In the meta-repo: re-mirror + re-merge
node shared/postman/bundle.mjs
node shared/postman/merge-all.mjs

# 3. Verify + commit
node shared/postman/bundle.mjs --check
node shared/postman/merge-all.mjs --check
```

## CI status

- `postman` job green on **all 21 labs' mains** — boots the lab's server, runs the collection, fails the build on any route change that breaks it.
- Pre-existing unrelated reds (NOT postman, flagged for owner): stolen-token/wimse host-hygiene, id-jag `check-ui-standard.sh`, intent-par build(26).

## How to test / demo

```bash
# Run one collection against its running lab
cd ~/Development/AI-DEMO-Standalone/standalone/session-LAB
npx newman run postman/session-lab.postman_collection.json -e postman/session-lab.live.environment.example.json

# Import into Postman app
#   Option A (everything): postman/all-labs.postman_collection.json + postman/all-labs.live.environment.example.json
#   Option B (per lab):    standalone/<lab>/postman/<slug>.postman_collection.json + matching example env
# Select the env in Postman's dropdown, then Run collection.

# Local CI check
bash ../../shared/postman/ci-check.sh <slug> /api/health <startcmd>
```

## MCP servers (companion, not Postman)

Five labs ship stdio servers (`<lab>/mcp/server.mjs`): cimd, id-jag, mock-authorize, token-workbench, mcp-gateway-lab. Smoke-tested via stdio JSON-RPC; run with the MCP Inspector (`npx @modelcontextprotocol/inspector node mcp/server.mjs`).

## Merged PRs (all on `curtismu7/AI-DEMO-Standalone`)

- #493 generator/fill-env/README · #520–522 ci-check.sh + port derivation + quoting fix · #517, #523 pin bumps · #524 release notes 3.13 · #525 master bundle · #526 all-labs one-big import
- Lab PRs: 21 collections + 21 CI wirings + shape fixes (cimd #32/#33, token-workbench #31/#32, privilege-api-explorer #20/#21, id-jag #37/#38, mcp-resource-server #8/#9)

## Optional next steps (status 2026-11-23, later session)

1. ~~Shelf-entry postman mentions~~ DONE — all 20 labs with a spec got a `postman` block
   in `docs/shelf-entry.json` (collection + env paths), committed and pushed to each lab's
   main. Meta-repo submodule pins for these are NOT yet bumped (a follow-up pin PR).
2. ~~`postman:generate` npm target~~ DONE — `shared/postman/generate-all.mjs`:
   `node shared/postman/generate-all.mjs [--check | <lab>…]` regenerates all labs with a
   spec, re-bundles, re-merges.
3. **NOT done** — the pre-existing non-postman CI reds (stolen-token/wimse hygiene tests
   reject `local.ping-devops.com` in docker-compose.yml, which is the owner-blessed family
   lab-proxy domain; fix = extend the allowlist regex in each lab's `scripts/repo.test.mjs`).

## Bugs found by running the collections (2026-11-23, fixed in PR #529)

1. **{{LAB_BASE}} undefined in `postman/all-labs.postman_collection.json`** — merge-all
   dropped each lab's collection variables. Newman also does not cascade folder-level
   variables into nested folders. Fix: namescope per-lab variables at the merged-collection
   level (`LAB_BASE_<SLUG>`) and rewrite `{{LAB_BASE}}` inside the folder.
2. **Silent zero assertions** — generator wrote bare assertions at script top level;
   Newman 6 registers nothing outside `pm.test()`. Fix: generator wraps all of a request's
   tests in one `pm.test(<request name>, …)`. All 21 labs regenerated.
3. Verified after the fix (Newman, JUnit): CIMD 14/14 per-lab and in the merged import,
   stolen-token 9/9, session 12/12 — against the locally running Docker labs.
4. Distribution: the 21 lab collections are also mirrored into
   `curtismu7/ping-postman-packages` under `labs/<lab>/` (the central SE-facing repo).
