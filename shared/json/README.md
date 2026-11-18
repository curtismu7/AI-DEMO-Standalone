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
  audiences as chips, timestamps with their date, true/false as chips. A HAL-style link — a single-key object
  whose only entry is a string `href` (e.g. `_links.branding`) — collapses to one row: the parent key with the
  URL as its value, in the url style. Multi-key objects and arrays of such objects stay nested.
- **JSON** — the exact JSON text, colored by the table above.

A lab whose point is the raw wire JSON can open on the JSON view: `setDefaultJsonView("raw")` once in main.jsx (a visitor's saved choice still wins). Form stays the family default.

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

The shared evidence step detail (`shared/evidence`, `.ev-pre`) follows the same rule: its request / response text is uncapped and wraps.

An HTTP transcript with a JSON body (a hop's request or response: request / status line, headers, blank line, body) passed as ONE string keeps its headers as text and gives the body its own Form | JSON pane (`splitWire`); do not write a splitter in the lab. A missing (`undefined`) value is an empty pane.

Everything is React text (never markup) and passes `visible()`.

### 5. Decoded tokens (Rule 24b, owner 2026-11-18)
Every whole JWT a value carries is also shown decoded, under the pane, in the jwt.io order: a card named by the
field path (`access_token`, `headers.authorization`, `body.subject_token`) with **Header**, **Payload** and
**Signature**, each the standard Form | JSON pane. This pane decodes, it never verifies — the receiving server
checks the signature; the signature pane shows the third segment as sent.

- `decode={false}` marks a pane that IS a decoded part of a token (or a lab viewer that decodes itself), so a
  token is never decoded twice. Never hand-roll decoding in the lab: import `Json`, `DecodedTokens`, `TokenParts`
  or `decodedTokensIn` from this module.
- The walk finds tokens in objects, arrays, `Bearer <jwt>` / `DPoP <jwt>` strings, and JSON that arrived as text.
  Caps: 6 tokens per pane, depth 8, JSON-in-text searched 3 levels deep; cut-short (`...`) and non-JWT strings
  are skipped; the same token is shown once.
- An unsigned token (`alg: none`, empty signature) says "This token has no signature segment."; opaque tokens
  (reference, refresh) and client secrets are never decoded.
- Everything is React text through `visible()` — decoded claims are never markup.
