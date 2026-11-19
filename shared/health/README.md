# health: GET /api/health, contract demo-health/1

`createHealth({ demoId, demoName, version, runChecks, allPassed, mockOnly, ... })` → `{ router, refresh, stop }`.
Background-refreshes the lab's doctor checks every 60 s; a request never runs them. Mount at `/api/health`.
Vendor to `server/src/health.js` and pass the lab's `runChecks`/`allPassed` from `shared/doctor`.
