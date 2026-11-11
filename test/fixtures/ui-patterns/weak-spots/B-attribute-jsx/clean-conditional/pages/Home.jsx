import Panel from "../components/Panel";

// The arms inside the attribute are exclusive, and the attribute sits where Panel is used.
export default function Home({ ok = true }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <button type="button">Reset</button>
      <Panel title="A" actions={ok ? <button type="button" className="primary">Run</button> : <button type="button" className="primary">Retry</button>} />
    </main>
  );
}
