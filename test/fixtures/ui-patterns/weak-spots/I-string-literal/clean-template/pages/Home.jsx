export default function Home({ tag = "code" }) {
  const open = `<span>${tag}`;
  const copy = () => navigator.clipboard.writeText(JSON.stringify({ open }, null, 2));
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <p>{open.length > 2 ? "tagged" : "plain"}</p>
      <button type="button" className="primary" onClick={copy}>Run</button>
    </main>
  );
}
