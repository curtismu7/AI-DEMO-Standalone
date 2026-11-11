// The disclosure does not count as the primary: the plain "Save" button still leaves the page without one.
export default function Home({ open = false }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <section>
        <header className="card__head">
          <h2>Notes</h2>
          <button type="button" aria-expanded={open}>Show notes</button>
        </header>
        <button type="button">Save</button>
      </section>
    </main>
  );
}
