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

test('a missing core fails; a missing pin file fails; an unpinned vendored file fails; a hostile pin path is refused', () => {
  withLab({ without: [CORE] }, (root) => assert.ok(checkPin(root).some((p) => /core file is missing/.test(p))));
  withLab({}, (root) => { fs.rmSync(path.join(root, PIN_FILE)); assert.deepEqual(checkPin(root), [`${PIN_FILE}: the pin file is missing`]); });
  withLab({}, (root) => {
    const pin = path.join(root, PIN_FILE);
    fs.writeFileSync(pin, fs.readFileSync(pin, 'utf8').split('\n').filter((l) => !l.includes('Readers')).join('\n'));
    assert.ok(checkPin(root).some((p) => /runObservabilityReaders\.js: exists in the lab but is not in the pin file/.test(p)));
  });
  withLab({}, (root) => {
    fs.appendFileSync(path.join(root, PIN_FILE), `${'a'.repeat(64)}  ../../etc/hosts\n${'a'.repeat(64)}  /etc/hosts\nnot a pin line\n`);
    assert.equal(checkPin(root).filter((p) => /cannot read the line/.test(p)).length, 3);
  });
  withLab({}, (root) => { const pin = path.join(root, PIN_FILE); fs.writeFileSync(pin, fs.readFileSync(pin, 'utf8').replace(/^[0-9a-f]{64}  server\/src\/runObservability\.js$/m, '')); assert.ok(checkPin(root).some((p) => /not in the pin file/.test(p))); });
});

test('the command line exits 0 on a good lab and 1 with the problems on a bad one', () => {
  withLab({}, (root) => {
    const run = () => spawnSync(process.execPath, [path.join(HERE, 'checkPin.mjs'), root], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    fs.appendFileSync(path.join(root, CORE), '\n// x\n');
    const bad = run();
    assert.equal(bad.status, 1); assert.match(bad.stderr, /runObservability\.js: modified/);
  });
});
