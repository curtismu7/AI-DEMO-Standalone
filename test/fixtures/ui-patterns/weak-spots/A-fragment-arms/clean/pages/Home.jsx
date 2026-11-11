export default function Home({ ready = true }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      {ready ? (
        <>
          <p>Ready to go.</p>
          <button type="button" className="primary">Run</button>
        </>
      ) : (
        <>
          <p>Not ready yet.</p>
          <button type="button" className="primary">Prepare</button>
        </>
      )}
    </main>
  );
}
