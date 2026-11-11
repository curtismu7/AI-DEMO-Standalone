// Each state is its own return, but the grid state has two primaries at once.
export default function Home({ view = "list" }) {
  switch (view) {
    case "grid":
      return (
        <main className="page-frame">
          <h1>Grid</h1>
          <button type="button" className="primary">Add tile</button>
          <button type="button" className="primary">Import tiles</button>
        </main>
      );
    default:
      return (
        <main className="page-frame">
          <h1>List</h1>
          <button type="button" className="primary">Add row</button>
        </main>
      );
  }
}
