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
  return (
    <section>
      <button type="button" className="primary">Simulate</button>
    </section>
  );
}

// Both arms are components inside fragments; the boundary does not hide which arm each primary is in.
export default function Home({ mode = "live" }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      {mode === "mock" ? (
        <>
          <MockTable />
        </>
      ) : (
        <>
          <LiveForm onRun={() => {}} />
        </>
      )}
    </main>
  );
}
