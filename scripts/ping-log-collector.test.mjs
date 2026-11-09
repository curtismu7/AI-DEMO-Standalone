import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'ping-log-collector');
const YAML = fs.readFileSync(path.join(DIR, 'vector.yaml'), 'utf8');
const KEY = 'not-a-real-key-test-value';

// The text of one transform (from its "name:" line to the next two-space key or the next top-level section).
const section = (name) => { const i = YAML.indexOf(`\n  ${name}:\n`); assert.ok(i >= 0, `transform ${name} exists`); const rest = YAML.slice(i + 1); const m = rest.slice(1).search(/\n {2}[a-z_]+:\n|\n[a-z]+:\n/); return m < 0 ? rest : rest.slice(0, m + 1); };
const maskBlock = (t) => { const a = t.indexOf('# Strip ANSI colour codes'); const marker = 'Cookie{[REDACTED]}")'; const b = t.indexOf(marker); assert.ok(a >= 0 && b > a, 'masking block found'); return t.slice(a, b + marker.length); };

test('vector.yaml: the demo pipeline masks exactly like the Ping one (the two masking blocks are identical)', () => {
  const ping = maskBlock(section('normalize')); const demo = maskBlock(section('normalize_demo'));
  assert.equal(demo, ping);
  assert.ok((ping.match(/m = replace\(m,/g) || []).length >= 9, 'and the block really is the masking rules');
});

test('vector.yaml: demo containers go to demo-logs-<service>, Ping products stay in ping-logs-<product>, each sink has its own input', () => {
  assert.match(YAML, /index: "ping-logs-\{\{ ping_product \}\}"/);
  assert.match(YAML, /index: "demo-logs-\{\{ demo_service \}\}"/);
  assert.match(section('normalize_demo'), /inputs: \[demo_docker\]/);
  assert.match(YAML, /elasticsearch_demo:\n {4}type: elasticsearch\n {4}inputs: \[normalize_demo\]/);
  assert.match(YAML, /elasticsearch:\n {4}type: elasticsearch\n {4}inputs: \[drop_pf_debug\]/);
  const names = [...YAML.slice(YAML.indexOf('  demo_docker:'), YAML.indexOf('\ntransforms:')).matchAll(/- "([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ['lab-proxy-lab-proxy-1', 'procyon-nodesensor', 'ai-demo-mcp-gateway', 'ai-demo-llm-proxy', 'ai-demo-authz-server', 'ai-demo-mcp-server', 'ai-demo-mcp-weather', 'ai-demo-hitl-service']);
  assert.ok(!/PING_/.test(section('normalize_demo')), 'the demo transform does not depend on the Ping container variables');
});

test('vector.yaml: no dollar sign in a comment (Vector reads variables inside comments too, and a stray one stops the collector)', () => {
  for (const line of YAML.split('\n')) if (/^\s*#/.test(line)) assert.ok(!line.includes('$'), line);
});

// ---- make-write-key.sh against a fake Elasticsearch ----
async function fakeEs(status = 200) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET') { res.statusCode = 200; return res.end('{}'); }
      res.statusCode = status; res.end(status === 200 ? JSON.stringify({ id: 'x', encoded: KEY }) : '{"error":"security_exception"}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, seen, close: () => new Promise((r) => server.close(r)) };
}
const run = (es, file, input = 'pw"odd\\chars\n') => new Promise((resolve) => {
  const c = spawn('bash', [path.join(DIR, 'make-write-key.sh')], { env: { ...process.env, ES_LOCAL_URL: es.url, ENV_FILE: file } });
  let stdout = ''; let stderr = '';
  c.stdout.on('data', (x) => { stdout += x; }); c.stderr.on('data', (x) => { stderr += x; });
  c.on('close', (status) => resolve({ status, stdout, stderr })); c.stdin.end(input);
});
const tmpEnv = (text) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'collector-')); const f = path.join(d, '.env'); fs.writeFileSync(f, text); return { d, f }; };

test('make-write-key.sh: with no ENV_FILE it writes to the shared settings file, ~/Development/.env', () => {
  const sh = fs.readFileSync(path.join(DIR, 'make-write-key.sh'), 'utf8');
  assert.match(sh, /FILE="\$\{ENV_FILE:-\$HOME\/Development\/\.env\}"/);
});

test('make-write-key.sh is valid bash', () => { assert.equal(spawnSync('bash', ['-n', path.join(DIR, 'make-write-key.sh')]).status, 0); });

test('make-write-key.sh: a WRITE-only key for ping-logs-* and demo-logs-*, saved as PING_LOGS_ES_APIKEY, never printed', async () => {
  const es = await fakeEs(); const { d, f } = tmpEnv('PING_LOGS_ES_URL=http://x\nPING_LOGS_ES_APIKEY=oldvalue\nPING_PF_CONTAINER=pf\n');
  try {
    const r = await run(es, f);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.ok(!r.stdout.includes(KEY) && !r.stderr.includes(KEY));
    const post = es.seen.find((s) => s.method === 'POST');
    assert.equal(post.auth, `Basic ${Buffer.from('elastic:pw"odd\\chars').toString('base64')}`);
    const idx = JSON.parse(post.body).role_descriptors.writer.indices;
    assert.equal(idx.length, 1);
    assert.deepEqual(idx[0].names, ['ping-logs-*', 'demo-logs-*']);
    assert.deepEqual(idx[0].privileges, ['create_doc', 'create_index', 'auto_configure'], 'no read, index, write or delete');
    assert.equal(JSON.parse(post.body).expiration, '90d');
    const env = fs.readFileSync(f, 'utf8');
    assert.match(env, new RegExp(`^PING_LOGS_ES_APIKEY=${KEY}$`, 'm'));
    assert.ok(!env.includes('oldvalue') && env.includes('PING_PF_CONTAINER=pf') && env.includes('PING_LOGS_ES_URL=http://x'), 'only the key line changes');
    assert.equal(fs.statSync(f).mode & 0o777, 0o600);
    assert.ok(fs.readdirSync(d).some((n) => n.startsWith('.env.bak.')));
  } finally { await es.close(); fs.rmSync(d, { recursive: true, force: true }); }
});

test('make-write-key.sh: a refused password changes nothing', async () => {
  const es = await fakeEs(401); const { d, f } = tmpEnv('PING_LOGS_ES_APIKEY=oldvalue\n');
  try {
    const r = await run(es, f);
    assert.equal(r.status, 1); assert.match(r.stdout, /HTTP 401 \(no key written\)/);
    assert.equal(fs.readFileSync(f, 'utf8'), 'PING_LOGS_ES_APIKEY=oldvalue\n');
    assert.deepEqual(fs.readdirSync(d), ['.env']);
  } finally { await es.close(); fs.rmSync(d, { recursive: true, force: true }); }
});
