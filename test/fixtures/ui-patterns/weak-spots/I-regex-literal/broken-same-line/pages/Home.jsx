export default function Home({ text = "" }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      {/<IMPORTANT>/.test(text) && <pre>{JSON.stringify({ text })}</pre>}
      <button type="button" className="primary">Run</button>
    </main>
  );
}
