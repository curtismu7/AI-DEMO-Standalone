// A primary-styled button inside a content <header> is still a primary: two in one state.
export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <section>
        <header className="card__head">
          <h2>Notes</h2>
          <button type="button" className="primary">Refresh</button>
        </header>
        <button type="button" className="primary">Save</button>
      </section>
    </main>
  );
}
