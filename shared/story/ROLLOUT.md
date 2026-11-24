# Rolling Story mode out to the other labs (hand-off)

> **Scope: AI-DEMO-Standalone apps only, for now.** The target is a `standalone/*-LAB` app (its own `curtismu7/<name>-LAB` repo, a submodule of AI-DEMO-Standalone). Out of scope: AI-DEMO2 and any repo that is not a `standalone/*-LAB` lab, unless the owner says otherwise.

Story mode is a guided walk-through of a lab's live page: numbered pop-up bubbles and slides, a **Demo | Story** toggle in the shell bar, Next/Back, Play for me with a speed control, a bright red slow-blinking "your turn" prompt, and a first page that names the demo (rule 29). The shared code is in this folder; the A2A lab (`privilege-a2a-anthropic-demo-LAB`) is the complete reference, built, walked in Real and Mock, and shipped.

## Paste this to the agent that does the rollout

```
You are adding Story mode to labs in ~/Development/AI-DEMO-Standalone/standalone/ (AI-DEMO-Standalone apps only).
Read, in this order, before any code:
  1. ~/Development/AI-DEMO-Standalone/shared/story/ROLLOUT.md   (this file: which labs, in what order, the status table)
  2. ~/Development/AI-DEMO-Standalone/shared/story/README.md    (the contract)
  3. ~/Development/AI-DEMO-Standalone/shared/story/ADDING-TO-A-LAB.md  (the runbook: steps, files to copy, 18 mistakes already made)
  4. ~/Development/STANDALONE-RULES.md (rule 29: every first page has a title) and the global ~/.claude/CLAUDE.md
  5. if the lab has a recorded video: ~/Development/AI-DEMO-Standalone/shared/story/VIDEO.md (re-recording it for public release, after Story merges)
Invoke the story-mode skill, then spec-first, for each lab. Copy from the reference lab, standalone/privilege-a2a-anthropic-demo-LAB (on main).
Rules that bite: one worktree and one PR per lab (git worktree add ../<lab>-wt/story -b feat/story-mode origin/main); vendor shared/story byte for byte
and never edit the copy; curtismu7 GitHub account; no AI attribution anywhere; no force-push; heavy runs on the Air with air-test; the lab's .env never
leaves this Mac; Tier 1 for a lab only the owner sees, Tier 2 for one colleagues use; /code-review on each lab's own code; walk it with
shared/story/tools/walk.py at 1920x1080 and 1800x1169 and play.py, and READ the screenshots; merge only when the owner says "merge N".
Update the status table in ROLLOUT.md (a docs PR) as each lab is done.
```

## Which labs, in what order

106 of the 114 labs use the shared shell (the TopMenu `extra` slot the toggle needs). A lab is a good candidate when it has a clear story to walk (a run with visible steps) and, best of all, a recorded video whose wording can become its `captions.md`. Suggested order:

1. **Labs with a video and a `captions.md`** (the wording exists; the video can move onto the shared code at the same time, runbook section 9): `spiffe-issuer-LAB`, `hitl-mfa-lab-LAB`, `meridian-air-LAB`.
2. **Labs with a video but no `captions.md` yet**: (none left — `pf-privilege-obo-LAB` was done 2026-11-24, lab #29: the wording was written from its video script and its take.py moved onto the shared code in the same PR).
3. **The rest, by how often they are demoed** (ask the owner which ones first). Labs with no Mock/Real switch (`idjag-runner-LAB`, `pingone-signin-LAB`, `privilege-shelf-LAB`) and labs without the shared shell (`demo-field-guide-LAB`, `deploy-test-LAB`, `mcp-demo-client-privilege-LAB`, `mcp-resource-server-LAB`, `pdf-to-md-LAB`, `privilege-k8-kits-LAB`, `privilege-map-LAB`, `trusted-issuers-LAB`) need a decision from the owner before they get Story.

Re-check the list before starting (`ls standalone/`, and look for `web/src/top-menu` and `video/captions.md` in each lab): labs are added often.

## Per lab, in short
Spec (`docs/specs/<date>-story-mode.md`, copy the A2A lab's) -> `captions.md` with a `## Header` on the opening slide -> vendor and pin -> `GET /api/story` -> the script (`web/src/storyScript.js`) -> the wiring (`storyWiring.js`, `StoryRoot.jsx`, the toggle in `Shell.jsx`, run-start/run-end events in the page script, `runInFlight`/`onRun`) -> tests (parity, take.py-derived if there is a video, wiring) -> walk Mock and Real at both sizes, read screenshots -> `/code-review` -> PR -> owner says "merge N" -> pin bump in AI-DEMO-Standalone -> put the lab's domain on the new code -> update the table below. If the lab has a video, then re-record it for public release by `VIDEO.md` (masking, redacted screenshots, both cuts, the owner approves, the GitHub release).

## Status

| Lab | Story | Video on shared code | First-page title | Walked Real | Walked Mock | Public video re-recorded | PRs |
|---|---|---|---|---|---|---|---|
| privilege-a2a-anthropic-demo-LAB | done | done | done | done (both sizes) | done (both sizes, simulated Part 1) | recording (masking #60, screenshot guard #61) | lab #55-#61; shared #553 #563 #567 #574; pin #577 |
| cimd-LAB | done (lab #35, merged 2026-11-24) | n/a (no video) | done | done (both sizes, offline; PF-configured walk needs the owner's PF) | n/a (one wording, no Mock split) | n/a | lab #35 |
| spiffe-issuer-LAB | - | - | - | - | - | - | |
| hitl-mfa-lab-LAB | done (lab #44, open 2026-11-24) | done (lab #44, take.py on the shared overlay; rehearsal pixel-compare clean) | done | n/a (mock-side lab; Real take needs the owner's gateway) | done (both sizes) | not yet (rehearsal verified; recording is the owner's) | lab #44 |
| meridian-air-LAB | - | - | - | - | - | - | |
| pf-privilege-obo-LAB | done (lab #29, merged 2026-11-24) | done (take.py on the shared bridge: overlay + holds from web/src/story, wording from GET /api/story) | done (rule 29 header on the opening slide and the mock note) | done (both sizes; walk.py + play.py incl. an unattended Real run) | done (both sizes; mock intro + flow-sim wording) | - (rehearsal take passed 17/17 bubbles, no host leaks; a public re-record by VIDEO.md is not done) | lab #29; pin #609 |
