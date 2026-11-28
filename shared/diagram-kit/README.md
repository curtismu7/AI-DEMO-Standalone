# diagram-kit: arrow labels that do not overlap, and boxes that expand to show their details

One copy for every lab's React Flow diagram. Vendored, never imported across repos (same convention as `shared/floating-dialog`).

## What it gives a diagram

- **Arrow labels above the boxes, placed clear of each other and of the boxes.** Each label starts on its own arrow (the middle of
  React Flow's own curve) and, if that spot is taken, slides along the arrow and then sideways to the first spot that touches no
  other label and no box. It uses the sizes the browser measured and does not depend on the walkthrough step, so a label never
  jumps while it plays. The label of the active arrow turns bold and coloured and is raised above the others.
- **Click a box and it expands in place.** Below its title: its group, where it is in the code (`sources`, each a link to that file at
  the pinned commit, when the data has a GitHub `repo`), its **reach** (boxes upstream and downstream along the arrows), and the
  boxes it sends to and receives from, one row per arrow (click one to open that box). Click the box again, **Close**, or the empty
  canvas collapses it. The expanded box sits above its neighbours and the view eases to it; **Copy link** makes a link that opens
  the page with the box expanded.

## Vendor it

1. Copy these into `web/src/diagram-kit/` byte for byte (no header lines): `diagramKit.js`, `DiagramKit.jsx`, `diagram-kit.css`,
   `diagramKit.test.js`, `DiagramKit.test.jsx` and `diagram-kit.sha256`. Replace the first line of the sha256 file with
   `# vendored byte for byte from curtismu7/AI-DEMO-Standalone shared/diagram-kit at <commit> (main); re-vendor, do not edit.`
   and add a pin test (copy `web/src/diagram-kit.pin.test.js` from the first lab that vendors it, hitl-mfa-lab-LAB). Change the
   files here, re-pin, then re-vendor; never edit a lab's copy.
2. Needs `@xyflow/react` 12, React 18, the shared `standalone-ui.css` tokens (the older `--th-*` tokens work as fallbacks), and for
   the tests vitest, Testing Library and jsdom (a `ResizeObserver` stub, as React Flow already needs).

## What the colours mean

The details sit on a small card of their own inside the box, so the status colours are always read against `--surface` (their
documented contrast, light and dark) whatever colour the box is. **Blue** is where a box is: its group, its source links. **Green** is
what it sends to: Outgoing and Downstream. **Amber** is what reaches it: Incoming and Upstream. Every section also says so in words, so
colour is never the only cue. The active arrow's label uses the accent (override with `--dk-active` / `--dk-active-text`).

## Wire it in (about ten lines)

Your diagram needs a **graph**: `{ nodes: [{ id, label, sub?, group?, groupLabel?, sources? }], edges: [{ source, target, label?, hop? }], groups?, repo? }`.
A `diagram-studio/1` document already is one; a lab with its own data maps onto it in a line or two:

```js
// a pattern of { nodes: [{ id, label, kind }], steps: [{ from, to, label }] }: each step is an arrow, a box's kind is its group
const graph = useMemo(() => ({
  nodes: pattern.nodes.map((n) => ({ id: n.id, label: n.label, group: n.kind })),
  edges: pattern.steps.map((s, i) => ({ source: s.from, target: s.to, label: `${i + 1}. ${s.label}` })),
}), [pattern]);
```

Then, in the component that renders the `<ReactFlow>`:

```jsx
import { ArrowNoLabel, EdgeLabels, FitOpen, Passport, PassportActions } from "./diagram-kit/DiagramKit.jsx";
import { boxPassport, sidePoint } from "./diagram-kit/diagramKit.js";
import "./diagram-kit/diagram-kit.css";

const edgeTypes = { arrow: ArrowNoLabel };                 // 1. edges draw the curve only: give each edge  type: "arrow"
const [open, setOpen] = useState(null);                    // 2. the id of the expanded box, or null

// 3. a node carries its details while open, and sits above its neighbours:
//    { ...node, zIndex: id === open ? 10 : undefined, data: { ..., passport: id === open ? boxPassport(graph, id) : null } }
//    and the box component draws  {data.passport && <Passport p={data.passport} />}  below its title, with className "dk-open" while open.

const actions = useMemo(() => ({                           // 4. what an expanded box can do
  open: (id) => setOpen(id), close: () => setOpen(null),
  link: (id) => { const u = new URL(window.location.href); u.searchParams.set("box", id); return u.toString(); },
}), []);

<PassportActions.Provider value={actions}>
  <ReactFlow edgeTypes={edgeTypes} onNodeClick={(_, n) => setOpen((o) => (o === n.id ? null : n.id))} onPaneClick={() => setOpen(null)} ...>
    <EdgeLabels items={labels} pointFor={(box, handle) => sidePoint(box, handleSide(handle))} />   {/* 5. one item per arrow */}
    <FitOpen open={open} />
  </ReactFlow>
</PassportActions.Provider>
```

`labels` is one item per arrow: `{ id, text, source, target, sourceHandle, targetHandle, active, dim, prefer? }`. `pointFor(box, handleId)`
says where an arrow meets a box: `sidePoint` (the middle of a side: `"t" | "b" | "l" | "r"`), `slotPoint` (eight side slots `l1`..`b2`) and
`inOutPoint` (`in`, `out`, `back-in`, `back-out`) are exported for the handle schemes the labs use; write your own for another.
`prefer` is a sideways nudge in px to try first (a request and its reply). Read `?box=` once on load to open a shared link's box
(ignore an id that is not in the graph). Give the open box a width in your own stylesheet (`.dk-open` is on its root) and set
`--dk-active` / `--dk-active-text` on the canvas if the active label should not be the accent colour.

Labels take no clicks unless you pass `onSelect` (so the boxes under them stay draggable). The expanded details are marked `nodrag nopan
nowheel`, so using them never moves the box or pans the canvas.

## Calls: the API calls and responses in the pop-up (owner, 2026-11-27)

The expanded box also shows **what actually went over the wire on this box's arrows**. Give an edge a `hop` — a `demo-hop/1` object,
built with the shared `hopDetail.mjs` (`enrichHop`, already redacted: secrets write-only, tokens `[redacted]` in Real mode, raw in Mock)
— and `boxPassport` collects the hops touching a box into `p.calls` as **Sent** (the box's outgoing arrows) and **Received** (its
incoming arrows), each with its verdict chip (ok / deny / held / error / skip) and the hop's `fact` line. Expanding a call row shows:

- the **request** and **response** through the lab's own vendored `JsonPane` — pass it as `<Passport p={...} JsonView={Json} />`
  (the default export of `web/src/json/JsonPane.jsx`). That is the standard (rules 24/24b): Form/JSON views, tokens decoded below
  the pane, important claims hot. The fallback without `JsonView` is plain text and a lab's review should flag it.
- for a wire-transcript string (request line / status line, headers, blank line, JSON body), the head stays text and the body gets the pane.
- the hop's **spec references** (from the hop catalog) as links.

Keep hops small: the box is already expanded, and the pane must stay full-view (no scrolling caps). A hop that carries no `request`
and no `response` (a decision-only step) shows only its verdict and fact.

## Limits

- Expanding in place covers things. On a very dense diagram the expanded box can cover neighbouring boxes and a few labels near its
  edge (in the studio's 52 diagrams, about 8% of labels brushed the expanded box); collapsing it brings everything back.
- **Source** is a pointer, not a live view: a lab's test can check that each cited file and line range exists, but nothing here can
  tell that code moved within a file. It says "Source", never "Verified".
- jsdom does not render React Flow's edges (nothing is measured), so a lab proves the arrow drawing in a real browser.

## Where it is tested

- `../../test/diagram-kit.test.mjs` (this repo's `node --test`): no literal colours, no `!important`, no `innerHTML`, no `eval` in the
  kit, the links built only from a validated GitHub URL, and `diagram-kit.sha256` matching the files (re-pin after any change: the command is on
  its first line).
- `diagramKit.test.js` and `DiagramKit.test.jsx` run wherever the folder is vendored (vitest): the passport, the point helpers (the middle
  of each curve is exactly where React Flow puts a label), the placement over 120 generated scenes, and the label layer in a real `<ReactFlow>`.
- Each lab proves its own wiring in a real browser (expand, collapse, deep link, no overlapping labels).
