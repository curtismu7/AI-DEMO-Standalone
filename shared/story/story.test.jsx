// Story overlay, toggle and bar (vitest + Testing Library + jsdom). Run where the folder is vendored (web/src/story/).
import { render, screen, fireEvent, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import StoryToggle, { readView, storyKey } from "./StoryToggle";
import StoryBar from "./StoryBar";
import { createOverlay } from "./overlay";

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ""; document.querySelectorAll(".story-hl,.story-bub,.story-slide").forEach((e) => e.remove()); });
afterEach(() => { document.getElementById("story-style")?.remove(); });

describe("createOverlay", () => {
  test("a bubble shows the number, 'n of N', the title and text, and a highlight on its target", () => {
    document.body.innerHTML = '<button id="send">Send</button>';
    const o = createOverlay();
    o.cap({ n: 2, total: 5, title: "Ask", text: "Press Send.", target: "#send", lines: ["asks: a question"] });
    expect(document.querySelector(".story-bub h3").textContent).toBe("Ask");
    expect(document.querySelector(".story-bub .of").textContent).toBe("2 of 5");
    expect(document.querySelector(".story-bub .n").textContent).toBe("2");
    expect(document.querySelectorAll(".story-bub li")).toHaveLength(1);
    expect(document.querySelector(".story-hl")).not.toBeNull();
    o.clear(); expect(document.querySelector(".story-bub")).toBeNull(); expect(document.querySelector(".story-hl")).toBeNull();
  });

  test("text is set as text: markup in a title, an answer line or a slide is never parsed", () => {
    const o = createOverlay();
    o.cap({ n: 1, total: 1, title: "<img src=x onerror=alert(1)>", text: "<b>bold</b>", lines: ["<script>x</script>"] });
    expect(document.querySelector(".story-bub img")).toBeNull(); expect(document.querySelector(".story-bub b")).toBeNull(); expect(document.querySelector(".story-bub script")).toBeNull();
    expect(document.querySelector(".story-bub p").textContent).toBe("<b>bold</b>");
    o.slide({ title: "<i>t</i>", lead: "<u>l</u>", colA: { heading: "<b>h</b>", lines: ["<s>x</s>"] }, colB: { heading: "B", lines: ["y"] }, verdict: "<em>v</em>" });
    expect(document.querySelector(".story-slide i, .story-slide u, .story-slide b, .story-slide s, .story-slide em")).toBeNull();
  });

  test("a missing target gives a centred bubble with no highlight and no tail; a long answer line wraps and does not throw", () => {
    const o = createOverlay();
    o.cap({ n: 1, total: 1, title: "t", text: "x", target: "#nope", lines: ["w".repeat(500)] });
    expect(document.querySelector(".story-hl")).toBeNull(); expect(document.querySelector(".story-tail")).toBeNull();
  });

  test("a slide has both columns and the verdict; no image unless one is given; a broken image is removed", () => {
    const o = createOverlay();
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
