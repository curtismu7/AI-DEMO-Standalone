// P9 with a primary that renders only on some view states: a component use site gated by a ternary on the tab
// (`SET.includes(tab) ? <Card/> : <Card primaryRetry/>`), or a prop whose value is that test (`primaryRetry={!SET.includes(tab)}`).
// The fixture is test/fixtures/ui-patterns/tab-gated: App.jsx keeps OWN_PRIMARY_TABS = ["identities", "verify"], so the card's
// primary counts on issuers only. Pages are judged per tab id, as the federated-identity-LAB App is.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCheck } from '../scripts/check-ui-patterns.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'ui-patterns', 'tab-gated');
const CANON = path.resolve(HERE, '..', 'shared', 'standalone-ui.css');
const TERNARY = '{OWN_PRIMARY_TABS.includes(tab) ? <Card /> : <Card primaryRetry />}';

/** Copy the fixture to a temp dir with the canonical stylesheet vendored in; `edits` maps a path under web/src to a function of its text. */
function build(edits = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uicond-'));
  const app = path.join(dir, 'tab-gated');
  fs.cpSync(FIX, app, { recursive: true });
  fs.copyFileSync(CANON, path.join(app, 'web', 'src', 'standalone-ui.css'));
  for (const [file, fn] of Object.entries(edits)) {
    const p = path.join(app, 'web', 'src', file);
    const before = fs.readFileSync(p, 'utf8');
    const after = fn(before);
    assert.notEqual(after, before, `mutation of ${file} changed nothing`);
    fs.writeFileSync(p, after);
  }
  return { dir, app };
}
const replaceOnce = (from, to) => (s) => {
  assert.ok(s.includes(from), `fixture does not contain ${JSON.stringify(from)}`);
  return s.replace(from, to);
};

/** P9 row for each page id, plus the rule ids that DRIFT on each page. */
function judge(edits) {
  const { dir, app } = build(edits);
  try {
    const res = runCheck({ appDirs: [app], allowlist: [], canonicalCss: CANON });
    const out = {};
    for (const p of res.pages) {
      out[p.id] = { p9: p.results.find((r) => r.rule === 'P9'), drift: p.results.filter((r) => r.status === 'DRIFT').map((r) => r.rule) };
    }
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('the card primary is counted only on the tabs where its arm renders (ternary on OWN_PRIMARY_TABS)', () => {
  const r = judge({});
  assert.deepEqual(Object.keys(r).sort(), ['identities', 'issuers', 'verify']);
  for (const id of ['identities', 'verify', 'issuers']) {
    assert.equal(r[id].p9.status, 'PASS', `${id}: ${r[id].p9.status} ${r[id].p9.detail}`);
  }
});

test('a tab with no own primary still counts the card primary (issuers: removing it drifts)', () => {
  const r = judge({ 'components/Card.jsx': replaceOnce('<button type="button" className="primary">Run the gateway check</button>', '<button type="button">Run the gateway check</button>') });
  assert.equal(r.issuers.p9.status, 'DRIFT', r.issuers.p9.detail);
  assert.equal(r.identities.p9.status, 'PASS', r.identities.p9.detail);
});

test('the prop form primaryRetry={!SET.includes(tab)} is gated the same way', () => {
  const r = judge({ 'App.jsx': replaceOnce(TERNARY, '<Card primaryRetry={!OWN_PRIMARY_TABS.includes(tab)} />') });
  for (const id of ['identities', 'verify', 'issuers']) {
    assert.equal(r[id].p9.status, 'PASS', `${id}: ${r[id].p9.status} ${r[id].p9.detail}`);
  }
});

test('mutation: dropping the conditional (card primary on every tab) drifts on identities and verify', () => {
  const r = judge({ 'App.jsx': replaceOnce(TERNARY, '<Card primaryRetry />') });
  for (const id of ['identities', 'verify']) {
    assert.equal(r[id].p9.status, 'DRIFT', `${id} should drift when the card is primary everywhere`);
    assert.match(r[id].p9.detail, /2 primary buttons/);
  }
  assert.equal(r.issuers.p9.status, 'PASS', r.issuers.p9.detail);
});
