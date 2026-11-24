# Demos for the new Privilege features: options (2026-11-24)

Written for: the owner, to pick which demos to build or extend. This is a planning note, not a spec.

"New Privilege features" here means the 2026-11-02 release list tracked in `standalone/gateway-claims-LAB` (entitlement-aware discovery, aggregate cap, OBO redeem, scope layers, hold). None of these is measured on our tenant. Everything about gateway images v1.261029 and v1.261030 is read from binaries and is unverified. If you meant a different feature list, this note needs redoing.

## Options

| # | Feature | Where it fits | Doable today | Needs from the owner |
|---|---|---|---|---|
| 1 | **Entitlement-aware discovery**: two keys see different tool lists | Extend `privilege-gateway-client-LAB`. Its mock doors already show 18 tools versus 7, and its README lists "filtered or full" as unmeasured. | A mock tab labelled "Ping claim, unverified". | A second, lower-entitled agent key on the real gateway (a tenant write, so an explicit go). Today one key returns 6 tools on v1.261030. |
| 2 | **Aggregate cap**: one cap counted across calls, not per key | New tab in `gateway-claims-LAB`. | A mock burst that runs until the first refusal. | A low-cap test key and a small burst. Keep it small so the live gateway is not loaded. |
| 3 | **OBO redeem**: one-token delegation | Extend the OBO tab in `gateway-claims-LAB` (13 mock scenarios) or `pf-privilege-obo-LAB`. Matches the "OBO, one token" decision in the SPIFFE handoff spec. | A mock "redeem" step. | A real PingFederate token that acts for a user, to compare `sub` and `act` at the backend against the nested-claim token. |
| 4 | **Hold**: a rejected approval is not held again (read from the binary, unverified) | Extend `ciba-approval-sequence-LAB`, or the held-call story S04 in `privilege-gateway-client-LAB` (mock-only today). | Mock. | A real held call, to measure the response shape. |
| 5 | **Scope layers** | `gateway-claims-LAB`. Scope tiers were already measured on v1.261027: a token with `opensearch:admin` sees 9 tools, `opensearch:read` sees 3, and a bare token gets 403. Whether "scope layers" is the same thing is unknown. | Re-run on the new image and compare tool counts. | A quick live rerun. The cheapest real measurement, because the baseline exists. |
| 6 | **SPIFFE workload identity to a door** | `spiffe-issuer-LAB`. Verified twice: a real SPIRE token on 2026-11-19 and the lab's own tokens on 2026-11-22. | Runnable now in Real mode. | Nothing. |
| 7 | **Support P1 time-boxed Salesforce access** | `salesforce-privilege-LAB` (release 3.14). One real Privilege and Salesforce run so far. | Runnable now. | One open check: does the end time end access by itself? Privilege stored no note in our run. |

## Recommendation

- **Show today:** #6 and #7, which have real-run evidence.
- **Mock tabs, labelled unverified:** #1, #2, #3 and #5, added to labs that already exist. This avoids a new lab and the full standalone rulebook.
- **Wait for the owner's go:** the real measurements for #1, #2, #3 and #5. Each is a tenant write or a live call.
- **Suggested first step:** #5, the live scope-tier rerun on the current image. No new tenant objects are needed.

## Rules that apply when building any of these

- Extending an existing lab: add a tab or story; keep its Mock/Real toggle and its "unverified" labels; claim only what a real run showed.
- A brand-new lab: invoke the `standalone-demo` skill first and follow `~/Development/STANDALONE-RULES.md`.
- Work in a worktree on its own branch; any front-end change gets checked in a real browser with a screenshot.
- Real runs only after the owner says go in the conversation.

## Sources in the repo

- `standalone/gateway-claims-LAB/README.md` and `docs/talk-track.md` (the "not yet measured" list and what each test needs)
- `standalone/privilege-gateway-client-LAB/README.md` (doors, held-call story, unmeasured shapes)
- `standalone/spiffe-issuer-LAB/README.md` (verified SPIFFE runs)
- `RELEASE_NOTES.md`, 3.14 entry (Salesforce Support P1)
- `docs/specs/2026-11-23-agent-spiffe-handoff.md` (OBO, one token)
