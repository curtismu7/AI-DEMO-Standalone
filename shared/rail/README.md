# rail: the family's one collapsible sidebar

`Rail` (owner 2026-11-13) wraps a lab's sidebar content in a collapsible chrome: a toggle strip on the rail's page
edge hides/shows it, and the state persists in localStorage. Content changes per lab; the chrome is shared, so
features like pinning, width-drag or keyboard toggle land once here.

## Vendor it

1. Copy `Rail.jsx` and `rail.css` into `web/src/rail/`.
2. Wrap the existing sidebar:

```jsx
import Rail from "./rail/Rail";
<Rail storageKey="appfire.setup" label="Setup">
  <SetupSidebar /* ...existing props... */ />
</Rail>
```

The lab keeps owning the sidebar's inner markup and CSS. `Rail` only adds the collapse chrome.

## Props

| Prop | Default | Meaning |
|---|---|---|
| `children` | | the sidebar content (the lab's own component) |
| `storageKey` | `"rail-collapsed"` | localStorage key for the collapsed state |
| `label` | `"Sidebar"` | accessible name + toggle titles |
| `side` | `"left"` | which page edge the toggle strip hugs (`"right"` for right-hand rails) |
