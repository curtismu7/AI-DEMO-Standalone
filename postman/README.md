# Master Postman bundle — every lab's collection in one place

One import point for all 21 standalone labs' API collections. Each lab repo keeps its own `postman/` (authoritative: `spec.json` + generated collection + placeholder environment); this folder is a generated mirror so SEs can import everything without cloning 21 repos.

## Layout

```
postman/
  collections/<lab>/<slug>.postman_collection.json          # the collection
  environments/<lab>/<slug>.live.environment.example.json   # placeholder values, safe to commit
```

21 labs: ciba-approval-sequence, ciba-hitl, cimd, delegation, gateway-claims, id-jag-standalone, intent-par-inspector, mcp-gateway-lab, mcp-resource-server, mock-authorize, obo, p1-third-party-exchange, pf-array-claims, privilege-api-explorer, saas-access, session, stolen-token, token-workbench, trusted-issuers, wimse, workload-identity.

## One big import: all 21 labs in a single file

`postman/all-labs.postman_collection.json` + `postman/all-labs.live.environment.example.json` merge every lab into one collection — one top-level folder per lab, each described **use-case-first** ("USE CASE: ...") so the sidebar explains what each lab proves without opening anything. Import the pair, select the merged environment, done. Regenerate with `node shared/postman/merge-all.mjs` (`--check` for CI).

## Import into Postman

1. Import `collections/<lab>/<slug>.postman_collection.json`.
2. Import `environments/<lab>/<slug>.live.environment.example.json`.
3. Select the environment in the dropdown (top-right) so `{{LAB_BASE}}` resolves.
4. **Run collection** replays the whole flow with built-in assertions; the lab's server must be running (mock-mode labs: `docker compose up -d` in the lab repo, or see its README).

Variable chaining is built in — sign-in cookies, minted tokens (`MINTED_TOKEN`, `WORKER_TOKEN`, `IDP_TOKEN`, `CIBA_IDENTIFIER`) flow into the next request automatically.

## Start every lab at once

```bash
bash postman/start-all-labs.sh          # docker compose up for compose labs, npm start for the rest
bash postman/start-all-labs.sh --check  # report only (exit 1 if any lab is down)
bash postman/start-all-labs.sh --stop   # stop the docker labs
```
Then run the whole collection (Runner, or `newman run postman/all-labs.postman_collection.json`).

## Real runs — which collections hit real Ping products

See **[REAL-RUNS.md](REAL-RUNS.md)** (per-lab table) and **[REAL-CIBA-RUN.md](REAL-CIBA-RUN.md)** (a fully proven real-CIBA walkthrough): the per-lab table (env keys, where each secret
lives, how to flip the lab's mode), the labs that are mock-only by design, and the
real-only collections in `ping-postman-packages` that skip the lab entirely.

## Live values (owner machine)

The committed environments are placeholders only. On the owner machine, fill real settings from the shared env file:

```bash
cd standalone/<lab>
node ../../shared/postman/fill-env.mjs --spec postman/spec.json   # writes postman/<slug>.live.environment.json (git-ignored)
```

Import that filled file into your **local** Postman only — never commit or sync it. Filled files exist for: cimd, id-jag-standalone, token-workbench, mcp-resource-server, privilege-api-explorer.

## Folders labelled (MOCK ONLY)

Lanes marked `(MOCK ONLY)` (cimd's H2 2026 gateway-sim, the simulated flow catalogs) target the lab's in-process simulation; they have no live form and prove nothing about a customer tenant — the same honesty the labs' own banners carry.

## Regenerating this bundle

The labs are authoritative. After changing any lab's collection:

```bash
node shared/postman/bundle.mjs          # re-copy from standalone/*/
node shared/postman/bundle.mjs --check  # exit 1 if stale (CI-safe)
```

Never hand-edit the copies — change the lab's `postman/spec.json`, regenerate there, then re-bundle.
