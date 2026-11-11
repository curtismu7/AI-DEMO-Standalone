#!/usr/bin/env node
/**
 * Mutation tests for scripts/check-ui-patterns.mjs: each rule gets a fixture that
 * breaks exactly that rule, and the test asserts the checker catches it (and that
 * a clean fixture passes). Run: node scripts/check-ui-patterns.test.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECK = path.join(HERE, 'check-ui-patterns.mjs');
const CANON = process.env.CANONICAL_CSS || path.resolve(HERE, '..', 'shared', 'standalone-ui.css');
const CLEAN_HTML = `<!doctype html><html><head><link rel="stylesheet" href="standalone-ui.css"></head><body>
<div class="banner" role="note">Mock mode</div>
<header class="shell-bar">T</header>
<main class="page-frame"><h1>T</h1><p>body</p>
<button class="btn btn--primary">Go</button>
<div class="mode-toggle"><button>Mock</button><button>Real</button></div></main>
<script>fetch('/api/mode');</script>
</body></html>`;
const CLEAN_APPEND = `\n.shell-bar{background:var(--box-dark);color:var(--on-box)}\n.shell-bar + main ~ *{--accent-gradient:var(--accent-gradient)}\n.shell-bar{border-bottom:1px solid var(--border);background-image:var(--accent-gradient)}\nmain.page-frame{max-width:1100px;margin:0 auto}\n`;

let pass = 0;
let fail = 0;

function run(html = CLEAN_HTML, cssAppend = CLEAN_APPEND) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uifix-'));
  fs.mkdirSync(path.join(dir, 'public'));
  html = (html ?? CLEAN_HTML).replace('</head>', '<link rel="stylesheet" href="extra.css"></head>');
  fs.writeFileSync(path.join(dir, 'public', 'index.html'), html);
  fs.writeFileSync(path.join(dir, 'public', 'standalone-ui.css'), fs.readFileSync(CANON, 'utf8'));
  fs.writeFileSync(path.join(dir, 'public', 'extra.css'), cssAppend);
  try {
    execFileSync('node', [CHECK, dir, '--canonical', CANON, '--strict'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { exit: 0, out: '' };
  } catch (e) {
    return { exit: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function expect(rule, html, cssAppend, opts = {}) {
  if (html === null) html = CLEAN_HTML;
  const { exit, out } = run(html, cssAppend);
  const wantFail = opts.clean ? 0 : 1;
  const hit = opts.clean ? exit === 0 : exit === 1 && new RegExp(`\\b${rule}\\b`).test(out);
  if (hit) { pass += 1; console.log(`  ok   ${rule}${opts.clean ? ' clean passes' : ' caught'}`); }
  else { fail += 1; console.log(`  FAIL ${rule} — exit ${exit}, expected ${wantFail}${opts.clean ? '' : ` / ${rule} in output`}\n${out.slice(0, 400)}`); }
}
const wrap = (body) => `<!doctype html><html><head><link rel="stylesheet" href="standalone-ui.css"></head><body>${body}<script>fetch('/api/mode');</script></body></html>`;

console.log('mutation tests for check-ui-patterns.mjs');

// P1: no shell
expect('P1', wrap('<main class="page-frame"><h1>T</h1></main>'));
// P2: content before the banner
expect('P2', wrap('<main class="page-frame"><h1>Before</h1></main><div class="banner" role="note">x</div><header class="shell-bar">T</header>'));
// P3: main without a frame class and with no frame in the CSS
expect('P3', wrap('<header class="shell-bar">T</header><div class="banner" role="note">x</div><main><h1>T</h1></main>'), '');
// P9: two primary buttons
expect('P9', wrap('<header class="shell-bar">T</header><div class="banner" role="note">x</div><main class="page-frame"><h1>T</h1><button class="btn btn--primary">A</button><button class="btn btn--primary">B</button></main>'));
// P10: primary button with a literal gradient in CSS (inline style is H3's job)
expect('P10', wrap('<header class="shell-bar">T</header><div class="banner" role="note">x</div><main class="page-frame"><h1>T</h1><button class="btn btn--primary">A</button></main>'),
  `${CLEAN_APPEND}\n.btn--primary{background:linear-gradient(90deg,#000,#111)}\n`);
// H1: two h1s
expect('H1', wrap('<header class="shell-bar">T</header><div class="banner" role="note">x</div><main class="page-frame"><h1>A</h1><h1>B</h1></main>'));
// H3: inline colour
expect('H3', wrap('<header class="shell-bar">T</header><div class="banner" role="note">x</div><main class="page-frame"><h1 style="color:#123456">T</h1></main>'));
// T1: purple in own CSS
expect('T1', null, `\n.x{color:#8000ff}\n`);
// T2: font-size under 10px
expect('T2', null, `\np{font-size:8px}\n`);
// A2: outline none with no replacement
expect('A2', null, `\n.btn{outline:none}\n`);
// A3: img without alt
expect('A3', wrap('<header class="shell-bar">T</header><div class="banner" role="note">x</div><main class="page-frame"><h1>T</h1><img src="x.png"></main>'));
// A1: unlabelled input
expect('A1', wrap('<header class="shell-bar">T</header><div class="banner" role="note">x</div><main class="page-frame"><h1>T</h1><input type="text"></main>'));
// P7: chip with no text
expect('P7', wrap('<header class="shell-bar">T</header><div class="banner" role="note">x</div><main class="page-frame"><h1>T</h1><span class="chip chip--ok"></span></main>'));
// P4: card with a literal top edge
expect('P4', wrap('<header class="shell-bar">T</header><div class="banner" role="note">x</div><main class="page-frame"><h1>T</h1><div class="card">c</div></main>'), `\n.card{border-top:3px solid #ff0000}\n`);
// V1: no standalone-ui.css
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uifix-'));
  fs.mkdirSync(path.join(dir, 'public'));
  fs.writeFileSync(path.join(dir, 'public', 'index.html'), wrap('<header class="shell-bar">T</header><main class="page-frame"><h1>T</h1></main><div class="banner" role="note">x</div>'));
  let ok = false;
  try { execFileSync('node', [CHECK, dir, '--canonical', CANON, '--strict'], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) {
    ok = e.status === 1 && /\bV1\b/.test(`${e.stdout}${e.stderr}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  if (ok) { pass += 1; console.log('  ok   V1 caught'); } else { fail += 1; console.log('  FAIL V1'); }
}
// M1: no toggle and no /api/mode call
expect('M1', `<!doctype html><html><head><link rel="stylesheet" href="standalone-ui.css"></head><body><div class="banner" role="note">x</div><header class="shell-bar">T</header><main class="page-frame"><h1>T</h1></main></body></html>`);
// C1: --on-accent with no contrast on the gradient (defined after the canonical import)
expect('C1', null, `\n:root{--on-accent:#cccccc}\n`);
// the clean page passes everything
expect('CLEAN', CLEAN_HTML, CLEAN_APPEND, { clean: true });

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
