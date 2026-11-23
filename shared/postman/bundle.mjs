#!/usr/bin/env node
// Bundle every lab's Postman collection into the meta-repo's postman/ folder.
//
// Each lab repo keeps its own postman/ (authoritative: spec.json + generated
// collection + placeholder environment). This script copies them into
// postman/collections/<lab>/ and postman/environments/<lab>/ so SEs can import
// everything from one place. The per-repo copies stay; this is a mirror, not
// a move.
//
// Usage (from the meta-repo root):
//   node shared/postman/bundle.mjs                 # regenerate the bundle
//   node shared/postman/bundle.mjs --check         # exit 1 if the bundle is stale (for CI)
//
// A lab participates when it has standalone/<lab>/postman/spec.json and a
// generated collection. Secrets never enter the bundle: only the placeholder
// example environments are copied, never a filled live environment.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, cpSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const standalone = join(root, 'standalone');
const outCollections = join(root, 'postman/collections');
const outEnvironments = join(root, 'postman/environments');

const checkOnly = process.argv.includes('--check');

const specs = [];
for (const entry of readdirSync(standalone, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const postmanDir = join(standalone, entry.name, 'postman');
  if (!existsSync(join(postmanDir, 'spec.json'))) continue;
  const files = readdirSync(postmanDir);
  const collection = files.find((f) => f.endsWith('.postman_collection.json'));
  const env = files.find((f) => f.endsWith('.live.environment.example.json'));
  if (!collection || !env) {
    console.error(`skip ${entry.name}: missing generated collection or example environment (run the generator there)`);
    continue;
  }
  specs.push({ lab: entry.name, postmanDir, collection, env });
}
if (!specs.length) {
  console.error('no labs found under standalone/*/postman — nothing to bundle');
  process.exit(1);
}

// Desired state: which files the bundle should contain.
const wanted = new Set();
const actions = [];
for (const { lab, postmanDir, collection, env } of specs) {
  const cDest = join(outCollections, lab, collection);
  const eDest = join(outEnvironments, lab, env);
  wanted.add(cDest); wanted.add(eDest);
  const cSrc = join(postmanDir, collection);
  const eSrc = join(postmanDir, env);
  const same = (a, b) => existsSync(a) && existsSync(b) && readFileSync(a).equals(readFileSync(b));
  if (!same(cSrc, cDest)) actions.push({ src: cSrc, dest: cDest, lab });
  if (!same(eSrc, eDest)) actions.push({ src: eSrc, dest: eDest, lab });
}

// Prune files for labs that no longer participate.
for (const dir of [outCollections, outEnvironments]) {
  if (!existsSync(dir)) continue;
  for (const labDir of readdirSync(dir, { withFileTypes: true })) {
    if (!labDir.isDirectory()) continue;
    const full = join(dir, labDir.name);
    for (const f of readdirSync(full)) {
      if (!wanted.has(join(full, f))) actions.push({ remove: join(full, f), lab: labDir.name });
    }
  }
}

if (checkOnly) {
  if (actions.length) {
    console.error(`bundle is stale (${actions.length} file(s) differ or missing). Run: node shared/postman/bundle.mjs`);
    for (const a of actions) console.error(`  ${a.remove ? 'remove ' : 'update '}${a.remove || a.dest}`);
    process.exit(1);
  }
  console.log(`bundle up to date (${specs.length} labs)`);
  process.exit(0);
}

for (const a of actions) {
  if (a.remove) {
    rmSync(a.remove);
    console.log(`removed ${a.remove.replace(root + '/', '')}`);
  } else {
    mkdirSync(dirname(a.dest), { recursive: true });
    cpSync(a.src, a.dest);
    console.log(`copied ${a.src.replace(root + '/', '')} -> ${a.dest.replace(root + '/', '')}`);
  }
}
if (!actions.length) console.log('bundle already up to date');
console.log(`bundled ${specs.length} labs: postman/collections/<lab>/ + postman/environments/<lab>/`);
