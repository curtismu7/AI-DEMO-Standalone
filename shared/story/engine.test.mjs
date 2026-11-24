// engine.js with a fake clock, host and overlay: no DOM, no network. node --test shared/story/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStory, fillLive } from './engine.js';
import { bubbleHold, slideHold, holdMs } from './hold.js';

const tick = () => new Promise((r) => setImmediate(r));
// The UI never awaits a control: a step that waits for a run only settles when the run ends. So a test lets the control start, then lets the microtasks run.
const go = async (p) => { p.catch(() => {}); await tick(); await tick(); };
const w = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

function clock() {
  let t = 0; let id = 0; const q = new Map();
  return {
    setTimeout: (f, ms) => { id += 1; q.set(id, { at: t + ms, f }); return id; },
    clearTimeout: (i) => q.delete(i), now: () => t,
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        await tick();
        const due = [...q.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        q.delete(due[0]); t = due[1].at; due[1].f(); await tick();
      }
      t = end; await tick();
    },
    pending: () => q.size,
  };
}

function rig({ mode = 'real', present = ['#input', '#who', '#close'], store = null, steps: over = null } = {}) {
  const clk = clock();
  const calls = []; const overlay = { cap: (o) => calls.push(['cap', o]), slide: (o) => calls.push(['slide', o]), clear: () => calls.push(['clear']), scrollSlide: () => calls.push(['scroll']) };
  const here = new Set(present);
  const host = {
    modeV: mode, mode() { return this.modeV; }, query: (s) => (here.has(s) ? { sel: s } : null),
    runs: 0, waiters: [], mark() { return { runs: this.runs }; },
    waitForRun(marker) { if (this.runs > marker.runs) return Promise.resolve({ ok: true }); return new Promise((res) => this.waiters.push(res)); },
    finishRun(ok = true, reason) { this.runs += 1; this.waiters.splice(0).forEach((r) => r(ok ? { ok: true } : { ok: false, reason })); },
    prefilled: [], prefill(s) { this.prefilled.push(s.key); }, sent: [], send(s) { this.sent.push(s.key); }, tabs: [], switchTab(t) { this.tabs.push(t); },
  };
  const captions = {
    opening: { title: 'Open', lead: w(20), colA: { heading: 'A', lines: ['a'] }, colB: { heading: 'B', lines: ['b'] }, verdict: 'v', image: 'shot.jpg' },
    closing: { title: 'Close', lead: 'bye', colA: { heading: 'A', lines: ['a'] }, colB: { heading: 'B', lines: ['b'] }, verdict: 'v', image: null },
    slides: {},
    steps: {
      p_prompt: { title: 'Ask', text: 'Type the question, then press Send.' },
      p_handoff: { title: 'Handoff {who}', text: w(30) + ' status {status}' },
      p_mcp: { title: 'Tool', text: 'The tool call.' },
      sample_handoff: { title: 'Simulated handoff', text: 'A local stand-in answered.' },
    },
  };
  const steps = over || [
    { key: 'opening', type: 'slide', trigger: 'load' },
    { key: 'p_prompt', type: 'bubble', trigger: 'load', target: '#input', prompt: { text: 'What can Bob Reyes reach?' }, fixedSecs: 4.5, tab: 'review' },
    { key: 'p_handoff', type: 'bubble', trigger: 'run-done', target: '#who', sampleKey: 'sample_handoff', live: () => ({ who: 'Concierge', status: '200' }), lines: (v) => [`status ${v.status}`] },
    { key: 'p_mcp', type: 'bubble', trigger: 'frame', target: '#mcp', modes: ['real'] },
    { key: 'closing', type: 'slide', trigger: 'load' },
  ];
  const story = createStory({ steps, captions, overlay, host, store, prefix: 't', timers: clk, waitTimeoutMs: 1000 });
  const last = (kind) => [...calls].reverse().find((c) => c[0] === kind)?.[1];
  return { story, host, clk, calls, last, here, captions };
}

test('start shows the opening slide and counts the steps', async () => {
  const r = rig(); await go(r.story.start()); await tick();
  const s = r.story.state();
  assert.equal(s.active, true); assert.equal(s.key, 'opening'); assert.equal(s.n, 1); assert.equal(s.total, 5);   // Real mode: all five count until one is found absent (the skip test shows the count drop to 4)
  assert.equal(r.last('slide').title, 'Open');
});

test('a prompt step switches tab, pre-fills the exact question and sends nothing', async () => {
  const r = rig(); await go(r.story.start()); await go(r.story.next()); await tick();
  assert.deepEqual(r.host.prefilled, ['p_prompt']); assert.deepEqual(r.host.tabs, ['review']); assert.deepEqual(r.host.sent, []);
  assert.equal(r.story.state().isPrompt, true); assert.equal(r.last('cap').target.sel, '#input');
});

test('the step after a prompt waits for the run; Next is ignored while it runs; the wording is filled from the page', async () => {
  const r = rig(); await go(r.story.start()); await go(r.story.next()); await go(r.story.next()); await tick();
  assert.equal(r.story.state().status, 'waiting');
  await go(r.story.next()); assert.equal(r.story.state().status, 'waiting', 'Next does nothing while a run is in flight');
  r.host.finishRun(true); await tick();
  const s = r.story.state(); assert.equal(s.status, 'showing'); assert.equal(s.key, 'p_handoff');
  const cap = r.last('cap'); assert.equal(cap.title, 'Handoff Concierge'); assert.match(cap.text, /status 200$/); assert.deepEqual(cap.lines, ['status 200']);
});

test('a run that finished BEFORE the viewer reached the step is not waited for again', async () => {
  const r = rig(); await go(r.story.start()); await go(r.story.next());   // at the prompt step; the marker is taken here
  r.host.finishRun(true);                                         // the viewer pressed Send and the run finished
  await go(r.story.next()); await tick();
  assert.equal(r.story.state().key, 'p_handoff');
});

test('a step whose target is missing is skipped and the counter counts only what is shown', async () => {
  const r = rig(); await go(r.story.start()); await go(r.story.next()); r.host.finishRun(true); await go(r.story.next()); await tick();
  await go(r.story.next()); await r.clk.advance(3000);   // p_mcp: waits up to 2.5 s for its frame, never appears, skipped
  const s = r.story.state(); assert.equal(s.key, 'closing'); assert.equal(s.n, 4); assert.equal(s.total, 4);
  assert.deepEqual(r.story.state().warnings, []);
});

test('a frame that appears while waiting is shown', async () => {
  const r = rig(); await go(r.story.start()); await go(r.story.next()); r.host.finishRun(true); await go(r.story.next()); await tick();
  const p = r.story.next(); await tick(); r.here.add('#mcp'); await r.clk.advance(300); await p;
  assert.equal(r.story.state().key, 'p_mcp');
});

test('a run that fails stalls the story; Next carries on anyway; nothing claims success', async () => {
  const r = rig(); await go(r.story.start()); await go(r.story.next()); await go(r.story.next()); await tick();
  r.host.finishRun(false, 'The run timed out.'); await tick();
  assert.equal(r.story.state().status, 'stalled'); assert.equal(r.story.state().message, 'The run timed out.');
  await go(r.story.next()); await tick();
  assert.equal(r.story.state().key, 'p_handoff');
});

test('Back returns to the previous shown step, never refills a prompt, and the counter follows', async () => {
  const r = rig(); await go(r.story.start()); await go(r.story.next()); await go(r.story.next()); r.host.finishRun(true); await tick();
  await go(r.story.back()); await tick();
  let s = r.story.state(); assert.equal(s.key, 'p_prompt'); assert.equal(s.n, 2); assert.deepEqual(r.host.prefilled, ['p_prompt']);
  await go(r.story.back()); assert.equal(r.story.state().key, 'opening'); await go(r.story.back()); assert.equal(r.story.state().key, 'opening', 'Back at the first step stays put');
  await go(r.story.next()); await go(r.story.next()); await tick(); s = r.story.state(); assert.equal(s.key, 'p_handoff'); assert.equal(s.n, 3);
});

test('Exit clears everything; the story can be restarted', async () => {
  const r = rig(); await go(r.story.start()); await go(r.story.next()); await go(r.story.exit());
  const s = r.story.state(); assert.equal(s.active, false); assert.equal(s.status, 'idle'); assert.equal(r.calls.at(-1)[0], 'clear');
  await go(r.story.restart()); assert.equal(r.story.state().key, 'opening'); assert.equal(r.story.state().n, 1);
});

test('Mock mode: real-only steps are hidden and the sample wording is used', async () => {
  const r = rig({ mode: 'mock' }); await go(r.story.start()); await go(r.story.next()); r.host.finishRun(true); await go(r.story.next()); await tick();
  assert.equal(r.last('cap').title, 'Simulated handoff'); assert.equal(r.story.state().total, 4);
  await go(r.story.next()); await tick(); assert.equal(r.story.state().key, 'closing');
});

test('a value the page cannot give shows as unavailable and is reported, never invented', async () => {
  const r = rig({ steps: [{ key: 'p_handoff', type: 'bubble', trigger: 'load', target: '#who', live: () => ({ who: 'Concierge' }) }] });
  await go(r.story.start()); await tick();
  assert.match(r.last('cap').text, /status \(unavailable\)$/); assert.equal(r.story.state().warnings.length, 1); assert.match(r.story.state().warnings[0], /\{status\}/);
  assert.deepEqual(fillLive('x {a} {b}', { a: 1 }), { text: 'x 1 (unavailable)', missing: ['b'] });
});

test('before() opens a pop-out and after() closes it when the step is left', async () => {
  const log = [];
  const r = rig({ steps: [
    { key: 'p_mcp', type: 'bubble', trigger: 'load', target: '#who', before: async () => log.push('open'), after: async () => log.push('close') },
    { key: 'closing', type: 'slide', trigger: 'load' }] });
  await go(r.story.start()); await tick(); assert.deepEqual(log, ['open']);
  await go(r.story.next()); assert.deepEqual(log, ['open', 'close']);
  await go(r.story.back()); assert.deepEqual(log, ['open', 'close', 'open'], 'Back opens the pop-out again');
});

test('two quick Next clicks move one step', async () => {
  const r = rig(); await go(r.story.start()); r.story.next(); r.story.next(); await tick(); await tick();
  assert.ok(['p_prompt', 'p_handoff'].includes(r.story.state().key));
  assert.notEqual(r.story.state().key, 'closing');
});

// ---- Play for me
for (const speed of ['normal', 'slower', 'faster']) {
  test(`Play at ${speed}: each hold is the video's hold at that speed; the prompt step sends the question; it waits for the run`, async () => {
    const r = rig(); r.story.setSpeed(speed); await go(r.story.start()); r.story.play(); await tick();
    const slideMs = holdMs(slideHold(r.captions.opening), speed);
    await r.clk.advance(slideMs - 1); assert.equal(r.story.state().key, 'opening', 'not before the hold');
    await r.clk.advance(1); assert.equal(r.story.state().key, 'p_prompt', 'at the hold');
    const promptMs = holdMs(4.5, speed);
    await r.clk.advance(promptMs - 1); assert.deepEqual(r.host.sent, []);
    await r.clk.advance(1); assert.deepEqual(r.host.sent, ['p_prompt']); assert.equal(r.story.state().status, 'waiting');
    await r.clk.advance(60000); assert.equal(r.story.state().status, 'waiting', 'Play never advances past a run on a timer');
    r.host.finishRun(true); await tick();
    const text = `${w(30)} status 200`; const bMs = holdMs(bubbleHold(text, ['status 200']), speed);
    await r.clk.advance(bMs - 1); assert.equal(r.story.state().key, 'p_handoff');
    await r.clk.advance(1); await r.clk.advance(3000);
    assert.equal(r.story.state().key, 'closing');
  });
}

test('Pause freezes the bubble; resume continues with the time that was left', async () => {
  const r = rig(); await go(r.story.start()); r.story.play(); await tick();
  const total = holdMs(slideHold(r.captions.opening), 'normal');
  await r.clk.advance(total - 2000); r.story.pause(); await r.clk.advance(60000);
  assert.equal(r.story.state().key, 'opening'); assert.equal(r.story.state().paused, true);
  r.story.resume(); await r.clk.advance(1999); assert.equal(r.story.state().key, 'opening'); await r.clk.advance(1); assert.equal(r.story.state().key, 'p_prompt');
});

test('any manual input stops Play and hands the story to the viewer', async () => {
  const r = rig(); await go(r.story.start()); r.story.play(); await tick(); r.story.manualInput();
  assert.equal(r.story.state().playing, false); assert.match(r.story.state().message, /you took over/);
  await r.clk.advance(120000); assert.equal(r.story.state().key, 'opening', 'no timer is left running');
  assert.equal(r.clk.pending(), 0);
});

test('Next and Back stop Play; Next never uses a timer', async () => {
  const r = rig(); await go(r.story.start()); r.story.play(); await tick(); await go(r.story.next());
  assert.equal(r.story.state().playing, false); await r.clk.advance(600000); assert.equal(r.story.state().key, 'p_prompt');
});

test('Play stops, with a message, when a run fails; it never skips past it', async () => {
  const r = rig(); await go(r.story.start()); r.story.play(); await tick();
  await r.clk.advance(holdMs(slideHold(r.captions.opening), 'normal') + 4500 + 10); await tick();
  assert.equal(r.story.state().status, 'waiting'); r.host.finishRun(false, 'The run timed out.'); await tick();
  const s = r.story.state(); assert.equal(s.status, 'stalled'); assert.equal(s.playing, false); assert.match(s.message, /Play stopped: The run timed out/);
  await r.clk.advance(120000); assert.equal(r.story.state().status, 'stalled');
});

test('Play is not available once the story is done, and a slide scrolls at 45% of its hold (at most 6 s)', async () => {
  const r = rig({ steps: [{ key: 'opening', type: 'slide', trigger: 'load' }] }); await go(r.story.start()); r.story.play(); await tick();
  const total = holdMs(slideHold(r.captions.opening), 'normal');
  await r.clk.advance(Math.round(total * 0.45) - 1); assert.equal(r.calls.filter((c) => c[0] === 'scroll').length, 0);
  await r.clk.advance(1); assert.equal(r.calls.filter((c) => c[0] === 'scroll').length, 1);
  await r.clk.advance(total); assert.equal(r.story.state().status, 'done'); r.story.play(); assert.equal(r.story.state().playing, false);
});

test('the speed is remembered, only valid names are accepted, and blocked storage does not break it', async () => {
  const mem = new Map(); const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const a = rig({ store }); a.story.setSpeed('faster'); a.story.setSpeed('warp'); assert.equal(a.story.state().speed, 'faster'); assert.equal(mem.get('t.story.speed'), 'faster');
  assert.equal(rig({ store }).story.state().speed, 'faster');
  const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const b = rig({ store: bad }); assert.equal(b.story.state().speed, 'normal'); b.story.setSpeed('slower'); assert.equal(b.story.state().speed, 'slower');
});

test('the slide image is passed only when the host supplies one; the repo ships none', async () => {
  const r = rig(); await go(r.story.start()); assert.equal(r.last('slide').image, null);
  const r2 = rig(); r2.host.assetUrl = (n) => `/assets/${n}`; await go(r2.story.start()); assert.equal(r2.last('slide').image, '/assets/shot.jpg');
});

// ---- regressions found by the independent review (each fails on the code before the fix)
test('Pause while waiting for a run, then Resume after it finished: the new bubble gets its own hold, and the old prompt is not sent again', async () => {
  const r = rig(); await r.story.start(); r.story.play(); await tick();
  await r.clk.advance(holdMs(slideHold(r.captions.opening), 'normal') + 4500 + 5);
  assert.deepEqual(r.host.sent, ['p_prompt']); assert.equal(r.story.state().status, 'waiting');
  r.story.pause(); r.host.finishRun(true); await tick();
  assert.equal(r.story.state().key, 'p_handoff'); r.story.resume();
  await r.clk.advance(60000 * 5); await tick();
  assert.deepEqual(r.host.sent, ['p_prompt'], 'the prompt was sent once, not again on Resume');
  const text = `${w(30)} status 200`; const ms = holdMs(bubbleHold(text, ['status 200']), 'normal');
  const r2 = rig(); await r2.story.start(); r2.story.play(); await tick();
  await r2.clk.advance(holdMs(slideHold(r2.captions.opening), 'normal') + 4500 + 5); r2.story.pause(); r2.host.finishRun(true); await tick(); r2.story.resume();
  await r2.clk.advance(ms - 1); assert.equal(r2.story.state().key, 'p_handoff', 'held for the new bubble\'s own time'); await r2.clk.advance(1); await r2.clk.advance(3000);
  assert.notEqual(r2.story.state().key, 'p_handoff');
});

test('Back to a prompt step and then Play does not press Send again', async () => {
  const r = rig(); await r.story.start(); await go(r.story.next()); r.host.finishRun(true); await go(r.story.next());
  await go(r.story.back()); assert.equal(r.story.state().key, 'p_prompt');
  r.story.play(); await r.clk.advance(4500 + 10);
  assert.deepEqual(r.host.sent, [], 'no second run');
  assert.equal(r.story.state().key, 'p_handoff', 'it carries on through the steps already shown');
});

test('Exit while a pop-out is still closing (on Back) keeps the story exited: no bubble is drawn after Exit', async () => {
  let release; const slow = new Promise((res) => { release = res; });
  const r = rig({ steps: [
    { key: 'p_prompt', type: 'bubble', trigger: 'load', target: '#input' },
    { key: 'p_mcp', type: 'bubble', trigger: 'load', target: '#who', after: () => slow }] });
  await go(r.story.start()); await go(r.story.next()); const before = r.calls.length;
  r.story.back(); await tick(); r.story.exit(); await tick(); release(); await tick(); await tick();
  assert.equal(r.story.state().active, false); assert.equal(r.story.state().status, 'idle');
  assert.equal(r.calls.slice(before).filter((c) => c[0] === 'cap').length, 0, 'nothing is drawn after Exit');
});

test('a step with no wording is skipped with a warning, and the pop-out it opened is closed', async () => {
  const log = [];
  const r = rig({ steps: [
    { key: 'nowording', type: 'bubble', trigger: 'load', target: '#who', before: async () => log.push('open'), after: async () => log.push('close') },
    { key: 'p_prompt', type: 'bubble', trigger: 'load', target: '#input' }] });
  await go(r.story.start());
  assert.deepEqual(log, ['open', 'close']); assert.equal(r.story.state().key, 'p_prompt'); assert.match(r.story.state().warnings.join(), /no wording for "nowording"/);
});

test('a script callback that throws does not stop the story: when() counts as true, lines() as none, both reported', async () => {
  const r = rig({ steps: [
    { key: 'p_handoff', type: 'bubble', trigger: 'load', target: '#who', lines: () => { throw new Error('no node'); } },
    { key: 'p_prompt', type: 'bubble', trigger: 'load', target: '#input', when: () => { throw new Error('no node'); } }] });
  await go(r.story.start()); assert.equal(r.story.state().key, 'p_handoff');
  assert.deepEqual(r.last('cap').lines, []);
  await go(r.story.next()); assert.equal(r.story.state().key, 'p_prompt');
  const w2 = r.story.state().warnings.join('\n'); assert.match(w2, /fact lines could not be read/); assert.match(w2, /condition could not be read/);
});
