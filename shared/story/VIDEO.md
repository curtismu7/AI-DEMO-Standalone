# Re-recording a lab's video for public release (hand-off)

> **Scope: AI-DEMO-Standalone apps only, for now.** The target is a `standalone/*-LAB` lab whose demo video is (or is being moved) on the shared Story code. Out of scope: AI-DEMO2 and any repo that is not a `standalone/*-LAB` lab, unless the owner says otherwise.

The live Story mode and the recorded video share one wording file (`video/captions.md`, served at `GET /api/story`), one overlay and one set of hold formulas. So once a lab has Story, its video is re-recorded against the running lab, not edited by hand. A public video must show no real value: no internal host, tenant or client id, runtime id or personal name, in the page **or in any screenshot**. The reference is `standalone/privilege-a2a-anthropic-demo-LAB` (its `video/` folder and `video/README.md`).

## Paste this to the agent that re-records

```
You are re-recording the demo video of <lab> in ~/Development/AI-DEMO-Standalone/standalone/ (AI-DEMO-Standalone apps only) for public release.
Read, in this order, before anything else:
  1. ~/Development/AI-DEMO-Standalone/shared/story/VIDEO.md   (this file: the gates, the recording, the checks, the mistakes already made)
  2. ~/Development/AI-DEMO-Standalone/shared/story/ADDING-TO-A-LAB.md  (section 9 if the lab's take.py is not on the shared code yet; do that first)
  3. the lab's video/README.md, and the reference lab's: standalone/privilege-a2a-anthropic-demo-LAB/video/README.md
  4. the global ~/.claude/CLAUDE.md and the video standards (memory: video-standards; ~/Development/privilege-cimd-test/video/VIDEO-BEST-PRACTICES.md)
Invoke the story-mode skill. Code changes (masking, the screenshot guard) go in a worktree and a PR in the lab's repo; merge only on the owner's "merge N".
Rules that bite: curtismu7 GitHub account; no AI attribution; no force-push; the lab's .env never leaves this Mac and is never printed; heavy work
(tests, joins) on the Air; never stop another session's take or lab; READ the stills yourself (the leak counter cannot see images); show the owner
both cuts and publish the release only after the owner approves them in the conversation.
Update the status table in ROLLOUT.md (a docs PR) when the release is out.
```

## 1. Gates before you record (each one stops the take)

1. **The lab serves the wording you mean to record.** After any change to `captions.md`, fast-forward the lab's checkout and **recreate** the container that mounts it: a single-file bind mount keeps the old file until the container is recreated (`docker compose up -d --no-deps --force-recreate <service>`; a plain restart is not enough). Check that `GET /api/story`'s `sourceSha256` equals `shasum -a 256 video/captions.md`. Never record a release with `ALLOW_STALE_WORDING=1`.
2. **The page is masked.** Copy `video/onscreen_mask.py` and `video/test_onscreen_mask.py` from the reference lab and adapt the `.env` keys it reads for ids that are not hosts (the A2A lab reads `AWS_AGENT_PF_CLIENT_ID`, `AWS_AGENT_CUSTODIAN` and the runtime id in `AWS_AGENT_A2A_URL`). Hosts come from every URL and host list in the `.env`. The rules are built at record time from the lab's own `.env` (`MASK_ENV`), never written to the repo, and injected before anything is drawn. `take.py` refuses to record without them and marks a segment not ok if `window.__onscreenMaskLeaks()` is above 0.
3. **Every slide screenshot is redacted, and checked.** The page masking cannot change pixels. For each `## Image` in `captions.md`, put `<stem>.redacted<ext>` beside the captured original in the git-ignored `video/assets/`, with every real value painted over with the page's own placeholders (`gateway.example`, `pingfederate.example`, `aws-agent-client`, `example-policy`, ...). Before the browser opens, `take.py` checks every image any slide can show with `onscreen_mask.public_image`: the original must be there and readable by OCR, and tesseract (on a 3x copy, line breaks ignored, placeholders taken out) must find no real value, policy name or UUID in the copy. Make the copies from tesseract's word boxes (paint the box in the local background colour, draw the placeholder at the original's size), then **look at every copy**. If a screenshot adds little, make the slide text-only instead (the A2A lab's observability slide is).
4. **The machine is ready.** `tesseract`, `ffmpeg`, Python with `playwright` and `pillow`. The lab is up in Real (`/api/health` says `ready` and `live`). No other take is running (`pgrep -f 'video/take.py|guarded_take'`): if one is, wait; never stop it.
5. **Rehearse.** `REHEARSE=1 SAMPLE=1 REHEARSE_SHOTS=<dir> python3 video/take.py <dir>` makes a still per caption and slide in a minute. Read them before a real take.

## 2. Record

Two cuts, each in two segments, each through `video/guarded_take.py` (it restarts a lab that disappears and throws away a half run):

```
for P in monitor laptop; do          # monitor 1920x1080, laptop 1800x1169
  HEADLESS_REAL=1 PROFILE=$P SEGMENT=main python3 video/guarded_take.py <out>/<tag>-$P-main
  python3 video/build_obs_slide.py <out>/<tag>-$P-main          # the observability slide from that run's own logs
  HEADLESS_REAL=1 PROFILE=$P SEGMENT=end  python3 video/guarded_take.py <out>/<tag>-$P-end
done
```

- Accept a segment only when its `result.json` has `ok: true` and `mask_leaks: 0`. Script it to stop at the first other result.
- A live model does not always do the same thing (in the A2A lab the poisoned-record question was once answered without a tool call, so the gateway had nothing to block and the take was not ok). Retry the main segment up to three times; move every failed try aside, never splice it.
- A main segment takes about 7 minutes, an end segment under 1. Tell the owner not to use the lab while it records. Keep the output outside the repo (the A2A lab uses `~/Development/a2a-video-out/`).

## 3. Join and check (the leak counter cannot see images)

1. Join each cut on the Air: copy `main.mp4`, `end.mp4` and `video/join.sh` to `~/air-work/<dir>`, run `join.sh main.mp4 end.mp4 out.mp4` there, copy the result back, and delete the Air copy afterwards.
2. `ffprobe` the length and resolution.
3. Read, yourself:
   - the first frame and the opening slide (rule 29: the title names the demo);
   - a contact sheet of the whole cut (`ffmpeg -i out.mp4 -vf "fps=1/10,scale=480:-1,tile=6x8" -frames:v 1 sheet.png`);
   - a full-size still of every screenshot slide, every token or request pop-out, and the refusal.

   Every host, id and name must be a placeholder.
4. Show the owner both cuts (paths, lengths, what you checked) and wait for approval.

## 4. Publish (only after the owner approves the cuts)

- A GitHub release on the lab's repo, tagged `<lab>-video-<yyyy-mm-dd>`, with both mp4s attached (`gh release create <tag> monitor.mp4 laptop.mp4 --repo curtismu7/<lab> --title ... --notes ...`). The notes give each file's length and size, and say what the video shows. No tenant values.
- Link the release from the lab's README. Update the status table in `ROLLOUT.md`.
- Wider sharing (ZIP, Drive, landing page, shelf) follows the `demo-rollout` skill and needs the owner's go for each step.

## Mistakes already made (2026-11-24, the A2A lab; do not repeat)

1. **The page was masked, but the screenshots were not.** The leak counter said 0 while the identity slide showed the real issuer, audience and client id. Fix: redacted copies plus the OCR guard (gate 3). Always read full-size stills of every image slide.
2. **The lab served old wording.** That wording still named an old screenshot. The guard refused before recording because that screenshot had no redacted copy. Fix: gate 1. Recreate the container; do not override the hash check.
3. **The OCR check passed text it could not read.** Small print, a URL wrapped over two lines, and `,` read for `.` all got through, and an OCR slip in a policy id was missed. The current `public_image` upscales 3x, also searches the literal `.env` values with whitespace removed, and uses a loose policy-name pattern. It requires an original that OCR can read. Keep its tests (`test_onscreen_mask.py`) when you copy it.
4. **The page's own placeholder could look like a leak** (found in review). A real value that is part of a placeholder would have refused every clean copy: for example, a client id that sits inside `aws-agent-client`. The placeholders are now removed before the literal search.
5. **Model variance failed a take.** Retry; never hand-edit a cut.
6. **Another session was recording.** The recording script waits for it. Never stop someone else's take.

## Done means

The gates pass. Both cuts have every segment `ok` with `mask_leaks: 0`. The stills of every image slide and pop-out have been read. The owner approved both cuts in the conversation. The release is published with both files, the README links it, and `ROLLOUT.md` is updated.
