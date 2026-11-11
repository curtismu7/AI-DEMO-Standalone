// The only action button sits in a content <header> and is not primary: the page has no primary action.
export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <section>
        <header className="card__head">
          <h2>Notes</h2>
          <button type="button">Refresh</button>
        </header>
        <p>Body.</p>
      </section>
    </main>
  );
}
