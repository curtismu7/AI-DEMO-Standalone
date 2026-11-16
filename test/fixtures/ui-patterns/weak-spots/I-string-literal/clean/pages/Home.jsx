// hostile-mcp-LAB shape: a string constant holding an unclosed tag, and a pretty JSON.stringify later in the file (copied, not shown).
const MARKER = "<IMPORTANT>";
const TIPS = { open: '<code>', label: "Tagged" };
const pretty = (value) => JSON.stringify(value, null, 2);

export default function Home({ text = "" }) {
  const copy = () => navigator.clipboard.writeText(pretty({ marker: MARKER, tagged: text.includes(TIPS.open) }));
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <p>{text.startsWith("<IMPORTANT>") ? "poisoned" : "clean"}</p>
      <button type="button" className="primary" onClick={copy}>Run</button>
    </main>
  );
}
