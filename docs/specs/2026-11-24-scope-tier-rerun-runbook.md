# Scope-tier rerun on the current gateway image (owner-run runbook)

**Why:** the options note ranks this as the cheapest real measurement. Scope tiers were measured on v1.261024 and shown in the gateway-claims-LAB v1.261027 tab: a token with the admin scope lists nine tools, the read scope three, a token with neither gets 403. Whether the newer "scope layers" feature is the same thing is unknown. Rerun on the current image and compare.

**Who:** the owner. This is a tenant write and uses credentials; agents do not hold them (rulebook: real tenants are owner-only). Nothing here is run by an agent.

## Before
- Note the gateway image tag (it goes in the result).
- One MCP app with two rules on the same app and key: rule A requires the read scope on its three tools, rule B requires the admin scope on all nine (`RequiredClaims { Map: { scope: { Elems: [...] } } }`, Elems is any-of). The measured setup is described in `standalone/gateway-claims-LAB/server/src/scopeData.js`.
- Three tokens from the identity provider: read scope only, admin scope only, neither. Plus one holding both, which was never run (the lab marks it inferred).

## Run
For each token, call `tools/list` through the gateway and record: HTTP status, the number of tools, the tool names. Keep it to four calls; do not load the gateway.

## Record (paste into a note, no tokens)
| Token | Status | Tools (count) |
|---|---|---|
| read only | | expect 3 |
| admin only | | expect 9 |
| neither | | expect 403 |
| both | | expect 9 (inferred, never run) |

Plus the image tag, the date, and whether any log line mentions `RequiredClaims`.

## After
- Same numbers: the tiers hold on the new image; "scope layers" is probably the same feature. Say so in gateway-claims-LAB as measured on the new tag.
- Different numbers: record them as a new finding, not a correction of the old one.
- Revoke or delete the test rules and tokens you created.
- Send the table back and I will update the lab's labels. I do not run any of this.
