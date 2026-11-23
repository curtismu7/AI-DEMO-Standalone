// Step 13: replay the 2026-11-17 Privilege export (old tenant 0428ba4f) into the NEW tenant via the local console API.
// Dry run by default. --apply to write. Idempotent: objects whose name already exists are skipped.
// Reuses ~/Development/PINGID-MIGRATION/lib.mjs (tenant rewrite, user match by UserName, group map, secret blanking).
// Secrets are blanked, never printed; only dotted paths and names are reported.
//   node step13_replay_export.mjs [--apply] [--kinds nonhumanidentities,applications,...] [--keys]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  buildMaps, toCreateBody, filterGrantRules, decodeRef, b64ref, DEFAULT_KINDS,
} from '/Users/cmuir/Development/PINGID-MIGRATION/lib.mjs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // local console uses a self-signed certificate
const APPLY = process.argv.includes('--apply');
const kindsArg = process.argv.includes('--kinds') ? process.argv[process.argv.indexOf('--kinds') + 1].split(',') : null;
const WITH_KEYS = process.argv.includes('--keys');
const HOME = os.homedir();
const EXPORT = path.join(HOME, '.config/demo-kit/privilege-export-0428ba4f-2026-11-17');
const OLD = '0428ba4f-169c-436b-aff9-b230496e0e3b';
const STATE = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'state.json'), 'utf8'));
const NEW = STATE.env_id;
const BASE = `https://local.procyon.ai:8643/api/${NEW}/v1`;
const SID = crypto.randomUUID();
const HDR = { 'x-procyon-session-id': SID, accept: 'application/json', 'content-type': 'application/json' };

const load = (k) => {
  const d = JSON.parse(fs.readFileSync(path.join(EXPORT, `${k}.json`), 'utf8'));
  const v = Array.isArray(d) ? d : Object.values(d).find(Array.isArray);
  return v || [];
};
async function list(kind) {
  const r = await fetch(`${BASE}/${kind}?ObjectMeta.Namespace=default`, { headers: HDR });
  if (!r.ok) throw new Error(`GET ${kind} -> ${r.status}`);
  const d = await r.json();
  return Object.values(d).find(Array.isArray) || [];
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dstUsers = await list('users');
const dstGroups = await list('groups');
const maps = buildMaps({ srcUsers: load('users'), dstUsers, srcGroups: load('groups'), dstGroups });
console.log(`mapping: ${maps.user.size} users mapped, ${maps.missingUsers.length} source users missing in new tenant, groups ${maps.group.size}`);
if (maps.missingUsers.length) console.log('  missing users (their references are dropped):', maps.missingUsers.join(', '));

const report = { unmappedUsers: new Set(), unmappedGroups: new Set(), droppedRefs: [], droppedRules: [], secrets: [] };
const ctx = { oldTenant: OLD, newTenant: NEW, maps, report, meshCluster: 'ai-demo-cmuir', skippedNames: new Set() };

// Strings that are themselves embedded references (e.g. the agentaccesskey attribute in a grant) are not RefKind/RefID pairs.
function rewriteStrings(v) {
  if (Array.isArray(v)) return v.map(rewriteStrings);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewriteStrings(x)]));
  if (typeof v === 'string') {
    const d = decodeRef(v);
    if (d && d.tenant === OLD) {
      const name = maps.user.get(d.name) || maps.group.get(d.name) || d.name;
      return b64ref(NEW, d.ns, name);
    }
    return v.split(OLD).join(NEW);
  }
  return v;
}

// Guard: nothing that still names the old tenant (cleartext or as an embedded reference) may be written.
function hasOld(v) {
  if (Array.isArray(v)) return v.some(hasOld);
  if (v && typeof v === 'object') return Object.values(v).some(hasOld);
  if (typeof v === 'string') { if (v.includes(OLD)) return true; const d = decodeRef(v); return !!(d && d.tenant === OLD); }
  return false;
}

// Provider-backed LLM keys need the real provider key (never in the export). Values from the owner's saved file; never printed.
const PROVIDER_VAR = { anthropic: 'ANTHROPIC_API_KEY', 'audit-test': 'ANTHROPIC_API_KEY', local: 'ANTHROPIC_API_KEY', google: 'GOOGLE_API_KEY',
  openai: 'OPENAI_API_KEY', 'LM-Stuidio': 'OPENAI_API_KEY', ollama: 'OPENROUTER_API_KEY', groq: 'GROQ_API_KEY', 'llama.cpp': 'LLAMACPP_GATEWAY_KEY',
  'meta.llama3-2-3b-instruct': 'META_LLAMA3_KEY' };
const PROVIDER_FORMAT = { ANTHROPIC_API_KEY: ['sk-ant-', 90], GOOGLE_API_KEY: ['AIza', 39], OPENAI_API_KEY: ['sk-', 40], OPENROUTER_API_KEY: ['sk-or-', 60], GROQ_API_KEY: ['gsk_', 50] };
const providerEnv = {};
try {
  for (const l of fs.readFileSync(path.join(HOME, '.config/demo-kit/provider-keys.pingid.env'), 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) providerEnv[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch { /* file missing: provider keys are skipped and reported */ }

const kinds = kindsArg || [...DEFAULT_KINDS, ...(WITH_KEYS ? ['agentaccesskeys'] : [])];
const results = [];
const appNames = new Set(load('applications').map((a) => a.ObjectMeta.Name));
for (const kind of kinds) {
  const src = load(kind);
  const have = new Set((await list(kind)).map((o) => o.ObjectMeta.Name));
  let created = 0; let skipped = 0; let failed = 0; let planned = 0;
  for (const obj of src) {
    const name = obj.ObjectMeta.Name;
    if (have.has(name)) { skipped++; continue; }
    let o = obj;
    if (kind === 'pacpolicys') {
      const spec = filterGrantRules(obj.Spec, appNames, report, name);
      if (!spec) { results.push([kind, name, 'dropped: no rule left']); continue; }
      o = { ...obj, Spec: spec };
    }
    const body = rewriteStrings(toCreateBody(o, kind, ctx));
    if (kind === 'agentaccesskeys' && PROVIDER_VAR[name]) {
      const v = PROVIDER_VAR[name]; const val = providerEnv[v] || '';
      const fmt = PROVIDER_FORMAT[v];
      if (!val) { results.push([kind, name, `skipped: ${v} is empty`]); console.log(`  SKIP ${name}: ${v} empty`); continue; }
      if (fmt && !(val.startsWith(fmt[0]) && val.length >= fmt[1])) { results.push([kind, name, `refused: ${v} fails format check`]); console.log(`  REFUSED ${name}: ${v} fails format check`); continue; }
      body.Spec.RealKey = val; body.Spec.VirtualKey = ''; body.Spec.Revoked = false;
      const na = (body.Spec.NotAfter || '').slice(0, 10);
      if (na && new Date(na) < new Date()) { body.Spec.NotAfter = new Date(Date.now() + 90 * 864e5).toISOString().replace(/\.\d+Z$/, 'Z'); console.log(`  ${name}: expired ${na}, renewed 90 days`); }
    }
    if (hasOld(body)) { results.push([kind, name, 'LEAK: old tenant still referenced, not written']); console.log(`  LEAK ${kind}/${name}`); continue; }
    planned++;
    if (!APPLY) continue;
    let r = await fetch(`${BASE}/${kind}`, { method: 'POST', headers: HDR, body: JSON.stringify(body) });
    let txt = r.ok ? '' : (await r.text()).replace(/\s+/g, ' ');
    if (!r.ok && kind === 'nonhumanidentities' && /Federation\.Audience is generated/.test(txt) && body.Spec?.Federation) {
      delete body.Spec.Federation.Audience; // Privilege generates it for docker/kubernetes platforms
      r = await fetch(`${BASE}/${kind}`, { method: 'POST', headers: HDR, body: JSON.stringify(body) });
      txt = r.ok ? 'created without Audience (generated)' : (await r.text()).replace(/\s+/g, ' ');
    }
    txt = txt.slice(0, 160);
    results.push([kind, name, r.status, txt]);
    if (r.ok) created++; else failed++;
    await sleep(250);
  }
  console.log(`${kind}: source ${src.length}, existing ${skipped}, ${APPLY ? `created ${created}, failed ${failed}` : `would create ${planned}`}`);
}
console.log(`unmapped users: ${[...report.unmappedUsers].length}, unmapped groups: ${[...report.unmappedGroups].length}, dropped refs: ${report.droppedRefs.length}, dropped grant rules: ${report.droppedRules.length}`);
console.log(`secret-bearing fields blanked (to re-enter): ${report.secrets.length}`);
for (const f of results.filter((r) => r[2] !== 200 && typeof r[2] === 'number')) console.log('  FAIL', f.slice(0, 4).join(' | '));
const out = path.join(HOME, '.config/demo-kit/privilege-rebuild-import-log.json');
fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), apply: APPLY, results, secrets: report.secrets, unmappedUsers: [...report.unmappedUsers], dropped: report.droppedRules }, null, 1), { mode: 0o600 });
console.log('log (mode 600):', out);
