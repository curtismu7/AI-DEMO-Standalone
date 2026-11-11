import { useSession } from "../session";

// Early returns are separate states of this component, not extra landmarks on the page.
export default function Gate({ children }) {
  const { status } = useSession();
  if (status === "loading") return <main className="page-frame"><p role="status">Loading</p></main>;
  if (status === "anon") {
    return (
      <main className="page-frame">
        <h1>Sign in first</h1>
        <p>This page needs a signed-in person.</p>
      </main>
    );
  }
  return children;
}
