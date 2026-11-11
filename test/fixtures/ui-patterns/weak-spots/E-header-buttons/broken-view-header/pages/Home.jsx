// The page's own <header> sits beside <main>, not in the app shell: it is page content, so its plain button is a page
// action and the page has no primary. (The extra header also trips P1; only P9 is the point here.)
export default function Home() {
  return (
    <>
      <header className="page-head">
        <h1>Home</h1>
        <button type="button">Refresh</button>
      </header>
      <main className="page-frame">
        <p>Body.</p>
      </main>
    </>
  );
}
