# Video tracker: what is recorded, what is left, is it ready

> Tracks every lab video in the AI-DEMO-Standalone family. Update the tables in the same PR as the work that changes them (same rule as ROLLOUT.md's status table).
>
> **Standards** = `shared/story/VIDEO.md` (public release: page masking with a leak counter, redacted slide screenshots + OCR check, both cuts Mock/Real or SAMPLE/LIVE, no real host/tenant/id/name anywhere, owner approves both cuts, GitHub release). A video that is only for the owner's own use is marked *internal* and does not need the full gates — but it still must not leak secrets if it will ever leave this Mac.
>
> **Bubbles ready?** = the take runs on the shared story overlay (story_bridge.py + captions.py reading `GET /api/story`), rehearsal pixel-compare done, `walk.py` both sizes green — i.e. the wording/drawing layer the film records is verified. This is the precondition for recording; without it the take must not run.

## Recorded videos

| Lab | Video | When | Kind | Standards | Where | Notes |
|---|---|---|---|---|---|---|
| privilege-a2a-anthropic-demo-LAB | `a2a-two-part-LIVE-headless.mp4` + `a2a-two-part-SAMPLE.mp4` (two-part A2A/Bedrock demo) | 2026-11-22 (SAMPLE), 2026-11-21 (aws-a2a LIVE) | SAMPLE + LIVE (headless) | **pass** — published | GitHub release `privilege-a2a-anthropic-demo-lab-video-2026-11-24` (2026-11-24) | The reference lab: masking + leak counter, redacted screenshots, both cuts, owner-approved. Earlier cuts (`aws-a2a-*`, 11-21) superseded by the 11-24 release |
| hitl-mfa-lab-LAB | `real-take.mp4` (PingID HITL real run) | 2026-11-22 | LIVE, **internal only** | **fail** (pre-standards): recorded before the shared bridge, no mask/leak counter, real gateway host visible; also stale — the door is now `lab-banking-hitl` on tenant `5bfb4e12` | `video/out/real-take.mp4` (git-ignored) | Do not publish or re-show; keep only as reference for wording timing |
| hitl-mfa-lab-LAB | `out/film.mp4/take.mp4` (attempt, aborted) | 2026-11-25 06:30 | LIVE attempt | n/a — not a film | `video/out/film.mp4/` | Hold fired correctly but no approval arrived inside the window; `result.json ok:false`. The door was then rebuilt (`lab-banking-hitl`, 2026-11-25, AI-DEMO2#3700) and a hold re-verified live (`ins_…` ids minting) |
| hitl-mfa-lab-LAB | `rehearse.mp4` (rehearsal, mock side) | 2026-11-25 | rehearsal | n/a | `video/out/rehearse.mp4` | Rehearsal pixel-compare vs the old take: slides identical, remaining diffs are live-value regions only |
| poppy-demo-LAB | `poppy-demo-monitor-1920x1080.mp4` + `poppy-demo-laptop-1800x1169.mp4` (Real-mode chat walk with the real PingFederate sign-in) | 2026-11-27 | LIVE (headless real) | **pass** — published | GitHub release `video-2026-11-27` (2026-11-27) | Host mask now also scrubs input values (the config panel's origin/issuer fields leaked in the first monitor cut; fixed lab #58); 0 OCR leaks after the fix; owner-approved both cuts |
| mcp-demo-client-privilege-LAB | `cimd-real-signin-demo.mp4` | 2026-11-22 | LIVE, **internal only** | **fail** (pre-standards): real sign-in demo, no mask/leak counter; lab also has no shared-shell Story yet | `docs/demo-video/cimd-real-signin-demo.mp4` | Re-record after that lab gets Story (it is on the "no Mock/Real switch" owner-decision list in ROLLOUT.md) |

## Left to record (in order)

| Lab | Bubbles ready? | Blocking | Next action |
|---|---|---|---|
| hitl-mfa-lab-LAB | **yes** (lab #44: shared bridge, rehearsal compare clean, walk.py both sizes green; door `lab-banking-hitl` live, holds verified 2026-11-25; **PingID push works on the new tenant** — owner confirmed 2026-11-25) | The owner recording + approving the push on their phone (take waits up to `APPROVAL_WAIT_S`, default 180 s; pass a longer value if needed). Note: this lab's take.py has **no onscreen mask/leak counter yet** — a public release needs VIDEO.md §2 first | Owner runs `APP_URL=http://127.0.0.1:7680 APPROVAL_WAIT_S=420 python3 take.py out/film.mp4`, approves the PingID push on the phone. Wording updated 2026-11-25 (sha `93846efb`): the real_vs_sim verdict and the approve step now say the push really fires on the phone |
| pf-privilege-obo-LAB | **yes** (take on the shared bridge, lab #29; rehearsal take passed 17/17 bubbles, no host leaks) | Only the public gates: masking formalized per VIDEO.md §2, both cuts, owner approval | Re-record by VIDEO.md; low urgency (rehearsal already leak-checked) |
| privilege-a2a-anthropic-demo-LAB | **yes** (published) | Nothing — done | Keep as the reference; re-record only if the lab's wording changes |
| spiffe-issuer-LAB | **no** (take.py still on its own overlay; runbook §9 migration not started) | The §9 migration (one PR) before any recording | Migrate take.py onto the shared bridge, rehearsal-compare, then record |
| meridian-air-LAB | **partly** (has `guarded_take.py` + `onscreen_mask.py` + tests — the most standards-ready pipeline — but take.py is not confirmed on the shared story bridge) | §9 migration check; then a rehearsal | Verify bridge status, rehearse, record |
| cimd-LAB | n/a (no video; Story only, lab #35) | — | Decide if it ever gets a video (needs the owner's PingFederate for a real walk) |
| cedar-act-sub-LAB | **sample recorded** (2026-11-25, engine-driving take.py, 3:15 SAMPLE cut; pipeline merged in lab #18; the recorded films live on the owner's Desktop, a release cut is the owner's call) | Nothing blocking; the release cut when the owner wants one | Owner watches the sample, says re-record or release |
| cedar-in-privilege-LAB | **sample recorded** (2026-11-25, engine-driving take.py, 3:37 SAMPLE cut; pipeline merged in lab #13; films on the owner's Desktop) | Nothing blocking; the release cut when the owner wants one | Owner watches the sample, says re-record or release |
| all other labs | n/a | No Story yet (see ROLLOUT.md order) | Story rollout first; videos follow |

## Rules for this file

- One row per *recording attempt that produced a file*, plus one "left to record" row per lab. Dead attempts that produced nothing are not tracked.
- "When" is the file's date. Update the row, don't append history.
- A row's "Standards" cell cites the gate that fails (mask / leak counter / redacted stills / both cuts / owner approval / release). "pass" means published and the release link is in "Where".
- Internal-only videos must still be flagged if they show real hosts/ids — those files never leave this Mac and should be deleted once superseded (owner decides).
