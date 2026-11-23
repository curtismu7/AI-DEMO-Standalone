// PingOne admin steps for the "Privilege in one environment" setup (docs/PRIVILEGE-ONE-ENV.md).
// Pure logic over an injected `api(method, path, body) -> { status, body }`, so the tests run it against a fake PingOne.
// Nothing here prints a token or a secret.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const KEEP_WORKER_ROLES = ['Identity Data Admin', 'Environment Admin'];
export const ADMIN_USER_ROLES = ['Identity Data Admin', 'Environment Admin'];
export const PRIVILEGE_APP = 'PingOne Privilege';
export const DEFAULT_GROUP = 'PrivilegeAdmins';
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

// api client over fetch: three tries on 429 / 5xx / network errors, then the last answer is returned.
export function makeApi({ base, token, fetchImpl = fetch, sleep = sleepMs }) {
  return async function api(method, p, body) {
    const url = p.startsWith('http') ? p : `${base}${p}`;
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetchImpl(url, {
          method,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await r.text();
        let parsed = {};
        try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text.slice(0, 300) }; }
        last = { status: r.status, body: parsed };
        if (r.status !== 429 && r.status < 500) return last;
      } catch (e) {
        last = { status: 0, body: { error: String(e.message || e).slice(0, 200) } };
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
export async function ensureWorkerRoles(api, { envId, appId, keep = KEEP_WORKER_ROLES }) {
  const { byName, byId } = await roleIds(api);
  const base = `/environments/${envId}/applications/${appId}/roleAssignments`;
  const res = { ok: true, added: [], removed: [], errors: [], leftover: [] };
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
  return { ok: !errors.length, granted, errors, warning: errors.length ? `could not grant ${errors.join('; ')}` : undefined };
}

// Idempotent finish of the console-added Privilege: group, default sign-on policy, app restriction, memberships.
// Returns { checks: [{name, status: PASS|FAIL|WOULD, detail}], exitCode } (0 ok, 1 a check failed, 2 Privilege not added yet).
export async function preparePrivilege(api, { envId, logins = [], group = DEFAULT_GROUP, dryRun = false, backupDir = path.join(os.homedir(), '.config/demo-kit/backups'), now = () => new Date() }) {
  const checks = [];
  const add = (name, status, detail = '') => checks.push({ name, status, detail });
  const wr = async (verb, name, fn) => { if (dryRun) { add(name, 'WOULD', verb); return null; } return fn(); };

  const apps = await listAll(api, `/environments/${envId}/applications`, 'applications');
  const app = apps.find((a) => a.name === PRIVILEGE_APP);
  if (!app) return { checks: [{ name: 'Privilege app', status: 'FAIL', detail: `no "${PRIVILEGE_APP}" app: add Privilege to this environment in the console first (Add Services > PingOne Privilege > No Endpoint Controller)` }], exitCode: 2 };
  add('Privilege app', 'PASS', app.id);

  // group
  let grp = (await listAll(api, `/environments/${envId}/groups?filter=${q(`name eq "${safeLiteral(group)}"`)}`, 'groups'))[0];
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

  // restrict the Privilege app to the group (GET, back up, change one field, PUT the whole app)
  if (grp?.id) {
    const full = (await api('GET', `/environments/${envId}/applications/${app.id}`)).body;
    const cur = full.accessControl?.group?.groups || [];
    if (cur.some((g) => g.id === grp.id)) add('Privilege app restricted to group', 'PASS', 'already');
    else {
      const r = await wr('restrict', 'Privilege app restricted to group', async () => {
        fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
        const bk = path.join(backupDir, `privilege-app-${app.id.slice(0, 8)}-${now().toISOString().replace(/[:.]/g, '')}.json`);
        fs.writeFileSync(bk, JSON.stringify(full, null, 1), { mode: 0o600 });
        const body = Object.fromEntries(Object.entries(full).filter(([k]) => !['_links', 'id', 'environment', 'createdAt', 'updatedAt'].includes(k)));
        body.accessControl = { ...(full.accessControl || {}), group: { type: 'ANY_GROUP', groups: [...cur.map((g) => ({ id: g.id })), { id: grp.id }] } };
        const put = await api('PUT', `/environments/${envId}/applications/${app.id}`, body);
        put.backup = bk; return put;
      });
      if (r) {
        const back = (await api('GET', `/environments/${envId}/applications/${app.id}`)).body.accessControl?.group?.groups || [];
        add('Privilege app restricted to group', r.status < 300 && back.some((g) => g.id === grp.id) ? 'PASS' : 'FAIL', r.status < 300 ? `done, backup ${r.backup}` : `HTTP ${r.status} ${msg(r.body)}`);
      }
    }
  }

  // memberships
  for (const login of logins) {
    const users = await findUser(api, envId, login);
    if (users.length !== 1) { add(`member ${login}`, 'FAIL', users.length ? `${users.length} users match` : 'MISSING: not in this environment'); continue; }
    if (!grp?.id) { add(`member ${login}`, dryRun ? 'WOULD' : 'FAIL', 'group not available'); continue; }
    const base = `/environments/${envId}/users/${users[0].id}/memberOfGroups`;
    const groups = await listAll(api, base, 'groupMemberships').catch(() => []);
    if (groups.some((g) => g.id === grp.id)) { add(`member ${login}`, 'PASS', 'already'); continue; }
    const r = await wr('add to group', `member ${login}`, () => api('POST', base, { id: grp.id }));
    if (r) add(`member ${login}`, r.status < 300 || isUnique(r) ? 'PASS' : 'FAIL', r.status < 300 ? 'added' : `HTTP ${r.status} ${msg(r.body)}`);
  }
  return { checks, exitCode: checks.some((c) => c.status === 'FAIL') ? 1 : 0 };
}
