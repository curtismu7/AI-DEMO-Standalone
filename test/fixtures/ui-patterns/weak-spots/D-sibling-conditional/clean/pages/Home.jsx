export default function Home({ step = 0 }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <ol>
        <li><button type="button" className={step === 0 ? "btn primary" : "btn"}>First</button></li>
        <li><button type="button" className={step === 1 ? "btn primary" : "btn"}>Second</button></li>
        <li><button type="button" className={`btn ${step === 2 ? "primary" : ""}`}>Third</button></li>
      </ol>
      <button type="button" className={step !== 3 ? "btn" : "btn primary"}>Reset</button>
    </main>
  );
}
