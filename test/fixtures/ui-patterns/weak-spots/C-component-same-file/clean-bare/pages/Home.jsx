function LiveForm({ onRun }) {
  return (
    <form onSubmit={onRun}>
      <label htmlFor="q">Query</label>
      <input id="q" type="text" />
      <button type="submit" className="primary">Evaluate</button>
    </form>
  );
}

function MockTable() {
  return <button type="button" className="primary">Simulate</button>;
}

// `cond ? <X/> : <Y/>` with bare component arms (no parentheses, no fragments).
export default function Home({ mode = "live" }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      {mode === "mock" ? <MockTable /> : <LiveForm onRun={() => {}} />}
    </main>
  );
}
