#!/usr/bin/env node
// Shared Postman collection generator for the standalone lab family.
//
// Usage:
//   node generator.mjs --spec postman/spec.json [--out postman]
//
// Reads a lab spec (JSON) and emits:
//   <slug>.postman_collection.json          (Postman v2.1, committed)
//   <slug>.live.environment.example.json    (placeholder values, committed)
//
// Secrets never go here. Fill real values with fill-env.mjs, which writes
// <slug>.live.environment.json (git-ignored).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const specPath = argValue('--spec');
if (!specPath) {
  console.error('Usage: node generator.mjs --spec postman/spec.json [--out postman]');
  process.exit(1);
}
const outDir = resolve(argValue('--out') || dirname(specPath));
const spec = JSON.parse(readFileSync(resolve(specPath), 'utf8'));

const slug = spec.slug || spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function envEntry(name, value) {
  return { key: name, value: value ?? '', enabled: true, type: 'secret' };
}

// --- environment (example) -------------------------------------------------
const envExample = {
  name: `${spec.name} — Live (example)`,
  values: Object.entries(spec.env || {}).map(([k, v]) =>
    envEntry(k, typeof v === 'string' ? v : '')
  ),
};

// --- collection -------------------------------------------------------------
function requestItem(req, folderPrerequest = []) {
  let body;
  if (req.urlencoded) {
    body = {
      mode: 'urlencoded',
      urlencoded: req.urlencoded.map((p) => ({ key: p.key, value: p.value })),
    };
  } else if (req.rawBody !== undefined) {
    body = { mode: 'raw', raw: req.rawBody, options: { raw: { language: 'json' } } };
  } else if (req.body) {
    body = { mode: 'raw', raw: JSON.stringify(req.body, null, 2), options: { raw: { language: 'json' } } };
  }
  const query = (req.query || []).map((q) => ({ key: q.key, value: q.value ?? '' }));
  const prerequest = [...folderPrerequest, ...(req.prerequest || [])];
  const events = [];
  if (prerequest.length) events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: ['/* Pre-request */', ...prerequest] } });
  events.push({
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: ['/* Assertions for this request */', ...(req.tests || [])],
    },
  });
  return {
    name: req.name,
    event: events,
    request: {
      method: req.method || 'GET',
      header: Object.entries(req.headers || {}).map(([k, v]) => ({ key: k, value: v })),
      ...(body ? { body } : {}),
      url: {
        raw: `{{LAB_BASE}}${req.path}${query.length ? '' : ''}`,
        host: ['{{LAB_BASE}}'],
        path: req.path.replace(/^\//, '').split('/'),
        ...(query.length ? { query } : {}),
      },
      description: req.description || '',
    },
    response: [],
  };
}

function folderItem(folder) {
  const name = folder.mockOnly ? `${folder.name} (MOCK ONLY)` : folder.name;
  const description = folder.mockOnly
    ? (folder.description || '') + '\n\nMOCK ONLY: this lane has no live form. Requests target this lab\'s in-process simulation; nothing here proves anything about a customer tenant.'
    : (folder.description || '');
  return {
    name,
    description,
    item: (folder.requests || []).map((r) => requestItem(r, folder.prerequest || [])),
  };
}

const collection = {
  info: {
    name: spec.name,
    description: spec.description || '',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    _postman_id: `postman-${slug}`,
  },
  item: (spec.folders || []).map(folderItem),
  variable: [
    { key: 'LAB_BASE', value: spec.baseUrl || 'http://localhost:4720' },
    ...Object.entries(spec.variables || {}).map(([key, value]) => ({ key, value })),
  ],
};

mkdirSync(outDir, { recursive: true });
const collectionPath = join(outDir, `${slug}.postman_collection.json`);
const envPath = join(outDir, `${slug}.live.environment.example.json`);
writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n');
writeFileSync(envPath, JSON.stringify(envExample, null, 2) + '\n');
console.log(`Wrote ${collectionPath}`);
console.log(`Wrote ${envPath}`);
