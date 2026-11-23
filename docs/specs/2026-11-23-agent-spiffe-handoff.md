# Agent SPIFFE identity handoff spec

**Status:** draft   **Owner:** curtismu7 (decides open questions Q1 to Q4 before any spike runs)
**Tier:** 1 (research spikes, owner only). Becomes Tier 2 the moment a lab ships to colleagues or a spike changes a shared tenant.

## Goal
Find out, with evidence, whether an agent running on GKE, Cloud Run or Agent Runtime can use its platform SPIFFE identity to (a) reach the Privilege gateway, and (b) be the **actor** in a PingFederate token exchange whose handoff token is bound to a Microsoft Entra Agent ID **blueprint**. Also define how the gateway, now the most privileged agent-facing client, is protected. Output: a findings table and a go/no-go on extending `spiffe-issuer-LAB` versus a new lab. No lab is built by this spec.

Already verified (do not redo): a real SPIRE 1.7.2 JWT-SVID gets 200 / 401 from a Privilege door via a Federated Identity set to fetch keys by URL (2026-11-19); our own minted tokens got 200 / 401 / 401 (2026-11-22). Source: `standalone/spiffe-issuer-LAB/README.md`.

## Open questions (owner answers first; a spike that depends on one does not start)
- **Q1. Who exchanges?** The paste says the gateway acts as the RFC 8693 client per request. Is that a real Privilege gateway feature, or the design we want? Not confirmed anywhere in the repo or in the research.
- **Q2. What is the blueprint binding?** (A) PF issuance criteria compare the actor SVID's SPIFFE ID to a registered blueprint ID, and the handoff token carries a `blueprint_id` claim; or (B) an Entra-issued token (`xms_par_app_azp` = blueprint) is the subject or actor. Research found no Ping source for either; both are inference.
- **Q3. Cloud access:** is there a GCP project (GKE, Cloud Run, Agent Runtime) and an Entra tenant with Agent ID we may use, and may spikes touch the shared PF and Privilege tenant?
- **Q4. Which PingFederate:** the 13.1.3 box used for the existing guide?

## Acceptance criteria (each one a runnable check, recorded with date and evidence)
1. **S1 runtime credentials.** For each of GKE, Cloud Run, Agent Runtime, a table row: credential types obtainable (X.509-SVID, JWT, other), and for a JWT: `iss`, `kid`, `alg`, `aud` (can the workload choose it?), lifetime, public JWKS or discovery URL (yes/no). Check: a real token decoded per runtime, values redacted, `curl` of the JWKS URL.
2. **S2 Privilege direct.** Each runtime JWT that has a public JWKS is registered as a Federated Identity (fetch by URL) and presented to a door. Check: valid 200 with tool list; another subject 401; wrong audience 401; tampered 401; no token 401. A runtime with only X.509 is recorded as "not testable: gateway takes JWT" unless Ping confirms mTLS.
3. **S3 PF actor token.** PF 13.x policy with "Actor Token Required" and a JWT Token Processor 2.0 for the SVID as `actor_token`. Check: exchange returns a token whose `act.sub` is the SPIFFE ID. Record exactly which of `iss` / `kid` PF requires and what error it returns when each is missing.
4. **S4 blueprint binding** (after Q2). Issuance criteria let the exchange through only when the actor maps to the expected blueprint. Check: matching blueprint issues; a different blueprint, an unmapped SPIFFE ID and a missing blueprint are each refused by PF, with the error recorded.
5. **S5 gateway protection.** A written threat table for the gateway as the exchange client: where its client credential lives, its scopes, what a stolen credential can mint, audit trail per exchange, rate limit. Check: each row names the control and how we would test it; at least one row is demonstrated against a real gateway.
6. **Decision.** One page: extend `spiffe-issuer-LAB` (new mode) or new lab, with the evidence rows that justify it.

## Unhappy paths (each needs a check)
- **Runtime offers no JWT** (X.509 only): recorded as a finding; do not fake a JWT.
- **Runtime identity changes on redeploy** (one source says Agent Runtime gets a new principal each time, unconfirmed): redeploy once and compare; a grant keyed on the old ID must fail closed.
- **SPIRE and managed identity disagree** on the trust domain: exchange refused, error recorded.
- **Expired SVID, clock skew, rotated key (new `kid`)**: PF refuses; after JWKS refresh it accepts.
- **PF or Entra down or slow:** the exchange fails closed; no token is issued from a cached decision.
- **Repeated exchange with the same actor token:** record whether PF accepts a replay.
- **Hostile input:** oversized or malformed actor token, `alg: none`, SPIFFE ID with a lookalike trust domain: all refused.
- **Spike leaves residue:** every Federated Identity, PF policy and cloud resource created is listed and removed at the end.

## Out of scope
Building or shipping a lab, a Docker standalone, rollout to colleagues, the SE cluster, and PingGateway (IG). Cedar policy authoring (existing `cedar-*` labs cover it). Running our own SPIRE on a runtime that already has a native SPIFFE identity unless S1 shows the native one has no JWT.

## Protected / must not break
- The verified 2026-11-19 and 2026-11-22 Privilege paths: spikes use **new** Federated Identities, never edit the existing ones.
- Existing PF configuration used by `pingfederate-LAB` and the SPIRE guide: new policies and processor instances get new names.
- No secret, token or cloud credential in the repo, a log or a screenshot; only `.example` and `.invalid` hosts in committed files; env files stay per-repo (never `~/Documents`).
- Claim only what a real run showed: a 401's reason is "inferred" unless a log line says it.

## Verification plan
- Evidence file per spike under `docs/specs/evidence/` (redacted decoded claims, status codes, dates); the findings table lives in this spec.
- Live runs only against the owner's own tenants and cloud accounts, after Q3 is answered and the owner says go in the conversation.
- Heavy or repeated scripted checks go through `air-test`; anything needing live credentials runs locally and says so.
- Review: `/code-review` on the branch, handing the reviewer the diff, before merge. Spec is marked `agreed` after Q1 to Q4, `verified` after criteria 1 to 6 each have evidence pasted beside them.
