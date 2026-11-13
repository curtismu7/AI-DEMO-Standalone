# untrusted: render-as-text guard with optional highlight

`Untrusted` renders remote-party text as React text nodes only (never innerHTML) so injected markup is shown,
not run. Props: `text`, `revealed` (server copy with invisible chars as [U+XXXX] → rendered with .chip spans),
`block` (pre vs span), `hot` (optional RegExp; matches get `<mark>`), `testId`. Vendor to `web/src/lib/Untrusted.jsx`
(or components/). The hostile-pattern regex stays lab-specific — pass it as `hot`.
