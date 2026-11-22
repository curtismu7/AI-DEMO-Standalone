#!/usr/bin/env node
// Fill a lab's live Postman environment from the owner's shared settings.
//
// Usage:
//   node fill-env.mjs --spec postman/spec.json [--env ~/Development/.env]
//
// Reads the shared env file (default ~/Development/.env) and writes
// postman/<slug>.live.environment.json with real values. That file is
// git-ignored; never commit it. Fails loudly on missing keys.

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const specPath = argValue('--spec');
if (!specPath) {
  console.error('Usage: node fill-env.mjs --spec postman/spec.json [--env ~/Development/.env]');
  process.exit(1);
}
const envFile = argValue('--env') || join(homedir(), 'Development/.env');
const outDir = dirname(resolve(specPath));

const spec = JSON.parse(readFileSync(resolve(specPath), 'utf8'));
const slug = spec.slug || spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

if (!existsSync(envFile)) {
  console.error(`Env file not found: ${envFile}`);
  process.exit(1);
}

// Parse dotenv-style lines (KEY=value, # comments), first occurrence wins.
const shared = {};
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && shared[m[1]] === undefined) shared[m[1]] = m[2].trim();
}

const wanted = Object.keys(spec.env || {});

// Optional alias map in the spec: { "envAliases": { "PF_BASE_URL": "PF_URL" } }.
// A key missing from the shared env file falls back to its alias before failing.
const aliases = spec.envAliases || {};
function lookup(key) {
  if (shared[key] !== undefined && shared[key] !== '') return shared[key];
  const alias = aliases[key];
  if (alias && shared[alias] !== undefined && shared[alias] !== '') return shared[alias];
  return undefined;
}

const missing = wanted.filter((k) => lookup(k) === undefined && !(spec.envOptional || []).includes(k));
if (missing.length) {
  console.error('Missing values in the shared env file for keys:');
  for (const k of missing) console.error(`  ${k} (lab expects: ${JSON.stringify(spec.env[k])})`);
  process.exit(2);
}

const values = wanted
  .map((k) => ({ key: k, value: lookup(k) ?? ((spec.envOptional || []).includes(k) ? '' : undefined), enabled: true, type: 'secret' }))
  .filter((v) => v.value !== undefined);
const out = { name: `${spec.name} — Live (filled ${new Date().toISOString().slice(0, 10)})`, values };
const outPath = join(outDir, `${slug}.live.environment.json`);
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
const mode = statSync(envFile).mode & 0o777;
console.log(`Wrote ${outPath} with ${values.length} filled values (source env file mode ${mode.toString(8)}).`);
console.log('This file holds live secrets: it is git-ignored; do not copy it into repos or chat.');
