# return-link: "Opened from <app>" strip and the Back button

When Customer Agent LAB hands a use case to another standalone app, it navigates the **same tab** to that app with ids only:
`?from=customer-agent&uc=<id>&vertical=<id>&user=<persona id>` (customer-agent-LAB `web/src/handoff.js`). The receiving app shows
`ReturnLink`: a strip "Opened from Customer Agent LAB · UC47" with a **Back to Customer Agent LAB** button, and the same button,
compact, in its header. Back returns to the dashboard with `?returned=<this app id>&uc=<uc>`, where the chat resumes.

## Rules it enforces

- **No open redirect.** The Back target comes only from the fixed list in `returnTargets.js` (app id -> label, proxy path, direct
  URL). `from` only selects a list entry; nothing read from the address bar becomes part of the target's origin or path.
- **Unknown `from` or bad ids = nothing rendered.** Ids match `/^[A-Za-z0-9.-]{1,40}$/`; `uc` is required, `vertical` optional;
  a repeated `from`, `uc` or `vertical` is refused.
- **Proxy vs direct, from the page's own path.** Under a directory prefix (`/a2a-lab/...`: the shared lab proxy, which also runs
  on `127.0.0.1:8443` and `localhost:8443`, so the host cannot decide) Back goes to the target's `proxyPath` on the same origin;
  served at its root (`/` or `/index.html`: the app on its own port) Back goes to the target's `directUrl`.
- **Same tab.** The lab proxy keeps one lab cookie per browser, so a second tab would route the other app's API calls here.
- **Ids only** travel back: `returned` and `uc`. Theme tokens only, no colour literals; wraps at 375px.

## Use

Copy `ReturnLink.jsx`, `returnTargets.js`, `ReturnLink.test.jsx` and `return-link.sha256` into `web/src/return-link/` unchanged
(byte for byte; the sha256 file pins them, put the parent commit you copied from on its first line). Needs React 18, the shared
`standalone-ui.css` tokens, and vitest + Testing Library + jsdom for the test.

```jsx
import ReturnLink from "./return-link/ReturnLink.jsx";
import { readReturnContext } from "./return-link/returnTargets.js";

// in the shell bar, right side
<ReturnLink app="a2a-lab" variant="header" />
// right below the simulation banner (the banner stays first)
<ReturnLink app="a2a-lab" />

// optional: preselect the app's own scenario when the use case obviously maps to one
const ctx = readReturnContext(window.location.search); // { from, label, uc, vertical } or null
```

Apps without React (server-rendered HTML) port the same logic: read only from the fixed list, the same id check, the same two
targets. Adding a new hand-off source = one entry in `RETURN_TARGETS`, re-pin `return-link.sha256`, re-vendor.

Tests: `returnTargets.test.mjs` (node:test, run by this repo's `test/return-link.test.mjs`, which also checks the hash file) and
`ReturnLink.test.jsx` (vitest, run in each app that vendors it).
