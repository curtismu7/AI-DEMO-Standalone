import Panel from "../components/Panel";

export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <button type="button">Reset</button>
      <Panel
        title="Run"
        action={(go) => <button type="button" className="primary" onClick={go}>Run</button>}
        render={() => <button type="button">Other</button>}
        actions={<button type="button">Cancel</button>}
      />
    </main>
  );
}
