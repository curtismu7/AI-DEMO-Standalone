# json: two shared JSON services

## Json.jsx — raw JSON as text, never markup (untrusted payloads)
`Json` renders a value (or string) as pretty JSON in a `<pre>`, through the lab's `visible()` text guard
(control and bidi characters as visible escapes). Vendor to `web/src/components/Json.jsx`; the lab keeps its
own `web/src/safeText.js`.

## JsonPane.jsx + JsonPane.css (Rule 24, owner 2026-11-14) — THE standard for JSON panes
Every pane in every lab that shows JSON uses this. It is vendored byte-for-byte (never hand-edited) with its
two pin files; `import "./components/JsonPane.css"` in main.jsx. `setJsonView` is exported for tests.

```jsx
<Json value={payload} label="Token response" testId="token" hot={["decision", "tool"]} />
```

### 1. Colors: one standard, from theme tokens
Colors are tokens (`--j-*` in JsonPane.css, built from the shared `--status-*`, `--accent`, `--danger-text`, `--muted`
tokens), so light and dark follow the theme and no lab ever writes a color literal for JSON.

| Part | Token | Reads as |
| --- | --- | --- |
| key | `--j-key` (info blue) | bold |
| string | `--j-string` (ok green) | |
| number | `--j-number` (amber-red mix) | |
| true / false | `--j-bool` (warn amber) | bold |
| null | `--j-null` (muted) | bold |
| url | `--j-url` (blue-green) | dotted underline |
| id (uuid) | `--j-id` | |
| time (iso, `iat` `exp` `nbf`) | `--j-time` | bold; Form view adds the date |
| punctuation | `--j-punct` (muted) | |
| IMPORTANT key | `--j-hot-bg` (accent soft) | bold, tinted, accent edge |
| error / decision | `--danger-text` | bold |
| token, 3 segments | header `--danger-text`, payload `--status-warn`, signature `--status-info` | one colour each |

### 2. Form | JSON toggle
One toggle on every pane, one choice for the whole page (kept in localStorage):

- **Form** — a form: a label and a read-only value per field, nested objects as indented groups, scopes and
  audiences as chips, timestamps with their date, true/false as chips.
- **JSON** — the exact JSON text, colored by the table above.

### 3. Important JSON is highlighted
Default important keys: `sub act may_act aud scope client_id azp iss cnf grant_type subject_token actor_token
access_token authorization`. Error / decision keys (`error error_description detail_code outcome decision verdict
reason note`) show in the alert color. A lab adds the keys that matter in ITS payloads with the `hot` prop
(e.g. `hot={["tool", "risk"]}`); they stand out in both views.

### 4. Full view, no scrolling
A JSON pane never scrolls: no `max-height`, no `overflow: auto|scroll` on it or its wrapper. It grows to its content,
long lines and tokens wrap (`pre-wrap`, `overflow-wrap: anywhere`). JsonPane.css forces this on the pane itself;
rule J1 of `scripts/check-ui-patterns.mjs` fails a lab whose own CSS caps a JSON pane, and a hand-rolled
`<pre>{JSON.stringify(...)}`.

A string that holds a JSON object or array (a log line, an HTTP body, tool output) gets the same panes and toggle: the JSON view shows the string EXACTLY as given (never re-serialized, so hashed or signed text stays honest), the Form view reads the parsed value. Any other string is shown as text (a token in its three colors).

Everything is React text (never markup) and passes `visible()`.
