# trace: W3C Trace Context helpers (Rule 14)

`parseTraceparent` / `formatTraceparent` / `newTrace` — one trace id per evaluation, a new span id per hop; a
valid incoming header continues the trace. Server-side only (node:crypto). Token-redaction tracing stays
lab-specific; only the traceparent half is shared. Vendor to `server/src/trace.js`.
