// A vendored component that a page renders behind a mode check (`mode !== 'live' && <GatewayTrace/>`) is not a page of its own:
// viewEvidence() reads any comparison to a quoted string next to a component as "this is a routed view", so before this fix the
// vendored shared/gateway-trace panel became a page called "live" and was judged (P3, P9, P10, H1) although it is pinned byte for byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverPages } from '../scripts/check-ui-patterns.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REACT = path.join(HERE, 'fixtures', 'ui-patterns', 'clean-react');
const SHARED = path.join(HERE, '..', 'shared');

function labWith(vendoredDir) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vendview-'));
  const lab = path.join(root, 'x-LAB');
  fs.cpSync(REACT, lab, { recursive: true });
  const src = path.join(lab, 'web', 'src');
  fs.mkdirSync(path.join(src, vendoredDir), { recursive: true });
  fs.mkdirSync(path.join(src, 'components'), { recursive: true });
  fs.copyFileSync(path.join(SHARED, 'gateway-trace', 'GatewayTrace.jsx'), path.join(src, vendoredDir, 'GatewayTrace.jsx'));
  fs.copyFileSync(path.join(SHARED, 'json', 'JsonPane.jsx'), path.join(src, 'components', 'JsonPane.jsx'));
  // main.jsx mounts only <App/>; App.jsx is the router (as in muse): it routes to the pages and renders the panel behind a mode check
  fs.writeFileSync(path.join(src, 'main.jsx'), `import { createRoot } from "react-dom/client";
import App from "./App";
import "./standalone-ui.css";
import "./app.css";

createRoot(document.getElementById("root")).render(<App />);
`);
  fs.writeFileSync(path.join(src, 'App.jsx'), `import AppShell from "./AppShell";
import Home from "./pages/Home";
import Other from "./pages/Other";
import GatewayTrace from "./${vendoredDir}/GatewayTrace.jsx";

const ROUTES = { "home": Home, "other": Other };

export default function App({ mode, trace }) {
  const Page = ROUTES[window.location.hash.slice(1)] || Home;
  return (
    <AppShell>
      <Page />
      {mode !== 'live' && trace && <GatewayTrace exchanges={trace} source="mock" />}
    </AppShell>
  );
}
`);
  return lab;
}
const files = (pages) => pages.map((p) => p.file);

test('the vendored gateway-trace panel behind a mode check is not discovered as a page', () => {
  const lab = labWith('gateway-trace');
  const { pages } = discoverPages(lab);
  assert.ok(!files(pages).some((f) => /gateway-trace\/GatewayTrace\.jsx$/.test(f)), `pages: ${files(pages).join(', ')}`);
  assert.ok(pages.some((p) => /pages\/Home\.jsx$/.test(p.file)), 'the real pages are still found');
});

test('the same component in a folder that is NOT vendored is still a view (the filter is by the registered folders, nothing wider)', () => {
  const lab = labWith('panels');
  const { pages } = discoverPages(lab);
  assert.ok(files(pages).some((f) => /panels\/GatewayTrace\.jsx$/.test(f)), `pages: ${files(pages).join(', ')}`);
});
