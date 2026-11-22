// shared/run-observability: the server module, against an in-process fake Docker socket and a fake Elasticsearch (no real network).
// Run: node --test shared/run-observability/*.test.mjs   (a glob, never a directory). The React panel's tests (vitest) run where it is vendored.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  createMasker, createRunObservability, DockerLogReader, ElasticsearchReader, ReaderError, RunObsError, readersFromEnv,
  layerMatchers, classify, defaultLayers, saasLayer, assertRunObservability, LAYERS,
} from './runObservability.js';
import { mockRecord, realRecord, longRecord, emptyRecord } from './fixtures.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T0 = Date.parse('2026-11-22T10:00:00Z'); const T1 = Date.parse('2026-11-22T10:00:09Z');
// Built from parts so no scanner reads a test value as a real credential.
const JWT = ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJ1c2VyLTcifQ', 'c2lnbmF0dXJlc2lnbmF0dXJl'].join('.');
const SK = ['sk', 'ant', 'FAKEFAKEFAKEFAKEFAKE'].join('-');
const ESKEY = ['read', 'only', 'test', 'value'].join('-');
const { mask, maskDeep } = createMasker();

// ---- fakes ----------------------------------------------------------------------------------------------
const frame = (type, text) => { const p = Buffer.from(text); const h = Buffer.alloc(8); h[0] = type; h.writeUInt32BE(p.length, 4); return Buffer.concat([h, p]); };
const dockerBody = (lines) => Buffer.concat(lines.map((l, i) => frame(i % 2 ? 2 : 1, `${l}\n`)));

// A fake Docker engine on a unix socket. `logs` maps a container name to its lines. Records every request.
async function fakeDocker(logs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ro-'));
  const socketPath = path.join(dir, 'd.sock');
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url });
    const m = /^\/containers\/([^/]+)\/logs\?/.exec(req.url);
    if (req.method !== 'GET' || !m) { res.statusCode = 405; return res.end('no'); }
    const lines = logs[decodeURIComponent(m[1])];
    if (!lines) { res.statusCode = 404; return res.end('{"message":"No such container"}'); }
    res.setHeader('content-type', 'application/vnd.docker.multiplexed-stream');
    res.end(dockerBody(lines));
  });
  await new Promise((r) => server.listen(socketPath, r));
  return { server, socketPath, seen, close: () => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

// A fake Elasticsearch on loopback. `handler(req, body)` -> [status, body, headers?]. Records every request.
async function fakeEs(handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
      const [status, body, headers = {}] = handler(req, raw);
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, seen, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
const hit = (src, index = 'ping-logs-x') => ({ _index: index, _id: 'x', _source: src });
const esOk = (hits) => [200, { hits: { hits } }];

// ---- the log lines a run leaves (shapes MEASURED, see the matcher table) ------------------------------------------------
const PF = [
  '2026-11-22T10:00:01.120456789Z /opt/out/instance/log/audit.log:  | tid:abcdef1234567890| trk-1| OAuth| user-7| 203.0.113.9 | | agent-main| OAuth20| h1| AS| failure| | Invalid Client| 501',
  '2026-11-22T10:00:01.130000000Z /opt/out/instance/log/server.log:  DEBUG [org.sourceid.util.log.internal.TrackingIdSupport] The incoming request does not contain a unique identifier.',
  '2026-11-22T09:59:00.000000000Z /opt/out/instance/log/audit.log:  | tid:before1234567890| trk-0| OAuth| user-7| 203.0.113.9 | | agent-main| OAuth20| h1| AS| failure| | Invalid Client| 501',
];
const GW = [
  '2026-11-22T10:00:02.300000000Z [vert.x-eventloop-thread-1] INFO  o.f.o.f.S.P1AZDecision @00-mcp-olb-jwks - [P1AZ] DECISION: PERMIT | backend=real | sub=user-7 | tool=whoami | method=tools/call | vertical=university | obligation=none',
  '2026-11-22T10:00:02.900000000Z [vert.x-eventloop-thread-1] INFO  o.f.o.f.S.P1AZDecision @00-mcp-olb-jwks - [P1AZ] DECISION: PERMIT | backend=real | sub=user-7 | tool=pay_tuition_balance | method=tools/call | vertical=university | obligation=hitl',
  '2026-11-22T10:00:03.000000000Z INDETERMINATE - HITL challenge ch-12345 minted for tool=pay_tuition_balance',
  '2026-11-22T10:00:03.500000000Z \u001b[0m{"eventName":"OPENIG-HTTP-ACCESS","client":{"ip":"203.0.113.9"},"http":{"request":{"method":"POST","path":"https://gw.example/mcp"}},"response":{"status":"FAILED","statusCode":"401","elapsedTime":7},"ig":{"routeName":"mcp-olb-primary"},"topic":"access"}',
];
const PGW_FILE = [
  'time=2026-11-22T10:00:04.100Z level=info msg="Access token found for user: user-7, client: main-agent"',
  'time=2026-11-22T10:00:04.200Z level=info msg="Success: principal {RefKind:User RefID:abc} is in list {RefKind:x}"',
  'time=2026-11-22T10:00:04.800Z level=info msg="[mcpgw] policy denied user-7 access to a2a app worker-agent (agent=true): principal x"',
  'time=2026-11-22T10:00:05.000Z level=info msg="Proxying to: http://backend.lab.example"',
  'time=2026-11-22T10:00:05.500Z level=warning msg="aiguard: blocked mcp response client=main-agent category=malicious_content"',
  'time=2026-11-22T10:00:05.600Z level=info msg="Invalid Authorization token"',
  'time=not-a-time level=info msg="Proxying to: http://elsewhere.example"',
];
const MCP = [
  '2026-11-22T10:00:06.000000000Z [2026-11-22T10:00:06.000Z] INFO: token audience validated',
  '2026-11-22T10:00:06.000000001Z     trace_id: "4bf92f3577b34da6a3ce929d0e0e4736"',
  '2026-11-22T10:00:07.000000000Z [2026-11-22T10:00:07.000Z] WARN: tool call denied: insufficient scope',
];

const mkDocker = async (extra = {}) => {
  const d = await fakeDocker({ pingfederate: PF, 'ping-gateway': GW, 'mcp-server': MCP, ...extra });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rof-'));
  fs.writeFileSync(path.join(dir, 'cyonproxy.log'), `${PGW_FILE.join('\n')}\n`);
  const reader = new DockerLogReader({ socketPath: d.socketPath, containers: { pingfederate: 'pingfederate', pinggateway: 'ping-gateway', 'mcp-server': 'mcp-server' }, files: { 'privilege-gateway': path.join(dir, 'cyonproxy.log') } });
  return { d, reader, close: () => { d.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
};
const RUN = { runId: 'run-1', startedAt: T0, endedAt: T1, correlation: { sub: 'user-7', actClientId: 'main-agent', requestIds: ['ch-12345'] } };

// ---- masker -------------------------------------------------------------------------------------------------------
test('masker: headers, bearer, basic, JWT, sk- key and secret-named fields never survive', () => {
  const cases = [
    `Authorization: Bearer ${JWT}`, `{"authorization":"Bearer ${JWT}"}`, 'Cookie: sid=abc123def456; theme=dark', 'Set-Cookie: sid=abc123def456; HttpOnly',
    'X-Api-Key: abcdefghijklmnop', 'Proxy-Authorization: Basic dXNlcjpwYXNzd29yZA==', `token ${JWT} in text`, `key ${SK} here`,
    '{"client_secret":"s3cret value with spaces","password":"hunter2"}', 'client_secret=abc&grant_type=x', 'refresh_token: rt-abcdef', 'Cookie{JSESSIONID=abcdef; PF=zzz}',
    'client_secret\n      SuperSecretValue\n  other', 'GET /cb?code=abcXYZ123&state=s', '{"code":"abcXYZ123"}', `access_token="${JWT}"`,
  ];
  const secrets = [JWT, SK, 'abc123def456', 'abcdefghijklmnop', 'dXNlcjpwYXNzd29yZA', 's3cret', 'hunter2', 'abc&', 'rt-abcdef', 'JSESSIONID=abcdef', 'SuperSecretValue', 'abcXYZ123'];
  for (const c of cases) {
    const out = mask(c);
    for (const s of secrets) assert.ok(!out.includes(s), `"${c}" leaked ${s}: ${out}`);
  }
  assert.equal(mask('Authorization: Bearer abc.def.ghi'), 'Authorization: ***');
  assert.match(mask('Bearer abcdefghij'), /^Bearer \*\*\*$/);
});

test('masker: addresses, emails and hostnames become placeholders; ids keep the first 4 and last 2', () => {
  assert.equal(mask('from 203.0.113.9 to 10.0.0.1:8443'), 'from <ip> to <ip>:8443');
  for (const v6 of ['2001:db8::1', '::1', 'fe80::a:b', '2001:0db8:0000:0000:0000:0000:0000:0001']) assert.equal(mask(`peer ${v6} up`), 'peer <ip> up', v6);
  assert.equal(mask('call https://gw.lab.example/mcp and svc.cluster.local and a@b.example'), 'call https://<host>/mcp and <host> and <email>');
  assert.equal(mask('user 123e4567-e89b-12d3-a456-426614174000 done'), 'user 123e…00 done');
  assert.equal(mask('trace 4bf92f3577b34da6a3ce929d0e0e4736'), 'trace 4bf9…36');
  assert.equal(mask('ref Wm9vZ2xlVGVuYW50QEBAZGVmYXVsdEBAQDEyMzQ1Njc4'), 'ref Wm9v…c4');
  // idempotent: masking masked text changes nothing
  const once = mask(`id 123e4567-e89b-12d3-a456-426614174000 ip 203.0.113.9 host a.example Bearer ${JWT}`);
  assert.equal(mask(once), once);
});

test('masker: ordinary log text is left alone (time of day, model and tool names, file names, Java loggers)', () => {
  for (const s of ['10:00:00.123 up', 'claude-haiku-4-5-20251001', 'pay_tuition_balance', '/opt/out/instance/log/audit.log:', 'org.sourceid.util.log.internal.TrackingIdSupport', 'user-7', 'Basic authentication failed', 'tools/call', 'Go-http-client/1.1', '2026-11-22T10:00:01.120Z']) assert.equal(mask(s), s);
});

test('masker: hostile input is bounded (ReDoS), prototype keys are inert, deep objects are cut, secret keys are dropped', () => {
  for (const s of ['a.'.repeat(60000), 'a'.repeat(200000), `${'1.'.repeat(30000)}x`, 'eyJ'.repeat(60000), 'client_secret='.repeat(20000)]) {
    const t0 = Date.now(); mask(s); assert.ok(Date.now() - t0 < 1500, `slow on ${s.slice(0, 12)}`);
  }
  const evil = JSON.parse('{"__proto__":{"polluted":"yes"},"password":"p","Authorization":"Bearer abcdefghij","count":3,"nested":{"api_key":"k","ok":"203.0.113.9"}}');
  const out = maskDeep(evil);
  assert.equal({}.polluted, undefined);
  assert.equal(out.password, '***'); assert.equal(out.Authorization, '***'); assert.equal(out.count, 3);
  assert.deepEqual(out.nested, { api_key: '***', ok: '<ip>' });
  let deep = 'leaf'; for (let i = 0; i < 100; i++) deep = { a: deep };
  assert.match(JSON.stringify(maskDeep(deep)), /<too deep>/);
  assert.equal(maskDeep(null), null);
});

// ---- Docker reader ------------------------------------------------------------------------------------------------
test('DockerLogReader: GET /containers/{name}/logs only; demuxes; keeps exact timestamps; joins indented lines; honours the window', async () => {
  const { d, reader, close } = await mkDocker();
  try {
    const r = await reader.readLines({ product: 'pingfederate', from: T0, to: T1 });
    assert.equal(r.lines.length, 2, 'the line before the window is dropped');
    assert.equal(r.lines[0].atExact, '2026-11-22T10:00:01.120456789Z');
    assert.equal(r.lines[0].at, Date.parse('2026-11-22T10:00:01.120Z'));
    const mcp = await reader.readLines({ product: 'mcp-server', from: T0, to: T1 });
    assert.match(mcp.lines[0].message, /token audience validated\n\s*trace_id/, 'the indented line is joined to its header');
    assert.ok(d.seen.length >= 2 && d.seen.every((s) => s.method === 'GET' && /^\/containers\/[\w-]+\/logs\?stdout=1&stderr=1&timestamps=1&since=\d+&until=\d+$/.test(s.url)), JSON.stringify(d.seen));
  } finally { close(); }
});

test('DockerLogReader: reads the Privilege gateway file log; a line with an unparseable time is skipped, never given a guessed one', async () => {
  const { reader, close } = await mkDocker();
  try {
    const r = await reader.readLines({ product: 'privilege-gateway', from: T0, to: T1 });
    assert.equal(r.lines.length, 6);
    assert.ok(!r.lines.some((l) => /elsewhere/.test(l.message)));
    assert.equal(r.lines[0].atExact, '2026-11-22T10:00:04.100Z');
  } finally { close(); }
});

test('DockerLogReader: a missing container, a missing socket and a bad name are named errors', async () => {
  const { d, close } = await mkDocker();
  try {
    const r = new DockerLogReader({ socketPath: d.socketPath, containers: { gone: 'nope', bad: '../etc' } });
    await assert.rejects(r.readLines({ product: 'gone', from: T0, to: T1 }), (e) => e instanceof ReaderError && e.code === 'docker_no_container');
    await assert.rejects(r.readLines({ product: 'bad', from: T0, to: T1 }), (e) => e.code === 'docker_bad_name');
    await assert.rejects(r.readLines({ product: 'unset', from: T0, to: T1 }), (e) => e.code === 'docker_not_configured');
    assert.equal(d.seen.length, 1, 'a bad name never reaches the socket');
  } finally { close(); }
  const nosock = new DockerLogReader({ socketPath: path.join(os.tmpdir(), 'ro-missing.sock'), containers: { p: 'c' } });
  await assert.rejects(nosock.readLines({ product: 'p', from: T0, to: T1 }), (e) => e.code === 'docker_unreachable' && /not reachable/.test(e.message));
});

// ---- Elasticsearch reader -----------------------------------------------------------------------------------------
test('ElasticsearchReader: ONE read-only POST /<index>/_search, the key only in the Authorization header, fields mapped, siem docs scrubbed', async () => {
  const es = await fakeEs(() => esOk([
    hit({ '@timestamp': '2026-11-22T10:00:02.300Z', ping_product: 'pinggateway', host: 'gw', message: GW[0].slice(31), level: 'INFO', request_id: 'rq-1' }),
    hit({ '@timestamp': '2026-11-22T10:00:03.000Z', ping_product: 'pinggateway', message: 'x' }),
  ]));
  try {
    const r = new ElasticsearchReader({ url: es.url, apiKey: ESKEY });
    const out = await r.readLines({ product: 'pinggateway', from: T0, to: T1, match: (l) => /P1AZ/.test(l.message) });
    assert.equal(es.seen.length, 1);
    assert.equal(es.seen[0].method, 'POST'); assert.equal(es.seen[0].url, '/ping-logs-*,demo-logs-*/_search');
    assert.equal(es.seen[0].auth, `ApiKey ${ESKEY}`);
    assert.ok(!JSON.stringify(es.seen[0].body).includes(ESKEY));
    assert.equal(es.seen[0].body.size, 500); assert.equal(es.seen[0].body.query.bool.filter[0].range['@timestamp'].gte, '2026-11-22T10:00:00.000Z');
    assert.equal(out.lines.length, 1); assert.equal(out.lines[0].requestId, 'rq-1'); assert.equal(out.lines[0].host, 'gw');
  } finally { es.close(); }
  const siem = await fakeEs(() => esOk([hit({ '@timestamp': '2026-11-22T10:00:04.000Z', Index: 'policy-decision-log', Level: 'INFO', Data: { Decision: 'deny', AgentKey: 'abcd', token: 'zzz' } }, 'ping-siem-events-v2')]));
  try {
    const out = await new ElasticsearchReader({ url: siem.url, apiKey: ESKEY }).readLines({ product: 'privilege-siem', from: T0, to: T1 });
    assert.equal(siem.seen[0].url, '/ping-siem-events-v2/_search');
    assert.ok(!out.lines[0].message.includes('zzz'), 'secret-looking fields are scrubbed again');
    assert.equal(classify({ ...out.lines[0], product: 'privilege-siem' }).outcome, 'refused');
  } finally { siem.close(); }
});

test('ElasticsearchReader: refuses a non-loopback URL, a redirect, a bad key, bad JSON, a too-large answer and a hang; the key is never in an error', async () => {
  const run = (url, o = {}) => new ElasticsearchReader({ url, apiKey: ESKEY, ...o }).readLines({ product: 'pinggateway', from: T0, to: T1 });
  const code = (c) => (e) => e instanceof ReaderError && e.code === c && !e.message.includes(ESKEY);
  await assert.rejects(run('http://es.example:9200'), code('es_not_loopback'));
  await assert.rejects(run('http://user:pw@127.0.0.1:9200'), code('es_not_loopback'));
  await assert.rejects(new ElasticsearchReader({ url: 'http://127.0.0.1:1' }).readLines({ product: 'p', from: T0, to: T1 }), code('es_not_configured'));
  let es = await fakeEs(() => [302, '', { location: 'http://es.example/x' }]);
  try { await assert.rejects(run(es.url), (e) => e.code === 'es_unreachable' && /redirect/.test(e.message)); assert.equal(es.seen.length, 1, 'the redirect was not followed'); } finally { es.close(); }
  es = await fakeEs(() => [401, { error: `bad ${ESKEY}` }]);
  try { await assert.rejects(run(es.url), code('es_unauthorized')); } finally { es.close(); }
  es = await fakeEs(() => [200, '<html>nope</html>']);
  try { await assert.rejects(run(es.url), code('es_bad_response')); } finally { es.close(); }
  es = await fakeEs(() => [200, { nothits: true }]);
  try { await assert.rejects(run(es.url), code('es_bad_response')); } finally { es.close(); }
  es = await fakeEs(() => esOk([hit({ '@timestamp': '2026-11-22T10:00:02Z', message: 'x'.repeat(5000) })]));
  try { await assert.rejects(run(es.url, { maxBytes: 1000 }), code('es_too_large')); } finally { es.close(); }
  const hang = http.createServer(() => {}); await new Promise((r) => hang.listen(0, '127.0.0.1', r));
  try { await assert.rejects(run(`http://127.0.0.1:${hang.address().port}`, { timeoutMs: 150 }), (e) => e.code === 'es_unreachable' && /timed out/.test(e.message)); } finally { hang.closeAllConnections(); hang.close(); }
  es = await fakeEs(() => [500, 'boom']);
  try { await assert.rejects(run(es.url), code('es_error')); } finally { es.close(); }
});

test('readersFromEnv: Elasticsearch is the default; Docker is OFF unless RUN_OBS_DOCKER=1 (even when containers are set); order is Elasticsearch then Docker', () => {
  const es = { RUN_OBS_ES_URL: 'http://127.0.0.1:9200', RUN_OBS_ES_READ_APIKEY: ESKEY };
  const dockerVars = { RUN_OBS_CONTAINERS: 'pingfederate=pf, pinggateway=gw' };
  assert.deepEqual(readersFromEnv({}), []);
  assert.deepEqual(readersFromEnv(es).map((r) => r.name), ['elasticsearch']);
  assert.deepEqual(readersFromEnv({ ...es, ...dockerVars }).map((r) => r.name), ['elasticsearch'], 'containers set but no flag: the socket is never touched');
  assert.deepEqual(readersFromEnv(dockerVars), [], 'Docker alone without the flag is nothing');
  assert.deepEqual(readersFromEnv({ ...dockerVars, RUN_OBS_DOCKER: 'true' }), [], 'only the exact value 1 turns it on');
  const both = readersFromEnv({ ...es, ...dockerVars, RUN_OBS_DOCKER: '1' });
  assert.deepEqual(both.map((r) => r.name), ['elasticsearch', 'docker']);
  assert.deepEqual(both[1].containers, { pingfederate: 'pf', pinggateway: 'gw' });
  assert.deepEqual(readersFromEnv({ ...dockerVars, RUN_OBS_DOCKER: '1' }).map((r) => r.name), ['docker']);
  assert.deepEqual(readersFromEnv({ RUN_OBS_DOCKER: '1' }), [], 'the flag without containers or files is nothing');
  assert.deepEqual(readersFromEnv({ RUN_OBS_ES_URL: 'http://127.0.0.1:9200' }), [], 'a URL without the read key is nothing');
});

// ---- reader selection and collection -----------------------------------------------------------------------------------
test('selection: Elasticsearch first; Docker only when Elasticsearch fails for that product; both failing is "unreachable" with both reasons', async () => {
  const { d, reader, close } = await mkDocker();
  const doc = { '@timestamp': '2026-11-22T10:00:06.500Z', message: '[2026-11-22T10:00:06.500Z] WARN: tool call denied: insufficient scope' };
  let mode = 'ok';
  const es = await fakeEs(() => (mode === 'ok' ? esOk([hit(doc)]) : mode === 'empty' ? esOk([]) : [401, { error: 'no' }]));
  try {
    const esReader = new ElasticsearchReader({ url: es.url, apiKey: ESKEY });
    const layers = [{ layer: 'resource', products: ['mcp-server'] }];
    // the default path: Elasticsearch answers, Docker is never asked
    const first = await createRunObservability({ readers: [esReader, reader] }).collectRun({ ...RUN, layers });
    assert.equal(first.coverage.resource, 'logged'); assert.equal(first.rows[0].at, '2026-11-22T10:00:06.500Z');
    assert.equal(es.seen.length, 1); assert.equal(d.seen.length, 0, 'Docker was not asked');
    // Elasticsearch answered with nothing: that is an answer, not a failure, so no fallback
    mode = 'empty';
    const quiet = await createRunObservability({ readers: [esReader, reader] }).collectRun({ ...RUN, layers });
    assert.equal(quiet.coverage.resource, 'not-logged'); assert.equal(d.seen.length, 0);
    // Elasticsearch refuses the key: fall back to Docker for that product, and say so
    mode = 'denied';
    const fb = await createRunObservability({ readers: [esReader, reader] }).collectRun({ ...RUN, layers });
    assert.equal(d.seen.length, 1, 'the fallback asked Docker');
    assert.equal(fb.coverage.resource, 'logged'); assert.equal(fb.rows.find((r) => r.matcher === 'mcp-server-refused').at, '2026-11-22T10:00:07.000Z');
    assert.match(fb.reasons.resource, /read from docker after elasticsearch: Elasticsearch refused the read credential/, 'a fallback is never silent');
  } finally { es.close(); close(); }
  const dead = new DockerLogReader({ socketPath: path.join(os.tmpdir(), 'ro-none.sock'), containers: { pingfederate: 'pf' } });
  const none = await createRunObservability({ readers: [new ElasticsearchReader({ url: 'http://127.0.0.1:1', apiKey: ESKEY, timeoutMs: 300 }), dead] }).collectRun({ ...RUN, layers: [{ layer: 'person', products: ['pingfederate'] }] });
  assert.equal(none.coverage.person, 'unreachable');
  assert.match(none.reasons.person, /elasticsearch: Could not reach Elasticsearch/);
  assert.match(none.reasons.person, /docker: Docker socket not reachable/);
  assert.ok(!JSON.stringify(none).includes(ESKEY));
  assert.equal(none.rows.length, 0, 'an unreachable layer is not a not-logged row');
  assert.deepEqual(assertRunObservability(none), []);
});

test('no reader configured: every layer is unreachable and the reason says how to configure Elasticsearch (never silent, never an empty 200)', async () => {
  const bare = await createRunObservability({ readers: readersFromEnv({}) }).collectRun({ ...RUN, layers: defaultLayers() });
  for (const l of LAYERS) {
    assert.equal(bare.coverage[l], 'unreachable', l);
    assert.match(bare.reasons[l], /RUN_OBS_ES_URL and RUN_OBS_ES_READ_APIKEY/, l);
  }
  assert.deepEqual(assertRunObservability(bare), []);
  assert.equal(bare.rows.length, 0);
});

test('collectRun (real): six layers from real-shaped lines, time-ordered, exact timestamps, masked, tagged, coverage and summary honest', async () => {
  const { reader, close } = await mkDocker();
  try {
    const rec = await createRunObservability({ readers: [reader] }).collectRun({ ...RUN, layers: defaultLayers() });
    assert.deepEqual(assertRunObservability(rec), []);
    assert.equal(rec.source, 'real'); assert.equal(rec.excerpt, true);
    const logged = rec.rows.filter((r) => r.origin === 'logged');
    assert.deepEqual(logged.map((r) => r.at), [...logged.map((r) => r.at)].sort(), 'time order');
    for (const r of logged) assert.ok(Number.isFinite(Date.parse(r.at)) && r.atExact, `row ${r.id} has its log timestamp`);
    assert.equal(logged[0].atExact, '2026-11-22T10:00:01.120456789Z', 'the source timestamp is kept to the nanosecond');
    const by = (m) => logged.find((r) => r.matcher === m);
    assert.deepEqual([by('pf-audit').layer, by('pf-audit').outcome, by('pf-audit').basis, by('pf-audit').matchedBy], ['person', 'refused', 'measured-shape', 'id']);
    assert.equal(by('pf-audit').detail.ip, '<ip>');
    assert.deepEqual([by('p1az-decision').layer, by('p1az-decision').outcome], ['authorize', 'allowed']);
    assert.ok(logged.some((r) => r.matcher === 'p1az-decision' && r.outcome === 'info' && /held/.test(r.message)), 'permit with a human-approval obligation is a hold: info, not allowed');
    assert.equal(by('pinggateway-access').outcome, 'refused');
    assert.equal(by('pgw-aiguard-blocked').layer, 'privilege'); assert.equal(by('pgw-aiguard-blocked').outcome, 'blocked');
    assert.equal(by('pgw-policy-denied').outcome, 'refused');
    assert.equal(by('pgw-proxying').outcome, 'allowed');
    assert.equal(by('mcp-server-refused').basis, 'unverified-shape'); assert.equal(by('mcp-server-validation').basis, 'measured-shape');
    assert.ok(!logged.some((r) => /Success: principal/.test(r.message)), 'policy-evaluation noise is not a row');
    assert.equal(rec.coverage.person, 'logged'); assert.equal(rec.coverage.privilege, 'logged');
    assert.ok(!JSON.stringify(rec).includes('203.0.113.9'));
    assert.equal(rec.summary.info, rec.rows.filter((r) => r.origin !== 'not-logged' && r.outcome === 'info').length);
    for (const l of LAYERS) assert.ok(rec.coverage[l], `coverage names ${l}`);
  } finally { close(); }
});

test('collectRun: a layer with no matching line is not-logged and says so; a SaaS layer is not-logged with its reason; never an invented line', async () => {
  const { reader, close } = await mkDocker();
  try {
    const rec = await createRunObservability({ readers: [reader] }).collectRun({ ...RUN, layers: [{ layer: 'resource', products: ['mcp-server'] }, saasLayer('authorize'), { layer: 'person', products: ['pingfederate'] }] , correlation: {} });
    assert.equal(rec.coverage.authorize, 'not-logged'); assert.match(rec.reasons.authorize, /PingOne audit activity API/);
    const nl = rec.rows.find((r) => r.layer === 'authorize');
    assert.deepEqual([nl.origin, nl.at, nl.outcome], ['not-logged', null, 'info']);
    assert.equal(rec.summary.allowed + rec.summary.refused + rec.summary.blocked + rec.summary.info, rec.rows.filter((r) => r.origin !== 'not-logged').length, 'not-logged rows are not counted');
    const empty = await createRunObservability({ readers: [reader] }).collectRun({ ...RUN, startedAt: T1 - 2000, endedAt: T1 - 1000, layers: [{ layer: 'gateway', products: ['privilege-gateway'] }] });
    assert.equal(empty.coverage.gateway, 'not-logged'); assert.match(empty.reasons.gateway, /No matching line was found/);
    assert.deepEqual(assertRunObservability(empty), []);
  } finally { close(); }
});

test('collectRun: a decision the lab holds as an API response is a response row, never logged; coverage says response; logged still wins when a real line exists', async () => {
  const { reader, close } = await mkDocker();
  const decision = { at: '2026-11-22T10:00:02.500Z', product: 'PingOne Authorize', outcome: 'refused', message: `DENY for tool pay under policy staff-only, Authorization: Bearer ${JWT}`, detail: { policy: 'staff-only', client_secret: 'zz' } };
  try {
    const ro = createRunObservability({ readers: [reader] });
    const saas = await ro.collectRun({ ...RUN, layers: [saasLayer('authorize', [decision]), { layer: 'resource', products: ['mcp-server'] }] });
    assert.deepEqual(assertRunObservability(saas), []);
    const row = saas.rows.find((r) => r.layer === 'authorize');
    assert.deepEqual([row.origin, row.outcome, row.at, row.basis, row.matcher, row.matchedBy], ['response', 'refused', '2026-11-22T10:00:02.500Z', undefined, undefined, undefined]);
    assert.equal(saas.coverage.authorize, 'response');
    assert.ok(!JSON.stringify(saas).includes(JWT), 'a response row is masked too');
    assert.equal(saas.rows.filter((r) => r.origin === 'logged').every((r) => r.layer === 'resource'), true, 'no authorize row is logged');
    // products to read, nothing found in the logs, a response in hand: response (the read succeeded, so no unreachable claim either)
    const nothing = await ro.collectRun({ ...RUN, startedAt: T1 - 2000, endedAt: T1 - 1000, layers: [{ layer: 'authorize', products: ['pinggateway'], responses: [{ ...decision, at: '2026-11-22T10:00:08.500Z' }] }] });
    assert.equal(nothing.coverage.authorize, 'response');
    // a real P1AZ line is found as well: coverage is logged, and the response row stays a response row
    const both = await ro.collectRun({ ...RUN, layers: [{ layer: 'authorize', products: ['pinggateway'], responses: [decision] }] });
    assert.equal(both.coverage.authorize, 'logged');
    assert.equal(both.rows.filter((r) => r.origin === 'response').length, 1);
    assert.equal(both.rows.filter((r) => r.origin === 'logged').length, 3, 'the three P1AZ lines of the run');
    assert.deepEqual(assertRunObservability(both), []);
    assert.equal(both.summary.refused, both.rows.filter((r) => r.outcome === 'refused').length, 'a response decision is counted by its outcome');
    await assert.rejects(ro.collectRun({ ...RUN, layers: [saasLayer('authorize', [{ ...decision, at: 'nope' }])] }), (e) => e.code === 'bad_response_row');
  } finally { close(); }
  await assert.rejects(createRunObservability().collectRun({ runId: 'm', startedAt: T0, endedAt: T1, source: 'mock', layers: [saasLayer('authorize', [decision])] }), (e) => e.code === 'bad_response_row', 'a mock has no API responses');
  await assert.rejects(createRunObservability().collectRun({ runId: 'm', startedAt: T0, endedAt: T1, layers: [{ layer: 'person', products: [], simulated: [{ at: '2026-11-22T10:00:01Z', outcome: 'allowed', message: 'x' }] }] }), (e) => e.code === 'bad_simulated_row', 'a real run cannot hold simulated rows');
});

test('collectRun: ids only matched by the time window say so; ids matched by the run correlation say so', async () => {
  const { reader, close } = await mkDocker();
  try {
    const rec = await createRunObservability({ readers: [reader] }).collectRun({ ...RUN, layers: [{ layer: 'gateway', products: ['privilege-gateway'] }] });
    assert.equal(rec.rows.find((r) => r.matcher === 'pgw-policy-denied').matchedBy, 'id');
    assert.equal(rec.rows.find((r) => r.matcher === 'pgw-proxying').matchedBy, 'window');
  } finally { close(); }
});

test('collectRun (mock): simulated rows only, never logged; a layer the mock skipped is not-logged; a malformed simulated row is refused', async () => {
  const ro = createRunObservability();
  const rec = await ro.collectRun({ runId: 'm1', startedAt: T0, endedAt: T1, source: 'mock', layers: [
    { layer: 'person', simulated: [{ at: '2026-11-22T10:00:01Z', product: 'mock IdP', outcome: 'allowed', message: `signed in with ${JWT}`, detail: { client_secret: 'x', ip: '198.51.100.4' } }] },
    { layer: 'gateway', simulated: [{ at: '2026-11-22T10:00:00Z', outcome: 'blocked', message: 'blocked' }] },
    { layer: 'resource', reason: 'The mock has no resource server.' },
  ] });
  assert.deepEqual(assertRunObservability(rec), []);
  assert.deepEqual(rec.rows.filter((r) => r.origin !== 'not-logged').map((r) => r.origin), ['simulated', 'simulated']);
  assert.deepEqual(rec.rows.filter((r) => r.origin === 'simulated').map((r) => r.layer), ['gateway', 'person'], 'time-ordered');
  assert.equal(rec.coverage.person, 'simulated'); assert.equal(rec.coverage.resource, 'not-logged');
  const text = JSON.stringify(rec);
  assert.ok(!text.includes(JWT) && !text.includes('198.51.100.4'), 'a simulated row is masked too');
  await assert.rejects(ro.collectRun({ runId: 'm', startedAt: T0, endedAt: T1, source: 'mock', layers: [{ layer: 'person', simulated: [{ at: 'nope', outcome: 'allowed', message: 'x' }] }] }), (e) => e instanceof RunObsError && e.code === 'bad_simulated_row');
  await assert.rejects(ro.collectRun({ runId: 'm', startedAt: T1, endedAt: T0 }), (e) => e.code === 'bad_window');
  await assert.rejects(ro.collectRun({ runId: 'm', startedAt: 'x' }), (e) => e.code === 'bad_window');
  await assert.rejects(ro.collectRun({ runId: 'm', startedAt: T0, endedAt: T1, layers: ['nonsense'] }), (e) => e.code === 'bad_layer');
});

// ---- matchers: every one has a measured or UNVERIFIED label, and UNVERIFIED ones mark their rows ---------------------------
test('matchers: each is labelled; an UNVERIFIED matcher (or an unmeasured value) yields basis unverified-shape; DENY wording is unverified', () => {
  assert.ok(layerMatchers.every((m) => m.status === 'measured' || m.status === 'UNVERIFIED'));
  assert.deepEqual(layerMatchers.filter((m) => m.status === 'UNVERIFIED').map((m) => m.id).sort(), ['mcp-server-refused', 'mcp-server-served', 'siem-approval']);
  const deny = classify({ product: 'pinggateway', message: '[P1AZ] DECISION: DENY | sub=u | tool=t | method=tools/call | obligation=none' });
  assert.deepEqual([deny.outcome, deny.basis], ['refused', 'unverified-shape']);
  const ok = classify({ product: 'pingfederate', message: '/opt/out/instance/log/audit.log:  | tid:t1| trk| SSO| user-7| 1.2.3.4 | | | | h| IDP| success| | | 12' });
  assert.deepEqual([ok.layer, ok.outcome, ok.basis], ['person', 'allowed', 'unverified-shape']);
  const noSubject = classify({ product: 'pingfederate', message: '/opt/out/instance/log/audit.log:  | tid:t1| trk| OAuth| | 1.2.3.4 | | agent| OAuth20| h| AS| failure| | Invalid Client| 501' });
  assert.equal(noSubject.layer, 'agent');
  const aig = classify({ product: 'privilege-gateway', message: '{"msg":"AIGuard","level":"warning","Category":"prompt_injection","TopScore":0.99}' });
  assert.equal(aig.outcome, 'info', 'a verdict document does not say the call was blocked');
  assert.equal(classify({ product: 'promptguard', message: 'promptguard: 1 unit(s) -> Prompt-Guard flagged INJECTION (0.99)' }).outcome, 'info');
  assert.equal(classify({ product: 'privilege-gateway', message: 'level=info msg="[mcpgw] resolved host for app x: y"' }), null, 'unknown lines are dropped, not guessed');
  assert.equal(classify({ product: 'nonsense', message: 'anything' }), null);
});

// ---- assertRunObservability: the honesty rule as code --------------------------------------------------------------------
test('assertRunObservability accepts the fixtures and a real collection', () => {
  for (const [n, r] of Object.entries({ mockRecord, realRecord, longRecord, emptyRecord })) assert.deepEqual(assertRunObservability(r), [], n);
});

test('assertRunObservability fails: unmasked bearer, JWT, secret and address; logged without a timestamp; simulated presented as logged; info counted as passed', () => {
  const withRow = (base, row, over = {}) => ({ ...base, ...over, rows: [...base.rows, { id: 'x', layer: 'gateway', outcome: 'info', origin: 'logged', basis: 'measured-shape', at: '2026-11-22T10:00:05.000Z', message: 'm', ...row }] });
  const has = (r, re) => assert.ok(assertRunObservability(r).some((p) => re.test(p)), `${re}: ${assertRunObservability(r)}`);
  has(withRow(realRecord, { message: `Authorization: Bearer ${JWT}` }), /Bearer|JWT/);
  has(withRow(realRecord, { message: `got ${JWT}` }), /JWT/);
  has(withRow(realRecord, { message: `key ${SK}` }), /sk-/);
  has(withRow(realRecord, { detail: { note: 'client_secret=hunter2' } }), /secret-named/);
  has(withRow(realRecord, { message: 'from 203.0.113.9' }), /IPv4/);
  has(withRow(realRecord, { at: null }), /timestamp/);
  has(withRow(realRecord, { at: 'not a time' }), /timestamp/);
  has(withRow(realRecord, { origin: 'simulated', basis: undefined }), /real record cannot hold a simulated/);
  has(withRow(mockRecord, { origin: 'logged' }), /mock record cannot hold a logged/);
  has(withRow(mockRecord, { origin: 'simulated', basis: 'measured-shape' }), /presented as read from a log/);
  has({ ...mockRecord, coverage: { ...mockRecord.coverage, person: 'logged' } }, /mock record cannot say logged/);
  has({ ...realRecord, coverage: { ...realRecord.coverage, agent: 'logged' } }, /no logged row/);
  has({ ...realRecord, coverage: { ...realRecord.coverage, agent: 'unreachable' }, reasons: {} }, /needs a reason/);
  has(withRow(realRecord, { passed: true }), /info row is counted as passed/);
  has(withRow(mockRecord, { origin: 'response', basis: undefined }), /mock record cannot hold a response/);
  has(withRow(realRecord, { origin: 'response', basis: 'measured-shape' }), /response row is presented as read from a log/);
  has(withRow(realRecord, { origin: 'response', basis: undefined, matcher: 'p1az-decision' }), /response row is presented as read from a log/);
  has(withRow(realRecord, { origin: 'response', basis: undefined, at: null }), /response row needs the time/);
  has({ ...realRecord, coverage: { ...realRecord.coverage, gateway: 'response' } }, /says response but no response row/);
  has({ ...realRecord, coverage: { ...realRecord.coverage, authorize: 'logged' } }, /authorize says logged but no logged row/);
  has({ ...mockRecord, coverage: { ...mockRecord.coverage, person: 'response' } }, /mock record cannot say response/);
  has({ ...realRecord, summary: { ...realRecord.summary, allowed: realRecord.summary.allowed + 1 } }, /summary\.allowed/);
  has({ ...realRecord, excerpt: false }, /excerpt/);
  has({ ...realRecord, rows: [{ ...realRecord.rows[0], basis: 'guess' }] }, /basis/);
  has({ ...realRecord, rows: [{ ...realRecord.rows[5], at: '2026-11-22T10:00:05.000Z' }] }, /not-logged row has no log line/);
  assert.deepEqual(assertRunObservability(null), ['not an object']);
  assert.ok(assertRunObservability({ ...realRecord, rows: [null] }).some((p) => /not an object/.test(p)));
});

// ---- the pin ---------------------------------------------------------------------------------------------------------------
const PINNED = ['RunObservability.jsx', 'run-observability.css', 'run-observability.test.jsx', 'runObservability.js', 'fixtures.js'];
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pinProblems = (dir) => {
  const pin = Object.fromEntries(fs.readFileSync(path.join(HERE, 'run-observability.sha256'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => { const [h, f] = l.split(/\s+/); return [f, h]; }));
  return PINNED.filter((f) => pin[f] !== sha(path.join(dir, f)));
};

test('run-observability.sha256 pins every vendored file, and a modified copy fails the pin', () => {
  assert.deepEqual(pinProblems(HERE), [], 're-pin: shasum -a 256 RunObservability.jsx run-observability.css run-observability.test.jsx runObservability.js fixtures.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ropin-'));
  try {
    for (const f of PINNED) fs.copyFileSync(path.join(HERE, f), path.join(tmp, f));
    assert.deepEqual(pinProblems(tmp), [], 'an identical copy passes');
    fs.appendFileSync(path.join(tmp, 'runObservability.js'), '\n// edited in a lab\n');
    assert.deepEqual(pinProblems(tmp), ['runObservability.js']);
    fs.copyFileSync(path.join(HERE, 'runObservability.js'), path.join(tmp, 'runObservability.js'));
    fs.writeFileSync(path.join(tmp, 'run-observability.css'), `${fs.readFileSync(path.join(tmp, 'run-observability.css'), 'utf8')} `);
    assert.deepEqual(pinProblems(tmp), ['run-observability.css']);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('no real tenant, host or secret-looking literal is in the shared folder (only .example / .invalid hosts)', () => {
  for (const f of fs.readdirSync(HERE).filter((n) => /\.(js|mjs|jsx|css|md)$/.test(n))) {
    const text = fs.readFileSync(path.join(HERE, f), 'utf8');
    for (const url of text.match(/https?:\/\/[^\s'"`)]+/g) || []) { const host = /^https?:\/\/(?:[^/@]*@)?([^/:?#]+)/.exec(url)[1]; assert.ok(/(^|\.)(example|invalid|w3\.org)$|^(127\.0\.0\.1|localhost|<host>)$/.test(host), `${f}: ${url}`); }
    assert.ok(!new RegExp(`AKIA[0-9A-Z]{12}|ghp_[A-Za-z0-9]{20}|-----${'BEGIN'}`).test(text), f);
  }
});
