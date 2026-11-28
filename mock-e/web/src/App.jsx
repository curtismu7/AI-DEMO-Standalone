import { useEffect, useRef, useState } from "react";
import TopMenu from "./top-menu/TopMenu.jsx";
import TalkTrackDialog from "./talk-track/TalkTrackDialog.jsx";
import HelpDialog from "./help-dialog/HelpDialog.jsx";
import SequenceView from "./evidence/SequenceView";
import MovieReel from "./evidence/MovieReel";
import StepDetailPanel from "./evidence/StepDetailPanel";
import { UC1_RUN, UC1_DENY_RUN } from "./evidence/fixtures";
import "./top-menu/top-menu.css";
import "./floating-dialog/floating-dialog.css";

// Demo Standard Mock E — the Ping standalone demo standard, applied: shell-bar + shared TopMenu,
// simulation banner first, ONE real SequenceView filling in live hop by hop, the real MovieReel
// (re-flowed top-to-bottom on the right) and StepDetailPanel sharing the same selected hop.

const TALK = [
  { id: "t1", title: "Set the scene", say: "A customer asks the agent for their account balance. The agent never holds a password; everything it does is delegated." },
  { id: "t2", title: "Sign-in and consent", say: "The customer signs in without a redirect, then consents to the agent acting for them — recorded as may_act data." },
  { id: "t3", title: "Token exchange", say: "The back end swaps the user token plus the agent's own token for a delegated token: same subject, the agent in act, scope narrowed." },
  { id: "t4", title: "Enforced call", say: "The gateway checks the delegated token, Authorize decides at call time, and only then does the tool run." },
];

const HELP = [
  { heading: "What this mock shows", body: "The demo-standard interaction design: one real sequence diagram that fills in live as the run progresses, with the movie reel and step detail sharing the selection." },
  { heading: "Components", body: "Every screen is the shared evidence component set (SequenceView, MovieReel, StepDetailPanel) from shared/evidence — nothing is hand-drawn." },
];

export default function App() {
  const [prompt, setPrompt] = useState("Show Alex's account balance");
  const [scenario, setScenario] = useState("uc1");
  const [running, setRunning] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [selected, setSelected] = useState(null);
  const [theme, setTheme] = useState("auto");
  const [fontSize, setFontSize] = useState("M");
  const [present, setPresent] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const reset = () => { clearInterval(timer.current); setRevealed(0); setSelected(null); setRunning(false); };

  return (
    <div className="page">
      <header className="shell-bar">
        <div className="shell-brand">
          <span className="shell-logo" aria-hidden="true">MA</span>
          <span className="shell-brand__text">
            <span className="shell-brand__name">Meridian Air — agent demo</span>
            <span className="shell-brand__tag">mock for the demo standard</span>
          </span>
        </div>
        <nav className="shell-nav" aria-label="Pages">
          <span className="shell-nav__list">
            <button type="button" aria-current="page">Chat</button>
            <button type="button">Run history</button>
            <button type="button">Diagram</button>
          </span>
        </nav>
        <div className="shell-right">
          <TopMenu
            mode={{ value: "mock", onChange: () => {} }}
            theme={{ value: theme, onChange: setTheme }}
            fontSize={{ value: fontSize, onChange: setFontSize }}
            present={{ active: present, onToggle: () => setPresent((v) => !v) }}
            talkTrack={{ active: talkOpen, onToggle: () => setTalkOpen((v) => !v) }}
            help={{ onClick: () => setHelpOpen(true) }}
            onReset={reset}
          />
        </div>
      </header>

      <p className="banner" role="note">SIMULATED, Mock mode: the hops come from the shared evidence fixtures (the engine's UC1 run). No tenant, gateway or identity provider is touched.</p>

      <main className="frame">
        <h1>Agent demo</h1>

        <section className="prompt-card card" aria-label="Prompt">
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
        <div className="card card--neutral">
          {!done
            ? <p className="ev-muted">Run a prompt: the verdict, the policy decision and the token evidence appear here.</p>
            : <p><strong>The delegated token carried the right scope; the gateway filter chain passed; the policy answered PERMIT at call time.</strong> Click any hop above for its full evidence.</p>}
        </div>
      </main>

      <TalkTrackDialog isOpen={talkOpen} onClose={() => setTalkOpen(false)} talk={TALK} title="Talk track" storageKey="mock-e.talk" />
      <HelpDialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} sections={HELP} title="About this mock" storageKey="mock-e.help" />
    </div>
  );
}
