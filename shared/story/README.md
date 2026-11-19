# story: the family's one story/talk-track engine

`StoryPanel` (owner 2026-11-13) renders the vertical-skinned story with the Allowed/Blocked switch and the
localStorage-persisted open state. `fill.js` is the token engine (`{{cast.name}}`, `{{vocab.x}}` → the vertical's
words; a missing token shows as ⟨missing: token⟩ so a gap is seen, not hidden). The lab keeps `stories.js`
(content: VERTICALS, storyForMode, verticalById) and passes it in.

## Vendor it

Copy `StoryPanel.jsx` and `fill.js` into `web/src/story/`. The lab keeps its own `stories.js` and CSS.

```jsx
import StoryPanel from "./story/StoryPanel";
import { VERTICALS, storyForMode, verticalById } from "./stories";
<StoryPanel stories={{ VERTICALS, storyForMode, verticalById }} prefix="hostile" mode={mode} present={present}
  extra={<TermsNote words={["ungoverned client"]} />} />
```

## Props

| Prop | Default | Meaning |
|---|---|---|
| `stories` | | `{ VERTICALS, storyForMode, verticalById }` from the lab's stories.js |
| `prefix` | `"story"` | localStorage key prefix (per-lab isolation) |
| `mode` | | the app's current Mock/Real mode |
| `present` | `false` | presenter mode forces the panel open |
| `extra` | `null` | lab-specific nodes between controls and summary |
