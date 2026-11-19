# phone: the family's iPhone mock standard

`Phone` is the one mock-phone component for standalone apps (owner 2026-11-19). It renders an iPhone —
black bezel, dynamic island, 9:41 status bar, home indicator — wrapped in the shared `FloatingDialog`, so
every mock phone in the family is a floating window: draggable, resizable (8-way), and pop-out-able.
The look descends from AI-DEMO2's `ConsentMockPhoneFlow` lock screen, rebuilt on the labs' dialog
standard. Vendored, never imported across repos.

## What it renders

- Bezel: dark frame, large radius, device shadow (device colours — the same in light and dark on purpose).
- Status bar: dynamic island, `9:41`, signal/wifi/battery glyphs.
- Body: your content (notification, passcode pad, approve/deny …) on the lock-screen gradient.
- Home indicator at the bottom.
- Title-bar controls from `FloatingDialog`: pop-out (↗) and close (×) as small circular controls; the
  window title text is hidden — the bezel is the chrome. Drag works anywhere on the bezel top.

## Vendor it

1. First vendor `shared/floating-dialog` (see its README) — `Phone` imports it as
   `../floating-dialog/FloatingDialog`.
2. Copy `Phone.jsx`, `phone.css`, `phone.test.jsx` and `phone.sha256` into `web/src/phone/` byte for byte
   (no header lines). The sha256 file pins them: replace its first line with
   `# vendored byte for byte from curtismu7/AI-DEMO-Standalone shared/phone at <commit> (main); re-vendor, do not edit.`
   and add a pin test that checks the hashes. Change the files here, re-pin, then re-vendor; never edit a
   lab's copy.
3. `Phone.jsx` imports `./phone.css`; the css uses only `standalone-ui.css` tokens (no hex literals, no
   `!important` — `scripts/check-css.sh` enforces this in app CSS; the shared css itself is exempt but
   still stays token-clean).

```jsx
import Phone from "./phone/Phone";

<Phone
  open={open}
  onClose={() => setOpen(false)}
  label="Mock phone"
  storageKey="myapp.phone"
  testId="mock-phone"
>
  <p className="phone__app"><span className="phone__badge">P</span>PingOne MFA (mock)<span className="phone__now">now</span></p>
  <h3 className="phone__headline">Approve this sign-in?</h3>
  <p className="phone__detail">Code <strong>1234-5678</strong></p>
  <div className="phone__actions">
    <button type="button" className="phone__btn phone__btn--primary" onClick={approve}>Approve</button>
    <button type="button" className="phone__btn" onClick={deny}>Deny</button>
  </div>
</Phone>
```

## Props

| Prop | Default | Meaning |
|---|---|---|
| `open` | | show it |
| `onClose` | | `() => void`; no close controls without it |
| `label` | `"Phone"` | accessible name; also the popped-out window's identity |
| `children` | | the screen body, rendered on the lock screen |
| `storageKey` | `null` | `FloatingDialog` position/size persistence |
| `singletonKey` | `null` | only one open phone per key |
| `testId` | `"phone"` | `data-testid` of the dialog panel |
| `className` | `""` | extra class on the panel (e.g. a size variant) |
| `defaultWidth` / `defaultHeight` | `340` / `640` | the phone's opening size |
| `minWidth` / `minHeight` | `300` / `480` | resize floor |

All other props (`title`, `noBackdrop`, `placement`, …) pass through to `FloatingDialog` — the phone
defaults to `noBackdrop`, `placement="bottom-right"`, and `footer={null}`; pass overrides after your
spread order of choice (the component spreads `...rest` last, so your overrides win).

## Screen classes (in `phone.css`)

| Class | Use |
|---|---|
| `phone__app` / `phone__badge` / `phone__now` | notification header row: app icon + name + "now" |
| `phone__headline` | the question ("Approve this transaction?") |
| `phone__detail` | supporting line (amount, binding message) |
| `phone__message` | emphasized pill for the value being confirmed |
| `phone__actions` | bottom button stack |
| `phone__btn` / `phone__btn--primary` | pill buttons; primary is the accent one |
| `phone__muted` | quiet status line ("Waiting for a notification…") |

Keep app-specific bits (dock tiles, passcode pads) in the app's own css — the standard carries the
device, not the app.

## Reference

`shared/phone-standard-mock.html` shows the chrome; the live behaviour (drag, resize, pop-out,
approve/deny) is best seen in an adopting lab (pingone-signin-LAB `#/ciba`, hitl-mfa-lab-LAB).
