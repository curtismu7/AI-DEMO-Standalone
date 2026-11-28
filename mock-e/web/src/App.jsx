import { useEffect, useRef, useState } from "react";
import TopMenu from "./top-menu/TopMenu.jsx";
import TalkTrackDialog from "./talk-track/TalkTrackDialog.jsx";
import HelpDialog from "./help-dialog/HelpDialog.jsx";
import SequenceView from "./evidence/SequenceView";
import MovieReel from "./evidence/MovieReel";
import StepDetailPanel from "./evidence/StepDetailPanel";
import { Tag } from "./evidence/Tag";
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

// The agent's reply, derived from the run itself (the customer-agent rule: nothing generated, nothing the engine did not produce).
function replyOf(scenario, hops) {
  if (scenario === "deny") {
    const refused = hops.find((h) => h.verdict === "deny");
    return {
      who: "Gateway",
      text: "I could not complete that. The gateway refused the tool call: the delegated token does not carry accounts:read (insufficient_scope). Nothing was sent to the tool.",
      outcome: "DENY",
    };
  }
  const tool = hops.find((h) => h.kind === "tool-dispatched");
  return {
    who: "Agent",
    text: tool ? "Here is Alex's account balance, read through the gateway with the delegated token — the policy permitted it at call time." : "Working on it...",
    outcome: "PERMIT",
  };
}

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
  const started = revealed > 0;
  const reply = replyOf(scenario, hops);

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

  // The setup sidebar (New chat + prompts): collapsed by default, the chevron icon toggles it.
  const [setupOpen, setSetupOpen] = useState(false);
  const PROMPTS = [
    { text: "Show Alex's account balance", scenario: "uc1" },
    { text: "Show my mortgage balance", scenario: "uc1" },
    { text: "Transfer with the wrong scope (refused)", scenario: "deny" },
  ];
  const say = (p) => { setPrompt(p.text); setScenario(p.scenario); run(); };

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

      <main className={`frame ${setupOpen ? "frame--setup" : ""}`}>
        <div className="agno">
          {setupOpen && (
            <aside className="setup" aria-label="Setup" data-testid="setup">
              <p className="kicker">What to type</p>
              <ul className="setup__prompts">
                {PROMPTS.map((p) => (
                  <li key={p.text}><button type="button" className="wtt__chip" onClick={() => say(p)}>{p.text}</button></li>
                ))}
              </ul>
              <p className="kicker">New chat</p>
              <button type="button" onClick={reset}>+ New chat</button>
            </aside>
          )}
          <button type="button" className={`setup-toggle ${setupOpen ? "open" : ""}`} aria-expanded={setupOpen}
            aria-label={setupOpen ? "Hide setup" : "Show setup"} title={setupOpen ? "Hide setup" : "Show setup"}
            data-testid="setup-toggle" onClick={() => setSetupOpen((v) => !v)}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="work">

        <section className="prompt-card card" aria-label="Prompt">
          <div className="prompt-row">
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="Prompt" />
            <button className="primary" type="button" onClick={run}>{running ? "Running…" : done ? "Replay" : "Send"}</button>
            <select value={scenario} onChange={(e) => { setScenario(e.target.value); setRevealed(0); setSelected(null); }} aria-label="Scenario">
              <option value="uc1">UC1 · balance read (PERMIT)</option>
              <option value="deny">UC1 · wrong scope (DENY)</option>
            </select>
          </div>
          {started && (
            <div className="turns" aria-label="Conversation">
              <div className="turn">
                <div className="turn__you">
                  <span className="avatar" aria-hidden="true">You</span>
                  <p className="turn__said">{prompt}</p>
                </div>
                <div className="turn__agent">
                  <span className="avatar avatar--agent" aria-hidden="true">AI</span>
                  <div className="turn__body">
                    {!done
                      ? <p className="ev-muted" data-testid="turn-running">Working on it{running ? "…" : ""}</p>
                      : <div className="turn__answer" data-testid="turn-answer">
                          <p className="turn__who kicker">{reply.who}</p>
                          <p data-testid="turn-answer-text">{reply.text}</p>
                          <span><Tag state={reply.outcome === "PERMIT" ? "ok" : "bad"}>{reply.outcome}</Tag> <button type="button" className="turn__ev" onClick={() => setSelected(hops[0].n)}>See evidence →</button></span>
                        </div>}
                  </div>
                </div>
              </div>
            </div>
          )}
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
          </div>
        </div>
      </main>

      <TalkTrackDialog isOpen={talkOpen} onClose={() => setTalkOpen(false)} talk={TALK} title="Talk track" storageKey="mock-e.talk" />
      <HelpDialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} sections={HELP} title="About this mock" storageKey="mock-e.help" />
    </div>
  );
}
