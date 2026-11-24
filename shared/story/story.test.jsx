// Story overlay, toggle and bar (vitest + Testing Library + jsdom). Run where the folder is vendored (web/src/story/).
import { render, screen, fireEvent, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import StoryToggle, { readView, storyKey } from "./StoryToggle";
import StoryBar from "./StoryBar";
import { createOverlay } from "./overlay";

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ""; document.querySelectorAll(".story-hl,.story-bub,.story-slide").forEach((e) => e.remove()); });
const made = [];
const mk = (opts) => { const o = createOverlay(opts); made.push(o); return o; };   // every overlay is destroyed after its test: a live one keeps listening for resize
afterEach(() => { made.splice(0).forEach((o) => o.destroy()); document.getElementById("story-style")?.remove(); });

describe("createOverlay", () => {
  test("a bubble shows the number, 'n of N', the title and text, and a highlight on its target", () => {
    document.body.innerHTML = '<button id="send">Send</button>';
    const o = mk();
    o.cap({ n: 2, total: 5, title: "Ask", text: "Press Send.", target: "#send", lines: ["asks: a question"] });
    expect(document.querySelector(".story-bub h3").textContent).toBe("Ask");
    expect(document.querySelector(".story-bub .of").textContent).toBe("2 of 5");
    expect(document.querySelector(".story-bub .n").textContent).toBe("2");
    expect(document.querySelectorAll(".story-bub li")).toHaveLength(1);
    expect(document.querySelector(".story-hl")).not.toBeNull();
    o.clear(); expect(document.querySelector(".story-bub")).toBeNull(); expect(document.querySelector(".story-hl")).toBeNull();
  });

  test("text is set as text: markup in a title, an answer line or a slide is never parsed", () => {
    const o = mk();
    o.cap({ n: 1, total: 1, title: "<img src=x onerror=alert(1)>", text: "<b>bold</b>", lines: ["<script>x</script>"] });
    expect(document.querySelector(".story-bub img")).toBeNull(); expect(document.querySelector(".story-bub b")).toBeNull(); expect(document.querySelector(".story-bub script")).toBeNull();
    expect(document.querySelector(".story-bub p").textContent).toBe("<b>bold</b>");
    o.slide({ title: "<i>t</i>", lead: "<u>l</u>", colA: { heading: "<b>h</b>", lines: ["<s>x</s>"] }, colB: { heading: "B", lines: ["y"] }, verdict: "<em>v</em>" });
    expect(document.querySelector(".story-slide i, .story-slide u, .story-slide b, .story-slide s, .story-slide em")).toBeNull();
  });

  test("a missing target gives a centred bubble with no highlight and no tail; a long answer line wraps and does not throw", () => {
    const o = mk();
    o.cap({ n: 1, total: 1, title: "t", text: "x", target: "#nope", lines: ["w".repeat(500)] });
    expect(document.querySelector(".story-hl")).toBeNull(); expect(document.querySelector(".story-tail")).toBeNull();
  });

  test("regression: a slide image that fails to load removes only the image; both text columns stay", () => {
    const o = mk();
    o.slide({ title: "T", lead: "L", colA: { heading: "A", lines: ["a1", "a2"] }, colB: { heading: "B", lines: ["b1"] }, verdict: "V", image: "/assets/missing.jpg" });
    fireEvent.error(document.querySelector(".story-slide img"));
    expect(document.querySelector(".story-slide img")).toBeNull();
    expect(document.querySelectorAll(".story-slide li")).toHaveLength(3); expect(document.querySelectorAll(".story-slide .col")).toHaveLength(2);
    expect(document.querySelector(".story-slide .card").classList.contains("withimg")).toBe(false);
  });

  test("regression: a target the page replaced is found again, and a detached one is treated as missing", async () => {
    document.body.innerHTML = '<div id="slot"><button id="send">Send</button></div>';
    const rect = (top) => () => ({ left: 50, top, width: 80, height: 30, right: 130, bottom: top + 30 });
    const first = document.getElementById("send"); first.getBoundingClientRect = rect(100);
    const o = mk(); o.cap({ n: 1, total: 1, title: "t", text: "x", target: () => document.getElementById("send") });
    expect(document.querySelector(".story-hl").style.top).toBe("95px");
    document.getElementById("slot").innerHTML = '<button id="send">Send</button>';           // the page re-rendered: a new node
    const next = document.getElementById("send"); next.getBoundingClientRect = rect(240);
    window.dispatchEvent(new Event("resize")); await new Promise((r) => setTimeout(r, 40));
    expect(document.querySelector(".story-hl").style.top).toBe("235px");
    o.clear();
    const gone = document.createElement("div"); const o2 = mk(); o2.cap({ n: 1, total: 1, title: "t", text: "x", target: gone });   // never attached
    expect(document.querySelector(".story-hl")).toBeNull();
  });

  test("regression: the bubble is placed with its measured width (narrow screens), not the nominal 470", () => {
    document.body.innerHTML = '<button id="t">t</button>';
    const t = document.getElementById("t"); t.getBoundingClientRect = () => ({ left: 400, top: 400, width: 100, height: 30, right: 500, bottom: 430 });
    const orig = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () { return this.classList.contains("story-bub") ? { left: 0, top: 0, width: 300, height: 120, right: 300, bottom: 120 } : orig.call(this); };
    try {
      const o = mk(); o.cap({ n: 1, total: 1, title: "t", text: "x", target: t, prefer: "below" });
      expect(parseFloat(document.querySelector(".story-bub").style.left)).toBe(300);   // centred under the target with the measured width: 450 - 300/2 (with the nominal 470 it would be 215)
    } finally { HTMLElement.prototype.getBoundingClientRect = orig; }
  });

  test("regression: the highlight follows a resize, and stops following once cleared", async () => {
    document.body.innerHTML = '<button id="send">Send</button>';
    const t = document.getElementById("send"); let top = 100;
    t.getBoundingClientRect = () => ({ left: 50, top, width: 80, height: 30, right: 130, bottom: top + 30 });
    const o = mk();
    o.cap({ n: 1, total: 1, title: "t", text: "x", target: t });
    expect(document.querySelector(".story-hl").style.top).toBe("95px");
    top = 300; window.dispatchEvent(new Event("resize")); await new Promise((r) => setTimeout(r, 40));
    expect(document.querySelector(".story-hl").style.top).toBe("295px");
    o.clear(); top = 500; window.dispatchEvent(new Event("resize")); await new Promise((r) => setTimeout(r, 40));
    expect(document.querySelector(".story-hl")).toBeNull(); expect(document.querySelector(".story-bub")).toBeNull();
    o.destroy();
  });

  test("a slide has both columns and the verdict; no image unless one is given; a broken image is removed", () => {
    const o = mk();
    const slide = { title: "T", lead: "L", colA: { heading: "A", lines: ["a1", "a2"] }, colB: { heading: "B", lines: ["b1"] }, verdict: "V" };
    o.slide({ ...slide, image: null });
    expect(document.querySelectorAll(".story-slide li")).toHaveLength(3); expect(document.querySelector(".story-slide img")).toBeNull();
    o.slide({ ...slide, image: "/assets/x.jpg" });
    const img = document.querySelector(".story-slide img"); expect(img).not.toBeNull();
    fireEvent.error(img); expect(document.querySelector(".story-slide img")).toBeNull();
    o.destroy(); expect(document.getElementById("story-style")).toBeNull();
  });
});

describe("StoryToggle", () => {
  test("Demo is the default; choosing Story calls onChange, is remembered, and Demo brings it back", () => {
    const onChange = vi.fn();
    const { unmount } = render(<StoryToggle prefix="t" onChange={onChange} />);
    expect(screen.getByTestId("story-toggle-demo")).toHaveAttribute("aria-pressed", "true");
    expect(onChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByTestId("story-toggle-story"));
    expect(onChange).toHaveBeenLastCalledWith(true); expect(localStorage.getItem(storyKey("t"))).toBe("story");
    unmount(); render(<StoryToggle prefix="t" />);
    expect(screen.getByTestId("story-toggle-story")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("story-toggle-demo")); expect(localStorage.getItem(storyKey("t"))).toBe("demo");
  });

  test("?story=1 turns Story on; per-lab prefixes do not share a choice", () => {
    expect(readView("t", "?story=1")).toBe("story"); expect(readView("t", "")).toBe("demo");
    localStorage.setItem(storyKey("a"), "story"); expect(readView("a", "")).toBe("story"); expect(readView("b", "")).toBe("demo");
  });

  test("blocked storage does not break the toggle", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<StoryToggle prefix="t" />);
    fireEvent.click(screen.getByTestId("story-toggle-story"));
    expect(screen.getByTestId("story-toggle-story")).toHaveAttribute("aria-pressed", "true");
    spy.mockRestore(); set.mockRestore();
  });
});

function fakeStory(over = {}) {
  let state = { active: true, status: "showing", n: 2, total: 5, playing: false, paused: false, speed: "normal", message: "", warnings: [], canBack: true, canNext: true, ...over };
  const subs = new Set();
  const calls = [];
  const rec = (name) => (...a) => { calls.push([name, ...a]); };
  return {
    calls, set(next) { state = { ...state, ...next }; subs.forEach((f) => f(state)); },
    state: () => state, subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    next: rec("next"), back: rec("back"), exit: rec("exit"), play: rec("play"), pause: rec("pause"), resume: rec("resume"), restart: rec("restart"),
    setSpeed: rec("setSpeed"), manualInput: rec("manualInput"),
  };
}

describe("StoryBar", () => {
  test("regression: with no story running the bar leaves the page's own arrow keys and Esc alone", () => {
    const s = fakeStory({ active: false }); render(<StoryBar story={s} />);
    const right = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }); document.body.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(false); fireEvent.keyDown(document.body, { key: "Escape" });
    expect(s.calls.filter((c) => c[0] !== "manualInput")).toEqual([]);
  });

  test("regression: the bar picks up a story that started before it subscribed", () => {
    const s = fakeStory({ active: false }); const real = s.state; let first = true;
    s.state = () => { if (first) { first = false; return real(); } return { ...real(), active: true }; };   // active by the time the effect runs, with no emit
    render(<StoryBar story={s} />);
    expect(screen.getByTestId("story-bar")).toBeInTheDocument();
  });

  test("shows nothing when Story is not active", () => {
    const s = fakeStory({ active: false }); render(<StoryBar story={s} />);
    expect(screen.queryByTestId("story-bar")).toBeNull();
  });

  test("Back, Next, Play, Exit and the speed menu drive the engine; Mock is labelled simulated", () => {
    const s = fakeStory(); render(<StoryBar story={s} mock />);
    expect(screen.getByTestId("story-simulated")).toHaveTextContent("Simulated");
    fireEvent.click(screen.getByTestId("story-back")); fireEvent.click(screen.getByTestId("story-next")); fireEvent.click(screen.getByTestId("story-play"));
    fireEvent.change(screen.getByTestId("story-speed"), { target: { value: "slower" } }); fireEvent.click(screen.getByTestId("story-exit"));
    expect(s.calls.map((c) => c[0])).toEqual(["back", "next", "play", "setSpeed", "exit"]); expect(s.calls[3][1]).toBe("slower");
  });

  test("while playing the button is Pause, then Resume; Real mode shows no simulated label", () => {
    const s = fakeStory({ playing: true }); render(<StoryBar story={s} />);
    expect(screen.queryByTestId("story-simulated")).toBeNull();
    fireEvent.click(screen.getByTestId("story-pause")); expect(s.calls.at(-1)[0]).toBe("pause");
    act(() => s.set({ paused: true })); fireEvent.click(screen.getByTestId("story-play")); expect(s.calls.at(-1)[0]).toBe("resume");
  });

  test("Next is disabled while a run is in flight and Back at the first step", () => {
    const s = fakeStory({ status: "waiting", canNext: false, canBack: false }); render(<StoryBar story={s} />);
    expect(screen.getByTestId("story-next")).toBeDisabled(); expect(screen.getByTestId("story-back")).toBeDisabled();
    expect(screen.getByTestId("story-msg")).toHaveTextContent("Waiting for the run");
  });

  test("a failure message and unreadable values are shown, not hidden", () => {
    const s = fakeStory({ status: "stalled", message: "Play stopped: The run timed out.", warnings: ['"p1": {status} could not be read from the page'] }); render(<StoryBar story={s} />);
    expect(screen.getByTestId("story-msg")).toHaveTextContent("Play stopped: The run timed out."); expect(screen.getByTestId("story-warn")).toHaveTextContent("1 value not readable");
  });

  test("keyboard: arrows move, Esc exits, but arrows leave the question field alone", () => {
    document.body.innerHTML = '<input id="q">';
    const s = fakeStory(); render(<StoryBar story={s} />);
    fireEvent.keyDown(document.body, { key: "ArrowRight" }); fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    fireEvent.keyDown(document.getElementById("q"), { key: "ArrowRight" });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(s.calls.map((c) => c[0]).filter((n) => n !== "manualInput")).toEqual(["next", "back", "exit"]);
  });

  test("a real click outside the Play controls is manual input; one on Play is not; a page-made event is not", () => {
    document.body.innerHTML = '<button id="page">page</button>';
    const s = fakeStory({ playing: true }); render(<StoryBar story={s} isManual={(e) => e.detail === 1} />);   // jsdom cannot make a trusted event: detail 1 stands in for one
    const fire = (el, real) => el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, detail: real ? 1 : 0 }));
    const manual = () => s.calls.filter((c) => c[0] === "manualInput").length;
    fire(document.getElementById("page"), true); expect(manual()).toBe(1);
    fire(screen.getByTestId("story-pause"), true); expect(manual()).toBe(1);
    fire(document.getElementById("page"), false); expect(manual()).toBe(1);
  });

  test("by default the browser's own trusted flag decides: a script's event is not manual input", () => {
    document.body.innerHTML = '<button id="page">page</button>';
    const s = fakeStory({ playing: true }); render(<StoryBar story={s} />);
    document.getElementById("page").dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(s.calls.filter((c) => c[0] === "manualInput")).toHaveLength(0);
  });

  test("when the story is done, Play is disabled and Restart appears", () => {
    const s = fakeStory({ status: "done", canNext: false }); render(<StoryBar story={s} />);
    expect(screen.getByTestId("story-play")).toBeDisabled(); fireEvent.click(screen.getByTestId("story-restart")); expect(s.calls.at(-1)[0]).toBe("restart");
  });
});
