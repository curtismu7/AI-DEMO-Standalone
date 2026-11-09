import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerOnShelf } from './shelf-register.mjs';

const ENTRY = { id: 'demo-a', name: 'Demo A', description: 'd', url: 'http://127.0.0.1:1', composeFile: 'docker-compose.yml' };

// <tmp>/demo-shelf or demo-shelf-LAB (with a seed), <tmp>/app-LAB (with docs/shelf-entry.json and a compose file)
function setup(entry = ENTRY, seedIds = [], shelfDir = 'demo-shelf') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shelf-'));
  const shelf = path.join(tmp, shelfDir);
  const app = path.join(tmp, 'app-LAB');
  fs.mkdirSync(path.join(shelf, 'data'), { recursive: true });
  fs.mkdirSync(path.join(app, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(shelf, 'data', 'demos.json'), JSON.stringify({ demos: seedIds.map((id) => ({ id })) }));
  fs.writeFileSync(path.join(app, 'docs', 'shelf-entry.json'), JSON.stringify(entry));
  fs.writeFileSync(path.join(app, 'docker-compose.yml'), '');
  return { tmp, shelf, app, local: path.join(shelf, '.data', 'demos.local.json') };
}
const run = (app, env = {}) => registerOnShelf({ appRoot: app, env, log: () => {} });
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('adds a missing entry, creating the local file, and rewrites an app-relative composeFile', () => {
  const s = setup();
  assert.equal(run(s.app), 'added');
  assert.deepEqual(read(s.local).demos.map((d) => d.id), ['demo-a']);
  assert.equal(read(s.local).demos[0].composeFile, 'app-LAB/docker-compose.yml');
});

test('finds a demo-shelf-LAB folder too', () => {
  const s = setup(ENTRY, [], 'demo-shelf-LAB');
  assert.equal(run(s.app), 'added');
  assert.equal(read(s.local).demos[0].composeFile, 'app-LAB/docker-compose.yml');
});

test('second run changes nothing', () => {
  const s = setup();
  run(s.app);
  const before = fs.readFileSync(s.local, 'utf8');
  assert.equal(run(s.app), 'present');
  assert.equal(fs.readFileSync(s.local, 'utf8'), before);
});

test('an id in the committed seed counts as on the shelf', () => {
  const s = setup(ENTRY, ['demo-a']);
  assert.equal(run(s.app), 'present');
  assert.equal(fs.existsSync(s.local), false);
});

test('keeps other local entries', () => {
  const s = setup();
  fs.mkdirSync(path.dirname(s.local), { recursive: true });
  fs.writeFileSync(s.local, JSON.stringify({ demos: [{ id: 'other' }] }));
  assert.equal(run(s.app), 'added');
  assert.deepEqual(read(s.local).demos.map((d) => d.id), ['other', 'demo-a']);
});

test('no shelf beside the app: skips', () => {
  const s = setup();
  fs.rmSync(s.shelf, { recursive: true });
  assert.equal(run(s.app), 'no-shelf');
});

test('SHELF_AUTOREGISTER=0 disables', () => {
  const s = setup();
  assert.equal(run(s.app, { SHELF_AUTOREGISTER: '0' }), 'disabled');
  assert.equal(fs.existsSync(s.local), false);
});

test('a corrupt local file is left alone', () => {
  const s = setup();
  fs.mkdirSync(path.dirname(s.local), { recursive: true });
  fs.writeFileSync(s.local, '{nope');
  assert.equal(run(s.app), 'bad-local');
  assert.equal(fs.readFileSync(s.local, 'utf8'), '{nope');
});

test('an invalid entry is not written', () => {
  const s = setup({ ...ENTRY, id: 'Bad Id' });
  assert.equal(run(s.app), 'bad-entry');
  assert.equal(fs.existsSync(s.local), false);
});

test('a description over 300 characters is not written (the shelf would refuse to start)', () => {
  const s = setup({ ...ENTRY, description: 'x'.repeat(301) });
  assert.equal(run(s.app), 'bad-entry');
  assert.equal(fs.existsSync(s.local), false);
});

test('a url with a path is not written', () => {
  const s = setup({ ...ENTRY, url: 'http://127.0.0.1:1/app' });
  assert.equal(run(s.app), 'bad-entry');
});

test('accepts the {demos:[...]} entry shape', () => {
  const s = setup({ demos: [ENTRY] });
  assert.equal(run(s.app), 'added');
});

test('stamps addedAt = now (ISO timestamp) on an entry it adds', () => {
  const s = setup();
  assert.equal(registerOnShelf({ appRoot: s.app, env: {}, log: () => {}, now: () => new Date('2026-11-09T14:00:00Z') }), 'added');
  assert.equal(read(s.local).demos[0].addedAt, '2026-11-09T14:00:00.000Z');
});

test('keeps an addedAt the entry already carries', () => {
  const s = setup({ ...ENTRY, addedAt: '2026-11-01' });
  run(s.app);
  assert.equal(read(s.local).demos[0].addedAt, '2026-11-01');
});

test('never rewrites the addedAt of an entry already on the shelf', () => {
  const s = setup();
  fs.mkdirSync(path.dirname(s.local), { recursive: true });
  const before = JSON.stringify({ demos: [{ id: 'demo-a', addedAt: '2026-10-01T00:00:00.000Z' }, { id: 'other' }] });
  fs.writeFileSync(s.local, before);
  assert.equal(registerOnShelf({ appRoot: s.app, env: {}, log: () => {}, now: () => new Date('2026-11-09T14:00:00Z') }), 'present');
  assert.equal(fs.readFileSync(s.local, 'utf8'), before);
});
