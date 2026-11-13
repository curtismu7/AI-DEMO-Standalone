# help-dialog: the family's one help dialog

`HelpDialog` (owner 2026-11-13) renders a lab's help sections inside the shared `FloatingDialog`, so it is movable,
resizable and can pop out to its own window. The TopMenu Help button opens it; the full-docs link sits in the footer.

## Vendor it

1. Vendor `shared/floating-dialog/` first (see its README) — this component imports it.
2. Copy `HelpDialog.jsx` into `web/src/help-dialog/`.
3. Wire it: hold `const [helpOpen, setHelpOpen] = useState(false)` in the app, change the TopMenu `help` prop to
   `help={{ onClick: () => setHelpOpen(true) }}`, and render
   `<HelpDialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} sections={...} docsUrl="https://..." />`.

## Props

| Prop | Default | Meaning |
|---|---|---|
| `isOpen` / `onClose` | | show it / close it |
| `sections` | `[]` | array of `{ heading, body: string | string[] }` |
| `docsUrl` | `null` | full-documentation URL, shown in the footer |
| `title` | `"Help"` | title-bar text |
| `storageKey` | `"help-dialog"` | remembers position/size |

Behavior (drag, resize, pop-out, Escape, narrow-screen sheet) comes from FloatingDialog; see its README.
