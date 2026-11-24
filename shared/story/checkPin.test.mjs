// checkPin.mjs against a lab-shaped folder built from this folder (the vendoring layout). node --test shared/story/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPin, pinText, VENDORED, PIN_FILE, TARGETS } from './checkPin.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function lab({ without = [], pin = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storypin-'));
  const put = (from, to) => { fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true }); fs.copyFileSync(path.join(HERE, from), path.join(root, to)); };
  for (const [from, targets] of Object.entries(VENDORED)) for (const to of targets) if (!without.includes(to)) put(from, to);
  put('story.sha256', PIN_FILE);
  if (pin) fs.writeFileSync(path.join(root, PIN_FILE), pin);
  return root;
}
const withLab = (opts, fn) => { const root = lab(opts); try { return fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); } };

test('story.sha256 here is current (re-run: node shared/story/checkPin.mjs --write) and the folder passes its own pin', () => {
  assert.equal(fs.readFileSync(path.join(HERE, 'story.sha256'), 'utf8'), pinText(HERE));
  withLab({}, (root) => assert.deepEqual(checkPin(root), []));
});

test('hold.js is vendored to the server and the page, byte-identical', () => {
  assert.deepEqual(VENDORED['hold.js'], ['web/src/story/hold.js', 'server/src/story/hold.js']);
  assert.ok(TARGETS.length >= 9);
});

test('an edited vendored file fails the pin and names the file', () => {
  withLab({}, (root) => { fs.appendFileSync(path.join(root, 'web/src/story/engine.js'), '// local edit\n'); assert.deepEqual(checkPin(root), ['web/src/story/engine.js: modified (re-vendor it byte-for-byte from shared/story)']); });
});

test('a missing vendored file, a missing pin file and an unknown neighbour are all reported', () => {
  withLab({ without: ['server/src/story/captions.js'] }, (root) => assert.deepEqual(checkPin(root), ['server/src/story/captions.js: missing from the lab']));
  withLab({}, (root) => { fs.rmSync(path.join(root, PIN_FILE)); assert.deepEqual(checkPin(root), [`${PIN_FILE}: the pin file is missing`]); });
  withLab({}, (root) => { fs.writeFileSync(path.join(root, 'web/src/story/extra.js'), 'x'); assert.deepEqual(checkPin(root), ['web/src/story/extra.js: is not in the pin file (nothing else may live beside the vendored files)']); });
});

test('a symlinked vendored file, a bad pin line and a duplicate are rejected', () => {
  withLab({}, (root) => {
    const f = path.join(root, 'web/src/story/hold.js'); fs.rmSync(f); fs.symlinkSync(path.join(root, 'web/src/story/engine.js'), f);
    assert.match(checkPin(root).join('\n'), /hold\.js: must be a regular file/);
  });
  withLab({ pin: 'not a pin line\n' }, (root) => assert.match(checkPin(root)[0], /cannot read the line/));
  const dup = fs.readFileSync(path.join(HERE, 'story.sha256'), 'utf8'); const first = dup.split('\n')[0];
  withLab({ pin: dup + first + '\n' }, (root) => assert.match(checkPin(root).join('\n'), /is pinned twice/));
});

test('a lab folder that does not exist, and a pin that lists a file we do not vendor', () => {
  assert.match(checkPin('/nonexistent-lab-xyz')[0], /does not exist/);
  withLab({ pin: 'a'.repeat(64) + '  web/src/story/other.js\n' }, (root) => assert.match(checkPin(root).join('\n'), /not a vendored story file/));
});
