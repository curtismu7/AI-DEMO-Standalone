function Form({ label }) {
  return (
    <form>
      <label htmlFor="q">{label}</label>
      <input id="q" type="text" />
      <button type="submit" className="primary">Evaluate</button>
    </form>
  );
}

// The arms exclude each other, but the first arm renders the component twice.
export default function Home({ mode = "live" }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      {mode === "mock" ? (
        <>
          <Form label="One" />
          <Form label="Two" />
        </>
      ) : (
        <p>Nothing to run.</p>
      )}
    </main>
  );
}
