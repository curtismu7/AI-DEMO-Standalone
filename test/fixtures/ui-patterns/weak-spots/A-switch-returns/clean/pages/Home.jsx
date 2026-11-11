export default function Home({ view = "list" }) {
  if (view === "empty") {
    return (
      <main className="page-frame">
        <h1>Empty</h1>
        <button type="button" className="primary">Create</button>
      </main>
    );
  } else if (view === "error") {
    return (
      <main className="page-frame">
        <h1>Error</h1>
        <button type="button" className="primary">Retry</button>
      </main>
    );
  }
  switch (view) {
    case "grid":
      return (
        <main className="page-frame">
          <h1>Grid</h1>
          <button type="button" className="primary">Add tile</button>
        </main>
      );
    case "table": {
      return (
        <main className="page-frame">
          <h1>Table</h1>
          <button type="button" className="primary">Add column</button>
        </main>
      );
    }
    default:
      return (
        <main className="page-frame">
          <h1>List</h1>
          <button type="button" className="primary">Add row</button>
        </main>
      );
  }
}
