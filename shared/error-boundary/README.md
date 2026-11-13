# error-boundary: a crashed tab must not blank the page

`ErrorBoundary` wraps tab content: on a render error it shows an alert card with Try again and clears when
`resetKey` changes. Props: `resetKey`, `message`, `testId`. Vendor to `web/src/components/ErrorBoundary.jsx`.
