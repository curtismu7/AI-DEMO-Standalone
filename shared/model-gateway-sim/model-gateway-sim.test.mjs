// node --test shared/model-gateway-sim/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClock } from './labClock.js';
import { createProvider, PROVIDER_STATES, MAX_PROMPT_CHARS } from './providerStub.js';
import { createLedger, createUsage, createLlmKey } from './llmKey.js';

test('clock only moves when told, and refuses negative or non-numeric time', () => {
  const c = createClock(5);
  assert.equal(c.now(), 5);
  assert.equal(c.advance(10), 15);
  for (const bad of [-1, NaN, Infinity, '3', undefined]) assert.throws(() => c.advance(bad), RangeError);
  assert.throws(() => createClock(-1), RangeError);
});

test('provider: healthy answers, charges latency to the lab clock, counts words', () => {
  const c = createClock();
  const p = createProvider({ id: 'a', model: 'model-a', latencyMs: 100 }, c);
  const r = p.call({ prompt: 'one two three' });
  assert.equal(r.ok, true); assert.equal(r.status, 200); assert.equal(r.usage.inputTokens, 3);
  assert.equal(c.now(), 100);
});

test('provider: each failure state is a named, non-ok result with its own status and cost in time', () => {
  const want = { down: [503, 20], overloaded: [429, 20], timeout: [504, 30000] };
  for (const [state, [status, ms]] of Object.entries(want)) {
    const c = createClock();
    const p = createProvider({ id: 'a', model: 'm' }, c);
    p.setState(state);
    const r = p.call({ prompt: 'hi' });
    assert.equal(r.ok, false, state); assert.equal(r.status, status, state); assert.equal(c.now(), ms, state);
    assert.deepEqual(r.usage, { inputTokens: 0, outputTokens: 0 });
    assert.ok(r.error);
  }
});

test('provider: slow is ok but ten times slower', () => {
  const c = createClock();
  const p = createProvider({ id: 'a', model: 'm', latencyMs: 100 }, c);
  p.setState('slow');
  assert.equal(p.call({ prompt: 'x' }).latencyMs, 1000);
});

test('provider: hostile input is refused, not processed', () => {
  const p = createProvider({ id: 'a', model: 'm' }, createClock());
  assert.throws(() => p.call({ prompt: 'x'.repeat(MAX_PROMPT_CHARS + 1) }), RangeError);
  for (const bad of [null, 42, {}, undefined]) assert.throws(() => p.call({ prompt: bad }), TypeError);
  assert.throws(() => p.setState('<script>'), RangeError);
  assert.deepEqual(PROVIDER_STATES, ['healthy', 'down', 'overloaded', 'timeout', 'slow']);
});

test('provider: the echoed text is capped at 40 characters of the prompt', () => {
  const p = createProvider({ id: 'a', model: 'm' }, createClock());
  assert.equal(p.call({ prompt: '<b>' + 'y'.repeat(100) }).text.length, '[m] answer to: '.length + 40);
});

test('ledger: refuses to overdraw and changes nothing when it does', () => {
  const l = createLedger(100);
  assert.equal(l.spend(60), true);
  assert.equal(l.spend(41), false);
  assert.equal(l.spent(), 60); assert.equal(l.remaining(), 40);
  assert.equal(l.canSpend(40), true); assert.equal(l.canSpend(41), false);
  for (const bad of [-1, NaN, '5']) assert.throws(() => l.spend(bad), RangeError);
  assert.throws(() => createLedger(-5), RangeError);
  l.reset(); assert.equal(l.spent(), 0);
});

test('usage: requests, from cache and saved move together; a miss saves nothing', () => {
  const u = createUsage();
  u.record({}); u.record({ fromCache: true, savedTokens: 120 }); u.record({ fromCache: false, savedTokens: 999 });
  assert.deepEqual(u.snapshot(), { requests: 3, fromCache: 1, savedTokens: 120 });
  assert.throws(() => u.record({ fromCache: true, savedTokens: -1 }), RangeError);
  u.reset(); assert.deepEqual(u.snapshot(), { requests: 0, fromCache: 0, savedTokens: 0 });
});

test('key: has an id, a ledger and a usage counter, and no credential field', () => {
  const k = createLlmKey({ id: 'key-1', budgetTokens: 500 });
  assert.equal(k.id, 'key-1'); assert.equal(k.ledger.limit, 500);
  assert.deepEqual(Object.keys(k).sort(), ['id', 'ledger', 'usage']);
  assert.throws(() => createLlmKey({ id: '', budgetTokens: 1 }), TypeError);
});

test('pin file lists every canonical file with its real sha256 (the labs verify their vendored copies against it)', () => {
  const pin = readFileSync(new URL('./model-gateway-sim.sha256', import.meta.url), 'utf8').trim().split('\n');
  const files = ['labClock.js', 'providerStub.js', 'llmKey.js'];
  assert.equal(pin.length, files.length);
  for (const f of files) {
    const line = pin.find((l) => l.endsWith(`server/src/model-gateway-sim/${f}`));
    assert.ok(line, `${f} is pinned`);
    const want = createHash('sha256').update(readFileSync(new URL(`./${f}`, import.meta.url))).digest('hex');
    assert.equal(line.split(/\s+/)[0], want, `${f} changed: re-run the pin command in README.md`);
  }
});
