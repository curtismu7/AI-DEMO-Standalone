#!/usr/bin/env node
// add-shelf-button.mjs — one-shot rollout of the shelf-link service (owner request 2026-11-05).
// For every -LAB app under standalone/ that has a web UI:
//   server: copy shared/shelf-link/shelf.js -> server/src/shelfLink.js and mount GET /api/shelf
//           (additive route; /api/info bodies stay byte-identical so existing tests pass).
//           Route-table apps (API_ROUTES / ROUTES maps) also get '/api/shelf': ['GET'].
//   web:    copy shared/shelf-link/ShelfLink.jsx -> web/src/components/ShelfLink.jsx,
//           import + render <ShelfLink /> in the app header,
//           and re-vendor the canonical shared/standalone-ui.css (it owns .shelf-link styles).
// Run from the AI-DEMO-Standalone repo root:  node scripts/add-shelf-button.mjs [--app name] [--dry-run]
// Idempotent: an app already carrying shelfLink.js is skipped.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const STANDALONE = path.join(ROOT, 'standalone');
const SRC_SHELF = path.join(ROOT, 'shared/shelf-link/shelf.js');
const SRC_COMPONENT = path.join(ROOT, 'shared/shelf-link/ShelfLink.jsx');
const SRC_CSS = path.join(ROOT, 'shared/standalone-ui.css');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const appIdx = args.indexOf('--app');
const onlyApp = appIdx >= 0 ? args[appIdx + 1] : null;

const read = (f) => fs.readFileSync(f, 'utf8');
const cp = (src, dst) => { if (!dryRun) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, read(src)); } };
const patch = (f, fn) => { const t = read(f); const next = fn(t); if (next !== t && !dryRun) fs.writeFileSync(f, next); return next !== t; };

const results = [];
for (const app of fs.readdirSync(STANDALONE).sort()) {
  if (onlyApp && app !== onlyApp) continue;
  const dir = path.join(STANDALONE, app);
  const serverDir = path.join(dir, 'server/src');
  const webApp = path.join(dir, 'web/src/App.jsx');
  const isUi = fs.existsSync(webApp);
  const note = { app, server: 'skip', web: 'skip', css: [] };

  if (fs.existsSync(path.join(serverDir, 'shelfLink.js'))) {
    cp(SRC_SHELF, path.join(serverDir, 'shelfLink.js')); // re-sync the service to the latest shared copy
    note.server = 'already';
  } else if (fs.existsSync(serverDir)) {
    cp(SRC_SHELF, path.join(serverDir, 'shelfLink.js'));
    // Find the route file that declares /api routes (prefer app.js).
    const appJs = path.join(serverDir, 'app.js');
    if (fs.existsSync(appJs)) {
      let ok = patch(appJs, (t) => {
        if (t.includes('/api/shelf')) return t;
        let out = t;
        // Route-table apps: register the method so the 405/404 table knows the route.
        out = out.replace(/^export const (API_ROUTES|ROUTES) = \{$/m, (m) => `${m}\n  '/api/shelf': ['GET'],`);
        // Mount just before the SPA/web fallback, else after the last route registration.
        const mount = "app.get('/api/shelf', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json(shelfInfo()); }); // the header \"Shelf\" button";
        const imp = "import { shelfInfo } from './shelfLink.js';";
        if (!out.includes(imp)) {
          const imports = out.match(/^import .*$/gm) ?? [];
          const last = imports.at(-1);
          if (last) out = out.replace(last, `${last}\n${imp}`);
          else out = `${imp}\n${out}`;
        }
        const spa = out.match(/^\s*app\.(get|use)\('\*'/m) || out.match(/^\s*app\.use\(express\.static/m);
        if (spa) out = out.replace(spa[0], `${mount}\n${spa[0]}`);
        else {
          // insert after the /api/info route line, or the last app.get
          const anchor = out.match(/^.*app\.(?:get|use)\((?:['"]\/api[^'"]*['"]).*$/gm)?.at(-1);
          if (anchor) out = out.replace(anchor, `${anchor}\n  ${mount}`);
          else return out; // could not place; leave unmounted rather than guess
        }
        return out;
      });
      note.server = ok ? 'patched' : 'copied-only(no mount point)';
    } else {
      note.server = 'copied-only(no app.js)';
    }
  }

  if (isUi) {
    const compDir = path.join(dir, 'web/src/components');
    const compDst = path.join(compDir, 'ShelfLink.jsx');
    cp(SRC_COMPONENT, compDst); // re-sync the component to the latest shared copy
    const rel = './components/ShelfLink.jsx';
    let ok = patch(webApp, (t) => {
      if (t.includes('ShelfLink')) return t;
      let out = t;
      const imports = out.match(/^import .*$/gm) ?? [];
      const lastImport = imports.filter((l) => l.startsWith('import React')).at(-1) ?? imports.at(-1);
      const impLine = `import ShelfLink from "${rel}";`;
      if (lastImport) out = out.replace(lastImport, `${lastImport}\n${impLine}`);
      else out = `${impLine}\n${out}`;
      // Header insertion, in order of the family's container classnames:
      const containers = ['head__tools', 'shell-tools', 'top__tools', 'tools-right', 'className="actions"'];
      let done = false;
      for (const c of containers) {
        const re = new RegExp(`(<div ${c.startsWith('className') ? c : `className="${c}"`}[^>]*>)`);
        const m = out.match(re);
        if (m) { out = out.replace(re, `$1\n            <ShelfLink />`); done = true; break; }
      }
      if (!done) {
        // insert right after the first <h1>...</h1> inside the header
        const h1 = out.match(/(<h1[^>]*>[\s\S]*?<\/h1>)/);
        if (h1) { out = out.replace(h1[1], `${h1[1]}\n        <ShelfLink />`); done = true; }
      }
      return done ? out : t; // no safe anchor: skip the app rather than misplace the button
    });
    note.web = ok ? 'patched' : 'component-added(no header anchor)';
    // Re-vendor the canonical shared stylesheet everywhere it is vendored (it owns .shelf-link).
    const vendor = (f) => {
      if (fs.existsSync(f) && read(f) !== read(SRC_CSS)) { cp(SRC_CSS, f); note.css.push(path.relative(dir, f)); }
    };
    vendor(path.join(dir, 'web/src/standalone-ui.css'));
    vendor(path.join(dir, 'web/src/styles/standalone-ui.css'));
  }

  results.push(note);
}

for (const r of results) {
  console.log(`${r.app.padEnd(38)} server=${r.server.padEnd(28)} web=${r.web}${r.css.length ? ` css=${r.css.join(',')}` : ''}`);
}
console.log(`\n${results.length} app(s)${dryRun ? ' (dry run)' : ''}. Mount-point misses need a hand edit (server=copied-only / web=no header anchor).`);
