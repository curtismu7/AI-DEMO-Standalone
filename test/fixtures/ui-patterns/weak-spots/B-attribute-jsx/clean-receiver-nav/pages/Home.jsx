import Toolbar from "../components/Toolbar";

// Toolbar renders `actions` inside its <nav>, so the Reset button is chrome, not a page action that needs a primary.
export default function Home() {
  return (
    <Toolbar actions={<button type="button">Reset</button>}>
      <main className="page-frame">
        <h1>Home</h1>
        <p>Read-only overview.</p>
      </main>
    </Toolbar>
  );
}
