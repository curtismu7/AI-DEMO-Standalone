# cimd-doc-server (shared, Tool tier)

Shared CIMD **Client ID Metadata Document** publisher for the standalone family
(rule 20 shared infrastructure). Stands in for the public
`https://client.dev/oauth/metadata.json` so a lab's PingFederate can resolve a
CIMD client without a third-party dependency.

- Tier: Tool (infrastructure for the family)
- Port: 5252, loopback-only bind, Host allow-list (`127.0.0.1`, `localhost`,
  `local.ping-devops.com`; override with `ALLOWED_HOSTS`)
- Health: `GET /api/health` → `demo-health/1`

## Endpoints
| Path | What |
|---|---|
| `GET /oauth/metadata.json` | client.dev-compatible demo client document; `client_id` and `redirect_uris` are rewritten to the request origin (CIMD §4: client_id IS the document URL) |
| `GET /documents/:name.json` | any JSON document from `./documents`, same §4 correction |
| `GET /api/health` | `demo-health/1` |

## Adding a document
Drop a JSON file into `./documents/` (only `[A-Za-z0-9_-]+.json` is served).
The document's `client_id` is corrected to its own URL at serve time, so
documents can be copied verbatim between hosts and ports.

## Pointing PingFederate at it
1. Add the server's root CA (or the document server's TLS cert) to the PF
   container's trust; PF must reach `https://<host>:5252` over the shared
   `ping-shared` Docker network.
2. Add the document URL to a CIMD policy's `metadataUrls`.
3. `POST /api/pf/probe` from cimd-LAB with the document URL as `client_id`.

## Tests
`node --test test/*.test.js` — 5 tests: health, §4 rewrite, documents dir,
404/traversal, Host allow-list.

## Attribution
The document shape follows [stytchauth/client.dev](https://github.com/stytchauth/client.dev)
(MIT). This server is our own code; see `NOTICE`.
