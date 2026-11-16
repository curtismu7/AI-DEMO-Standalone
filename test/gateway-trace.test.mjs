// shared/gateway-trace + the wire capture in shared/gateway-real, against a local fake gateway.
// The React panel's own tests (shared/gateway-trace/gateway-trace.test.jsx, vitest) run where the folder is vendored.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { doorConfig, createRealDoor, wireRequestHeaders, wireResponseHeaders, MAX_CAPTURED_BODY } from '../shared/gateway-real/gatewayClient.js';
import { mockTrace, realTrace, failureTrace, traceFromDoor, assertTrace, realDecisions, bearerForDisplay } from '../shared/gateway-trace/gatewayTrace.js';

const shared = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared');
const GOOD = 'GOODKEY1234567', BAD = 'BADKEY12345678', DENY = 'DENYKEY1234567';
const SESSION = 'abcdef1234567890session';

// A fake Privilege door: every reply carries a Set-Cookie (must never be captured); errors echo the key (must be scrubbed).
function fakeGateway() {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const key = String(req.headers.authorization || '').replace(/^Bearer /, '');
      seen.push({ method: req.method, key });
      res.setHeader('set-cookie', 'sid=SECRETCOOKIE; HttpOnly');
      if (req.method === 'DELETE') { res.statusCode = 200; return res.end(); }
      const msg = raw ? JSON.parse(raw) : {};
      if (key === BAD) { res.statusCode = 401; res.setHeader('content-type', 'text/plain'); return res.end(`invalid virtual key ${key}`); }
      if (key === DENY && msg.method === 'tools/list') { res.statusCode = 403; res.setHeader('content-type', 'text/plain'); return res.end(`Forbidden for ${key}`); }
      res.setHeader('mcp-session-id', SESSION);
      res.setHeader('x-request-id', 'req-123');
      if (msg.method === 'notifications/initialized') { res.statusCode = 202; return res.end(); }
      res.setHeader('content-type', 'application/json');
      if (msg.method === 'initialize') return res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'fake' }, capabilities: {} } }));
      if (msg.method === 'tools/list') return res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'whoami', description: 'who' }, { name: 'echo', description: 'e' }] } }));
      if (msg.method === 'tools/call') return res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'hello' }] } }));
      res.statusCode = 404; return res.end();
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, port: server.address().port })));
}

const settings = (port) => `T_GW_URL=http://127.0.0.1:${port}\nT_GW_APPS=demo\nT_GW_KEY_GOOD=${GOOD}\nT_GW_KEY_BAD=${BAD}\nT_GW_KEY_DENY=${DENY}\n`;
const doorFor = (port, capture) => createRealDoor({ config: doorConfig(settings(port), 'T'), capture });
const everything = (v) => JSON.stringify(v);

test('capture off (the default): results have no wire field and the same shape as before', async () => {
  const { server, port } = await fakeGateway();
  try {
    const r = await doorFor(port).list('demo', 'good');
    assert.deepEqual(Object.keys(r).sort(), ['ms', 'ok', 'serverInfo', 'tools']);
    assert.equal(r.ok, true);
    const bad = await doorFor(port).list('demo', 'bad');
    assert.deepEqual(Object.keys(bad).sort(), ['ms', 'ok', 'refusal']);
    assert.equal(bad.refusal.layer, 'key');
  } finally { server.close(); }
});

test('capture on: every HTTP exchange of one call, with no credential, cookie or full session id anywhere in it', async () => {
  const { server, port } = await fakeGateway();
  try {
    const r = await doorFor(port, true).list('demo', 'good');
    assert.equal(r.ok, true);
    assert.deepEqual(r.wire.map((w) => w.rpcMethod), ['initialize', 'notifications/initialized', 'tools/list', 'session close']);
    const all = everything(r.wire);
    assert.ok(!all.includes(GOOD), 'the agent key is not in the capture');
    assert.ok(!all.includes('SECRETCOOKIE') && !/set-cookie/i.test(all), 'no cookie is captured');
    assert.ok(!all.includes(SESSION), 'the session id is shortened');
    const list = r.wire[2];
    assert.equal(list.request.headers.Authorization, `Bearer <agent key, ${GOOD.length} characters, kept on the server>`);
    assert.match(list.request.headers['Mcp-Session-Id'], /^abcdef12… \(shortened\)$/);
    assert.equal(list.response.status, 200);
    assert.equal(list.response.body.result.tools.length, 2, 'the exact JSON-RPC reply is kept');
    assert.equal(list.response.headers['x-request-id'], 'req-123');
    assert.ok(Number.isFinite(list.ms) && list.at);
  } finally { server.close(); }
});

test('a refusal is captured with its status and body, and the key the gateway echoed is scrubbed', async () => {
  const { server, port } = await fakeGateway();
  try {
    const bad = await doorFor(port, true).list('demo', 'bad');
    assert.equal(bad.ok, false);
    assert.equal(bad.wire.length, 1, 'refused at the handshake');
    assert.equal(bad.wire[0].response.status, 401);
    assert.ok(!everything(bad.wire).includes(BAD), 'the echoed key is scrubbed');
    assert.match(bad.wire[0].response.body, /invalid virtual key <redacted>/);
    const deny = await doorFor(port, true).list('demo', 'deny');
    assert.equal(deny.wire.find((w) => w.rpcMethod === 'tools/list').response.status, 403);
    assert.ok(!everything(deny.wire).includes(DENY));
  } finally { server.close(); }
});

test('an unreachable gateway: the request is captured, there is no response, and the trace says so', async () => {
  const { server, port } = await fakeGateway();
  await new Promise((r) => server.close(r));
  const r = await doorFor(port, true).list('demo', 'good');
  assert.equal(r.ok, false);
  assert.equal(r.wire[0].response, null);
  assert.match(r.wire[0].error, /unreachable/);
  const t = traceFromDoor(r);
  assert.equal(t.response, null);
  assert.equal(t.decisions[0].id, 'reach');
  assert.deepEqual(assertTrace(t), []);
});

test('traceFromDoor: 200 passes, 401 refuses at authentication, 403 at the grant; every real decision is inferred or observed', async () => {
  const { server, port } = await fakeGateway();
  try {
    const ok = traceFromDoor(await doorFor(port, true).list('demo', 'good'));
    assert.deepEqual(ok.decisions.map((d) => [d.id, d.outcome, d.basis]), [['authenticated', 'pass', 'inferred'], ['grant', 'pass', 'inferred']]);
    assert.match(ok.decisions[1].evidence, /whoami, echo/);
    assert.deepEqual(ok.setup.map((s) => s.label), ['initialize', 'notifications/initialized', 'session close']);
    assert.equal(ok.requestId, 'req-123');
    assert.deepEqual(assertTrace(ok), []);

    const no = traceFromDoor(await doorFor(port, true).list('demo', 'bad'));
    assert.deepEqual(no.decisions.map((d) => [d.id, d.outcome]), [['authenticated', 'fail'], ['grant', 'skipped']]);
    assert.deepEqual(assertTrace(no), []);

    const denied = traceFromDoor(await doorFor(port, true).list('demo', 'deny'));
    assert.deepEqual(denied.decisions.map((d) => [d.id, d.outcome]), [['authenticated', 'pass'], ['grant', 'fail']]);
    assert.deepEqual(assertTrace(denied), []);

    const call = traceFromDoor(await doorFor(port, true).call('demo', 'good', 'whoami', {}), { rpcMethod: 'tools/call' });
    assert.match(call.decisions[1].evidence, /allows whoami/);
  } finally { server.close(); }
});

test('assertTrace is the honesty rule: a real trace may not say "checked", and holds no full bearer token', () => {
  const real = realTrace({ url: 'https://gw/x/mcp', authorization: 'Bearer <k>', rpc: { method: 'tools/list' }, status: 200, headers: {}, body: { result: { tools: [] } } });
  assert.deepEqual(assertTrace(real), []);
  assert.ok(assertTrace({ ...real, decisions: [{ id: 'a', label: 'A', outcome: 'pass', basis: 'checked', evidence: '' }] }).some((p) => /cannot say "checked"/.test(p)));
  const jwt = `eyJ${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`;
  assert.ok(assertTrace({ ...real, request: { ...real.request, headers: { authorization: `Bearer ${jwt}` } } }).some((p) => /full bearer/.test(p)));
  const sim = mockTrace({ url: 'https://gateway.lab.invalid/demo/mcp', authorization: 'Bearer x', rpc: { method: 'tools/list' }, status: 200, body: {}, decisions: [{ id: 'sig', label: 'Signature', outcome: 'pass', evidence: 'verified' }] });
  assert.equal(sim.decisions[0].basis, 'checked');
  assert.deepEqual(assertTrace(sim), []);
  assert.deepEqual(assertTrace(failureTrace({ url: 'u', authorization: 'Bearer x', rpc: {}, error: 'refused' })), []);
});

test('bearerForDisplay never shows a resolved token, shortens a mock JWT, and shows a typed value as typed', () => {
  assert.equal(bearerForDisplay('placeholder', () => 'a'.repeat(900)), 'Bearer <token, 900 characters, kept on the server>');
  const jwt = `${'a'.repeat(30)}.${'b'.repeat(30)}.${'c'.repeat(30)}`;
  assert.match(bearerForDisplay(jwt), /^Bearer .{20}… \(92 characters, shortened\)$/);
  assert.equal(bearerForDisplay('garbage'), 'Bearer garbage');
});

test('the 200-with-a-JSON-RPC-error case is a failed call, not a passed one', () => {
  const d = realDecisions({ rpc: { method: 'tools/call' }, status: 200, body: { error: { message: 'unknown tool' } } });
  assert.deepEqual(d.map((x) => [x.id, x.outcome]), [['authenticated', 'pass'], ['result', 'fail']]);
});

test('header redaction: the auth header named by getAuth is hidden whatever it is called; response headers are an allowlist', () => {
  assert.equal(wireRequestHeaders({ 'X-Api-Key': 'abc123456' }, 'X-Api-Key')['X-Api-Key'], '<agent key, 9 characters, kept on the server>');
  assert.equal(wireRequestHeaders({ Authorization: 'Bearer abc' })['Authorization'], 'Bearer <agent key, 3 characters, kept on the server>');
  const h = new Headers({ 'content-type': 'application/json', 'set-cookie': 'a=b', 'x-internal-secret': 'zzz', 'mcp-session-id': 'abcdefghijkl' });
  assert.deepEqual(wireResponseHeaders(h), { 'content-type': 'application/json', 'mcp-session-id': 'abcdefgh… (shortened)' });
});

// ---- found by the independent review (2026-11-15): each of these failed before the fix ----
// A one-off gateway: `answer(req body, key)` returns [status, content-type, body] for every POST; the handshake is answered normally.
async function serve(answer) {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (req.method === 'DELETE') { res.statusCode = 200; return res.end(); }
      const msg = raw ? JSON.parse(raw) : {};
      const key = String(req.headers.authorization || '').replace(/^Bearer /, '');
      if (msg.method === 'initialize') { res.setHeader('content-type', 'application/json'); res.setHeader('mcp-session-id', SESSION); return res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', capabilities: {} } })); }
      if (msg.method === 'notifications/initialized') { res.statusCode = 202; return res.end(); }
      const [status, type, body] = answer(msg, key);
      res.statusCode = status; res.setHeader('content-type', type); res.end(body);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}
const cfg = (port, keys) => doorConfig(`T_GW_URL=http://127.0.0.1:${port}\nT_GW_APPS=demo\n${keys.map(([n, k]) => `T_GW_KEY_${n}=${k}`).join('\n')}\n`, 'T');
const door = (port, keys) => createRealDoor({ config: cfg(port, keys), capture: true });

test('a key holding a quote or a backslash is scrubbed out of the capture (the JSON text would hold the escaped form)', async () => {
  const key = `ab${String.fromCharCode(34)}cdefgh${String.fromCharCode(92)}ij`; // a quote and a backslash, built so no scanner reads it as a literal key
  const { server, port } = await serve((_m, k) => [401, 'text/plain', `bad ${k}`]);
  try {
    const r = await door(port, [['TRICKY', key]]).list('demo', 'tricky');
    assert.ok(!JSON.stringify(r.wire).includes('cdefgh'), 'no part of the key is left');
    assert.match(r.wire.find((w) => w.rpcMethod === 'tools/list').response.body, /^bad <redacted>$/);
  } finally { server.close(); }
});

test('a key that is the start of another key does not leave the rest of the longer key behind', async () => {
  const { server, port } = await serve((_m, k) => [401, 'text/plain', `bad key ${k}`]);
  try {
    const r = await door(port, [['A', 'ABCD1234'], ['B', 'ABCD1234EFGH5678']]).list('demo', 'b');
    assert.ok(!JSON.stringify(r.wire).includes('EFGH5678'));
    assert.equal(r.wire.find((w) => w.rpcMethod === 'tools/list').response.body, 'bad key <redacted>');
    assert.ok(!r.refusal.message.includes('EFGH5678'), 'the refusal message too');
  } finally { server.close(); }
});

test('a key cut by the 2000-character limit is still scrubbed from the capture', async () => {
  const key = ['SECRETKEY', '1234567890'].join(''); // built, so no scanner reads it as a literal key
  const { server, port } = await serve(() => [401, 'text/plain', `${'x'.repeat(1990)}${key}`]);
  try {
    const r = await door(port, [['K', key]]).list('demo', 'k');
    assert.ok(!JSON.stringify(r.wire).includes('SECRETKEY'));
  } finally { server.close(); }
});

test('a key such as 200 or null cannot break a successful call: the result still resolves, with a valid capture', async () => {
  for (const key of ['200', 'null', 'true']) {
    const { server, port } = await serve((m) => [200, 'application/json', JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'whoami' }] } })]);
    try {
      const r = await door(port, [['K', key]]).list('demo', 'k');
      assert.equal(r.ok, true, `key ${key}`);
      assert.ok(Array.isArray(r.wire), `key ${key}`);
      JSON.parse(JSON.stringify(r.wire));
    } finally { server.close(); }
  }
});

test('a body too large to show is replaced by a note, never cut in the middle', async () => {
  const { server, port } = await serve((m) => [200, 'application/json', JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'big', description: 'd'.repeat(MAX_CAPTURED_BODY + 10) }] } })]);
  try {
    const r = await door(port, [['K', 'KEYKEYKEY1']]).list('demo', 'k');
    const list = r.wire.find((w) => w.rpcMethod === 'tools/list');
    assert.match(list.response.body.note, /too large to show/);
  } finally { server.close(); }
});

test('honesty: a 200 whose tool result is an error is a failed call, and an unusable 200 reads no grant', async () => {
  const err = await serve((m) => [200, 'application/json', JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { isError: true, content: [{ type: 'text', text: 'refused by policy' }] } })]);
  try {
    const t = traceFromDoor(await door(err.port, [['K', 'KEYKEYKEY1']]).call('demo', 'k', 'whoami', {}), { rpcMethod: 'tools/call' });
    assert.deepEqual(t.decisions.map((d) => [d.id, d.outcome]), [['authenticated', 'pass'], ['result', 'fail']]);
    assert.match(t.decisions[1].evidence, /refused by policy/);
    assert.ok(!t.decisions.some((d) => d.id === 'grant'), 'no grant is claimed');
  } finally { err.server.close(); }
  const junk = await serve(() => [200, 'text/html', '<html>not json</html>']);
  try {
    const t = traceFromDoor(await door(junk.port, [['K', 'KEYKEYKEY1']]).list('demo', 'k'));
    assert.ok(!t.decisions.some((d) => d.id === 'grant'), 'no grant is claimed from a reply nobody could read');
    assert.equal(t.decisions.find((d) => d.id === 'result').outcome, 'info');
    assert.deepEqual(assertTrace(t), []);
  } finally { junk.server.close(); }
});

test('assertTrace reports a malformed decision instead of throwing', () => {
  const real = realTrace({ url: 'u', authorization: 'Bearer x', rpc: {}, status: 200, headers: {}, body: { result: {} } });
  assert.ok(assertTrace({ ...real, decisions: [null] }).some((p) => /not an object/.test(p)));
});

test('request headers: the defaults are unchanged, extra headers are added, accept is replaced case-insensitively', () => {
  const base = mockTrace({ url: 'https://gw.invalid/x', authorization: 'Bearer x', rpc: {}, status: 200, body: {}, decisions: [] });
  assert.deepEqual(base.request.headers, { authorization: 'Bearer x', 'content-type': 'application/json', accept: 'application/json, text/event-stream' });
  const tp = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
  const t = realTrace({ url: 'u', authorization: 'Bearer x', rpc: {}, status: 200, headers: {}, body: { result: {} }, requestHeaders: { Accept: 'application/json', traceparent: tp, 'mcp-session-id': 'abcd…' } });
  assert.equal(t.request.headers.accept, undefined, 'the default accept is replaced, not kept beside the override');
  assert.equal(t.request.headers.Accept, 'application/json');
  assert.equal(t.request.headers.traceparent, tp);
  assert.equal(Object.keys(t.request.headers).filter((k) => k.toLowerCase() === 'accept').length, 1);
  assert.equal(failureTrace({ url: 'u', authorization: 'Bearer x', rpc: {}, error: 'e', requestHeaders: { traceparent: tp } }).request.headers.traceparent, tp);
  assert.equal(mockTrace({ url: 'https://gw.invalid/x', authorization: 'Bearer x', rpc: {}, status: 200, body: {}, decisions: [], requestHeaders: { traceparent: tp } }).request.headers.traceparent, tp);
  assert.deepEqual(assertTrace(t), []);
});

test('request headers: a full bearer token passed as an extra header is still caught by assertTrace', () => {
  const jwt = ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJ1c2VyMSJ9', 'c2lnbmF0dXJlc2lnbmF0dXJl'].join('.');
  const t = realTrace({ url: 'u', authorization: 'Bearer x', rpc: {}, status: 200, headers: {}, body: { result: {} }, requestHeaders: { authorization: `Bearer ${jwt}` } });
  assert.ok(assertTrace(t).some((p) => /full bearer token/.test(p)));
});

test('grant wording: a lab that is not an MCP tool call can name the decision in its own words, outcomes unchanged', () => {
  const grant = { label: 'Guard verdict', pass: 'the guard let the text through', fail: (rpc) => `the guard blocked ${rpc?.kind}` };
  const ok = realDecisions({ rpc: { kind: 'inspect' }, status: 200, body: { result: {} }, grant });
  assert.deepEqual(ok.map((d) => [d.id, d.label, d.outcome, d.basis]), [['authenticated', 'Agent key', 'pass', 'inferred'], ['grant', 'Guard verdict', 'pass', 'inferred']]);
  assert.equal(ok[1].evidence, 'the guard let the text through');
  const no = realDecisions({ rpc: { kind: 'inspect' }, status: 403, body: null, grant });
  assert.equal(no[1].label, 'Guard verdict');
  assert.equal(no[1].outcome, 'fail');
  assert.equal(no[1].evidence, 'the guard blocked inspect');
  assert.equal(realDecisions({ status: 401, body: null, grant })[1].label, 'Guard verdict');
  // a reply's own detail still wins over the wording; and no grant option keeps the old words exactly
  assert.equal(realDecisions({ status: 403, body: null, detail: 'refused: x', grant })[1].evidence, 'refused: x');
  const dflt = realDecisions({ rpc: { method: 'tools/list' }, status: 200, body: { result: { tools: [{ name: 'a' }] } } });
  assert.equal(dflt[1].label, 'Grant');
  assert.equal(dflt[1].evidence, "the caller's grant allows 1 tool on this app: a");
  const viaTrace = realTrace({ url: 'u', authorization: 'Bearer x', rpc: { kind: 'inspect' }, status: 200, headers: {}, body: { result: {} }, grant });
  assert.equal(viaTrace.decisions[1].label, 'Guard verdict');
  assert.deepEqual(assertTrace(viaTrace), []);
});

test('gateway-trace.sha256 pins every vendored file', () => {
  const dir = path.join(shared, 'gateway-trace');
  const lines = fs.readFileSync(path.join(dir, 'gateway-trace.sha256'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  const pinned = Object.fromEntries(lines.map((l) => { const [h, f] = l.split(/\s+/); return [f, h]; }));
  for (const f of ['GatewayTrace.jsx', 'gateway-trace.css', 'gatewayTrace.js', 'gateway-trace.test.jsx']) {
    const actual = createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex');
    assert.equal(pinned[f], actual, `${f}: re-pin (shasum -a 256 GatewayTrace.jsx gateway-trace.css gatewayTrace.js gateway-trace.test.jsx)`);
  }
});
