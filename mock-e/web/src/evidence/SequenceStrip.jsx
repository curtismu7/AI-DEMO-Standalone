import { useMemo, useState } from "react";
import { actorOf, actorsIn, isNote, laneVar, txt, verdictWord, withSkipped } from "./lanes";
import "./evidence.css";

// SequenceStrip: a CONVERTED COPY of SequenceView (shared/evidence/SequenceView.jsx) — the same
// SVG sequence drawing (lane boxes, lifelines, arrows with labels, notes, verdict colours, the
// same evidence.css classes), reduced to a compact always-visible strip. Converted, not wrapped:
// the toolbar, zoom/font/slow machinery, progress rail, actor cards and footer are removed; the
// constants are smaller; every row is still a button that calls onSelect(n). Kept beside the full
// SequenceView on the page so the two can be compared for the demo-standard decision.
const COL = 190;    // lane spacing in the strip
const BOX_W = 96;   // compact lane box
const ROW = 34;     // compact row height
const TOP = 46;
const CHAR_W = 5.4;
const STATE_WORD = { idle: "idle", done: "done", active: "working" };

const rowLabel = (h) => `${txt(h.title)}${h.verdict && h.verdict !== "ok" ? ` · ${verdictWord(h.verdict)}` : ""}`;
const labelW = (s) => s.length * CHAR_W + 14;
const noteW = (s) => Math.max(110, s.length * CHAR_W + 24);

export default function SequenceStrip({ hops = [], selected = null, onSelect }) {
  const shown = useMemo(() => withSkipped(hops, false), [hops]);
  const cast = useMemo(() => actorsIn(shown), [shown]);
  const [actor, setActor] = useState(null);

  if (!hops.length) return <p className="ev-empty" data-testid="strip-empty">Run a use case to fill the strip.</p>;

  const focusHop = shown.find((h) => h.n === selected);
  const done = focusHop ? shown.findIndex((h) => h.n === selected) + 1 : shown.length;
  const actorState = (id) => (focusHop && (focusHop.from === id || focusHop.to === id) ? "active" : shown.slice(0, done).some((h) => h.from === id || h.to === id) ? "done" : "idle");

  const labels = shown.map(rowLabel);
  const half = labels.reduce((m, s, i) => Math.max(m, (isNote(shown[i]) ? noteW(s) : labelW(s)) / 2), 0);
  const gaps = Math.max(cast.length - 1, 0);
  const pad = Math.max(COL / 2, BOX_W / 2 + 8, half + 8);
  const colX = (id) => pad + cast.indexOf(id) * COL;
  const width = pad * 2 + gaps * COL;
  const footY = TOP + shown.length * ROW - 16;
  const height = footY + 30;
  const openActor = (id) => setActor((cur) => (cur === id ? null : id));

  return (
    <section className="ev-root sq strip-view" aria-label="Run strip, compact sequence" data-testid="sequence-strip">
      {actor && (
        <div className="strip-actorcard" role="note" aria-label="Actor details">
          <button type="button" className="strip-actorcard__x" aria-label="Close actor details" onClick={() => setActor(null)}>×</button>
          <p><b>{actorOf(actor).label}</b></p>
          <p className="ev-muted">{actorOf(actor).role}</p>
        </div>
      )}
      <div className="sq-scroll">
        <svg className="sq-svg" viewBox={`0 0 ${width} ${height}`} width={width} style={{ maxWidth: "100%" }} role="group"
          aria-label={`Run strip, ${shown.length} steps`} data-testid="strip-svg">
          {cast.map((id) => {
            const x = colX(id);
            const a = actorOf(id);
            return (
              <g key={id} className="sq-lane" style={{ "--lane": laneVar(id) }} data-actor={id}>
                <g role="button" tabIndex={-1} aria-label={`${a.label}, ${STATE_WORD[actorState(id)]}, details`} onClick={() => openActor(id)}>
                  <rect className={`sq-lbox strip-lbox`} data-state={actorState(id)} x={x - BOX_W / 2} y={2} width={BOX_W} height={26} rx="7" />
                  <text className="sq-lt strip-lt" x={x} y={19} textAnchor="middle">{a.label}</text>
                </g>
                <line className="sq-life" x1={x} y1="28" x2={x} y2={footY} />
              </g>
            );
          })}
          {shown.map((h, i) => {
            const y = TOP + i * ROW;
            const on = h.n === selected;
            const label = labels[i];
            const common = {
              className: "sq-row", "data-on": on ? "true" : undefined, "data-verdict": h.verdict || "ok",
              role: "button", tabIndex: 0, "aria-current": on ? "step" : undefined,
              "aria-label": `Step ${h.n}, ${label}, ${actorOf(h.from).label} to ${actorOf(h.to).label}`,
              "data-testid": `strip-row-${h.n}`,
              onClick: () => onSelect?.(h.n), onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(h.n); } },
            };
            const hit = <rect className="sq-hit" x="0" y={y - 15} width={width} height={ROW - 2} rx="4" />;
            if (isNote(h)) {
              const x = colX(h.from);
              const w = noteW(label);
              return (
                <g key={h.n} {...common} style={{ "--lane": laneVar(h.from) }}>
                  {hit}
                  <rect className="sq-note" x={x - w / 2} y={y - 12} width={w} height={22} rx="5" />
                  <text className="sq-al strip-al" x={x} y={y + 3} textAnchor="middle">{label}</text>
                </g>
              );
            }
            const x1 = colX(h.from), x2 = colX(h.to);
            const end = x2 > x1 ? x2 - 4 : x2 + 4;
            const mid = (x1 + x2) / 2;
            const w = labelW(label);
            return (
              <g key={h.n} {...common}>
                {hit}
                <line className="sq-msg" x1={x1} y1={y} x2={end} y2={y} markerEnd="" />
                <polygon className={`strip-head ${on ? "strip-head--on" : ""}`} points={x2 > x1 ? `${x2}, ${y} ${x2 - 7},${y - 3.5} ${x2 - 7},${y + 3.5}` : `${x2},${y} ${x2 + 7},${y - 3.5} ${x2 + 7},${y + 3.5}`} />
                <rect className="sq-albox" x={mid - w / 2} y={y - 16} width={w} height={16} rx="4" />
                <text className="sq-al strip-al" x={mid} y={y - 4} textAnchor="middle">{label}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
