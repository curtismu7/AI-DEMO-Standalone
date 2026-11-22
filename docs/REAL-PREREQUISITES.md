# What each lab needs for Real

Every lab runs in **Mock** with nothing from you. **Real** is a per-lab toggle, and what it needs differs.
This page groups the labs by what you must provide. It is built from each lab's own README, `.env.example`,
`docs/shelf-entry.json` and `pingProducts` (read from each lab's `main` on 2026-11-10), not from memory.
Lab names below are the folders under `standalone/`. Anything a lab marks UNVERIFIED stays UNVERIFIED here.

The rule (STANDALONE-RULES, "Settings per app"): each lab reads its own `.env` beside its `docker-compose.yml`
(copy `.env.example`, mode 600, gitignored). Many labs still read `~/Development/.env` and migrate when next
touched; the line for each lab says what its README says today.

<!-- summary:start -->
What each lab needs for Real (Mock needs nothing):
  A  Nothing. Most labs are Mock only, or their "Live" is a local simulation.
  B  Your own PingOne environment: scripts/pingone-setup.sh makes a sandbox and a worker; each lab's .env.example names its settings.
  C  A PingFederate: a local one from ping-shared (your own licence, you type YES) or an SE PingFederate URL.
  D  A gateway: ping-shared's minimal PingGateway (offered above when configured), or your own Privilege Agent Gateway.
  E  Owner only: customer-agent-LAB full Real (owner's PingOne environment and its "Demo PingGateway MCP" resource,
     the SE Agent Gateway, a P1AZ policy entry). Setup (bootstrap) offers its PingOne apps and asks first; the policy
     entry and the SE ingress stay manual. A colleague's own environment cannot use the SE gateway.
  Not yet standalone (owner-run Real or an AI-DEMO2 dependency): ping-gateway-route-LAB, muse-LAB,
  jit-lab-LAB (PF path), privilege-a2a-anthropic-demo-LAB, pingcli-LAB, pingone-events-LAB. Their Mock works.
<!-- summary:end -->

## A. Nothing: Mock only

Basis: the lab's README and `.env.example` name no PingOne, PingFederate, gateway, licence or API-key setting.
Nothing to provide. Where a lab has a Real button it is disabled with a reason, or "Live" is a loopback-only
simulation with zero outbound calls (README "Mock and live modes" or "Mock and Real").

- Real button disabled, Mock only by design: `agent-audit-trail-LAB`, `agent-kill-switch-LAB`,
  `agent-registry-demo-LAB`, `no-tool-no-promise-LAB`, `mock-authorize-LAB`, `mcp-elicitation-LAB`,
  `progressive-trust-ladder-LAB`, `stolen-token-LAB`, `mcp-auth-conformance-LAB`, `privilege-map-LAB`,
  `personal-agent-demo-LAB`, `agent-mcp-door-demo-LAB`, `gateway-claims-LAB`, `chatgpt-mcp-flow-LAB`,
  `agent-gateway-inspector-LAB`, `pingone-signin-LAB`, `session-LAB`, `intent-par-inspector-LAB`,
  `agentcore-pingone-demo-LAB` (Real answers 409 until the owner wires a live engine), `demo-field-guide-LAB`,
  `privilege-owasp-lab-LAB` (Real runs the live-evidence card against a Privilege console the owner points it at; Mock streams the recorded deck table).
  `pf-privilege-obo-LAB` (Real answers 409: the chain is simulated by design; Mock mirrors measured gateway log lines),
  `agent-identity-academy-LAB` (13 lessons, one per agent type and per control, over the discover/register/authenticate/authorize/govern lifecycle; Mock only, every token a labelled mock sample, no live mode),
  `meridian-air-LAB` (the airline day as 11 chat-first scenes; Mock runs offline, Real needs a llama.cpp brain and is owner-run),
  `ciba-approval-sequence-LAB` (the 71-message CIBA booking sequence as a clickable diagram; Mock only).
- Live is a local simulation, no credential: `agent-governance-LAB`, `ai-policies-LAB`, `coding-agents-LAB`,
  `data-protection-LAB`, `federated-identity-LAB`, `intent-purpose-behaviour-LAB`, `mcp-surface-LAB`,
  `saas-access-LAB`, `secrets-vault-LAB`.
- Mock scaffolds of a product contract (the README says what is real and what is not): `appfire-agent-governance-LAB`
  (Appfire agentic-AI demo; Ping governs the agent-facing front end over a simulated HIVE back end — no tenant), `a2a-lab-LAB`,
  `delegation-lab-LAB`, `hitl-mfa-lab-LAB`, `mcp-gateway-lab-LAB`, `agent-preferences-lab`, `ai-demo-standalone-LAB`.
- Testers and tools: `hostile-a2a-LAB`, `attack-gallery-LAB`, `ai-guard-sidecar-LAB`, `diagram-studio-LAB`,
  `diagram-prove-lab`, `deploy-test-LAB`, `demo-shelf-LAB`, `privilege-k8-kits-LAB` (serves packaged zips and a PDF
  from its own folders; offline, no tenant), `privilege-owasp-lab-LAB` (OWASP Agentic AI Top 10 with Privilege
  coverage; Mock is static deck wording offline, Real is one read-only PingOne call), `privilege-api-explorer-LAB` (Privilege console API explorer; Mock is the in-process mock console, Real signs in with the owner's user API key/secret — see its docs/live-checks.md),
  `mcp-scanner-lab-LAB` (scans an MCP server's tools for over-broad scopes, injection and shadow risks on demo fixtures
  or pasted metadata; offline, no tenant), `mfa-admin-mcp-lab` (administers PingOne MFA/FIDO policies, notification
  policies, delivery settings and OATH tokens through MCP tools; mock by default, live is owner-run),
  `pf-agent-client-sync-lab` (PingFederate 13.1 AI-Agent-tagged OAuth clients synced one-way into simulated PingIDM agent records; Mock is fully offline, Real is a read-only PF Admin API call with this app's own .env), `wimse-lab-LAB` (Mock IETF WIMSE workload identity: trust domains, Workload Identity Tokens and Workload Proof Tokens across a multi-hop chain; all tokens, issuers and trust domains are in-process mocks, nothing leaves the container), `intent-console-lab-LAB` (the Privilege console's AI Intents page as a standalone simulation: intents with exemplars, twins, floors and Acts, a per-app modelAIIntentConfig, and a lab-invented resolution engine over a stand-in encoder; Mock only, fully offline, no live mode), `workload-cert-lab-LAB` (Mock X.509/SPIFFE-style workload identity: short-lived SVID-like certificates issued to workloads, mTLS handshake walkthrough, expiry and rotation; offline, no tenant), `trusted-issuers-LAB` (who trusts which token issuer in PingOne, PingOne Authorize, Privilege and PingFederate; `agent-privilege-guide-lab-LAB` (guided tour of the five Agent Privilege console sections plus the Identity/Grant/Guardrail/Discovery mental model; Mock only), `privilege-google-secrets-LAB` (Privilege Hubs brokering a Google Secret Manager credential to an AI agent: agent key in, policy decision, masked secret out; allow and deny paths, GatewayTrace; Mock is fully offline, no live mode), `privilege-shelf-LAB` (the whole Privilege family on one page: 40 labs with open links through the shared lab proxy, 21 feature cards, three presenter stories; index only, Mock only, no live mode), `pf-array-claims-LAB` (the isMemberOf claim-shape use case: a PingFederate token can carry groups as a delimited string or a JSON array, and a group policy answers differently — substring search over the string over-grants to decoy names, the array gives exact membership; mint panel, three simulated cases, the fix guide; Mock only, example group names, no live mode),
  Mock only, no tenant), `pdf-to-md-LAB` (PDF to Markdown conversion in-process; no network calls, no tenant), `spiffe-issuer-LAB` (SPIFFE-style JWT-SVID issuer: real generated signing keys, real signatures, served JWKS and discovery; Mock rehearses against an in-process stand-in, Real presents a JWT-SVID to your Privilege gateway as the bearer — the SPIFFE-to-PingFederate leg is verified, SPIFFE straight to the gateway is UNVERIFIED), `cedar-act-sub-LAB` (a mock gateway that walks a measured Cedar act.sub run; its optional real probe is a terminal script the owner runs, not part of the server), `cedar-in-privilege-LAB` (a simulated guided tour of three Cedar AI policy cases in Privilege; no tenant, no outbound calls), `poppy-verification-LAB` (Personal Agent Protocol 1.0 verifier; Mock is an in-process reference Company and issuer, no tenant; Real is optional and needs your own Company and issuer plus an https agent URL the issuer can reach, set with `PVL_AGENT_BASE_URL`).

## B. Your own PingOne environment and apps

Create one with `scripts/pingone-setup.sh` (run through `scripts/setup.sh`): it makes a sandbox environment and a
worker app and writes `PINGONE_ENVIRONMENT_ID`, `PINGONE_REGION`, `PINGONE_WORKER_CLIENT_ID` and
`PINGONE_WORKER_CLIENT_SECRET` to `~/Development/.env`. You need a PingOne account that can create environments.
Each lab below lists the extra names it wants.

- `pingone-LAB`: Settings page (environment, region, app client ids); `scripts/provision-p1.mjs` plans the lab's own
  `p1Lab-*` apps (dry run by default). README "Settings", "Mock and live modes".
- `obo-lab-LAB`: `PINGONE_ENVIRONMENT_ID`, worker id and secret, `OBO_LAB_PERSON_TOKEN`, `OBO_LAB_AUDIENCE`,
  `OBO_LAB_SCOPE`, `OBO_LAB_DOWNSTREAM`. `.env.example`, README "Settings file". Reads `~/Development/.env`.
- `ciba-hitl-lab`: `PINGONE_ENVIRONMENT_ID`, worker id and secret, `CIBA_LAB_PERSON_TOKEN`, `CIBA_LAB_AUDIENCE`.
  `.env.example`, README "Settings file". Reads `~/Development/.env`.
- `mcp-tools-LAB`: `PINGONE_ENVIRONMENT_ID`, `PINGONE_REGION`, `PINGONE_MCP_CLIENT_ID` for the PingOne sign-in;
  any MCP server URL you type. README "Live proxy", `.env.example`.
  Not tested against a real tenant. `.env.example`, `docs/live-checks.md`.
- `p1-third-party-exchange-LAB`: Live tab asks for environment id, region, worker id and secret (saved to
  `~/.config/demo-kit/pingone.json`); host-run only. README "Live mode (owner-run)".
- `token-workbench-LAB`: `TW_REAL`, `TW_REAL_ISSUER`, `TW_REAL_CLIENT_ID`, `TW_REAL_CLIENT_SECRET`, `TW_REAL_SCOPE`
  (owner opt-in; PingOne or PingFederate as issuer). README "Real mode", `.env.example`.
- `mcp-resource-server-LAB`: `PINGONE_ENVIRONMENT_ID` and `PINGONE_REGION` (or `PINGONE_ISSUER`) so it verifies
  real PingOne tokens; Mock-style use needs none. It is also the MCP server behind the gateway in section D.
- `jit-lab-LAB`: your PingOne environment and worker, or the PingFederate path (marked in section C).
- **NOT YET STANDALONE: owner-run Real.** `pingcli-LAB`, `pingone-events-LAB` read `PINGONE_CLIENT_ID` and
  `PINGONE_CLIENT_SECRET`, but `scripts/pingone-setup.sh` writes `PINGONE_WORKER_CLIENT_ID` and
  `PINGONE_WORKER_CLIENT_SECRET`, so a colleague's setup does not fill them. Fill the lab's `.env` by hand from the
  worker app. `pingone-events-LAB` also wants `ELASTICSEARCH_URL` and a key to forward events; it cannot receive
  PingOne deliveries from a laptop. Real in these labs is owner-run and UNVERIFIED against live systems where their
  READMEs say so. `p1az-inspector-LAB` and `ping-services-stub-LAB` were repointed 2026-11-17: p1az reads the
  `PINGONE_WORKER_*` names first, and ping-services-stub no longer reads PingOne worker keys for its probes.

## C. A PingFederate

Two ways: a local one from `shared/ping-shared` (needs **your own PingFederate licence** saved at
`~/.config/demo-kit/pingfederate.lic`, and you typing `YES` for Ping's terms; one licence serves one instance), or
an SE PingFederate URL (`PING_SHARED_SE_PF_URL`). Setup tries the local one and skips it, saying why, when the
licence or the YES is missing. See `shared/ping-shared/README.md`, "Getting a local PingFederate".

- `pingfederate-LAB`: the PingFederate you name in Settings. PingFederate-side setup (sign-in adapter, OpenID
  Connect policy, access token manager) is the owner's and is not scripted yet. README "Settings file".
- `id-jag-standalone-LAB`: the PingFederate servers named in its settings (ID-JAG is PingFederate-only);
  `.env.example`, README "Setup script (optional)". Reads `~/Development/.env` and a repo-root `.env`.
- `idjag-runner-LAB`: no Mock. A reachable PingFederate 13.1+ whose `idjag-*` demo objects exist; runtime URL in
  Settings. README "Prerequisites".
- `cimd-LAB`: `PF_BASE_URL` for direction 1 only; the other tabs work offline. README "Prerequisites".
- `privilege-demo-LAB`: `PF_URL` and `PF_AUDIENCE` (tokens verified against that PingFederate's JWKS); the family's
  `scripts/pingfederate-setup.sh` installs a local one. README "Settings file".
- `poppy-agent-tester-LAB`: a PingFederate CIMD policy for the agent URL and the app reachable over https.
  `docs/setup.md`.
- `token-workbench-LAB`: can use a PingFederate as the issuer (see section B).
- **NOT YET STANDALONE: needs a repoint.** `jit-lab-LAB` PF path: `JIT_LAB_PF_CLIENT_SECRET` for client
  `jit-lab-agent` on a PingFederate engine at `https://local.ping-devops.com:9031` (the AI-DEMO2 address, not
  ping-shared's `https://127.0.0.1:4732`). Its README points at a recipe in the ping-shared README that is not there.

## D. A gateway

**D1. ping-shared's minimal PingGateway** (loopback, host port 7809 by default). Setup offers it only when
`shared/ping-shared/.env` has real `GATEWAY_ISSUER` and `GATEWAY_AUDIENCE` values (copy `.env.example`); it asks y/N
and never starts it in a non-interactive run or a dry run. It checks a bearer token (RS256 JWT, issuer, audience,
optional scope) and proxies `/mcp` to `GATEWAY_BACKEND_URL` (default `mcp-resource-server-LAB` on 8081). It has no
PingOne Authorize decisions, no token exchange and no introspection; the full list is in the ping-shared README,
"PingGateway: what it does and does not do". Verified there against a fake issuer; not against a real PingOne or
PingFederate token. A local PingFederate cannot be its issuer (self-signed certificate).

Open point: `privilege-k8-kits-LAB` also publishes host port 7809, so the two cannot run at once. ping-shared's start
stops with "Port 7809 is taken" and names `PINGGATEWAY_HOST_PORT`, but its probe (`probe.mjs`) checks 7809 only, so a
gateway moved to another port is not found by the probe. Not fixed here.

- `mcp-resource-server-LAB`: the MCP server behind it (see B).
- **NOT YET STANDALONE: needs a repoint.** `ping-gateway-route-LAB`: Live sends one request to a gateway on this
  machine (`ROUTE_LAB_LIVE=1`, `ROUTE_LAB_LIVE_TARGET`); the README example is `https://localhost:3036`, the
  AI-DEMO2 gateway. Pointing it at ping-shared's gateway is untested.

**D2. Your own Privilege Agent Gateway** (not provided by ping-shared). The lab asks for the gateway URL and keys:

- `ai-gateway-client-LAB`: the gateway URL you enter; `server/.env.example`. Live is owner-run.
- `mcp-demo-client-privilege-LAB`: MCP URL of your Privilege gateway and your app's client id (in the page).
- `aggregate-entitlement-LAB`: `AGG_ENT_GW_URL`, `AGG_ENT_GW_APPS`, `AGG_ENT_GW_KEY_<NAME>`. README "Real mode settings".
- `privilege-gateway-client-LAB`: `PGC_GW_URL`, `PGC_GW_APPS` (the three door names) and one agent key per door,
  `PGC_GW_KEY_<DOOR>`, in the lab's own `.env`; the page login (pi.flow) also needs your own PingOne app:
  `PGC_PINGONE_ENVIRONMENT_ID`, `PGC_PINGONE_REGION`, `PGC_USER_CLIENT_ID`. Real is owner-run and was only exercised against
  a loopback stub; unset keeps Real refused with the missing names listed. `.env.example`.
- `privilege-logging-LAB`: `PRIV_LOG_GATEWAY_URL`, `PRIV_LOG_AGENT_KEY`, optionally a search URL or kubectl proxy.
- `gateway-suite-LAB`: `CENTRAL_AGENT_A2A_URL` and an optional bearer. `.env.example`.
- `workload-identity-LAB`: `WI_REAL_GATEWAY_URL` and `WI_REAL_CLIENT_SECRET` in the compose-side `.env`; unset keeps Real
  refused with the reason. README "Real mode settings".
- `spiffe-issuer-LAB`: mints test JWT-SVIDs (valid, mismatched, untrusted) and publishes the JWKS; Mock is fully offline. Real
  needs `PUBLIC_URL` (a public https origin the gateway can fetch `/.well-known/` from), `SPIFFE_GW_URL` and `SPIFFE_GW_APPS`
  in the lab's own `.env`, plus a Federated Identity and an agent key on the gateway; unset keeps Real refused with the missing
  keys named. README "Mock and Real modes".

## E. Owner only

These need the owner's tenants and are not set up by a colleague.

- `customer-agent-LAB` full Real: the owner's PingOne environment, the PingOne resource "Demo PingGateway MCP", the
  SE Agent Gateway and a P1AZ policy entry (settings `CAL_USER_*`, `CAL_AGENT_*`, `CAL_AGENT_GATEWAY_URL`,
  `PINGONE_ENVIRONMENT_ID`). The scripts are in `standalone/customer-agent-LAB/scripts/owner/` and agents never run
  them: `pingone-real-setup.mjs` (read-only unless `--apply`), `agent-gateway-ingress.sh`, `p1az-add-actor.md` (a
  console checklist: the policy editor API refuses worker tokens). README "Mock and live modes" and "Owner setup for
  full Real", `.env.example`.
  - **Bootstrap offers the PingOne apps.** `scripts/setup.sh` shows the preview of `pingone-real-setup.mjs`, then asks
    y/N (default N) before `--apply`, which creates the two apps in the environment named in the lab's own `.env` and
    writes the eight `CAL_*` settings into that `.env` (backed up first). It applies only when the lab is checked out,
    `~/.config/demo-kit/provisioning.json` (or `STANDALONE_CRED_FILE`) exists and the lab's `.env` does not already hold
    all eight settings; with them all set it says "already configured". It never asks or runs in `--non-interactive`
    or `--dry-run` (it prints the command instead), `--no-pingone` skips it, and a failure is a WARN with the script's
    message: setup carries on.
  - **The Authorize policy entry and the SE ingress stay manual.** After a successful apply, setup prints the commands
    and never runs them: the policy entry (`p1az-add-actor.md`: additive only, export first, diff exactly one added id),
    the SE ingress (`bash scripts/owner/agent-gateway-ingress.sh`, then `--apply`; it writes to a shared cluster), then
    `HOST_PORT=5603 docker compose up --build -d` in the lab.
  - **A colleague's own PingOne environment cannot use the SE Agent Gateway.** The gateway accepts tokens only from the
    owner's environment, and the "Demo PingGateway MCP" resource exists only there, so in another environment the preview
    stops with a WARN (the resource is not found) and Mock keeps working.
- `meridian-a2a-hop-LAB`: Real is a PingOne sign-in plus two Privilege gateway doors on the SE gateway; the owner's
  `docs/live-identity.md` names the identities. Mock needs nothing.
- `privilege-bulk-users-LAB`: Real writes users into a PingOne environment (route A) or the Privilege console (route B),
  so it is owner-run. It needs a PingOne worker app with the Identity Data Admin role on the Privilege environment, and
  `PRIVILEGE_BULK_MODE=real` plus the `BULK_P1_*` settings (route B also `BULK_CONSOLE_*`) in the lab's own `.env`. The
  lab never deletes. Start with a small throwaway source population. `docs/live-checks.md` is the checklist. Mock needs
  nothing.
- **NOT YET STANDALONE: needs a repoint.** `muse-LAB`: Real needs a PingOne environment and Authorize rules, and
  its README sends you to AI-DEMO2 notes and to a gateway build named by an AI-DEMO2 PR. Owner-run
  ("Real mode in local Docker (owner-run)").
- **NOT YET STANDALONE: needs a repoint.** `privilege-a2a-anthropic-demo-LAB`: the integrated UI is the AI-DEMO2
  BFF (port 3001, `https://localhost:4000/privilege-mcp-client`); no docker-compose ships yet. README "Requirements
  and local startup".

## F. Something else you provide

- `jev-lab-LAB`: a decision-model API: `OPENROUTER_API_KEY`, or `JEV_ENDPOINT` + `JEV_MODEL` for a local model.
- `hostile-mcp-LAB`: optional `LLM_URL` and `LLM_MODEL` (a local model). `.env.example`.
- `mcp-skills-LAB`: `SKILLS_DIR`, a folder of skills mounted read-only.
- `field-notes-LAB`: `FIELD_NOTES_DIR`, a folder of `.md` pages outside the repo.
- `env-map-LAB`: `ENV_MAP_SNAPSHOT`, written by `scripts/collect.sh` (read-only `docker ps` and `kubectl get`).
- `mcp-discovery-LAB`: `MCP_DISCOVERY_LIVE=1` scans this machine (read-only, opt-in).
- `worker-demo-LAB`: its README says to run `privilege-demo-LAB` on 4510 and that lab's stub issuer on 9031 first.
- Repointed 2026-11-17: `demo-map-LAB` Real needs only `SHELF_URL`; the row page links are built on an optional
  `LINK_BASE_URL` (unset, the map shows apps only).
- Repointed 2026-11-17: `observability-LAB` Real reads a Loki you point `OBS_LOKI_URL` at (loopback); its own Loki and
  Alloy (compose profile `stack`) need nothing else. The Privilege SIEM/Kibana sources stay opt-in and owner-run.
- Repointed 2026-11-17: `mcp-tools-LAB` known-servers now ships family-neutral servers only (everything, hostile-mcp,
  mcp-resource-server-LAB, the OpenSearch port-forward).
- (Retired 2026-11-18: pingone-mcp-inspector-LAB merged into mfa-admin-mcp-LAB.) Repointed 2026-11-17: its presets were composed from your region + envId at runtime; the
  AI-DEMO2 naming is gone from the UI and docs.
- Repointed 2026-11-17: `ping-services-stub-LAB` probes ping-shared's fixed ports (PingFederate 4732, PingGateway
  7809) by default; every target is env-overridable and the Privilege gateway is opt-in.
- Repointed 2026-11-17: `p1az-inspector-LAB` reads `PINGONE_WORKER_CLIENT_ID/SECRET` first (what
  `scripts/pingone-setup.sh` writes); there is no on-prem default — the on-prem URL is operator-entered and
  `mock-authorize-LAB` on 4850 is the documented stand-in.

## Not yet standalone, in one list

`ping-gateway-route-LAB`, `muse-LAB`, `jit-lab-LAB` (PingFederate path),
`privilege-a2a-anthropic-demo-LAB` (integrated UI),
and, for the `PINGONE_CLIENT_ID` and `PINGONE_CLIENT_SECRET` key names, `pingcli-LAB`, `pingone-events-LAB`.
Six labs from the 2026-11-10 audit were repointed on 2026-11-17 (see the "Repointed" lines above):
`ping-services-stub-LAB`, `p1az-inspector-LAB`, `mcp-tools-LAB`,
`demo-map-LAB`, `observability-LAB`. This is the audit plus what the READMEs above say.

Fleet-wide, 2026-11-18: a sweep found 14 more labs whose vendored TopMenu imports `./ReleaseNotes.jsx`
but never received the file — the web build and every web test suite failed at their main since the
rule-22 re-vendor. All 14 now ship the byte-identical shared file (one-commit PR each, all merged,
all lab mains CI green; parent pins bumped in AI-DEMO-Standalone #392). Two pin-drift finds from the
same sweep, both fixed: `privilege-api-explorer-LAB`'s `top-menu.sha256` listed meta-repo-relative
paths so the pin never matched (now bare filenames, like every other lab), and its `VerifyMark.jsx`
had drifted from `shared/verify-mark/` (re-vendored). The 2026-11-17 repoint was browser-proved the
same day through the lab proxy, by content: mcp-tools known-servers neutral, ping-services-stub
probing ping-shared's 4732/7809 with working env overrides, demo-map Real apps-only without a link
base, pingone-mcp-inspector naming clean, p1az worker keys parsing, observability collector shipping
to its Loki.
