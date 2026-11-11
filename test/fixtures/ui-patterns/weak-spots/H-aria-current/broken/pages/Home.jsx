export default function Home({ step = 1 }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <ol>
        <li><button type="button" aria-current={step === 1 ? "step" : undefined}>Step one</button></li>
        <li><button type="button" aria-current={step === 2 ? "step" : undefined}>Step two</button></li>
      </ol>
    </main>
  );
}
