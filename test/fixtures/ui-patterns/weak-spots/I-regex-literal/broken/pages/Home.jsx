const HOT = /<IMPORTANT>[\s\S]*?<\/IMPORTANT>/gi;

export default function Home({ value = {} }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <p>{HOT.test(String(value)) ? "poisoned" : "clean"}</p>
      <pre>{JSON.stringify(value, null, 2)}</pre>
      <button type="button" className="primary">Run</button>
    </main>
  );
}
