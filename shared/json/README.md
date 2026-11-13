# json: raw JSON as text, never markup

`Json` renders a value (or string) as pretty JSON in a `<pre>`, through the lab's `visible()` text guard
(control and bidi characters as visible escapes). Vendor to `web/src/components/Json.jsx`; the lab keeps its
own `web/src/safeText.js`.
