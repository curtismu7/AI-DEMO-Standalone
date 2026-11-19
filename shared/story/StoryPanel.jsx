// StoryPanel: the family's one story/talk-track panel (owner, 2026-11-13). The talk track for the page,
// re-skinned by the chosen vertical, with the Allowed/Blocked switch. The lab passes `stories` (its
// stories.js: { VERTICALS, storyForMode, verticalById }) and a `prefix` for the localStorage keys, so the
// engine is shared and only the content changes. `extra` renders lab-specific notes between the controls
// and the summary. Story text renders as text nodes like everything else.
// Shared service: vendor it, never edit a lab's copy.
import { useMemo, useState } from "react";
import { fillAll } from "./fill.js";

export default function StoryPanel({ stories, prefix = "story", mode, present = false, extra = null }) {
  const KEYS = { vertical: `${prefix}.story.vertical`, path: `${prefix}.story.path`, open: `${prefix}.story.open` };
  const read = (k, fallback) => { try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked: not remembered */ } };

  const { VERTICALS, storyForMode, verticalById } = stories;
  const raw = storyForMode(mode);
  const [verticalId, setVerticalId] = useState(() => read(KEYS.vertical, "generic"));
  const [path, setPath] = useState(() => (read(KEYS.path, "happy") === "blocked" ? "blocked" : "happy"));
  const [open, setOpen] = useState(() => read(KEYS.open, "open") !== "closed");
  const [active, setActive] = useState(null);
  const vertical = verticalById(verticalId);
  const story = useMemo(() => {
    if (!raw) return null;
    // fillAll comes from the lab's fill.js (same module contract as shared/story/fill.js).
    return fillAll(raw, vertical);
  }, [raw, vertical]);
  if (!story) return null;

  const isOpen = open || present;
  const blocked = path === "blocked";
  const current = story.steps.find((s) => s.n === active) || story.steps[0];
  const text = (step) => (blocked && step.blocked ? step.blocked : step);
  const pickVertical = (id) => { setVerticalId(id); write(KEYS.vertical, id); };
  const pickPath = (p) => { setPath(p); write(KEYS.path, p); };
  const toggle = () => { setOpen(!open); write(KEYS.open, open ? "closed" : "open"); };

  return (
    <section className="story" aria-label="Talk track" data-testid="story-panel">
      <header className="story__head">
        <div>
          <p className="story__eyebrow">Story {story.id} · {vertical.displayName}</p>
          <h2 className="story__title">{story.title}</h2>
        </div>
        <button type="button" className="btn" aria-expanded={isOpen} onClick={toggle} disabled={present}>{isOpen ? "Hide talk track" : "Show talk track"}</button>
      </header>
      {isOpen && (
        <>
          <div className="story__controls">
            <label className="story__field">Vertical
              <select value={vertical.id} onChange={(e) => pickVertical(e.target.value)}>
                {VERTICALS.map((v) => <option key={v.id} value={v.id}>{v.displayName}</option>)}
              </select>
            </label>
            <div className="seg" role="group" aria-label="Story path">
              <button type="button" aria-pressed={!blocked} onClick={() => pickPath("happy")}>Allowed</button>
              <button type="button" aria-pressed={blocked} onClick={() => pickPath("blocked")}>Blocked</button>
            </div>
          </div>
          {extra}
          <dl className="story__summary">
            <dt>Goal</dt><dd>{story.goal}</dd>
            <dt>Obstacle</dt><dd>{story.obstacle}</dd>
            <dt>Control</dt><dd>{story.control}</dd>
          </dl>
          <ol className="story__steps">
            {story.steps.map((s) => (
              <li key={s.n} className={s.n === current.n ? "is-current" : undefined}>
                <button type="button" className="story__step" aria-current={s.n === current.n ? "step" : undefined} onClick={() => setActive(s.n)}>
                  <span className="story__n">{s.n}</span>{s.title}
                  {blocked && s.blocked && <span className="story__tag">blocked</span>}
                </button>
                {s.n === current.n && (
                  <div className="story__body">
                    <p>{text(s).tell}</p>
                    <p className="story__say"><strong>Say:</strong> “{text(s).say}”</p>
                    <p className="story__why"><strong>Why it matters:</strong> {s.why}</p>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <p className="story__proof"><strong>Proof:</strong> {blocked ? story.proof.blocked : story.proof.happy}</p>
          <p className="story__takeaway">“{story.say}”</p>
        </>
      )}
    </section>
  );
}
