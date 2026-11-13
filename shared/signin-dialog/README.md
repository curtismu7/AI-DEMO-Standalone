# signin-dialog: the family's one sign-in dialog

`SignInDialog` (owner 2026-11-13) renders the sign-in form inside the shared `FloatingDialog` — movable, resizable,
pop-out-able. It closes itself when sign-in succeeds (the standard, STANDALONE-UI-PATTERNS.md section 9). The submit
button is `button.primary` (Ping red).

## Vendor it

1. Vendor `shared/floating-dialog/` first (see its README) — this component imports it.
2. Copy `SignInDialog.jsx` into `web/src/signin-dialog/`.
3. Wire it:

```jsx
const [signinOpen, setSigninOpen] = useState(false);
<TopMenu /* ... */ showSignIn={signedOut} onSignInClick={() => setSigninOpen(true)} />
<SignInDialog
  isOpen={signinOpen}
  onClose={() => setSigninOpen(false)}
  onSignIn={async ({ username, password }) => {
    await api("/api/auth/login", { method: "POST", body: { username, password } }); // throw to stay open
    await refreshSession(); // the app's signed-in state replaces the button that opened the dialog
  }}
/>
```

`onSignIn` receives `{ username, password }`. Throw to keep the dialog open with the error shown inline
(`role="alert"`). On resolve, the dialog closes itself — do not call `onClose` from the app.

## Props

| Prop | Default | Meaning |
|---|---|---|
| `isOpen` / `onClose` | | show it / close it |
| `onSignIn` | | async `({username, password}) => void`; resolve = success (auto-close), throw = error |
| `title` | `"Sign in"` | title-bar text |
| `submitLabel` | `"Sign in"` | primary button label |
| `usernameLabel` / `passwordLabel` | `"Username"` / `"Password"` | field labels |
| `storageKey` | `"signin-dialog"` | remembers position/size |
