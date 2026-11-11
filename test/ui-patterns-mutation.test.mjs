// Mutation tests for scripts/check-ui-patterns.mjs: take a clean fixture app, apply ONE deliberate break, and
// require the checker to flag exactly that rule (and nothing else drifts). Every rule id must have a mutation here.
// Fixtures: test/fixtures/ui-patterns/clean-static (vanilla HTML) and clean-react (Vite-style SPA, two views).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCheck, RULE_IDS } from '../scripts/check-ui-patterns.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'ui-patterns');
const CANON = path.resolve(HERE, '..', 'shared', 'standalone-ui.css');
const CSS_DIR = { 'clean-static': 'public', 'clean-react': 'web/src' };

/** Copy a fixture to a temp dir (with the canonical stylesheet vendored in), apply edits, return its dir. */
function make(name, edits = {}, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uifix-'));
  const app = path.join(dir, name);
  fs.cpSync(path.join(FIX, name), app, { recursive: true });
  const vendored = path.join(app, CSS_DIR[name], 'standalone-ui.css');
  fs.copyFileSync(CANON, vendored);
  for (const [file, fn] of Object.entries(edits)) {
    const p = path.join(app, file);
    const before = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    const after = typeof fn === 'function' ? fn(before) : fn;
    assert.notEqual(after, before, `mutation of ${file} changed nothing`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, after);
  }
  for (const [file, text] of Object.entries(extra)) {
    const p = path.join(app, file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  return { dir, app };
}
const sub = (from, to) => (s) => {
  assert.ok(s.includes(from), `fixture does not contain ${JSON.stringify(from)}`);
  return s.replace(from, to);
};
const append = (text) => (s) => `${s}\n${text}\n`;

/** { drift: Set of rule ids that DRIFT on any page, warn: Set of WARN rule ids, pages } */
function check(app) {
  try {
    const res = runCheck({ appDirs: [app], allowlist: [], canonicalCss: CANON });
    const drift = new Set();
    const warn = new Set();
    for (const p of res.pages) for (const r of p.results) {
      if (r.status === 'DRIFT') drift.add(r.rule);
      if (r.status === 'WARN') warn.add(r.rule);
    }
    return { drift, warn, pages: res.pages };
  } finally {
    fs.rmSync(path.dirname(app), { recursive: true, force: true });
  }
}

test('the clean fixtures have no DRIFT at all', () => {
  for (const name of Object.keys(CSS_DIR)) {
    const { drift, pages } = check(make(name).app);
    assert.ok(pages.length >= 1, `${name}: pages found`);
    assert.deepEqual([...drift], [], `${name} should be clean`);
  }
  // the react fixture exposes two pages (home, other)
  assert.equal(check(make('clean-react').app).pages.length, 2);
});

const HTML = 'public/index.html';
const CSS = 'public/app.css';

// [rule, fixture, edits, extra files, expected status, label, other rules that may legitimately drift with it]
const CASES = [
  ['P1', 'clean-static', { [HTML]: sub('<header class="shell-bar"><span class="shell-bar__title">Fixture lab</span></header>', '<header><span>Fixture lab</span></header>') }, {}, 'DRIFT', 'header without .shell-bar'],
  ['P2', 'clean-static', { [HTML]: sub('<div class="banner" role="note" id="banner">Simulated: no real tenant is called.</div>\n<main class="page-frame">\n  <h1>Fixture</h1>', '<main class="page-frame">\n  <h1>Fixture</h1><div class="banner" role="note" id="banner">Simulated: no real tenant is called.</div>') }, {}, 'DRIFT', 'content before the banner'],
  ['P2', 'clean-static', { [HTML]: sub('Simulated: no real tenant is called.</div>', 'Live production tenant.</div>') }, {}, 'DRIFT', 'hardcoded live banner'],
  ['P3', 'clean-static', { [HTML]: sub('<main class="page-frame">', '<main>'), [CSS]: '.shell-bar { background: var(--box-dark); color: var(--on-box); border-bottom: 3px solid transparent; border-image: var(--accent-gradient) 1; }' }, {}, 'DRIFT', 'main without a frame'],
  ['P4', 'clean-static', { [HTML]: sub('<p>Body text.</p>', '<div class="card">c</div>'), [CSS]: append('.card { border: 1px solid var(--border); border-top: 3px solid #ff0000; }') }, {}, 'DRIFT', 'card top edge literal'],
  ['P6', 'clean-static', { [HTML]: sub('<p>Body text.</p>', '<div class="inspector"><div>tree</div></div>') }, {}, 'DRIFT', 'incomplete inspector'],
  ['P7', 'clean-static', { [HTML]: sub('<p>Body text.</p>', '<p><span class="chip chip--ok"></span></p>') }, {}, 'DRIFT', 'chip with no text'],
  ['P7', 'clean-static', { [HTML]: sub('<p>Body text.</p>', '<p><span class="chip chip--ok">ok</span></p>'), [CSS]: append('.chip--ok { background: #00ff00; color: #000; }') }, {}, 'DRIFT', 'chip colour literal'],
  ['P9', 'clean-static', { [HTML]: sub('<button type="button" class="primary">Run</button>', '<button type="button" class="primary">Run</button><button type="button" class="primary">Run too</button>') }, {}, 'DRIFT', 'two primary buttons'],
  ['P9', 'clean-static', { [HTML]: sub('<button type="button" class="primary">Run</button>', '<button type="button">Run</button>') }, {}, 'DRIFT', 'no primary button'],
  ['P10', 'clean-static', { [CSS]: append('button.primary { background: linear-gradient(90deg, #000, #111); }') }, {}, 'DRIFT', 'button gradient literal'],
  ['P10', 'clean-static', { [CSS]: append('button { background: var(--vertical-accent); }') }, {}, 'DRIFT', 'button reads a vertical token'],
  ['P11', 'clean-static', { [HTML]: sub('<p>Body text.</p>', '<div role="dialog" aria-label="Hand rolled">x</div>') }, {}, 'WARN', 'hand-rolled dialog'],
  ['H1', 'clean-static', { [HTML]: sub('<h1>Fixture</h1>', '<h1>Fixture</h1><h1>Again</h1>') }, {}, 'DRIFT', 'two h1'],
  ['H1', 'clean-static', { [HTML]: (s) => s.replace('<main class="page-frame">', '<div class="page-frame">').replace('</main>', '</div>') }, {}, 'DRIFT', 'no main landmark', ['P3']],
  ['H2', 'clean-static', { [HTML]: sub('<p>Body text.</p>', '<h3>Skipped</h3>') }, {}, 'WARN', 'h1 to h3'],
  ['H3', 'clean-static', { [HTML]: sub('<p>Body text.</p>', '<p style="color:#123456">x</p>') }, {}, 'DRIFT', 'inline colour'],
  ['H3', 'clean-static', { [HTML]: sub('<p>Body text.</p>', '<p style="font-size:14px">x</p>') }, {}, 'DRIFT', 'inline font-size'],
  ['T1', 'clean-static', { [CSS]: append('.x { color: #3b82f6; }') }, {}, 'WARN', 'colour literal in own CSS'],
  ['T1', 'clean-static', { [CSS]: append('.x { color: #8000ff; }') }, {}, 'DRIFT', 'purple hex'],
  ['T1', 'clean-static', { [CSS]: append('.x { background: hsl(280 70% 50%); }') }, {}, 'DRIFT', 'purple hsl'],
  ['T2', 'clean-static', { [CSS]: append('p { font-size: 8px; }') }, {}, 'DRIFT', 'font under 10px'],
  ['A1', 'clean-static', { [HTML]: sub('<p>Body text.</p>', '<input type="text">') }, {}, 'DRIFT', 'unlabelled input'],
  ['A1', 'clean-static', { [HTML]: sub('<p>Body text.</p>', '<button type="button"></button>') }, {}, 'DRIFT', 'empty button'],
  ['A2', 'clean-static', { [CSS]: append('button { outline: none; }') }, {}, 'DRIFT', 'outline none, no replacement'],
  ['A3', 'clean-static', { [HTML]: sub('<p>Body text.</p>', '<img src="x.png">') }, {}, 'DRIFT', 'img without alt'],
  ['M1', 'clean-static', { [HTML]: sub('<div class="mode-toggle" role="group" aria-label="Mode"><button type="button" aria-pressed="true">Mock</button><button type="button" aria-pressed="false">Real</button></div>', '') }, {}, 'DRIFT', 'no Mock / Real toggle'],
  ['C1', 'clean-static', { [CSS]: append(':root { --on-accent: #cccccc; }') }, {}, 'DRIFT', 'text on the gradient loses contrast', ['P10']],
  ['V1', 'clean-static', { 'public/standalone-ui.css': append('.drifted { color: var(--text); }') }, {}, 'DRIFT', 'vendored css differs from shared'],
  ['T3', 'clean-static', { [HTML]: sub('<link rel="stylesheet" href="standalone-ui.css">\n', '') }, {}, 'DRIFT', 'no theme css loaded', ['V1']],
  // ---- React fixture: ordering, early-return states, loops
  ['P1', 'clean-react', { 'web/src/AppShell.jsx': sub('<header className="shell-bar">', '<header className="top">') }, {}, 'DRIFT', 'react: legacy header class', ['P3']],
  ['P2', 'clean-react', { 'web/src/AppShell.jsx': sub('      <ModeBanner />\n      <div id="main">{children}</div>', '      <div id="main">{children}</div>\n      <ModeBanner />') }, {}, 'DRIFT', 'react: banner mounted after the view (the {children} slot is the JSX one, not the parameter)'],
  ['P9', 'clean-react', { 'web/src/pages/Home.jsx': sub('<button type="button" className="primary">Run</button>', '<button type="button" className="primary">Run</button><button type="button" className="primary">Again</button>') }, {}, 'DRIFT', 'react: two primary buttons'],
  ['P9', 'clean-react', { 'web/src/pages/Other.jsx': sub('<ul>{["x", "y"].map((n) => <li key={n}>{n}</li>)}</ul>', '<ul>{["x", "y"].map((n) => <li key={n}><button type="button" className="primary">{n}</button></li>)}</ul>') }, {}, 'DRIFT', 'react: primary button inside a .map() loop'],
  ['H1', 'clean-react', { 'web/src/pages/Home.jsx': sub('<h1>Home</h1>', '<h1>Home</h1><main>nested</main>') }, {}, 'DRIFT', 'react: a second main outside any early-return state'],
  ['H1', 'clean-react', { 'web/src/pages/Home.jsx': sub('<h1>Home</h1>', '<h1>Home</h1><h1>Again</h1>') }, {}, 'DRIFT', 'react: two h1'],
  ['M1', 'clean-react', { 'web/src/AppShell.jsx': (x) => x.replace('        <ModeToggle />\n', '').replace('import ModeToggle from "./components/ModeToggle";\n', '') }, {}, 'DRIFT', 'react: toggle removed from the shell'],
  ['P10', 'clean-react', { 'web/src/app.css': append('button { color: var(--brand-header-on); }') }, {}, 'DRIFT', 'react: button reads a brand token'],
];

for (const [rule, fixture, edits, extra, status, label, also = []] of CASES) {
  test(`${rule} ${status}: ${label}`, () => {
    const { drift, warn } = check(make(fixture, edits, extra).app);
    const got = status === 'DRIFT' ? drift : warn;
    assert.ok(got.has(rule), `${rule} should be ${status}; DRIFT=[${[...drift]}] WARN=[${[...warn]}]`);
    if (status === 'DRIFT') assert.deepEqual([...drift].filter((r) => r !== rule && !also.includes(r)).sort(), [], `only ${rule}${also.length ? ` (and ${also})` : ''} may drift`);
  });
}

test('every rule id has at least one mutation test', () => {
  const covered = new Set(CASES.map((c) => c[0]));
  const missing = RULE_IDS.filter((r) => !covered.has(r));
  assert.deepEqual(missing, [], `rules without a mutation test: ${missing}`);
});
