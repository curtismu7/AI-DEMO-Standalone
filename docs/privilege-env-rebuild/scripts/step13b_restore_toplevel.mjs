// Step 13b: restore the TOP-LEVEL fields the replay (step13, via PINGID-MIGRATION/lib.mjs toCreateBody) dropped.
// lib.mjs carries only ObjectMeta + Spec. The export also has top-level fields that matter:
//   pacpolicys : IssuedTo, NotBefore, NotAfter, GivenName, Type, ReqType      (without IssuedTo/NotBefore/NotAfter a key-bound grant denies)
//   aipolicys  : State                                                         (without State=Active the gateway only shadows the policy)
//   tagpolicys : RegExPattern, KindMap, Tags, FixedPatterns, PolicyOrigin      (without them a tag policy tags nothing)
// Users and the tenant id are rewritten like step13. A grant whose NotAfter is already past is renewed by 90 days (reported).
// The `lab-agent-*` grants made by step17 (cloned from a broken template) get IssuedTo = the key's custodian and a validity window.
// Dry run by default; --apply PUTs the whole object. Idempotent. Never prints secrets.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
import { buildMaps, decodeRef, b64ref, rewriteDeep } from '/Users/cmuir/Development/PINGID-MIGRATION/lib.mjs';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const APPLY = process.argv.includes('--apply');
const EXPORT = path.join(os.homedir(), '.config/demo-kit/privilege-export-0428ba4f-2026-11-17');
const OLD = '0428ba4f-169c-436b-aff9-b230496e0e3b';
const NEW = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'state.json'), 'utf8')).env_id;
const BASE = `https://local.procyon.ai:8643/api/${NEW}/v1`;
const HDR = { 'x-procyon-session-id': crypto.randomUUID(), accept: 'application/json', 'content-type': 'application/json' };
const load = (k) => { const d = JSON.parse(fs.readFileSync(path.join(EXPORT, `${k}.json`), 'utf8')); return Array.isArray(d) ? d : Object.values(d).find(Array.isArray) || []; };
const list = async (k) => { const r = await fetch(`${BASE}/${k}?ObjectMeta.Namespace=default`, { headers: HDR }); return Object.values(await r.json()).find(Array.isArray) || []; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const maps = buildMaps({ srcUsers: load('users'), dstUsers: await list('users'), srcGroups: load('groups'), dstGroups: await list('groups') });
const report = { unmappedUsers: new Set(), unmappedGroups: new Set(), droppedRefs: [], droppedRules: [], secrets: [] };
const ctx = { oldTenant: OLD, newTenant: NEW, maps, report, meshCluster: 'ai-demo-cmuir', skippedNames: new Set() };
const fix = (v) => rewriteDeep(JSON.parse(JSON.stringify(v)), ctx);
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const now = Date.now();

const FIELDS = { pacpolicys: ['IssuedTo', 'NotBefore', 'NotAfter', 'GivenName', 'Type', 'ReqType'], aipolicys: ['State'],
  tagpolicys: ['RegExPattern', 'KindMap', 'Tags', 'FixedPatterns', 'PolicyOrigin'] };
let changed = 0; const out = [];
for (const [kind, fields] of Object.entries(FIELDS)) {
  const live = Object.fromEntries((await list(kind)).map((o) => [o.ObjectMeta.Name, o]));
  let n = 0;
  for (const src of load(kind)) {
    const cur = live[src.ObjectMeta.Name]; if (!cur) continue;
    const patch = {};
    for (const f of fields) if (src[f] !== undefined) patch[f] = fix(src[f]);
    if (kind === 'pacpolicys' && patch.NotAfter && Date.parse(patch.NotAfter) < now) { out.push(`  ${src.ObjectMeta.Name}: NotAfter ${patch.NotAfter.slice(0, 10)} already past, renewed 90 days`); patch.NotAfter = iso(now + 90 * 864e5); }
    const diff = Object.keys(patch).filter((f) => JSON.stringify(cur[f]) !== JSON.stringify(patch[f]));
    if (!diff.length) continue;
    n++; changed++;
    if (APPLY) {
      const body = { ...cur, ...patch };
      const r = await fetch(`${BASE}/${kind}/default/${src.ObjectMeta.Name}`, { method: 'PUT', headers: HDR, body: JSON.stringify(body) });
      if (!r.ok) out.push(`  FAIL ${kind}/${src.ObjectMeta.Name}: ${r.status} ${(await r.text()).replace(/\s+/g, ' ').slice(0, 140)}`);
      await sleep(200);
    }
  }
  console.log(`${kind}: ${n} object(s) ${APPLY ? 'updated' : 'would be updated'}`);
}
// lab-agent grants from step17: IssuedTo = the key's custodian, validity window like the pgc grants
const keys = Object.fromEntries((await list('agentaccesskeys')).map((o) => [o.ObjectMeta.Name, o]));
const pols = Object.fromEntries((await list('pacpolicys')).map((o) => [o.ObjectMeta.Name, o]));
for (const name of Object.keys(pols).filter((n) => n.startsWith('lab-agent-'))) {
  const cur = pols[name]; const custodian = keys['lab-agent']?.Spec?.UserRef;
  const patch = { IssuedTo: { ObjectRef: [custodian] }, NotBefore: iso(now - 2 * 60e3), NotAfter: '2027-02-20T00:00:00Z' };
  if (cur.IssuedTo?.ObjectRef?.length && cur.NotAfter) continue;
  changed++; console.log(`lab-agent grant ${name}: ${APPLY ? 'updated' : 'would be updated'} (IssuedTo = key custodian, valid to 2027-02-20)`);
  if (APPLY) { const r = await fetch(`${BASE}/pacpolicys/default/${name}`, { method: 'PUT', headers: HDR, body: JSON.stringify({ ...cur, ...patch }) }); if (!r.ok) out.push(`  FAIL ${name}: ${r.status}`); await sleep(200); }
}
for (const l of out) console.log(l);
console.log(APPLY ? `applied: ${changed} object(s) changed` : `(dry run) ${changed} object(s) would change`);
