# Story mode (shared pattern)

**Status:** pattern agreed 2026-11-24. Not yet built. The first implementation is pending owner approval (see `docs/specs/2026-11-24-story-mode.md`). This file is the contract every demo follows once it adopts Story mode. Canonical copy lives here; labs vendor a byte-for-byte copy and pin it.

## What it is
A **Story** mode for any Ping demo: a guided walk-through of the live app with numbered pop-up bubbles and slides. The viewer paces it with **Next**, **Back** and **Exit** (arrow keys and Esc too). There are no timers. The demo's recorded video (when it has one) uses the same overlay and the same wording, so the two cannot drift.

## The toggle
- A two-option segmented control, labelled **Demo** and **Story**, placed in the demo's extra shell slot. It never goes inside a vendored menu.
- **Demo is the default.** With Story off, the page is unchanged.
- The choice persists in `localStorage`. `?story=1` also turns it on.
- Story is **independent of Mock/Real**. Story can run in either mode.
- Story loads lazily, so Demo mode does not pay for it.

## The wording file: `captions.md`
One file holds every bubble and slide. Each demo keeps its own `video/captions.md` (or `story/captions.md`) in this shape:

- `# Step: <key>` starts a bubble, with `## Title` and `## Text` sections.
- `# Slide: <key>` starts a slide, with `## Title`, `## Lead`, optional `## Column A: <label>` and `## Column B: <label>` lists, and `## Verdict`.
- `---` separates sections. Keep each bullet on its own line starting with `- `.
- Live values go in `{braces}`, for example `{status}`, `{tools}`, `{words}`. The page fills them from the DOM.
- Keep slide text to about 40 words, so a slide is never held longer than 10 s in a video.
- Say only what the run proved. The gateway gives no reason for a 401: say so, never claim the cause.
- No internal hostnames, tenant ids, keys or screenshots in the file. The repo is public.

A small Node parser reads the file and serves it at `/api/story`. The app and the video both read that one copy.

## Steps: trigger and target
Each step has a **target** (a CSS selector) and a **trigger**:
- `load`: the page is ready.
- `run-done`: a run finished.
- `frame`: a reel or trace frame appeared.

A **prompt** step pre-fills the exact question. Its bubble says "press Send". The viewer presses Send, and the story continues when the run lands.

A step whose target is missing is **skipped**. The "n of N" counter counts only the steps shown in that run.

Live values (the answer's first sentence, states, challenge parameters) are read by one small page function that uses the same DOM selectors as the video.

## Mock mode
Story works offline. It labels itself **simulated** and makes **no network calls**. Mock wording uses the `sample_*` variants in `captions.md`, so a mock run never reads as a gateway answer.

## Slides and screenshots
- Text slides ship as they are.
- Console screenshots are **gitignored** (they show internal hostnames). The public repo ships none.
- A slide renders text-only unless the owner points an optional local `assets/` folder at it.
- A live observability panel can replace a screenshot.

## The parity test
A test checks that every `# Step:` and `# Slide:` key in `captions.md` has a matching step in the demo, and the reverse. A mismatch **fails the build**. It must never fail silently at runtime.

## Vendoring and the pin
1. Canonical code lives in `shared/story/` of AI-DEMO-Standalone.
2. A lab copies it in byte-for-byte, with `cp`, and records the pin (the source commit).
3. The lab's test suite checks every pin (the same way `gatewayReal.js` is pinned).
4. **Never edit the vendored copy in a lab.** Change the canonical copy first, then re-copy and re-pin.

## Process (per demo)
- Tier 1 (lab prototype): rules 1 to 11 of the global CLAUDE.md are enough. Say "Tier 1".
- A demo colleagues or customers use is **Tier 2**: a spec first, a passing test for each fix, the repo's local gate, an independent `/code-review` of the diff, and deploy only after the owner says go.
- One worktree and one PR per demo. Stage files explicitly.
- Browser check (global rule 9): load the page, exercise Story with realistic data and an empty state, and look at a screenshot at 1920x1080 and 1800x1169.

## Checklist for adding Story to a demo
- [ ] `captions.md` written from the demo's own spec and live values, public-safe.
- [ ] Vendored copy and pin added, the pin test passes.
- [ ] Parity test passes.
- [ ] Demo mode unchanged (check with Story off).
- [ ] Story runs in Mock with no network calls, and says "simulated".
- [ ] Story runs in Real and every step's live value matches the page.
- [ ] Browser check done, screenshots taken and read.
- [ ] Owner approves the PR before merge.
