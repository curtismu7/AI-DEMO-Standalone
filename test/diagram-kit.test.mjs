// Runs in this repo's CI (node --test test/*.test.mjs, no dependencies). The kit's own behaviour tests
// (shared/diagram-kit/diagramKit.test.js and DiagramKit.test.jsx, vitest + Testing Library) need a lab's web workspace and run where the
// folder is vendored (first: hitl-mfa-lab-LAB web/src/diagram-kit). Here: static guards on what apps copy, and the diagram-kit.sha256 pin
// of those files (re-pin after any change to them).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'diagram-kit');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const VENDORED = ['DiagramKit.jsx', 'DiagramKit.test.jsx', 'diagram-kit.css', 'diagramKit.js', 'diagramKit.test.js'];
const CODE = ['DiagramKit.jsx', 'diagramKit.js'];

test('diagram-kit.sha256 pins exactly the files apps vendor, and they match', () => {
  const lines = read('diagram-kit.sha256').split('\n');
  assert.match(lines[0], /^# sha256 of the files apps copy unchanged into web\/src\/diagram-kit\//);
  const pins = lines.filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
  assert.deepEqual(pins.map(([, f]) => f).sort(), [...VENDORED].sort());
  for (const [h, f] of pins) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex'), h, `${f} changed: re-pin (${lines[0].split('Re-pin: ')[1]})`);
  assert.deepEqual(fs.readdirSync(dir).sort(), [...VENDORED, 'README.md', 'diagram-kit.sha256'].sort(), 'no stray files in the folder');
});

test('the stylesheet follows the CSS standard: tokens only, no forced priority, no italics, no dark-mode media query', () => {
  const css = read('diagram-kit.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'a hex colour literal');
  assert.doesNotMatch(css, /\b(rgb|rgba|hsl|hsla|oklch|color-mix)\(/i, 'a colour function (tokens only)');
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /font-style:\s*italic/);
  assert.doesNotMatch(css, /prefers-color-scheme/);
  assert.doesNotMatch(css, /@media/, 'the kit has no breakpoints of its own');
  for (const cls of ['dk-label', 'dk-label--on', 'dk-label--dim', 'dk-label--sel', 'dk-label--click', 'dk-open', 'dk-passport', 'dk-passport-go', 'dk-passport-row', 'dk-passport-list', 'dk-sec--source', 'dk-sec--out', 'dk-sec--in', 'dk-sec--reach', 'dk-up', 'dk-down']) assert.ok(css.includes(`.${cls}`), `.${cls} is styled`);
});

test('the details are a card on --surface, and Outgoing/Downstream are green and Incoming/Upstream amber, in words as well as colour', () => {
  const css = read('diagram-kit.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.dk-passport \{[^}]*background: var\(--surface/, 'the details card is drawn on --surface');
  assert.match(css, /\.dk-sec--out h4[^{]*\{[^}]*var\(--status-ok\)/); assert.match(css, /\.dk-sec--in h4[^{]*\{[^}]*var\(--status-warn/);
  const jsx = read('DiagramKit.jsx');
  for (const word of ['Outgoing', 'Incoming', 'Upstream', 'Downstream', 'Source', 'Reach']) assert.ok(jsx.includes(word), `${word} is written out`);
});

test('the code never touches innerHTML, eval or a dynamic function, and imports only react, React Flow and itself', () => {
  for (const f of CODE) {
    const src = read(f).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /innerHTML|dangerouslySetInnerHTML|insertAdjacentHTML|\beval\(|new Function\(|document\.write/, f);
    for (const m of src.matchAll(/from\s+"([^"]+)"/g)) assert.ok(['react', '@xyflow/react', './diagramKit.js'].includes(m[1]), `${f} imports ${m[1]}`);
  }
});

test('the only links are the source pointer and a hop catalog\'s spec refs, and every anchor opens safely', () => {
  const jsx = read('DiagramKit.jsx'); const js = read('diagramKit.js');
  assert.equal([...jsx.matchAll(/href=/g)].length, 2, 'two anchors: the source pointer and a spec ref (call refs)');
  assert.match(jsx, /href=\{s\.href\}/, 'the source link is the kit-built, GitHub-validated href');
  assert.match(jsx, /href=\{r\.url\}/, 'a spec ref renders its catalog url (hopDetail validates https:// only)');
  assert.match(jsx, /target="_blank" rel="noopener noreferrer"/);
  assert.match(js, /\^https:\\\/\\\/github\\\.com\\\//, 'sourceHref only accepts https://github.com/');
  assert.match(js, /\[0-9a-f\]\{40\}/, 'and a full 40-character commit');
});

test('the clicks and drags inside the details are stopped (nodrag nopan nowheel, no bubbling)', () => {
  const jsx = read('DiagramKit.jsx');
  assert.match(jsx, /dk-passport nodrag nopan nowheel/);
  assert.match(jsx, /onClick=\{\(e\) => e\.stopPropagation\(\)\} onDoubleClick=\{\(e\) => e\.stopPropagation\(\)\}/);
});

test('the exports a lab wires in are there, and the README says how to vendor and wire them', () => {
  const jsx = read('DiagramKit.jsx'); const js = read('diagramKit.js'); const readme = read('README.md');
  for (const name of ['ArrowNoLabel', 'EdgeLabels', 'FitOpen', 'Passport', 'PassportActions']) assert.match(jsx, new RegExp(`export (function|const) ${name}\\b`), name);
  for (const name of ['boxPassport', 'placeLabels', 'labelOverlaps', 'slotPoint', 'sidePoint', 'inOutPoint', 'sourceHref', 'sourceLabel']) assert.match(js, new RegExp(`export (function|const) ${name}\\b`), name);
  for (const s of ['## Vendor it', '## Wire it in', '## Limits', 'diagram-kit.sha256', 'never edit a lab']) assert.ok(readme.includes(s), s);
  assert.doesNotMatch(readme, /Verified source|Verified-source/, 'it says Source, never Verified');
});
