# P1AZ policy snapshot (live mode only)

`ai-demo-p1az.standalone.snapshot.json` is the AI Demo PingOne Authorize policy (3 policies, 33 rules, 41 conditions) for tenants
you own. **Mock mode, the default in every app, needs none of this.**

Import it once: PingOne console -> Authorize -> Trust Framework -> Import. There is no import API. Then run
`node scripts/check-authorize-policy.mjs` (or `scripts/bootstrap.sh --skip-install`): it sends one read-only decision and reports
imported / NOT imported / cannot check.

## It uses placeholder hosts

The audiences and issuers the policy accepts are `.example` placeholders (`https://gateway.example/mcp`,
`https://external-door-a.example`, ...). A token whose audience is not one of them is denied (`mcp-invalid-audience`). After the
import, edit the `HasValidMcpAudience` condition in the console to your own gateway URI, or send these audiences from your app.

## Provenance

A copy of the AI-DEMO2 snapshot with every host replaced by a placeholder; ids, rules and structure are unchanged. Re-create it
from a newer AI-DEMO2 snapshot with the same host substitutions, then run the forbidden-strings check before committing.
