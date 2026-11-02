#!/usr/bin/env node
// Re-measures every app on the demo shelf against the family standard, in one pass, so nobody works from a stale audit.
//
//   node scripts/fleet-check.mjs [--only <repo-or-id>[,..]] [--json] [--strict] [--cache <dir>] [--no-ci]
//
// The app list is the shelf registry on GitHub (ping-sandbox/demo-shelf-LAB data/demos.json); each app's repo is the folder
// of its composeFile. Every repo is shallow-cloned into the cache (default: a temp folder) from GitHub, and the canonical
// standalone-ui.css is read from GitHub too, never from a local checkout (a local checkout can sit on an old branch).
//
// Checks per app:
//   css      the vendored web stylesheet: canonical (same bytes as GitHub), stale (differs), none
//   rules    check-css.sh fails (colour literals, prefers-color-scheme, !important, italics); 0 is clean
//   guard    scripts/check-ui-standard.sh exists and scripts/standalone-ui.sha256 matches the vendored copy
//   toggle   rule 19, STATIC only: switch (a POST mode route and a toggle in the UI), display-only (UI but no route),
//            api-only, or none. It does not start the app; a browser or HTTP test is the proof.
//   ci       the latest run on main: success, failure, in_progress, none
// --strict exits 1 when any app has a problem (for use in a scheduled job). Without it the exit code is 0.
import { execFile, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORG = 'ping-sandbox';
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
const SOURCE_EXT = /\.(js|mjs|cjs|jsx|ts|tsx|html)$/;

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// The repo folder a registry entry lives in: the first segment of its composeFile ("agent-kill-switch-LAB/docker-compose.yml").
export function repoOf(entry) {
  const first = String(entry?.composeFile ?? '').split('/').filter(Boolean)[0];
  return first && !first.startsWith('.') && !first.includes('\\') ? first : null;
}

// Every file under dir (relative paths), skipping build output and dependencies.
export function listFiles(dir, rel = '') {
  const out = [];
  let items = [];
  try { items = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return out; }
  for (const it of items) {
    if (it.isDirectory()) { if (!SKIP_DIRS.has(it.name)) out.push(...listFiles(dir, path.join(rel, it.name))); } else out.push(path.join(rel, it.name));
  }
  return out;
}

const isTestFile = (f) => /(^|\/)(test|tests|__tests__)\//.test(f) || /\.(test|spec)\.[a-z]+$/.test(f);

// css: the vendored sheet against the canonical hash.
export function classifyCss(vendoredHash, canonicalHash) {
  if (!vendoredHash) return 'none';
  return vendoredHash === canonicalHash ? 'canonical' : 'stale';
}

// rule 19 evidence from source text only. A "route" is a POST/PUT to .../mode; "ui" is the toggle in a page.
export function classifyToggle(files) {
  let route = false; let ui = false;
  for (const { file, text } of files) {
    if (isTestFile(file)) continue;
    if (/\.(post|put)\(\s*['"`]\/(api\/)?mode['"`]/.test(text)) route = true;
    if (/data-testid=["']mode-real["']|\bModeToggle\b/.test(text)) ui = true;
  }
  if (route && ui) return 'switch';
  if (ui) return 'display-only';
  if (route) return 'api-only';
  return 'none';
}

// Inspects one cloned app directory. checkCss is a function (dir) => number of FAIL lines, so tests can stand in for the script.
export function inspectApp(dir, { canonicalHash, checkCss }) {
  const files = listFiles(dir);
  const cssRel = files.find((f) => path.basename(f) === 'standalone-ui.css');
  const vendoredHash = cssRel ? sha256(fs.readFileSync(path.join(dir, cssRel))) : null;
  const css = classifyCss(vendoredHash, canonicalHash);
  const guardScript = files.includes(path.join('scripts', 'check-ui-standard.sh'));
  let pinned = null;
  try { pinned = fs.readFileSync(path.join(dir, 'scripts', 'standalone-ui.sha256'), 'utf8').trim(); } catch { /* no pin */ }
  const guard = guardScript && pinned && vendoredHash && pinned === vendoredHash ? 'ok' : guardScript ? 'pin-mismatch' : 'none';
  const sources = files.filter((f) => SOURCE_EXT.test(f)).map((file) => ({ file, text: fs.readFileSync(path.join(dir, file), 'utf8') }));
  return { css, rules: checkCss(dir), guard, toggle: classifyToggle(sources) };
}

// What is wrong with an app, in words. Empty when it meets the standard on everything this script can see.
export function problemsOf(r) {
  const p = [];
  if (r.error) return [r.error];
  if (r.css !== 'canonical') p.push(`stylesheet ${r.css}`);
  if (r.rules > 0) p.push(`${r.rules} css-rule fail${r.rules === 1 ? '' : 's'}`);
  if (r.guard !== 'ok') p.push(`guard ${r.guard}`);
  if (r.toggle !== 'switch') p.push(`toggle ${r.toggle}`);
  if (r.ci && r.ci !== 'success') p.push(`ci ${r.ci}`);
  return p;
}

export function formatTable(rows) {
  const cols = [['app', (r) => r.id], ['css', (r) => r.css ?? '-'], ['rules', (r) => (r.rules ?? '-')], ['guard', (r) => r.guard ?? '-'], ['toggle', (r) => r.toggle ?? '-'], ['ci', (r) => r.ci ?? '-']];
  const cell = (r, [, f]) => String(r.error ? (f === cols[0][1] ? r.id : '-') : f(r));
  const widths = cols.map((c) => Math.max(c[0].length, ...rows.map((r) => cell(r, c).length)));
  const line = (vals) => vals.map((v, i) => v.padEnd(widths[i])).join('  ').trimEnd();
  return [line(cols.map((c) => c[0])), line(widths.map((w) => '-'.repeat(w))), ...rows.map((r) => line(cols.map((c) => cell(r, c))) + (r.error ? `  ${r.error}` : ''))].join('\n');
}

async function gh(args) { return (await run('gh', args, { maxBuffer: 32 * 1024 * 1024 })).stdout; }
async function ghFile(repo, file) { return Buffer.from(JSON.parse(await gh(['api', `repos/${ORG}/${repo}/contents/${file}`])).content, 'base64'); }

function checkCssFails(dir) {
  const script = path.join(HERE, 'check-css.sh');
  let out = '';
  try { out = execFileSync('bash', [script, dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { out = `${e.stdout ?? ''}${e.stderr ?? ''}`; }
  return (out.match(/^\s*FAIL/gm) ?? []).length;
}

async function pool(items, size, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

async function cloneFresh(repo, cache) {
  const dir = path.join(cache, repo);
  fs.rmSync(dir, { recursive: true, force: true });
  await run('git', ['clone', '--quiet', '--depth', '1', `https://github.com/${ORG}/${repo}.git`, dir]);
  return dir;
}

async function ciOf(repo) {
  try {
    const runs = JSON.parse(await gh(['run', 'list', '--repo', `${ORG}/${repo}`, '--branch', 'main', '--limit', '1', '--json', 'status,conclusion']));
    if (!runs.length) return 'none';
    return runs[0].status === 'completed' ? (runs[0].conclusion || 'none') : runs[0].status;
  } catch { return 'unknown'; }
}

function parseArgs(argv) {
  const o = { only: null, json: false, strict: false, cache: null, ci: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') o.json = true; else if (a === '--strict') o.strict = true; else if (a === '--no-ci') o.ci = false;
    else if (a === '--only') o.only = String(argv[++i] ?? '').split(',').filter(Boolean);
    else if (a === '--cache') o.cache = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const cache = o.cache ?? fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-check-'));
  fs.mkdirSync(cache, { recursive: true });
  const canonicalHash = sha256(await ghFile('AI-DEMO-Standalone', 'shared/standalone-ui.css'));
  const registry = JSON.parse((await ghFile('demo-shelf-LAB', 'data/demos.json')).toString('utf8')).demos;
  const seen = new Set();
  let apps = registry.map((e) => ({ id: e.id, repo: repoOf(e) })).filter((a) => { if (!a.repo || seen.has(a.repo)) return false; seen.add(a.repo); return true; });
  if (o.only) apps = apps.filter((a) => o.only.includes(a.repo) || o.only.includes(a.id));
  const rows = await pool(apps, 6, async (a) => {
    try {
      const dir = await cloneFresh(a.repo, cache);
      const r = { id: a.id, repo: a.repo, ...inspectApp(dir, { canonicalHash, checkCss: checkCssFails }) };
      if (o.ci) r.ci = await ciOf(a.repo);
      return r;
    } catch (e) { return { id: a.id, repo: a.repo, error: `could not inspect: ${String(e.message).split('\n')[0].slice(0, 80)}` }; }
  });
  rows.sort((x, y) => problemsOf(y).length - problemsOf(x).length || x.id.localeCompare(y.id));
  const bad = rows.filter((r) => problemsOf(r).length);
  if (o.json) console.log(JSON.stringify({ canonicalHash, apps: rows.map((r) => ({ ...r, problems: problemsOf(r) })) }, null, 2));
  else {
    console.log(`canonical standalone-ui.css sha256 ${canonicalHash.slice(0, 12)}...  (${rows.length} apps)\n`);
    console.log(formatTable(rows));
    console.log(`\n${rows.length - bad.length} of ${rows.length} apps meet everything this script can see; ${bad.length} do not.`);
    const count = (k, v) => rows.filter((r) => r[k] === v).length;
    console.log(`stylesheet canonical ${count('css', 'canonical')}, stale ${count('css', 'stale')}, none ${count('css', 'none')} | guard ok ${count('guard', 'ok')} | toggle switch ${count('toggle', 'switch')}, display-only ${count('toggle', 'display-only')}, none ${count('toggle', 'none')}`);
    console.log('toggle is a static check of the source; prove the switch in a browser.');
  }
  if (!o.cache) fs.rmSync(cache, { recursive: true, force: true });
  process.exit(o.strict && bad.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(2); });
