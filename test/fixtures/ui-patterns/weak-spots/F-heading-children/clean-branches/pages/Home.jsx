import Trace from "../components/Trace";

// Arms of one ternary start from the same heading level; they are not read one after the other.
export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <Trace rows={[]} />
      <button type="button" className="primary">Run</button>
    </main>
  );
}
