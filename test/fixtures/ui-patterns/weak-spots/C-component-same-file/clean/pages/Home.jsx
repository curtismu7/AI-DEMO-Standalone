function LiveForm({ onRun }) {
  return (
    <form onSubmit={onRun}>
      <label htmlFor="q">Query</label>
      <input id="q" type="text" />
      <button type="submit" className="primary">Evaluate</button>
    </form>
  );
}

export default function Home({ mode = "live" }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      {mode === "mock" ? (
        <section>
          <button type="button" className="primary">Simulate</button>
        </section>
      ) : (
        <LiveForm onRun={() => {}} />
      )}
    </main>
  );
}
