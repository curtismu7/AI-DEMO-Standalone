function LiveForm({ onRun }) {
  return (
    <form onSubmit={onRun}>
      <label htmlFor="q">Query</label>
      <input id="q" type="text" />
      <button type="submit" className="primary">Evaluate</button>
    </form>
  );
}

// One component with a primary, used twice: two primaries in one view state.
export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <LiveForm onRun={() => {}} />
      <LiveForm onRun={() => {}} />
    </main>
  );
}
