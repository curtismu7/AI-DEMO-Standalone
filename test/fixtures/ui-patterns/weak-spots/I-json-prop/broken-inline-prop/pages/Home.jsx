function Code({ value }) { return <code className="code">{value}</code>; }

export default function Home({ result = {} }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <Code value={JSON.stringify(result, null, 2)} />
      <button type="button" className="primary">Run</button>
    </main>
  );
}
