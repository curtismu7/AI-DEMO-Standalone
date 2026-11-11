import Panel from "../components/Panel";

// Both attribute buttons are primary; the attribute holds a ternary whose arms are exclusive, but the second
// attribute is a second primary beside it.
export default function Home({ ok = true }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <Panel title="A" actions={ok ? <button type="button" className="primary">Run</button> : <button type="button" className="primary">Retry</button>} />
      <Panel title="B" actions={<button type="button" className="primary">Other</button>} />
    </main>
  );
}
