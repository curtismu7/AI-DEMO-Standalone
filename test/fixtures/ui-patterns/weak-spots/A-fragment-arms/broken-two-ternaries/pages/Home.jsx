// Two separate ternaries: an arm of each can render at the same time.
export default function Home({ ready = true, saved = false }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      {ready ? (
        <>
          <button type="button" className="primary">Run</button>
        </>
      ) : (
        <>
          <p>Not ready yet.</p>
        </>
      )}
      {saved ? (
        <>
          <p>Saved.</p>
        </>
      ) : (
        <>
          <button type="button" className="primary">Save</button>
        </>
      )}
    </main>
  );
}
