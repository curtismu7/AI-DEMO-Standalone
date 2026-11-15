// hostile-mcp-LAB shape (before its JsonPane migration): module-level regex literals with an escaped closing tag, and a pretty JSON.stringify later in the file.
const HOT = /<IMPORTANT>[\s\S]*?<\/IMPORTANT>|ignore (?:all )?(?:previous|prior) instructions[\s\S]*|https?:\/\/[^\s"',]+/gi;
const POISON = /<IMPORTANT>[\s\S]*?<\/IMPORTANT>/;
const pretty = (value) => JSON.stringify(value, null, 2);

export default function Home() {
  const copy = () => navigator.clipboard.writeText(pretty({ hot: HOT.source, poison: POISON.source }));
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <p>Flagged spans are highlighted.</p>
      <button type="button" className="primary" onClick={copy}>Run</button>
    </main>
  );
}
