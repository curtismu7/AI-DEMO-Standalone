import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { checkWorkforceEnv, ensureAdminUser, ensureWorkerRoles, generatePassword, grantAdminRoles, listAll, makeApi, parseArgs, preparePrivilege, setPrivilegeMode } from './lib/pingone-admin.mjs';

const ENV = 'env-new', OTHER = 'env-other', ADMIN = 'env-admin', WORKER = 'app-worker';
const ROLES = [['r-ida', 'Identity Data Admin'], ['r-env', 'Environment Admin'], ['r-org', 'Organization Admin'], ['r-pa', 'PingOne Privilege Administrator']];

// A small in-memory PingOne: only the routes the library touches.
function fakePingOne(opts = {}) {
  let n = 100;
  const id = (p) => `${p}-${++n}`;
  const st = {
    calls: [], puts: [], passwords: [], bom: opts.bom ?? { products: [{ type: 'PING_ONE_BASE' }, { type: 'PING_ONE_PAM', tags: ['AUTHENTICATION_MODE_AGENTLESS'] }], _links: {}, id: 'b1' }, bomPutStatus: opts.bomPutStatus || 200, createUserStatus: opts.createUserStatus || 201, passwordStatus: opts.passwordStatus || 200, workerApp: opts.workerApp ?? { id: WORKER, type: 'WORKER', name: 'Standalone Labs Worker' }, appGetStatus: opts.appGetStatus || 200, userRoleConflict: opts.userRoleConflict || false,
    workerAssignments: opts.workerAssignments || [],
    adminUsers: opts.adminUsers ?? [{ id: 'u-curtis', username: 'curtis@example.com', email: 'curtis@example.com' }],
    userRoles: [],
    apps: opts.apps ?? [{ id: 'app-priv', name: 'PingOne Privilege', accessControl: { group: { type: 'ANY_GROUP', groups: [{ id: 'g-other' }] } }, enabled: true, createdAt: 'x', _links: {} }],
    groups: opts.groups ?? [], policies: opts.policies ?? [], actions: {}, users: opts.users ?? [{ id: 'u-demo', username: 'demouser' }], members: {},
    failDelete: opts.failDelete || false, failAddRole: opts.failAddRole || false,
  };
  const embed = (key, arr) => ({ status: 200, body: { _embedded: { [key]: arr } } });
  const api = async function (method, p, body) {
    st.calls.push([method, p, body]);
    let m;
    if (p === '/roles') return embed('roles', ROLES.map(([i, name]) => ({ id: i, name })));
    if (p === `/environments/${ENV}/applications/${WORKER}`) return { status: 200, body: st.workerApp };
    if ((m = p.match(new RegExp(`^/environments/${ENV}/applications/${WORKER}/roleAssignments(?:/(.+))?$`)))) {
      if (method === 'GET') return embed('roleAssignments', st.workerAssignments);
      if (method === 'POST') {
        if (st.failAddRole) return { status: 403, body: { message: 'denied' } };
        const a = { id: id('ra'), role: { id: body.role.id }, scope: body.scope };
        // PingOne allows one assignment of a role per app, whatever the scope (measured 2026-11-23).
        if (st.workerAssignments.some((x) => x.role.id === a.role.id)) return { status: 400, body: { code: 'UNIQUENESS_VIOLATION' } };
        st.workerAssignments.push(a); return { status: 201, body: a };
      }
      if (method === 'DELETE') {
        if (st.failDelete) return { status: 403, body: { message: 'no' } };
        st.workerAssignments = st.workerAssignments.filter((x) => x.id !== m[1]); return { status: 204, body: {} };
      }
    }
    if ((m = p.match(new RegExp(`^/environments/${ADMIN}/users\\?filter=(.*)$`)))) {
      const f = decodeURIComponent(m[1]); const login = f.match(/username eq "([^"]*)"/)[1];
      return embed('users', st.adminUsers.filter((u) => u.username === login || u.email === login));
    }
    if (p === `/environments/${ENV}/billOfMaterials`) {
      if (method === 'GET') return { status: 200, body: JSON.parse(JSON.stringify(st.bom)) };
      st.bomPuts = [...(st.bomPuts || []), body]; if (st.bomPutStatus === 200) st.bom = { ...st.bom, products: body.products }; return { status: st.bomPutStatus, body: {} };
    }
    if (p === `/environments/${ENV}/populations`) return embed('populations', [{ id: 'pop-x', default: false }, { id: 'pop-1', default: true }]);
    if (p === `/environments/${ENV}/users` && method === 'POST') {
      if (st.createUserStatus !== 201) return { status: st.createUserStatus, body: { message: 'no' } };
      const u = { id: id('u'), username: body.username, email: body.email, population: body.population }; st.users.push(u); st.createdUsers = [...(st.createdUsers || []), body]; return { status: 201, body: u };
    }
    if ((m = p.match(new RegExp(`^/environments/${ENV}/users/([^/]+)/password$`)))) { st.passwords.push({ user: m[1], body, contentType: arguments[3] }); return { status: st.passwordStatus, body: {} }; }
    if ((m = p.match(new RegExp(`^/environments/(${ADMIN}|${ENV})/users/([^/]+)/roleAssignments$`)))) {
      m = [m[0], m[2]];
      if (method === 'GET') return embed('roleAssignments', st.userRoles.filter((r) => r.user === m[1]));
      if (st.userRoleConflict) return { status: 400, body: { code: 'UNIQUENESS_VIOLATION' } };
      const a = { id: id('ura'), user: m[1], role: { id: body.role.id }, scope: body.scope }; st.userRoles.push(a); return { status: 201, body: a };
    }
    if (p === `/environments/${ENV}/applications`) return embed('applications', st.apps);
    if (p.startsWith(`/environments/${ENV}/applications/app-priv`)) {
      const app = st.apps.find((a) => a.id === 'app-priv');
      if (method === 'GET') return st.appGetStatus === 200 ? { status: 200, body: app } : { status: st.appGetStatus, body: { message: 'nope' } };
      if (method === 'PUT') { st.puts.push(body); Object.assign(app, body); return { status: 200, body: app }; }
    }
    if (p.startsWith(`/environments/${ENV}/groups?filter=`)) { const name = decodeURIComponent(p).match(/name eq "([^"]*)"/)[1]; return embed('groups', st.groups.filter((g) => g.name === name)); }
    if (p === `/environments/${ENV}/groups` && method === 'POST') { const g = { id: id('g'), name: body.name }; st.groups.push(g); return { status: 201, body: g }; }
    if (p === `/environments/${ENV}/signOnPolicies`) {
      if (method === 'GET') return embed('signOnPolicies', st.policies);
      const pol = { id: id('pol'), name: body.name, description: body.description, default: false }; st.policies.push(pol); st.actions[pol.id] = []; return { status: 201, body: pol };
    }
    if ((m = p.match(new RegExp(`^/environments/${ENV}/signOnPolicies/([^/]+)(/actions)?$`)))) {
      const pol = st.policies.find((x) => x.id === m[1]);
      if (m[2]) { if (method === 'GET') return embed('actions', st.actions[m[1]] || []); st.actions[m[1]] = [...(st.actions[m[1]] || []), body]; return { status: 201, body }; }
      if (method === 'PUT') { Object.assign(pol, body); return { status: 200, body: pol }; }
    }
    if (p.startsWith(`/environments/${ENV}/users?limit=1&filter=`)) { const gid = decodeURIComponent(p).match(/id eq "([^"]*)"/)[1]; return embed('users', st.users.filter((u) => (st.members[u.id] || []).includes(gid)).slice(0, 1)); }
    if (p.startsWith(`/environments/${ENV}/users?filter=`)) { const login = decodeURIComponent(p).match(/username eq "([^"]*)"/)[1]; return embed('users', st.users.filter((u) => u.username === login || u.email === login)); }
    if ((m = p.match(new RegExp(`^/environments/${ENV}/users/([^/]+)/memberOfGroups$`)))) {
      if (method === 'GET') return embed('groupMemberships', (st.members[m[1]] || []).map((gid) => ({ id: gid })));
      (st.members[m[1]] = st.members[m[1]] || []).push(body.id); return { status: 201, body: {} };
    }
    return { status: 404, body: { message: `no route ${method} ${p}` } };
  };
  return { st, api };
}
const ra = (roleId, scopeType, scopeId, i) => ({ id: `ra-${i}`, role: { id: roleId }, scope: { type: scopeType, id: scopeId } });
const names = (st) => st.workerAssignments.map((a) => `${ROLES.find((r) => r[0] === a.role.id)[1]}@${a.scope.type}:${a.scope.id}`).sort();
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'p1admin-'));

test('ensureWorkerRoles trims an inherited worker to IDA + Environment Admin on its own environment', async () => {
  const { st, api } = fakePingOne({ workerAssignments: [ra('r-ida', 'ENVIRONMENT', ENV, 1), ra('r-org', 'ORGANIZATION', 'org-1', 2), ra('r-ida', 'ENVIRONMENT', OTHER, 3), ra('r-env', 'ENVIRONMENT', OTHER, 4)] });
  const r = await ensureWorkerRoles(api, { envId: ENV, appId: WORKER });
  assert.equal(r.ok, true);
  assert.deepEqual(names(st), [`Environment Admin@ENVIRONMENT:${ENV}`, `Identity Data Admin@ENVIRONMENT:${ENV}`]);
  assert.equal(r.removed.length, 3);
  assert.deepEqual(r.leftover, []);
});

test('ensureWorkerRoles is idempotent', async () => {
  const { st, api } = fakePingOne({ workerAssignments: [ra('r-org', 'ORGANIZATION', 'org-1', 1)] });
  await ensureWorkerRoles(api, { envId: ENV, appId: WORKER });
  const before = names(st);
  const again = await ensureWorkerRoles(api, { envId: ENV, appId: WORKER });
  assert.deepEqual(names(st), before);
  assert.deepEqual(again.added, []);
  assert.deepEqual(again.removed, []);
});

test('ensureWorkerRoles --strict: a role that could not be removed fails the run (the worker would carry an organization-wide role into the settings file)', async () => {
  const { api } = fakePingOne({ failDelete: true, workerAssignments: [ra('r-ida', 'ENVIRONMENT', ENV, 1), ra('r-env', 'ENVIRONMENT', ENV, 2), ra('r-org', 'ORGANIZATION', 'org-1', 3)] });
  const r = await ensureWorkerRoles(api, { envId: ENV, appId: WORKER, strict: true });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /still holds Organization Admin@ORGANIZATION:org-1/);
  const clean = await ensureWorkerRoles(fakePingOne({ workerAssignments: [ra('r-org', 'ORGANIZATION', 'org-1', 1)] }).api, { envId: ENV, appId: WORKER, strict: true });
  assert.equal(clean.ok, true);   // strict only bites when something is left
});

test('ensureWorkerRoles: a denied removal is reported in leftover and does not fail the setup', async () => {
  const { api } = fakePingOne({ failDelete: true, workerAssignments: [ra('r-ida', 'ENVIRONMENT', ENV, 1), ra('r-env', 'ENVIRONMENT', ENV, 2), ra('r-org', 'ORGANIZATION', 'org-1', 3)] });
  const r = await ensureWorkerRoles(api, { envId: ENV, appId: WORKER });
  assert.equal(r.ok, true);
  assert.deepEqual(r.leftover, ['Organization Admin@ORGANIZATION:org-1']);
  assert.match(r.errors[0], /could not remove Organization Admin/);
});

test('ensureWorkerRoles: an inherited Environment Admin at organization scope is replaced by one on this environment, not just deleted', async () => {
  const { st, api } = fakePingOne({ workerAssignments: [ra('r-ida', 'ENVIRONMENT', ENV, 1), ra('r-env', 'ORGANIZATION', 'org-1', 2)] });
  const r = await ensureWorkerRoles(api, { envId: ENV, appId: WORKER });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(names(st), [`Environment Admin@ENVIRONMENT:${ENV}`, `Identity Data Admin@ENVIRONMENT:${ENV}`]);
});

test('ensureWorkerRoles: failing to add a kept role is fatal and says which', async () => {
  const { api } = fakePingOne({ failAddRole: true, workerAssignments: [ra('r-ida', 'ENVIRONMENT', ENV, 1)] });
  const r = await ensureWorkerRoles(api, { envId: ENV, appId: WORKER });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /could not add Environment Admin/);
});

test('grantAdminRoles gives IDA + Environment Admin once, and a second run grants nothing new', async () => {
  const { st, api } = fakePingOne();
  const a = await grantAdminRoles(api, { adminEnvId: ADMIN, envId: ENV, login: 'curtis@example.com' });
  assert.equal(a.ok, true);
  assert.equal(st.userRoles.length, 2);
  await grantAdminRoles(api, { adminEnvId: ADMIN, envId: ENV, login: 'curtis@example.com' });
  assert.equal(st.userRoles.length, 2);
});

test('grantAdminRoles: unknown or ambiguous login is a warning, never a throw', async () => {
  const none = await grantAdminRoles(fakePingOne().api, { adminEnvId: ADMIN, envId: ENV, login: 'nobody@example.com' });
  assert.equal(none.ok, false);
  assert.match(none.warning, /no user/);
  const dup = fakePingOne({ adminUsers: [{ id: 'a', username: 'x1', email: 'x@example.com' }, { id: 'b', username: 'y', email: 'x@example.com' }] });
  const r = await grantAdminRoles(dup.api, { adminEnvId: ADMIN, envId: ENV, login: 'x@example.com' });
  assert.match(r.warning, /2 users match/);
  assert.equal(dup.st.userRoles.length, 0);
});

test('grantAdminRoles: several accounts share the email, but one has exactly that username: it wins', async () => {
  const f = fakePingOne({ adminUsers: [{ id: 'a', username: 'administrator', email: 'x@example.com' }, { id: 'b', username: 'x@example.com', email: 'x@example.com' }] });
  const r = await grantAdminRoles(f.api, { adminEnvId: ADMIN, envId: ENV, login: 'x@example.com' });
  assert.equal(r.ok, true);
  assert.ok(f.st.userRoles.every((a) => a.user === 'b'));
});

test('grantAdminRoles: a role already held organization-wide counts as granted and is not requested again', async () => {
  const f = fakePingOne();
  f.st.userRoles.push({ id: 'x', user: 'u-curtis', role: { id: 'r-env' }, scope: { type: 'ORGANIZATION', id: 'org-1' } });
  const r = await grantAdminRoles(f.api, { adminEnvId: ADMIN, envId: ENV, login: 'curtis@example.com' });
  assert.ok(r.granted.includes('Environment Admin (already, organization-wide)'));
  assert.equal(f.st.userRoles.filter((a) => a.role.id === 'r-env').length, 1);
});

test('grantAdminRoles refuses a login with quotes (filter injection)', async () => {
  await assert.rejects(() => grantAdminRoles(fakePingOne().api, { adminEnvId: ADMIN, envId: ENV, login: 'a" or username pr "' }), /odd characters/);
});

test('preparePrivilege builds everything, keeps existing app groups, and a second run changes nothing', async () => {
  const { st, api } = fakePingOne();
  const dir = tmp();
  const r = await preparePrivilege(api, { envId: ENV, logins: ['demouser'], backupDir: dir });
  assert.equal(r.exitCode, 0, JSON.stringify(r.checks));
  assert.equal(st.groups.length, 1);
  assert.equal(st.policies[0].default, true);
  assert.deepEqual(st.actions[st.policies[0].id].map((a) => a.type), ['LOGIN']);
  assert.deepEqual(st.apps[0].accessControl.group.groups.map((g) => g.id).sort(), ['g-other', st.groups[0].id].sort());
  assert.equal(st.members['u-demo'].length, 1);
  assert.equal(fs.readdirSync(dir).length, 1); // app backup, mode 600
  assert.equal(fs.statSync(path.join(dir, fs.readdirSync(dir)[0])).mode & 0o777, 0o600);
  const writes = st.calls.filter((c) => c[0] !== 'GET').length;
  const again = await preparePrivilege(api, { envId: ENV, logins: ['demouser'], backupDir: dir });
  assert.equal(again.exitCode, 0);
  assert.equal(st.calls.filter((c) => c[0] !== 'GET').length, writes, 'second run wrote nothing');
});

test('preparePrivilege: Privilege not added yet exits 2 and writes nothing', async () => {
  const { st, api } = fakePingOne({ apps: [] });
  const r = await preparePrivilege(api, { envId: ENV, logins: ['demouser'], backupDir: tmp() });
  assert.equal(r.exitCode, 2);
  assert.match(r.checks[0].detail, /add Privilege/);
  assert.equal(st.calls.filter((c) => c[0] !== 'GET').length, 0);
});

test('preparePrivilege: a user who is not in the environment is MISSING and exits 1; the rest still run', async () => {
  const { st, api } = fakePingOne();
  const r = await preparePrivilege(api, { envId: ENV, logins: ['ghost', 'demouser'], backupDir: tmp() });
  assert.equal(r.exitCode, 1);
  assert.match(r.checks.find((c) => c.name === 'member ghost').detail, /MISSING/);
  assert.equal(r.checks.find((c) => c.name === 'member demouser').status, 'PASS');
  assert.equal(st.members['u-demo'].length, 1);
});

test('preparePrivilege --dry-run writes nothing and reports what it would do', async () => {
  const { st, api } = fakePingOne();
  const dir = tmp();
  const r = await preparePrivilege(api, { envId: ENV, logins: ['demouser'], backupDir: dir, dryRun: true });
  assert.equal(st.calls.filter((c) => c[0] !== 'GET').length, 0);
  assert.equal(fs.readdirSync(dir).length, 0);
  assert.ok(r.checks.some((c) => c.status === 'WOULD'));
  assert.equal(r.exitCode, 0);
});

test('preparePrivilege keeps an existing default policy and existing group', async () => {
  const { st, api } = fakePingOne({ policies: [{ id: 'pol-x', name: 'Mine', default: true }], groups: [{ id: 'g-1', name: 'PrivilegeAdmins' }] });
  await preparePrivilege(api, { envId: ENV, logins: [], backupDir: tmp() });
  assert.equal(st.policies.length, 1);
  assert.equal(st.groups.length, 1);
});

test('makeApi retries 5xx and 429 three times, then returns the last answer; never puts the token in an error', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { status: 503, text: async () => '{"message":"down"}' }; };
  const api = makeApi({ base: 'https://x', token: 'SECRET-TOKEN', fetchImpl, sleep: async () => {} });
  const r = await api('GET', '/roles');
  assert.equal(calls, 3);
  assert.equal(r.status, 503);
  let n = 0;
  const ok = makeApi({ base: 'https://x', token: 't', fetchImpl: async () => (++n < 2 ? { status: 429, text: async () => '{}' } : { status: 200, text: async () => '{"a":1}' }), sleep: async () => {} });
  assert.deepEqual((await ok('GET', '/roles')).body, { a: 1 });
  await assert.rejects(() => listAll(async () => ({ status: 500, body: { message: 'boom' } }), '/roles', 'roles'), (e) => !/SECRET/.test(e.message));
});

test('pingone-setup.sh: PingOne MFA is only requested behind --with-pingone-mfa', () => {
  const sh = fs.readFileSync(new URL('./pingone-setup.sh', import.meta.url), 'utf8');
  const defaultLine = sh.split('\n').find((l) => l.startsWith("bom_products='"));
  assert.ok(defaultLine && !defaultLine.includes('PING_ONE_MFA'), 'default products must not include MFA');
  const mfaLines = sh.split('\n').filter((l) => l.includes('PING_ONE_MFA'));
  assert.equal(mfaLines.length, 1);
  assert.match(sh, /if \[\[ "\$WITH_MFA" == "1" \]\]; then\n\s+bom_products=.*PING_ONE_MFA/);
});

const cacheApp = (st) => st.apps[0];

test('preparePrivilege sends the WHOLE app on the restriction PUT (no _links/id/createdAt) and keeps its other fields', async () => {
  const { st, api } = fakePingOne();
  await preparePrivilege(api, { envId: ENV, logins: ['demouser'], backupDir: tmp() });
  const body = st.puts[0];
  assert.equal(body.enabled, true);
  assert.equal(body.name, 'PingOne Privilege');
  for (const k of ['_links', 'id', 'createdAt', 'environment']) assert.ok(!(k in body), `${k} must not be sent`);
});

test('preparePrivilege keeps an existing ALL_GROUPS type instead of widening it', async () => {
  const { st, api } = fakePingOne({ apps: [{ id: 'app-priv', name: 'PingOne Privilege', enabled: true, accessControl: { group: { type: 'ALL_GROUPS', groups: [{ id: 'g-other' }] } } }] });
  await preparePrivilege(api, { envId: ENV, logins: ['demouser'], backupDir: tmp() });
  assert.equal(cacheApp(st).accessControl.group.type, 'ALL_GROUPS');
});

test('preparePrivilege refuses to restrict the app to an empty group (no lockout), with no users or only missing ones', async () => {
  for (const logins of [[], ['ghost']]) {
    const { st, api } = fakePingOne();
    const r = await preparePrivilege(api, { envId: ENV, logins, backupDir: tmp() });
    assert.equal(r.exitCode, 1);
    assert.equal(st.puts.length, 0, 'the app must not be touched');
    assert.match(r.checks.find((c) => c.name === 'Privilege app restricted to group').detail, /no members/);
  }
});

test('preparePrivilege: an unreadable app is a FAIL and nothing is written to it', async () => {
  const { st, api } = fakePingOne({ appGetStatus: 500 });
  const r = await preparePrivilege(api, { envId: ENV, logins: ['demouser'], backupDir: tmp() });
  assert.equal(st.puts.length, 0);
  assert.match(r.checks.find((c) => c.name === 'Privilege app restricted to group').detail, /could not read the app/);
});

test('preparePrivilege: a login with quotes is a per-login FAIL, the table still prints, and a bad group name fails before any write', async () => {
  const { st, api } = fakePingOne();
  const r = await preparePrivilege(api, { envId: ENV, logins: ['bad"login', 'demouser'], backupDir: tmp() });
  assert.match(r.checks.find((c) => c.name === 'member bad"login').detail, /odd characters/);
  assert.equal(r.checks.find((c) => c.name === 'member demouser').status, 'PASS');
  const bad = fakePingOne();
  const g = await preparePrivilege(bad.api, { envId: ENV, logins: [], group: 'a"b', backupDir: tmp() });
  assert.equal(g.exitCode, 1);
  assert.equal(bad.st.calls.filter((c) => c[0] !== 'GET').length, 0);
});

test('preparePrivilege --dry-run plans the group, the members and the restriction, and writes nothing', async () => {
  const { st, api } = fakePingOne();
  const r = await preparePrivilege(api, { envId: ENV, logins: ['demouser'], backupDir: tmp(), dryRun: true });
  assert.equal(st.calls.filter((c) => c[0] !== 'GET').length, 0);
  const plan = r.checks.filter((c) => c.status === 'WOULD').map((c) => c.name);
  assert.ok(plan.includes('group PrivilegeAdmins') && plan.includes('member demouser') && plan.includes('Privilege app restricted to group'), plan.join(' | '));
});

test('user lookup by email works too', async () => {
  const { api } = fakePingOne({ users: [{ id: 'u-1', username: 'jane', email: 'jane@example.com' }] });
  const r = await preparePrivilege(api, { envId: ENV, logins: ['jane@example.com'], backupDir: tmp() });
  assert.equal(r.checks.find((c) => c.name === 'member jane@example.com').status, 'PASS');
});

test('grantAdminRoles: a "unique" refusal that leaves the role unheld is reported, not counted as granted', async () => {
  const f = fakePingOne({ userRoleConflict: true });
  const r = await grantAdminRoles(f.api, { adminEnvId: ADMIN, envId: ENV, login: 'curtis@example.com' });
  assert.equal(r.ok, false);
  assert.match(r.warning, /not held on the environment/);
});

test('ensureWorkerRoles refuses a principal that is not the setup worker (e.g. the org admin worker)', async () => {
  const { st, api } = fakePingOne({ workerApp: { id: WORKER, type: 'WORKER', name: 'Org admin worker' }, workerAssignments: [ra('r-org', 'ORGANIZATION', 'org-1', 1)] });
  const r = await ensureWorkerRoles(api, { envId: ENV, appId: WORKER });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /refusing to trim/);
  assert.equal(st.workerAssignments.length, 1);
  assert.equal(st.calls.filter((c) => c[0] !== 'GET').length, 0);
});

test('ensureWorkerRoles: a denied removal of the org-scope Environment Admin leaves the worker without it on the environment: fatal', async () => {
  const { api } = fakePingOne({ failDelete: true, workerAssignments: [ra('r-ida', 'ENVIRONMENT', ENV, 1), ra('r-env', 'ORGANIZATION', 'org-1', 2)] });
  const r = await ensureWorkerRoles(api, { envId: ENV, appId: WORKER });
  assert.equal(r.ok, false);
});

test('listAll follows _links.next and refuses a link to another host; writes are not retried on 5xx', async () => {
  const pages = { '/x': { _embedded: { items: [1] }, _links: { next: { href: 'https://api.pingone.com/v1/x2' } } }, 'https://api.pingone.com/v1/x2': { _embedded: { items: [2] } } };
  const api = async (m, p) => ({ status: 200, body: pages[p] });
  assert.deepEqual(await listAll(api, '/x', 'items'), [1, 2]);
  await assert.rejects(() => listAll(async () => ({ status: 200, body: { _links: { next: { href: 'https://evil.example/steal' } } } }), '/y', 'items'), /another host/);
  let n = 0;
  const w = makeApi({ base: 'https://x', token: 't', fetchImpl: async () => { n++; return { status: 503, text: async () => '{}' }; }, sleep: async () => {} });
  await w('POST', '/roles', {});
  assert.equal(n, 1);
});

test('generatePassword: long enough, mixed classes, different each time', () => {
  const a = generatePassword(); const b = generatePassword();
  assert.ok(a.length >= 16 && /[a-z]/.test(a) && /[A-Z]/.test(a) && /[0-9]/.test(a) && /[^A-Za-z0-9]/.test(a), 'complexity');
  assert.notEqual(a, b);
});

test('ensureAdminUser creates the user in the environment with a password (right content type) and the two admin roles', async () => {
  const { st, api } = fakePingOne({ users: [] });
  const r = await ensureAdminUser(api, { envId: ENV, login: 'me@example.com', password: 'Pw-123' });
  assert.equal(r.ok, true, r.detail);
  assert.equal(r.created, true);
  assert.equal(st.createdUsers[0].population.id, 'pop-1', 'default population');
  assert.equal(st.createdUsers[0].username, 'me@example.com');
  assert.deepEqual(st.passwords[0].body, { value: 'Pw-123', forceChange: false });
  assert.equal(st.passwords[0].contentType, 'application/vnd.pingidentity.password.set+json');
  assert.equal(st.userRoles.length, 2);
});

test('ensureAdminUser leaves an existing user alone: no create, no password change', async () => {
  const { st, api } = fakePingOne({ users: [{ id: 'u-me', username: 'me@example.com', email: 'me@example.com' }] });
  const r = await ensureAdminUser(api, { envId: ENV, login: 'me@example.com', password: 'x' });
  assert.equal(r.created, false);
  assert.equal(st.passwords.length, 0);
  assert.equal(st.createdUsers, undefined);
});

test('ensureAdminUser reports a failed create and a failed password, without throwing', async () => {
  const a = await ensureAdminUser(fakePingOne({ users: [], createUserStatus: 403 }).api, { envId: ENV, login: 'me@example.com', password: 'x' });
  assert.equal(a.ok, false); assert.match(a.detail, /could not create the user/);
  const b = await ensureAdminUser(fakePingOne({ users: [], passwordStatus: 400 }).api, { envId: ENV, login: 'me@example.com', password: 'x' });
  assert.equal(b.ok, false); assert.equal(b.created, true); assert.match(b.detail, /password could not be set/);
});

test('preparePrivilege --create-admin: creates the user, puts it in the group, restricts the app; the second run changes nothing', async () => {
  const { st, api } = fakePingOne({ users: [] });
  const r = await preparePrivilege(api, { envId: ENV, createAdmin: { login: 'me@example.com', password: 'Pw-123' }, backupDir: tmp() });
  assert.equal(r.exitCode, 0, JSON.stringify(r.checks));
  assert.equal(r.adminCreated, true);
  assert.equal(st.members[st.users[0].id].length, 1);
  assert.equal(st.apps[0].accessControl.group.groups.length, 2);
  const writes = st.calls.filter((c) => c[0] !== 'GET').length;
  const again = await preparePrivilege(api, { envId: ENV, createAdmin: { login: 'me@example.com', password: 'other' }, backupDir: tmp() });
  assert.equal(again.adminCreated, false);
  assert.equal(st.calls.filter((c) => c[0] !== 'GET').length, writes);
  assert.equal(st.passwords.length, 1);
});

test('preparePrivilege --create-admin with Privilege missing creates nothing; with --dry-run writes nothing', async () => {
  const none = fakePingOne({ apps: [], users: [] });
  const r = await preparePrivilege(none.api, { envId: ENV, createAdmin: { login: 'me@example.com', password: 'x' }, backupDir: tmp() });
  assert.equal(r.exitCode, 2); assert.equal(none.st.users.length, 0);
  const dry = fakePingOne({ users: [] });
  const d = await preparePrivilege(dry.api, { envId: ENV, createAdmin: { login: 'me@example.com', password: '' }, backupDir: tmp(), dryRun: true });
  assert.equal(dry.st.calls.filter((c) => c[0] !== 'GET').length, 0);
  assert.ok(d.checks.some((c) => c.name === 'admin user me@example.com' && c.status === 'WOULD'));
  assert.ok(d.checks.some((c) => c.name === 'member me@example.com' && c.status === 'WOULD'), 'planned admin is not reported MISSING');
  assert.equal(d.exitCode, 0);
});

test('preparePrivilege --create-admin: a failed user create is a FAIL and the app is not restricted', async () => {
  const f = fakePingOne({ users: [], createUserStatus: 403 });
  const r = await preparePrivilege(f.api, { envId: ENV, createAdmin: { login: 'me@example.com', password: 'x' }, backupDir: tmp() });
  assert.equal(r.exitCode, 1);
  assert.equal(f.st.puts.length, 0);
});

test('setPrivilegeMode flips only the Privilege tag, backs the bill of materials up (mode 600), reads back, and is idempotent', async () => {
  const { st, api } = fakePingOne();
  const dir = tmp();
  const r = await setPrivilegeMode(api, { envId: ENV, mode: 'agent', backupDir: dir });
  assert.equal(r.ok, true, r.detail);
  assert.deepEqual(st.bomPuts[0].products, [{ type: 'PING_ONE_BASE' }, { type: 'PING_ONE_PAM', tags: ['AUTHENTICATION_MODE_AGENT'] }]);
  const bk = fs.readdirSync(dir)[0];
  assert.equal(fs.statSync(path.join(dir, bk)).mode & 0o777, 0o600);
  assert.match(fs.readFileSync(path.join(dir, bk), 'utf8'), /AGENTLESS/);
  const again = await setPrivilegeMode(api, { envId: ENV, mode: 'agent', backupDir: dir });
  assert.equal(again.changed, false);
  assert.equal(st.bomPuts.length, 1);
});

test('setPrivilegeMode refuses a bad mode and an environment without Privilege, and reports a rejected PUT', async () => {
  assert.equal((await setPrivilegeMode(fakePingOne().api, { envId: ENV, mode: 'both', backupDir: tmp() })).ok, false);
  const none = await setPrivilegeMode(fakePingOne({ bom: { products: [{ type: 'PING_ONE_BASE' }] } }).api, { envId: ENV, mode: 'agent', backupDir: tmp() });
  assert.equal(none.ok, false); assert.match(none.detail, /not in this environment/);
  const bad = await setPrivilegeMode(fakePingOne({ bomPutStatus: 400 }).api, { envId: ENV, mode: 'agent', backupDir: tmp() });
  assert.equal(bad.ok, false);
});

// ---- check-env: an environment a person made in the console (Workforce, PingID "create new", Privilege) ----
function envApi({ env = { status: 200, body: { name: 'Demo', type: 'SANDBOX', region: 'NA' } }, products, policies = ['Multi_Factor', 'Single_Factor'], bomStatus = 200 }) {
  return async (method, p) => {
    if (p === '/environments/e1') return env;
    if (p === '/environments/e1/billOfMaterials') return { status: bomStatus, body: { products } };
    if (p === '/environments/e1/signOnPolicies') return { status: 200, body: { _embedded: { signOnPolicies: policies.map((name) => ({ name })) } } };
    return { status: 404, body: {} };
  };
}
const CONSOLE_MADE = [
  { type: 'PING_ONE_BASE' }, { type: 'PING_ONE_DAVINCI' }, { type: 'PING_ONE_AUTHORIZE' },
  { type: 'PING_ONE_ID', subtype: 'WORKFORCE', deployment: { id: 'dep-1' } },
  { type: 'PING_ONE_PAM', tags: ['AUTHENTICATION_MODE_AGENTLESS'] },
];
const status = (r, name) => r.checks.find((c) => c.name === name)?.status;

test('checkWorkforceEnv: a console-made Workforce environment with PingID and Privilege passes', async () => {
  const r = await checkWorkforceEnv(envApi({ products: CONSOLE_MADE }), { envId: 'e1' });
  assert.equal(r.exitCode, 0);
  assert.ok(r.checks.every((c) => c.status === 'PASS'), JSON.stringify(r.checks.filter((c) => c.status !== 'PASS')));
});

test('checkWorkforceEnv: PingID without a deployment fails (what an API-made environment looks like: PingID stays disabled)', async () => {
  const products = CONSOLE_MADE.map((p) => (p.type === 'PING_ONE_ID' ? { type: 'PING_ONE_ID', subtype: 'WORKFORCE' } : p));
  const r = await checkWorkforceEnv(envApi({ products }), { envId: 'e1' });
  assert.equal(r.exitCode, 1);
  assert.equal(status(r, 'PingID deployment'), 'FAIL');
  assert.match(r.checks.find((c) => c.name === 'PingID deployment').detail, /console/);
});

test('checkWorkforceEnv: no PingID, a non-Workforce PingID and PingOne MFA each fail', async () => {
  const noId = await checkWorkforceEnv(envApi({ products: CONSOLE_MADE.filter((p) => p.type !== 'PING_ONE_ID') }), { envId: 'e1' });
  assert.equal(status(noId, 'PingID'), 'FAIL');
  const cust = await checkWorkforceEnv(envApi({ products: CONSOLE_MADE.map((p) => (p.type === 'PING_ONE_ID' ? { ...p, subtype: 'CUSTOMER' } : p)) }), { envId: 'e1' });
  assert.equal(status(cust, 'PingID Workforce'), 'FAIL');
  const mfa = await checkWorkforceEnv(envApi({ products: [...CONSOLE_MADE, { type: 'PING_ONE_MFA' }] }), { envId: 'e1' });
  assert.equal(status(mfa, 'no PingOne MFA'), 'FAIL');
  assert.equal(mfa.exitCode, 1);
});

test('checkWorkforceEnv: missing Privilege fails by default and only warns with requirePrivilege false', async () => {
  const products = CONSOLE_MADE.filter((p) => p.type !== 'PING_ONE_PAM');
  assert.equal(status(await checkWorkforceEnv(envApi({ products }), { envId: 'e1' }), 'Privilege'), 'FAIL');
  const soft = await checkWorkforceEnv(envApi({ products }), { envId: 'e1', requirePrivilege: false });
  assert.equal(status(soft, 'Privilege'), 'WARN');
  assert.equal(soft.exitCode, 0);
});

test('checkWorkforceEnv: missing sign-on policies only warn; an unknown environment fails and stops', async () => {
  const r = await checkWorkforceEnv(envApi({ products: CONSOLE_MADE, policies: [] }), { envId: 'e1' });
  assert.equal(r.exitCode, 0);
  assert.equal(status(r, 'Multi_Factor sign-on policy'), 'WARN');
  assert.equal(status(r, 'Single_Factor sign-on policy'), 'WARN');
  const gone = await checkWorkforceEnv(envApi({ env: { status: 404, body: {} }, products: [] }), { envId: 'e1' });
  assert.equal(gone.exitCode, 2);   // could not read: a caller must not read this as "a basic environment"
  assert.equal(gone.checks.length, 1);
  assert.match(gone.checks[0].detail, /Environment Admin or Organization Admin/);
  const noBom = await checkWorkforceEnv(envApi({ products: { message: 'down' }, bomStatus: 503 }), { envId: 'e1' });
  assert.equal(noBom.exitCode, 2);
});

test('pingone-setup.sh: adopting a console-made environment skips the license lookup and creation, and never asks without a terminal', () => {
  const sh = fs.readFileSync(new URL('./pingone-setup.sh', import.meta.url), 'utf8');
  assert.match(sh, /--existing-env\) ADOPT_ENV="\$2"/);
  assert.match(sh, /--api-create\) API_CREATE=1/);
  assert.match(sh, /check-env --env "\$ADOPT_ENV"/);
  // the license lookup and the creation POST both sit inside the "no --existing-env" guard
  const guardOpen = sh.indexOf('if [[ -z "$ADOPT_ENV" ]]; then\n\n# ── 2. license');
  const guardClose = sh.indexOf('fi  # end of: no --existing-env');
  assert.ok(guardOpen > 0 && guardClose > guardOpen, 'guard present');
  const guarded = sh.slice(guardOpen, guardClose);
  assert.match(guarded, /organizations\/\$org_id\/licenses/);
  assert.match(guarded, /-X POST "\$api\/environments"/);
  assert.doesNotMatch(sh.slice(0, guardOpen) + sh.slice(guardClose), /organizations\/\$org_id\/licenses|-X POST "\$api\/environments"/);
  // the question is only asked with a terminal, no flag and no ASSUME_YES
  assert.match(sh, /-z "\$ADOPT_ENV" && "\$API_CREATE" != "1" && -z "\$configured_env" && "\$\{ASSUME_YES:-\}" != "1" && "\$\{STANDALONE_NON_INTERACTIVE:-\}" != "1" && "\$have_tty" == 1/);
  // the id is validated before it reaches a URL
  assert.match(sh, /\^\[0-9a-fA-F\]\{8\}\(-\[0-9a-fA-F\]\{4\}\)\{3\}-\[0-9a-fA-F\]\{12\}\$/);
});

// ---- review fixes (2026-11-24) ----
test('parseArgs: --no-privilege and --dry-run are booleans wherever they appear; other flags still take a value', () => {
  assert.equal(parseArgs(['check-env', '--env', 'e1', '--no-privilege'])['no-privilege'], true);
  const mid = parseArgs(['check-env', '--no-privilege', '--env', 'e1']);
  assert.equal(mid['no-privilege'], true);
  assert.equal(mid.env, 'e1');
  assert.equal(parseArgs(['privilege-prepare', '--dry-run', '--users', 'a,b']).dryRun, true);
  assert.equal(parseArgs(['x', '--env', 'e1'])['no-privilege'], undefined);
  assert.equal(parseArgs(['x', '--users']).users, '');
});

test('checkWorkforceEnv: a Multi_Factor policy on the second page is found (no false "missing")', async () => {
  const api = async (method, p) => {
    if (p === '/environments/e1') return { status: 200, body: { name: 'D', type: 'SANDBOX', region: 'NA' } };
    if (p === '/environments/e1/billOfMaterials') return { status: 200, body: { products: CONSOLE_MADE } };
    if (p === '/environments/e1/signOnPolicies') return { status: 200, body: { _embedded: { signOnPolicies: [{ name: 'Single_Factor' }] }, _links: { next: { href: 'https://api.pingone.com/v1/page2' } } } };
    if (p === 'https://api.pingone.com/v1/page2') return { status: 200, body: { _embedded: { signOnPolicies: [{ name: 'Multi_Factor' }] } } };
    return { status: 404, body: {} };
  };
  const r = await checkWorkforceEnv(api, { envId: 'e1' });
  assert.equal(status(r, 'Multi_Factor sign-on policy'), 'PASS');
  assert.equal(r.exitCode, 0);
});

test('checkWorkforceEnv: an unreadable sign-on policy list is a WARN naming the HTTP status, not a crash', async () => {
  const api = async (method, p) => {
    if (p === '/environments/e1') return { status: 200, body: { name: 'D', type: 'SANDBOX', region: 'NA' } };
    if (p === '/environments/e1/billOfMaterials') return { status: 200, body: { products: CONSOLE_MADE } };
    return { status: 403, body: { message: 'no' } };
  };
  const r = await checkWorkforceEnv(api, { envId: 'e1' });
  assert.equal(status(r, 'sign-on policies'), 'WARN');
  assert.equal(r.exitCode, 0);
});

test('checkWorkforceEnv: only a SANDBOX is accepted (the labs create apps and users there)', async () => {
  const r = await checkWorkforceEnv(envApi({ env: { status: 200, body: { name: 'Prod', type: 'PRODUCTION', region: 'NA' } }, products: CONSOLE_MADE }), { envId: 'e1' });
  assert.equal(r.exitCode, 1);
  assert.equal(status(r, 'environment type'), 'FAIL');
});

// ---- teardown runs for real against a stubbed curl: an environment with PingID or Privilege is never deleted by accident ----
function runTeardown({ bom, bomCode = 200, extra = [], shellEnv = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-'));
  const stub = path.join(dir, 'curl');
  fs.writeFileSync(stub, `#!/usr/bin/env python3
import sys, os, json
a = sys.argv[1:]; url = next((x for x in a if x.startswith("http")), ""); out = a[a.index("-o") + 1] if "-o" in a else None
method = a[a.index("-X") + 1] if "-X" in a else "GET"
def reply(body, code):
    if out: open(os.environ["STUB_OUTS"], "a").write(out + "\\n"); open(out, "w").write(body); print(code, end="")
    else: print(body, end="")
if url.endswith("/as/token"): reply('{"access_token":"tok"}', 200)
elif url.endswith("/billOfMaterials"): reply(os.environ["STUB_BOM"], os.environ["STUB_BOM_CODE"])
elif method == "DELETE": open(os.environ["STUB_LOG"], "a").write("DELETE " + url + "\\n"); reply("", 204)
else: reply('{"name":"Test Env"}', 200)
`, { mode: 0o755 });
  const log = path.join(dir, 'calls.log');
  const r = spawnSync('bash', [new URL('./pingone-teardown.sh', import.meta.url).pathname, '--env-id', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '--yes', '--keep-env-file', ...extra], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, STUB_BOM: JSON.stringify(bom), STUB_BOM_CODE: String(bomCode), STUB_LOG: log, STUB_OUTS: path.join(dir, 'outs.log'), STANDALONE_ENV: path.join(dir, 'none.env'), STANDALONE_CRED_FILE: path.join(dir, 'none.json'), PINGONE_REGION: 'com', PINGONE_ADMIN_ENV_ID: 'adm', PINGONE_ADMIN_CLIENT_ID: 'c', PINGONE_ADMIN_CLIENT_SECRET: 's', ...shellEnv },
  });
  const deleted = fs.existsSync(log) && /DELETE/.test(fs.readFileSync(log, 'utf8'));
  const outsFile = path.join(dir, 'outs.log');
  return { code: r.status, out: `${r.stdout}${r.stderr}`, deleted, outs: fs.existsSync(outsFile) ? fs.readFileSync(outsFile, 'utf8').split('\n').filter(Boolean) : [] };
}
const BASIC = { products: [{ type: 'PING_ONE_BASE' }, { type: 'PING_ONE_DAVINCI' }, { type: 'PING_ONE_AUTHORIZE' }] };

test('teardown refuses an environment with a PingID deployment or Privilege, even with --yes, and deletes nothing', () => {
  for (const products of [CONSOLE_MADE, [{ type: 'PING_ONE_BASE' }, { type: 'PING_ONE_PAM', tags: ['AUTHENTICATION_MODE_AGENT'] }], [{ type: 'PING_ONE_ID', subtype: 'WORKFORCE', deployment: { id: 'd' } }]]) {
    const r = runTeardown({ bom: { products } });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /Not deleting it/);
    assert.equal(r.deleted, false);
  }
});

test('teardown: --delete-privilege-env lifts the refusal; a basic environment (PingID listed without a deployment) is still deletable', () => {
  const forced = runTeardown({ bom: { products: CONSOLE_MADE }, extra: ['--delete-privilege-env'] });
  assert.equal(forced.code, 0);
  assert.equal(forced.deleted, true);
  const basic = runTeardown({ bom: BASIC });
  assert.equal(basic.code, 0, basic.out);
  assert.equal(basic.deleted, true);
  const idNoDeployment = runTeardown({ bom: { products: [...BASIC.products, { type: 'PING_ONE_ID', subtype: 'WORKFORCE' }] } });
  assert.equal(idNoDeployment.deleted, true);
  const nullDeployment = runTeardown({ bom: { products: [...BASIC.products, { type: 'PING_ONE_ID', subtype: 'WORKFORCE', deployment: null }] } });
  assert.equal(nullDeployment.deleted, true, nullDeployment.out);   // 'deployment: null' is a basic environment, same as the JS check
});

test('teardown: ALLOW_PRIVILEGE_ENV exported in the caller\'s shell does not lift the refusal; only the flag does', () => {
  const r = runTeardown({ bom: { products: CONSOLE_MADE }, shellEnv: { ALLOW_PRIVILEGE_ENV: '1' } });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /Not deleting it/);
  assert.equal(r.deleted, false);
});

test('teardown fails closed: an unreadable bill of materials is refused', () => {
  const r = runTeardown({ bom: { message: 'no' }, bomCode: 403 });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /Not deleting without knowing/);
  assert.equal(r.deleted, false);
  const dry = runTeardown({ bom: { products: CONSOLE_MADE }, extra: ['--dry-run'] });
  assert.notEqual(dry.code, 0);   // the refusal comes before the dry-run exit, so a rehearsal tells the truth
});

test('pingone-setup.sh: conflicts are checked before and after the question; a configured machine is not asked; bootstrap --non-interactive never reaches the question', () => {
  const sh = fs.readFileSync(new URL('./pingone-setup.sh', import.meta.url), 'utf8');
  assert.match(sh, /check_adopt_conflict\(\) \{\n\s+if \[\[ -n "\$ADOPT_ENV" && \( "\$API_CREATE" == "1" \|\| "\$WITH_MFA" == "1" \) \]\]; then\n\s+fatal/);
  assert.equal(sh.split('\ncheck_adopt_conflict\n').length - 1, 1, 'called straight after argument parsing');
  assert.match(sh, /ADOPT_ENV="\$\(printf '%s' "\$ADOPT_ENV" \| tr -d '\[:space:\]'\)"\n\s+check_adopt_conflict/);
  assert.ok(sh.indexOf('\ncheck_adopt_conflict\n') < sh.indexOf('Standalone labs — PingOne environment setup'), 'before any prompt or network call');
  assert.match(sh, /: <\/dev\/tty; \} 2>\/dev\/null && have_tty=1/);
  const boot = fs.readFileSync(new URL('./bootstrap.sh', import.meta.url), 'utf8');
  assert.match(boot, /\[ "\$non_interactive" = 1 \] && export STANDALONE_NON_INTERACTIVE=1\n(?:\s+#.*\n)+\s+if "\$root\/scripts\/pingone-setup\.sh"/);
  assert.match(boot, /# shellcheck disable=SC2086\n\s+if "\$root\/scripts\/pingone-setup\.sh"/);   // the directive stays directly above the unquoted ${PINGONE_ARGS}
});

test('pingone-setup.sh: a flagless run on a machine whose configured environment has PingID + Privilege stops instead of replacing it', () => {
  const sh = fs.readFileSync(new URL('./pingone-setup.sh', import.meta.url), 'utf8');
  const stop = sh.indexOf('would replace it with a basic one');
  assert.ok(stop > 0, 'refusal present');
  assert.ok(stop < sh.indexOf('# ── 2. license'), 'before the license lookup and any creation');
  assert.match(sh, /-z "\$ADOPT_ENV" && "\$API_CREATE" != "1" && -n "\$configured_env" \]\]; then/);   // no terminal needed
});

// ---- setup runs for real against a stubbed curl and node: which worker roles may adopt, and which may create ----
function runSetup({ roles, args, configured = '', checkExit = 1 }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'su-'));
  fs.writeFileSync(path.join(dir, 'curl'), `#!/usr/bin/env python3
import sys, os, json
url = next((x for x in sys.argv[1:] if x.startswith("http")), "")
names = json.loads(os.environ["STUB_ROLES"])
if url.endswith("/as/token"): print('{"access_token":"tok"}', end="")
elif url.endswith("/roleAssignments"): print(json.dumps({"_embedded": {"roleAssignments": [{"role": {"id": "r%d" % i}, "scope": {"type": "ORGANIZATION"}} for i in range(len(names))]}}), end="")
elif "/roles/r" in url: print(json.dumps({"name": names[int(url.rsplit("/r", 1)[1])]}), end="")
else: print("{}", end="")
`, { mode: 0o755 });
  // node stands in for pingone-admin.mjs check-env: it records the call and fails, so the run stops right after the gate
  fs.writeFileSync(path.join(dir, 'node'), `#!/bin/sh\necho "node $*" >> "$STUB_LOG"\nexit ${checkExit}\n`, { mode: 0o755 });
  if (configured) fs.writeFileSync(path.join(dir, 'configured.env'), `PINGONE_ENVIRONMENT_ID=${configured}\n`);
  const log = path.join(dir, 'calls.log');
  const r = spawnSync('bash', [new URL('./pingone-setup.sh', import.meta.url).pathname, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, STUB_ROLES: JSON.stringify(roles), STUB_LOG: log, STANDALONE_ENV: path.join(dir, configured ? 'configured.env' : 'none.env'), STANDALONE_CRED_FILE: path.join(dir, 'none.cred'), ASSUME_YES: '1', PINGONE_REGION: 'com', PINGONE_ADMIN_ENV_ID: 'adm', PINGONE_WORKER_CLIENT_ID: 'c', PINGONE_WORKER_CLIENT_SECRET: 's' },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, checked: fs.existsSync(log) && /check-env/.test(fs.readFileSync(log, 'utf8')) };
}
const ENV_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('setup: Environment Admin (organization scope) is enough to adopt a console-made environment', () => {
  const r = runSetup({ roles: ['Environment Admin', 'Custom Roles Admin'], args: ['--existing-env', ENV_ID] });
  assert.match(r.out, /holds Environment Admin, not Organization Admin/);
  assert.match(r.out, /Checking the environment you made in the console/);
  assert.equal(r.checked, true, 'went on to check-env');
  assert.doesNotMatch(r.out, /Organization Admin is required/);
});

test('setup: Environment Admin alone stops a run that would CREATE an environment, before any license lookup', () => {
  const r = runSetup({ roles: ['Environment Admin'], args: ['--api-create'] });
  assert.equal(r.code, 1);
  assert.match(r.out, /would create an environment, which needs Organization Admin/);
  assert.match(r.out, /--existing-env/);
  assert.doesNotMatch(r.out, /Looking for an active license/);
});

test('setup: Organization Admin passes as before; a worker with neither role is refused and every role found is listed', () => {
  const org = runSetup({ roles: ['Organization Admin'], args: ['--existing-env', ENV_ID] });
  assert.match(org.out, /worker has Organization Admin/);
  assert.equal(org.checked, true);
  const none = runSetup({ roles: ['Custom Roles Admin', 'DaVinci Admin'], args: ['--existing-env', ENV_ID] });
  assert.equal(none.code, 1);
  assert.match(none.out, /"Custom Roles Admin, DaVinci Admin": Organization Admin is required/);
  assert.equal(none.checked, false);
});

test('setup, no flags, an environment already configured: PingID + Privilege stops the run; "could not read" stops it too; a basic environment carries on', () => {
  const args = [];
  const yes = runSetup({ roles: ['Organization Admin'], args, configured: ENV_ID, checkExit: 0 });
  assert.equal(yes.code, 1);
  assert.match(yes.out, /would replace it with a basic one/);
  const unknown = runSetup({ roles: ['Organization Admin'], args, configured: ENV_ID, checkExit: 2 });   // a 503 or a network error in check-env
  assert.equal(unknown.code, 1);
  assert.match(unknown.out, /could not read the configured environment/);
  assert.doesNotMatch(unknown.out, /Looking for an active license/);
  const basic = runSetup({ roles: ['Organization Admin'], args, configured: ENV_ID, checkExit: 1 });   // read fine, no PingID: the old behaviour
  assert.match(basic.out, /Looking for an active license/);
  assert.doesNotMatch(basic.out, /would replace it|could not read the configured/);
});

test('setup: an Environment-Admin-only worker runs ensure-worker-roles with --strict; an Organization Admin worker does not', () => {
  const sh = fs.readFileSync(new URL('./pingone-setup.sh', import.meta.url), 'utf8');
  assert.match(sh, /if \[\[ "\$needs_org_admin" == 1 \]\]; then strict_flag="--strict"; fi/);
  assert.match(sh, /ensure-worker-roles --env "\$new_env" --app "\$app_id" \$strict_flag/);
});

// ---- review of 52b4ff5 + the two open items (2026-11-24): a whole adopt run against a stubbed curl and node ----
// curl is an in-memory PingOne for the routes the script uses; node stands in for pingone-admin.mjs (check-env prints
// STUB_CHECK_OUT and exits STUB_CHECK_RC; every other command succeeds). Nothing here touches a real environment.
function runAdopt({ assign = 'ok', checkOut = '  PASS  Privilege — AUTHENTICATION_MODE_AGENTLESS', checkRc = 0, userExists = false, settings = '', args = ['--existing-env', ENV_ID], noNode = false, extraEnv = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-'));
  fs.writeFileSync(path.join(dir, 'curl'), `#!/usr/bin/env python3
import sys, os, json
a = sys.argv[1:]
url = next((x for x in a if x.startswith("http")), "")
method = a[a.index("-X") + 1] if "-X" in a else "GET"
data = a[a.index("-d") + 1] if "-d" in a else ""
open(os.environ["STUB_LOG"], "a").write(method + " " + url + "\\n")
mode = os.environ["STUB_ASSIGN"]
posts_file = os.environ["STUB_LOG"] + ".posts"
def posts(): return int(open(posts_file).read()) if os.path.exists(posts_file) else 0
def out(o): print(json.dumps(o), end="")
if url.endswith("/as/token"): out({"access_token": "tok"})
elif "/applications/c/roleAssignments" in url: out({"_embedded": {"roleAssignments": [{"role": {"id": "r0"}, "scope": {"type": "ORGANIZATION"}}]}})
elif "/roles/r0" in url: out({"name": "Organization Admin"})
elif "/roles?filter" in url: out({"_embedded": {"roles": [{"id": "r-ida", "name": "Identity Data Admin"}]}})
elif url.endswith("/applications/wk1/roleAssignments"):
    if method == "POST":
        n = posts() + 1; open(posts_file, "w").write(str(n))
        if mode == "denied": out({"code": "ACCESS_FAILED"})
        elif mode == "always-invalid" or (mode in ("race", "race-listed") and n == 1): out({"code": "INVALID_DATA"})
        else: out({"id": "ra1"})
    else:
        out({"_embedded": {"roleAssignments": [{"role": {"id": "r-ida"}}] if mode == "race-listed" and posts() >= 1 else []}})
elif "/applications?filter" in url: out({"_embedded": {"applications": [{"id": "ua-old"}] if "User" in url and os.environ.get("STUB_USER_EXISTS") else []}})
elif method == "POST" and url.endswith("/applications"):
    if "Labs Worker" in data: out({"id": "wk1"})
    elif os.environ.get("STUB_USER_EXISTS"): out({"code": "UNIQUENESS_VIOLATION"})
    else: out({"id": "ua1"})
elif method == "POST" and url.endswith("/secret"): out({"secret": "user-secret" if "/ua1/" in url else "worker-secret" if "/wk1/" in url else ""})
else: print("{}", end="")
`, { mode: 0o755 });
  if (!noNode) fs.writeFileSync(path.join(dir, 'node'), `#!/bin/sh\necho "node $*" >> "$STUB_LOG"\nif [ "$2" = check-env ]; then printf '%s\\n' "$STUB_CHECK_OUT"; exit "$STUB_CHECK_RC"; fi\nexit 0\n`, { mode: 0o755 });
  const envFile = path.join(dir, 'settings.env');
  if (settings) fs.writeFileSync(envFile, settings);
  const log = path.join(dir, 'calls.log');
  const r = spawnSync('bash', [new URL('./pingone-setup.sh', import.meta.url).pathname, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: noNode ? `${dir}:/usr/bin:/bin` : `${dir}:${process.env.PATH}`, STUB_ROLES: '[]', STUB_LOG: log, STUB_ASSIGN: assign, STUB_CHECK_OUT: checkOut, STUB_CHECK_RC: String(checkRc), ...(userExists ? { STUB_USER_EXISTS: '1' } : {}), STANDALONE_ENV: envFile, STANDALONE_CRED_FILE: path.join(dir, 'cred.txt'), STANDALONE_ROLE_RETRY_SECONDS: '0', ASSUME_YES: '1', PINGONE_REGION: 'com', PINGONE_ADMIN_ENV_ID: 'adm', PINGONE_WORKER_CLIENT_ID: 'c', PINGONE_WORKER_CLIENT_SECRET: 's', ...extraEnv },
  });
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
  return { code: r.status, out: `${r.stdout}${r.stderr}`, calls, assignPosts: (calls.match(/^POST \S+\/applications\/wk1\/roleAssignments$/gm) || []).length, settings: fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '' };
}

test('adopt: a 400 INVALID_DATA on the role assignment right after creating the app is retried once, and the run goes on', () => {
  const r = runAdopt({ assign: 'race' });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.assignPosts, 2);
  assert.match(r.calls, /GET \S+\/applications\/wk1\/roleAssignments$/m, 'the app\'s roles are listed again before the retry');
  assert.match(r.settings, /^PINGONE_WORKER_CLIENT_ID=wk1$/m);
});

test('adopt: if the role shows up when the roles are listed again, it is a success and is not assigned a second time', () => {
  const r = runAdopt({ assign: 'race-listed' });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.assignPosts, 1);
});

test('adopt: the role assignment is retried once and no more; any other error is not retried', () => {
  const twice = runAdopt({ assign: 'always-invalid' });
  assert.equal(twice.code, 1);
  assert.equal(twice.assignPosts, 2);
  assert.match(twice.out, /role assignment failed/);
  assert.equal(twice.settings, '', 'no secret written');
  const denied = runAdopt({ assign: 'denied' });
  assert.equal(denied.code, 1);
  assert.equal(denied.assignPosts, 1);
  assert.match(denied.out, /not allowed to assign roles/);
});

test('adopt: the closing steps mention flipping Privilege to agent mode only when check-env saw it is not in agent mode already', () => {
  const agent = runAdopt({ checkOut: '  PASS  Privilege — AUTHENTICATION_MODE_AGENT' });
  assert.equal(agent.code, 0, agent.out);
  assert.match(agent.out, /privilege-prepare --create-admin/);
  assert.doesNotMatch(agent.out, /set-privilege-mode/);
  assert.match(agent.out, /already in agent mode/);
  // AUTHENTICATION_MODE_AGENTLESS starts with AUTHENTICATION_MODE_AGENT: it must not be mistaken for agent mode
  for (const checkOut of ['  PASS  Privilege — AUTHENTICATION_MODE_AGENTLESS', '  PASS  Privilege — no mode tag']) {
    const less = runAdopt({ checkOut });
    assert.equal(less.code, 0, less.out);
    assert.match(less.out, /set-privilege-mode --env \S+ --mode agent/);
    assert.doesNotMatch(less.out, /already in agent mode/);
  }
});

test('adopt: check-env exit 2 (could not read) points at the id, region and worker role, not at --api-create; exit 1 keeps the console advice', () => {
  const unreadable = runAdopt({ checkRc: 2, checkOut: '  FAIL  environment — HTTP 404' });
  assert.equal(unreadable.code, 1);
  assert.match(unreadable.out, /could not read that environment/);
  assert.doesNotMatch(unreadable.out, /--api-create/);
  const notReady = runAdopt({ checkRc: 1, checkOut: '  FAIL  PingID' });
  assert.equal(notReady.code, 1);
  assert.match(notReady.out, /not ready for PingID \+ Privilege/);
  assert.match(notReady.out, /--api-create/);
});

test('adopt into another environment: the user app of the previous environment is not left in the settings file', () => {
  const other = 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee';
  const old = `PINGONE_ENVIRONMENT_ID=${other}\nPINGONE_USER_CLIENT_ID=app-in-old-env\nPINGONE_USER_CLIENT_SECRET=old-secret\nPINGONE_USER_REDIRECT_URI=https://x/cb\nPINGONE_USER_TOKEN_ENDPOINT_AUTH_METHOD=client_secret_post\nAI_GATEWAY_KEY=keep-me\n`;
  const r = runAdopt({ userExists: true, settings: old });
  assert.equal(r.code, 0, r.out);
  assert.match(r.settings, new RegExp(`^PINGONE_ENVIRONMENT_ID=${ENV_ID}$`, 'm'));
  assert.doesNotMatch(r.settings, /app-in-old-env|old-secret/);
  assert.match(r.settings, /^AI_GATEWAY_KEY=keep-me$/m, 'unrelated keys survive');
  assert.match(r.out, /PINGONE_USER_CLIENT_ID/);
});

test('adopt into the same environment again: the user app secret from the earlier run survives (it cannot be minted again)', () => {
  const old = `PINGONE_ENVIRONMENT_ID=${ENV_ID}\nPINGONE_USER_CLIENT_ID=ua-old\nPINGONE_USER_CLIENT_SECRET=kept-secret\n`;
  const r = runAdopt({ userExists: true, settings: old });
  assert.equal(r.code, 0, r.out);
  assert.match(r.settings, /^PINGONE_USER_CLIENT_ID=ua-old$/m);
  assert.match(r.settings, /^PINGONE_USER_CLIENT_SECRET=kept-secret$/m);
});

test('setup, no flags: a configured environment id that cannot be checked (not an id, or no node) stops the run instead of creating a basic environment', () => {
  const garbled = runAdopt({ args: [], settings: 'PINGONE_ENVIRONMENT_ID="not-an-id"\n' });
  assert.equal(garbled.code, 1);
  assert.match(garbled.out, /will not risk replacing it/);
  assert.doesNotMatch(garbled.out, /Looking for an active license/);
  const bare = spawnSync('/bin/sh', ['-c', 'PATH=/usr/bin:/bin command -v node']).status !== 0;
  if (bare) {
    const noNode = runAdopt({ args: [], noNode: true, settings: `PINGONE_ENVIRONMENT_ID=${ENV_ID}\n` });
    assert.equal(noNode.code, 1);
    assert.match(noNode.out, /will not risk replacing it/);
    assert.doesNotMatch(noNode.out, /Looking for an active license/);
  }
  // --api-create is the way out, and it still reaches the license lookup
  const out = runAdopt({ args: ['--api-create'], settings: 'PINGONE_ENVIRONMENT_ID="not-an-id"\n' });
  assert.match(out.out, /Looking for an active license/);
});

test('teardown fails closed on a 200 whose body has no product list; and its scratch files are not predictable /tmp names', () => {
  for (const bom of [{ _links: {} }, { products: 'x' }, {}]) {
    const r = runTeardown({ bom });
    assert.notEqual(r.code, 0, JSON.stringify(bom));
    assert.match(r.out, /Not deleting without knowing/);
    assert.equal(r.deleted, false);
  }
  const ok = runTeardown({ bom: BASIC });
  assert.equal(ok.deleted, true);
  assert.ok(ok.outs.length >= 3);
  for (const f of ok.outs) assert.doesNotMatch(f, /\/p1-(lookup|teardown)-\d+$/, f);
});
