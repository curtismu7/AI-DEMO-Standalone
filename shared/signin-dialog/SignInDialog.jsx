// SignInDialog: the family's one sign-in dialog (owner, 2026-11-13). A movable, resizable, pop-out-able
// FloatingDialog holding the lab's sign-in form. The lab passes a render prop so any auth flow works
// (mock persona picker, username/password, OAuth redirect); the dialog closes itself when sign-in
// succeeds via the `onSuccess` callback the form calls. Primary submit is Ping red (button.primary).
// Shared service: vendor it, never edit a lab's copy.
import { useEffect, useRef, useState } from "react";
import FloatingDialog from "../floating-dialog/FloatingDialog";

export default function SignInDialog({
  isOpen,
  onClose,
  onSignIn,          // async (credentials) => void; throw to keep the dialog open with the error
  title = "Sign in",
  submitLabel = "Sign in",
  usernameLabel = "Username",
  passwordLabel = "Password",
  storageKey = "signin-dialog",
  children,          // optional extra content between the fields and the submit button
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const userRef = useRef(null);
  useEffect(() => { if (isOpen) setError(null); }, [isOpen]);
  useEffect(() => { if (isOpen && userRef.current) userRef.current.focus(); }, [isOpen]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await onSignIn({ username: String(form.get("username") || ""), password: String(form.get("password") || "") });
      onClose(); // success: the dialog closes itself; the app's signed-in state takes over
    } catch (err) {
      setError(String(err?.message || err || "Sign-in failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FloatingDialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      ariaLabel="Sign in"
      defaultWidth={380}
      defaultHeight={null}
      placement="center"
      storageKey={storageKey}
      singletonKey="signin"
      testId="signin-dialog"
    >
      <form onSubmit={submit} style={{ display: "grid", gap: "0.75rem" }}>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          {usernameLabel}
          <input ref={userRef} name="username" autoComplete="username" required data-testid="signin-username" />
        </label>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          {passwordLabel}
          <input type="password" name="password" autoComplete="current-password" data-testid="signin-password" />
        </label>
        {children}
        {error ? <p className="error" role="alert" data-testid="signin-error">{error}</p> : null}
        <button type="submit" className="primary" disabled={busy} data-testid="signin-submit">{busy ? "Signing in…" : submitLabel}</button>
      </form>
    </FloatingDialog>
  );
}
