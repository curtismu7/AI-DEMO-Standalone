# Handoff: add Story mode to the five model-gateway labs (2026-11-24)

Written for: the agent that will add Story mode to these five labs, one lab at a time. The owner asked for this handoff; the owner approves each lab and says "merge N" before any merge.

**Scope: AI-DEMO-Standalone apps only.** Each lab below is its own public repo under `curtismu7` and becomes a `standalone/*-LAB` submodule at step 3 (integration, not done yet).

## Read first, in this order
1. `shared/story/ROLLOUT.md` (the general rollout; its status table lists only the labs done so far).
2. `shared/story/README.md` (the contract: the Demo | Story toggle, the wording file, pacing, the pin).
3. `shared/story/ADDING-TO-A-LAB.md` (the runbook: steps, files to copy, 18 mistakes already made). This is the how; this file is only what is specific to these five labs.
4. `~/Development/STANDALONE-RULES.md` (rule 29: every first page has a title), the global `~/.claude/CLAUDE.md`, and each lab's own `CLAUDE.md`, especially its **Never-repeat lessons** section.
5. `docs/PRIVILEGE-MODEL-GATEWAY-DEMOS-PLAN.md` (what the labs are for, section 9 for status) and `docs/specs/2026-11-24-model-gateway-labs.md` (the lab specs).
Invoke the `story-mode` skill, then `spec-first`, for each lab. Copy from the reference lab, `standalone/privilege-a2a-anthropic-demo-LAB` (its Story wiring is on its `main`).

## Paste this to the agent

```
You are adding Story mode to the five model-gateway labs, ONE LAB AT A TIME (one worktree and one PR per lab; wait for the owner's "merge N").
Read first, in order: docs/STORY-HANDOFF-MODEL-GATEWAY-LABS.md (this file), then shared/story/ROLLOUT.md, README.md and ADDING-TO-A-LAB.md,
~/Development/STANDALONE-RULES.md, the global ~/.claude/CLAUDE.md, the lab's CLAUDE.md. Invoke the story-mode skill, then spec-first.
Rules that bite: branch from the lab's origin/main (git worktree add ../<lab>-wt/story -b feat/story-mode origin/main), and only after the lab's
step-2 web PR is MERGED; vendor shared/story byte for byte, never edit the copy; GitHub account curtismu7; no AI attribution anywhere; no
force-push (merge main into the branch); heavy runs on the Air with air-test (git add new files first; its disk is tight, delete your own
~/air-work copies when done); the lab's .env never leaves this Mac; /code-review on the lab's own code; walk it with shared/story/tools/walk.py at
1920x1080 and 1800x1169 plus play.py and READ the screenshots; merge only when the owner says "merge N". Update the status table in ROLLOUT.md
(a docs PR) as each lab is done.
```

## Prerequisites (check before you start; stop and tell the owner if one fails)
- **The lab's step-2 web PR is merged to its `main`.** Until then the lab has no page for Story to walk. As of this writing all five web PRs are open and under review (see the plan doc's status table); the Story PR branches from the merged `main`, never from `feat/web`.
- The lab has the shared shell with the TopMenu `extra` slot (all five do: they vendor `top-menu` per rule 22). Confirm with `ls web/src/top-menu` in the lab.
- `shared/story` on `origin/main` contains `ADDING-TO-A-LAB.md` and the reference lab's `web/src/storyWiring.js` is on its `main`. Both were true on 2026-11-24.
- **Check running containers before you pick any test port** (`docker ps`): the `ap-*` labs hold 7839 to 7843 and `banking-mcp-resource-server` 7844 on this Mac. The five labs use 7836, 7837, 7838, 7846 and 7847.

## The five labs

| Lab | Repo | Port | Order | What Story walks |
|---|---|---|---|---|
| fallback | `curtismu7/privilege-model-fallback-LAB` | 7836 | 1 | a key with a primary and a fallback model; run "primary down", read the verdict, the attempts and the budget meters; the refusal when both budgets are spent |
| rate limit | `curtismu7/privilege-rate-limit-LAB` | 7837 | 2 | a burst against the refilling bucket versus the fixed window; the in-flight cap; the cluster with and without a shared store; the app-wide caps |
| assume role | `curtismu7/privilege-bedrock-assume-role-LAB` | 7838 | 3 | a key with no stored credential; success, then a wrong trust principal and an external-ID mismatch with their fixes; the Vertex tab |
| model armor | `curtismu7/privilege-model-armor-LAB` | 7846 | 4 | one external inspector per key; the same finding blocked when enforcing and only logged when advisory; inspector unreachable |
| semantic cache | `curtismu7/privilege-semantic-cache-LAB` | 7847 | 5 | exact repeat, paraphrase, unrelated; the strictness slider flipping a pair; TTL expiry on the lab clock; the Usage card |

The order is the plan's wave order (fallback and rate limit first). Each lab's own `docs/talk-track.md` and its stories data (`{{cast}}` tokens, three vertical packs) already hold the beats: use them as the starting point for `captions.md`, do not invent a second script.

## What is specific to these labs

1. **No video.** None of the five records a video (`video/take.py` does not exist). So: write `captions.md` for Story alone (`story/captions.md`, as `ADDING-TO-A-LAB.md` section 0 says), skip runbook section 9 (video on the shared code), and the "take.py-derived tests" become tests against the lab's own scenario data (the order of beats, the counts of steps, the mode flags).
2. **Mock only; Real is not built.** Every run is the lab's own simulation, so the runbook's "Mock may not run what you think" does not apply: Mock runs offline and a scripted scenario works with no key. The Story banner and the closing slide must say plainly that everything is simulated. Do not add a Real walk; say in the PR that Real does not exist.
3. **Labels are part of the wording.** Every claim beyond the 2026-11-21 release notes is the lab's model and is labelled `UNVERIFIED (lab model)` in the page. A bubble or slide must not state such a behaviour as fact. Re-use the lab's own Limits/UNVERIFIED wording. Gate each claim on what the page shows (runbook mistake 1).
4. **Decisions that must not be reversed in the wording:**
   - Rate limit and fallback: **no opinion** on whether a rate-limit refusal can trigger fallback. Show it only as an open question, never as a result.
   - Semantic cache: there is **no cross-user leak scenario**; cache scope (per key or per user) is an open-question card. Do not write a bubble that answers it.
   - Model Armor: Azure AI Content Safety and Bedrock Guardrails category names are lab labels, and no bubble claims any vendor's detection quality.
   - Assume Role: IAM examples use placeholder ids only; no real account, role or external ID in any bubble or slide.
5. **The page announces runs.** `ADDING-TO-A-LAB.md` section 5 needs the page to dispatch a start and an end event around each run (the A2A lab uses `paad:run-start` / `paad:run-end`). In these labs a "run" is a scenario or a live run; add the equivalent events (use the lab's own prefix, not `paad:`) in the page code that already POSTs the run, and test them. A scenario that finishes with a named refusal is a **completed** run (`ok: true`), not a failure.
6. **Hash scenarios.** Pages run a scenario named in the address (`#<page>/<id>`) only on a deliberate navigation. Story's steps that open a scenario must go through the same path, and Exit must not leave a hash behind. Reset, a mode switch, a vertical change and the "server forgot this workspace" banner all clear the hash (see each lab's lessons). Test Story with each.
7. **Workspaces.** The lab keeps per-tab workspaces and shows a banner if the server forgets one. Story must work across a reload and must not trigger that banner on a fresh tab; add a test that a Story run on a brand-new tab shows no banner.
8. **Esc handling.** Presenter mode (the `P` key) and the lab's dialogs also use Esc. Test Esc from the text field and from every dialog the walk opens (runbook mistake 6), and that `P` and Story do not fight over the same keys.
9. **Diagram page.** The diagram is loaded by name from the diagram-studio data and has its own movable boxes and Simulate. A Story step that points at a diagram box must survive Reset (positions restored). If a Story step needs the diagram open, open it the way the page's own link does.
10. **Customer config.** Each lab can take a `customer.config.json` brand. `captions.md` should use the `{{cast}}` tokens its stories already use, so a customer's brand reaches Story; add a test with a non-default vertical and a brand override (this was a real bug in step 2).

## Status and sequencing
- Do **not** start a lab until its web PR is merged and the owner has said which lab to do. Do one lab to completion (Done means, below) before the next; the first lab teaches the rest.
- After each lab, open the ROLLOUT.md status-table docs PR and wait for "merge N" on both PRs.
- If the five web PRs are not merged yet when you read this, stop and report. Do not branch from `feat/web`.

## Done means (from the runbook, per lab)
Pin ok · parity ok · tests derived from the lab's own scenario data ok · `npm test` green on the Air · `walk.py` exit 0 at both sizes and the screenshots read · `play.py` exit 0 · Demo mode unchanged with Story off · Mock walked (Real does not exist; say so) · `/code-review` findings fixed with regression tests · PR open and waiting for "merge N".
