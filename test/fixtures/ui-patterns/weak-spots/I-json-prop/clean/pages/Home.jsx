// mfa-admin-mcp-LAB shape after its JsonPane migration: the helper is still used, but only where JSON is edited or copied.
import { pretty, show } from "../lib/format.js";

function Json({ value }) { return <div className="jsonbox">{String(value)}</div>; }
function CopyButton({ text }) { return <button type="button" onClick={() => navigator.clipboard.writeText(text)}>Copy</button>; }

export default function Home({ args = {}, result = {} }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <label className="field">Arguments (JSON object)<textarea rows={3} defaultValue={pretty(args)} /></label>
      <Json value={result} />
      <CopyButton text={show(result)} />
      <p title={pretty(result)}>Hover for the raw result.</p>
      <button type="button" className="primary" onClick={() => navigator.clipboard.writeText(pretty(result))}>Run</button>
    </main>
  );
}
