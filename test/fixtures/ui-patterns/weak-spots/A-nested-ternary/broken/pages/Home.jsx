// The chained ternary is exclusive; the `&&` primary beside it is not.
export default function Home({ status = "idle", extra = true }) {
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
      ) : (
        <button type="button" className="primary">Again</button>
      )}
      {extra && <><button type="button" className="primary">Extra</button></>}
    </main>
  );
}
