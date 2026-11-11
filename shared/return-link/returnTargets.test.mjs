// Tests for the return-link logic (node:test). Run by the parent repo's CI through test/return-link.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RETURN_TARGETS, readReturnContext, backHref, returnLinkFor, isProxiedPath } from './returnTargets.js';

// A location as the browser gives it, from a full URL (hosts are examples or the fixed loopback ones).
const loc = (url) => { const u = new URL(url); return { hostname: u.hostname, pathname: u.pathname, search: u.search }; };
const proxy = (search) => loc(`https://labs.example/a2a-lab/${search}`);
const direct = (search) => loc(`http://127.0.0.1:5150/${search}`);

test('the target list is fixed and frozen: customer-agent + ai-demo-standalone', () => {
  assert.deepEqual(Object.keys(RETURN_TARGETS), ['customer-agent', 'ai-demo-standalone']);
  assert.deepEqual({ ...RETURN_TARGETS['customer-agent'] },
    { label: 'Customer Agent LAB', proxyPath: '/customer-agent/', directUrl: 'http://127.0.0.1:5603/' });
  assert.deepEqual({ ...RETURN_TARGETS['ai-demo-standalone'] },
    { label: 'AI Demo Standalone', proxyPath: '/ai-demo-standalone/', directUrl: 'http://127.0.0.1:7810/' });
  assert.ok(Object.isFrozen(RETURN_TARGETS) && Object.isFrozen(RETURN_TARGETS['customer-agent']));
  assert.throws(() => { 'use strict'; RETURN_TARGETS.evil = {}; });
});

test('a valid hand-off reads from, uc and vertical', () => {
  assert.deepEqual(readReturnContext('?from=customer-agent&uc=UC47&vertical=banking&user=alex.morgan'),
    { from: 'customer-agent', label: 'Customer Agent LAB', uc: 'UC47', vertical: 'banking' });
  assert.deepEqual(readReturnContext('?from=customer-agent&uc=UC47'),
    { from: 'customer-agent', label: 'Customer Agent LAB', uc: 'UC47', vertical: null });
});

test('ai-demo-standalone hand-off reads uc; unknown still gives no strip', () => {
  assert.deepEqual(readReturnContext('?from=ai-demo-standalone&uc=UC12'),
    { from: 'ai-demo-standalone', label: 'AI Demo Standalone', uc: 'UC12', vertical: null });
});

test('unknown or prototype-ish from gives no strip', () => {
  for (const f of ['other-app', 'toString', '__proto__', 'constructor', 'hasOwnProperty', 'Customer-Agent', '', 'customer-agent ']) {
    assert.equal(readReturnContext(`?from=${encodeURIComponent(f)}&uc=UC1`), null, f);
  }
  assert.equal(readReturnContext('?uc=UC1'), null);
  assert.equal(readReturnContext(''), null);
  assert.equal(readReturnContext(undefined), null);
});

test('bad ids give no strip', () => {
  const bad = ['', 'a b', '<script>', 'UC1/../x', 'x'.repeat(41), 'é', 'UC1%00', 'javascript:alert(1)', '//evil.example', 'a_b'];
  for (const v of bad) {
    assert.equal(readReturnContext(`?from=customer-agent&uc=${encodeURIComponent(v)}`), null, `uc ${v}`);
    assert.equal(readReturnContext(`?from=customer-agent&uc=UC1&vertical=${encodeURIComponent(v)}`), null, `vertical ${v}`);
  }
  assert.equal(readReturnContext('?from=customer-agent'), null, 'uc is required');
});

test('repeated parameters give no strip', () => {
  assert.equal(readReturnContext('?from=customer-agent&from=customer-agent&uc=UC1'), null);
  assert.equal(readReturnContext('?from=customer-agent&uc=UC1&uc=UC2'), null);
  assert.equal(readReturnContext('?from=customer-agent&uc=UC1&vertical=a&vertical=b'), null);
});

test('proxy: Back is the fixed proxy path on this origin, ids only', () => {
  const l = returnLinkFor('a2a-lab', proxy('?from=customer-agent&uc=UC47&vertical=banking'));
  assert.equal(l.href, '/customer-agent/?returned=a2a-lab&uc=UC47');
  assert.ok(!l.href.startsWith('//'));
});

test('proxied vs direct is decided by the path, not the host (the lab proxy is also on loopback)', () => {
  const href = (url) => returnLinkFor('a2a-lab', loc(url)).href;
  const q = '?from=customer-agent&uc=UC47';
  for (const url of [`https://localhost:8443/a2a-lab/${q}`, `http://127.0.0.1:8443/a2a-lab/${q}`, `https://labs.example/a2a-lab/deep/page${q}`]) {
    assert.equal(href(url), '/customer-agent/?returned=a2a-lab&uc=UC47', url);
  }
  for (const url of [`http://127.0.0.1:5150/${q}`, `http://localhost:5150/index.html${q}`, `http://[::1]:5150/${q}`]) {
    assert.equal(href(url), 'http://127.0.0.1:5603/?returned=a2a-lab&uc=UC47', url);
  }
  assert.equal(isProxiedPath('/a2a-lab/'), true);
  assert.equal(isProxiedPath('/'), false);
  assert.equal(isProxiedPath('/index.html'), false);
  assert.equal(isProxiedPath('//evil.example/'), false);
  assert.equal(isProxiedPath(undefined), false);
});

test('open-redirect attempts never reach the href', () => {
  const attempts = [
    '?from=customer-agent&uc=UC1&next=https://evil.example/',
    '?from=customer-agent&uc=UC1&returnTo=//evil.example',
    '?from=https://evil.example/&uc=UC1',
    '?from=//evil.example&uc=UC1',
    '?from=customer-agent&uc=UC1&directUrl=https://evil.example/',
    '?from=customer-agent&uc=evil.example&vertical=evil.example',
  ];
  for (const s of attempts) {
    for (const loc of [proxy(s), direct(s)]) {
      const l = returnLinkFor('a2a-lab', loc);
      if (!l) continue;
      const u = new URL(l.href, 'https://labs.example/a2a-lab/');
      assert.ok(['https://labs.example', 'http://127.0.0.1:5603'].includes(u.origin), `${s} -> ${l.href}`);
      assert.ok(['/customer-agent/', '/'].includes(u.pathname), `${s} -> ${l.href}`);
      assert.deepEqual([...u.searchParams.keys()], ['returned', 'uc']);
    }
  }
  // The uc travels only as a query value, encoded.
  assert.equal(returnLinkFor('a2a-lab', proxy('?from=customer-agent&uc=evil.example')).href,
    '/customer-agent/?returned=a2a-lab&uc=evil.example');
});

test('a bad self id or a hand-made context gives no href', () => {
  const ctx = readReturnContext('?from=customer-agent&uc=UC1');
  const at = { pathname: '/a2a-lab/' };
  assert.equal(backHref(ctx, 'bad id', at), null);
  assert.equal(backHref(ctx, undefined, at), null);
  assert.equal(backHref({ from: 'evil', uc: 'UC1' }, 'a2a-lab', at), null);
  assert.equal(backHref({ from: 'customer-agent', uc: '../x' }, 'a2a-lab', at), null);
  assert.equal(backHref(null, 'a2a-lab', at), null);
  assert.equal(returnLinkFor('a2a-lab', null), null);
});
