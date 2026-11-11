import Card from "../components/Card";

// h1 on the page, then the child starts at h3: the skip crosses the component boundary.
export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <Card />
      <button type="button" className="primary">Run</button>
    </main>
  );
}
