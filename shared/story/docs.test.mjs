// The runbook other agents follow must not rot: it states the scope, names every file the pin vendors, and points at tools that exist.
// node --test shared/story/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDORED } from './checkPin.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(HERE, f), 'utf8');

test('the contract and the runbook both say Story mode is for AI-DEMO-Standalone apps only, for now', () => {
  for (const f of ['README.md', 'ADDING-TO-A-LAB.md']) assert.match(read(f), /AI-DEMO-Standalone apps only, for now/, `${f} states the scope`);
});

test('the runbook\'s copy commands name every file the pin vendors (so a new vendored file cannot be forgotten)', () => {
  const doc = read('ADDING-TO-A-LAB.md');
  for (const name of Object.keys(VENDORED)) {
    const stem = name.replace(/\.(js|jsx|css|mjs)$/, '');
    assert.ok(doc.includes(stem), `ADDING-TO-A-LAB.md mentions ${name}`);
  }
  assert.ok(doc.includes('story.sha256'));
});

test('the tools the docs point at exist and parse', () => {
  for (const t of ['tools/walk.py', 'tools/play.py']) {
    assert.ok(fs.existsSync(path.join(HERE, t)), `${t} exists`);
    assert.ok(read('ADDING-TO-A-LAB.md').includes(t) && read('README.md').includes(t), `${t} is documented in both`);
  }
});

test('the docs and tools carry no internal hostname, tenant id or key', () => {
  const all = ['README.md', 'ADDING-TO-A-LAB.md', 'tools/walk.py', 'tools/play.py'].map(read).join('\n');
  assert.equal(/ping-devops|procyon|sk-ant|curtismuir|Curtiss-MacBook|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(all), false);
});
