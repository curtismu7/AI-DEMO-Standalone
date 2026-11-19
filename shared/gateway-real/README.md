# gateway-real: the shared real Privilege-gateway hop for standalone labs

One dependency-free MCP-over-HTTP client plus settings loader that every standalone lab
uses for its Real mode: an agent access key from the one shared settings file
(`~/Development/.env`, or `STANDALONE_ENV`) calling a live Privilege MCP door
(`https://<gateway>/<app>/mcp`). Pattern proven live by mcp-tools-LAB,
aggregate-entitlement-LAB and privilege-logging-LAB (2026-11).

## Settings keys (per lab, read from the shared file only)

- `<PREFIX>_GW_URL` — the gateway origin (https, or http on loopback only)
- `<PREFIX>_GW_APPS` — comma-separated door names; the door is `<origin>/<app>/mcp`
- `<PREFIX>_GW_KEY_<NAME>` — one agent access key per caller (write-only; never logged/echoed)
- `<PREFIX>_GW_VERSION` — optional operator label

## Files

- `gatewayClient.js` — `createHttpClient` (Streamable HTTP, initialize handshake, session retry),
  `doorConfig(text, prefix)` returning `{ ok, origin, apps, callers, version } | { ok:false, problem }`, and
  `createRealDoor({ config, client, clientInfo, capture })` returning `{ origin, apps, callers, version, list(app, caller),
  call(app, caller, tool, args) }` with key scrubbing. `createRealDoor` returns `null` when the config is not ok.
- Wire capture (additive, off by default): `createRealDoor({ config, capture: true })` adds a `wire` array to every
  `list` / `call` result, one entry per HTTP exchange (`initialize`, `notifications/initialized`, the call, the session close):
  `{ http, url, rpcMethod, request: { headers, body }, response: { status, headers, body } | null, error?, at, ms }`.
  Redacted at capture: the auth header shows only its length, the session id is shortened, response headers are an
  allowlist, and every configured key is scrubbed from every string (leaf strings, longest key first), then a body over 256 KB becomes a note.
  `createHttpClient` takes the same thing as `onWire`: its records are NOT scrubbed of the key a gateway echoes back (only `createRealDoor` knows
  the keys), so a lab that uses `createHttpClient` directly must scrub them itself (`scrubDeep(records, keys)`). `wire` carries full tool
  schemas and tool output, more than the capped `tools` / `text` fields.
  `../gateway-trace/` turns it into the "What Privilege did" panel's data (`traceFromDoor`).
- `netguard.md` — the rule: Real mode may reach exactly the door origin; everything else blocked.
