// One of the three is primary unconditionally, so it always renders beside the conditional ones.
export default function Home({ step = 0 }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <button type="button" className={step === 0 ? "btn primary" : "btn"}>First</button>
      <button type="button" className={step === 1 ? "btn primary" : "btn"}>Second</button>
      <button type="button" className="btn primary">Always</button>
    </main>
  );
}
