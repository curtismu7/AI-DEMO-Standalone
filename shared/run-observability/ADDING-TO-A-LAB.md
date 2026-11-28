# Adding run observability to a lab (rule 27): the procedure and what went wrong the first time

For an agent adding the panel to a lab, or re-vendoring it in a sweep. Read `README.md` (the contract) and `SPEC.md` (the acceptance criteria) first;
this file is the procedure and the mistakes. Not vendored, not pinned.

## 0. Before you start
- One writer per repo: check `STANDALONE-COORDINATION.md`, open PRs (`gh pr list --repo curtismu7/<lab>`) and `git worktree list`. If another session is working in the lab, branch from `origin/main` and keep your diff small, or wait.
- Work in a worktree on its own branch (global rule 11). Make the worktree directory name UNIQUE (for example `<lab>-wt/run-obs`): `air-test` names its remote folder after the worktree's basename, so two sessions that both use `run-observability` overwrite each other's files and tests silently run the wrong package.
- GitHub account `curtismu7`; no AI attribution in commits, files or PR text; heavy runs on the Air (`air-test`); capture REAL exit codes (`cmd > log 2>&1; echo EXIT=$?`; the exit code of a pipe to `tail` is the tail's).
- Real tenants and credentials are owner-only. Test Real behaviour with in-process fakes (a fake loopback Elasticsearch, a fake issuer).

## 1. Decide what the lab really has (read the lab first)
Walk the lab's flow and list the decisions it makes or receives. For each of the six layers (person, agent OBO, Authorize, Privilege, agent gateway, resource server) write down one of: an event the Mock computes; a reply the lab receives in Real (`response`); a product log line a reader could return (`logged`); or nothing (`not-logged` with the TRUE reason). Never narrate a hop that does not exist (no "tool dispatched" in a lab with no tool server).
Does the lab read logs in Real? No: vendor the core only. Yes: also the readers file (and name the one loopback Elasticsearch exception in CLAUDE.md and the netguard comment).

## 2. Vendor
From `origin/main`, never from a branch checkout: `git -C <AI-DEMO-Standalone> fetch origin main`, then `git show origin/main:shared/run-observability/<file> > <lab path>` for each file in README "Files". Run `node scripts/run-observability-checkPin.mjs .` (must print ok). The lab's pin test is `assert.deepEqual(checkPin(labRoot), [])` (copy `a2a-lab-LAB/scripts/run-observability.pin.test.mjs`; a lab that vendors the readers file: `meridian-a2a-hop-LAB/web/src/run-observability.pin.test.js`). Never edit a vendored file: change the canonical first (PR to AI-DEMO-Standalone), then re-vendor everywhere.

## 3. The lab's half (copy the closest reference lab)
| Case | Copy |
|---|---|
| Mock only, events computed by the lab's mock | `a2a-lab-LAB` (`server/src/runObs.js`), `hostile-a2a-LAB` (`runRecord.js`, `decisionLog.js`) |
| Mock + Real, replies as `response`, Elasticsearch for `logged` | `meridian-a2a-hop-LAB` (`server/src/runLog.js`), `poppy-demo-LAB` |
| Several kinds of run on one page, per-kind records | `cimd-LAB` (`server/src/runLog.js`, `web/src/RunRecord.jsx`) |

1. **Decision events:** compute each event ONCE, stamp it ONCE, store it per workspace, write one stdout line per decision, and build the record from the stored events. Never re-run a scenario to build the record and never add invented spacing (a record whose times differ from the stdout lines contradicts the only real log the lab writes).
2. **Stdout line:** `<iso> <lab> decision step=... actor=... result=passed|stopped|unclear|no-reply run=<id>`. Every value goes through a sanitiser that keeps only `[A-Za-z0-9._:/@-]`, so a hostile value cannot add a second `key=value` or a second line. Do NOT use words a shared matcher reads as a decision: refused, denied, rejected, forbidden, failed, invalid, expired, mismatch, token, audience, scope, served. Test: every line kind through the shared `classify()` for every product returns null.
3. **Outcomes:** only genuine allow/deny decisions are `allowed` / `refused`; the lab's own security stop is `blocked`; everything else is `info`. In Real, replies the lab received are `response` rows, never `logged`; a 200 carrying a JSON-RPC `error` or `isError` is refused; an unparsed body is `info`; an issuer failure (`server_error`) is not a refusal. A lab's own heuristic (a 3xx with a Location "means accepted") is `info` worded as the lab's reading, never a product decision.
4. **One run per record:** tag events with a run id; keep a bounded per-workspace list that never evicts the current run (cap per kind and per mode); events after the final verdict join nothing; an attempt that began no run says so instead of showing an older record. Store the MODE on the run and return it only in that mode (a Mock run must never come back as a Real reply after the toggle).
5. **Correlation:** Mock passes no ids (names stay readable). Real passes the run's actor client id / trace id so Elasticsearch rows can be tagged `matchedBy: id`; do not declare a person's login name (the core keeps short ids whole).
6. **Route and page:** the lab's API style, same-origin, errors as `{error, message}` JSON (map `RunObsError`), empty/loading/error states, the REQUIRED `source` prop = current mode. In Real: a "Re-read logs" button and one re-read about 5 s after each step (the collector ships with a delay); none in Mock. Log failures to stderr (code and message only), never a bare `catch`. Add a one-line note under the panel when a lane holds something other than its product (a lab-owned gate in "Agent gateway").
7. **Config:** no Docker socket, ever. `RUN_OBS_ES_URL` / `RUN_OBS_ES_READ_APIKEY` only in a lab that reads logs (empty by default, loopback URL, read-only key); a lab that does not read logs has no `RUN_OBS_*` variable anywhere.
8. **README:** where the lab's run leaves logs, where they stream (the text in the shared README), what is `not-logged` today (Authorize has no container log; PingFederate `audit.log` is not shipped; gateway refusal/block shapes unconfirmed; the PingOne audit reader does not exist), and "time = when the lab computed it".

## 4. Tests and proof (evidence before claims)
- Pin via `checkPin`; `assertRunObservability` on a Mock record (and a real-source record built with an inline fake reader only if the lab has a Real log path); mode switch both directions; hostile-name log forging; the stdout-vocabulary classify test; `truncated:false` with a declared id in `detail`; overlapping runs; the lab core-only test (no server file names a reader, comments included).
- Mutation checks: break each new behaviour (a `simulated` row tagged `logged`, the mode ignored, a refusal word in the line, an invented event, a vendored byte edited, an unpinned file added) and see a test fail.
- Real browser (Playwright): Mock and Real (against a fake loopback Elasticsearch), 1280 and 375 wide, light and dark, long names, empty state, a refused and a permitted run. READ the screenshots. The rule-19 toggle and `GET /api/info` must be unchanged. If Docker hangs, run the lab with `node server/src/index.js` and say so.
- `git diff origin/main --stat` shows only intended files; forbidden-strings count 0; gitleaks clean; the lab's `scripts/check-no-ai-attribution.sh` clean.

## 5. Review, PR, merge
- Tier 2: have an independent reviewer read the diff (not your summary) and re-run the tests on their own Air folder. Expect findings; the first round on every lab found real defects.
- PR to the lab, wait for its CI to RUN and pass on the final commit, squash-merge. A red check you did not cause is a finding to report, not a reason to merge. Then bump the lab's submodule pin in AI-DEMO-Standalone (`git update-index --cacheinfo 160000,<sha>,standalone/<lab>` in a worktree is enough).
- Rebuild the lab's container only after checking the `.env` beside its compose file and `GET /api/info` (`source`, `realAvailable`) before and after (rule 26). A lab that comes up Mock because it has no `.env` is reported as Mock.

## 6. Mistakes already made (do not repeat)
Vendoring from a branch checkout; a masker that was quadratic on hostile input; a pin gate that failed open; a matcher that read request text as a decision; a Mock run shown as a Real reply after the toggle; an invented "tool dispatched" row; timestamps from a re-run; non-decisions counted as `allowed`; `fetch(` exemptions in lab safety tests (the core has none: do not add one); a refusal word in the lab's own log line; declaring a person's name as a correlation id; comments in vendored files that name other projects; trusting the exit code of a pipe; two worktrees with the same basename on the Air.
