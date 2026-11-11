export default function Home({ step = 0 }) {
  const first = step == 0;
  const isSecond = step === 1;
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <button type="button" className={first ? "btn primary" : "btn"}>First</button>
      <button type="button" className={isSecond ? "btn primary" : "btn"}>Second</button>
      <button type="button" className={step === 2 ? "btn primary" : "btn"}>Third</button>
    </main>
  );
}
