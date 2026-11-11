// `step === n` with a variable, `step >= 1` and a bare flag cannot be proven exclusive.
export default function Home({ step = 0, n = 1, flag = true }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <button type="button" className={step === n ? "btn primary" : "btn"}>A</button>
      <button type="button" className={step >= 1 ? "btn primary" : "btn"}>B</button>
      <button type="button" className={flag ? "btn primary" : "btn"}>C</button>
    </main>
  );
}
