function Form({ label }) {
  return (
    <form>
      <label htmlFor="q">{label}</label>
      <input id="q" type="text" />
      <button type="submit" className="primary">Evaluate</button>
    </form>
  );
}

// The same component in both arms: one instance renders at a time.
export default function Home({ mode = "live" }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      {mode === "mock" ? <Form label="Mock query" /> : <Form label="Live query" />}
    </main>
  );
}
