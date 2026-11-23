import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ensureWorkerRoles, grantAdminRoles, listAll, makeApi, preparePrivilege } from './lib/pingone-admin.mjs';

const ENV = 'env-new', OTHER = 'env-other', ADMIN = 'env-admin', WORKER = 'app-worker';
const ROLES = [['r-ida', 'Identity Data Admin'], ['r-env', 'Environment Admin'], ['r-org', 'Organization Admin'], ['r-pa', 'PingOne Privilege Administrator']];

// A small in-memory PingOne: only the routes the library touches.
function fakePingOne(opts = {}) {
  let n = 100;
  const id = (p) => `${p}-${++n}`;
  const st = {
    calls: [],
    workerAssignments: opts.workerAssignments || [],
    adminUsers: opts.adminUsers ?? [{ id: 'u-curtis', username: 'curtis@example.com', email: 'curtis@example.com' }],
    userRoles: [],
    apps: opts.apps ?? [{ id: 'app-priv', name: 'PingOne Privilege', accessControl: { group: { type: 'ANY_GROUP', groups: [{ id: 'g-other' }] } }, enabled: true, createdAt: 'x', _links: {} }],
    groups: opts.groups ?? [], policies: opts.policies ?? [], actions: {}, users: opts.users ?? [{ id: 'u-demo', username: 'demouser' }], members: {},
    failDelete: opts.failDelete || false, failAddRole: opts.failAddRole || false,
  };
  const embed = (key, arr) => ({ status: 200, body: { _embedded: { [key]: arr } } });
  const api = async (method, p, body) => {
    st.calls.push([method, p, body]);
    let m;
    if (p === '/roles') return embed('roles', ROLES.map(([i, name]) => ({ id: i, name })));
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
    if ((m = p.match(new RegExp(`^/environments/${ADMIN}/users/([^/]+)/roleAssignments$`)))) {
      if (method === 'GET') return embed('roleAssignments', st.userRoles.filter((r) => r.user === m[1]));
      const a = { id: id('ura'), user: m[1], role: { id: body.role.id }, scope: body.scope }; st.userRoles.push(a); return { status: 201, body: a };
    }
    if (p === `/environments/${ENV}/applications`) return embed('applications', st.apps);
    if (p.startsWith(`/environments/${ENV}/applications/app-priv`)) {
      const app = st.apps.find((a) => a.id === 'app-priv');
      if (method === 'GET') return { status: 200, body: app };
      if (method === 'PUT') { Object.assign(app, body); return { status: 200, body: app }; }
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
    if (p.startsWith(`/environments/${ENV}/users?filter=`)) { const login = decodeURIComponent(p).match(/username eq "([^"]*)"/)[1]; return embed('users', st.users.filter((u) => u.username === login)); }
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
