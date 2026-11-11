function LiveForm({ onRun }) {
  return (
    <form onSubmit={onRun}>
      <label htmlFor="q">Query</label>
      <input id="q" type="text" />
      <button type="submit" className="primary">Evaluate</button>
    </form>
  );
}

// The component sits in one arm, but another primary renders beside the ternary.
export default function Home({ mode = "live" }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <button type="button" className="primary">Save</button>
      {mode === "mock" ? <p>Mock</p> : <LiveForm onRun={() => {}} />}
    </main>
  );
}
