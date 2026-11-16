export default function Home({ value = {} }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <div>Raw: "<pre>{JSON.stringify(value, null, 2)}</pre>"</div>
      <button type="button" className="primary">Run</button>
    </main>
  );
}
