// Honest limit: exclusivity through assignments (`let x; if (a) x = ...`) is NOT proven, so both count.
export default function Home({ ready = true }) {
  let action = null;
  if (ready) action = <button type="button" className="primary">Run</button>;
  else action = <button type="button" className="primary">Prepare</button>;
  return (
    <main className="page-frame">
      <h1>Home</h1>
      {action}
    </main>
  );
}
