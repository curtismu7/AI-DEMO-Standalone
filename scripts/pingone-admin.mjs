#!/usr/bin/env node
// CLI for the Privilege-in-one-environment setup. See docs/PRIVILEGE-ONE-ENV.md.
//   pingone-admin.mjs ensure-worker-roles --env <id> --app <workerAppId>      (token: PINGONE_ACCESS_TOKEN, an org admin token)
//   pingone-admin.mjs grant-admin --env <id> --admin-env <id> --user <login>  (token: PINGONE_ACCESS_TOKEN, an org admin token)
//   pingone-admin.mjs privilege-prepare --users a,b [--dry-run] [--group G]   (the env's own worker, read from the settings file)
// Region (TLD) comes from PINGONE_REGION (default com). Tokens and secrets are never printed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureWorkerRoles, grantAdminRoles, makeApi, mintToken, preparePrivilege } from './lib/pingone-admin.mjs';

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)=(.*)$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else o._.push(a);
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const cmd = o._[0];
  const file = process.env.STANDALONE_ENV || path.join(os.homedir(), 'Development/.env');
  const cfg = { ...readEnvFile(file), ...process.env };
  const region = cfg.PINGONE_REGION || 'com';
  const base = `https://api.pingone.${region}/v1`;
  const need = (v, name) => { if (!v) { console.error(`missing ${name}`); process.exit(64); } return v; };
  const show = (rows) => rows.forEach(([s, n, d]) => console.log(`  ${s.padEnd(5)} ${n}${d ? ` — ${d}` : ''}`));

  if (cmd === 'ensure-worker-roles') {
    const api = makeApi({ base, token: need(cfg.PINGONE_ACCESS_TOKEN, 'PINGONE_ACCESS_TOKEN') });
    const r = await ensureWorkerRoles(api, { envId: need(o.env, '--env'), appId: need(o.app, '--app') });
    console.log(`worker roles: added [${r.added.join(', ')}] removed ${r.removed.length} leftover ${r.leftover.length}`);
    r.errors.forEach((e) => console.log(`  WARN ${e}`));
    if (r.leftover.length) console.log(`  The worker still holds ${r.leftover.join(', ')}. Trim them in the console: Environment > Applications > worker > Roles.`);
    process.exit(r.ok ? 0 : 1);
  } else if (cmd === 'grant-admin') {
    const api = makeApi({ base, token: need(cfg.PINGONE_ACCESS_TOKEN, 'PINGONE_ACCESS_TOKEN') });
    const r = await grantAdminRoles(api, { adminEnvId: need(o['admin-env'], '--admin-env'), envId: need(o.env, '--env'), login: need(o.user, '--user') });
    console.log(r.ok ? `admin roles for ${o.user}: ${r.granted.join(', ')}` : `  WARN ${r.warning}`);
    process.exit(0); // an unknown login is a warning, never a failure
  } else if (cmd === 'privilege-prepare') {
    const envId = need(cfg.PINGONE_ENVIRONMENT_ID, 'PINGONE_ENVIRONMENT_ID (in the settings file)');
    const token = cfg.PINGONE_ACCESS_TOKEN || await mintToken({ region, envId, clientId: need(cfg.PINGONE_WORKER_CLIENT_ID, 'PINGONE_WORKER_CLIENT_ID'), clientSecret: need(cfg.PINGONE_WORKER_CLIENT_SECRET, 'PINGONE_WORKER_CLIENT_SECRET') });
    const api = makeApi({ base, token });
    const logins = (o.users || '').split(',').map((s) => s.trim()).filter(Boolean);
    const r = await preparePrivilege(api, { envId, logins, group: o.group || undefined, dryRun: !!o.dryRun });
    console.log(`Privilege prepare for ${envId}${o.dryRun ? ' (dry run, nothing written)' : ''}`);
    show(r.checks.map((c) => [c.status, c.name, c.detail]));
    console.log(r.exitCode === 0 ? 'All checks passed.' : r.exitCode === 2 ? 'Privilege is not in this environment yet.' : 'Some checks failed (see FAIL above).');
    process.exit(r.exitCode);
  } else {
    console.error('usage: pingone-admin.mjs ensure-worker-roles|grant-admin|privilege-prepare (see the header of this file)');
    process.exit(64);
  }
}
main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
