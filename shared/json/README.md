# json: two shared JSON services

## Json.jsx — raw JSON as text, never markup (untrusted payloads)
`Json` renders a value (or string) as pretty JSON in a `<pre>`, through the lab's `visible()` text guard
(control and bidi characters as visible escapes). Vendor to `web/src/components/Json.jsx`; the lab keeps its
own `web/src/safeText.js`.

## JsonPane.jsx (Rule 24, owner 2026-11-14, from appfire-agent-governance-LAB) — THE standard for JSON panes
Two views, one choice shared by every pane on the page (persisted per lab):

- **Formatted** — a FORM: a label and a read-only value per field, nested objects as indented groups,
  scopes and audiences as chips, timestamps with their date, true/false as chips.
- **Raw** — the exact JSON text, coloured by what each part is (keys, strings, numbers, true/false, null,
  urls, ids, times, hot claims stood out, alerts) and **tokens in their three segments each in a colour**
  (header red / payload amber / signature blue).

Everything is React text (never markup) and passes `visible()`. Colors come from theme tokens
(`--j-key: var(--status-info)` etc.), so light/dark is automatic. Vendor `JsonPane.jsx` + `JsonPane.css`
to `web/src/components/` (+ the pin files); import the css in main.jsx. `setJsonView` is exported for tests.
