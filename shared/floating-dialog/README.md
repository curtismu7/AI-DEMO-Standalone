# floating-dialog: every modal is movable, resizable and can pop out

`FloatingDialog` is the one dialog / floating panel for standalone apps (owner 2026-11-09). It is a port of AI-DEMO2's
`DraggableModal` (`demo_api_ui/src/components/DraggableModal.jsx`, `hooks/useDraggablePanel.js`), restyled to the
standalone UI standard. Vendored, never imported across repos.

## Vendor it

1. Copy `FloatingDialog.jsx`, `useFloatingPanel.js`, `geometry.js`, `floating-dialog.css` and `floating-dialog.test.jsx`
   into `web/src/floating-dialog/` unchanged, and put one header line at the top of each naming the source commit,
   for example `// Vendored from AI-DEMO-Standalone shared/floating-dialog @ <commit>; edit there, not here.`
2. Needs React 18 (`react-dom/client`), the shared `standalone-ui.css` tokens, and for the tests vitest + Testing
   Library + jsdom (the same setup as `shared/evidence`). `FloatingDialog.jsx` imports its own CSS.
3. `shared/evidence/ActorCard.jsx` imports it as `../floating-dialog/FloatingDialog`, so vendor both folders side by side.

```jsx
import FloatingDialog from "./floating-dialog/FloatingDialog";

<FloatingDialog isOpen={open} onClose={() => setOpen(false)} title="Token claims" storageKey="myapp.claims">
  ...
</FloatingDialog>
```

## What it does

- Drag by the title bar (pointer capture, so a drag can leave the window, for example onto a second monitor). Buttons
  in the title bar keep their clicks.
- Resize from all 8 edges and corners, down to `minWidth` / `minHeight`. Growing from the top or left edge cannot push
  the title bar off the screen.
- Keyboard: the title bar is focusable. Arrow keys move the dialog 10px (Shift: 50px); Alt + arrow keys resize it
  from the bottom-right corner. A keyboard move is kept inside the window.
- Pop out: opens a same-origin blank window (`window.open('', name, 'popup,width=…,height=…')`, never a URL), copies
  this page's `<link rel="stylesheet">` and `<style>` nodes and the root `data-theme`, and renders the content there
  through its own React root. State stays in this page, so the popped-out copy is live. The page shows a placeholder
  with Focus and Close window; closing the window (either way) brings the dialog back into the page. If the browser
  blocks the popup, the dialog stays in the page and says so (no `alert()`).
- Close button in the title bar and Escape (a modal listens on the page; a `noBackdrop` panel only while focus is in
  it). Default footer with a Close button.
- Focus moves into the dialog on open (the close button) and back to whatever opened it on close. A modal holds Tab
  inside; a `noBackdrop` panel does not.
- `storageKey` remembers position and size in `localStorage` (guarded: a private window or blocked storage just
  forgets). A restored position is clamped into the current window.
- At 600px and below it is a full-width bottom sheet: no drag, no resize handles, the title bar is not a move target.

## Props

| Prop | Default | Meaning |
|---|---|---|
| `isOpen` | | show it |
| `onClose` | | `() => void`; no close controls without it |
| `title` | `"Panel"` | node in the title bar |
| `ariaLabel` | `title` if a string | the dialog's accessible name |
| `className`, `style` | | added to the panel and the popped-out layout |
| `footer` | `undefined` | `undefined` = a Close button, `null` = none, a node = that node |
| `defaultWidth` / `defaultHeight` | `520` / `600` | `defaultHeight={null}` fits the content until resized |
| `defaultX` / `defaultY` | `null` | `null` = from `placement` |
| `placement` | `"center"` | or `"right"` (full-height drawer on the right edge) |
| `storageKey` | `null` | localStorage key for position and size |
| `minWidth` / `minHeight` | `320` / `240` | |
| `zIndex` | `1000` | |
| `noBackdrop` | `false` | a non-modal floating panel: no backdrop, no `aria-modal`, Tab not held in |
| `backdropClose` | `false` | clicking the backdrop closes |
| `closeLabel` / `closeAriaLabel` | `"Close"` | footer button text / title bar close button name |
| `disablePopOut` | `false` | hide the pop-out button |
| `singletonKey` | `null` | only one open dialog per key (a second one closes itself) |
| `focusKey` | | when it changes while open, focus handling restarts (new opener, focus back in) |
| `testId` | | `data-testid` on the panel |

## Tests

- `floating-dialog.test.jsx` (vitest): drag, resize clamps, keyboard move and resize, Escape and focus return, Tab
  held in a modal, singleton, persistence (and throwing storage), the narrow sheet, pop-out (same-origin blank window,
  stylesheets and theme copied, live content, placeholder, closing restores, blocked popup). Runs in each lab that
  vendors the folder (first: customer-agent-LAB).
- `../../test/floating-dialog.test.mjs` (this repo's `node --test`): the geometry, no literal colours in the CSS, and
  the pop-out never opening a URL.

## Not ported from DraggableModal

- `autoPopOut` and `closeOnPopout`: no standalone caller yet.
- The light/dark toggle inside the popped-out window: the window takes the page's theme when it opens (or follows the
  system theme on Auto).
- App-zoom correction (`getAppZoom`): standalone apps do not zoom the page.
- `data-drag-handle` strips in the body: drag is the title bar only.
- Content rendered in the popped-out window is in its own React root, so React context from the page does not reach
  it (the same as AI-DEMO2): pass what the content needs as props.
