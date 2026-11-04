import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 15952;
const base = `http://127.0.0.1:${PORT}`;

function start(env = {}) {
  const docDir = mkdtempSync(join(tmpdir(), 'cimd-docs-'));
  writeFileSync(join(docDir, 'acme-agent.json'), JSON.stringify({ client_id: 'x', client_name: 'Acme Agent', redirect_uris: ['https://acme.example/cb'], grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'none' }));
  const child = spawn(process.execPath, [join(HERE, '..', 'server', 'index.js')], { env: { ...process.env, PORT: String(PORT), DOC_DIR: docDir, ...env } });
  return { child, docDir };
}
const get = async (path, headers = {}) => {
  const r = await fetch(base + path, { headers });
  return { status: r.status, body: await r.json(), headers: r.headers };
};

test('health endpoint', async (t) => {
  const { child, docDir } = start();
  t.after(() => { child.kill(); rmSync(docDir, { recursive: true, force: true }); });
  await new Promise((r) => setTimeout(r, 400));
  const r = await get('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.schema, 'demo-health/1');
  assert.equal(r.body.demo.id, 'cimd-doc-server');
});

test('client.dev-compatible document rewrites client_id to the request URL (CIMD §4)', async (t) => {
  const { child, docDir } = start();
  t.after(() => { child.kill(); rmSync(docDir, { recursive: true, force: true }); });
  await new Promise((r) => setTimeout(r, 400));
  const r = await get('/oauth/metadata.json');
  assert.equal(r.status, 200);
  assert.equal(r.body.client_id, `${base}/oauth/metadata.json`);
  assert.deepEqual(r.body.redirect_uris, [`${base}/oauth/callback`]);
  assert.equal(r.body.grant_types[0], 'authorization_code');
});

test('documents directory is served and client_id corrected', async (t) => {
  const { child, docDir } = start();
  t.after(() => { child.kill(); rmSync(docDir, { recursive: true, force: true }); });
  await new Promise((r) => setTimeout(r, 400));
  const r = await get('/documents/acme-agent.json');
  assert.equal(r.status, 200);
  assert.equal(r.body.client_name, 'Acme Agent');
  assert.equal(r.body.client_id, `${base}/documents/acme-agent.json`);
});

test('unknown document 404s; disallowed host 403s; traversal blocked', async (t) => {
  const { child, docDir } = start();
  t.after(() => { child.kill(); rmSync(docDir, { recursive: true, force: true }); });
  await new Promise((r) => setTimeout(r, 400));
  assert.equal((await get('/documents/nope.json')).status, 404);
  assert.equal((await get('/documents/..%2Fsecrets.json')).status, 404);
});

test('disallowed Host header is refused (loopback + lab-proxy hosts only)', async (t) => {
  const { child, docDir } = start();
  t.after(() => { child.kill(); rmSync(docDir, { recursive: true, force: true }); });
  await new Promise((r) => setTimeout(r, 400));
  const raw = await import('node:http');
  const status = await new Promise((resolve, reject) => {
    const req = raw.request({ host: '127.0.0.1', port: PORT, path: '/oauth/metadata.json', headers: { host: 'evil.example:1' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 403);
});
