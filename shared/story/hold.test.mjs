// hold.js must equal the video's hold() / hold_slide() EXACTLY at Normal. The expected numbers below were computed by running take.py's own formulas
// (max(5.0, words*0.30+2.2) and min(10.0, max(6.0, words*0.25+3.0))). node --test shared/story/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { bubbleHold, slideHold, holdMs, speedFactor, words, SPEEDS } from './hold.js';

const w = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

test('Normal bubble hold equals the video (golden numbers from take.py hold())', () => {
  for (const [n, want] of [[1, 5.0], [9, 5.0], [10, 5.2], [20, 8.2], [33, 12.100000000000001], [60, 20.2]]) assert.equal(bubbleHold(w(n)), want, `${n} words`);
});

test('the video joins the text and the first fact line with NO space, so those two words count as one (kept on purpose)', () => {
  assert.equal(bubbleHold(w(10), ['asks: a b c']), 6.1);
  assert.equal(bubbleHold(w(20), ['one two', 'three']), 8.8);
});

test('a prompt step holds its own fixed seconds (4.5 / 5.0), not the formula', () => {
  assert.equal(bubbleHold(w(60), ['x'], 4.5), 4.5);
  assert.equal(bubbleHold(w(1), [], 5.0), 5.0);
});

test('Normal slide hold equals the video (golden numbers from take.py hold_slide()), capped at 10 s', () => {
  const slide = (n) => ({ lead: w(n), colA: { lines: [] }, colB: { lines: [] }, verdict: 'v' });
  for (const [n, want] of [[1, 6.0], [12, 6.25], [20, 8.25], [40, 10.0], [80, 10.0]]) assert.equal(slideHold(slide(n)), want, `${n} words`);
  assert.equal(slideHold({ lead: 'l a', colA: { lines: ['x y z', 'q'] }, colB: { lines: ['m n'] }, verdict: 'done now' }), 6.0);
});

test('the slide title is not counted', () => {
  const a = { lead: w(20), colA: { lines: [] }, colB: { lines: [] }, verdict: 'v' };
  assert.equal(slideHold({ ...a, title: w(50) }), slideHold(a));
});

test('speeds: normal x1, slower x1.5, faster x0.67; milliseconds are rounded', () => {
  assert.deepEqual({ ...SPEEDS }, { slower: 1.5, normal: 1, faster: 0.67 });
  assert.equal(holdMs(8.2, 'normal'), 8200);
  assert.equal(holdMs(8.2, 'slower'), 12300);
  assert.equal(holdMs(8.2, 'faster'), Math.round(8.2 * 0.67 * 1000));
  assert.equal(speedFactor('nonsense'), 1);
});

test('words() splits on any whitespace like Python split(), and survives null', () => {
  assert.equal(words('  a\tb\n c  '), 3);
  assert.equal(words(null), 0);
});
