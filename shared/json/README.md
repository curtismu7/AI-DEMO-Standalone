# json: raw JSON as text, never markup

`Json` renders a value (or string) as pretty JSON in a `<pre>`, through the lab's `visible()` text guard
(control and bidi characters as visible escapes). Vendor to `web/src/components/Json.jsx`; the lab keeps its
own `web/src/safeText.js`.

## JsonView (Rule 24, owner 2026-11-14): colored JSON, every pane

`JsonView` is the standard for every JSON pane in every lab: colored by token
class (top-level vs nested keys, strings, URLs, ISO dates, id/uuid values,
scope arrays, cost keys, booleans, null/empty), fixed light/dark palette
(≥4.5:1 on both surfaces), per-pane **Colored/Raw** toggle, optional
`lineNumbers`, and semantic marks — `marks={{ "aud": "hl", "signature": "bad" }}`
(dotted paths; array items `scope.0`): `hl` (this step's value), `good`,
`bad` (denied/tampered), `warn` (expiring).

Strings pass the lab's `visible()` guard in BOTH modes; control/bidi characters
render as violet escapes. Colors are fixed by the rule, never per-app.

Vendor to `web/src/components/JsonView.jsx`; the pin file `JsonView.sha256`
travels with it (same discipline as top-menu). The plain `Json.jsx` above stays
for the untrusted-raw case (hostile payloads, evidence actors); the checker
grows a hand-rolled-JSON-pane grep.
