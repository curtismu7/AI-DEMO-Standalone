#!/usr/bin/env node
/**
 * Static UI pattern check for the standalone -LAB apps, per PAGE, with an allowlist and mutation tests.
 * Mirrors AI-DEMO2's demo_api_ui/scripts/check-ui-patterns.mjs (the model) against the patterns in
 * shared/STANDALONE-UI-PATTERNS.md and the rulebook (STANDALONE-RULES.md). Plain Node ESM, no dependencies,
 * no browser, no network: it only reads files.
 *
 * A PAGE is what a visitor can open in one app:
 *   - every served .html file that has its own markup (public/foo.html), and
 *   - for a Vite/React single-page app (web/index.html with <div id="root"> and a module script): every VIEW the
 *     app switches between. Views are found in the entry (main.jsx) or in the component it mounts, from a route
 *     table ([id, label, View] / {id, View} / {"/path": View}), a conditional (`tab === "x" && <X/>`), or a
 *     path/hash ternary chain. An app whose views cannot be found is one page named "index".
 *   The page's markup is the app chrome (everything the entry imports that is not a view) plus the view and what
 *     it imports; its CSS is every stylesheet those files import (following @import) plus <style> blocks and
 *     inline style attributes. Vendored shared components (floating-dialog, evidence, return-link, hop-detail,
 *     shelf-link) are not judged: they are pinned byte for byte by their own checks.
 *
 * Rules (stable ids; status PASS / DRIFT / WARN / INFO; DRIFT is what an enforced page may not have):
 *   P1  app shell: exactly one shell-bar (or InspectorShell) and one page header, styled
 *   P2  simulation banner is the FIRST content element, has text, and is not a hardcoded "live"
 *   P3  page content sits in <main> inside a centred max-width frame
 *   P4  cards: bordered, token top edge (accent edge optional)
 *   P6  inspector layout (Tester tier): three parts when used
 *   P7  chips: text + a semantic tone from tokens, never colour alone
 *   P9  exactly ONE primary button per view state (a dialog is its own state)
 *   P10 button colours read only the shared tokens and resolve to the fixed Ping Red gradient
 *   P11 every modal is a FloatingDialog (advisory)
 *   H1  exactly one h1 and one main landmark
 *   H2  headings do not skip levels (advisory)
 *   H3  no inline style colours, font-size, or hardcoded hex in markup attributes
 *   T1  theme tokens only: no colour literals in the app's own CSS outside token definitions; no purple hues
 *   T2  font-size floor 10px
 *   T3  dark and light both defined
 *   A1  buttons, links and form controls have an accessible name
 *   A2  no outline:none without a replacement focus style
 *   A3  every img has alt
 *   V1  the page loads a standalone-ui.css identical to shared/standalone-ui.css
 *   M1  Mock / Real toggle on the page, wired to /api/mode
 *   C1  token contrast: primary gradient, chips, muted text, borders, focus ring (>= 4.5 text, >= 3 non-text)
 *
 * ALLOWLIST (scripts/ui-pattern-converted.txt, one `<app>/<page>` per line): a DRIFT on an enforced page FAILS
 * (exit 1); every other page is advisory and only reported. Convert a page, then add its line in the same PR.
 *
 * Escape hatch (use rarely): a comment `ui-pattern: allow <RULE> <reason of 8+ characters>` on the finding's line or
 * the line above lets that one finding through. Every escape is listed in the report.
 *
 * What it does NOT see (the browser checks in light, dark and 375px still apply): real contrast of computed
 * colours (only the shared tokens are checked), horizontal overflow at 375px, keyboard behaviour, markup built at
 * run time by JavaScript (innerHTML, createElement), a banner or button that only a child component outside the
 * page's imports renders, CSS-in-JS, and values set at run time (customer accent, skin, theme from storage).
 * A clean run means "none of these patterns found", not "the page is right".
 *
 *   node scripts/check-ui-patterns.mjs [app-dir ...]    report every page, enforce the allowlist
 *     --root <dir>        directory of apps (default: standalone/ of this repo)
 *     --app <name>        only this app (repeatable)
 *     --allowlist <file>  allowlist file (default: scripts/ui-pattern-converted.txt)
 *     --canonical <file>  canonical standalone-ui.css (default: shared/standalone-ui.css)
 *     --strict            enforce every page
 *     --json              machine-readable report on stdout
 *     --list-advisory     advisory pages sorted by fewest DRIFT rules (the next ones to convert)
 *     --verbose           every rule row for every page
 *     --require-checkout  an allowlisted app that is not checked out fails (CI)
 *     --rules             print the rule ids and what they mean
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');
export const DEFAULT_ROOT = path.join(REPO_ROOT, 'standalone');
export const ALLOWLIST = path.join(HERE, 'ui-pattern-converted.txt');
export const CANONICAL_CSS = path.join(REPO_ROOT, 'shared', 'standalone-ui.css');

export const RULES = {
  P1: 'app shell: exactly one shell-bar (or InspectorShell) and one page header, and the shell is styled',
  P2: 'simulation banner is the first content element, has text, states mock/real honestly (not a hardcoded live)',
  P3: 'content inside <main> in a centred max-width page frame',
  P4: 'cards are bordered with a token top edge (accent edge optional) and are styled',
  P6: 'inspector layout (tree + form + output) is complete where used; Tester pages that probe use it',
  P7: 'chips carry text and a semantic tone class from tokens, never colour alone',
  P9: 'exactly one primary button per view state (a dialog is its own state)',
  P10: 'button colours read only shared tokens; the primary resolves to the fixed Ping Red gradient',
  P11: 'every modal is a FloatingDialog (advisory)',
  H1: 'exactly one h1 and one main landmark',
  H2: 'headings do not skip levels (advisory)',
  H3: 'no inline style colours or font-size, no hardcoded colour in markup attributes',
  T1: 'theme tokens only: no colour literals in own CSS outside token definitions; purple/violet/indigo hues drift',
  T2: 'font-size floor of 10px',
  T3: 'dark and light themes are both defined',
  A1: 'buttons, links and form controls have an accessible name',
  A2: 'no outline:none without a replacement focus style',
  A3: 'every img has alt (role=img needs a label)',
  V1: 'the page loads a standalone-ui.css identical to the canonical shared/standalone-ui.css',
  M1: 'a visible Mock / Real toggle on the page, wired to /api/mode',
  C1: 'token contrast of the primary gradient, chips, muted text, borders and focus ring (4.5:1 text, 3:1 non-text)',
};
export const RULE_IDS = Object.keys(RULES);

// ============================== text helpers ==============================

const blankKeepNl = (m) => m.replace(/[^\n]/g, ' ');

/** Remove JS/JSX comments without touching `//` inside URLs; keeps line numbers. */
export function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blankKeepNl)
    .replace(/(^|[^:'"`\\\w])\/\/[^\n]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length));
}
const stripHtmlComments = (src) => src.replace(/<!--[\s\S]*?-->/g, blankKeepNl);
const stripCssComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, blankKeepNl);

function lineIndexer(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i += 1) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return (idx) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

const ESCAPE_RE = /(?:\/\*|<!--)\s*ui-pattern:\s*allow\s+([A-Z]\d+|\*)\s+([^*]{8,}?)\s*(?:\*\/|-->)/g;
/** `ui-pattern: allow <RULE> <reason>` comments: [{ line, rule, reason }]. A reason under 8 characters is not an escape. */
function scanEscapes(raw) {
  const li = lineIndexer(raw);
  return [...raw.matchAll(ESCAPE_RE)].map((m) => ({ line: li(m.index), rule: m[1], reason: m[2].trim() }));
}

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

/** Index just after the quote that closes the string starting at i (templates skip ${...}). */
function skipQuoted(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') j += 2;
    else if (c === q) return j + 1;
    else if (q === '`' && c === '$' && src[j + 1] === '{') j = closeBracket(src, j + 1);
    else j += 1;
  }
  return src.length;
}
/** Index just after the bracket closing the one at i. */
function closeBracket(src, i) {
  let depth = 0;
  for (let j = i; j < src.length; ) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') {
      j = skipQuoted(src, j);
      continue;
    }
    if (c === '{' || c === '(' || c === '[') depth += 1;
    else if (c === '}' || c === ')' || c === ']') {
      depth -= 1;
      if (depth === 0) return j + 1;
    }
    j += 1;
  }
  return src.length;
}

// ============================== markup (HTML + JSX) ==============================

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style']);

function readTag(src, i) {
  const nm = /^<([A-Za-z][\w.:-]*)/.exec(src.slice(i, i + 120));
  if (!nm) return null;
  let j = i + nm[0].length;
  let depth = 0;
  let quote = null;
  for (; j < src.length; j += 1) {
    const c = src[j];
    if (quote) {
      if (c === '\\' && quote === '`') j += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '`' && depth > 0) quote = '`';
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) break;
  }
  const attrsRaw = src.slice(i + nm[0].length, j);
  return { name: nm[1], attrsRaw, end: j + 1, selfClosing: /\/\s*$/.test(attrsRaw) };
}

function parseAttrs(raw) {
  const attrs = new Map();
  let spread = false;
  let i = 0;
  const n = raw.length;
  while (i < n) {
    while (i < n && /\s/.test(raw[i])) i += 1;
    if (i >= n) break;
    if (raw[i] === '/') {
      i += 1;
      continue;
    }
    if (raw[i] === '{') {
      const e = closeBracket(raw, i);
      if (raw.slice(i + 1, i + 4) === '...') spread = true;
      i = e;
      continue;
    }
    const m = /^[^\s=/>{}"']+/.exec(raw.slice(i));
    if (!m) {
      i += 1;
      continue;
    }
    const name = m[0];
    i += name.length;
    while (i < n && /\s/.test(raw[i])) i += 1;
    if (raw[i] === '=') {
      i += 1;
      while (i < n && /\s/.test(raw[i])) i += 1;
      if (raw[i] === '"' || raw[i] === "'") {
        const e = raw.indexOf(raw[i], i + 1);
        attrs.set(name, { type: 'str', text: raw.slice(i + 1, e < 0 ? n : e) });
        i = e < 0 ? n : e + 1;
      } else if (raw[i] === '{') {
        const e = closeBracket(raw, i);
        attrs.set(name, { type: 'expr', text: raw.slice(i + 1, e - 1) });
        i = e;
      } else {
        const mm = /^[^\s>]+/.exec(raw.slice(i));
        attrs.set(name, { type: 'str', text: mm ? mm[0] : '' });
        i += mm ? mm[0].length : 0;
      }
    } else attrs.set(name, { type: 'bool', text: '' });
  }
  return { attrs, spread };
}

/**
 * Parse HTML or JSX source into an element tree. Each element:
 * { name, attrs, spread, index, end, fullEnd, innerStart, innerEnd, line, parent, children, raw, file, src, seq }.
 */
export function parseMarkup(src, { kind, file }) {
  const li = lineIndexer(src);
  const els = [];
  const root = { name: '#root', children: [], parent: null, innerStart: 0, innerEnd: src.length };
  const stack = [root];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) break;
    if (src[lt + 1] === '/') {
      const m = /^<\/([A-Za-z][\w.:-]*)\s*>/.exec(src.slice(lt, lt + 120));
      if (m) {
        for (let k = stack.length - 1; k >= 1; k -= 1) {
          if (stack[k].name === m[1]) {
            for (let q = stack.length - 1; q >= k; q -= 1) {
              stack[q].innerEnd = lt;
              stack[q].fullEnd = q === k ? lt + m[0].length : lt;
            }
            stack.length = k;
            break;
          }
        }
        i = lt + m[0].length;
      } else i = lt + 2;
      continue;
    }
    const prev = src[lt - 1];
    if (kind === 'jsx' && prev && /[\w$)\]]/.test(prev)) {
      i = lt + 1;
      continue;
    }
    const tag = readTag(src, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }
    const { attrs, spread } = parseAttrs(tag.attrsRaw);
    const parent = stack[stack.length - 1];
    const el = {
      name: tag.name, attrs, spread, index: lt, end: tag.end, fullEnd: tag.end, innerStart: tag.end, innerEnd: tag.end,
      line: li(lt), parent, children: [], raw: null, file, src, seq: els.length,
    };
    els.push(el);
    parent.children.push(el);
    i = tag.end;
    const lname = tag.name.toLowerCase();
    if (tag.selfClosing || VOID.has(lname)) continue;
    if (RAW_TEXT.has(lname)) {
      const close = src.toLowerCase().indexOf(`</${lname}`, tag.end);
      const e = close === -1 ? src.length : close;
      el.raw = src.slice(tag.end, e);
      el.innerEnd = e;
      const gt = src.indexOf('>', e);
      el.fullEnd = gt === -1 ? src.length : gt + 1;
      i = el.fullEnd;
      continue;
    }
    el.innerEnd = src.length;
    el.fullEnd = src.length;
    stack.push(el);
  }
  return { els, root, src, file, kind, lineOf: li };
}

const attrOf = (el, ...names) => {
  for (const n of names) if (el.attrs.has(n)) return el.attrs.get(n);
  return null;
};
const attrText = (el, ...names) => {
  const a = attrOf(el, ...names);
  return a ? a.text : null;
};

/** Class tokens an element can carry: literal classes plus every quoted piece of a className expression. Dynamic tails come as `prefix*`. */
function classTokens(el) {
  const a = attrOf(el, 'className', 'class');
  if (!a) return [];
  if (a.type === 'str') return a.text.split(/\s+/).filter(Boolean);
  if (a.type === 'bool') return [];
  const out = new Set();
  for (const m of a.text.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    for (const mm of m[2].matchAll(/([\w-]+)\$\{/g)) out.add(`${mm[1]}*`);
    for (const t of m[2].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (t) out.add(t);
  }
  return [...out];
}
const hasClass = (el, re) => classTokens(el).some((t) => re.test(t));

const ancestors = (el) => {
  const out = [];
  for (let p = el.parent; p && p.name !== '#root'; p = p.parent) out.push(p);
  return out;
};
const nameIs = (el, ...names) => names.includes(el.name);

const BLANK_EXPR = /^\s*(?:""|''|``|" "|' '|null|undefined|false|true|void 0)?\s*$/;
/** Visible text (or a non-blank expression, taken as text) directly or deeply inside an element. */
function hasText(el) {
  if (el.raw !== null) return false;
  let t = el.src.slice(el.innerStart, el.innerEnd);
  // drop aria-hidden decorations and child tags, keep their text
  t = t.replace(/<[A-Za-z][^>]*aria-hidden[^>]*\/>/g, '').replace(/<([A-Za-z][\w.]*)[^>]*aria-hidden[^>]*>[\s\S]*?<\/\1>/g, '');
  let out = '';
  for (let i = 0; i < t.length; ) {
    if (t[i] === '{') {
      const e = closeBracket(t, i);
      const expr = t.slice(i + 1, e - 1);
      if (!BLANK_EXPR.test(expr) && !/^\s*\/\*[\s\S]*\*\/\s*$/.test(expr) && expr.trim() !== '') out += 'x';
      i = e;
    } else if (t[i] === '<') {
      const gt = t.indexOf('>', i);
      i = gt === -1 ? t.length : gt + 1;
    } else {
      out += t[i];
      i += 1;
    }
  }
  return out.replace(/&(?:nbsp|ensp|emsp|thinsp|zwnj|zwj);|&#(?:160|8203);/g, '').replace(/[\s​-‍⁠﻿]/g, '').length > 0;
}

/** Inner text, plain, for messages and the hardcoded-live test (expressions become a marker). */
function innerPlain(el) {
  let t = el.src.slice(el.innerStart, el.innerEnd);
  let out = '';
  for (let i = 0; i < t.length; ) {
    if (t[i] === '{') {
      const e = closeBracket(t, i);
      const expr = t.slice(i + 1, e - 1);
      const lit = /^\s*(["'`])([^"'`]*)\1\s*$/.exec(expr);
      out += lit ? lit[2] : BLANK_EXPR.test(expr) ? '' : '\u0001';
      i = e;
    } else if (t[i] === '<') {
      const gt = t.indexOf('>', i);
      i = gt === -1 ? t.length : gt + 1;
    } else {
      out += t[i];
      i += 1;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Alternatives of a ternary written in JSX sit in different arms and never render together.
function gapBefore(el) {
  const p = el.parent;
  const idx = p.children.indexOf(el);
  const start = idx > 0 ? p.children[idx - 1].fullEnd : p.innerStart;
  return el.src.slice(start, el.index);
}
function chainInfo(el) {
  if (el._chain !== undefined) return el._chain;
  const p = el.parent;
  let chain = null;
  let branch = 0;
  let cid = 0;
  for (const c of p.children) {
    const gap = gapBefore(c);
    if (/\?\s*\(?\s*$/.test(gap)) {
      cid += 1;
      chain = `${p.seq ?? 'r'}:${p.index ?? 0}:${cid}`;
      branch = 0;
    } else if (chain && /^[\s)]*:\s*(?:[^<{}:]*\?\s*)?\(?\s*$/.test(gap)) branch += 1;
    else chain = null;
    c._chain = chain ? { chain, branch } : null;
  }
  return el._chain;
}
/** The early-return branch an element renders in (`if (loading) return <main>..`): a separate state of its component, or null. */
function guardOf(el) {
  if (el._guard !== undefined) return el._guard;
  let g = null;
  for (let e = el; e && e.name !== '#root'; e = e.parent) {
    if (/\bif\s*\([^;{}]*\)\s*\{?\s*return\s*\(?\s*$/.test(gapBefore(e))) {
      g = e;
      break;
    }
  }
  el._guard = g;
  return g;
}
/** True when a and b are in different arms of the same ternary (somewhere up their ancestry). */
function exclusive(a, b) {
  if (guardOf(a) !== guardOf(b)) return true;
  const ca = [];
  for (let e = a; e && e.name !== '#root'; e = e.parent) ca.push(chainInfo(e));
  for (let e = b; e && e.name !== '#root'; e = e.parent) {
    const ci = chainInfo(e);
    if (ci && ca.some((x) => x && x.chain === ci.chain && x.branch !== ci.branch)) return true;
  }
  return false;
}
/** The largest number of these elements that can render together. */
function maxSimultaneous(list) {
  const n = list.length;
  if (n <= 1) return n;
  if (n > 14) return n;
  let best = 1;
  const rec = (i, picked) => {
    if (picked.length + (n - i) <= best) return;
    if (i === n) {
      best = Math.max(best, picked.length);
      return;
    }
    if (picked.every((p) => !exclusive(p, list[i]))) rec(i + 1, [...picked, list[i]]);
    rec(i + 1, picked);
  };
  rec(0, []);
  return best;
}
/** Is the element rendered by a .map()/.flatMap()/.forEach()/Array.from() callback (once per item)? */
function inLoop(el) {
  for (let e = el; e && e.name !== '#root'; e = e.parent) {
    const gap = gapBefore(e);
    const m = /(?:\.\s*(?:map|flatMap|forEach)|\bArray\.from)\s*\(/g;
    let last = null;
    for (let mm = m.exec(gap); mm; mm = m.exec(gap)) last = mm;
    if (last) {
      const rest = gap.slice(last.index + last[0].length);
      // string-aware: parens inside string/template literals do not count
      let depth = 1;
      for (let k = 0; k < rest.length && depth > 0; ) {
        const ch = rest[k];
        if (ch === '"' || ch === "'" || ch === '`') {
          k = skipQuoted(rest, k);
          continue;
        }
        if (ch === '(') depth += 1;
        else if (ch === ')') depth -= 1;
        k += 1;
      }
      if (depth > 0) return true;
    }
  }
  return false;
}
const isConditionalClass = (el) => {
  const a = attrOf(el, 'className', 'class');
  return Boolean(a && a.type === 'expr' && /\?|&&|\|\|/.test(a.text));
};

// ============================== CSS ==============================

export function parseCss(css, file = '') {
  const src = stripCssComments(css);
  const li = lineIndexer(src);
  const rules = [];
  const imports = [];
  const matchBrace = (from, end) => {
    let depth = 0;
    let q = null;
    for (let j = from; j < end; j += 1) {
      const c = src[j];
      if (q) {
        if (c === '\\') j += 1;
        else if (c === q) q = null;
      } else if (c === '"' || c === "'") q = c;
      else if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) return j;
      }
    }
    return end;
  };
  const parseBlock = (start, end, ctx) => {
    let i = start;
    while (i < end) {
      while (i < end && /\s/.test(src[i])) i += 1;
      if (i >= end) break;
      let j = i;
      let paren = 0;
      let q = null;
      for (; j < end; j += 1) {
        const c = src[j];
        if (q) {
          if (c === '\\') j += 1;
          else if (c === q) q = null;
          continue;
        }
        if (c === '"' || c === "'") q = c;
        else if (c === '(') paren += 1;
        else if (c === ')') paren -= 1;
        else if (paren === 0 && (c === ';' || c === '{' || c === '}')) break;
      }
      const head = src.slice(i, j).trim();
      if (src[j] === '{') {
        const close = matchBrace(j, end);
        if (/^@(?:media|supports|layer|container|scope|document|starting-style)\b/i.test(head)) {
          parseBlock(j + 1, close, { ...ctx, at: [...ctx.at, head] });
        } else if (!head.startsWith('@')) {
          const sel = ctx.rule
            ? head.split(',').map((s) => (s.includes('&') ? s.replace(/&/g, ctx.rule.selector) : `${ctx.rule.selector} ${s.trim()}`)).join(', ')
            : head;
          const rule = { selector: sel.replace(/\s+/g, ' '), decls: [], at: ctx.at, line: li(i), file };
          rules.push(rule);
          parseBlock(j + 1, close, { ...ctx, rule });
        }
        i = close + 1;
      } else {
        if (/^@import\b/i.test(head)) imports.push(head);
        else if (ctx.rule && head.includes(':')) {
          const c = head.indexOf(':');
          const prop = head.slice(0, c).trim().toLowerCase();
          const value = head.slice(c + 1).replace(/\s*!important\s*$/i, '').trim();
          if (prop) ctx.rule.decls.push({ prop: prop.startsWith('--') ? head.slice(0, c).trim() : prop, value, line: li(i) });
        }
        i = j + 1;
      }
    }
  };
  parseBlock(0, src.length, { at: [], rule: null });
  return { rules, imports };
}

const isDarkAt = (rule) => rule.at.some((a) => /prefers-color-scheme:\s*dark/i.test(a));
const isLightAt = (rule) => rule.at.some((a) => /prefers-color-scheme:\s*light/i.test(a));
const selParts = (selector) => selector.split(',').map((s) => s.trim());
const subjectOf = (part) => {
  let depth = 0;
  let cur = '';
  let last = '';
  for (const ch of part.trim()) {
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (depth === 0 && (/\s/.test(ch) || ch === '>' || ch === '+' || ch === '~')) {
      if (cur) last = cur;
      cur = '';
    } else cur += ch;
  }
  return cur || last;
};
const classesOfCompound = (c) => [...c.replace(/:not\([^)]*\)/g, '').matchAll(/\.((?:[\w-]|\\.)+)/g)].map((m) => m[1].replace(/\\/g, ''));
const tagOfCompound = (c) => (/^[A-Za-z][\w-]*/.exec(c) || [''])[0].toLowerCase();

/** Custom properties per theme from the rules ({light, dark}); `--x` -> raw value. */
function tokenMaps(rulesList) {
  const light = new Map();
  const darkOnly = new Map();
  for (const rule of rulesList) {
    const root = selParts(rule.selector).some((s) => /^(?::root|html|body)\b/i.test(s) || s === '*');
    if (!root) continue;
    const dark = isDarkAt(rule) || selParts(rule.selector).some((s) => /\[data-theme=["']?dark["']?\]/i.test(s));
    const forcedLight = selParts(rule.selector).some((s) => /\[data-theme=["']?light["']?\]/i.test(s)) && !dark;
    for (const d of rule.decls) {
      if (!d.prop.startsWith('--')) continue;
      if (dark) darkOnly.set(d.prop, d.value);
      else if (!isLightAt(rule) || true) {
        if (!forcedLight || !light.has(d.prop)) light.set(d.prop, d.value);
      }
    }
  }
  return { light, dark: new Map([...light, ...darkOnly]) };
}

function resolveVars(value, tokens, depth = 0) {
  if (depth > 8) return value;
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (m, name, fb) => {
    if (tokens.has(name)) return resolveVars(tokens.get(name), tokens, depth + 1);
    return fb !== undefined ? resolveVars(fb, tokens, depth + 1) : m;
  });
}

// ============================== colour ==============================

const NAMED = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0],
  orange: [255, 165, 0], gray: [128, 128, 128], grey: [128, 128, 128], silver: [192, 192, 192], maroon: [128, 0, 0],
  olive: [128, 128, 0], lime: [0, 255, 0], aqua: [0, 255, 255], cyan: [0, 255, 255], teal: [0, 128, 128], navy: [0, 0, 128],
  pink: [255, 192, 203], brown: [165, 42, 42], gold: [255, 215, 0], crimson: [220, 20, 60], tomato: [255, 99, 71],
  indigo: [75, 0, 130], violet: [238, 130, 238], purple: [128, 0, 128], magenta: [255, 0, 255], fuchsia: [255, 0, 255],
  rebeccapurple: [102, 51, 153], blueviolet: [138, 43, 226], darkviolet: [148, 0, 211], mediumpurple: [147, 112, 219],
  slateblue: [106, 90, 205], darkslateblue: [72, 61, 139], mediumslateblue: [123, 104, 238], orchid: [218, 112, 214],
  plum: [221, 160, 221], lavender: [230, 230, 250], whitesmoke: [245, 245, 245], lightgray: [211, 211, 211],
  lightgrey: [211, 211, 211], darkgray: [169, 169, 169], darkgrey: [169, 169, 169], dimgray: [105, 105, 105],
  steelblue: [70, 130, 180], royalblue: [65, 105, 225], dodgerblue: [30, 144, 255], skyblue: [135, 206, 235],
  darkred: [139, 0, 0], darkgreen: [0, 100, 0], darkblue: [0, 0, 139], coral: [255, 127, 80], salmon: [250, 128, 114],
};
const VIOLET_NAMES = new Set(['indigo', 'violet', 'purple', 'magenta', 'fuchsia', 'rebeccapurple', 'blueviolet', 'darkviolet', 'mediumpurple', 'slateblue', 'darkslateblue', 'mediumslateblue', 'orchid']);
const KEEP = new Set(['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert', 'none', 'auto', 'canvas', 'canvastext']);
const clamp255 = (v) => Math.min(255, Math.max(0, Math.round(v)));

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => clamp255(v * 255));
}

/** A single colour literal (hex, rgb(a), hsl(a), named) -> [r,g,b] (+ alpha as 4th), or null. */
export function parseColour(text) {
  const t = text.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(t);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const rgb = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
    if (h.length === 8) rgb.push(parseInt(h.slice(6, 8), 16) / 255);
    return rgb;
  }
  m = /^(rgba?)\(([^)]*)\)$/.exec(t);
  if (m) {
    const parts = m[2].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = (p) => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p));
    const rgb = parts.slice(0, 3).map((p) => clamp255(ch(p)));
    if (rgb.some(Number.isNaN)) return null;
    if (parts[3] !== undefined) rgb.push(parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]));
    return rgb;
  }
  m = /^(hsla?)\(([^)]*)\)$/.exec(t);
  if (m) {
    const parts = m[2].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1]) / 100;
    const l = parseFloat(parts[2]) / 100;
    if ([h, s, l].some(Number.isNaN)) return null;
    const rgb = hslToRgb(((h % 360) + 360) % 360, s, l);
    if (parts[3] !== undefined) rgb.push(parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]));
    return rgb;
  }
  if (NAMED[t]) return [...NAMED[t]];
  return null;
}

/** hue 235-310 deg with HSL saturation > 20% and chroma >= 0.12: violet / indigo / purple. Ping blue #12538d is hue 209. */
export function isVioletRgb([r8, g8, b8]) {
  const [r, g, b] = [r8, g8, b8].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.12) return false;
  const l = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return s > 0.2 && h >= 235 && h <= 310;
}

const COLOUR_FN_RE = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/gi;
/** Every colour literal in a CSS value: [{ text, rgb, violet, named }]. url(), strings and var() names are skipped. */
export function scanColourLiterals(value) {
  const v = value.replace(/url\([^)]*\)/gi, ' ').replace(/(["'])(?:\\.|(?!\1).)*\1/g, ' ');
  const found = [];
  const taken = [];
  for (const m of v.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    found.push({ text: m[0], rgb: parseColour(m[0]), index: m.index });
    taken.push([m.index, m.index + m[0].length]);
  }
  COLOUR_FN_RE.lastIndex = 0;
  for (let m = COLOUR_FN_RE.exec(v); m; m = COLOUR_FN_RE.exec(v)) {
    const open = m.index + m[0].length - 1;
    const end = closeBracket(v, open);
    const text = v.slice(m.index, end);
    const name = m[0].slice(0, -1).toLowerCase();
    if (/^(rgba?|hsla?)$/.test(name)) found.push({ text, rgb: parseColour(text), index: m.index });
    else {
      // color-mix / light-dark / lab / ...: look at the colour literals inside; the function itself is a literal
      const inner = [...scanColourLiterals(text.slice(m[0].length, -1))];
      found.push({ text, rgb: inner.length ? inner[0].rgb : null, index: m.index, innerViolet: inner.some((x) => x.violet) });
    }
    taken.push([m.index, end]);
    COLOUR_FN_RE.lastIndex = end;
  }
  const rest = v.replace(/var\([^)]*\)/g, (s) => ' '.repeat(s.length));
  for (const m of rest.matchAll(/(?<![\w#-])([a-z]+)(?![\w-])/gi)) {
    const w = m[1].toLowerCase();
    if (KEEP.has(w) || !(w in NAMED)) continue;
    if (taken.some(([a, b]) => m.index >= a && m.index < b)) continue;
    found.push({ text: m[1], rgb: NAMED[w], index: m.index, named: true, violetName: VIOLET_NAMES.has(w) });
  }
  return found.map((f) => ({ ...f, violet: Boolean(f.innerViolet || f.violetName || (f.rgb && isVioletRgb(f.rgb))) }));
}

const lin = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const over = (fg, bg) => (fg.length > 3 && fg[3] < 1 ? fg.slice(0, 3).map((c, i) => clamp255(c * fg[3] + bg[i] * (1 - fg[3]))) : fg.slice(0, 3));

// ============================== files and imports ==============================

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.vite', '.next', '__tests__', 'tests', 'test', 'fixtures', 'docs', 'mocks', 'mock', 'e2e', 'playwright-report', 'data', '.data', 'storybook-static']);
const VENDORED_DIRS = new Set(['floating-dialog', 'evidence', 'return-link', 'hop-detail', 'shelf-link']);
const CODE_EXT = /\.(?:[cm]?[jt]sx?)$/i;
const RESOLVE_EXT = ['', '.jsx', '.js', '.tsx', '.ts', '.mjs', '/index.jsx', '/index.js', '/index.tsx', '/index.ts'];

function resolveLocal(fromFile, spec, htmlRoot) {
  if (!spec || /^(?:https?:|data:|\/\/|#)/.test(spec)) return null;
  const clean = spec.split(/[?#]/)[0];
  const base = clean.startsWith('/') ? path.join(htmlRoot, clean) : path.resolve(path.dirname(fromFile), clean);
  for (const ext of RESOLVE_EXT) {
    const p = base + ext;
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {
      /* try the next extension */
    }
  }
  return null;
}

function walkFiles(dir, out = []) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isSymbolicLink()) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walkFiles(p, out);
    } else out.push(p);
  }
  return out;
}

class FileCache {
  constructor() {
    this.text = new Map();
    this.markup = new Map();
    this.css = new Map();
  }

  read(p) {
    if (!this.text.has(p)) {
      let t = '';
      try {
        t = fs.readFileSync(p, 'utf8');
      } catch {
        /* unreadable: empty */
      }
      this.text.set(p, t);
    }
    return this.text.get(p);
  }

  parseMarkupFile(p, rel) {
    if (!this.markup.has(p)) {
      const raw = this.read(p);
      const isHtml = /\.html?$/i.test(p);
      const src = isHtml ? stripHtmlComments(raw) : stripJsComments(raw);
      const doc = parseMarkup(src, { kind: isHtml ? 'html' : 'jsx', file: rel });
      doc.escapes = scanEscapes(raw);
      this.markup.set(p, doc);
    }
    return this.markup.get(p);
  }

  parseCssFile(p) {
    if (!this.css.has(p)) {
      const raw = this.read(p);
      this.css.set(p, { ...parseCss(raw, p), raw, escapes: scanEscapes(raw) });
    }
    return this.css.get(p);
  }
}

function localImports(src) {
  const out = [];
  for (const m of src.matchAll(/\bimport\s+(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)|\brequire\(\s*["']([^"']+)["']\s*\)|\bnew URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/g)) {
    const spec = m[1] || m[2] || m[3];
    if (spec && (spec.startsWith('.') || spec.startsWith('/'))) out.push(spec);
  }
  return out;
}

// ============================== page discovery ==============================

const CHROME_NAMES = /^(?:App|AppShell|Layout|Shell|Header|Footer|Nav|Navbar|TopBar|ShelfLink|ModeToggle|ModeBanner|HostedBanner|ErrorBoundary|Provider|\w*Provider|StrictMode|Suspense|Fragment|ThemeToggle|PresenterToggle|FloatingDialog|ReturnLink)$/;
const VIEW_DIR = /(?:^|[\\/])(?:pages|views|screens|routes|tabs|panels)[\\/]/i;

function importMap(src, fileDir, htmlRoot) {
  const map = new Map();
  const add = (name, spec) => {
    if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) return;
    if (!(spec.startsWith('.') || spec.startsWith('/'))) return;
    const f = resolveLocal(path.join(fileDir, '_'), spec, htmlRoot);
    if (f && CODE_EXT.test(f)) map.set(name, f);
  };
  for (const m of src.matchAll(/\bimport\s+([^'"()]+?)\s+from\s+["']([^"']+)["']/g)) {
    const clause = m[1];
    const def = /^([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause.trim());
    if (def) add(def[1], m[2]);
    const named = /\{([^}]*)\}/.exec(clause);
    if (named) {
      for (const part of named[1].split(',')) {
        const mm = /^\s*([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/.exec(part);
        if (mm) add(mm[2] || mm[1], m[2]);
      }
    }
  }
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\w*[Ll]azy\w*\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']/g)) add(m[1], m[2]);
  return map;
}

/** Evidence that component `name` is switched between as a page in the router source; returns { id, how } or null. */
function viewEvidence(S, name) {
  const esc = name.replace(/\$/g, '\\$');
  const CMP = /(?:===?|!==?)\s*(["'])([^"']+)\1|(["'])([^"']+)\3\s*(?:===?|!==?)|\.startsWith\(\s*(["'])([^"']+)\5|case\s+(["'])([^"']+)\7\s*:|\.includes\(\s*(["'])([^"']+)\9\s*\)/g;
  for (const m of S.matchAll(new RegExp(`<${esc}(?=[\\s/>])`, 'g'))) {
    const before = S.slice(Math.max(0, m.index - 280), m.index);
    const cut = Math.max(before.lastIndexOf(';'), before.lastIndexOf('</'), before.lastIndexOf('/>'));
    const window = before.slice(cut + 1);
    let last = null;
    for (const c of window.matchAll(CMP)) last = c;
    if (last) return { id: last[2] || last[4] || last[6] || last[8] || last[10], how: 'conditional' };
  }
  for (const m of S.matchAll(new RegExp(`(?<![\\w$.<])${esc}(?![\\w$])`, 'g'))) {
    const line = S.slice(S.lastIndexOf('\n', m.index) + 1, m.index);
    if (/\bimport\b|\bexport\b|\bfrom\b/.test(line)) continue;
    const around = S.slice(Math.max(0, m.index - 220), m.index);
    let t = /(["'])([^"'\n]+)\1\s*,\s*(["'])[^"'\n]*\3\s*,\s*$/.exec(around);
    if (t) return { id: t[2], how: 'table' };
    t = /(["'])([^"'\n]+)\1\s*:\s*$/.exec(around);
    if (t) return { id: t[2], how: 'table' };
    t = /\.startsWith\(\s*(["'])([^"']+)\1\s*\)\s*\?\s*$/.exec(around);
    if (t) return { id: t[2], how: 'ternary' };
    t = /\b(?:View|Component|component|element|page|Page|Panel|Screen|render)\s*:\s*$/.exec(around);
    if (t) {
      const obj = around.slice(around.lastIndexOf('{'));
      const idm = /\b(?:id|path|key|route|name)\s*:\s*(["'])([^"']+)\1/.exec(obj);
      return { id: idm ? idm[2] : null, how: 'table' };
    }
    t = /(?:\|\||\?\?|:)\s*$/.exec(around);
    if (t && /startsWith\(|ROUTES\b|PAGES\b|\bpath\b|\bhash\b/.test(S)) return { id: null, how: 'default' };
  }
  return null;
}

const normId = (s) => {
  const t = String(s).replace(/^#?\/*/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  return t ? kebab(t.replace(/\//g, '-')) : 'home';
};

function detectViews(cache, rootDirs, entry, htmlRoot, relOf) {
  const views = new Map(); // file -> { id, how, name }
  const routers = [entry];
  const entrySrc = cache.parseMarkupFile(entry, relOf(entry)).src;
  const scan = (routerFile) => {
    const doc = cache.parseMarkupFile(routerFile, relOf(routerFile));
    const imports = importMap(doc.src, path.dirname(routerFile), htmlRoot);
    const found = [];
    for (const [name, file] of imports) {
      if (file === routerFile || CHROME_NAMES.test(name)) continue;
      const sub = cache.parseMarkupFile(file, relOf(file));
      if (!sub.els.length) continue;
      const ev = viewEvidence(doc.src, name);
      const inViewDir = VIEW_DIR.test(file) && new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(doc.src.replace(/^.*\bimport\b.*$/gm, ''));
      if (ev || inViewDir) found.push({ file, name, id: ev && ev.id ? normId(ev.id) : null, how: ev ? ev.how : 'directory' });
    }
    return found;
  };
  let found = scan(entry);
  if (found.length < 2) {
    // the entry only mounts an App/AppShell: look in the files it imports
    const direct = [...importMap(entrySrc, path.dirname(entry), htmlRoot).values()];
    for (const f of direct) {
      if (found.some((x) => x.file === f)) continue;
      routers.push(f);
      const more = scan(f).filter((x) => !found.some((y) => y.file === x.file));
      if (more.length >= 2 || !found.length) found = [...found, ...more];
    }
  }
  const ids = new Set();
  for (const v of found) {
    let id = v.id || kebab(v.name.replace(/(Page|View|Tab|Panel|Screen)$/, '')) || kebab(v.name);
    if (ids.has(id)) id = `${id}-${kebab(v.name)}`;
    let n = 2;
    while (ids.has(id)) id = `${id.replace(/-\d+$/, '')}-${n++}`;
    ids.add(id);
    views.set(v.file, { id, how: v.how, name: v.name });
  }
  return { views, routers };
}

function closure(cache, start, stop, htmlRoot, relOf) {
  const files = new Set();
  const queue = [start];
  while (queue.length) {
    const f = queue.shift();
    if (files.has(f) || (stop.has(f) && f !== start)) continue;
    files.add(f);
    if (!CODE_EXT.test(f)) continue;
    const src = cache.read(f);
    for (const spec of localImports(src)) {
      const r = resolveLocal(f, spec, htmlRoot);
      if (r && (CODE_EXT.test(r) || /\.css$/i.test(r))) queue.push(r);
    }
  }
  return [...files];
}

function readTier(appDir) {
  try {
    const m = /^Tier:\s*(Demo|Tester|Tool)/im.exec(fs.readFileSync(path.join(appDir, 'README.md'), 'utf8'));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Find the pages of one app. Returns { pages: [{ id, kind, file, files, htmlFile? }], note }. */
export function discoverPages(appDir, cache = new FileCache()) {
  const rel = (p) => path.relative(appDir, p).split(path.sep).join('/');
  const all = walkFiles(appDir);
  const htmls = all.filter((f) => /\.html?$/i.test(f));
  if (!htmls.length && !all.some((f) => /\.[jt]sx$/.test(f))) return { pages: [], note: 'no UI files' };
  const pages = [];
  const used = new Set();
  const takeId = (id) => {
    let out = id;
    let n = 2;
    while (used.has(out)) out = `${id}-${n++}`;
    used.add(out);
    return out;
  };
  for (const html of htmls) {
    const doc = cache.parseMarkupFile(html, rel(html));
    const htmlRoot = path.dirname(html);
    const mod = doc.els.find((e) => e.name === 'script' && /module/.test(attrText(e, 'type') || '') && attrText(e, 'src'));
    const mount = doc.els.find((e) => /^(?:root|app)$/.test(attrText(e, 'id') || '') && e.name === 'div');
    const entry = mod ? resolveLocal(html, attrText(mod, 'src'), htmlRoot) : null;
    if (mount && entry && /\.[jt]sx?$/.test(entry) && !doc.els.some((e) => e.name === 'main' || e.name === 'h1')) {
      // single-page app
      const { views } = detectViews(cache, [], entry, htmlRoot, rel);
      const stop = new Set(views.keys());
      const chrome = closure(cache, entry, stop, htmlRoot, rel);
      const cssLinks = doc.els.filter((e) => e.name === 'link' && /stylesheet/i.test(attrText(e, 'rel') || '')).map((e) => resolveLocal(html, attrText(e, 'href'), htmlRoot)).filter(Boolean);
      if (views.size >= 2 || views.size === 1) {
        for (const [vf, v] of views) {
          const own = closure(cache, vf, new Set([...stop].filter((x) => x !== vf)), htmlRoot, rel);
          pages.push({ id: takeId(views.size === 1 ? v.id : v.id), kind: 'view', file: rel(vf), view: vf, how: v.how, files: [...new Set([...chrome, ...own, ...cssLinks])], chrome, entry, htmlFile: html, htmlRoot, viewFile: vf });
        }
      } else {
        pages.push({ id: takeId('index'), kind: 'app', file: rel(entry), files: [...new Set([...chrome, ...cssLinks])], chrome, entry, htmlFile: html, htmlRoot, viewFile: null });
      }
      continue;
    }
    // static HTML page: its markup, local scripts and stylesheets
    const files = [html];
    for (const e of doc.els) {
      const ref = e.name === 'script' ? attrText(e, 'src') : e.name === 'link' && /stylesheet/i.test(attrText(e, 'rel') || '') ? attrText(e, 'href') : null;
      const r = ref && resolveLocal(html, ref, htmlRoot);
      if (r) files.push(r);
    }
    const base = path.basename(html).replace(/\.html?$/i, '');
    const dirName = path.basename(path.dirname(html));
    let id = base === 'index' && pages.some((p) => p.id === 'index') ? kebab(dirName) : base;
    id = takeId(kebab(id) || 'index');
    pages.push({ id, kind: 'html', file: rel(html), files, chrome: [], entry: null, htmlFile: html, htmlRoot, viewFile: null });
  }
  return { pages, note: pages.length ? '' : 'no pages found' };
}

// ============================== page unit ==============================

/**
 * Build what the rules read: ordered markup, css sheets, and the text of every file of the page.
 * `order` is the element sequence of the page as a visitor meets it (layout before the view slot, view, layout after).
 */
function buildUnit(app, page, cache) {
  const rel = (p) => path.relative(app.dir, p).split(path.sep).join('/');
  const docs = [];
  const sheets = [];
  const scripts = [];
  const seenCss = new Set();
  const addCss = (p, importer) => {
    if (seenCss.has(p)) return;
    seenCss.add(p);
    const sheet = cache.parseCssFile(p);
    if (!sheet.relDone) {
      for (const r of sheet.rules) r.file = rel(p);
      sheet.relDone = true;
    }
    sheets.push({ path: p, file: rel(p), parsed: sheet, vendored: isVendored(p), name: path.basename(p), importer });
    for (const imp of sheet.imports) {
      const m = /@import\s+(?:url\()?\s*["']?([^"')\s;]+)/i.exec(imp);
      const r = m && resolveLocal(p, m[1], page.htmlRoot);
      if (r && /\.css$/i.test(r)) addCss(r, p);
    }
  };
  const isVendored = (p) => path.relative(app.dir, p).split(path.sep).some((s) => VENDORED_DIRS.has(s));
  for (const f of page.files) {
    if (/\.css$/i.test(f)) addCss(f, null);
    else if (/\.html?$/i.test(f) || /\.[jt]sx$/i.test(f)) {
      const doc = cache.parseMarkupFile(f, rel(f));
      docs.push({ ...doc, path: f, vendored: isVendored(f) });
    } else if (CODE_EXT.test(f)) scripts.push({ path: f, file: rel(f), text: cache.read(f), vendored: isVendored(f) });
  }
  // JSX files that are also plain scripts contribute their text too (api calls)
  const texts = [...docs.map((d) => ({ path: d.path, file: d.file, text: d.src, vendored: d.vendored })), ...scripts];
  // inline <style> blocks and style attributes are CSS too
  for (const d of docs) {
    for (const e of d.els) {
      if (e.name === 'style' && e.raw) {
        const parsed = { ...parseCss(e.raw, d.file), raw: e.raw, escapes: [] };
        // shift lines to the file
        const base = d.lineOf(e.innerStart) - 1;
        for (const r of parsed.rules) {
          r.line += base;
          for (const dd of r.decls) dd.line += base;
        }
        sheets.push({ path: d.path, file: `${d.file} <style>`, parsed, vendored: d.vendored, name: '<style>', inline: true });
      }
    }
  }
  // order
  let order = [];
  const layoutDocs = docs.filter((d) => !d.vendored && (page.chrome.includes(d.path) || page.kind !== 'view'));
  const viewDoc = page.viewFile ? docs.find((d) => d.path === page.viewFile) : null;
  const slotRe = /\{\s*(?:props\.)?children\s*\}|<(?:Page|Active|Outlet|CurrentView|View|Screen|Content)(?=[\s/>])/;
  // `({ children })` in a parameter list is not the slot; the JSX `{children}` is
  const findSlot = (src) => {
    for (const m of src.matchAll(new RegExp(slotRe.source, 'g'))) {
      if (m[0][0] === '{') {
        const before = src.slice(0, m.index).trimEnd().slice(-1);
        const after = src.slice(m.index + m[0].length).trimStart()[0];
        if ((before === '(' || before === ',') && (after === ')' || after === ',' || after === '=')) continue;
      }
      return m.index;
    }
    return -1;
  };
  let layout = null;
  let slot = -1;
  if (viewDoc) {
    const names = (page.viewName ? [page.viewName] : []).concat([...(app.viewNames || [])]);
    const cands = layoutDocs.filter((d) => d.path !== viewDoc.path).map((d) => {
      let s = findSlot(d.src);
      for (const n of names) {
        const k = d.src.search(new RegExp(`<${n.replace(/\$/g, '\\$')}(?=[\\s/>])`));
        if (k !== -1 && (s === -1 || k < s)) s = k;
      }
      return { d, s };
    }).filter((x) => x.s !== -1);
    cands.sort((a, b) => b.d.els.length - a.d.els.length);
    if (cands.length) {
      layout = cands[0].d;
      slot = cands[0].s;
    }
  } else if (docs.length) {
    layout = [...docs].filter((d) => !d.vendored).sort((a, b) => b.els.length - a.els.length)[0] || null;
  }
  if (layout && viewDoc) order = [...layout.els.filter((e) => e.index < slot), ...viewDoc.els, ...layout.els.filter((e) => e.index >= slot)];
  else if (layout) order = layout.els;
  const own = docs.filter((d) => !d.vendored);
  const all = docs.flatMap((d) => d.els.map((e) => Object.assign(e, { vendored: d.vendored })));
  const unitEls = all.filter((e) => !e.vendored);
  return { app, page, docs, own, els: unitEls, allEls: all, order: order.filter((e) => !e.vendored), sheets, texts, layout };
}

// ============================== rules ==============================

const mk = (rule, status, detail = '', locs = []) => ({ rule, status, detail, locs });
const PASS = (rule, detail = '') => mk(rule, 'PASS', detail);
const loc = (el, msg = '') => ({ file: el.file, line: el.line, msg });
const fmt = (l) => `${l.file}:${l.line}${l.msg ? ` ${l.msg}` : ''}`;
const first = (locs, n = 3) => locs.slice(0, n).map(fmt).join('; ') + (locs.length > n ? ` (+${locs.length - n} more)` : '');
const ownSheets = (u) => u.sheets.filter((s) => !s.vendored && s.name !== 'standalone-ui.css');

const inChrome = (el) => ancestors(el).some((a) => /^(?:header|nav)$/i.test(a.name) || hasClass(a, /^shell(?:-|$)|^topbar$|^top$|^skip/));
const isDialogEl = (el) => attrText(el, 'role') === 'dialog' || attrOf(el, 'aria-modal') || /^(?:dialog|FloatingDialog|Modal|Dialog|Drawer)$/.test(el.name);
const inDialog = (el) => [el, ...ancestors(el)].some(isDialogEl);
const dialogRoot = (el) => [el, ...ancestors(el)].find(isDialogEl) || null;

function isButtonEl(el) {
  const n = el.name;
  if (n === 'button') return true;
  if (n === 'input') return /^(?:button|submit|reset)$/i.test(attrText(el, 'type') || '');
  if (attrText(el, 'role') === 'button') return true;
  if (/^(?:Button|Btn|\w*Button|\w*Btn)$/.test(n) && !/^(?:Mode|Theme|Presenter)\w*Toggle$/.test(n)) return true;
  if (n === 'a' && hasClass(el, /^(?:btn|button)(?:[-_].*)?$/)) return true;
  return false;
}
const isPrimaryEl = (el) => {
  if (!isButtonEl(el)) return false;
  if (hasClass(el, /^primary$|^(?:btn|button)[-_]*primary$|[-_]primary$/)) return true;
  const v = attrOf(el, 'variant', 'kind', 'appearance');
  if (v && /["']primary["']|^primary$/.test(v.text)) return true;
  return el.attrs.has('primary') && el.attrs.get('primary').type === 'bool';
};
const isTabLike = (el) => attrText(el, 'role') === 'tab' || el.attrs.has('aria-selected') || el.attrs.has('aria-pressed') || hasClass(el, /tab|toggle|chip|pill|tree/i);

// ---- P1
function ruleP1(u) {
  const R = 'P1';
  const bars = u.els.filter((e) => hasClass(e, /^shell-bar$/) || e.name === 'InspectorShell' || e.name === 'ShellBar');
  const legacy = u.els.filter((e) => hasClass(e, /^topbar$/) || (e.name === 'header' && hasClass(e, /^(?:top|topbar|app-header|site-header)$/)));
  const headers = u.els.filter((e) => e.name === 'header' && !ancestors(e).some((a) => /^(?:main|section|article|aside|nav|dialog|form|li|table|blockquote|FloatingDialog|Modal)$/.test(a.name) || isDialogEl(a)));
  if (!bars.length) {
    if (legacy.length) return mk(R, 'DRIFT', `legacy header (.${classTokens(legacy[0]).join('.')}) instead of .shell-bar: ${first(legacy.map((e) => loc(e)))}`, legacy.map((e) => loc(e)));
    if (headers.length) return mk(R, 'DRIFT', `a <header> without .shell-bar: ${first(headers.map((e) => loc(e)))}`, headers.map((e) => loc(e)));
    return mk(R, 'DRIFT', 'no app shell (.shell-bar / InspectorShell) on this page');
  }
  const roots = bars.filter((e) => e.name !== 'InspectorShell' ? hasClass(e, /^shell-bar$/) : true);
  if (roots.length > 1) return mk(R, 'DRIFT', `${roots.length} app shells on one page (${first(roots.map((e) => loc(e)))})`, roots.map((e) => loc(e)));
  if (headers.length > 1) return mk(R, 'DRIFT', `${headers.length} page headers (${first(headers.map((e) => loc(e)))}); one shell header per page`, headers.map((e) => loc(e)));
  if (bars.some((e) => e.name === 'InspectorShell' || e.name === 'ShellBar')) return PASS(R, 'InspectorShell component');
  const rules = u.sheets.flatMap((s) => s.parsed.rules.map((r) => ({ r, s })));
  const sh = rules.filter(({ r }) => selParts(r.selector).some((p) => classesOfCompound(subjectOf(p)).includes('shell-bar') || /\.shell-bar\b/.test(p)));
  if (!sh.length) return mk(R, 'DRIFT', `.shell-bar is used (${fmt(loc(bars[0]))}) but no loaded stylesheet styles it`, [loc(bars[0], 'unstyled .shell-bar')]);
  const decls = sh.flatMap(({ r }) => r.decls);
  const dark = decls.some((d) => /--box-dark/.test(d.value));
  const rule3 = decls.some((d) => /--accent-gradient/.test(d.value) && /border/.test(d.prop));
  if (!dark || !rule3) return mk(R, 'WARN', `.shell-bar ${!dark ? 'does not use --box-dark ' : ''}${!rule3 ? 'has no --accent-gradient rule under the bar' : ''}`.trim());
  return PASS(R);
}

// ---- M1 (also used by P2)
function findToggle(u) {
  const el = u.els.find((e) =>
    /^(?:ModeToggle|SourceToggle|MockRealToggle|ModeSwitch|MockRealSwitch)$/.test(e.name) ||
    hasClass(e, /mode-toggle|modetoggle|source-toggle|mode-switch|mock-real/i) ||
    /^mode(?:-(?:mock|real|live))?$/i.test(attrText(e, 'data-testid') || ''));
  if (el) return el;
  for (const e of u.els) {
    if (!e.children.length) continue;
    const btns = e.children.filter((c) => c.name === 'button').map((c) => innerPlain(c).toLowerCase());
    if (btns.includes('mock') && (btns.includes('real') || btns.includes('live'))) return e;
  }
  return null;
}
function ruleM1(u) {
  const R = 'M1';
  const t = findToggle(u);
  if (!t) return mk(R, 'DRIFT', 'no visible Mock / Real toggle on this page (rule 19)');
  const wired = u.texts.some((x) => /\/api\/mode\b/.test(x.text));
  if (!wired) return mk(R, 'WARN', `toggle at ${fmt(loc(t))} but nothing in this page's files calls /api/mode (a toggle that only shows the mode does not meet rule 19)`, [loc(t)]);
  return PASS(R);
}

// ---- P2
const BANNER_NAME = /^(?:ModeBanner|HostedBanner|SimBanner|SimulationBanner|Banner)$/;
const isBannerEl = (e) => BANNER_NAME.test(e.name) || hasClass(e, /^banner$|(?:^|[-_])banner(?:$|[-_])|^banner[-_]/) && !hasClass(e, /^banner__/ ) || (attrText(e, 'role') === 'note' && hasClass(e, /banner|sim|mode|notice/i));
const CONTENT_TAG = /^(?:h[1-6]|section|article|form|table|p|pre|ul|ol|dl|button|input|select|textarea|details|img)$/;
function ruleP2(u, tier) {
  const R = 'P2';
  const list = u.order.length ? u.order : u.els;
  const bi = list.findIndex(isBannerEl);
  let banner = bi >= 0 ? list[bi] : null;
  if (!banner) {
    banner = u.els.find(isBannerEl) || null;
    if (!banner) {
      if (tier === 'Tool') return mk(R, 'INFO', 'Tool tier: no simulation banner (rule 2 does not apply to Tool apps)');
      return mk(R, 'DRIFT', 'no simulation banner (.banner role="note" or ModeBanner) on this page');
    }
    return PASS(R, `banner at ${fmt(loc(banner))} (in a component file, its position is not verified)`);
  }
  const isComp = /^[A-Z]/.test(banner.name);
  const dynamic = isComp || (attrOf(banner, 'data-state') && attrOf(banner, 'data-state').type === 'expr') || (banner.src.slice(banner.innerStart, banner.innerEnd).includes('{') && innerPlain(banner).includes('\u0001'));
  const plain = innerPlain(banner);
  if (!isComp && !hasText(banner)) return mk(R, 'DRIFT', `the banner is empty: ${fmt(loc(banner))}`, [loc(banner, 'empty banner')]);
  const before = list.slice(0, bi).filter((e) => !inChrome(e) && !isBannerEl(e) && !e.vendored && !ancestors(e).some(isBannerEl) && (CONTENT_TAG.test(e.name) || hasClass(e, /^(?:card|panel|page-title|hero)$/)) && !(e.name === 'input' && attrText(e, 'type') === 'hidden'));
  if (before.length) return mk(R, 'DRIFT', `${before[0].name === 'p' ? 'text' : `<${before[0].name}>`} at ${fmt(loc(before[0]))} comes before the banner (${fmt(loc(banner))}); the banner must be the first content element`, [loc(before[0], 'before the banner')]);
  if (!dynamic && /\b(?:live|real|production)\b/i.test(plain) && !/\b(?:mock|simulat|fake|offline|demo|sample|not real)/i.test(plain)) {
    return mk(R, 'DRIFT', `the banner text is static and says live/real, never mock: "${plain.slice(0, 60)}" (${fmt(loc(banner))})`, [loc(banner, 'hardcoded live banner')]);
  }
  if (!dynamic && findToggle(u)) return mk(R, 'WARN', `the banner text is static ("${plain.slice(0, 50)}") while the page has a Mock / Real toggle: it cannot state the current mode (${fmt(loc(banner))})`, [loc(banner, 'static banner')]);
  return PASS(R);
}

// ---- P3
function px(v) {
  const m = /^(-?\d*\.?\d+)(px|rem|em|ch|vw|%)?$/.exec(String(v).trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case 'rem': case 'em': return n * 16;
    case 'ch': return n * 8;
    case 'vw': case '%': return null;
    default: return n;
  }
}
function ruleP3(u) {
  const R = 'P3';
  const mains = u.els.filter((e) => e.name === 'main' || attrText(e, 'role') === 'main');
  if (!mains.length) return mk(R, 'DRIFT', 'no <main>: page content is not inside the page frame');
  const main = mains[0];
  const cand = [main, ...ancestors(main), ...main.children.filter((c) => c.name !== 'header' && c.name !== 'nav').slice(0, 3)];
  const wrapperChildren = main.children.length === 1 ? main.children[0].children.slice(0, 1) : [];
  cand.push(...wrapperChildren);
  if (u.page.viewFile) {
    const vd = u.docs.find((d) => d.path === u.page.viewFile);
    if (vd) cand.push(...vd.root.children.slice(0, 2));
  }
  cand.push(...u.els.filter((e) => e.name === 'body' || attrText(e, 'id') === 'root'));
  const classes = new Set(cand.flatMap((e) => classTokens(e)));
  const ids = new Set(cand.map((e) => attrText(e, 'id')).filter(Boolean));
  const tags = new Set(cand.map((e) => e.name));
  let frame = null;
  let centred = false;
  for (const s of u.sheets) {
    for (const r of s.parsed.rules) {
      if (r.at.some((a) => /max-width|min-width/.test(a))) continue;
      const hit = selParts(r.selector).some((p) => {
        const sub = subjectOf(p);
        return classesOfCompound(sub).some((c) => classes.has(c)) || (tags.has(tagOfCompound(sub)) && ['main', 'body'].includes(tagOfCompound(sub))) || (/^#([\w-]+)/.exec(sub) && ids.has(/^#([\w-]+)/.exec(sub)[1]));
      });
      if (!hit) continue;
      for (const d of r.decls) {
        if (d.prop === 'max-width') {
          const v = resolveVars(d.value, tokenMaps(u.sheets.flatMap((x) => x.parsed.rules)).light);
          const inner = /^(?:min|clamp)\(/.test(v) ? (v.match(/-?\d*\.?\d+(?:px|rem|em|ch)/g) || []).map(px).filter((x) => x !== null) : [px(v)];
          const best = inner.filter((x) => x !== null && x >= 600 && x <= 1200)[0];
          if (best) frame = { r, d };
        }
        if ((d.prop === 'margin' && /\bauto\b/.test(d.value)) || (/^margin-(?:inline|left|right)/.test(d.prop) && /\bauto\b/.test(d.value))) centred = true;
        if (d.prop === 'margin-inline' && /auto/.test(d.value)) centred = true;
      }
    }
  }
  if (!frame) return mk(R, 'DRIFT', `<main> (${fmt(loc(main))}) has no centred max-width frame (max-width 600px..1200px, standard 1100px) in the loaded CSS`, [loc(main, 'no page frame')]);
  if (!centred) return mk(R, 'WARN', `the page frame at ${frame.r.file}:${frame.d.line} has a max-width but is not centred (margin: 0 auto)`);
  return PASS(R);
}

// ---- P4
function ruleP4(u) {
  const R = 'P4';
  const cards = u.els.filter((e) => hasClass(e, /^card(?:--[\w-]+)?$/));
  if (!cards.length) return mk(R, 'INFO', 'no cards on this page (optional)');
  const rules = ownSheets(u).concat(u.sheets.filter((s) => s.name === 'standalone-ui.css')).flatMap((s) => s.parsed.rules);
  const cardRules = rules.filter((r) => selParts(r.selector).some((p) => classesOfCompound(subjectOf(p)).includes('card') && !classesOfCompound(subjectOf(p)).some((c) => /^card-/.test(c) && c !== 'card')));
  if (!cardRules.length) return mk(R, 'DRIFT', `.card is used (${fmt(loc(cards[0]))}) but no loaded stylesheet defines it`, [loc(cards[0], 'unstyled .card')]);
  const edges = cardRules.flatMap((r) => r.decls.filter((d) => d.prop === 'border-top' || d.prop === 'border-top-color').map((d) => ({ d, r })));
  const bad = edges.filter(({ d }) => scanColourLiterals(d.value).length);
  if (bad.length) return mk(R, 'DRIFT', `card top edge uses a colour literal, not a token (${bad[0].r.file}:${bad[0].d.line})`, bad.map(({ d, r }) => ({ file: r.file, line: d.line, msg: 'card top edge literal' })));
  const thick = edges.some(({ d }) => /\b[34]px\b/.test(d.value));
  return thick ? PASS(R) : mk(R, 'INFO', 'cards have no 3-4px accent top edge (optional)');
}

// ---- P6
function ruleP6(u, tier) {
  const R = 'P6';
  const insp = u.els.filter((e) => hasClass(e, /^inspector(?:-layout)?$/) || e.name === 'InspectorLayout');
  if (insp.length) {
    const bad = insp.filter((e) => e.children.length < 3);
    if (bad.length) return mk(R, 'DRIFT', `inspector layout with ${bad[0].children.length} part(s) at ${fmt(loc(bad[0]))}; it is tree + form + output`, [loc(bad[0], 'incomplete inspector')]);
    return PASS(R);
  }
  if (u.els.some((e) => e.name === 'InspectorShell')) return PASS(R, 'InspectorShell component');
  if (tier === 'Tester') {
    const probes = u.els.some((e) => e.name === 'form' || e.name === 'textarea') && u.els.some((e) => e.name === 'pre');
    if (probes) return mk(R, 'WARN', 'Tester page with a form and output but no inspector layout (tree + form + output)');
  }
  return mk(R, 'INFO', tier === 'Tester' ? 'no probing form on this page' : 'not used (fine outside Tester pages)');
}

// ---- P7
const TONE = /(?:^|[-_])(?:ok|good|success|pass|warn|warning|caution|info|danger|error|bad|fail|neutral|muted|accent|live|mock)$/i;
function ruleP7(u) {
  const R = 'P7';
  const chips = u.els.filter((e) => e.name === 'StatusChip' || hasClass(e, /^(?:[\w]+-)?(?:chip|pill)(?:--[\w-]+)?$/) && !hasClass(e, /__/));
  const bad = [];
  for (const c of chips) {
    const toned = classTokens(c).some((t) => TONE.test(t) || /\*$/.test(t)) || c.attrs.has('data-tone') || c.attrs.has('data-status') || c.attrs.has('tone') || c.attrs.has('status');
    if (!hasText(c) && !attrOf(c, 'children')) bad.push(loc(c, `${toned ? 'toned ' : ''}chip has no text (colour alone)`));
  }
  const rules = ownSheets(u).flatMap((s) => s.parsed.rules);
  const chipRules = rules.filter((r) => selParts(r.selector).some((p) => classesOfCompound(subjectOf(p)).some((c) => /(?:^|-)(?:chip|pill)(?:--|$)/.test(c) && !/__/.test(c))));
  for (const r of chipRules) {
    for (const d of r.decls) {
      if (/^(?:color|background(?:-color)?|border(?:-color)?|border)$/.test(d.prop)) {
        const lit = scanColourLiterals(d.value);
        if (lit.length) bad.push({ file: r.file, line: d.line, msg: `chip ${d.prop} uses a colour literal (${lit[0].text}); use --status-*/--danger-text` });
      }
    }
  }
  if (bad.length) return mk(R, 'DRIFT', first(bad), bad);
  return chips.length || chipRules.length ? PASS(R) : mk(R, 'INFO', 'no chips on this page');
}

// ---- P9
function ruleP9(u) {
  const R = 'P9';
  const own = u.els.filter((e) => !e.vendored);
  const prim = own.filter(isPrimaryEl);
  const looped = prim.filter((e) => !isConditionalClass(e) && inLoop(e));
  if (looped.length) return mk(R, 'DRIFT', `a primary button is rendered inside a loop (${fmt(loc(looped[0]))}), so it repeats once per item`, looped.map((e) => loc(e, 'primary in a loop')));
  const groups = new Map();
  for (const e of prim) {
    const k = dialogRoot(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  for (const [k, list] of groups) {
    const n = maxSimultaneous(list);
    if (n > 1) return mk(R, 'DRIFT', `${n} primary buttons ${k ? 'in one dialog' : 'in one view state'} (${first(list.map((e) => loc(e)))}); exactly one`, list.map((e) => loc(e, 'primary button')));
  }
  if (!(groups.get(null) || []).length) {
    const content = own.filter((e) => isButtonEl(e) && !isTabLike(e) && !inChrome(e) && !inDialog(e));
    if (content.length) return mk(R, 'DRIFT', `${content.length} button(s) (first at ${fmt(loc(content[0]))}) but none is the primary action`, [loc(content[0], 'no primary')]);
    return mk(R, 'INFO', 'no action buttons on this page');
  }
  return PASS(R);
}

// ---- P10
const SHARED_TOKENS = new Set(['--bg', '--surface', '--surface-2', '--text', '--text-body', '--muted', '--border', '--accent', '--accent-deep', '--on-accent', '--accent-soft', '--focus', '--danger-text', '--accent-gradient', '--status-ok', '--status-warn', '--status-info', '--primary-edge', '--bg-lab', '--control-border', '--box-dark', '--on-box', '--shadow-ink']);
const FIXED_TOKENS = new Set(['--accent', '--accent-gradient', '--on-accent', '--primary-edge', '--accent-deep']);
const BTN_PROPS = /^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow|fill|stroke)$/;
function buttonClassSet(u) {
  const set = new Set();
  for (const e of u.els) if (isButtonEl(e) || e.name === 'a') for (const t of classTokens(e)) if (isButtonEl(e)) set.add(t.replace(/\*$/, ''));
  return set;
}
function targetsButton(selector, btn, hasButton) {
  return selParts(selector).some((p) => {
    const sub = subjectOf(p);
    const cls = classesOfCompound(sub);
    const tag = tagOfCompound(sub);
    if (tag === 'button' || /\[type=["']?(?:button|submit|reset)|\[role=["']?button/.test(sub)) return true;
    if (cls.some((c) => btn.has(c) || /^(?:btn|button)(?:[-_]|$)|(?:^|[-_])(?:btn|button)(?:[-_]|$)|^primary$/.test(c))) return true;
    return false;
  });
}
function ruleP10(u) {
  const R = 'P10';
  const sheets = u.sheets.filter((s) => !s.vendored);
  const maps = tokenMaps(u.sheets.flatMap((s) => s.parsed.rules));
  const btn = buttonClassSet(u);
  const hasButton = u.els.some(isButtonEl);
  const bad = [];
  for (const s of sheets) {
    const isShared = s.name === 'standalone-ui.css';
    for (const r of s.parsed.rules) {
      if (!isShared) {
        for (const d of r.decls) {
          // the fixed button tokens may be defined only by the shared stylesheet
          if (FIXED_TOKENS.has(d.prop) && selParts(r.selector).some((p) => /^(?::root|html|body)/.test(p.trim()))) bad.push({ file: r.file, line: d.line, msg: `app CSS redefines the fixed button token ${d.prop}` });
        }
      }
      if (isShared || !targetsButton(r.selector, btn, hasButton)) continue;
      const primaryRule = selParts(r.selector).some((p) => classesOfCompound(subjectOf(p)).some((c) => /^primary$|^(?:btn|button)[-_]*primary$/.test(c)));
      for (const d of r.decls) {
        if (!BTN_PROPS.test(d.prop) || /^border(?:-(?:top|right|bottom|left))?$/.test(d.prop) && !/\b(?:#|rgb|hsl|var\()/.test(d.value)) continue;
        const lits = scanColourLiterals(d.value);
        if (lits.length) {
          bad.push({ file: r.file, line: d.line, msg: `button ${d.prop} uses a colour literal (${lits[0].text}${lits[0].violet ? ', purple/violet' : ''}), not a shared token` });
          continue;
        }
        for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) {
          if (!SHARED_TOKENS.has(m[1]) && !/^--(?:font|space|radius|gap|shadow|dg|lane|control)/.test(m[1])) bad.push({ file: r.file, line: d.line, msg: `button ${d.prop} reads ${m[1]}, not a shared token (brand/vertical tokens are not allowed on buttons)` });
        }
        if (primaryRule && (d.prop === 'background' || d.prop === 'background-image' || d.prop === 'background-color') && !/var\(\s*--accent-gradient/.test(d.value)) {
          bad.push({ file: r.file, line: d.line, msg: `primary button ${d.prop} must resolve to var(--accent-gradient), found ${d.value.slice(0, 40)}` });
        }
      }
    }
  }
  for (const x of u.texts.filter((t) => !t.vendored)) {
    for (const m of x.text.matchAll(/style\.setProperty\(\s*["'](--(?:accent|accent-gradient|on-accent|primary-edge))["']/g)) {
      bad.push({ file: x.file, line: lineIndexer(x.text)(m.index), msg: `${m[1]} is overridden at run time (customer accent): not statically verifiable`, warn: true });
    }
  }
  void maps;
  const hard = bad.filter((b) => !b.warn);
  if (hard.length) return mk(R, 'DRIFT', first(hard), hard);
  if (bad.length) return mk(R, 'WARN', first(bad), bad);
  return PASS(R);
}

// ---- P11
function ruleP11(u) {
  const R = 'P11';
  const hand = [];
  for (const d of u.own) {
    if (/FloatingDialog/.test(d.src)) continue;
    for (const e of d.els) {
      if (attrText(e, 'role') === 'dialog' || attrOf(e, 'aria-modal') || e.name === 'dialog' || hasClass(e, /^(?:modal|dialog)(?:-overlay|-backdrop)?$/)) hand.push(loc(e, 'hand-rolled dialog'));
    }
  }
  return hand.length ? mk(R, 'WARN', `hand-rolled dialog (use FloatingDialog): ${first(hand)}`, hand) : PASS(R);
}

// ---- H1
function ruleH1(u) {
  const R = 'H1';
  const h1 = u.els.filter((e) => e.name === 'h1' && !inDialog(e));
  const mains = u.els.filter((e) => (e.name === 'main' || attrText(e, 'role') === 'main') && !inDialog(e));
  const problems = [];
  const locs = [];
  const nh = maxSimultaneous(h1);
  if (nh !== 1 || h1.some((e) => inLoop(e))) {
    problems.push(h1.some((e) => inLoop(e)) ? 'an h1 is rendered in a loop' : nh === 0 ? 'no h1' : `${nh} h1 elements`);
    locs.push(...h1.map((e) => loc(e, 'h1')));
  }
  const nm = maxSimultaneous(mains);
  if (nm !== 1) {
    problems.push(nm === 0 ? 'no main landmark' : `${nm} main landmarks`);
    locs.push(...mains.map((e) => loc(e, 'main')));
  }
  return problems.length ? mk(R, 'DRIFT', `${problems.join('; ')}${locs.length ? ` (${first(locs)})` : ''}`, locs) : PASS(R);
}

// ---- H2
function ruleH2(u) {
  const R = 'H2';
  const list = (u.order.length ? u.order : u.els).filter((e) => /^h[1-6]$/.test(e.name) && !inDialog(e));
  let prev = 0;
  const skips = [];
  for (const h of list) {
    const lvl = Number(h.name[1]);
    if (prev && lvl > prev + 1) skips.push(loc(h, `h${prev} to h${lvl}`));
    prev = lvl;
  }
  return skips.length ? mk(R, 'WARN', `heading levels skipped: ${first(skips)}`, skips) : PASS(R);
}

// ---- H3
const INLINE_PROP = /^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|accent-color|caret-color|text-decoration-color|font-size|font)$/;
const COLOUR_ATTR = /^(?:fill|stroke|color|stop-color|flood-color|bgcolor|text-color)$/;
function ruleH3(u) {
  const R = 'H3';
  const bad = [];
  for (const e of u.els) {
    const st = attrOf(e, 'style');
    if (st) {
      let pairs = [];
      if (st.type === 'str') pairs = st.text.split(';').map((s) => s.split(':')).filter((p) => p.length >= 2).map((p) => [p[0].trim().toLowerCase(), p.slice(1).join(':').trim()]);
      else if (st.type === 'expr' && /^\s*\{/.test(st.text)) {
        const body = st.text.trim().slice(1, -1);
        for (const m of body.matchAll(/(?:^|,)\s*(?:(["'])([\w-]+)\1|([A-Za-z_$][\w$]*))\s*:\s*/g)) {
          const key = (m[2] || m[3]).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
          pairs.push([key, body.slice(m.index + m[0].length, m.index + m[0].length + 40)]);
        }
      }
      for (const [prop, value] of pairs) if (INLINE_PROP.test(prop)) bad.push(loc(e, `inline style ${prop}`));
    }
    for (const [name, a] of e.attrs) {
      if (a.type === 'str' && COLOUR_ATTR.test(name) && scanColourLiterals(a.text).length && !/currentcolor|none|url\(/i.test(a.text)) bad.push(loc(e, `hardcoded colour in ${name}="${a.text.slice(0, 20)}"`));
    }
  }
  for (const x of u.texts.filter((t) => !t.vendored && !/\.[jt]sx$/.test(t.file))) {
    const li = lineIndexer(x.text);
    for (const m of x.text.matchAll(/\.style\.(color|background|backgroundColor|fontSize|borderColor)\s*=/g)) bad.push({ file: x.file, line: li(m.index), msg: `script sets style.${m[1]}` });
    for (const m of x.text.matchAll(/style\s*=\s*\\?["']([^"'`]*)/g)) if (/(?:^|;)\s*(?:color|background|font-size|border-color)\s*:/i.test(m[1])) bad.push({ file: x.file, line: li(m.index), msg: 'inline style colour/size in a script template' });
  }
  return bad.length ? mk(R, 'DRIFT', first(bad), bad) : PASS(R);
}

// ---- T1
function ruleT1(u) {
  const R = 'T1';
  const drift = [];
  const warn = [];
  for (const s of ownSheets(u)) {
    for (const r of s.parsed.rules) {
      if (/@keyframes/.test(r.selector)) continue;
      for (const d of r.decls) {
        if (!/^(?:--|color|background|border|outline|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|column-rule|text-decoration|filter)/.test(d.prop)) continue;
        const lits = scanColourLiterals(d.value);
        if (!lits.length) continue;
        const where = { file: r.file, line: d.line };
        const violet = lits.find((l) => l.violet);
        if (violet) drift.push({ ...where, msg: `${d.prop}: ${violet.text} is purple/violet/indigo` });
        else if (!d.prop.startsWith('--')) warn.push({ ...where, msg: `${d.prop}: ${lits[0].text} (use a theme token)` });
      }
    }
  }
  if (drift.length) return mk(R, 'DRIFT', first(drift), drift);
  if (warn.length) return mk(R, 'WARN', `${warn.length} colour literal(s) in own CSS: ${first(warn)}`, warn);
  return PASS(R);
}

// ---- T2
function fontPx(value, tokens) {
  const v = resolveVars(value, tokens).trim();
  const KW = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16 };
  if (v in KW) return KW[v];
  let m = /^(\d*\.?\d+)(px|rem|em|pt|%)$/.exec(v);
  if (m) {
    const n = parseFloat(m[1]);
    return m[2] === 'px' ? n : m[2] === 'pt' ? (n * 4) / 3 : m[2] === '%' ? (n / 100) * 16 : n * 16;
  }
  m = /^clamp\(\s*(\d*\.?\d+)(px|rem|em)/.exec(v);
  if (m) return m[2] === 'px' ? parseFloat(m[1]) : parseFloat(m[1]) * 16;
  return null;
}
function ruleT2(u) {
  const R = 'T2';
  const maps = tokenMaps(u.sheets.flatMap((s) => s.parsed.rules));
  const small = [];
  for (const s of ownSheets(u)) {
    for (const r of s.parsed.rules) {
      for (const d of r.decls) {
        let val = null;
        if (d.prop === 'font-size') val = d.value;
        else if (d.prop === 'font') {
          const m = /(?:^|\s)(\d*\.?\d+(?:px|rem|em|pt))(?:\/[^\s]+)?\s+\S/.exec(d.value);
          if (m) val = m[1];
        } else if (/^--font-size/.test(d.prop)) val = d.value;
        if (val === null) continue;
        const p = fontPx(val, maps.light);
        if (p !== null && p > 0 && p < 10) small.push({ file: r.file, line: d.line, msg: `${d.prop}: ${val.trim()} = ${Math.round(p * 10) / 10}px` });
      }
    }
  }
  for (const e of u.els) {
    const st = attrOf(e, 'style');
    const m = st && /font-?[sS]ize['"]?\s*:\s*['"]?(\d*\.?\d+)(px|rem|em)?/.exec(st.text);
    if (m) {
      const p = m[2] === 'rem' || m[2] === 'em' ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
      if (p > 0 && p < 10) small.push(loc(e, `inline font-size ${m[1]}${m[2] || 'px'}`));
    }
  }
  return small.length ? mk(R, 'DRIFT', `font-size under 10px: ${first(small)}`, small) : PASS(R);
}

// ---- T3
function ruleT3(u) {
  const R = 'T3';
  const rules = u.sheets.flatMap((s) => s.parsed.rules);
  const dark = rules.some((r) => isDarkAt(r) || selParts(r.selector).some((p) => /\[data-theme=["']?dark["']?\]/i.test(p)));
  const light = rules.some((r) => selParts(r.selector).some((p) => /^(?::root|html|body)/i.test(p.trim()) || /\[data-theme=["']?light["']?\]/i.test(p)));
  if (!rules.length) return mk(R, 'DRIFT', 'no stylesheet is loaded by this page');
  if (dark && light) return PASS(R);
  return mk(R, 'DRIFT', `${!dark ? 'no dark theme (prefers-color-scheme: dark or [data-theme="dark"])' : 'no light theme / :root tokens'} in the loaded CSS`);
}

// ---- A1
function ruleA1(u) {
  const R = 'A1';
  const labels = u.els.filter((e) => e.name === 'label');
  const labelFor = new Set(labels.map((l) => attrText(l, 'htmlFor', 'for')).filter(Boolean));
  const bad = [];
  for (const e of u.els) {
    if (e.vendored || e.spread) continue;
    const named = () => attrOf(e, 'aria-label', 'aria-labelledby', 'title');
    const isLink = e.name === 'a' && e.attrs.has('href');
    const isBtn = e.name === 'button' || attrText(e, 'role') === 'button';
    const isField = (e.name === 'input' && !/^(?:hidden|submit|button|reset|image)$/i.test(attrText(e, 'type') || '')) || e.name === 'select' || e.name === 'textarea';
    if (isLink || isBtn) {
      if (!named() && !hasText(e) && !e.children.some((c) => c.name === 'img' && attrText(c, 'alt'))) bad.push(loc(e, `${isLink ? 'link' : 'button'} has no text or aria-label`));
    } else if (isField) {
      const id = attrText(e, 'id');
      const wrapped = ancestors(e).some((a) => a.name === 'label');
      if (!named() && !wrapped && !(id && labelFor.has(id)) && !(attrOf(e, 'id') && attrOf(e, 'id').type === 'expr')) bad.push(loc(e, `${e.name} has no label or aria-label${attrText(e, 'placeholder') ? ' (a placeholder is not a label)' : ''}`));
    }
  }
  return bad.length ? mk(R, 'DRIFT', first(bad), bad) : PASS(R);
}

// ---- A2
function ruleA2(u) {
  const R = 'A2';
  const bad = [];
  const rules = ownSheets(u).flatMap((s) => s.parsed.rules);
  for (const r of rules) {
    for (const d of r.decls) {
      const none = (d.prop === 'outline' && /^(?:none|0|0px)\b/.test(d.value.trim())) || (d.prop === 'outline-style' && /^none\b/.test(d.value.trim())) || (d.prop === 'outline-width' && /^0/.test(d.value.trim()));
      if (!none) continue;
      if (selParts(r.selector).every((p) => /:not\(\s*:focus-visible\s*\)|:focus:not\(|:active/.test(p))) continue;
      const base = selParts(r.selector).map((p) => p.replace(/:(?:focus-visible|focus-within|focus)\b/g, '').trim());
      const replaced = rules.some((o) => o !== r && selParts(o.selector).some((p) => /:(?:focus-visible|focus-within|focus)\b/.test(p) && base.includes(p.replace(/:(?:focus-visible|focus-within|focus)\b/g, '').trim())) && o.decls.some((x) => (x.prop === 'outline' && !/^(?:none|0)/.test(x.value.trim())) || /^(?:box-shadow|border(?:-color)?|outline-color|background)/.test(x.prop)));
      const selfFocus = selParts(r.selector).some((p) => /:focus/.test(p)) && r.decls.some((x) => /^(?:box-shadow|border(?:-color)?|outline-color)/.test(x.prop));
      if (!replaced && !selfFocus) bad.push({ file: r.file, line: d.line, msg: `${r.selector} { outline: none } with no replacement focus style` });
    }
  }
  return bad.length ? mk(R, 'DRIFT', first(bad), bad) : PASS(R);
}

// ---- A3
function ruleA3(u) {
  const R = 'A3';
  const bad = [];
  for (const e of u.els) {
    if (e.vendored || e.spread) continue;
    if (e.name === 'img' && !e.attrs.has('alt')) bad.push(loc(e, 'img without alt'));
    if (attrText(e, 'role') === 'img' && !attrOf(e, 'aria-label', 'aria-labelledby')) bad.push(loc(e, 'role="img" without a label'));
  }
  return bad.length ? mk(R, 'DRIFT', first(bad), bad) : PASS(R);
}

// ---- V1
function ruleV1(u, canonicalCss) {
  const R = 'V1';
  const vend = u.sheets.filter((s) => s.name === 'standalone-ui.css');
  if (!vend.length) return mk(R, 'DRIFT', 'this page does not load a standalone-ui.css');
  let canon = '';
  try {
    canon = fs.readFileSync(canonicalCss, 'utf8');
  } catch {
    return mk(R, 'INFO', `canonical stylesheet not readable at ${canonicalCss}`);
  }
  const diff = vend.filter((s) => s.parsed.raw !== canon);
  return diff.length ? mk(R, 'DRIFT', `${diff[0].file} differs from shared/standalone-ui.css (run scripts/check-drift.sh)`, [{ file: diff[0].file, line: 1, msg: 'differs from canonical' }]) : PASS(R);
}

// ---- C1
const ratioRow = (label, fg, bg, min) => {
  if (!fg || !bg) return null;
  const c = contrast(over(fg, bg), bg);
  return { label, ratio: c, min, ok: c >= min };
};
function ruleC1(u) {
  const R = 'C1';
  const rules = u.sheets.flatMap((s) => s.parsed.rules);
  const maps = tokenMaps(rules);
  if (!maps.light.has('--on-accent') || !maps.light.has('--accent-gradient')) return mk(R, 'INFO', 'the shared tokens are not loaded on this page (V1 reports it)');
  const bad = [];
  let worst = 99;
  for (const [theme, tokens] of [['light', maps.light], ['dark', maps.dark]]) {
    const col = (name) => {
      const lits = scanColourLiterals(resolveVars(`var(${name})`, tokens));
      return lits.length ? lits[0].rgb : null;
    };
    const bg = col('--bg');
    const surface = col('--surface');
    const grad = scanColourLiterals(resolveVars('var(--accent-gradient)', tokens)).map((l) => l.rgb).filter(Boolean);
    const onAccent = col('--on-accent');
    const edge = col('--primary-edge');
    const rows = [];
    for (const g of grad) rows.push(ratioRow(`${theme}: primary text on gradient stop`, onAccent, g, 4.5));
    rows.push(ratioRow(`${theme}: selected text on --accent`, onAccent, col('--accent'), 4.5));
    // the primary button's visible boundary: its edge, or its fill when the edge is transparent
    const boundary = edge && (edge.length < 4 || edge[3] > 0.5) ? edge : grad.sort((a, b) => luminance(a) - luminance(b))[0];
    rows.push(ratioRow(`${theme}: primary button boundary vs page`, boundary, bg, 3));
    for (const t of ['--status-ok', '--status-warn', '--status-info', '--danger-text', '--muted', '--text-body']) rows.push(ratioRow(`${theme}: ${t} text on --surface`, col(t), surface, 4.5));
    rows.push(ratioRow(`${theme}: --muted text on --bg`, col('--muted'), bg, 4.5));
    rows.push(ratioRow(`${theme}: --border on --surface`, col('--border'), surface, 3));
    rows.push(ratioRow(`${theme}: --focus ring on --bg`, col('--focus'), bg, 3));
    for (const r of rows.filter(Boolean)) {
      worst = Math.min(worst, r.ratio / r.min);
      if (!r.ok) bad.push({ file: 'tokens', line: 0, msg: `${r.label} is ${r.ratio.toFixed(2)}:1 (needs ${r.min}:1)` });
    }
  }
  return bad.length ? mk(R, 'DRIFT', bad.slice(0, 3).map((b) => b.msg).join('; '), bad) : PASS(R);
}

const RULE_FUNCS = [ruleP1, ruleP2, ruleP3, ruleP4, ruleP6, ruleP7, ruleP9, ruleP10, ruleP11, ruleH1, ruleH2, ruleH3, ruleT1, ruleT2, ruleT3, ruleA1, ruleA2, ruleA3, ruleV1, ruleM1, ruleC1];

/** Apply the `ui-pattern: allow` escapes: a finding on the escape's line or the line below is let through. */
function applyEscapes(results, u) {
  const esc = [];
  const byFile = new Map();
  for (const d of u.docs) byFile.set(d.file, d.escapes || []);
  for (const s of u.sheets) if (s.parsed.escapes && s.parsed.escapes.length) byFile.set(s.file, s.parsed.escapes);
  return results.map((r) => {
    if (r.status === 'PASS' || r.status === 'INFO' || !r.locs.length) return r;
    const keep = [];
    for (const l of r.locs) {
      const hit = (byFile.get(l.file) || []).find((e) => (e.line === l.line || e.line === l.line - 1) && (e.rule === r.rule || e.rule === '*'));
      if (hit) esc.push(`${l.file}:${l.line} ${r.rule} ${hit.reason}`);
      else keep.push(l);
    }
    if (keep.length === r.locs.length) return r;
    if (keep.length) return { ...r, locs: keep, detail: first(keep) };
    return mk(r.rule, 'PASS', 'allowed by ui-pattern escape');
  }).concat(esc.length ? [mk('ESC', 'INFO', esc.join('; '))] : []);
}

export function checkPageUnit(u, { tier = null, canonicalCss = CANONICAL_CSS } = {}) {
  const results = RULE_FUNCS.map((fn) => fn(u, fn === ruleV1 ? canonicalCss : tier));
  return applyEscapes(results, u);
}

// ============================== running ==============================

export function loadAllowlist(file = ALLOWLIST) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function listApps(root, only) {
  let names = [];
  try {
    names = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name);
  } catch {
    return [];
  }
  names.sort();
  return names.filter((n) => !only.length || only.includes(n)).map((n) => ({ name: n, dir: path.join(root, n) }));
}

export function runCheck({ root = DEFAULT_ROOT, appDirs = [], only = [], allowlist = loadAllowlist(), strict = false, canonicalCss = CANONICAL_CSS, requireCheckout = false } = {}) {
  const cache = new FileCache();
  const apps = appDirs.length ? appDirs.map((d) => ({ name: path.basename(path.resolve(d)), dir: path.resolve(d) })) : listApps(root, only);
  const out = { apps: [], pages: [], errors: [], allowlist: { entries: allowlist.length, unresolved: [] } };
  const byApp = new Map();
  for (const app of apps) {
    const rec = { name: app.name, dir: app.dir, tier: readTier(app.dir), status: 'analysed', note: '', pages: [] };
    out.apps.push(rec);
    byApp.set(app.name, rec);
    let empty = true;
    try {
      empty = fs.readdirSync(app.dir).filter((f) => f !== '.git').length === 0;
    } catch {
      /* missing */
    }
    if (empty) {
      rec.status = 'skipped';
      rec.note = 'not checked out (empty directory)';
      continue;
    }
    const found = discoverPages(app.dir, cache);
    if (!found.pages.length) {
      rec.status = 'skipped';
      rec.note = found.note || 'no UI pages';
      continue;
    }
    app.viewNames = new Set();
    for (const p of found.pages) {
      if (p.kind === 'view') {
        const nm = /([A-Za-z0-9_$]+)\.[jt]sx?$/.exec(p.file);
        if (nm) app.viewNames.add(nm[1]);
      }
    }
    for (const p of found.pages) {
      const key = `${app.name}/${p.id}`;
      const unit = buildUnit(app, { ...p, viewName: null }, cache);
      const results = checkPageUnit(unit, { tier: rec.tier, canonicalCss });
      const drift = results.filter((r) => r.status === 'DRIFT');
      const enforced = strict || allowlist.includes(key);
      const page = { key, app: app.name, id: p.id, kind: p.kind, how: p.how || null, file: p.file, enforced, results, drift: drift.map((r) => r.rule), clean: drift.length === 0 };
      rec.pages.push(page);
      out.pages.push(page);
    }
  }
  for (const entry of allowlist) {
    const [a] = entry.split('/');
    const rec = byApp.get(a);
    const known = out.pages.some((p) => p.key === entry);
    if (known) continue;
    const scoped = apps.length && !apps.some((x) => x.name === a) && only.length; // --app filter: other apps are simply out of scope
    if (scoped) continue;
    if (!rec || rec.status === 'skipped') {
      if (requireCheckout) out.errors.push(`ALLOWLIST ${entry}: the app is not checked out or has no pages (--require-checkout)`);
      else out.allowlist.unresolved.push(entry);
    } else out.errors.push(`ALLOWLIST ${entry}: no such page in ${a} (renamed or removed? update scripts/ui-pattern-converted.txt)`);
  }
  const enforcedPages = out.pages.filter((p) => p.enforced);
  const failing = enforcedPages.filter((p) => !p.clean);
  out.summary = {
    pages: out.pages.length,
    clean: out.pages.filter((p) => p.clean).length,
    drift: out.pages.filter((p) => !p.clean).length,
    enforced: enforcedPages.length,
    failing: failing.length,
    apps: out.apps.filter((a) => a.status === 'analysed').length,
    skipped: out.apps.filter((a) => a.status === 'skipped').length,
  };
  out.exit = failing.length || out.errors.length ? 1 : strict && out.summary.drift ? 1 : 0;
  return out;
}

const pad = (s, n) => String(s).padEnd(n);
function printRow(r) {
  console.log(`    ${pad(r.status, 5)} ${r.rule} ${RULES[r.rule] ? `${RULES[r.rule].split(':')[0].split(',')[0].slice(0, 44)} - ` : ''}${r.detail}`.trimEnd());
}

function main() {
  const args = process.argv.slice(2);
  const opt = { only: [], dirs: [] };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--root') opt.root = args[(i += 1)];
    else if (a === '--app') opt.only.push(args[(i += 1)]);
    else if (a === '--allowlist') opt.allowlist = args[(i += 1)];
    else if (a === '--canonical') opt.canonical = args[(i += 1)];
    else if (['--strict', '--json', '--list-advisory', '--verbose', '--require-checkout', '--rules'].includes(a)) opt[a.slice(2)] = true;
    else if (a.startsWith('--')) {
      console.error(`unknown option ${a}`);
      process.exit(2);
    } else opt.dirs.push(a);
  }
  if (opt.rules) {
    for (const [id, d] of Object.entries(RULES)) console.log(`${pad(id, 4)} ${d}`);
    return;
  }
  const res = runCheck({
    root: opt.root ? path.resolve(opt.root) : DEFAULT_ROOT,
    appDirs: opt.dirs,
    only: opt.only,
    allowlist: loadAllowlist(opt.allowlist ? path.resolve(opt.allowlist) : ALLOWLIST),
    strict: Boolean(opt.strict),
    canonicalCss: opt.canonical ? path.resolve(opt.canonical) : CANONICAL_CSS,
    requireCheckout: Boolean(opt['require-checkout']),
  });
  if (opt.json) {
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.exit);
  }
  if (opt['list-advisory']) {
    const adv = res.pages.filter((p) => !p.enforced).sort((a, b) => a.drift.length - b.drift.length || a.key.localeCompare(b.key));
    for (const p of adv) console.log(`${pad(p.drift.length, 3)} ${pad(p.key, 52)} ${p.drift.join(', ') || 'clean (add it to the allowlist)'}`);
    console.log(`${adv.length} advisory pages (fewest DRIFT rules first)`);
    process.exit(0);
  }
  for (const a of res.apps) {
    if (a.status === 'skipped') console.log(`SKIP   ${a.name}: ${a.note}`);
  }
  for (const p of res.pages) {
    const where = `${p.key} (${p.file})`;
    const worse = p.results.filter((r) => r.status === 'DRIFT');
    if (p.enforced) {
      console.log(`${p.clean ? 'ENFORCED PASS' : 'ENFORCED FAIL'} ${where}${p.clean ? '' : `: ${p.drift.join(', ')}`}`);
      for (const r of p.results) if (opt.verbose || r.status === 'DRIFT' || r.rule === 'ESC') printRow(r);
    } else {
      console.log(`${p.clean ? 'PASS ' : 'DRIFT'} [advisory] ${where}${p.clean ? '' : `: ${p.drift.join(', ')}`}`);
      if (opt.verbose) for (const r of p.results) printRow(r);
      else if (!worse.length) for (const r of p.results.filter((x) => x.rule === 'ESC')) printRow(r);
    }
  }
  for (const e of res.errors) console.error(e);
  for (const e of res.allowlist.unresolved) console.error(`ALLOWLIST ${e}: app not checked out here (skipped; CI passes --require-checkout)`);
  const s = res.summary;
  console.log(`${s.pages} pages: ${s.clean} clean, ${s.drift} with drift; ${s.enforced} enforced (${s.failing} failing); ${s.apps} apps analysed, ${s.skipped} skipped (no UI or not checked out)`);
  if (res.exit) console.error('FAIL: an enforced page drifted from the UI patterns, or the allowlist is stale (see above).');
  process.exit(res.exit);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
