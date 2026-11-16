import { pretty } from "../lib/format.js";

function Untrusted({ text, block = false }) { return block ? <pre className="untrusted">{text}</pre> : <span>{text}</span>; }

export default function Home({ result = {} }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <Untrusted block text={pretty(result)} />
      <button type="button" className="primary">Run</button>
    </main>
  );
}
