#!/usr/bin/env python3
"""Walk a lab's Story in a real browser, as a viewer would, at one screen size, and report what you would otherwise have to look at by hand.

  python3 walk.py --base http://127.0.0.1:6881 --profile monitor --out /tmp/story-walk \
      --send p1_prompt=#send,p1_refuse_prompt=#send,pick_prompt=#aws-send,refuse_intro=#aws-refuse

Needs: python3, `pip install playwright` + `playwright install chromium`. The lab must serve GET /api/story and render the shared StoryToggle/StoryBar
(their data-testids are the contract: story-toggle-story, story-bar, story-next, story-back, story-msg, story-warn).
--send maps each PROMPT step's key to the selector the viewer presses to send it (the question is already filled in by Story).
It turns Story on, then for every step records the key, the bubble or slide, its size and place, the bar text and any warning, takes a screenshot, presses
Send when the step is a prompt, and clicks Next. It flags: a bubble off screen, a bubble covering its own target, a bubble under the Story bar, a slide
taller than the screen, an empty screen, a run it waited 90 s for, console errors. At the end it presses Back, then Esc, and checks Story left nothing behind.
Output: <out>/NN-<key>.png, <out>/report.json, and a summary on stdout. Exit code 1 when anything is flagged, a step is unknown, a warning is shown (unless --allow-warnings), Story did not reach "done", or no step was shown. READ THE SCREENSHOTS: the flags are not a review.
"""
import argparse, json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", required=True); ap.add_argument("--profile", choices=["monitor", "laptop"], default="monitor"); ap.add_argument("--out", required=True)
ap.add_argument("--send", default="", help="promptKey=selector,promptKey=selector")
ap.add_argument("--max-steps", type=int, default=120)
ap.add_argument("--allow-warnings", action="store_true", help="do not fail on Story warnings (an unreadable value, a missing target, a pop-out that did not open)")
a = ap.parse_args()
SIZE = {"monitor": (1920, 1080), "laptop": (1800, 1169)}[a.profile]
SEND = dict(kv.split("=", 1) for kv in a.send.split(",") if "=" in kv)
out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
BAR = "[data-testid=story-bar]"
report = {"profile": a.profile, "steps": [], "console_errors": [], "problems": []}

def overlap(x, y):
    if not x or not y: return 0
    w = max(0, min(x["x"] + x["width"], y["x"] + y["width"]) - max(x["x"], y["x"])); h = max(0, min(x["y"] + x["height"], y["y"] + y["height"]) - max(x["y"], y["y"]))
    return w * h

with sync_playwright() as p:
    br = p.chromium.launch(headless=True); page = br.new_context(viewport={"width": SIZE[0], "height": SIZE[1]}).new_page()
    page.on("console", lambda m: report["console_errors"].append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: report["console_errors"].append("pageerror: " + str(e)))
    page.goto(a.base + "/"); page.wait_for_selector("[data-testid=story-toggle]")
    wording = page.evaluate("fetch('/api/story').then(r => r.json())")
    import re
    # step key from the displayed title: titles may hold {live} placeholders (shown filled in) and a sample_* step may share its live twin's title, so build a pattern per
    # title and prefer the non-sample key
    title_keys = []
    for k, v in sorted(wording["steps"].items(), key=lambda kv: kv[0].startswith("sample_")):
        title_keys.append((re.compile("^" + re.sub(r"\\\{[a-zA-Z0-9_]+\\\}", ".+", re.escape(v["title"])) + "$"), k))
    def key_of_title(t): return next((k for rx, k in title_keys if rx.match(t)), "?")
    by_slide = {v["title"]: k for k, v in wording["slides"].items()}; by_slide[wording["opening"]["title"]] = "opening"; by_slide[wording["closing"]["title"]] = "closing"
    page.screenshot(path=str(out / "00-demo.png"))
    report["demo_has_no_story_bar"] = page.locator(BAR).count() == 0
    page.click("[data-testid=story-toggle-story]"); page.wait_for_selector(BAR)
    for n in range(1, a.max_steps + 1):
        page.wait_for_timeout(450)
        st = page.get_attribute(BAR, "data-status")
        if st == "waiting":
            try: page.wait_for_function("document.querySelector('[data-testid=story-bar]').dataset.status !== 'waiting'", timeout=200000)   # the engine itself gives up on a run after 180 s
            except Exception: report["problems"].append("waited 200 s on a run that did not finish"); break
            page.wait_for_timeout(500); st = page.get_attribute(BAR, "data-status")
        if st in ("done", None): break
        if n == a.max_steps: report["problems"].append(f"still going after {a.max_steps} steps (raise --max-steps if the story is that long)")
        info = {"n": n, "status": st}
        slide = page.locator(".story-slide h1")
        if slide.count():
            t = slide.first.inner_text(); info.update(kind="slide", title=t, key=by_slide.get(t, "?")); card = page.locator(".story-slide .card").first.bounding_box()
            if card and (card["y"] < 0 or card["y"] + card["height"] > SIZE[1] + 2): info["clipped"] = True
        elif page.locator(".story-bub").count():
            bub = page.locator(".story-bub"); t = bub.locator("h3").inner_text(); info.update(kind="bubble", title=t, key=key_of_title(t), of=bub.locator(".of").inner_text())
            bb = bub.first.bounding_box(); info["bubble"] = bb
            if bb and (bb["x"] < 0 or bb["y"] < 0 or bb["x"] + bb["width"] > SIZE[0] + 1 or bb["y"] + bb["height"] > SIZE[1] + 1): info["off_screen"] = True
            if overlap(bb, page.locator(BAR).first.bounding_box()) > 0: info["bubble_under_bar"] = True
            if page.locator(".story-hl").count() and overlap(bb, page.locator(".story-hl").first.bounding_box()) > 0: info["bubble_covers_target"] = True
        else:
            info["kind"] = "nothing"; report["problems"].append(f"step {n}: nothing on screen (status {st})")
        info["bar"] = page.inner_text("[data-testid=story-msg]")
        w = page.locator("[data-testid=story-warn]"); info["warn"] = w.first.get_attribute("title") if w.count() else None
        page.screenshot(path=str(out / f"{n:02d}-{info.get('key', 'x')}.png")); report["steps"].append(info)
        if info.get("key") in SEND: page.click(SEND[info["key"]])        # the viewer asks the question the bubble filled in
        page.click("[data-testid=story-next]")
    report["ended_status"] = page.get_attribute(BAR, "data-status") if page.locator(BAR).count() else None
    if page.locator("[data-testid=story-back]").count():
        page.click("[data-testid=story-back]"); page.wait_for_timeout(500)
        report["back_after_done_shows"] = page.locator(".story-slide h1").first.inner_text() if page.locator(".story-slide h1").count() else "?"
    page.keyboard.press("Escape"); page.wait_for_timeout(600)
    report["after_escape"] = {"bar": page.locator(BAR).count(), "overlay": page.locator(".story-slide,.story-bub,.story-hl").count(), "demo_pressed": page.get_attribute("[data-testid=story-toggle-demo]", "aria-pressed")}
    page.screenshot(path=str(out / "99-after-exit.png")); br.close()
flags = [(s["n"], s.get("key"), f) for s in report["steps"] for f in ("clipped", "off_screen", "bubble_covers_target", "bubble_under_bar") if s.get(f)]
warns = [(s["n"], s.get("key"), s["warn"]) for s in report["steps"] if s.get("warn")]
report.update(bubbles=sum(s.get("kind") == "bubble" for s in report["steps"]), slides=sum(s.get("kind") == "slide" for s in report["steps"]), flags=flags, warnings=len(warns))
(out / "report.json").write_text(json.dumps(report, indent=1))
print(f"{a.profile}: {report['bubbles']} bubbles, {report['slides']} slides, ended {report['ended_status']}, back->{report.get('back_after_done_shows')!r}, after Esc {report['after_escape']}")
print("keys:", [s.get("key") for s in report["steps"]])
for f in flags: print("FLAG", *f)
for w in warns[:5]: print("WARN", *w)
for pr in report["problems"]: print("PROBLEM", pr)
for e in report["console_errors"][:5]: print("CONSOLE", e)
unknown = [s["n"] for s in report["steps"] if s.get("key") == "?"]
for n_ in unknown: print("UNKNOWN key at step", n_, "(its title matches no wording: a step the script has but captions.md lacks, or wording that did not load)")
if report["ended_status"] != "done": print("NOT DONE: Story ended with status", report["ended_status"])
if not report["steps"]: print("NO STEPS: nothing was shown")
bad = flags or unknown or report["problems"] or report["console_errors"] or report["ended_status"] != "done" or not report["steps"] or (warns and not a.allow_warnings) or not report["demo_has_no_story_bar"] or report["after_escape"]["bar"] or report["after_escape"]["overlay"] or report["after_escape"]["demo_pressed"] != "true"
sys.exit(1 if bad else 0)
