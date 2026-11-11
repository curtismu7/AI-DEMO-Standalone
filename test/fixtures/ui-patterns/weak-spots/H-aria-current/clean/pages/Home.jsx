export default function Home({ step = 1 }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <ol>
        <li><button type="button" aria-pressed={step === 1}>Step one</button></li>
        <li><button type="button" aria-pressed={step === 2}>Step two</button></li>
      </ol>
    </main>
  );
}
