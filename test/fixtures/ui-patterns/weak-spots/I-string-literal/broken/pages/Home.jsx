const MARKER = "<IMPORTANT>";

export default function Home({ value = {} }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <p>{String(value).includes(MARKER) ? "poisoned" : "clean"}</p>
      <pre>{JSON.stringify(value, null, 2)}</pre>
      <button type="button" className="primary">Run</button>
    </main>
  );
}
