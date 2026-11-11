// Regression fixtures for the known weak spots of scripts/check-ui-patterns.mjs (A-H of the 2026-11-10 review).
// Each case is a folder under test/fixtures/ui-patterns/weak-spots/<case>/ with a meta.json and one or more variant
// folders. A variant is laid over the clean-react fixture app (its files land in web/src/, replacing the fixture's own),
// and the page "home" is judged:
//   clean*   -> the rule is PASS (or INFO) and the page has no DRIFT at all  (the natural code now passes)
//   broken*  -> the rule has meta.status (or meta.variants[name]) and no OTHER rule drifts  (a real violation is still caught)
// meta.json: { rule, status, note, also?: [rule ids that may drift too], variants?: { name: "DRIFT" | "WARN" | "OK" },
//              match?: { name: "regex the rule's detail must match" } }
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCheck } from '../scripts/check-ui-patterns.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'ui-patterns');
const SPOTS = path.join(FIX, 'weak-spots');
const CANON = path.resolve(HERE, '..', 'shared', 'standalone-ui.css');

/** Copy clean-react to a temp dir (canonical stylesheet vendored in) and lay a variant folder over web/src. */
function buildApp(variantDir) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uispot-'));
  const app = path.join(dir, 'clean-react');
  fs.cpSync(path.join(FIX, 'clean-react'), app, { recursive: true });
  fs.copyFileSync(CANON, path.join(app, 'web', 'src', 'standalone-ui.css'));
  if (variantDir) fs.cpSync(variantDir, path.join(app, 'web', 'src'), { recursive: true });
  return { dir, app };
}

function judge(variantDir, rule) {
  const { dir, app } = buildApp(variantDir);
  try {
    const res = runCheck({ appDirs: [app], allowlist: [], canonicalCss: CANON });
    const page = res.pages.find((p) => p.id === 'home');
    assert.ok(page, `page home found (pages: ${res.pages.map((p) => p.id)})`);
    const row = page.results.find((r) => r.rule === rule);
    assert.ok(row, `rule ${rule} reported`);
    const drift = page.results.filter((r) => r.status === 'DRIFT').map((r) => r.rule);
    return { row, drift, page };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const cases = fs.readdirSync(SPOTS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();

test('the weak-spot fixture folder is not empty and every case has a meta.json', () => {
  assert.ok(cases.length >= 10, `cases found: ${cases.length}`);
  for (const c of cases) {
    const meta = JSON.parse(fs.readFileSync(path.join(SPOTS, c, 'meta.json'), 'utf8'));
    assert.ok(meta.rule && meta.status && meta.note, `${c}/meta.json needs rule, status, note`);
  }
});

for (const c of cases) {
  const meta = JSON.parse(fs.readFileSync(path.join(SPOTS, c, 'meta.json'), 'utf8'));
  const variants = fs.readdirSync(path.join(SPOTS, c), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  assert.ok(variants.some((v) => v.startsWith('clean')) || meta.cleanOptional, `${c} needs a clean variant`);
  for (const v of variants) {
    const expected = (meta.variants && meta.variants[v]) || (v.startsWith('clean') ? 'OK' : meta.status);
    test(`${meta.rule} ${expected === 'OK' ? 'passes' : expected}: ${c}/${v}`, () => {
      const { row, drift } = judge(path.join(SPOTS, c, v), meta.rule);
      if (expected === 'OK') {
        assert.ok(row.status === 'PASS' || row.status === 'INFO', `${meta.rule} should pass, got ${row.status}: ${row.detail}`);
        assert.deepEqual(drift, [], `the page should have no DRIFT at all, got ${drift}`);
      } else {
        assert.equal(row.status, expected, `${meta.rule} should be ${expected}, got ${row.status}: ${row.detail}`);
        const other = drift.filter((r) => r !== meta.rule && !(meta.also || []).includes(r));
        assert.deepEqual(other, [], `only ${meta.rule} may drift, also drifting: ${other}`);
        if (meta.match && meta.match[v]) assert.match(row.detail, new RegExp(meta.match[v]), 'the message names what is wrong');
      }
    });
  }
}
