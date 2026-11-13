# doctor: preflight check contract

`runChecks` results contract: array of `{ id, level: 'pass'|'info'|'fail', detail }`. Helpers: `allPassed`,
`nodeCheck(minMajor)`, `summarize`, `printChecks`. The lab owns its own checks array (bind policy, payload
scans, etc.) and passes them to `shared/health`'s `createHealth`. Vendor to `server/src/doctor.js`.
