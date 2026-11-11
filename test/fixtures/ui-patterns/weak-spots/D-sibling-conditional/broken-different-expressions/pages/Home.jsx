// Two different expressions: nothing says they exclude each other.
export default function Home({ step = 0, mode = 0 }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <button type="button" className={step === 0 ? "btn primary" : "btn"}>First</button>
      <button type="button" className={mode === 1 ? "btn primary" : "btn"}>Second</button>
    </main>
  );
}
