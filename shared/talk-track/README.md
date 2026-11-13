# talk-track: the family's one talk-track dialog

`TalkTrackDialog` (owner 2026-11-13) renders a lab's presenter script inside the shared `FloatingDialog`, so it is
movable, resizable and can pop out to its own window. Content changes per lab; the chrome never does.

## Vendor it

1. Vendor `shared/floating-dialog/` first (see its README) — this component imports it.
2. Copy `TalkTrackDialog.jsx` into `web/src/talk-track/`.
3. Wire it: hold `const [talkOpen, setTalkOpen] = useState(false)` in the app, pass
   `talkTrack={{ active: talkOpen, onToggle: () => setTalkOpen(v => !v) }}` to the TopMenu, and render
   `<TalkTrackDialog isOpen={talkOpen} onClose={() => setTalkOpen(false)} talk={...} />` at the app root.

## Props

| Prop | Default | Meaning |
|---|---|---|
| `isOpen` / `onClose` | | show it / close it |
| `talk` | `[]` | array of `{ id, title, say }` |
| `title` | `"Talk track"` | title-bar text |
| `storageKey` | `"talk-track-dialog"` | remembers position/size |

Behavior (drag, resize, pop-out, Escape, narrow-screen sheet) comes from FloatingDialog; see its README.
