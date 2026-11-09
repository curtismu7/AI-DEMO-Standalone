// Runs the shared return-link tests in this repo's CI (node --test test/*.test.mjs), and checks that
// shared/return-link/return-link.sha256 pins the files apps vendor (re-pin after any change to them).
import '../shared/return-link/returnTargets.test.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'return-link');

test('return-link.sha256 pins every vendored file', () => {
  const lines = fs.readFileSync(path.join(dir, 'return-link.sha256'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  const pinned = Object.fromEntries(lines.map((l) => l.split(/\s+/).reverse()));
  assert.deepEqual(Object.keys(pinned).sort(), ['ReturnLink.jsx', 'ReturnLink.test.jsx', 'returnTargets.js']);
  for (const [f, h] of Object.entries(pinned)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex'), h, f);
  }
});
