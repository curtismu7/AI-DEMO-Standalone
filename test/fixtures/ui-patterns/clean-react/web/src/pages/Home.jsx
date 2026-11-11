const SHORT = ["a", "b"].map((x) => x.toUpperCase());
const HINT = "open (see the docs";

export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <p>{HINT} {SHORT.join(",")}</p>
      <button type="button" className="primary">Run</button>
    </main>
  );
}
