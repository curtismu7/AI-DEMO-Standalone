// shared/run-observability: the server module, against an in-process fake Docker socket and a fake Elasticsearch (no real network).
// Run: node --test shared/run-observability/*.test.mjs   (a glob, never a directory). The React panel's tests (vitest) run where it is vendored.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createMasker, createRunObservability, ReaderError, RunObsError, layerMatchers, classify, defaultLayers, saasLayer, assertRunObservability, LAYERS, LIMITS,
} from './runObservability.js';
import { DockerLogReader, ElasticsearchReader, readersFromEnv } from './runObservabilityReaders.js';
import { mockRecord, realRecord, longRecord, emptyRecord, partialRecord } from './fixtures.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T0 = Date.parse('2026-11-22T10:00:00Z'); const T1 = Date.parse('2026-11-22T10:00:09Z');
// Built from parts so no scanner reads a test value as a real credential.
const JWT = ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJ1c2VyLTcifQ', 'c2lnbmF0dXJlc2lnbmF0dXJl'].join('.');
const SK = ['sk', 'ant', 'FAKEFAKEFAKEFAKEFAKE'].join('-');
const ESKEY = ['read', 'only', 'test', 'value'].join('-');
const { mask, maskDeep } = createMasker();
const PW = ['abcdef', '123456'].join('');
const ESKEY2 = ['VnVhQ2Fm', 'WmdCOHhx', 'dEdEdTRt'].join('');

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
  '2026-11-22T10:00:03.000000000Z [vert.x-eventloop-thread-1] INFO  o.f.o.f.S.P1AZDecision @00-mcp-olb-jwks - INDETERMINATE - HITL challenge ch-12345 minted for tool=pay_tuition_balance',
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
    assert.equal(es.seen[0].body.sort[0]['@timestamp'].order, 'desc', 'newest first, so a cut drops the start of the run');
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
  assert.deepEqual(none.rows.map((r) => r.layer).sort(), ['agent', 'authorize', 'gateway', 'privilege', 'resource'], 'the layers the lab did not ask for are not-logged; an unreachable layer is not a not-logged row');
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
  const deny = classify({ product: 'pinggateway', message: '[vert.x-eventloop-thread-1] INFO  o.f.o.f.S.P1AZDecision @00-mcp-olb-jwks - [P1AZ] DECISION: DENY | sub=u | tool=t | method=tools/call | obligation=none' });
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
  for (const [n, r] of Object.entries({ mockRecord, realRecord, longRecord, emptyRecord, partialRecord })) assert.deepEqual(assertRunObservability(r), [], n);
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

test('no real tenant, host or secret-looking literal is in the shared folder (only .example / .invalid hosts)', () => {
  for (const f of fs.readdirSync(HERE).filter((n) => /\.(js|mjs|jsx|css|md)$/.test(n))) {
    const text = fs.readFileSync(path.join(HERE, f), 'utf8');
    for (const url of text.match(/https?:\/\/[^\s'"`)]+/g) || []) { const host = /^https?:\/\/(?:[^/@]*@)?([^/:?#]+)/.exec(url)[1]; assert.ok(!host.includes('.') || /(^|\.)(example|invalid|w3\.org)$|^(127\.0\.0\.1|localhost|<host>)$/.test(host), `${f}: ${url}`); }
    assert.ok(!new RegExp(`AKIA[0-9A-Z]{12}|ghp_[A-Za-z0-9]{20}|-----${'BEGIN'}`).test(text), f);
  }
});

// ======================================================================================================================
// Regressions from the independent review (each failed on the first version of this folder).
// ======================================================================================================================
const PRE = '[vert.x-eventloop-thread-1] INFO  o.f.o.f.S.P1AZDecision @00-mcp-olb-jwks - ';
const cls = (product, message) => classify({ product, message, at: 0 });
const ACCESS = (path, code = '200') => JSON.stringify({ eventName: 'OPENIG-HTTP-ACCESS', response: { status: 'FAILED', statusCode: code }, http: { request: { method: 'POST', path } }, ig: { routeName: 'r' } });
const lineReader = (lines, extra = {}) => ({ name: 'stub', canRead: () => true, readLines: async ({ product, match }) => ({ lines: lines.filter((l) => l.product === product && (!match || match(l))), truncated: false, ...extra }) });
const stub = (product, message, at = T0 + 1000, atExact = new Date(at).toISOString()) => ({ product, message, at, atExact });
const collectWith = (readers, o = {}) => createRunObservability({ readers, ...(o.matchers ? { matchers: o.matchers } : {}) }).collectRun({ ...RUN, ...o });

test('regression 1: request text cannot fabricate a decision (matchers are anchored; JSON lines are read through their fields only)', () => {
  // an access line whose PATH carries a P1AZ decision is one access line, not an Authorize permit
  const a = cls('pinggateway', ACCESS('/x [P1AZ] DECISION: PERMIT | tool=a', '401'));
  assert.deepEqual([a.layer, a.outcome, a.matcher], ['gateway', 'refused', 'pinggateway-access']);
  assert.equal(classify({ product: 'pinggateway', message: ACCESS('/x [P1AZ] DECISION: PERMIT | tool=a') }).layer, 'gateway');
  // a text line that merely CONTAINS the decision text is not a decision
  assert.equal(cls('pinggateway', 'GET /x?a=[P1AZ] DECISION: PERMIT | tool=evil HTTP/1.1'), null);
  assert.equal(cls('pinggateway', '[P1AZ] DECISION: PERMIT | tool=evil'), null, 'without the logback prefix it is not the gateway log line');
  assert.equal(cls('pinggateway', `${PRE}user said [P1AZ] DECISION: PERMIT`), null);
  // a newline in a tool name starts a "new log line" with attacker text: it has no logback prefix, so it is dropped
  assert.equal(cls('pinggateway', 'INDETERMINATE - HITL challenge x minted for tool=y'), null);
  assert.equal(cls('pinggateway', `${PRE}INDETERMINATE - HITL challenge c1 minted for tool=t`).matcher, 'p1az-hitl');
  // the Privilege gateway: the message body is the typed text, the decision is only the whole message
  assert.equal(cls('privilege-gateway', 'level=info msg="user said Proxying to: http://x"'), null);
  assert.equal(cls('privilege-gateway', 'level=info msg="user said: aiguard: blocked mcp response client=a category=b"'), null);
  assert.equal(cls('privilege-gateway', 'level=info msg="x" level=info msg="Proxying to: http://x"'), null);
  assert.equal(cls('privilege-gateway', 'level=info msg="Proxying to: http://x"').outcome, 'allowed');
  assert.equal(cls('privilege-gateway', 'level=info msg="Proxying to: http://x" extra'), null);
  assert.equal(cls('privilege-gateway', '{"msg":"user said MCP policy denied"}'), null, 'a JSON doc is read through its msg field, exactly');
  // other products
  assert.equal(cls('promptguard', 'note: promptguard: 1 unit(s) -> allow'), null);
  assert.equal(cls('mcp-server', 'GET /?x=[t] ERROR: tool call denied'), null);
  assert.equal(cls('pingfederate', 'GET /x?q=| tid:a| b| OAuth| u| 1.2.3.4 | | c| p| h| AS| failure| | d| 5'), null);
  // JSON lines skip text matchers, text lines skip JSON matchers
  assert.equal(cls('pinggateway', JSON.stringify({ note: `${PRE}[P1AZ] DECISION: PERMIT | tool=a` })), null);
});

test('regression 1b: injected text in real lines produces no logged row end to end', async () => {
  const lines = [
    stub('pinggateway', ACCESS('/x [P1AZ] DECISION: PERMIT | tool=a', '401')),
    stub('privilege-gateway', 'level=info msg="user said Proxying to: http://x"'),
    stub('privilege-gateway', 'level=warning msg="user said: aiguard: blocked mcp response client=a category=b"'),
  ];
  const rec = await collectWith([lineReader(lines)], { layers: defaultLayers() });
  assert.deepEqual(rec.rows.filter((r) => r.origin === 'logged').map((r) => [r.layer, r.outcome]), [['gateway', 'refused']]);
  assert.equal(rec.coverage.authorize, 'not-logged'); assert.equal(rec.coverage.privilege, 'not-logged');
});

test('regression 2: only DENY is a refusal; other decisions are information; a 2xx access line does not say allowed; rejection wording on the MCP server is refused', () => {
  for (const d of ['INDETERMINATE', 'NOT_APPLICABLE', 'ERROR']) {
    const r = cls('pinggateway', `${PRE}[P1AZ] DECISION: ${d} | tool=x | method=tools/call`);
    assert.deepEqual([r.outcome, r.basis], ['info', 'unverified-shape'], d);
  }
  assert.equal(cls('pinggateway', `${PRE}[P1AZ] DECISION: DENY | tool=x`).outcome, 'refused');
  assert.equal(cls('pinggateway', ACCESS('/mcp', '200')).outcome, 'info');
  assert.match(cls('pinggateway', ACCESS('/mcp', '200')).message, /does not show the MCP result/);
  assert.equal(cls('pinggateway', ACCESS('/mcp', '403')).outcome, 'refused');
  for (const m of ['token validation failed: signature invalid', 'token expired', 'audience mismatch, rejecting', 'invalid token', 'request rejected']) {
    const r = cls('mcp-server', `[2026-01-01T00:00:00Z] ERROR: ${m}`);
    assert.deepEqual([r.outcome, r.basis], ['refused', 'unverified-shape'], m);
  }
  assert.deepEqual([cls('mcp-server', '[t] INFO: token audience validated').outcome, cls('mcp-server', '[t] INFO: token audience validated').basis], ['info', 'measured-shape']);
});

test('regression 3: a hostile timestamp never reaches the record; atExact is ISO, capped and masked, for every origin', async () => {
  const evil = `Sun Nov 22 2026 10:00:02 GMT+0000 (Bearer abcdef1234567890 ${'x'.repeat(5000)})`;
  assert.ok(Number.isFinite(Date.parse(evil)), 'V8 really does accept a parenthesised comment');
  const es = await fakeEs(() => esOk([
    hit({ '@timestamp': evil, message: `${PRE}[P1AZ] DECISION: PERMIT | tool=t | sub=u1` }),
    hit({ '@timestamp': '2026-11-22T10:00:03.000Z', message: `${PRE}[P1AZ] DECISION: PERMIT | tool=t | sub=u2` }),
  ]));
  try {
    const rec = await collectWith([new ElasticsearchReader({ url: es.url, apiKey: ESKEY })], { layers: ['authorize'] });
    assert.equal(rec.rows.filter((r) => r.origin === 'logged').length, 1, 'the document with a non-ISO timestamp is skipped, not guessed');
    assert.ok(!JSON.stringify(rec).includes('Bearer abcdef'));
    assert.deepEqual(assertRunObservability(rec), []);
  } finally { es.close(); }
  // a reader that hands the core a hostile atExact: the core rebuilds it from the number
  const rec = await collectWith([lineReader([stub('pinggateway', `${PRE}[P1AZ] DECISION: PERMIT | tool=t`, T0 + 2000, evil)])], { layers: ['authorize'] });
  assert.equal(rec.rows[0].atExact, '2026-11-22T10:00:02.000Z');
  // simulated and response rows: epoch ms or ISO are accepted, the text form is always ISO
  const mock = await createRunObservability().collectRun({ runId: 'm', startedAt: T0, endedAt: T1, source: 'mock', layers: [{ layer: 'person', simulated: [{ at: T0 + 500, outcome: 'allowed', message: 'epoch' }, { at: evil, outcome: 'allowed', message: 'weird' }] }] });
  assert.deepEqual(mock.rows.filter((r) => r.origin === 'simulated').map((r) => r.atExact), ['2026-11-22T10:00:00.500Z', '2026-11-22T10:00:02.000Z']);
  // the contract check covers the timestamp text too
  const bad = { ...realRecord, rows: [{ ...realRecord.rows[0], atExact: 'Bearer abcdef1234567890' }, ...realRecord.rows.slice(1)] };
  assert.ok(assertRunObservability(bad).some((p) => /Bearer/.test(p)));
});

test('regression 4a: masker gaps (token=, session_id=, sid=, pwd=, pass=, secret_key=, amz header, xoxb, escaped quotes, format characters in a JWT)', () => {
  const ZW = String.fromCharCode(0x200b);
  const cases = [
    ['GET /cb?token=abc12345def&state=xyz', 'abc12345def'], ['session_id=abcdef123456 sid=ZZZZ1234', 'abcdef123456'], ['sid=ZZZZ1234', 'ZZZZ1234'],
    ['password:hunter2', 'hunter2'], ['pass=hunter2 pwd=hunter3 secret_key=abcd1234', 'hunter2'], ['pwd=hunter3', 'hunter3'], ['secret_key=abcd1234', 'abcd1234'],
    ['x-amz-security-token: AQoDYXdzEJr', 'AQoDYXdzEJr'], [['xoxb', '1234567890', 'abcdefgh'].join('-'), 'abcdefgh'],
    ['{"client_secret":"abc\\"def-rest-of-secret"}', 'rest-of-secret'], ['client_secret: "abc\\"def ghi"', 'ghi'], ['client_secret = "has space and ; stuff"', 'stuff'],
    [`ey${ZW}JhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig`, 'hbGciOiJIUzI1NiJ9'], ['eyJhbGciOiJIUzI1NiJ9 . eyJzdWIiOiIxMjM0NTY3ODkw', 'eyJhbGci'],
    [`access_token = ${JWT}`, 'eyJhbGci'], [`ES_READ_APIKEY=${ESKEY2}`, ESKEY2.slice(0, 8)],
    ['ApiKey Zm9vOmJhcg== in header', 'Zm9vOmJhcg'], ['Authorization: ApiKey Zm9vYmFyYmF6Og==', 'Zm9vYmFy'], ['Bearer abcdef123456', 'abcdef123456'], ['Bearer\nabcdef123456', 'abcdef123456'],
    ['Basic dXNlcjpwYXNzd29yZA==', 'dXNlcjpwYXNz'], ['Basic cGFzc3dvcmQ=', 'cGFzc3dvcmQ'], ['basic dXNlcjpwYXNz', 'dXNlcjpwYXNz'], ['BEARER abcdef123456', 'abcdef123456'],
    ['refresh_token\n   abcdefghijkl', 'abcdefghijkl'], [`{"token":"${PW}"}`, PW], [['gh', 'p_abcdefghijklmnopqrstuvwxyz0123456789'].join(''), 'abcdefghijklmnopqrstuvwxyz'],
    [['AK', 'IAIOSFODNN7EXAMPLE'].join(''), 'IOSFODNN7'],
  ];
  for (const [input, secret] of cases) assert.ok(!mask(input).includes(secret), `${JSON.stringify(input)} leaked ${secret}: ${mask(input)}`);
  // and the contract check flags each of them when a lab forgot to mask
  const base = { ...realRecord };
  const leak = (m) => assertRunObservability({ ...base, rows: [{ ...base.rows[0], message: m }, ...base.rows.slice(1)] }).some((p) => /holds/.test(p));
  for (const m of ['token=abc12345def', 'session_id=abcdef123456', 'sid=ZZZZ1234', 'pwd=hunter3', 'pass=hunter2', 'secret_key=abcd1234', 'x-amz-security-token: AQoDYXdzEJr', 'ApiKey abcdefghijkl', 'Basic dXNlcjpwYXNz', 'Authorization: Basic Zm9vOmJhcg==', 'fe80::1', '2001:db8::1', 'user@x.com', 'db.corp.example.com', 'refresh_token=abc12345']) assert.ok(leak(m), `assertRunObservability missed ${m}`);
});

test('regression 4b: masking does not hide why something failed (Basic Authentication failed, bearer token expired, client_secret_basic)', () => {
  assert.equal(mask('Basic Authentication failed'), 'Basic Authentication failed');
  assert.equal(mask('bearer token expired'), 'bearer token expired');
  assert.equal(mask('Bearer token missing'), 'Bearer token missing');
  assert.equal(mask('client_secret_basic ok'), 'client_secret_basic ok');
  assert.equal(mask('max_tokens=16 PromptTokens: 22'), 'max_tokens=16 PromptTokens: 22');
  assert.equal(mask('session closed'), 'session closed');
  assert.deepEqual(assertRunObservability({ ...realRecord, rows: [{ ...realRecord.rows[0], message: 'Basic Authentication failed; bearer token expired' }, ...realRecord.rows.slice(1)] }), []);
  for (const s of ['a-'.repeat(50000), `${'a_'.repeat(50000)}secret=x`, 'token='.repeat(20000), `${'1.'.repeat(30000)}x`]) { const t0 = Date.now(); mask(s); assert.ok(Date.now() - t0 < 1500); }
});

test('regression 5a: the row cap drops the OLDEST rows, keeps every layer, rebuilds coverage and counts the not-logged rows', async () => {
  const old = LIMITS.maxRows; LIMITS.maxRows = 50;
  try {
    const sim = Array.from({ length: 80 }, (_, i) => ({ at: T0 + i * 10, outcome: 'info', message: `m${i}` }));
    const rec = await createRunObservability().collectRun({ runId: 'c', startedAt: T0, endedAt: T1, source: 'mock', layers: [
      { layer: 'person', simulated: sim }, { layer: 'resource', simulated: [{ at: T0 + 5000, outcome: 'refused', message: 'late' }] }, { layer: 'authorize' }] });
    assert.equal(rec.truncated, true); assert.ok(rec.rows.length <= 50, `${rec.rows.length} rows`);
    assert.ok(rec.rows.some((r) => r.layer === 'resource'), 'the other layer keeps its row');
    assert.equal(rec.coverage.resource, 'simulated'); assert.equal(rec.coverage.authorize, 'not-logged');
    const persons = rec.rows.filter((r) => r.layer === 'person');
    assert.equal(persons.at(-1).message, 'm79', 'the newest row survives'); assert.ok(!persons.some((r) => r.message === 'm0'), 'the oldest row is the one dropped');
    assert.deepEqual(assertRunObservability(rec), []);
  } finally { LIMITS.maxRows = old; }
  // a cap too small for every layer: the layer that lost every row is not-logged and says so, never "simulated" with no row
  LIMITS.maxRows = 4;
  try {
    const one = (layer) => ({ layer, simulated: [{ at: T0 + 100, outcome: 'allowed', message: layer }] });
    const rec = await createRunObservability().collectRun({ runId: 'c', startedAt: T0, endedAt: T1, source: 'mock', layers: [one('person'), one('gateway'), one('resource'), one('privilege')] });
    assert.ok(rec.rows.length <= 6, `${rec.rows.length} rows (the not-logged rows are always kept)`);
    for (const l of ['person', 'gateway', 'resource', 'privilege']) assert.equal(rec.coverage[l] === 'simulated', rec.rows.some((r) => r.layer === l && r.origin === 'simulated'), l);
    assert.ok(Object.values(rec.coverage).includes('not-logged'));
    assert.deepEqual(assertRunObservability(rec), []);
  } finally { LIMITS.maxRows = old; }
  // placeholders appended after the cap used to make 506 rows
  const rec = await createRunObservability().collectRun({ runId: 'c', startedAt: T0, endedAt: T1, source: 'mock', layers: [{ layer: 'person', simulated: Array.from({ length: 600 }, (_, i) => ({ at: T0 + i, outcome: 'info', message: 'm' })) }, ...['agent', 'authorize', 'privilege', 'gateway', 'resource'].map((layer) => ({ layer }))] });
  assert.ok(rec.rows.length <= 500, `${rec.rows.length} rows`);
});

test('regression 5b: Elasticsearch cut at its cap says absence is not proof (partial), asks newest first, and the file reader says when it read only the tail', async () => {
  const noise = Array.from({ length: 500 }, (_, i) => hit({ '@timestamp': new Date(T1 - i * 10).toISOString(), message: `noise ${i}` }));
  const es = await fakeEs(() => esOk(noise));
  try {
    const rec = await collectWith([new ElasticsearchReader({ url: es.url, apiKey: ESKEY })], { layers: ['authorize'] });
    assert.equal(rec.coverage.authorize, 'not-logged'); assert.equal(rec.partial.authorize, true); assert.equal(rec.truncated, true);
    assert.match(rec.reasons.authorize, /cut at the cap, so absence is not proof/);
    assert.equal(es.seen[0].body.sort[0]['@timestamp'].order, 'desc');
    assert.deepEqual(assertRunObservability(rec), []);
    assert.ok(assertRunObservability({ ...rec, reasons: { ...rec.reasons, authorize: 'No matching line was found.' } }).some((p) => /not proof/.test(p)));
  } finally { es.close(); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotail-'));
  try {
    const file = path.join(dir, 'cyon.log');
    const pad = `time="2026-11-22T10:00:08Z" level=info msg="padding ${'p'.repeat(200)}"\n`;
    fs.writeFileSync(file, `time="2026-11-22T10:00:01Z" level=info msg="Proxying to: http://early.lab.example"\n${pad.repeat(Math.ceil(2_100_000 / pad.length))}`);
    const rec = await collectWith([new DockerLogReader({ files: { 'privilege-gateway': file } })], { layers: ['gateway'] });
    assert.equal(rec.coverage.gateway, 'not-logged'); assert.equal(rec.truncated, true);
    assert.match(rec.reasons.gateway, /only the last \d+ bytes of the log file were read/); assert.match(rec.reasons.gateway, /not proof/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('regression 5c: Docker/file readers keep the NEWEST lines when more match than the cap', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rocap-'));
  try {
    const file = path.join(dir, 'g.log');
    fs.writeFileSync(file, Array.from({ length: 2300 }, (_, i) => `time="${new Date(T0 + 1000 + i).toISOString()}" level=info msg="Proxying to: http://b${i}.lab.example"`).join('\n'));
    const out = await new DockerLogReader({ files: { g: file } }).readLines({ product: 'g', from: T0, to: T1 });
    assert.equal(out.truncated, true); assert.equal(out.lines.length, LIMITS.maxLines);
    assert.match(out.lines.at(-1).message, /b2299/); assert.ok(!out.lines.some((l) => /b0\.lab/.test(l.message)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('regression 6: correlation ids match whole tokens of 6 or more characters only', async () => {
  const lines = [
    stub('pingfederate', '/opt/out/instance/log/audit.log:  | tid:t1| trk| OAuth| user| 1.2.3.4 | | c1| p| h| AS| failure| | bad password for user bob| 3'),
    stub('privilege-gateway', 'level=info msg="[mcpgw] policy denied alice-7 access to mcp app banking (agent=true)"'),
    stub('privilege-gateway', 'level=info msg="[mcpgw] policy denied xalice-7y access to mcp app banking (agent=true)"'),
    stub('privilege-gateway', 'level=info msg="[mcpgw] policy denied alice-72 access to mcp app banking (agent=true)"'),
  ];
  const rec = await collectWith([lineReader(lines)], { layers: ['person', 'gateway'], correlation: { sub: 'user', actClientId: 'demo', traceId: 'alice-7' } });
  assert.deepEqual(rec.rows.filter((r) => r.origin === 'logged').map((r) => r.matchedBy), ['window', 'id', 'window', 'window'], 'short "user" and "demo" match nothing; alice-7 matches only as a whole token');
});

test('regression 7: assertRunObservability needs all six layers and a summary, and every coverage tag must be exactly what the rows support', () => {
  const has = (r, re) => assert.ok(assertRunObservability(r).some((p) => re.test(p)), `${re}: ${assertRunObservability(r)}`);
  has({ ...realRecord, coverage: { person: 'logged' } }, /coverage names no state for layer agent/);
  has({ ...realRecord, summary: undefined }, /summary is missing/);
  has({ ...realRecord, coverage: { ...realRecord.coverage, person: 'not-logged' }, reasons: { ...realRecord.reasons, person: 'none' } }, /person says not-logged but a logged row exists/);
  has({ ...realRecord, coverage: { ...realRecord.coverage, authorize: 'not-logged' }, reasons: { ...realRecord.reasons, authorize: 'none' } }, /authorize says not-logged but a response row exists/);
  has({ ...realRecord, coverage: { ...realRecord.coverage, person: 'unreachable' }, reasons: { ...realRecord.reasons, person: 'down' } }, /person says unreachable but a logged row exists/);
  has({ ...realRecord, coverage: { ...realRecord.coverage, privilege: 'response' } }, /privilege says response but no response row exists/);
  has({ ...mockRecord, coverage: { ...mockRecord.coverage, authorize: 'simulated' }, reasons: {} }, /authorize says simulated but no simulated row exists/);
  has({ ...realRecord, coverage: { ...realRecord.coverage, agent: 'not-logged' }, rows: realRecord.rows.filter((r) => r.id !== 'n-agent') }, /agent says not-logged but there is no not-logged row/);
  // a layer with both a logged and a response row is logged (the logged row wins), and response there is refused
  const both = { ...realRecord, rows: [...realRecord.rows, { id: 'x', at: '2026-11-22T10:00:05.000Z', layer: 'authorize', product: 'p', outcome: 'allowed', message: 'm', origin: 'logged', basis: 'measured-shape' }], summary: { ...realRecord.summary, allowed: realRecord.summary.allowed + 1 } };
  has(both, /authorize says response but the rows support logged/);
});

test('regression 8: epoch milliseconds are accepted for simulated and response rows, like the window', async () => {
  const ro = createRunObservability();
  const rec = await ro.collectRun({ runId: 'e', startedAt: 1700000000000, endedAt: 1700000100000, source: 'mock', layers: [{ layer: 'person', simulated: [{ at: 1700000000500, outcome: 'allowed', message: 'x' }] }] });
  assert.equal(rec.rows[0].at, '2023-11-14T22:13:20.500Z');
  const real = await createRunObservability({ readers: [] }).collectRun({ runId: 'e', startedAt: 1700000000000, endedAt: 1700000100000, layers: [saasLayer('authorize', [{ at: 1700000000500, outcome: 'allowed', message: 'PERMIT' }])] });
  assert.equal(real.rows.find((r) => r.origin === 'response').at, '2023-11-14T22:13:20.500Z');
  await assert.rejects(ro.collectRun({ runId: 'e', startedAt: 1700000000000, endedAt: 1700000100000, source: 'mock', layers: [{ layer: 'person', simulated: [{ at: 1700000000500, outcome: 'allowed', message: { not: 'a string' } }] }] }), (e) => e.code === 'bad_simulated_row');
});

test('regression 9 (nits): a slow-drip Elasticsearch body is es_timeout, never a raw DOMException; the key is never in an error; a file failure is named before the container fallback', async () => {
  let mode = 'drip';
  const es = await fakeEs(() => [200, '{}']);
  es.server.removeAllListeners('request');
  es.server.on('request', (req, res) => {
    if (mode === 'drip') { res.writeHead(200, { 'content-type': 'application/json' }); const t = setInterval(() => res.write(' '), 20); res.on('close', () => clearInterval(t)); return; }
    res.writeHead(400); res.end(JSON.stringify({ error: { reason: `bad key ${req.headers.authorization}` } }));
  });
  try {
    const r = new ElasticsearchReader({ url: es.url, apiKey: ESKEY, timeoutMs: 300 });
    await assert.rejects(r.readLines({ product: 'pinggateway', from: T0, to: T1 }), (e) => e instanceof ReaderError && e.code === 'es_timeout');
    mode = 'err';
    await assert.rejects(r.readLines({ product: 'pinggateway', from: T0, to: T1 }), (e) => e.code === 'es_error' && !e.message.includes(ESKEY));
  } finally { es.server.closeAllConnections(); es.close(); }
  const { reader, close } = await mkDocker();
  try {
    const mixed = new DockerLogReader({ socketPath: reader.socketPath, containers: { 'mcp-server': 'mcp-server' }, files: { 'mcp-server': path.join(os.tmpdir(), 'ro-no-such.log') } });
    const rec = await collectWith([mixed], { layers: [{ layer: 'resource', products: ['mcp-server'] }] });
    assert.equal(rec.coverage.resource, 'logged');
    assert.match(rec.reasons.resource, /the log file was not used \(The log file for mcp-server is not readable/);
  } finally { close(); }
});

test('lab matchers: run after the built-ins, anchored, declared (layer, product, basis), can never invent a row or choose an origin', async () => {
  const lab = { id: 'lab-decision', product: 'banking-mcp', layer: 'resource', basis: 'measured-shape', pattern: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z lab decision actor=(\S+) outcome=(allowed|refused)$/, build: (m) => ({ outcome: m[2], message: `The lab decided ${m[2]} for ${m[1]}`, origin: 'simulated', layer: 'person', detail: { actor: m[1] } }) };
  const lines = [
    stub('banking-mcp', '2026-11-22T10:00:03Z lab decision actor=user-7 outcome=refused', T0 + 3000),
    stub('banking-mcp', 'a caller wrote 2026-11-22T10:00:03Z lab decision actor=x outcome=allowed', T0 + 3500),
    stub('banking-mcp', '{"x":"2026-11-22T10:00:03Z lab decision actor=x outcome=allowed"}', T0 + 3600),
  ];
  const rec = await collectWith([lineReader(lines)], { layers: [{ layer: 'resource', products: ['banking-mcp'] }], matchers: [lab] });
  assert.equal(rec.rows.filter((r) => r.origin === 'logged').length, 1);
  const row = rec.rows.find((r) => r.origin === 'logged');
  assert.deepEqual([row.layer, row.outcome, row.basis, row.matcher, row.origin], ['resource', 'refused', 'measured-shape', 'lab-decision', 'logged']);
  assert.deepEqual(assertRunObservability(rec), []);
  // no line, no row; and a mock never reads logs
  const none = await collectWith([lineReader([])], { layers: [{ layer: 'resource', products: ['banking-mcp'] }], matchers: [lab] });
  assert.equal(none.rows.some((r) => r.origin === 'logged'), false); assert.equal(none.coverage.resource, 'not-logged');
  const mock = await createRunObservability({ matchers: [lab] }).collectRun({ runId: 'm', startedAt: T0, endedAt: T1, source: 'mock', layers: [{ layer: 'resource' }] });
  assert.equal(mock.rows.some((r) => r.origin === 'logged'), false);
  // built-in lines are still classified by the built-ins first
  assert.equal(classify({ product: 'privilege-gateway', message: 'level=info msg="Proxying to: http://x"' }, [{ ...lab, product: 'privilege-gateway', pattern: /^level=info msg="Proxying to: (\S+)"$/, build: () => ({ outcome: 'refused', message: 'lab' }) }]).matcher, 'pgw-proxying');
  const bad = (m) => assert.throws(() => createRunObservability({ matchers: [m] }), (e) => e instanceof RunObsError && e.code === 'bad_matcher');
  bad({ ...lab, pattern: /lab decision/ }); bad({ ...lab, pattern: /lab decision$/ }); bad({ ...lab, pattern: /^lab decision/ }); bad({ ...lab, pattern: /^lab decision$/m });
  bad({ ...lab, basis: undefined }); bad({ ...lab, basis: 'measured' }); bad({ ...lab, layer: 'nope' }); bad({ ...lab, product: '' }); bad({ ...lab, id: 'pgw-proxying' }); bad({ ...lab, build: undefined }); bad({ ...lab, pattern: 'x' });
  assert.throws(() => createRunObservability({ matchers: [lab, lab] }), (e) => e.code === 'bad_matcher');
  assert.throws(() => createRunObservability({ matchers: 'x' }), (e) => e.code === 'bad_matcher');
});

test('the core has no imports, no network and no file access (a lab with no log reader vendors only it and exempts nothing); the readers import only the core', () => {
  const core = fs.readFileSync(path.join(HERE, 'runObservability.js'), 'utf8');
  assert.ok(!/^\s*import\s/m.test(core), 'no import statements');
  assert.ok(!/\bfetch\s*\(|socketPath|node:|require\(|child_process|XMLHttpRequest|WebSocket/.test(core), 'no network, socket, node: module or process spawning in the core');
  const readers = fs.readFileSync(path.join(HERE, 'runObservabilityReaders.js'), 'utf8');
  assert.deepEqual([...readers.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]).sort(), ['./runObservability.js', 'node:fs/promises', 'node:http']);
});
