// Behaviour of scripts/check-ui-patterns.mjs and its wrapper: allowlist enforcement, exit codes, options, docs.
// Per-rule proofs are in ui-patterns-mutation.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RULE_IDS, RULES } from '../scripts/check-ui-patterns.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const CHECK = path.join(REPO, 'scripts', 'check-ui-patterns.mjs');
const WRAP = path.join(REPO, 'scripts', 'check-ui-patterns.sh');
const CANON = path.join(REPO, 'shared', 'standalone-ui.css');
const STATIC = path.join(HERE, 'fixtures', 'ui-patterns', 'clean-static');

/** A temp root with `good-LAB` (clean) and `bad-LAB` (two primary buttons: P9), plus an allowlist file. */
function world(allowlist) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uiroot-'));
  for (const name of ['good-LAB', 'bad-LAB']) {
    fs.cpSync(STATIC, path.join(root, name), { recursive: true });
    fs.copyFileSync(CANON, path.join(root, name, 'public', 'standalone-ui.css'));
  }
  const f = path.join(root, 'bad-LAB', 'public', 'index.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<button type="button" class="primary">Run</button>', '<button type="button" class="primary">Run</button><button type="button" class="primary">Run too</button>'));
  const list = path.join(root, 'allow.txt');
  fs.writeFileSync(list, `# test allowlist\n${allowlist.join('\n')}\n`);
  return { root, list };
}
const run = (w, ...args) => {
  const r = spawnSync('node', [CHECK, '--root', w.root, '--allowlist', w.list, ...args], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout };
};

test('an enforced page with DRIFT fails (exit 1)', () => {
  const w = world(['bad-LAB/index']);
  const r = run(w);
  assert.equal(r.code, 1);
  assert.match(r.out, /ENFORCED FAIL bad-LAB\/index/);
  assert.match(r.out, /P9/);
});

test('an advisory page with DRIFT does not fail (exit 0) and is reported', () => {
  const w = world(['good-LAB/index']);
  const r = run(w);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /DRIFT \[advisory\] bad-LAB\/index/);
  assert.match(r.out, /ENFORCED PASS good-LAB\/index/);
});

test('--strict enforces every page: advisory drift now fails', () => {
  const w = world([]);
  assert.equal(run(w).code, 0);
  const r = run(w, '--strict');
  assert.equal(r.code, 1);
  assert.match(r.out, /ENFORCED FAIL bad-LAB\/index/);
});

test('the summary line states pages, clean, drift, enforced and failing', () => {
  const w = world(['good-LAB/index']);
  const r = run(w);
  assert.match(r.stdout, /^2 pages: 1 clean, 1 with drift; 1 enforced \(0 failing\)/m);
});

test('a stale allowlist entry (page no longer exists in a checked-out app) fails', () => {
  const w = world(['good-LAB/renamed-away']);
  const r = run(w);
  assert.equal(r.code, 1);
  assert.match(r.out, /ALLOWLIST good-LAB\/renamed-away: no such page/);
});

test('an allowlisted app that is not checked out: skipped locally, fails with --require-checkout', () => {
  const w = world(['gone-LAB/index']);
  assert.equal(run(w).code, 0);
  const r = run(w, '--require-checkout');
  assert.equal(r.code, 1);
  assert.match(r.out, /gone-LAB\/index: the app is not checked out/);
});

test('--app limits the run to one app and leaves other apps out of scope', () => {
  const w = world(['bad-LAB/index']);
  const r = run(w, '--app', 'good-LAB');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /bad-LAB\/index \(/);
  assert.match(r.stdout, /^1 pages: 1 clean/m);
});

test('--json is machine readable and carries the exit code', () => {
  const w = world(['bad-LAB/index']);
  const r = run(w, '--json');
  assert.equal(r.code, 1);
  const j = JSON.parse(r.stdout);
  assert.equal(j.summary.pages, 2);
  assert.equal(j.summary.failing, 1);
  assert.equal(j.exit, 1);
  assert.ok(j.pages.every((p) => Array.isArray(p.results) && p.results.every((x) => RULE_IDS.includes(x.rule))));
});

test('--list-advisory lists advisory pages with the fewest DRIFT rules first', () => {
  const w = world([]);
  const r = run(w, '--list-advisory');
  assert.equal(r.code, 0);
  const lines = r.stdout.trim().split('\n');
  assert.match(lines[0], /good-LAB\/index.*clean/);
  assert.match(lines[1], /bad-LAB\/index.*P9/);
});

test('--rules prints every rule id', () => {
  const r = spawnSync('node', [CHECK, '--rules'], { encoding: 'utf8' });
  for (const id of RULE_IDS) assert.match(r.stdout, new RegExp(`^${id}\\s`, 'm'));
});

test('an unknown option exits 2', () => {
  assert.equal(spawnSync('node', [CHECK, '--nope'], { encoding: 'utf8' }).status, 2);
});

test('an allow comment with a reason lets one finding through and is listed', () => {
  const w = world(['bad-LAB/index']);
  const f = path.join(w.root, 'bad-LAB', 'public', 'index.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<button type="button" class="primary">Run too</button>', '<!-- ui-pattern: allow P9 second action is a destructive confirm, tracked in the backlog -->\n<button type="button" class="primary">Run too</button>'));
  const j = JSON.parse(run(w, '--json').stdout);
  const page = j.pages.find((p) => p.key === 'bad-LAB/index');
  assert.ok(page, 'page found');
  assert.equal(page.clean, true, JSON.stringify(page.drift));
  assert.ok(page.results.some((x) => x.rule === 'ESC'), 'the escape is listed');
});

test('the wrapper scripts/check-ui-patterns.sh calls the checker; --strict is passed through', () => {
  const w = world([]);
  const ok = spawnSync('bash', [WRAP, path.join(w.root, 'good-LAB')], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /good-LAB\/index/);
  const bad = spawnSync('bash', [WRAP, path.join(w.root, 'bad-LAB')], { encoding: 'utf8' });
  assert.equal(bad.status, 0, 'advisory by default');
  assert.match(bad.stdout, /DRIFT \[advisory\] bad-LAB\/index/);
  const strict = spawnSync('bash', [WRAP, path.join(w.root, 'bad-LAB'), '--strict'], { encoding: 'utf8' });
  assert.equal(strict.status, 1);
});

test('the real allowlist file is well formed: header comment, one app/page per line, no duplicates', () => {
  const text = fs.readFileSync(path.join(REPO, 'scripts', 'ui-pattern-converted.txt'), 'utf8');
  assert.match(text.split('\n')[0], /^#/, 'starts with a comment');
  assert.match(text, /DRIFT[^\n]*FAIL|fails CI/i, 'the header says what enforcement means');
  const entries = text.split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  for (const e of entries) assert.match(e, /^[\w.-]+\/[\w.-]+$/, `bad allowlist line: ${e}`);
  assert.equal(new Set(entries).size, entries.length, 'duplicate allowlist line');
});

test('every rule id has a description and is documented in shared/STANDALONE-UI-PATTERNS.md', () => {
  const doc = fs.readFileSync(path.join(REPO, 'shared', 'STANDALONE-UI-PATTERNS.md'), 'utf8');
  for (const id of RULE_IDS) {
    assert.ok(RULES[id] && RULES[id].length > 10, `${id} has a description`);
    assert.match(doc, new RegExp(`\\b${id}\\b`), `${id} is not documented`);
  }
});
