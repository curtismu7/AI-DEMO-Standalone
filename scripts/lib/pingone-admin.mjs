// PingOne admin steps for the "Privilege in one environment" setup (docs/PRIVILEGE-ONE-ENV.md).
// Pure logic over an injected `api(method, path, body) -> { status, body }`, so the tests run it against a fake PingOne.
// Nothing here prints a token or a secret.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const KEEP_WORKER_ROLES = ['Identity Data Admin', 'Environment Admin'];
export const ADMIN_USER_ROLES = ['Identity Data Admin', 'Environment Admin'];
export const PRIVILEGE_APP = 'PingOne Privilege';
export const WORKER_APP_NAME = 'Standalone Labs Worker';
export const DEFAULT_GROUP = 'PrivilegeAdmins';
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

// api client over fetch: three tries on 429 / 5xx / network errors, then the last answer is returned.
export function makeApi({ base, token, fetchImpl = fetch, sleep = sleepMs }) {
  return async function api(method, p, body, contentType = 'application/json') {
    const url = p.startsWith('http') ? p : `${base}${p}`;
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetchImpl(url, {
          signal: AbortSignal.timeout(30000),
          method,
          headers: { authorization: `Bearer ${token}`, 'content-type': contentType, accept: 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await r.text();
        let parsed = {};
        try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text.slice(0, 300) }; }
        last = { status: r.status, body: parsed };
        // A write is retried only when the server said it did not run it (429); a 5xx or a dropped connection may have applied it.
        if (r.status !== 429 && (r.status < 500 || method !== 'GET')) return last;
      } catch (e) {
        last = { status: 0, body: { error: String(e.message || e).slice(0, 200) } };
        if (method !== 'GET') return last;
      }
      await sleep(400 * (attempt + 1));
    }
    return last;
  };
}

// client-credentials token for a worker app (basic auth); returns the access token string.
export async function mintToken({ region, envId, clientId, clientSecret, fetchImpl = fetch }) {
  const r = await fetchImpl(`https://auth.pingone.${region}/${envId}/as/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
    body: 'grant_type=client_credentials',
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`token request failed: HTTP ${r.status} ${j.error || ''}`.trim());
  return j.access_token;
}

export async function listAll(api, p, key) {
  const out = [];
  let next = p;
  for (let i = 0; next && i < 50; i++) {
    const { status, body } = await api('GET', next);
    if (status !== 200) throw new Error(`GET ${p} failed: HTTP ${status} ${msg(body)}`);
    out.push(...(body._embedded?.[key] || []));
    next = body._links?.next?.href || null;
    if (next && !next.startsWith('https://api.pingone.')) throw new Error('refusing to follow a paging link to another host');
  }
  return out;
}

const msg = (b) => (b?.details?.[0]?.message || b?.message || b?.raw || b?.error || '').toString().slice(0, 160);
const isUnique = (r) => r.status === 400 && /UNIQUENESS|already/i.test(JSON.stringify(r.body));
const q = (s) => encodeURIComponent(s);
function safeLiteral(s) { if (/["\\\n\r]/.test(s)) throw new Error(`refusing odd characters in "${s}"`); return s; }

async function roleIds(api) {
  const roles = await listAll(api, '/roles', 'roles');
  return { byName: Object.fromEntries(roles.map((r) => [r.name, r.id])), byId: Object.fromEntries(roles.map((r) => [r.id, r.name])) };
}

// Leaves the worker app holding exactly `keep`, scoped to its own environment. The API-made worker inherits every role of
// its creator (Organization Admin, Identity Data Admin on every environment). PingOne allows one assignment of a role per
// app whatever its scope, so an inherited "Environment Admin" at organization scope blocks adding it on this environment:
// extras are removed FIRST, then the missing kept roles are added, then everything is read back. Failing to ADD a kept role
// is fatal (ok=false); failing to REMOVE an extra is reported in `leftover` and does not stop the setup.
export async function ensureWorkerRoles(api, { envId, appId, keep = KEEP_WORKER_ROLES, expectName = WORKER_APP_NAME }) {
  const { byName, byId } = await roleIds(api);
  const base = `/environments/${envId}/applications/${appId}/roleAssignments`;
  const res = { ok: true, added: [], removed: [], errors: [], leftover: [] };
  // Never trim the wrong principal: it must be a worker app with the name setup gives it.
  const app = await api('GET', `/environments/${envId}/applications/${appId}`);
  if (app.status !== 200 || app.body.type !== 'WORKER' || app.body.name !== expectName) {
    return { ...res, ok: false, errors: [`refusing to trim ${appId}: expected a WORKER app named "${expectName}" in ${envId} (HTTP ${app.status}, found "${app.body?.name}" type ${app.body?.type})`] };
  }
  const isKept = (a) => keep.includes(byId[a.role?.id]) && a.scope?.id === envId && a.scope?.type === 'ENVIRONMENT';
  const label = (a) => `${byId[a.role?.id] || a.role?.id}@${a.scope?.type}:${a.scope?.id}`;
  for (const a of (await listAll(api, base, 'roleAssignments')).filter((x) => !isKept(x))) {
    const r = await api('DELETE', `${base}/${a.id}`);
    if (r.status === 204 || r.status === 200 || r.status === 404) res.removed.push(label(a));
    else res.errors.push(`could not remove ${label(a)}: HTTP ${r.status} ${msg(r.body)}`);
  }
  const held = (await listAll(api, base, 'roleAssignments')).filter(isKept).map((a) => byId[a.role.id]);
  for (const name of keep) {
    if (!byName[name]) { res.ok = false; res.errors.push(`role "${name}" not found`); continue; }
    if (held.includes(name)) continue;
    const r = await api('POST', base, { role: { id: byName[name] }, scope: { id: envId, type: 'ENVIRONMENT' } });
    if (r.status === 200 || r.status === 201) res.added.push(name);
    else { res.ok = false; res.errors.push(`could not add ${name}: HTTP ${r.status} ${msg(r.body)}`); }
  }
  const after = await listAll(api, base, 'roleAssignments');
  res.leftover = after.filter((x) => !isKept(x)).map(label);
  const heldNames = after.filter(isKept).map((a) => byId[a.role.id]);
  for (const n of keep) if (!heldNames.includes(n)) { res.ok = false; if (!res.errors.some((e) => e.includes(n))) res.errors.push(`${n} is not held on the environment after the run`); }
  return res;
}

// A password that meets PingOne's default policy. Never logged: the caller writes it to a mode-600 file.
export function generatePassword() {
  const pick = (chars, n) => Array.from(crypto.randomBytes(n), (b) => chars[b % chars.length]).join('');
  const all = `${pick('abcdefghijkmnopqrstuvwxyz', 6)}${pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 5)}${pick('23456789', 4)}${pick('!#%+=?', 3)}`;
  return all.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

// Makes sure `login` exists as a user INSIDE the environment (the Privilege console needs a user record here, not only in the
// Administrators environment), with Identity Data Admin + Environment Admin on it. An existing user is left alone (no password change).
export async function ensureAdminUser(api, { envId, login, password }) {
  const existing = await findUser(api, envId, login);
  if (existing.length > 1) return { ok: false, created: false, detail: `${existing.length} users match "${login}"` };
  let created = false;
  if (!existing.length) {
    const pops = await listAll(api, `/environments/${envId}/populations`, 'populations');
    const pop = pops.find((x) => x.default) || pops[0];
    if (!pop) return { ok: false, created: false, detail: 'the environment has no population to put the user in' };
    const u = await api('POST', `/environments/${envId}/users`, { username: login, email: login.includes('@') ? login : undefined, name: { given: login.split('@')[0], family: 'Admin' }, population: { id: pop.id }, enabled: true });
    if (u.status !== 201 && u.status !== 200) return { ok: false, created: false, detail: `could not create the user: HTTP ${u.status} ${msg(u.body)}` };
    created = true;
    const pw = await api('PUT', `/environments/${envId}/users/${u.body.id}/password`, { value: password, forceChange: false }, 'application/vnd.pingidentity.password.set+json');
    if (pw.status !== 200) return { ok: false, created, detail: `user created but its password could not be set: HTTP ${pw.status} ${msg(pw.body)}` };
  }
  const g = await grantAdminRoles(api, { adminEnvId: envId, envId, login });
  return { ok: g.ok, created, detail: g.ok ? (created ? 'created' : 'exists') : g.warning };
}

// Switches the Privilege product tag between agent (Endpoint Controller, local desktop agent) and agentless. Backs the bill of
// materials up first, changes only that tag and reads it back. Needs an org-admin token.
export async function setPrivilegeMode(api, { envId, mode, backupDir = path.join(os.homedir(), '.config/demo-kit/backups'), now = () => new Date() }) {
  const tag = { agent: 'AUTHENTICATION_MODE_AGENT', agentless: 'AUTHENTICATION_MODE_AGENTLESS' }[mode];
  if (!tag) return { ok: false, detail: 'mode must be agent or agentless' };
  const got = await api('GET', `/environments/${envId}/billOfMaterials`);
  const pam = got.body.products?.filter((p) => p.type === 'PING_ONE_PAM') || [];
  if (got.status !== 200 || pam.length !== 1) return { ok: false, detail: got.status !== 200 ? `could not read the bill of materials: HTTP ${got.status}` : 'PingOne Privilege is not in this environment (add it in the console first)' };
  if ((pam[0].tags || []).length === 1 && pam[0].tags[0] === tag) return { ok: true, changed: false, detail: `already ${mode}` };
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const bk = path.join(backupDir, `bom-${envId.slice(0, 8)}-${now().toISOString().replace(/[:.]/g, '')}.json`);
  fs.writeFileSync(bk, JSON.stringify(got.body, null, 1), { mode: 0o600 });
  const body = Object.fromEntries(Object.entries(got.body).filter(([k]) => !['_links', 'id', 'createdAt', 'updatedAt', 'environment'].includes(k)));
  body.products = body.products.map((p) => (p.type === 'PING_ONE_PAM' ? { ...p, tags: [tag] } : p));
  const put = await api('PUT', `/environments/${envId}/billOfMaterials`, body);
  const back = (await api('GET', `/environments/${envId}/billOfMaterials`)).body.products?.find((p) => p.type === 'PING_ONE_PAM');
  const ok = put.status === 200 && back?.tags?.[0] === tag;
  return { ok, changed: true, backup: bk, detail: ok ? `now ${mode}` : `HTTP ${put.status} ${msg(put.body)}` };
}

// Flags that take no value. Any other `--name` takes the next argument (a bare one at the end or before another flag reads as '').
const BOOLEAN_FLAGS = new Set(['dry-run', 'no-privilege']);
export function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--') && BOOLEAN_FLAGS.has(a.slice(2))) o[a.slice(2) === 'dry-run' ? 'dryRun' : a.slice(2)] = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? '' : argv[++i];
    else o._.push(a);
  }
  return o;
}

// Checks an environment a PERSON made in the console (Workforce, PingID "create new", Privilege). Read-only.
// Why it exists: through the API PingOne accepts PING_ONE_ID in the bill of materials but never provisions the PingID
// deployment (measured 2026-11-24: no `deployment` on the product, and a PINGID_AUTHENTICATION sign-on action is refused with
// LICENSE_EXCEEDED "PingID is disabled for environment"), so a script cannot create a working PingID environment itself.
// Statuses: PASS / WARN (carry on) / FAIL (stop). exitCode 1 when any FAIL.
export async function checkWorkforceEnv(api, { envId, requirePrivilege = true }) {
  const checks = [];
  const add = (status, name, detail = '') => checks.push({ status, name, detail });
  const env = await api('GET', `/environments/${envId}`);
  if (env.status !== 200) {
    add('FAIL', 'environment', `HTTP ${env.status}: check the id and that this worker can see it (Organization Admin)`);
    return { checks, exitCode: 1 };
  }
  add('PASS', 'environment', `"${env.body.name}" (${env.body.type}, ${env.body.region})`);
  const bom = await api('GET', `/environments/${envId}/billOfMaterials`);
  if (bom.status !== 200) {
    add('FAIL', 'bill of materials', `HTTP ${bom.status}`);
    return { checks, exitCode: 1 };
  }
  const products = bom.body.products || [];
  const of = (t) => products.find((p) => p.type === t);
  if (of('PING_ONE_MFA')) add('FAIL', 'no PingOne MFA', 'PingID cannot share an environment with PingOne MFA: create the environment again without it');
  else add('PASS', 'no PingOne MFA');
  const pid = of('PING_ONE_ID');
  if (!pid) add('FAIL', 'PingID', 'not in this environment: create it in the console with PingID (Workforce, "create new"); an API call cannot add a working PingID');
  else if (pid.subtype !== 'WORKFORCE') add('FAIL', 'PingID Workforce', `subtype is ${pid.subtype || 'none'}, expected WORKFORCE`);
  else if (!pid.deployment?.id) add('FAIL', 'PingID deployment', 'PingID is listed but has no deployment, so it stays disabled (this is what an API-made environment looks like): create the environment in the console with PingID "create new"');
  else add('PASS', 'PingID (Workforce)', 'deployment present');
  const pam = of('PING_ONE_PAM');
  if (!pam) add(requirePrivilege ? 'FAIL' : 'WARN', 'Privilege', 'not in this environment: add it in the console (Add Services, PingOne Privilege, No Endpoint Controller); only the person who adds it becomes Privilege Administrator');
  else add('PASS', 'Privilege', (pam.tags || []).join(', ') || 'no mode tag');
  let names = null;
  try { names = new Set((await listAll(api, `/environments/${envId}/signOnPolicies`, 'signOnPolicies')).map((p) => p.name)); } catch (e) { add('WARN', 'sign-on policies', e.message); }
  if (names) {
    add(names.has('Multi_Factor') ? 'PASS' : 'WARN', 'Multi_Factor sign-on policy', names.has('Multi_Factor') ? '' : 'missing: PingID approvals need it (a console-made PingID environment has it)');
    add(names.has('Single_Factor') ? 'PASS' : 'WARN', 'Single_Factor sign-on policy', names.has('Single_Factor') ? '' : 'missing: `privilege-prepare` creates it');
  }
  return { checks, exitCode: checks.some((c) => c.status === 'FAIL') ? 1 : 0 };
}

// Finds people by username or email, in any environment (the Administrators environment for console logins).
export async function findUser(api, envId, login) {
  const l = safeLiteral(login);
  const r = await api('GET', `/environments/${envId}/users?filter=${q(`username eq "${l}" or email eq "${l}"`)}`);
  if (r.status !== 200) throw new Error(`user search failed: HTTP ${r.status} ${msg(r.body)}`);
  const found = r.body._embedded?.users || [];
  // Several accounts can share an email; an exact username match is the one the person meant.
  const exact = found.filter((u) => String(u.username).toLowerCase() === l.toLowerCase());
  return found.length > 1 && exact.length === 1 ? exact : found;
}

// Gives a console login Identity Data Admin + Environment Admin on `envId`. Unknown / ambiguous login is a warning, not a failure.
export async function grantAdminRoles(api, { adminEnvId, envId, login, roles = ADMIN_USER_ROLES }) {
  const users = await findUser(api, adminEnvId, login);
  if (users.length !== 1) return { ok: false, warning: users.length ? `${users.length} users match "${login}" in the Administrators environment; use the exact username` : `no user "${login}" in the Administrators environment`, granted: [] };
  const uid = users[0].id;
  const { byName, byId } = await roleIds(api);
  const base = `/environments/${adminEnvId}/users/${uid}/roleAssignments`;
  const held = await listAll(api, base, 'roleAssignments');
  const granted = [];
  const errors = [];
  for (const name of roles) {
    const have = held.find((a) => byId[a.role?.id] === name && (a.scope?.id === envId || a.scope?.type === 'ORGANIZATION'));
    if (have) { granted.push(`${name} (already${have.scope.type === 'ORGANIZATION' ? ', organization-wide' : ''})`); continue; } // PingOne allows one assignment of a role per user
    const r = await api('POST', base, { role: { id: byName[name] }, scope: { type: 'ENVIRONMENT', id: envId } });
    if (r.status === 200 || r.status === 201 || isUnique(r)) granted.push(name);
    else errors.push(`${name}: HTTP ${r.status} ${msg(r.body)}`);
  }
  // A "unique" answer is only success if the role really is held: read it back.
  const after = await listAll(api, base, 'roleAssignments');
  for (const name of roles) {
    if (!after.some((a) => byId[a.role?.id] === name && (a.scope?.id === envId || a.scope?.type === 'ORGANIZATION'))) errors.push(`${name}: not held on the environment after the grant (a conflicting assignment may exist: check the user's roles in the console)`);
  }
  return { ok: !errors.length, granted, errors, warning: errors.length ? `could not grant ${errors.join('; ')}` : undefined };
}

// Idempotent finish of the console-added Privilege: group, default sign-on policy, app restriction, memberships.
// Returns { checks: [{name, status: PASS|FAIL|WOULD, detail}], exitCode } (0 ok, 1 a check failed, 2 Privilege not added yet).
export async function preparePrivilege(api, { envId, logins = [], createAdmin, group = DEFAULT_GROUP, dryRun = false, backupDir = path.join(os.homedir(), '.config/demo-kit/backups'), now = () => new Date() }) {
  const checks = [];
  const add = (name, status, detail = '') => checks.push({ name, status, detail });
  const wr = async (verb, name, fn) => { if (dryRun) { add(name, 'WOULD', verb); return null; } return fn(); };

  try { safeLiteral(group); } catch (e) { return { checks: [{ name: 'group name', status: 'FAIL', detail: e.message }], exitCode: 1 }; }
  const apps = await listAll(api, `/environments/${envId}/applications`, 'applications');
  const app = apps.find((a) => a.name === PRIVILEGE_APP);
  if (!app) return { checks: [{ name: 'Privilege app', status: 'FAIL', detail: `no "${PRIVILEGE_APP}" app: add Privilege to this environment in the console first (Add Services > PingOne Privilege > No Endpoint Controller)` }], exitCode: 2 };
  add('Privilege app', 'PASS', app.id);

  // group
  let grp = (await listAll(api, `/environments/${envId}/groups?filter=${q(`name eq "${group}"`)}`, 'groups'))[0];
  if (grp) add(`group ${group}`, 'PASS', 'exists');
  else {
    const r = await wr('create', `group ${group}`, () => api('POST', `/environments/${envId}/groups`, { name: group, description: 'Admins allowed into PingOne Privilege' }));
    if (r) { grp = r.body; add(`group ${group}`, r.status === 201 || r.status === 200 ? 'PASS' : 'FAIL', r.status < 300 ? 'created' : `HTTP ${r.status} ${msg(r.body)}`); }
  }

  // default sign-on policy
  const pols = await listAll(api, `/environments/${envId}/signOnPolicies`, 'signOnPolicies');
  let pol = pols.find((p) => p.default);
  if (pol) add('default sign-on policy', 'PASS', pol.name);
  else {
    const r = await wr('create Single_Factor and make it default', 'default sign-on policy', async () => {
      let p = pols.find((x) => x.name === 'Single_Factor');
      if (!p) { const c = await api('POST', `/environments/${envId}/signOnPolicies`, { name: 'Single_Factor', description: 'Username and password', default: true }); if (c.status >= 300) return c; p = c.body; }
      const acts = await listAll(api, `/environments/${envId}/signOnPolicies/${p.id}/actions`, 'actions');
      if (!acts.some((a) => a.type === 'LOGIN')) { const a = await api('POST', `/environments/${envId}/signOnPolicies/${p.id}/actions`, { type: 'LOGIN', priority: 1, recovery: { enabled: true }, registration: { enabled: false } }); if (a.status >= 300) return a; }
      // PingOne ignores "default" on create; set it with a PUT.
      return api('PUT', `/environments/${envId}/signOnPolicies/${p.id}`, { name: p.name, description: p.description || 'Username and password', default: true });
    });
    if (r) add('default sign-on policy', r.status < 300 ? 'PASS' : 'FAIL', r.status < 300 ? 'Single_Factor created and default' : `HTTP ${r.status} ${msg(r.body)}`);
  }

  // the admin must exist as a user in this environment before it can be put in the group
  let adminCreated = false;
  if (createAdmin) {
    if (dryRun) add(`admin user ${createAdmin.login}`, 'WOULD', 'create inside this environment if missing');
    else {
      try { const a = await ensureAdminUser(api, { envId, login: createAdmin.login, password: createAdmin.password }); adminCreated = a.created; add(`admin user ${createAdmin.login}`, a.ok ? 'PASS' : 'FAIL', a.detail); }
      catch (e) { add(`admin user ${createAdmin.login}`, 'FAIL', e.message); }
    }
    if (!logins.includes(createAdmin.login)) logins = [...logins, createAdmin.login];
  }

  // memberships first: the app is restricted only once the group has a member, so a restriction can never lock everyone out
  for (const login of logins) {
    let users;
    try { users = await findUser(api, envId, login); } catch (e) { add(`member ${login}`, 'FAIL', e.message); continue; }
    if (!users.length && dryRun && createAdmin?.login === login) { add(`member ${login}`, 'WOULD', 'add to group once the user is created'); continue; }
    if (users.length !== 1) { add(`member ${login}`, 'FAIL', users.length ? `${users.length} users match` : 'MISSING: not in this environment'); continue; }
    if (!grp?.id) { add(`member ${login}`, dryRun ? 'WOULD' : 'FAIL', 'group not available'); continue; }
    const base = `/environments/${envId}/users/${users[0].id}/memberOfGroups`;
    const groups = await listAll(api, base, 'groupMemberships').catch(() => []);
    if (groups.some((g) => g.id === grp.id)) { add(`member ${login}`, 'PASS', 'already'); continue; }
    const r = await wr('add to group', `member ${login}`, () => api('POST', base, { id: grp.id }));
    if (r) add(`member ${login}`, r.status < 300 || isUnique(r) ? 'PASS' : 'FAIL', r.status < 300 ? 'added' : `HTTP ${r.status} ${msg(r.body)}`);
  }

  // restrict the Privilege app to the group (GET, back up, change one field, PUT the whole app)
  const name = 'Privilege app restricted to group';
  if (!grp?.id) add(name, dryRun ? 'WOULD' : 'FAIL', 'group not available');
  else {
    const got = await api('GET', `/environments/${envId}/applications/${app.id}`);
    const full = got.body;
    const cur = full.accessControl?.group?.groups || [];
    if (got.status !== 200) add(name, 'FAIL', `could not read the app: HTTP ${got.status} ${msg(full)}`);
    else if (cur.some((g) => g.id === grp.id)) add(name, 'PASS', 'already');
    else {
      const members = await api('GET', `/environments/${envId}/users?limit=1&filter=${q(`memberOfGroups[id eq "${grp.id}"]`)}`);
      const planned = dryRun && checks.some((c) => c.name.startsWith('member ') && c.status === 'WOULD');
      if (planned) add(name, 'WOULD', 'restrict, after the members above are added');
      else if (members.status !== 200 || !(members.body._embedded?.users || []).length) {
        add(name, 'FAIL', `refusing to restrict the app to a group with no members: that would lock everyone out. Pass --users with at least one login that exists in this environment.`);
      } else {
        const r = await wr('restrict', name, async () => {
          fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
          const bk = path.join(backupDir, `privilege-app-${app.id.slice(0, 8)}-${now().toISOString().replace(/[:.]/g, '')}.json`);
          fs.writeFileSync(bk, JSON.stringify(full, null, 1), { mode: 0o600 });
          const body = Object.fromEntries(Object.entries(full).filter(([k]) => !['_links', 'id', 'environment', 'createdAt', 'updatedAt'].includes(k)));
          // keep the existing type (ANY_GROUP or ALL_GROUPS) and groups; add ours
          body.accessControl = { ...(full.accessControl || {}), group: { type: full.accessControl?.group?.type || 'ANY_GROUP', groups: [...cur.map((g) => ({ id: g.id })), { id: grp.id }] } };
          const put = await api('PUT', `/environments/${envId}/applications/${app.id}`, body);
          put.backup = bk; return put;
        });
        if (r) {
          const back = (await api('GET', `/environments/${envId}/applications/${app.id}`)).body.accessControl?.group?.groups || [];
          add(name, r.status < 300 && back.some((g) => g.id === grp.id) ? 'PASS' : 'FAIL', r.status < 300 ? `done, backup ${r.backup}` : `HTTP ${r.status} ${msg(r.body)}`);
        }
      }
    }
  }
  return { checks, exitCode: checks.some((c) => c.status === 'FAIL') ? 1 : 0, adminCreated };
}
