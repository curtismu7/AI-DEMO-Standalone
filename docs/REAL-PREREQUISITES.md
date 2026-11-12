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
  Not yet standalone (Real still needs AI-DEMO2; needs a repoint): ping-services-stub-LAB, ping-gateway-route-LAB, muse-LAB,
  jit-lab-LAB (PF path), p1az-inspector-LAB, mcp-tools-LAB, pingone-mcp-inspector-LAB, privilege-a2a-anthropic-demo-LAB,
  observability-LAB, demo-map-LAB, pingcli-LAB, pingone-events-LAB. Their Mock works.
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
  `pf-privilege-obo-LAB` (Real answers 409: the chain is simulated by design; Mock mirrors measured gateway log lines).
- Live is a local simulation, no credential: `agent-governance-LAB`, `ai-policies-LAB`, `coding-agents-LAB`,
  `data-protection-LAB`, `federated-identity-LAB`, `intent-purpose-behaviour-LAB`, `mcp-surface-LAB`,
  `saas-access-LAB`, `secrets-vault-LAB`.
- Mock scaffolds of a product contract (the README says what is real and what is not): `a2a-lab-LAB`,
  `delegation-lab-LAB`, `hitl-mfa-lab-LAB`, `mcp-gateway-lab-LAB`, `agent-preferences-lab`, `ai-demo-standalone-LAB`.
- Testers and tools: `hostile-a2a-LAB`, `attack-gallery-LAB`, `ai-guard-sidecar-LAB`, `diagram-studio-LAB`,
  `diagram-prove-lab`, `deploy-test-LAB`, `demo-shelf-LAB`, `privilege-k8-kits-LAB` (serves packaged zips and a PDF
  from its own folders; offline, no tenant), `privilege-owasp-lab-LAB` (OWASP Agentic AI Top 10 with Privilege
  coverage; Mock is static deck wording offline, Real is one read-only PingOne call).

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
- `pingone-mcp-inspector-LAB`: `PINGONE_ENVIRONMENT_ID`, `PINGONE_REGION`, `PINGONE_MCP_INSPECTOR_MODE=live`.
  Not tested against a real tenant. `.env.example`, `docs/live-checks.md`.
- `p1-third-party-exchange-LAB`: Live tab asks for environment id, region, worker id and secret (saved to
  `~/.config/demo-kit/pingone.json`); host-run only. README "Live mode (owner-run)".
- `token-workbench-LAB`: `TW_REAL`, `TW_REAL_ISSUER`, `TW_REAL_CLIENT_ID`, `TW_REAL_CLIENT_SECRET`, `TW_REAL_SCOPE`
  (owner opt-in; PingOne or PingFederate as issuer). README "Real mode", `.env.example`.
- `mcp-resource-server-LAB`: `PINGONE_ENVIRONMENT_ID` and `PINGONE_REGION` (or `PINGONE_ISSUER`) so it verifies
  real PingOne tokens; Mock-style use needs none. It is also the MCP server behind the gateway in section D.
- `jit-lab-LAB`: your PingOne environment and worker, or the PingFederate path (marked in section C).
- **NOT YET STANDALONE: needs a repoint.** `p1az-inspector-LAB`, `pingcli-LAB`, `pingone-events-LAB`,
  `ping-services-stub-LAB` read `PINGONE_CLIENT_ID` and `PINGONE_CLIENT_SECRET`, but `scripts/pingone-setup.sh`
  writes `PINGONE_WORKER_CLIENT_ID` and `PINGONE_WORKER_CLIENT_SECRET`, so a colleague's setup does not fill them.
  Fill the lab's `.env` by hand from the worker app until the labs are repointed. `pingone-events-LAB` also wants
  `ELASTICSEARCH_URL` and a key to forward events; it cannot receive PingOne deliveries from a laptop. Real in these
  labs is owner-run and UNVERIFIED against live systems where their READMEs say so.

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
- `privilege-logging-LAB`: `PRIV_LOG_GATEWAY_URL`, `PRIV_LOG_AGENT_KEY`, optionally a search URL or kubectl proxy.
- `gateway-suite-LAB`: `CENTRAL_AGENT_A2A_URL` and an optional bearer. `.env.example`.

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
- **NOT YET STANDALONE: needs a repoint.** `demo-map-LAB`: Real requires `AI_DEMO2_URL` (README "Real: settings").
- **NOT YET STANDALONE: needs a repoint.** `observability-LAB`: Real reads a Loki you point `OBS_LOKI_URL` at. Its own
  Loki and Alloy (compose profile `stack`) work without AI-DEMO2; the other log sources (Privilege SIEM and
  Kibana, the AI-DEMO2 monitoring containers) are not standalone.
- **NOT YET STANDALONE: needs a repoint.** `mcp-tools-LAB`: its known-servers list includes an AI-DEMO2 banking MCP
  server at `http://127.0.0.1:8080/mcp` (`server/data/known-servers.json`); the rest of the lab does not need it.
- **NOT YET STANDALONE: needs a repoint.** `pingone-mcp-inspector-LAB`: its connection presets and
  `docs/live-checks.md` use the AI-DEMO2 endpoint style `mcp.pingone.<region>/admin/<envId>/mcp`.
- **NOT YET STANDALONE: needs a repoint.** `ping-services-stub-LAB`: probes PingFederate on 9031, PingGateway on
  3036 and the Privilege gateway on 8623 (AI-DEMO2's ports), not ping-shared's 4732 and 7809.
- **NOT YET STANDALONE: needs a repoint.** `p1az-inspector-LAB`: listed by the 2026-11-10 audit for its on-prem
  PingAuthorize default. What its README shows: Live targets a PingOne environment or an on-prem PingAuthorize you run
  (settings placeholder `http://host.docker.internal:9001`); `mock-authorize-LAB` can stand in on 4850. The key names
  are in section B.

## Not yet standalone, in one list

`ping-services-stub-LAB`, `ping-gateway-route-LAB`, `muse-LAB`, `jit-lab-LAB` (PingFederate path),
`p1az-inspector-LAB`, `mcp-tools-LAB` (known servers), `pingone-mcp-inspector-LAB` (presets),
`privilege-a2a-anthropic-demo-LAB` (integrated UI), `observability-LAB` (log sources), `demo-map-LAB`,
and, for the `PINGONE_CLIENT_ID` and `PINGONE_CLIENT_SECRET` key names, `pingcli-LAB`, `pingone-events-LAB`.
This is the 2026-11-10 audit plus what the READMEs above say. No fix is invented here: each needs a repoint
inside its own repo.
