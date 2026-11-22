// checkPin.mjs against a lab-shaped folder built from this folder (the vendoring layout). node --test shared/run-observability/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkPin, VENDORED, CORE, PIN_FILE } from './checkPin.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WHERE = { 'RunObservability.jsx': 'web/src/run-observability/RunObservability.jsx', 'run-observability.css': 'web/src/run-observability/run-observability.css', 'run-observability.test.jsx': 'web/src/run-observability/run-observability.test.jsx', 'fixtures.js': 'web/src/run-observability/fixtures.js', 'runObservability.js': 'server/src/runObservability.js', 'runObservabilityReaders.js': 'server/src/runObservabilityReaders.js' };

// A lab root: every vendored file at its vendor target, plus the pin file. `without` leaves files out.
function lab({ without = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ropin-'));
  const put = (from, to) => { fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true }); fs.copyFileSync(path.join(HERE, from), path.join(root, to)); };
  for (const [from, to] of Object.entries(WHERE)) if (!without.includes(to)) put(from, to);
  put('run-observability.sha256', PIN_FILE);
  return root;
}
const withLab = (opts, fn) => { const root = lab(opts); try { return fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); } };

test('the shared pin file pins every vendored file at its vendor path, and the shared folder passes its own pin', () => {
  const pin = fs.readFileSync(path.join(HERE, 'run-observability.sha256'), 'utf8');
  for (const rel of VENDORED) assert.ok(pin.includes(`  ${rel}\n`), `${rel} is pinned`);
  withLab({}, (root) => assert.deepEqual(checkPin(root), []));
});

test('a lab without a log reader (no readers file) passes; core only is enough', () => {
  withLab({ without: ['server/src/runObservabilityReaders.js'] }, (root) => assert.deepEqual(checkPin(root), []));
});

test('a modified vendored file fails the pin, whichever file it is', () => {
  for (const rel of VENDORED) {
    withLab({}, (root) => {
      fs.appendFileSync(path.join(root, rel), '\n// edited in a lab\n');
      assert.deepEqual(checkPin(root).map((p) => p.split(':')[0]), [rel], rel);
    });
  }
});

test('a missing core fails; a missing required file fails (only the readers file may be absent); a missing pin file fails', () => {
  withLab({ without: [CORE] }, (root) => assert.ok(checkPin(root).some((p) => new RegExp(`${CORE}: missing from the lab`).test(p))));
  for (const rel of VENDORED.filter((r) => r !== 'server/src/runObservabilityReaders.js')) {
    withLab({ without: [rel] }, (root) => assert.ok(checkPin(root).some((p) => p === `${rel}: missing from the lab`), `${rel} is required`));
  }
  withLab({}, (root) => { fs.rmSync(path.join(root, PIN_FILE)); assert.deepEqual(checkPin(root), [`${PIN_FILE}: the pin file is missing`]); });
  assert.ok(checkPin('/nonexistent-lab-folder').some((p) => /does not exist/.test(p)));
});

test('an unpinned file is a problem: a known file left out of the pin, ANY other file beside the web files, ANY server/src/runObservability* file', () => {
  withLab({}, (root) => {
    const pin = path.join(root, PIN_FILE);
    fs.writeFileSync(pin, fs.readFileSync(pin, 'utf8').split('\n').filter((l) => !l.includes('Readers')).join('\n'));
    assert.ok(checkPin(root).some((p) => /runObservabilityReaders\.js: exists in the lab but is not in the pin file/.test(p)));
  });
  withLab({}, (root) => { const pin = path.join(root, PIN_FILE); fs.writeFileSync(pin, fs.readFileSync(pin, 'utf8').replace(/^[0-9a-f]{64}  server\/src\/runObservability\.js$/m, '')); assert.ok(checkPin(root).some((p) => /runObservability\.js: exists in the lab but is not in the pin file/.test(p))); });
  withLab({}, (root) => { fs.writeFileSync(path.join(root, 'web/src/run-observability/extra.js'), 'x'); assert.ok(checkPin(root).some((p) => /web\/src\/run-observability\/extra\.js: is not in the pin file/.test(p))); });
  withLab({}, (root) => { fs.writeFileSync(path.join(root, 'server/src/runObservabilityPatched.js'), 'x'); assert.ok(checkPin(root).some((p) => /runObservabilityPatched\.js: is not in the pin file/.test(p))); });
  withLab({}, (root) => { fs.writeFileSync(path.join(root, 'server/src/other.js'), 'x'); assert.deepEqual(checkPin(root), [], 'a lab file that is not ours is none of our business'); });
});

test('a symlink, a directory or a file that resolves outside the lab is refused', () => {
  withLab({}, (root) => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'roout-'));
    try {
      fs.copyFileSync(path.join(HERE, 'runObservability.js'), path.join(out, 'runObservability.js'));
      fs.rmSync(path.join(root, CORE)); fs.symlinkSync(path.join(out, 'runObservability.js'), path.join(root, CORE));
      assert.ok(checkPin(root).some((p) => /runObservability\.js: must be a regular file/.test(p)), 'a pinned core symlinked outside the lab does not pass');
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
  });
  withLab({}, (root) => { fs.rmSync(path.join(root, CORE)); fs.mkdirSync(path.join(root, CORE)); assert.ok(checkPin(root).some((p) => /must be a regular file/.test(p)), 'a directory is a problem, not a throw'); });
  withLab({}, (root) => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'roout-'));
    try { fs.rmSync(path.join(root, 'web/src/run-observability'), { recursive: true }); fs.symlinkSync(out, path.join(root, 'web/src/run-observability')); const p = checkPin(root); assert.ok(p.length > 0); } finally { fs.rmSync(out, { recursive: true, force: true }); }
  });
});

test('a pin line that is not canonical, is duplicated, or is not a vendored file is a problem', () => {
  withLab({}, (root) => {
    const h = 'a'.repeat(64);
    fs.appendFileSync(path.join(root, PIN_FILE), `${h}  ../../etc/hosts\n${h}  /etc/hosts\n${h}  ./server/src/runObservability.js\n${h}  server//src/runObservability.js\n${h}  server/src/../src/runObservability.js\nnot a pin line\n`);
    assert.equal(checkPin(root).filter((p) => /cannot read the line/.test(p)).length, 6);
  });
  withLab({}, (root) => {
    const pin = path.join(root, PIN_FILE); const line = fs.readFileSync(pin, 'utf8').split('\n').find((l) => l.endsWith('server/src/runObservability.js'));
    fs.appendFileSync(pin, `${line}\n`);
    assert.ok(checkPin(root).some((p) => /pinned twice/.test(p)));
  });
  withLab({}, (root) => { fs.appendFileSync(path.join(root, PIN_FILE), `${'a'.repeat(64)}  server/src/other.js\n`); assert.ok(checkPin(root).some((p) => /not a vendored run-observability file/.test(p))); });
});

test('the command line never fails open: 0 on a good lab, 1 with the problems on a bad one, 2 with the usage and no path; spaces and symlinked folders work', () => {
  const run = (args, script = path.join(HERE, 'checkPin.mjs')) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  assert.equal(run([]).status, 2); assert.match(run([]).stderr, /usage/);
  withLab({}, (root) => {
    assert.equal(run([root]).status, 0);
    const spaced = fs.mkdtempSync(path.join(os.tmpdir(), 'ro space-'));
    try {
      fs.copyFileSync(path.join(HERE, 'checkPin.mjs'), path.join(spaced, 'checkPin.mjs'));
      assert.equal(run([root], path.join(spaced, 'checkPin.mjs')).status, 0, 'a script path with a space runs the check');
      fs.appendFileSync(path.join(root, CORE), '\n// x\n');
      const bad = run([root], path.join(spaced, 'checkPin.mjs'));
      assert.equal(bad.status, 1); assert.match(bad.stderr, /runObservability\.js: modified/);
      const link = path.join(spaced, 'linked'); fs.symlinkSync(spaced, link);
      assert.equal(run([root], path.join(link, 'checkPin.mjs')).status, 1, 'a symlinked folder still runs the check');
      assert.equal(run([path.join(root, 'nope')], path.join(link, 'checkPin.mjs')).status, 1);
    } finally { fs.rmSync(spaced, { recursive: true, force: true }); }
  });
});
