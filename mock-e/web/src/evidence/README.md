# evidence: sequence view, movie reel, step detail and actor card

The shared evidence screens for every -LAB that draws a token chain. Ported from AI-DEMO2's SequenceReelDiagram, TokenChainNodeRail / TokenChainFilmstrip and StepDetailPanel, restyled to the Ping UI standard (owner decision 2026-11-08: port, then restyle; vendored, never imported across repos). First vendored in customer-agent-LAB (`web/src/evidence/`, commit 66d14d2).

They draw `demo-hop/1` hops (see `../hop-detail/README.md`): the server enriches each hop with the shared hop catalog, and these screens only display what the server sent. Mock keeps MOCK tokens raw for teaching; Real redacts on the server.

## Use

Copy every file in this folder into `web/src/evidence/` unchanged. Needs React 18 and the shared `standalone-ui.css` (the `--lane-*` tokens and the base tokens). No other dependency.

```jsx
import SequenceView from "./evidence/SequenceView";
import MovieReel from "./evidence/MovieReel";
import StepDetailPanel from "./evidence/StepDetailPanel";

<SequenceView hops={run.hops} selected={n} onSelect={setN} />
<MovieReel hops={run.hops} selected={n} onSelect={setN} />
<StepDetailPanel hops={run.hops} selected={n} onSelect={setN} onClose={() => setN(null)} />
```

Hops with `verdict: 'skip'` (steps not in this run) are hidden by default behind a "+N hops not in this run" button (`aria-expanded`); shown, they are drawn faint after every hop that ran. Arrow keys, slow mode and the step detail's Prev / Next never land on a hidden one. All components are presentational and never fetch. Every actor tile, lifeline box, step row and reel frame is a button; arrow keys, Home and End move between steps; Escape closes the actor card and the step detail. The actor card is a `FloatingDialog` (`../floating-dialog/`): drag, resize or pop it out; vendor that folder next to this one. Every status is a word, never colour alone.

`evidence.test.jsx` and `fixtures.js` are the tests a copy must keep passing (vitest + Testing Library + jsdom).

## Not ported (yet)

Pop-out windows for the step detail and the reel (the actor card pops out), presenter mode, the legend, the reel's chain-view tabs (Tokens / MCP / Trust / Simple / Detailed / Demo Track), the Form/JSON payload toggle, "Inspect token claims" and "Show only this actor's steps". They depend on AI-DEMO2 services or modals and come in a later step.
