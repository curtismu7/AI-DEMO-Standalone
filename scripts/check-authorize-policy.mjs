#!/usr/bin/env node
// Is the AI Demo P1AZ policy snapshot imported in the PingOne tenant? Read-only: it sends ONE decision request that
// the imported policy denies with a known statement code. A tenant without the snapshot answers PERMIT or a different code.
// Exit 0 imported, 1 not imported, 2 cannot check (no live settings, network or HTTP error). Never prints a secret.
//
// Settings: ~/.config/demo-kit/pingone.json (environmentId, region, clientId, clientSecret, endpointId), or the same
// values from PINGONE_ENVIRONMENT_ID, PINGONE_REGION, PINGONE_WORKER_CLIENT_ID, PINGONE_WORKER_CLIENT_SECRET and
// PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID. DEMO_KIT_CONFIG_DIR moves the shared folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The authored audience rule and the statement code the snapshot gives its DENY. The probe names no real host: an audience
// that no policy accepts. A tenant without the snapshot does not answer with this code.
export const PROBE_CODE = 'mcp-invalid-audience';
export const probeParameters = () => ({
  DecisionContext: 'McpToolCall', McpMethod: 'tools/call', Amount: 0, TransactionAmount: '0',
  ToolName: 'sensitive_patient_records', ClientId: 'probe-subject', UserId: 'probe-subject', Vertical: 'healthcare',
  TokenScopes: 'gateway:mcp:invoke', ActChainDepth: '0',
  TokenAudience: 'https://probe.invalid/mcp', McpResourceUri: 'https://probe.invalid/mcp',
});

export function loadSettings(env = process.env) {
  const dir = env.DEMO_KIT_CONFIG_DIR || path.join(os.homedir(), '.config', 'demo-kit');
  let file = {};
  try { file = JSON.parse(fs.readFileSync(path.join(dir, 'pingone.json'), 'utf8')); } catch { /* none yet */ }
  return {
    environmentId: env.PINGONE_ENVIRONMENT_ID || file.environmentId || '',
    region: env.PINGONE_REGION || file.region || 'com',
    clientId: env.PINGONE_WORKER_CLIENT_ID || file.clientId || '',
    clientSecret: env.PINGONE_WORKER_CLIENT_SECRET || file.clientSecret || '',
    endpointId: env.PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID || file.endpointId || '',
  };
}

// Pure: turns a decision response into a verdict, so it can be tested without a network.
export function verdict(status, body) {
  if (status !== 200) return { code: 2, text: `cannot check: the decision endpoint answered HTTP ${status}` };
  const codes = (body?.statements || []).map((s) => s.code);
  if (body?.decision === 'DENY' && codes.includes(PROBE_CODE)) return { code: 0, text: 'imported: the policy denies the probe with its authored code' };
  return { code: 1, text: `NOT imported: the probe got ${body?.decision || 'no decision'}${codes.length ? ` (${codes.join(', ')})` : ''}, expected DENY ${PROBE_CODE}` };
}

export async function check(s, fetchImpl = fetch) {
  if (!s.environmentId || !s.clientId || !s.clientSecret) return { code: 2, text: 'cannot check: no live PingOne worker settings (mock mode needs no snapshot)' };
  const api = `https://api.pingone.${s.region}/v1/environments/${s.environmentId}`;
  try {
    const tokenRes = await fetchImpl(`https://auth.pingone.${s.region}/${s.environmentId}/as/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${s.clientId}:${s.clientSecret}`).toString('base64')}` },
      body: 'grant_type=client_credentials',
    });
    if (tokenRes.status !== 200) return { code: 2, text: `cannot check: the worker token request answered HTTP ${tokenRes.status}` };
    const { access_token: token } = await tokenRes.json();
    const auth = { Authorization: `Bearer ${token}` };
    let endpointId = s.endpointId;
    if (!endpointId) {
      const list = await fetchImpl(`${api}/decisionEndpoints`, { headers: auth });
      const items = list.status === 200 ? ((await list.json())._embedded?.decisionEndpoints || []) : [];
      if (items.length !== 1) return { code: 2, text: `cannot check: set endpointId (found ${items.length} decision endpoints)` };
      endpointId = items[0].id;
    }
    const res = await fetchImpl(`${api}/decisionEndpoints/${encodeURIComponent(endpointId)}`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ parameters: probeParameters() }),
    });
    return verdict(res.status, await res.json().catch(() => ({})));
  } catch (error) {
    return { code: 2, text: `cannot check: ${error.cause?.code || error.name}` };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await check(loadSettings());
  console.log(result.text);
  process.exit(result.code);
}
