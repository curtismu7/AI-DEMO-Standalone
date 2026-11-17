#!/usr/bin/env node
// Rule 26, step 3, as one command: check every RUNNING standalone lab's mode did not regress.
//
//   node scripts/check-mode-drift.mjs [--json]
//
// For each running Docker compose project that looks like a lab (container name or compose working dir
// ends in -LAB or -lab), it asks the app for its mode (GET /api/info, falling back to /api/mode for
// apps that only report there) and prints one line per app:
//
//   real   token-workbench-lab        (source: real, realAvailable: true)
//   mock   ai-gateway-client-lab      (source: mock, realAvailable: true)   <- check this one
//
// An app in mock while realAvailable is true is DRIFT (rule 26): real was configured but the app is
// not using it — exactly the silent loss this rule exists for. Exit 1 when drift is found, so a
// post-rebuild sweep or a scheduled job fails loudly. --json prints the raw records instead.
//
// Labs with no mode endpoint at all (e.g. pure static or proxy containers) are reported as "none"
// and never count as drift. Ports come from the container's published ports; nothing else is probed.
import { execFileSync } from 'node:child_process';

const json = process.argv.includes('--json');

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' });

// Every running container with a compose working dir, one record each (deduped per project).
function runningLabs() {
  const out = sh('docker', ['ps', '--format', '{{.Names}}\t{{.Ports}}\t{{.Label "com.docker.compose.project.working_dir"}}']);
  const labs = new Map();
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const [name, ports, wd] = line.split('\t');
    const dir = (wd || '').trim();
    const project = dir.split('/').filter(Boolean).pop() || name;
    if (!/-lab$/i.test(project)) continue;
    const hostPorts = [...String(ports).matchAll(/127\.0\.0\.1:(\d+)->/g)].map(m => Number(m[1]));
    if (!labs.has(project)) labs.set(project, { project, dir, names: [], ports: [] });
    const rec = labs.get(project);
    rec.names.push(name);
    rec.ports.push(...hostPorts);
  }
  return [...labs.values()];
}

// The mode body an app serves. /api/info is the rule-19 shape ({source, realAvailable}); /api/mode
// (GET) is the fallback some labs use. null when neither answers or neither is a mode body.
async function modeOf(port) {
  for (const path of ['/api/info', '/api/mode']) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(2000) });
      if (!r.ok) continue;
      const b = await r.json();
      if (typeof b?.source === 'string') return b;
    } catch { /* next candidate / give up */ }
  }
  return null;
}

const labs = runningLabs();
const records = [];
for (const lab of labs) {
  // One probe per lab: the lowest published port that answers with a mode body.
  let body = null, port = null;
  for (const p of [...new Set(lab.ports)].sort((a, b) => a - b)) {
    body = await modeOf(p);
    if (body) { port = p; break; }
  }
  const source = body?.source ?? null;
  const realAvailable = body?.realAvailable === true || body?.real?.available === true;
  records.push({
    project: lab.project,
    dir: lab.dir,
    containers: lab.names,
    port,
    source, // 'mock' | 'real' | 'live' | null (no mode endpoint)
    realAvailable,
    drift: source === 'mock' && realAvailable, // rule 26: real configured but not in use
  });
}

if (json) {
  console.log(JSON.stringify(records, null, 2));
} else {
  for (const r of records) {
    const state = r.source ? r.source : 'none';
    const mark = r.drift ? '  <- DRIFT: real is configured but not in use (rule 26)' : '';
    const detail = r.source ? ` (source: ${r.source}${r.realAvailable ? ', realAvailable: true' : ''})` : ' (no mode endpoint)';
    console.log(`${state.padEnd(5)} ${r.project}${detail}${mark}`);
  }
  const drifted = records.filter(r => r.drift);
  if (drifted.length) {
    console.error(`\n${drifted.length} lab(s) in drift: configured for Real but serving Mock. Fix before demoing (rule 26).`);
    process.exit(1);
  }
}
