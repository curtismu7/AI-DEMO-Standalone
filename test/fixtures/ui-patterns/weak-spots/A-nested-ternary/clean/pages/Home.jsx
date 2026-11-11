export default function Home({ status = "idle", kind = "a" }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      {status === "idle" ? (
        <>
          <button type="button" className="primary">Start</button>
        </>
      ) : status === "running" ? (
        <>
          <button type="button" className="primary">Stop</button>
        </>
      ) : kind === "a" ? (
        <button type="button" className="primary">Again</button>
      ) : (
        <>
          {kind === "b" ? <button type="button" className="primary">B</button> : <button type="button" className="primary">C</button>}
        </>
      )}
    </main>
  );
}
