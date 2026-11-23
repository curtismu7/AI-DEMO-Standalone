#!/usr/bin/env node
// Regenerate every lab's Postman collection from its spec.json, then re-bundle
// and re-merge — the whole pipeline in one command.
//
// Usage (from the meta-repo root):
//   node shared/postman/generate-all.mjs              # all labs with a spec
//   node shared/postman/generate-all.mjs <lab-name>…  # only the named labs
//   node shared/postman/generate-all.mjs --check      # verify everything is up to date (CI)
//
// After it runs: review the diff, commit each lab repo's generated files, then
// commit the meta-repo's bundle/merge output (see postman/README.md).

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const standalone = join(root, 'standalone');
const generator = join(root, 'shared/postman/generator.mjs');
const checkOnly = process.argv.includes('--check');
const named = process.argv.slice(2).filter((a) => !a.startsWith('--'));

function labsWithSpec() {
  const out = [];
  for (const e of readdirSync(standalone, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory() && existsSync(join(standalone, e.name, 'postman/spec.json'))) out.push(e.name);
  }
  return out;
}

const all = labsWithSpec();
const targets = named.length ? named : all;
const unknown = targets.filter((t) => !all.includes(t));
if (unknown.length) {
  console.error(`no postman/spec.json in: ${unknown.join(', ')}`);
  process.exit(1);
}

if (!checkOnly) {
  let failed = 0;
  for (const lab of targets) {
    const spec = join('standalone', lab, 'postman/spec.json');
    const r = spawnSync('node', [generator, '--spec', spec], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) { console.error(`✗ ${lab}`); failed++; }
    else console.log(`✓ ${lab}`);
  }
  if (failed) { console.error(`\n${failed} lab(s) failed to generate`); process.exit(1); }

  // re-bundle + re-merge so postman/ mirrors and the one-big import are current
  for (const step of ['bundle.mjs', 'merge-all.mjs']) {
    const r = spawnSync('node', [join('shared/postman', step)], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  console.log(`\ngenerated ${targets.length} lab(s); bundle + merge refreshed. Review the diff and commit.`);
} else {
  // --check: the generated files must match a fresh regeneration (dry: compare bundle + merge only,
  // since generator output is deterministic from spec.json)
  let stale = 0;
  for (const step of ['bundle.mjs', 'merge-all.mjs']) {
    const r = spawnSync('node', [join('shared/postman', step), '--check'], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) stale++;
  }
  process.exit(stale ? 1 : 0);
}
