# verify-mark: the Verified / In progress badge, one copy for every app

The shelf (demo-shelf-LAB) lets the owner mark each demo **Verified** (green check) or **In progress** (amber check), with a short note. This is the one badge that draws a mark: the shelf's cards and Details use it, and every -LAB app can show its own mark in its header. Change it here and every app gets the change when it re-vendors (and `scripts/check-drift.sh` fails an app whose copy differs).

The words ("Verified", "In progress"), what they mean and the note limit are the shelf's one definition (`server/src/verification.js` in demo-shelf-LAB), sent in `GET /api/shelf`. This component never hard-codes them. See demo-shelf-LAB `docs/verification.md`.

## Vendor it (same convention as `shared/json`)

1. Copy `VerifyMark.jsx` and `VerifyMark.css` byte for byte (no header lines) into `web/src/components/`, and the two pin files `VerifyMark.sha256` and `VerifyMark.css.sha256` beside them. Never edit them in an app; change them here, re-pin, re-vendor.
2. `import "./components/VerifyMark.css";` in `main.jsx` (the CSS uses only `standalone-ui.css` tokens: `--status-ok`, `--status-warn`, `--surface`, `--muted`, `--text-body`).
3. Add a pin test that checks the two files against their pin files (copy `web/src/__tests__/verify-mark.pin.test.js` from demo-shelf-LAB).
4. `VerifyMark.test.jsx` here is the component's own test; it runs wherever the component is vendored and is not copied.

## Use it

Beside the `ShelfLink` in the app's header:

```jsx
import VerifyMark from "./components/VerifyMark.jsx";

<ShelfLink />
<VerifyMark id="a2a-lab" />   {/* the app's id in docs/shelf-entry.json */}
```

`VerifyMark` makes the same `GET /api/shelf` call as `ShelfLink` (relative path, `credentials: "omit"`; pass `path` or `headers` to change them), finds the entry with its `id`, and shows the badge. It renders nothing when the app has no mark, the mark is "none", the shelf cannot be reached, or while it loads: never an error, never a placeholder. The note is the badge's tooltip (`note` shows it under the label, as the shelf's cards do).

To draw a mark you already hold (the shelf does), use the named export: `import { VerifyBadge } from "./components/VerifyMark.jsx"; <VerifyBadge mark={demo.verification} />`.

A lab shows a real mark only when the shelf it talks to has verification marks (demo-shelf-LAB with the Verification page) and the lab's `/api/shelf` reaches it, as `ShelfLink` already requires.
