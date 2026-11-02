import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { classifyCss, classifyToggle, formatTable, inspectApp, problemsOf, repoOf, sha256 } from './fleet-check.mjs';

const CANON = 'canonical sheet bytes';
const CANON_HASH = sha256(Buffer.from(CANON));

function fakeApp(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-test-'));
  for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); }
  return dir;
}
const ROUTE = "api.post('/mode', (req, res) => res.json({}));";
const UI = '<ModeToggle info={info} />';

test('repoOf reads the folder of the composeFile and refuses odd values', () => {
  assert.equal(repoOf({ composeFile: 'agent-kill-switch-LAB/docker-compose.yml' }), 'agent-kill-switch-LAB');
  assert.equal(repoOf({ composeFile: '../x/docker-compose.yml' }), null);
  assert.equal(repoOf({}), null);
  assert.equal(repoOf(null), null);
});

test('classifyCss: canonical, stale, none', () => {
  assert.equal(classifyCss(CANON_HASH, CANON_HASH), 'canonical');
  assert.equal(classifyCss('other', CANON_HASH), 'stale');
  assert.equal(classifyCss(null, CANON_HASH), 'none');
});

test('classifyToggle: switch needs both a POST mode route and a toggle in the UI; test files do not count', () => {
  const f = (file, text) => ({ file, text });
  assert.equal(classifyToggle([f('server/app.js', ROUTE), f('web/App.jsx', UI)]), 'switch');
  assert.equal(classifyToggle([f('web/App.jsx', '<button data-testid="mode-real">')]), 'display-only');
  assert.equal(classifyToggle([f('server/app.js', ROUTE)]), 'api-only');
  assert.equal(classifyToggle([f('server/app.js', 'nothing here')]), 'none');
  assert.equal(classifyToggle([f('server/test/mode.test.js', ROUTE), f('web/src/test/x.test.jsx', UI)]), 'none');
  assert.equal(classifyToggle([f('server/app.js', "app.get('/mode', h)"), f('web/App.jsx', UI)]), 'display-only');
});

test('inspectApp: a clean app is canonical, guarded, switch, and zero css-rule fails', () => {
  const dir = fakeApp({
    'web/src/standalone-ui.css': CANON, 'scripts/check-ui-standard.sh': '#!/bin/bash', 'scripts/standalone-ui.sha256': `${CANON_HASH}\n`,
    'server/src/app.js': ROUTE, 'web/src/App.jsx': UI, 'node_modules/x/standalone-ui.css': 'ignored',
  });
  const r = inspectApp(dir, { canonicalHash: CANON_HASH, checkCss: () => 0 });
  assert.deepEqual(r, { css: 'canonical', rules: 0, guard: 'ok', toggle: 'switch' });
  assert.deepEqual(problemsOf({ id: 'a', ...r, ci: 'success' }), []);
});

test('inspectApp: stale sheet, pin that no longer matches, display-only toggle, css-rule fails', () => {
  const dir = fakeApp({
    'web/src/standalone-ui.css': 'old sheet', 'scripts/check-ui-standard.sh': '#!/bin/bash', 'scripts/standalone-ui.sha256': `${CANON_HASH}\n`,
    'web/src/App.jsx': UI,
  });
  const r = inspectApp(dir, { canonicalHash: CANON_HASH, checkCss: () => 3 });
  assert.deepEqual(r, { css: 'stale', rules: 3, guard: 'pin-mismatch', toggle: 'display-only' });
  assert.deepEqual(problemsOf({ id: 'a', ...r, ci: 'failure' }), ['stylesheet stale', '3 css-rule fails', 'guard pin-mismatch', 'toggle display-only', 'ci failure']);
});

test('inspectApp: an app with nothing is css none, guard none, toggle none', () => {
  const r = inspectApp(fakeApp({ 'README.md': 'x' }), { canonicalHash: CANON_HASH, checkCss: () => 0 });
  assert.deepEqual(r, { css: 'none', rules: 0, guard: 'none', toggle: 'none' });
});

test('problemsOf reports an inspection error as the only problem', () => {
  assert.deepEqual(problemsOf({ id: 'a', error: 'could not inspect: no repo' }), ['could not inspect: no repo']);
});

test('formatTable lists every app under the headings and shows an error row', () => {
  const t = formatTable([{ id: 'one', css: 'canonical', rules: 0, guard: 'ok', toggle: 'switch', ci: 'success' }, { id: 'two', error: 'could not inspect: no repo' }]);
  const lines = t.split('\n');
  assert.match(lines[0], /^app\s+css\s+rules\s+guard\s+toggle\s+ci$/);
  assert.match(lines[2], /^one\s+canonical\s+0\s+ok\s+switch\s+success$/);
  assert.match(lines[3], /^two\b.*could not inspect: no repo$/);
});
