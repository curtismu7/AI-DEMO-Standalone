# Plan: finish the SPIFFE handoff spikes and the Privilege feature demos (2026-11-24)

Written for: the owner, as the working plan. It sequences two merged documents:
- `docs/specs/2026-11-23-agent-spiffe-handoff.md` (the spikes S1 to S5 and the go/no-go)
- `docs/privilege-feature-demo-options-2026-11-24.md` (demo options #1 to #7)

Nothing here has been run. No live step starts without the owner's go in the conversation.

## Phase 0: housekeeping (no gate)
- Remove the worktree `../AI-DEMO-Standalone-wt/privilege-demo-options` and its local and remote branch `docs/privilege-demo-options`.
- **Done when:** `git worktree list` shows no leftovers.

## Phase 1: decisions only the owner can make
1. **Q2, the blueprint binding.** Choose one:
   - (A) PingFederate issuance criteria compare the actor's SPIFFE ID to a registered blueprint ID.
   - (B) An Entra-issued token carrying the blueprint ID is part of the chain.
2. **Go for live work.** Say which of these may be touched: GCP, Entra, the shared PingFederate box, and the Privilege tenant (new keys, a capped key, a rerun).
3. **Lab choice.** Mock tabs in existing labs, or a new lab. Recommendation: existing labs, so the full standalone rulebook does not apply.
- **Done when:** the spec's status moves from `draft` to `agreed`.

## Phase 2: demos that need little or no new setup
| Step | Work | Done when |
|---|---|---|
| 2a | Rehearse option #6 (SPIFFE to a door) and #7 (Salesforce Support P1) in Real mode | Each run once in a browser, with a screenshot |
| 2b | Option #5 scope layers: re-run the tier test on the current gateway image | Counts compared with the baseline (9 tools, 3 tools, 403), then recorded in `gateway-claims-LAB` as measured, with the date |
| 2c | Check whether the Salesforce end time ends access by itself | Result recorded, either way |

## Phase 3: the SPIFFE handoff spikes
Order: S1, S2, S3, S5. S4 waits for Q2. The work becomes Tier 2 once colleagues depend on it.

| Spike | Work | Done when |
|---|---|---|
| S1 | What credential each runtime (GKE, Cloud Run, Agent Runtime) can hand a workload | A decoded-claims row per runtime, redacted, plus a `curl` of each JWKS URL |
| S2 | Present each runtime JWT to a door through a new Federated Identity | Valid is 200; another subject, wrong audience, tampered token and no token are each 401 |
| S3 | PingFederate 13.1.3 exchange with the SVID as `actor_token`, one token out | `sub` is the user, `act.sub` is the SPIFFE ID, no nested `act.act`; the errors for a missing `iss` or `kid` are recorded |
| S5 | Threat table for the gateway as the most privileged client | Each row names a control and how to test it; at least one row demonstrated live |
| S4 | The blueprint binding (after Q2) | A different blueprint, an unmapped SPIFFE ID and a missing blueprint are each refused |

- **Cleanup:** remove every Federated Identity, PingFederate policy and cloud resource created.
- **Finish (spec criterion 6):** a one-page go/no-go on extending `spiffe-issuer-LAB` or building a new lab. Then mark the spec `verified`, with evidence beside each criterion.

## Phase 4: mock tabs for the unmeasured features
Order: #3 OBO redeem, #1 entitlement-aware discovery, #2 aggregate cap, #4 hold. Start after Phase 2's measurements, so the tabs reflect real results.

For each tab:
- Label it "Ping claim, unverified" until a live run measures it.
- Add a test, and run the lab's gate through `air-test`.
- Check it in a real browser with a screenshot, including long names and empty states.
- Get `/code-review` on the branch, handing the reviewer the diff.
- Flip the label to measured only after the matching live run.

## Order and gates
1. Phase 0 and Phase 1 first.
2. Phase 2 starts when the owner gives the go.
3. Phase 3 needs the go for each cloud and tenant.
4. Phase 4 starts after Phase 2.

## Risks
- Cloud Run and Agent Runtime SPIFFE support is unconfirmed, so S1 may rule things out.
- A runtime that offers only X.509 cannot be tested against the gateway, which has been verified only with JWTs.
- Each live step is a tenant write and needs the owner's go.
- Q2 is on hold, so S4 and the `agreed` status wait on it.

## Rules that apply throughout
- Work in a worktree on its own branch; stage files explicitly; use the `curtismu7` GitHub account.
- No secrets, tokens or cloud credentials in the repo, a log or a screenshot; only `.example` and `.invalid` hosts in committed files.
- Claim only what a real run showed; a 401's reason is "inferred" unless a log line says it.
- No AI attribution anywhere.
