import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { spawn } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(ROOT, '..', 'public', 'index.html'), 'utf8');

test('the page carries the mock banner and a Demoing caption on every step', () => {
  assert.match(page, /SIMULATED/);
  const steps = page.match(/class="demoing"/g) || [];
  const heads = page.match(/class="head"/g) || [];
  assert.equal(steps.length, heads.length, 'every step needs a Demoing caption');
  const body = page.replace(/<style>[\s\S]*?<\/style>/, '');
  assert.doesNotMatch(body, /#[0-9a-fA-F]{6}/, 'no raw colour literals outside the token block');
});

test('the page names no real host, tenant or credential', () => {
  assert.doesNotMatch(page, /pingone\.com|ping-devops\.com|procyon|client_secret/i);
  const full = page + fs.readFileSync(path.join(ROOT, '..', 'server.js'), 'utf8');
  assert.match(full, /\.example/);
});

test('the server answers /api/health with demo-health/1 and serves the page', async () => {
  const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '4775' }, stdio: 'ignore' });
  try {
    await new Promise((ok, err) => { child.on('spawn', ok); child.on('error', err); setTimeout(() => err(new Error('spawn timeout')), 4000); });
    await new Promise((r) => setTimeout(r, 400));
    const get = (p) => new Promise((ok, err) => {
      http.get({ host: '127.0.0.1', port: 4775, path: p }, (res) => {
        let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => ok({ status: res.statusCode, body: b }));
      }).on('error', err);
    });
    const h = await get('/api/health');
    assert.equal(h.status, 200);
    assert.equal(JSON.parse(h.body).schema, 'demo-health/1');
    const idx = await get('/');
    assert.equal(idx.status, 200);
    assert.match(idx.body, /Demoing/);
  } finally {
    child.kill('SIGTERM');
  }
});
