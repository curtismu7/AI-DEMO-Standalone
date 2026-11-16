export default function Home({ text = "" }) {
  const plain = text.replace(/<\/?b>/g, "").match(/<i>|(<IMPORTANT>)/);
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <p>{/<IMPORTANT>[\s\S]*?<\/IMPORTANT>/.test(text) ? "poisoned" : "clean"} {plain ? "tagged" : "plain"}</p>
      <button type="button" className="primary" onClick={() => navigator.clipboard.writeText(pretty(text))}>Run</button>
    </main>
  );
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}
