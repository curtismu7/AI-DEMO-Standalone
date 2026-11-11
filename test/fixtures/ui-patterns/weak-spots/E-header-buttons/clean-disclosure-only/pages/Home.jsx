// A read-only page whose only button is a disclosure: it is a selector, not an action that needs a primary.
export default function Home({ open = false }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <section>
        <button type="button" aria-expanded={open} aria-controls="more">Show details</button>
        <p id="more" hidden={!open}>Details.</p>
      </section>
      <button type="button" role="switch" aria-checked="false">Verbose</button>
    </main>
  );
}
