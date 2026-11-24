# Adding Story mode to a lab (runbook for agents)

> **Scope: AI-DEMO-Standalone apps only, for now.** The target is a `standalone/*-LAB` app: each lab is its own `curtismu7/<name>-LAB` repo and a submodule of AI-DEMO-Standalone, the shared code is vendored from `AI-DEMO-Standalone/shared/story`, and the PR goes in the **lab's** repo. A new standalone app counts once it exists as a `standalone/*-LAB` under the standalone-demo rules. **Out of scope: AI-DEMO2 and any repo that is not a `standalone/*-LAB` lab.** Anything else needs the owner's say-so first: stop and ask. The shared code assumes this family's page shell (the React island with the shared TopMenu `extra` slot, rule 22), its vendoring and pin rules, and its public-repo rules.

The contract is `README.md` in this folder (what Story is, the toggle, the wording file, Pacing, the pin). This file is the **how**: the steps, the files to copy, and the mistakes already made. The reference implementation is `privilege-a2a-anthropic-demo-LAB` (copy its files, do not guess). **Check what is merged there before you rely on it**: slice 1 is on its `main` (#55: the vendored engine, `src/story.ts` and the route, `test/story.test.ts`, `web/src/storyScript.js`, the `Dockerfile` line). The **wiring** (`web/src/storyWiring.js`, `web/src/StoryRoot.jsx`, the `Shell.jsx` toggle, the page script's `paad:run-start` / `paad:run-end` events, their tests) is the lab's slice-2 pull request. If `git -C <lab> ls-files web/src/storyWiring.js` finds nothing on `main`, that PR is not merged yet: read the files from its branch (`git -C <lab> show origin/feat/story-wiring:web/src/storyWiring.js`) and say so in your PR. Do not invent the wiring.

**One lab, one worktree, one PR; the owner approves each lab; merge only on "merge N" (global rules 11 and 12). Tier 1 for a lab only the owner sees; Tier 2 (spec, review, owner's go) for anything colleagues use.**

## 0. Before you start
- Invoke the `story-mode` skill, then the `spec-first` skill: write `docs/specs/<date>-story-mode.md` in the lab (copy the A2A lab's and cut it down) with the unhappy paths.
- Read the lab's own `CLAUDE.md`. Does it have a React island shell with the TopMenu `extra` slot? If not, stop and tell the owner (the toggle has nowhere to go).
- Does the lab have a recorded video (`video/take.py`, `captions.md`)? If yes, the video and Story share the wording file and the script is tested against `take.py`. If no, write `captions.md` for Story alone (put it in `video/captions.md` or `story/captions.md`).

## 1. The wording: `captions.md`
- One file, the format in `README.md`. Every bubble is a `# Step: <key>`, every slide a `# Slide: <key>` (plus `# Opening Slide` and `# Closing Slide`).
- **Public-safe**: no internal hostnames, tenant or client ids, keys, customer names. No screenshots (slides are text-only, so a column that says "above" or "left" about a picture must be reworded).
- Say only what the run proved. A bubble that explains a block must not show when the run did not block (see "Gate every claim" below).
- Mock wording goes in `sample_*` steps (the video's simulated variants). A step that needs Mock wording names it with `sampleKey`.

## 2. Vendor the shared code (byte for byte)
```sh
S=~/Development/AI-DEMO-Standalone/shared/story        # or your worktree of it; use the merged commit
mkdir -p <lab>/web/src/story <lab>/server/src/story <lab>/scripts
cp $S/{hold,overlay,engine}.js $S/{StoryToggle,StoryBar}.jsx $S/story.css $S/story.test.jsx $S/story.sha256  <lab>/web/src/story/
cp $S/hold.js $S/captions.js <lab>/server/src/story/
cp $S/checkPin.mjs <lab>/scripts/story-checkPin.mjs
node <lab>/scripts/story-checkPin.mjs <lab>          # must print: story pin ok
```
Never edit the copies. A bug in them is fixed in `shared/story/` first (its own PR), then re-vendored. Add one line to the lab's `CLAUDE.md` naming the source commit (copy the A2A lab's). Nothing else may live in `web/src/story/` or `server/src/story/` (the pin check fails on a stray file: the lab's own files go beside them, for example `web/src/storyScript.js`).

## 3. Server: `GET /api/story`
Copy `src/story.ts` and its route from the A2A lab: it reads the wording file, parses it with the vendored `parseCaptions`, re-reads it when the file changes, answers 500 with a message that names a wording problem, and **never sends a server path**. Add the `Dockerfile` lines that copy the wording file into the image (and keep the rest of `video/` out). Check the built image holds it: `docker run --rm --entrypoint node <image> -e "import('/app/dist/story.js').then(m => console.log(Object.keys(m.loadCaptions().steps).length))"` (build and run on the Air together: `docker --context air buildx build -t story-check --load .` then `docker --context air run --rm --entrypoint node story-check -e ...`; the loaded image lives in the Air's Docker, not OrbStack here).

## 4. The script: `web/src/storyScript.js`
Pure data, one entry per caption key, **in the order the video walks the lab** (take the order from `take.py`). Two layers, do not mix them up. **The engine's step** (what `createStory` accepts; the full field list is the header comment of `engine.js`): `key`, `type`, `trigger`, `target` (a selector, an Element, or a function returning either), `prefer`, `place`, `modes`, `sampleKey`, `when`, `live`, `lines`, `prompt`, `fixedSecs`, `frameTimeoutMs`, `tab`, `before`, `after`, `transform`. **The script's data** (`storyScript.js`, the A2A lab's own convention, turned into engine steps by `storyWiring.js`): the same names where they match, plus descriptors that the wiring expands: `target` as `{ frame, root }` (a reel frame by title), `{ last, fallback, only }` or `{ selector, unless }`; `popout` (`{ root, frame, section }`, expanded into `before`, `after` and `target`; **it is not an engine field**: an engine step written with `popout` does nothing); `askLine`; `lines` as the name of a live reader; `when` as a named condition. A script entry whose target is missing is skipped silently.

## 5. The wiring: `web/src/storyWiring.js` and `StoryRoot.jsx`
Copy from the A2A lab and change only the lab's selectors and live values.
- **The page must announce runs.** The host needs `paad:run-start` and `paad:run-end` (`detail.ok` is false only when the request itself failed; a question the gateway blocks **completes**, so it is `ok: true`). Add the two `window.dispatchEvent` calls to the lab's page script. Without them every "wait for the run" step stalls until the 180 s timeout.
- `host.send` clicks the page's own button with `el.click()`. That event is **untrusted**, so Play for me is not mistaken for the viewer's own input. Do not replace it with anything that fakes a trusted event.
- Never `await` an engine control (`next`, `back`, `start`) in page code: a step that waits for a run only settles when the run ends.
- The toggle goes in the shell's `extra` slot; the story module is lazy-loaded (`React.lazy`) so Demo mode does not pay for it; Exit must put the toggle back on Demo, remember it, and drop `?story=1` from the address (the A2A `Shell.jsx` does this).

## 6. Tests (copy `test/story.test.ts` and adapt; a lab's `npm test` must fail on drift)
Pin check · parity both ways · **the bubble order, the live and simulated bubble counts, the mode flags, the questions and the fixed holds all read from `take.py`** (this caught a wrong hold in the A2A lab) · public-safe wording · no tracked screenshot · the route (200, a broken file is a 500 without a path, an edit shows without a restart, Demo page does not mention Story) · wiring tests (host events, prompt fill and send, tab switch, target finders, pop-out hooks, live lines, the Mock closing slide). Heavy runs go to the Air: `air-test <lab>` (git add new files first).

## 7. Browser check (global rule 9). Do not skip it; read the screenshots
Both tools are in `tools/` here and need `playwright` (`pip install playwright && playwright install chromium`). The lab must be running; if you run it on the Air, tunnel its port (`ssh -N -L <localport>:127.0.0.1:<labport> <the Air's ssh host, as in ~/.local/bin/air-test>`) and point the tools at the local port.
```sh
python3 tools/walk.py --base http://127.0.0.1:<port> --profile monitor --out <dir> --send <promptKey>=<sendSelector>,...
python3 tools/walk.py ... --profile laptop ...      # 1800x1169
python3 tools/play.py --base http://127.0.0.1:<port> [--count-selector '<a viewer message>']
```
`walk.py` walks every step as a viewer would and flags: a bubble off screen, covering its own target, or under the Story bar; a slide taller than the screen; an empty screen; a step whose title matches no wording (key `?`); a run that never finished; console errors; Story warnings; Story not reaching `done`, or showing no step at all; Story leaving anything behind after Esc. It exits 1 on any of them (`--allow-warnings` lets warnings pass; use it only to look, not for the PR). **Then open the screenshots in `<dir>` and look at them**: the flags are not a review. `play.py` checks Next never moves by itself, Play moves on by the hold, Pause freezes, Resume continues, a real click stops Play, and a full unattended run reaches the end (minutes of real time).
Walk it in **Mock and in Real**. Real needs the lab's live configuration and costs model calls: tell the owner before you run it, and say plainly in the PR if you did not.

## 8. Review and PR
`/code-review` (high) on the lab's own code (say the vendored files were already reviewed); fix every real finding with a regression test that fails without the fix; PR with what, tests, what is **not** covered; wait for the owner's "merge N".

## Mistakes already made (do not repeat)
1. **A bubble that claims something the page does not show.** The "handoff" and "blocked" bubbles appeared after a run that failed before any handoff. Gate every claim on the page's own state: the target must exist only when the claim is true (`#who .who-hop`; the trace says `content_blocked`; the answer box is not `is-error`). `when` is evaluated **before** a step's trigger wait, so it cannot see a run's result: use a target function for anything that depends on the run.
2. **A step that does not apply must skip quietly.** A reel frame that is not in this run is a skip, not a warning. A warning is for something that should have worked (a pop-out that will not open).
3. **A made-up fixed hold.** Only the steps where `take.py` passes `secs=` have `fixedSecs`; the test reads `take.py` to enforce it.
4. **Mock may not run what you think.** In the A2A lab, Mock still needs a model key for the question (the heuristic path needs a profile the standalone page does not send), so offline Part 1 cannot run and Story skips its steps honestly. Find out what Mock really does in your lab before you promise "Story works offline", and say so in the PR. A Mock replay of a recorded run is a future option, not built.
5. **Counter.** The bubble shows `n of N` over all shown steps, slides included, and N shrinks as steps are skipped ("4 of 35" then "of 29"). The video numbers bubbles only (1 to 27). This is a known difference; if a lab wants the video's numbering, change `engine.js` in `shared/story/` first.
6. **Esc.** `StoryBar`'s key handler exits Story on Esc **unless something already called `preventDefault()`**, and it does so even while the viewer is typing in the question box (only the arrow keys are left alone while typing). In the A2A lab the reel pop-out's own Esc handler runs first in the capture phase and stops propagation, so Esc inside a pop-out only closes the pop-out. Any other modal in your lab that neither stops propagation nor prevents the default will also exit Story. Test Esc from the text field and from every modal the walk-through opens, and decide whether that is acceptable.
7. **Test hygiene.** A test that stubs `getBoundingClientRect` must `destroy()` its overlays afterwards: a live overlay keeps reflowing on resize and redraws its bubble into the next test.
8. **Ports when testing on the Air.** Other labs already run there on the default ports (OrbStack). Give yours separate ports, stop only the processes whose path is your worktree (never `pkill` by pattern), and pick a local tunnel port nothing uses (`lsof -iTCP:<port> -sTCP:LISTEN`).
9. **A bubble under the Story bar.** Fixed in the shared overlay (the bubble moves above the bar). If you see a bubble hidden by the bar, you are on an old vendored copy: re-vendor.
10. **Slides are text-only.** The wording must stand without the screenshot. The observability slide is meant to be the lab's live Run Observability panel; the A2A lab holds it back (`NOT_YET` in `storyWiring.js`) until that is wired and checked.

## Done means
Pin ok · parity ok · take.py-derived tests ok · `npm test` green on the Air · `walk.py` exit 0 at both sizes, screenshots read · `play.py` exit 0 · Demo mode unchanged with Story off · Mock and Real both walked (or the PR says which was not) · `/code-review` findings fixed · PR open and waiting for "merge N".

## Known gaps (as of 2026-11-24)
Real mode has not been walked in the A2A lab yet. The observability slide is held back. `take.py` does not use the shared overlay or hold code yet (the lab's last PR). No Mock replay. The Story counter differs from the video's. Nothing here applies outside AI-DEMO-Standalone.
