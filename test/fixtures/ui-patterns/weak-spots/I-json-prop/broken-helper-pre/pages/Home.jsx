import { show } from "../lib/format.js";

export default function Home({ args = {} }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <pre className="untrusted untrusted--block">{show(args)}</pre>
      <button type="button" className="primary">Run</button>
    </main>
  );
}
