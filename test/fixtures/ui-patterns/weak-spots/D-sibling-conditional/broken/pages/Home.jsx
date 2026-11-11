// Same literal on two buttons: both are primary when step is 0.
export default function Home({ step = 0 }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <button type="button" className={step === 0 ? "btn primary" : "btn"}>First</button>
      <button type="button" className={step === 0 ? "btn primary" : "btn"}>Also first</button>
      <button type="button" className={step === 1 ? "btn primary" : "btn"}>Second</button>
    </main>
  );
}
