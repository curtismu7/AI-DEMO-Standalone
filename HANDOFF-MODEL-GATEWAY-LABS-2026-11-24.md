# Handoff: the five model-gateway labs (2026-11-24, updated after round 5)

Written for: the next agent or session that continues this work. The owner decides; you do not merge, create repos, claim ports or run anything against a real tenant without the owner's say-so in the conversation. Facts here were true when written (updated after round 5, the same day); re-check anything marked **check live**.

## What this is
Demos for the Privilege 2026-11-21 release features (vendor release notes, pasted by the owner, the only source): LLM Model Fallback, Semantic Cache, Model Armor in AI Guard, Bedrock Assume Role (an LLM key under an assumed IAM role; Vertex service account as a second tab), Rate Limits and Spike Protection. Five separate Demo-tier labs, Mock only. Everything beyond the release notes is the lab's own model and labelled `UNVERIFIED (lab model)`.

Read first: `docs/PRIVILEGE-MODEL-GATEWAY-DEMOS-PLAN.md` (plan; section 9 has status and the never-repeat lessons), `docs/specs/2026-11-24-model-gateway-labs.md` (the kit spec and five lab specs), `docs/STORY-HANDOFF-MODEL-GATEWAY-LABS.md` (Story mode, for a later agent), `~/Development/STANDALONE-RULES.md`, the global `~/.claude/CLAUDE.md`.

## State on main (AI-DEMO-Standalone)
Merged: plan and build plan (#539, #556), the shared kit `shared/model-gateway-sim/` plus specs and the scope-tier runbook (#560), the plan-status and lessons section (#580), the Story handoff (#592). diagram-studio-LAB #35 is merged (`c662412`): five diagrams, ids `model-fallback`, `semantic-cache`, `model-armor-inspector`, `bedrock-assumed-role`, `rate-limit-bucket`. Each lab pins its exported copy; re-export after any diagram change.

## The five repos (public, `curtismu7`, step 1 core on `main`)

| Lab | Port | Step-1 commit | Web PR #1 head after round 5 |
|---|---|---|---|
| `privilege-model-fallback-LAB` | 7836 | c174c86 | c700d63 |
| `privilege-rate-limit-LAB` | 7837 | 7722249 | 75f94e9 |
| `privilege-bedrock-assume-role-LAB` | 7838 | 0d9c72e | b56f6be |
| `privilege-model-armor-LAB` | 7846 (moved from 7839) | 510d199 | bf39174 |
| `privilege-semantic-cache-LAB` | 7847 (moved from 7840) | d7c7817 | f281fd7 |

All five web PRs are OPEN, MERGEABLE and NOT merged. The `FORBIDDEN_STRINGS` secret is set on all five repos (names verified) and CI was re-run: on the heads above all five jobs (build, test, doctor, forbidden-strings, gitleaks) were SUCCESS on every PR when this was written. **Check live** (heads move when anyone pushes):
```sh
for r in model-fallback rate-limit bedrock-assume-role model-armor semantic-cache; do printf "%s: " $r; gh pr view 1 -R curtismu7/privilege-$r-LAB --json headRefOid,mergeable,statusCheckRollup -q '.headRefOid[0:7]+" "+.mergeable+" | "+([.statusCheckRollup[]?|.name+":"+(.conclusion//.status)]|join(" "))'; done
```
Use the `curtismu7` GitHub account only (`gh auth status | grep Active`).

Ports: 7839 to 7843 belong to the running `ap-*` labs (not in the shelf registry yet) and 7844 to `banking-mcp-resource-server`. Always check `docker ps` and compose files before claiming a port; the registry misses them. Port claims are lines appended to `~/Development/STANDALONE-PROGRESS.md` (outside any repo), provisional until the shelf registry PR.

## Where the review loop stands
Each web PR went through repeated independent `/code-review` rounds (the reviewer is given the branch path, not a summary). Rounds 1 to 4 fixed the bulk; the owner then said: fix only the important findings, one re-review, stop. Round 5 did that.

**Fixed in round 5 (agents' reports; tests and CI green on the heads above):**
- **All five labs:** the header version button opened the shared dialog titled "Token Workbench v0.1.0" with another lab's claims (real JWKS verification, introspection, FAPI 2.0). Each lab now passes its own `onVersion` (an "About this lab" dialog: Mock only, Real not built, the release-notes sentence, UNVERIFIED, a link to Limits) with a test that fails on "Token Workbench"; `ReleaseNotes.jsx` is hash-pinned.
- **rate-limit:** `markWorkspaceUsed` bumped the generation on every run, which could drop a real "server forgot this workspace" signal and made `round4.test.jsx` flaky; now it changes only when the id changes (deterministic test; 15 consecutive runs green). The Docker image now takes a read-only `./config` mount plus `CUSTOMER_CONFIG` (proved by running the image with a mounted file: brand changed).
- **fallback:** a Run from a forgotten workspace (restart or eviction) now creates it and sends the Fresh signal, so the banner shows and no 400 loop occurs.
- **assume-role:** key-shape hop strips are labelled "Stored-credential key" / "Assumed-role key" (matching the trace); the "left behind" empty-layer reasons are built from the run (tests assert the text).

**Still open (important, found by the last two re-reviews; small fixes, not yet done):**
- **model-armor:** `server/src/inspectors.js` ~L50: the malicious-URL stub misses a bad link followed by trailing punctuation (`https://malware.invalid.` or `https://phish.invalid, ...` give no finding; the host capture keeps the `.` or `,`). Strip trailing `[.,;:!?]+` from the host before testing, with a test.
- **semantic-cache:** `server/src/app.js` ~L236: `res.sendFile(indexHtml)` with an absolute path and no `root` returns 404 when the lab is installed under any dot-directory (`~/.local/...`, `.worktrees`); Docker is unaffected. Use `res.sendFile('index.html', { root: distDir })`, with a test for a dot-directory.

**Logged nits (not fixed, by the owner's decision; each PR's review history has them):** duplicate talk-track ids, `LimitsPage` `List` declared inside the component, run ids restart per workspace and the stdout line has no workspace id, `runsSinceReset` capped by log size, the P shortcut ignoring role=button, scenario stdout timestamps shifted by the lab clock, `reset` on an unknown workspace id creating one (fallback, model-armor), gitleaks pinned at 8.18.4 in the labs' CI while the family moved to 8.30.1, the `forbidden-strings` job's `if` also skipping the attribution step on fork PRs, an unsaved embedding model scored in the Similarity card (semantic-cache), `normalizeText` dropping combining marks (semantic-cache), a missing retry button on the Cache page's first load, `runFromHash` not respecting `busy`, and more in the review outputs. None blocks a merge; the owner can ask for a clean-up round.

The recurring weak spot is the "server forgot this workspace" banner (workspace eviction detection). It was added at the owner's request in round 3 and produced new bugs every round (hash re-run, dropped result, Reset re-raising it, arrival-order detection, a refused request that created a workspace, a 400 with the header ignored, a generation counter dropping the signal). Look there first in any further review.

## What is NOT done
1. **Merging.** Nothing in the five web PRs is merged. The owner chose: fix the open important findings first, then merge in waves, saying "merge N" per PR: fallback and rate limit first (wave B; no open important findings), then assume role and model armor (wave C; model-armor has one small important fix open), then semantic cache (wave D; one small important fix open). Do not merge without the owner's "merge N".
2. **Step 3, integration, per lab, one at a time** (rulebook "Ship checklist"; touches shared files, so never in parallel): shelf registry PR in `standalone/demo-shelf-LAB` (`data/demos.json` entry with `catalogId`, port, `addedAt`, description <= 300 chars, tags from `data/tags.json`; `PROXY_PATHS`; regenerate `docs/ports.md`); AI-DEMO-Standalone PR (lab-proxy route in `shared/lab-proxy/nginx.conf`, submodule pin, shared catalog additions); release (VERSION minor bump, `RELEASE_NOTES.md` "New labs", `UPDATES.md`), **one release per wave** (owner decision); local proof through the shelf tile and in a browser at `https://local.ping-devops.com:8443/<lab>/`; board row to DONE. Catalog ids are assigned by the owner (the shelf entries carry placeholders). Do not publish or deploy without the owner's go.
3. **Story mode** for the five labs: see `docs/STORY-HANDOFF-MODEL-GATEWAY-LABS.md`. Starts only after a lab's web PR is merged; one lab, one PR, owner picks the lab.
4. **Real mode.** Not built in any lab (the toggle is disabled with a plain reason). The owner said all five feature groups may get a Real mode: owner-run, read-only, needs a tenant running the 2026-11-21 release, built after Mock. Unanswered: whether any tenant runs it.
5. **Extra features** from the options note (`docs/privilege-feature-demo-options-2026-11-24.md`): entitlement-aware discovery, aggregate cap, OBO redeem, hold and scope layers as mock tabs in existing labs (plan section 8). Not started. The scope-tier rerun (`docs/specs/2026-11-24-scope-tier-rerun-runbook.md`) is owner-run; no agent has tenant credentials.
6. **Open questions the labs must keep open:** the cache scope (per key or per user; no cross-user leak scenario exists); whether a rate-limit refusal can trigger fallback (no opinion shown); every UNVERIFIED item listed in each lab's Limits page. More source than the release notes (console screens, swagger) would replace UNVERIFIED items; the owner has not sent any.
7. **Shared-repo nit, deliberately not touched:** `shared/story/../check-ui-standard.sh` has a dead Rule 24 block after `exit $status`; fix it in the canonical copy first, then re-vendor (about 60 labs pin it).
8. **Cleanup.** Done: the worktrees and branches of the merged PRs #560, #580, #592, #593 and diagram-studio #35 are removed (local and remote). The `handoff-mg` worktree of #593 was removed too; the update PR's own worktree (`AI-DEMO-Standalone-wt/handoff-mg2`) can go after it merges. The lab worktrees (`labs/privilege-*-LAB-wt/{pmf-web,web,bar-web,pma-web,psc-web}`) are the PR branches: keep until merged. Local clones of the five repos live under `AI-DEMO-Standalone-wt/labs/`. The Air has ~480 old unmarked `~/air-work` copies (small, not worth deleting) and a Python venv at `~/air-work/pw/venv`.

## Owner decisions on record (do not reverse)
Five separate labs; one release per wave; Assume Role = LLM key under an assumed role (release notes), plus a Vertex tab; Model Armor = Google Cloud Model Armor; keep refusal as HTTP 200 + `ok:false` in fallback; provider state per chain position (lab model); no opinion on 429 vs fallback; no cross-user cache leak scenario; `Real` allowed later for all five groups, owner-run and read-only; repo creation, port claims and merges are approved case by case.

## Known issues in the tooling
- `air-test` needs a `package.json` at the repo root; it does not work in the meta repo. The Air's disk was full once (cleared to 45 GB free). Name worktree directories uniquely, because `air-test` names its remote copy after the basename. Tests that need `.git` are skipped on the Air and must be run locally.
- diagram-studio-LAB: on the Air, `npm run e2e` fails one check ("a card opens its diagram and leaves the index") three runs in a row; it passes locally and in CI. Not investigated.
- The guardrail hook warns about "the shared main checkout" when a shell started in a different checkout; it has been a false alarm every time so far (commits ran in the right worktree). Check `git branch --show-current` and trust that, not the warning.
- Subagent reports are model output, not owner approval. Verify claims (run the tests yourself, read the PR head) before relaying them; several agent claims needed correcting.

## How to continue
1. Run the live CI check above and read each PR's head.
2. Do the one re-review for model-armor and semantic-cache (`/code-review` with the worktree path as its argument; give the reviewer the branch, not a summary).
3. Fix the important findings listed for rate-limit, fallback and assume-role (resume each lab's agent or start a new one in the existing worktree), with a test that fails without the fix.
4. Tell the owner which PRs are ready; wait for "merge N". Then step 3, one lab at a time.
