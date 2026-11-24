#!/usr/bin/env python3
"""Check Play for me in a real browser: Next never moves by itself, Play moves on by the video's hold, Pause freezes and Resume continues, a real click hands the story
back, and a full unattended run reaches the end.  python3 play.py --base http://127.0.0.1:6881 [--count-selector '#messages .message.user'] [--max-seconds 420]
Same needs and testids as walk.py. Exit code 1 when a check fails. The unattended run is at Faster speed and can take minutes (the holds are real time)."""
import argparse, json, sys, time
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument("--base", required=True); ap.add_argument("--count-selector", default=""); ap.add_argument("--max-seconds", type=int, default=420)
a = ap.parse_args(); BAR = "[data-testid=story-bar]"; rep = {"console_errors": []}
st = lambda pg: pg.get_attribute(BAR, "data-status") if pg.locator(BAR).count() else None
def shown(pg):
    s, b = pg.locator(".story-slide h1"), pg.locator(".story-bub h3")
    return ("slide:" + s.first.inner_text()) if s.count() else (("bubble:" + b.first.inner_text()) if b.count() else None)
with sync_playwright() as p:
    br = p.chromium.launch(headless=True); pg = br.new_context(viewport={"width": 1920, "height": 1080}).new_page()
    pg.on("console", lambda m: rep["console_errors"].append(m.text) if m.type == "error" else None); pg.on("pageerror", lambda e: rep["console_errors"].append(str(e)))
    pg.goto(a.base + "/"); pg.wait_for_selector("[data-testid=story-toggle]"); pg.click("[data-testid=story-toggle-story]"); pg.wait_for_selector(BAR)
    first = shown(pg); pg.wait_for_timeout(14000); rep["next_mode_stays_put"] = shown(pg) == first
    pg.select_option("[data-testid=story-speed]", "normal"); t0 = time.time(); pg.click("[data-testid=story-play]")
    while shown(pg) == first and time.time() - t0 < 16: pg.wait_for_timeout(100)
    rep["moved_on_after_hold"] = shown(pg) != first; rep["first_hold_seconds"] = round(time.time() - t0, 1)
    cur = shown(pg); pg.click("[data-testid=story-pause]"); pg.wait_for_timeout(12000)
    rep["pause_froze_it"] = shown(pg) == cur and pg.inner_text("[data-testid=story-play]") == "Resume"
    pg.click("[data-testid=story-play]"); pg.wait_for_timeout(500); rep["resume_works"] = pg.locator("[data-testid=story-pause]").count() == 1
    pg.mouse.click(5, 500); pg.wait_for_timeout(600)
    rep["manual_click_stopped_play"] = pg.locator("[data-testid=story-play]").count() == 1 and "took over" in pg.inner_text("[data-testid=story-msg]")
    pg.click("[data-testid=story-exit]"); pg.wait_for_timeout(500); pg.click("[data-testid=story-toggle-story]"); pg.wait_for_selector(BAR)
    pg.select_option("[data-testid=story-speed]", "faster")
    before = pg.locator(a.count_selector).count() if a.count_selector else 0
    pg.click("[data-testid=story-play]"); t0 = time.time()
    while time.time() - t0 < a.max_seconds and st(pg) != "done": pg.wait_for_timeout(300)
    rep["unattended_status"] = st(pg); rep["unattended_seconds"] = round(time.time() - t0)
    if a.count_selector: rep["questions_sent_by_play"] = pg.locator(a.count_selector).count() - before
    br.close()
print(json.dumps(rep, indent=1))
ok = all(rep[k] for k in ("next_mode_stays_put", "moved_on_after_hold", "pause_froze_it", "resume_works", "manual_click_stopped_play")) and rep["unattended_status"] == "done" and not rep["console_errors"]
sys.exit(0 if ok else 1)
