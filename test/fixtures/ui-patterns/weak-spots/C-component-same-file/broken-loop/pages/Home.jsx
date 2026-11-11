function Row({ name }) {
  return (
    <li>
      {name} <button type="button" className="primary">Approve</button>
    </li>
  );
}

// The primary lives in Row; Row is rendered once per item, so the primary repeats.
export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <ul>{["a", "b"].map((n) => <Row key={n} name={n} />)}</ul>
    </main>
  );
}
