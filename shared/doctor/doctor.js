// Doctor: preflight checks shared by `npm run doctor` and GET /api/health. Synchronous, no network, never prints a
// secret. Each check: { id, level: 'pass' | 'info' | 'fail', detail }. The lab passes its own checks array;
// this module owns the contract and the aggregation. Family shared service (owner, 2026-11-13): vendor it,
// never edit a lab's copy.

export const allPassed = (checks) => (Array.isArray(checks) ? checks : []).every((c) => c?.level !== 'fail');

// Node version check every lab needs. minMajor defaults to 20.
export const nodeCheck = (minMajor = 20) => {
  const major = Number(process.versions.node.split('.')[0]);
  return { id: 'node', level: major >= minMajor ? 'pass' : 'fail', detail: `v${process.versions.node} (need >= ${minMajor})` };
};

export function summarize(checks) {
  const failed = (checks || []).filter((c) => c.level === 'fail');
  return { passed: allPassed(checks), failedCount: failed.length, checks: checks || [] };
}

export function printChecks(checks, log = console.log) {
  for (const c of checks || []) log(`[${c.level}] ${c.id}: ${c.detail}`);
  return summarize(checks).passed;
}
