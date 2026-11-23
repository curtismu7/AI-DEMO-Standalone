#!/usr/bin/env node
// Merge every lab's Postman collection into one importable file:
//   postman/all-labs.postman_collection.json
//
// Structure: a top-level folder per lab (the lab's own folders nested inside),
// with a use-case-first description so someone scrolling the sidebar sees what
// each lab proves. Per-lab environment values are merged into ONE example
// environment (all placeholders). Conflicting variable names are suffixed.
//
// Usage (meta-repo root):
//   node shared/postman/merge-all.mjs            # regenerate
//   node shared/postman/merge-all.mjs --check    # exit 1 when stale (CI-safe)

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const collectionsDir = join(root, 'postman/collections');
const environmentsDir = join(root, 'postman/environments');
const OUT = join(root, 'postman/all-labs.postman_collection.json');
const OUT_ENV = join(root, 'postman/all-labs.live.environment.example.json');

// Use-case-first line per lab (the "why would I run this" sentence), then the
// lab's own description carries the detail.
const USE_CASES = {
  'ciba-approval-sequence-LAB': 'CIBA out-of-band approval: an agent write held for a human approve/deny in a separate channel.',
  'ciba-hitl-lab': 'CIBA human-in-the-loop beat: a denied write returns an identifier; the human approves and the same write replays to PERMIT.',
  'cimd-LAB': 'CIMD client registration both directions: PingFederate fetching a client_id-metadata document, and the lab\'s own CIMD AS.',
  'delegation-lab-LAB': 'Consent-delegated agent tokens: mint a token with an actor claim, gate tool calls on tier/actor/groups.',
  'gateway-claims-LAB': 'Gateway claim gates: act.sub/actor checks on an agent token — allow vs deny per scenario.',
  'id-jag-standalone-LAB': 'ID-JAG end to end: RFC 8693 exchange, RFC 7523 redemption, MCP call, and the negative tests.',
  'intent-par-inspector-LAB': 'PAR with an intent: push intent to request_uri (RFC 9126 + intent rule), negatives, and the scenario suite.',
  'mcp-gateway-lab-LAB': 'MCP gateway policy: in-scope tool calls forward, out-of-scope deny before the backend ever runs.',
  'mcp-resource-server-LAB': 'MCP resource server auth: RFC 9728 metadata, bearer-gated JSON-RPC, 401/403 negatives.',
  'mock-authorize-LAB': 'PingOne Authorize decisions against a mock PAP: worker token → permit/deny/indeterminate through editable rules.',
  'obo-lab-LAB': 'On-behalf-of exchange: inbound token → actor claims → delegated token → downstream call, with leak analysis.',
  'p1-third-party-exchange-LAB': 'PingOne trusting third-party-signed JWTs: token exchange per vendor profile (PF, Okta, Auth0, RFC 9068).',
  'pf-array-claims-LAB': 'Array vs string group claims at the door: exact membership vs substring accidents, both token shapes.',
  'privilege-api-explorer-LAB': 'Privilege console API browsing: the 447-operation catalog, connections, audit, and gated writes.',
  'saas-access-LAB': 'Zero standing access: time-boxed SaaS grants with approval routing across GitHub/Salesforce/Snowflake/etc.',
  'session-LAB': 'PingFederate session lifetime: sign-in cookie, MFA window, app SSO, widget token, Check-Session consequences.',
  'stolen-token-LAB': 'Stolen-token attacks and defences: replay, tampering, theft across surfaces — what catches each.',
  'token-workbench-LAB': 'Token inspection and conformance: decode with per-claim meaning, BCP/FAPI checker packs, tester cases.',
  'trusted-issuers-LAB': 'Trusted-issuer support matrix: what each Ping surface accepts, checked per cell with mutations.',
  'wimse-lab-LAB': 'WIMSE tokens: mint WIT + Txn-Token chains, validate hop binding (tth), and the attack suite.',
  'workload-identity-LAB': 'Workload identity federation: platform-vouched token → gateway/direct MCP hops, with run evidence.',
};

const checkOnly = process.argv.includes('--check');

const merged = {
  info: {
    name: 'Ping AI Demo Labs — All Collections',
    description: [
      'Every standalone lab\'s API collection in one import. One top-level folder per lab, ordered as a tour:',
      'token basics → issuance flows → delegation/actor patterns → gateway and resource-server enforcement → attack/defence → governance.',
      '',
      'How to use it:',
      '• Import this file, then postman/all-labs.live.environment.example.json, and select it as the environment.',
      '• Each lab folder is self-contained: variable chaining (cookies, minted tokens) works within a folder.',
      '• Labs with live settings (cimd, id-jag-standalone, token-workbench, mcp-resource-server, privilege-api-explorer) answer their honest',
      '  refusal (409 pf_not_configured / needs-setup) in a bare checkout — those tests accept it. Fill real values with',
      '  shared/postman/fill-env.mjs on the owner machine and import the filled environment for full live runs.',
      '• Folders labelled (MOCK ONLY) target the lab\'s in-process simulation; no live form exists.',
      '• Each lab\'s server must be running: mock-mode labs start with `docker compose up -d` in the lab repo; see the lab README.',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    _postman_id: 'postman-all-labs',
  },
  item: [],
  variable: [{ key: 'LAB_BASE_NOTE', value: 'Each lab folder uses its own namespaced base: {{LAB_BASE_<SLUG>}} (set at collection level below, overridable in the environment).' }],
};

const envValues = new Map(); // key -> value (first wins; conflicts suffixed)
const envConflicts = [];

function mergeEnv(prefix, values) {
  for (const v of values || []) {
    const key = v.key === 'LAB_BASE' ? null : v.key;
    if (!key) continue; // LAB_BASE is per-collection, meaningless merged
    const full = envValues.has(key) && envValues.get(key) !== v.value
      ? `${prefix}_${key}`
      : key;
    if (full !== key && !envConflicts.includes(key)) envConflicts.push(key);
    if (!envValues.has(full)) envValues.set(full, v.value);
  }
}

for (const labDir of readdirSync(collectionsDir).sort()) {
  const dir = join(collectionsDir, labDir);
  if (!statSync(dir).isDirectory()) continue;
  const file = readdirSync(dir).find((f) => f.endsWith('.postman_collection.json'));
  if (!file) continue;
  const c = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const useCase = USE_CASES[labDir];
  if (!useCase) { console.error(`no use-case line for ${labDir} — add one to merge-all.mjs`); process.exit(1); }
  const own = (c.info.description || '').replace(/^API collection for [^:]+: /, '');
  // Newman (and Postman's runner) do not reliably cascade folder-level variables to
  // nested folders. So: namescope each lab's variables at the merged-collection level
  // (LAB_BASE -> LAB_BASE_<SLUG>) and rewrite {{LAB_BASE}} inside this lab's items.
  const slug = String(labDir).replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
  const ownVars = (c.variable || []).map((v) => ({
    key: v.key === 'LAB_BASE' ? `LAB_BASE_${slug}` : `${slug}_${v.key}`,
    value: v.value,
  }));
  const rewritten = JSON.parse(JSON.stringify(c.item).replaceAll('{{LAB_BASE}}', `{{LAB_BASE_${slug}}}`));
  merged.item.push({
    name: c.info.name,
    description: `USE CASE: ${useCase}\n\n${own}`,
    item: rewritten,
  });
  merged.variable.push(...ownVars);
  const envDir = join(environmentsDir, labDir);
  if (existsSync(envDir)) {
    const envFile = readdirSync(envDir).find((f) => f.endsWith('.example.json'));
    if (envFile) mergeEnv(c.info.name.replace(/[^A-Za-z0-9]/g, ''), JSON.parse(readFileSync(join(envDir, envFile), 'utf8')).values);
  }
}

const allEnv = {
  name: 'All Labs — Live (example)',
  values: [...envValues.entries()].map(([key, value]) => ({ key, value, enabled: true, type: 'secret' })),
};

if (checkOnly) {
  const stale = !existsSync(OUT) || readFileSync(OUT, 'utf8') !== JSON.stringify(merged, null, 2) + '\n'
    || !existsSync(OUT_ENV) || readFileSync(OUT_ENV, 'utf8') !== JSON.stringify(allEnv, null, 2) + '\n';
  if (stale) { console.error('all-labs collection is stale. Run: node shared/postman/merge-all.mjs'); process.exit(1); }
  console.log(`all-labs collection up to date (${merged.item.length} labs)`);
  process.exit(0);
}

writeFileSync(OUT, JSON.stringify(merged, null, 2) + '\n');
writeFileSync(OUT_ENV, JSON.stringify(allEnv, null, 2) + '\n');
console.log(`wrote ${OUT} (${merged.item.length} lab folders)`);
console.log(`wrote ${OUT_ENV} (${allEnv.values.length} variables${envConflicts.length ? `, ${envConflicts.length} conflict(s) suffixed` : ''})`);
