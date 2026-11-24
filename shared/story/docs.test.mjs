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
  for (const f of ['README.md', 'ADDING-TO-A-LAB.md', 'ROLLOUT.md', 'VIDEO.md']) assert.match(read(f), /AI-DEMO-Standalone apps only, for now/, `${f} states the scope`);
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
  const all = ['README.md', 'ADDING-TO-A-LAB.md', 'ROLLOUT.md', 'tools/walk.py', 'tools/play.py'].map(read).join('\n');
  assert.equal(/ping-devops|procyon|sk-ant|curtismuir|Curtiss-MacBook|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(all), false);
});

test('the hand-off names the reference lab, the runbook and the rules the next agent must read', () => {
  const doc = read('ROLLOUT.md');
  for (const want of ['privilege-a2a-anthropic-demo-LAB', 'ADDING-TO-A-LAB.md', 'STANDALONE-RULES.md', 'story-mode skill', 'walk.py', 'merge N', 'VIDEO.md']) assert.ok(doc.includes(want), `ROLLOUT.md mentions ${want}`);
});

test('the video hand-off names the gates that keep a real value out of a public video', () => {
  const doc = read('VIDEO.md');
  for (const want of ['sourceSha256', 'ALLOW_STALE_WORDING', 'onscreen_mask.py', '.redacted', 'public_image', 'mask_leaks', 'guarded_take.py', 'owner approves', 'gh release create', 'privilege-a2a-anthropic-demo-LAB']) assert.ok(doc.includes(want), `VIDEO.md mentions ${want}`);
  assert.ok(read('ADDING-TO-A-LAB.md').includes('VIDEO.md') && read('README.md').includes('VIDEO.md'), 'the runbook and the contract point to VIDEO.md');
});

