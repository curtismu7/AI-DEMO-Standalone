// Same literal twice, and a condition on a different expression: neither pair is provably exclusive.
export default function Home({ tab = "a", mode = "x" }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      {tab === "a" && <button type="button" className="primary">Save A</button>}
      {tab === "a" && <button type="button" className="primary">Save A again</button>}
      {mode === "y" && <button type="button" className="primary">Save Y</button>}
    </main>
  );
}
