import test from 'node:test';
import assert from 'node:assert/strict';
import { verdict, check, probeParameters, loadSettings, PROBE_CODE } from '../scripts/check-authorize-policy.mjs';

const live = { environmentId: 'env', region: 'com', clientId: 'c', clientSecret: 'SECRETVALUE', endpointId: 'ep' };
const reply = (status, body) => ({ status, json: async () => body });

test('verdict: the authored DENY code means imported', () => {
  assert.equal(verdict(200, { decision: 'DENY', statements: [{ code: PROBE_CODE }] }).code, 0);
});
test('verdict: PERMIT, a DENY without the code, and no statements all mean not imported', () => {
  assert.equal(verdict(200, { decision: 'PERMIT', statements: [] }).code, 1);
  assert.equal(verdict(200, { decision: 'DENY', statements: [{ code: 'other' }] }).code, 1);
  assert.equal(verdict(200, { decision: 'INDETERMINATE' }).code, 1);
});
test('verdict: a non-200 answer is "cannot check", never "not imported"', () => {
  assert.equal(verdict(403, {}).code, 2);
  assert.equal(verdict(429, {}).code, 2);
});
test('probe names no real host', () => {
  assert.ok(!/ping-devops|ping\.demo|pingone\.com/.test(JSON.stringify(probeParameters())));
});
test('no live settings: cannot check, no request is made', async () => {
  let calls = 0;
  const r = await check({ environmentId: '', clientId: '', clientSecret: '' }, async () => { calls += 1; });
  assert.equal(r.code, 2); assert.equal(calls, 0);
});
test('check: token then one decision POST, secret never in the text', async () => {
  const seen = [];
  const r = await check(live, async (url, init = {}) => {
    seen.push([init.method || 'GET', url]);
    return url.endsWith('/as/token') ? reply(200, { access_token: 't' }) : reply(200, { decision: 'DENY', statements: [{ code: PROBE_CODE }] });
  });
  assert.equal(r.code, 0);
  assert.deepEqual(seen.map((x) => x[0]), ['POST', 'POST']);
  assert.ok(!r.text.includes(live.clientSecret));
});
test('check: a failed token request is "cannot check"', async () => {
  assert.equal((await check(live, async () => reply(401, {}))).code, 2);
});
test('check: no endpointId and several endpoints is "cannot check"', async () => {
  const r = await check({ ...live, endpointId: '' }, async (url) => (url.endsWith('/as/token') ? reply(200, { access_token: 't' }) : reply(200, { _embedded: { decisionEndpoints: [{ id: 'a' }, { id: 'b' }] } })));
  assert.equal(r.code, 2);
});
test('settings: environment variables win over the shared file and the region defaults to com', () => {
  const s = loadSettings({ DEMO_KIT_CONFIG_DIR: '/nonexistent', PINGONE_ENVIRONMENT_ID: 'e' });
  assert.equal(s.environmentId, 'e'); assert.equal(s.region, 'com');
});
