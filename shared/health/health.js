// GET /api/health, contract demo-health/1 (see the demo shelf's docs/health-contract.md). Public, GET only, no
// extra fields. The state comes from the lab's doctor checks, refreshed in the background every 60 s; a request
// never runs them. Family shared service (owner, 2026-11-13): vendor it, never edit a lab's copy.
import express from 'express';

export function createHealth({ demoId, demoName, version, runChecks, allPassed, mockOnly, now = () => new Date(), intervalMs = 60_000, env = process.env } = {}) {
  let last = { state: 'unknown', at: null };
  function refresh() {
    try { last = { state: allPassed(runChecks()) ? 'ready' : 'broken', at: now().toISOString() }; }
    catch { last = { state: 'unknown', at: now().toISOString() }; }
  }
  refresh();
  const timer = setInterval(refresh, intervalMs);
  timer.unref();

  const router = express.Router();
  router.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ schema: 'demo-health/1', at: last.at || now().toISOString(), state: last.state, runtime: 'offline', demo: { id: demoId, name: demoName, version }, ...(mockOnly?.(env) ? { mode: 'mock-only' } : {}) });
  });
  router.all('/', (_req, res) => res.set('Allow', 'GET').status(405).json({ error: 'method_not_allowed' }));
  return { router, refresh, stop: () => clearInterval(timer) };
}
