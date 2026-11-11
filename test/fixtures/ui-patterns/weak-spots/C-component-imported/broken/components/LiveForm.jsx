export default function LiveForm({ onRun }) {
  return (
    <form onSubmit={onRun}>
      <label htmlFor="q">Query</label>
      <input id="q" type="text" />
      <button type="submit" className="primary">Evaluate</button>
    </form>
  );
}

export function MockPanel() {
  return (
    <section>
      <button type="button" className="primary">Simulate</button>
    </section>
  );
}
