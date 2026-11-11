import Trace from "../components/Trace";

// The skip (h3 to h5) is inside the child component.
export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <Trace />
      <button type="button" className="primary">Run</button>
    </main>
  );
}
