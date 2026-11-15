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

- `gatewayClient.js` — `createHttpClient` (Streamable HTTP, initialize handshake,
  session retry) and `createRealDoor({ env, prefix })` returning `{ ok, origin, apps,
  callers } | { ok:false, problem }`, plus `doorList()` and `doorCall()` with key scrubbing.
- `netguard.md` — the rule: Real mode may reach exactly the door origin; everything else blocked.
