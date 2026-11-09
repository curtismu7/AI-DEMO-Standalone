// Runs in this repo's CI (node --test test/*.test.mjs, no dependencies). The React component tests
// (shared/floating-dialog/floating-dialog.test.jsx, vitest + Testing Library) need a lab's web workspace and run where
// the folder is vendored (customer-agent-LAB web/src/floating-dialog). Here: the pure geometry, and static guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARGIN, clampToViewport, initialPosition, keyboardStep, resizeRect } from '../shared/floating-dialog/geometry.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared');
const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');
const vp = { w: 1280, h: 900 };
const min = { w: 300, h: 200 };

test('clampToViewport keeps a restored panel inside the window, and pins an oversized one to the margin', () => {
  assert.deepEqual(clampToViewport({ x: 3000, y: -50 }, { w: 400, h: 300 }, vp), { x: 1280 - 400 - MARGIN, y: MARGIN });
  assert.deepEqual(clampToViewport({ x: 100, y: 100 }, { w: 400, h: 300 }, vp), { x: 100, y: 100 });
  assert.deepEqual(clampToViewport({ x: 500, y: 500 }, { w: 5000, h: 5000 }, vp), { x: MARGIN, y: MARGIN });
  assert.deepEqual(clampToViewport({ x: 9, y: 9 }, { w: 1, h: 1 }, null), { x: 9, y: 9 });
});

test('resizeRect grows east/south and stops at the minimum size', () => {
  const s = { x: 100, y: 100, w: 400, h: 300 };
  assert.deepEqual(resizeRect(s, 'se', 60, 50, min), { x: 100, y: 100, w: 460, h: 350 });
  assert.deepEqual(resizeRect(s, 'se', -900, -900, min), { x: 100, y: 100, w: 300, h: 200 });
});

test('resizeRect from north/west keeps the far edge and never pushes the title bar off the top or left', () => {
  const s = { x: 100, y: 100, w: 400, h: 300 };
  assert.deepEqual(resizeRect(s, 'nw', -500, -500, min), { x: 0, y: 0, w: 500, h: 400 });
  assert.deepEqual(resizeRect(s, 'w', 50, 0, min), { x: 150, y: 100, w: 350, h: 300 });
  // a panel the user dragged off the left edge on purpose is not yanked back, and the overhang cannot grow
  assert.equal(resizeRect({ x: -50, y: 10, w: 400, h: 300 }, 'w', -10, 0, min).x, -50);
  assert.equal(resizeRect({ x: -50, y: 10, w: 400, h: 300 }, 'w', 20, 0, min).x, -30);
});

test('keyboardStep: arrows move 10, Shift 50, Alt resizes, other keys are ignored', () => {
  assert.deepEqual(keyboardStep('ArrowRight'), { kind: 'move', dx: 10, dy: 0 });
  assert.deepEqual(keyboardStep('ArrowUp', { shiftKey: true }), { kind: 'move', dx: 0, dy: -50 });
  assert.deepEqual(keyboardStep('ArrowDown', { altKey: true }), { kind: 'resize', dx: 0, dy: 10 });
  assert.equal(keyboardStep('Enter'), null);
});

test('initialPosition: explicit x/y win, else centred or against the right edge', () => {
  assert.deepEqual(initialPosition({ vp, w: 400, h: 300, x: 5, y: 6 }), { x: 5, y: 6 });
  assert.deepEqual(initialPosition({ vp, w: 400, h: 300 }), { x: 440, y: 270 });
  assert.equal(initialPosition({ vp, w: 400, h: 300, placement: 'right' }).x, 1280 - 400 - MARGIN);
});

test('floating-dialog.css uses theme tokens only (no literal colours) and has the narrow-screen sheet', () => {
  const css = read('floating-dialog/floating-dialog.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch)\(|(?:[\s:,(])(purple|violet|indigo|white|black)\s*[;)!,]/i.test(css), false);
  assert.match(css, /@media \(max-width: 600px\)/);
});

test('the shared ActorCard renders inside FloatingDialog, and the component test file ships with the folder', () => {
  assert.match(read('evidence/ActorCard.jsx'), /import FloatingDialog from "\.\.\/floating-dialog\/FloatingDialog"/);
  assert.ok(fs.existsSync(path.join(dir, 'floating-dialog', 'floating-dialog.test.jsx')));
});

test('pop-out opens a same-origin blank window, never a URL', () => {
  const src = read('floating-dialog/FloatingDialog.jsx');
  assert.match(src, /window\.open\("", name, `popup,width=/);
  assert.equal(/window\.open\(\s*["'`]https?:/.test(src), false);
  assert.equal(/\balert\(/.test(src), false);
});
