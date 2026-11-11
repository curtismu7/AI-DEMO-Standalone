export default function Home({ tab = "a" }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      {tab === "a" && <button type="button" className="primary">Save A</button>}
      {tab === "b" && <button type="button" className="primary">Save B</button>}
      {tab === "c" && (
        <>
          <button type="button" className="primary">Save C</button>
        </>
      )}
    </main>
  );
}
