# error-boundary: a crashed tab must not blank the page

`ErrorBoundary` wraps tab content: on a render error it shows an alert card with Try again and clears when
`resetKey` changes. Props: `resetKey`, `message`, `testId`. Vendor to `web/src/components/ErrorBoundary.jsx`.

The Try again button is deliberately not `.primary` and carries a `ui-pattern: allow P9` escape: it is error recovery,
not the page's action, so a page whose only other controls are links is not flagged for having no primary. Re-vendor the
file unchanged (2026-11-16).
