# Story mode spec

**Status:** agreed (docs part built)   **Owner:** Curtis Muir (decides)

## Goal
Any Ping demo can offer a **Story** mode: a guided walk-through of the live app with numbered pop-up bubbles and slides, paced by the viewer (Next, Back, Exit). The demo's recorded video uses the same overlay and the same wording, so the two cannot drift apart. This turn delivers the pattern only: a skill, a canonical doc and a memory pointer. No demo code changes.

## Decisions (answered by the owner, 2026-11-24)
- **Shared code is a vendored copy**, canonical in `shared/story/` of AI-DEMO-Standalone, copied byte-for-byte into each lab and pinned, the way `shared/gateway-real` is.
- **Scope now:** skill, doc and memory only. Each demo gets its own PR, after the owner approves that demo.

## Acceptance criteria (each one a check)
1. **Skill:** `~/.claude/skills/story-mode/SKILL.md` exists, and the Skill tool lists `story-mode`. Check: `Skill(story-mode)` loads the file. The skill's steps cover both "add to an existing demo" and "new demo".
2. **Canonical doc:** `shared/story/README.md` exists and covers: the wording file format, step keys and triggers, the Story toggle (`?story=1` and localStorage), the Demo default being unchanged, the offline Mock behaviour, the parity test, and the vendoring and pin procedure. Check: `grep -n "^## " shared/story/README.md` shows each section.
3. **No drift:** the skill points to `shared/story/README.md` for the contract and does not repeat it in full. Check: the skill names the doc path and contains no second copy of the step-key rules.
4. **Memory:** `~/.claude/projects/-Users-cmuir/memory/story-mode.md` exists with frontmatter, and `MEMORY.md` has one pointer line to it. Check: `grep -n story-mode MEMORY.md`.
5. **Public-safe:** the doc and skill contain no internal hostnames, tenant ids, keys or console screenshots. Check: a grep for `ping-devops`, `procyon`, `local.`, a UUID pattern and `sk-` finds nothing in the new files.
6. **Traceable:** every rule in the doc comes from the owner's request or the pasted plan. Nothing is added that the owner did not ask for. Check: a line-by-line read against the pasted plan, with the result pasted into the status note.

## Unhappy paths (each needs a rule in the doc)
- **Video not needed:** a demo with no recording still gets Story mode. The video pipeline is optional.
- **Missing target:** a step whose target element is absent is skipped, and the "n of N" counter counts only the steps shown.
- **Key in the wording file with no matching step in the demo:** the parity test fails. It must not fail silently at runtime.
- **Mock mode:** Story says plainly that it is simulated, and makes no network calls.
- **Public repo:** no internal hostnames or tenant data ship. Console screenshots stay local and gitignored. Slides render text-only unless a local assets folder is supplied.
- **Edited vendored copy:** a lab that edits `shared/story/` in place fails the pin check. Changes go to the canonical copy first.
- **Demo mode:** with Story off, the page is unchanged.

## Out of scope
- Applying Story mode to any demo (separate PRs, one per demo, after approval).
- An auto-play "Play for me" mode (possible later).
- Changes to any demo's `take.py` or video pipeline.
- A published npm package.

## Protected / must not break
- Demo mode stays byte-identical.
- Mock/Real toggle and its behaviour.
- Flags default OFF.
- No secrets, tokens or tenant ids in any shipped file.

## Verification plan (this turn)
- Read back the skill, the doc and the memory file. Run the checks in criteria 1 to 5.
- Paste the criterion-6 comparison into the status note below.
- No build or deploy: this turn changes only docs and the skill.

Later, per demo: the lab's own tests, a browser run (global rule 9), `/code-review` on the diff, and the owner's "merge N" before anything is merged or deployed.

## Status note
Docs part, built 2026-11-24:
- Criterion 1, skill loads: `story-mode` is listed by the Skill tool. Pass.
- Criterion 2, doc sections: `shared/story/README.md` has every section named in the criterion. Pass.
- Criterion 3, no drift: the skill names the doc path and holds no step-key rules of its own. Pass.
- Criterion 4, memory: `story-mode.md` written, pointer added to `MEMORY.md`. Pass.
- Criterion 5, public-safe: grep for hostnames, tenant ids, keys and UUIDs finds nothing in the doc or the skill. The only hit is this spec quoting the grep patterns. Pass.
- Criterion 6, traceable: each rule in the doc maps to the pasted plan or the owner's answers (toggle default, lazy load, storage, Mock/Real independence, one overlay and one parser, parity test, viewer pacing, prompt "press Send", missing-target skip, live values, simulated Mock, public-safe slides, browser check sizes). Added from owner standards, not the plan: the 40-word slide limit and the 10 s hold (video standards), and the tier rule (global rule 12). Nothing else added. Pass.
Not built yet: the shared code, the toggle, the parser and the parity test. Those are the first implementation PR, after the owner approves.
