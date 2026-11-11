import Panel from "../components/Panel";

// One primary in plain markup, one handed to Panel as an attribute: two primaries.
export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <button type="button" className="primary">Save</button>
      <Panel title="Run" action={(go) => <button type="button" className="primary" onClick={go}>Run</button>} />
    </main>
  );
}
