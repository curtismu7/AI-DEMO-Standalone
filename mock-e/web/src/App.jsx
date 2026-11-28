import { useEffect, useRef, useState } from "react";
import SequenceView from "./evidence/SequenceView";
import MovieReel from "./evidence/MovieReel";
import StepDetailPanel from "./evidence/StepDetailPanel";
import { UC1_RUN, UC1_DENY_RUN } from "./evidence/fixtures";

// Demo Standard Mock E — ONE sequence diagram: the real SequenceView, fed only the hops
// revealed so far, so it fills in live as the run progresses. The MovieReel (re-flowed
// top-to-bottom on the right) and the StepDetailPanel share the same selected hop.

export default function App() {
  const [prompt, setPrompt] = useState("Show Alex's account balance");
  const [scenario, setScenario] = useState("uc1");
  const [running, setRunning] = useState(false);
  const [revealed, setRevealed] = useState(0); // hops shown so far (live run)
  const [selected, setSelected] = useState(null);
  const timer = useRef(null);

  const hops = scenario === "uc1" ? UC1_RUN : UC1_DENY_RUN;
  const shown = hops.slice(0, revealed);
  const done = revealed >= hops.length && revealed > 0;

  const run = () => {
    clearInterval(timer.current);
    setRevealed(0); setSelected(null); setRunning(true);
    let i = 0;
    timer.current = setInterval(() => {
      i += 1;
      setRevealed(i);
      setSelected(hops[i - 1].n);
      if (i >= hops.length) { clearInterval(timer.current); setRunning(false); }
    }, 700);
  };
  useEffect(() => () => clearInterval(timer.current), []);

  return (
    <div className="page">
      <header className="shell-bar">
        <div className="shell-brand"><span className="brand-mark">MA</span><span className="shell-brand__name">Meridian Air — agent demo</span></div>
        <nav className="shell-nav" aria-label="Pages">
          <a href="#" aria-current="page">Chat</a><a href="#">Run history</a><a href="#">Diagram</a>
        </nav>
        <div className="shell-right">
          <button className="ctl ctl--mode" type="button">Mode: Mock ▾</button>
          <button className="ctl" type="button">Presenter</button>
          <button className="ctl" type="button">Talk track</button>
          <button className="ctl" type="button">Help</button>
          <button className="ctl" type="button">Reset</button>
          <button className="ctl ctl--primary" type="button">Demo</button><button className="ctl" type="button">Story</button>
          <button className="ctl ctl--primary" type="button">Shelf↵</button>
          <label>Theme <button className="ctl" type="button">Auto ▾</button></label>
          <label>Text size <button className="ctl" type="button">M ▾</button></label>
        </div>
      </header>

      <main className="frame">
        <div className="banner">SIMULATED, Mock mode: the hops come from the shared evidence fixtures (the engine's UC1 run). No tenant, gateway or identity provider is touched.</div>

        <section className="prompt-card" aria-label="Prompt">
          <div className="prompt-row">
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="Prompt" />
            <button className="primary" type="button" onClick={run}>{running ? "Running…" : done ? "Replay" : "Send"}</button>
            <select value={scenario} onChange={(e) => { setScenario(e.target.value); setRevealed(0); setSelected(null); }} aria-label="Scenario">
              <option value="uc1">UC1 · balance read (PERMIT)</option>
              <option value="deny">UC1 · wrong scope (DENY)</option>
            </select>
          </div>
        </section>

        {/* ===== the ONE sequence diagram — the real SequenceView, live ===== */}
        <SequenceView hops={shown} selected={selected} onSelect={setSelected} />

        {/* ===== the reel + detail: real components, same selection ===== */}
        <div className="evidence">
          <div className="ev-main">
            <StepDetailPanel hops={shown} selected={selected} onSelect={setSelected} />
          </div>
          <aside className="ev-side" aria-label="Movie reel, top to bottom">
            {/* The vertical reel: the REAL MovieReel component; this page's CSS re-flows .rl to one top-to-bottom column. */}
            <div className="reel-vertical">
              <MovieReel hops={shown} selected={selected} onSelect={setSelected} />
            </div>
          </aside>
        </div>


        <h2>What the run proved</h2>
        <div className="empty-state" data-testid="verdict">
          {!done
            ? "Run a prompt: the verdict, the policy decision and the token evidence appear here."
            : <strong>The delegated token carried the right scope; the gateway filter chain passed; the policy answered PERMIT at call time. Click any hop above for its full evidence.</strong>}
        </div>
      </main>
    </div>
  );
}
