# Handoff: SPIFFE agent handoff and Privilege feature demos (2026-11-24)

Written for: the next agent or session picking this up, and the owner. Read this first, then the three docs it points to.

## What this session produced
Documents only. No code was written and nothing ran against any tenant or cloud.

| Item | State | Where |
|---|---|---|
| SPIFFE agent handoff spec (S1 to S5 + go/no-go) | merged, status `draft` | `docs/specs/2026-11-23-agent-spiffe-handoff.md`, PR #538 (c368d88) |
| Privilege feature demo options (7 options) | merged | `docs/privilege-feature-demo-options-2026-11-24.md`, PR #555 (e7a09ee) |
| Plan to finish both | merged | `docs/plan-spiffe-handoff-and-privilege-demos-2026-11-24.md`, PR #557 (6ea2558) |
| This handoff | uncommitted in the `finish-plan` worktree | `HANDOFF-SPIFFE-PRIVILEGE-2026-11-24.md` |

## Where things stand
- The owner's four items (SPIFFE auth on the gateway, PingFederate actor-token processor and issuance criteria, SPIRE on GKE / Cloud Run / Agent Runtime, protecting the gateway) were gap-analysed against the repo. Only the Privilege-gateway JWT-SVID path and the PingFederate token-exchange guide for SPIRE tokens had coverage (`standalone/spiffe-issuer-LAB`).
- "Gateway" means the **Privilege gateway** (mcpgw), not PingGateway (IG).
- "Blueprint" means a **Microsoft Entra Agent ID agent identity blueprint**.

## Owner decisions on record (2026-11-23)
- **Q1:** on-behalf-of, **one token** per request. No nested `act.act`. Whether Privilege does the per-request exchange natively is unconfirmed.
- **Q2, blueprint binding:** **on hold.** Candidates (A) PingFederate issuance criteria compare the actor's SPIFFE ID to a registered blueprint ID; (B) an Entra-issued token (`xms_par_app_azp` = blueprint) is in the chain. S4 is blocked until this is decided.
- **Q3, cloud access:** yes, **not yet.** GCP project and Entra tenant exist; touch nothing until the owner says go in the conversation.
- **Q4:** use the PingFederate 13.1.3 box from `standalone/spiffe-issuer-LAB/docs/pf-setup-guide/`.

## Research findings worth keeping (web search only, not repo-verified)
- Entra Agent ID blueprints hold the credentials; federated credentials must match issuer, subject and audience exactly, and a wrong subject is accepted at creation and only fails at use.
- Google: GKE managed workload identity (X.509, GA 18 March 2026) and Agent Identity on Agent Runtime are SPIFFE-based. Cloud Run is not in the managed workload identity docs; its Agent Identity status conflicts across sources. No Google source says Agent Identity issues JWT-SVIDs. IAM bindings need the `principal://` form.
- PingFederate: the token exchange processor policy can require an actor token; issuance criteria exist on the policy mapping and the SP connection. Nothing in Ping docs mentions blueprints.
- Treat all of the above as unverified until a spike confirms it.

## Next steps (in order)
1. Commit or discard this handoff, then remove the `finish-plan` worktree and branch (`../AI-DEMO-Standalone-wt/finish-plan`, `docs/finish-plan`). PR #557 is already merged.
2. Owner answers Q2 and gives the go for live work. Then mark the spec `agreed`.
3. Phase 2 of the plan: rehearse spiffe-issuer-LAB and salesforce-privilege-LAB in Real mode; re-run the scope-tier test (option #5); check whether the Salesforce end time ends access by itself.
4. Phase 3: spikes S1, S2, S3, S5, then S4.
5. Phase 4: labelled mock tabs (#3, #1, #2, #4) in existing labs, after Phase 2's measurements.

## Do not break
- The verified runs of 2026-11-19 (real SPIRE token to a door) and 2026-11-22 (the lab's own tokens, 200 / 401 / 401). New work uses **new** Federated Identities; never edit the existing ones.
- Existing PingFederate config used by `pingfederate-LAB` and the SPIRE guide. Give new policies and processors new names.
- Claim only what a real run showed; a 401's reason is "inferred" unless a log line says it.

## Working rules and gotchas
- Always work in a worktree on its own branch: `git worktree add ../AI-DEMO-Standalone-wt/<name> -b <branch> origin/main`. The main checkout has many modified submodule entries; do not touch them.
- GitHub account must be `curtismu7` (`gh auth status | grep Active`).
- The guardrail hook can warn about commits from the main checkout even when the commit ran in a worktree. Check `git branch --show-current` in the worktree and `git log -1 main` to confirm.
- Heavy tests go through `air-test`. No AI attribution anywhere. No secrets in the repo; `.example` and `.invalid` hosts only.
- Do not open credential files the owner has open in the IDE (`~/.config/demo-kit/*`).
- Live steps need an explicit go from the owner in the conversation. Merging a PR needs an explicit ask each time.
