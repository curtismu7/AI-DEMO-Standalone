# Ping Identity — Standalone Demo Labs

70 self-contained demo apps (AI gateway, OAuth labs, MCP tooling, PingFederate/PingOne scenarios), each runnable on a Mac in minutes.

**Set up everything with one command** (full guide: [SETUP.md](SETUP.md)):

```sh
curl -fsSL https://raw.githubusercontent.com/curtismu7/AI-DEMO-Standalone/main/scripts/install.sh | bash
```

Then open the launcher: **https://local.ping-devops.com:8443**

## How it works

One command does everything on a new machine — even a bare Mac: it installs Homebrew if missing
(which brings the Xcode tools and git), then brew-installs anything missing (Node 26, gh, OrbStack),
runs `gh auth login --web` if you are not signed in, downloads all 70 demo app repos as submodules,
builds the demo shelf, and starts the launcher. The only things you provide: your Mac password,
a GitHub account (any account — the repos are public), and, for live mode, PingOne credentials.

**Live mode (optional)**: `scripts/setup.sh` asks for the worker client ID, client
secret and Administrators environment ID (mock mode: pass `--no-pingone`).

In the PingOne console's **Administrators** environment, create a **Worker** app
(Applications → + → Worker, Client Secret Basic, enabled, Organization Admin role), then enter
the region, the Administrators environment ID and that worker's client ID + secret when the
script asks. It creates a dedicated SANDBOX environment (SSO, MFA, DaVinci, Authorize), mints a
per-environment worker, and writes `~/Development/.env` (mode 600) — the one settings file every
lab reads. No other console work.

**Structure**: each app is its own repo (under the owner of this meta-repo, e.g. `curtismu7`),
added as a git submodule under `standalone/`. Init just one lab instead of all 70:

```sh
scripts/setup.sh --app id-jag-standalone-LAB --skip-install
```

| App | Tier | Repo |
| --- | --- | --- |
| ai-gateway-client-LAB | Tester | standalone/ai-gateway-client-LAB |
| privilege-a2a-anthropic-demo-LAB | Demo | standalone/privilege-a2a-anthropic-demo-LAB |
| mcp-demo-client-privilege-LAB | Demo | standalone/mcp-demo-client-privilege-LAB |
| id-jag-standalone-LAB | Demo | standalone/id-jag-standalone-LAB |
| privilege-demo-LAB | Demo | standalone/privilege-demo-LAB |
| privilege-map-LAB | Demo | standalone/privilege-map-LAB |
| agent-mcp-door-demo-LAB | Demo | standalone/agent-mcp-door-demo-LAB |
| pingfederate-LAB | Demo | standalone/pingfederate-LAB |
| customer-agent-LAB | Demo | standalone/customer-agent-LAB |
| gateway-claims-LAB | Demo | standalone/gateway-claims-LAB |
| secrets-vault-LAB | Demo | standalone/secrets-vault-LAB |
| mcp-surface-LAB | Demo | standalone/mcp-surface-LAB |
| federated-identity-LAB | Demo | standalone/federated-identity-LAB |
| ai-policies-LAB | Demo | standalone/ai-policies-LAB |
| diagram-studio-LAB | Tool | standalone/diagram-studio-LAB |
| agent-registry-demo-LAB | Demo | standalone/agent-registry-demo-LAB |
| agent-kill-switch-LAB | Demo | standalone/agent-kill-switch-LAB |
| intent-par-inspector-LAB | Demo | standalone/intent-par-inspector-LAB |
| ping-gateway-route-LAB | Demo | standalone/ping-gateway-route-LAB |
| pingone-LAB | Demo | standalone/pingone-LAB |
| jev-lab-LAB | Demo | standalone/jev-lab-LAB |
| obo-lab-LAB | Demo | standalone/obo-lab-LAB |
| jit-lab-LAB | Demo | standalone/jit-lab-LAB |
| mcp-resource-server-LAB | Tool | standalone/mcp-resource-server-LAB |
| mcp-tools-LAB | Tester | standalone/mcp-tools-LAB |
| hostile-mcp-LAB | Demo | standalone/hostile-mcp-LAB |
| hostile-a2a-LAB | Demo | standalone/hostile-a2a-LAB |
| cimd-LAB | Demo | standalone/cimd-LAB |
| deploy-test-LAB | Demo | standalone/deploy-test-LAB |
| pingone-signin-LAB | Demo | standalone/pingone-signin-LAB |
| ai-guard-sidecar-LAB | Demo | standalone/ai-guard-sidecar-LAB |
| attack-gallery-LAB | Tester | standalone/attack-gallery-LAB |
| mcp-auth-conformance-LAB | Demo | standalone/mcp-auth-conformance-LAB |
| mcp-discovery-LAB | Tester | standalone/mcp-discovery-LAB |
| no-tool-no-promise-LAB | Demo | standalone/no-tool-no-promise-LAB |
| p1-third-party-exchange-LAB | Demo | standalone/p1-third-party-exchange-LAB |
| personal-agent-demo-LAB | Demo | standalone/personal-agent-demo-LAB |
| token-workbench-LAB | Demo | standalone/token-workbench-LAB |
| worker-demo-LAB | Demo | standalone/worker-demo-LAB |
| session-LAB | Demo | standalone/session-LAB |
| poppy-agent-tester-LAB | Demo | standalone/poppy-agent-tester-LAB |
| intent-purpose-behaviour-LAB | Demo | standalone/intent-purpose-behaviour-LAB |
| coding-agents-LAB | Demo | standalone/coding-agents-LAB |
| data-protection-LAB | Demo | standalone/data-protection-LAB |
| saas-access-LAB | Demo | standalone/saas-access-LAB |
| agent-governance-LAB | Demo | standalone/agent-governance-LAB |
| p1az-inspector-LAB | Tester | standalone/p1az-inspector-LAB |
| agent-gateway-inspector-LAB | Tester | standalone/agent-gateway-inspector-LAB |
| pingone-mcp-inspector-LAB | Tester | standalone/pingone-mcp-inspector-LAB |
| agent-audit-trail-LAB | Demo | standalone/agent-audit-trail-LAB |
| progressive-trust-ladder-LAB | Demo | standalone/progressive-trust-ladder-LAB |
| chatgpt-mcp-flow-LAB | Demo | standalone/chatgpt-mcp-flow-LAB |
| mock-authorize-LAB | Tester | standalone/mock-authorize-LAB |
| stolen-token-LAB | Demo | standalone/stolen-token-LAB |
| mcp-elicitation-LAB | Demo | standalone/mcp-elicitation-LAB |
| agentcore-pingone-demo-LAB | Demo | standalone/agentcore-pingone-demo-LAB |
| muse-LAB | Demo | standalone/muse-LAB |
| meridian-a2a-hop-LAB | Demo | standalone/meridian-a2a-hop-LAB |
| ping-services-stub-LAB | Tester | standalone/ping-services-stub-LAB |
| demo-shelf-LAB | Demo | standalone/demo-shelf-LAB |
| ciba-hitl-lab | Demo | standalone/ciba-hitl-lab |
| gateway-suite-LAB | Demo | standalone/gateway-suite-LAB |
| agent-preferences-lab | Demo | standalone/agent-preferences-lab |
| a2a-lab-LAB | Demo | standalone/a2a-lab-LAB |
| delegation-lab-LAB | Demo | standalone/delegation-lab-LAB |
| demo-field-guide-LAB | Tool | standalone/demo-field-guide-LAB |
| diagram-prove-lab | Tool | standalone/diagram-prove-lab |
| hitl-mfa-lab-LAB | Demo | standalone/hitl-mfa-lab-LAB |
| idjag-runner-LAB | Tester | standalone/idjag-runner-LAB |
| mcp-gateway-lab-LAB | Demo | standalone/mcp-gateway-lab-LAB |
| ping-shared (infra) | Rule 20 shared Ping products it runs itself: PingFederate, a minimal PingGateway, the CIMD server | shared/ping-shared |

## One domain for demo users (lab-proxy)

All apps are reached through ONE domain, already in `/etc/hosts` - never `127.0.0.1`, and never new hosts entries:

- `https://local.ping-devops.com:8443` - the shelf (launcher)
- `https://local.ping-devops.com:8443/<app>/` - each app, e.g. `/pingone-lab/`, `/ciba-hitl-lab/`

The shared lab-proxy (`shared/lab-proxy/`) routes by a `lab` cookie into each app's Docker compose network; `scripts/lab-proxy-watchdog.sh` attaches the proxy to each running app's network (setup, `setup.sh update`, and its launchd agent every 5 min), so an app appears once its compose stack is up. Adding an app to the proxy = one entry location + two cookie-map lines in `shared/lab-proxy/nginx.conf`.

## Ports, and what to do if a port is taken

Each app sets its own ports; ranges and variables are in each app's README. Default host ports (from the shelf registry and each app's compose file):

| App | Default port | Variable / notes |
| --- | --- | --- |
| a2a-lab-LAB | 7700 | `HOST_PORT` |
| agent-audit-trail-LAB | 6600 | `HOST_PORT`; range 6600-6649. **Same default as meridian-a2a-hop-LAB** |
| agent-gateway-inspector-LAB | 5850 | see the app README |
| agent-governance-LAB | 7300 | see the app README |
| agent-kill-switch-LAB | 6550 | see the app README |
| agent-mcp-door-demo-LAB | 6850-6879 | `PORT` |
| agent-preferences-lab | 7660 | see the app README |
| agent-registry-demo-LAB | 5010 | see the app README |
| agentcore-pingone-demo-LAB | 7601 | `HOST_PORT`; range 7601-7649 |
| ai-gateway-client-LAB | 6880 | `PORT` |
| ai-guard-sidecar-LAB | 6500 | see the app README |
| ai-policies-LAB | 7500 | see the app README |
| attack-gallery-LAB | 5181 | see the app README |
| chatgpt-mcp-flow-LAB | 6650 | see the app README |
| ciba-hitl-lab | 7580 | see the app README |
| cimd-LAB | 5250 | see the app README |
| coding-agents-LAB | 7150 | see the app README |
| customer-agent-LAB | 5600 | see the app README |
| data-protection-LAB | 7200 | see the app README |
| delegation-lab-LAB | 7690 | `HOST_PORT`; range 7690-7699 |
| demo-field-guide-LAB | 7590 | see the app README |
| demo-shelf-LAB | 4400 | see the app README |
| deploy-test-LAB | 5590 | see the app README |
| diagram-prove-lab | 7710 | `HOST_PORT` |
| diagram-studio-LAB | 6001 | see the app README |
| federated-identity-LAB | 7400 | see the app README |
| gateway-claims-LAB | 5150 | see the app README |
| gateway-suite-LAB | 5750 | `HOST_PORT`; range 5750-5759 |
| hitl-mfa-lab-LAB | 7680 | `HOST_PORT`; range 7680-7689 |
| hostile-a2a-LAB | 4750 | see the app README |
| hostile-mcp-LAB | 4701 | see the app README |
| id-jag-standalone-LAB | 4720-4723 | `PORT`; Docker `HOST_PORT`, `AS_HOST_PORT`, `MCP_HOST_PORT` |
| idjag-runner-LAB | 4780 | `HOST_PORT` |
| intent-par-inspector-LAB | 4771 | see the app README |
| intent-purpose-behaviour-LAB | 7100 | see the app README |
| jev-lab-LAB | 7550 | see the app README |
| jit-lab-LAB | 7570 | see the app README |
| mcp-auth-conformance-LAB | 4901 | see the app README |
| mcp-demo-client-privilege-LAB | 6884 | `PORT` |
| mcp-discovery-LAB | 5310 | see the app README |
| mcp-elicitation-LAB | 6800 | see the app README |
| mcp-gateway-lab-LAB | 7670 | `HOST_PORT`; range 7670-7679 |
| mcp-resource-server-LAB | 8081 | see the app README |
| mcp-surface-LAB | 7350 | see the app README |
| mcp-tools-LAB | 4810 | also serves mcp-scanner |
| meridian-a2a-hop-LAB | 6600 | `HOST_PORT`. **Same default as agent-audit-trail-LAB** |
| mock-authorize-LAB | 4850 | see the app README |
| muse-LAB | 5100 | see the app README |
| no-tool-no-promise-LAB | 5350 | see the app README |
| obo-lab-LAB | 7560 | see the app README |
| p1-third-party-exchange-LAB | 5200 | see the app README |
| p1az-inspector-LAB | 4840 | see the app README |
| personal-agent-demo-LAB | 6900 | see the app README |
| ping-gateway-route-LAB | 5050 | see the app README |
| ping-services-stub-LAB | 6300 | see the app README |
| pingfederate-LAB | 5400 | see the app README |
| pingone-LAB | 5500 | see the app README |
| pingone-mcp-inspector-LAB | 5201 | see the app README |
| pingone-signin-LAB | 6171 | see the app README |
| poppy-agent-tester-LAB | 5450 | see the app README |
| privilege-a2a-anthropic-demo-LAB | 6881-6883 | `MAIN_AGENT_PORT`, `WORKER_AGENT_PORT`, `MCP_SERVER_PORT` |
| privilege-demo-LAB | 4510 | `PORT` |
| privilege-map-LAB | 5300 dev, 5301 Docker | `PORT`, `HOST_PORT` |
| progressive-trust-ladder-LAB | 6211 | see the app README |
| saas-access-LAB | 7250 | see the app README |
| secrets-vault-LAB | 7450 | see the app README |
| session-LAB | 6890 | see the app README |
| stolen-token-LAB | 4950 | see the app README |
| token-workbench-LAB | 5910 | see the app README |
| worker-demo-LAB | 6700 | see the app README |

Two apps share a default: **agent-audit-trail-LAB and meridian-a2a-hop-LAB both use 6600**, so they cannot run together unless one is started with another `HOST_PORT`.

New apps get one port each from 7800-7999: run `npm run ports -- --next` in demo-shelf-LAB, then register the app in its `data/demos.json`. Existing apps keep the ports in the table above.

If a port is taken: find the process with `lsof -iTCP:<port> -sTCP:LISTEN -n -P`. Stop it if it is an old copy of the app (`kill <PID>`). Otherwise start the app on another port, using the variable above.

## Is every app on the standard? (fleet check)

```
node scripts/fleet-check.mjs            # one table for every app on the demo shelf
node scripts/fleet-check.mjs --only token-workbench,session-lab
node scripts/fleet-check.mjs --json     # same data for other tools; --strict exits 1 if any app has a problem
```

It reads the app list from the shelf registry on GitHub and shallow-clones each app, so it never relies on a local checkout (a local checkout can sit on an old branch). Per app it reports the vendored `standalone-ui.css` (canonical, stale or none, against GitHub's copy), the `check-css.sh` failures, whether `scripts/check-ui-standard.sh` exists and its pin matches, the rule 19 Mock/Real toggle, and the latest CI result on main. The toggle column is a static look at the source (a POST `/mode` route and a toggle in the UI); it does not start the app, so prove a switch in a browser. Needs `gh` signed in with access to the repos under this meta-repo owner.

## PingFederate (for apps that need it)

Some apps (for example id-jag-standalone) need a PingFederate. The setup script checks for one first. If one answers, it asks for its admin login. If none is running, it installs the official image in Docker and binds it to 127.0.0.1 only.

The shared `ping-shared` project (`shared/ping-shared`) runs the same PingFederate as a compose service and is what `scripts/bootstrap.sh` starts. It owns it: nothing depends on AI-DEMO2. It needs the same licence file, and it never accepts Ping's terms for you. With no licence file, setup prints `PingFederate skipped: no licence file at <path>` and carries on; the labs' Mock mode needs no PingFederate. `shared/ping-shared/scripts/ping-shared.sh up pingfederate` starts it by hand (it asks for the YES), and one instance per host is kept: a PingFederate already running on 4732 is reused. See `shared/ping-shared/README.md`.

Setup also offers ping-shared's minimal PingGateway when `shared/ping-shared/.env` has `GATEWAY_ISSUER` and `GATEWAY_AUDIENCE`: it reuses a healthy one, otherwise asks y/N (default N) and never starts it in a non-interactive or dry run. What each lab needs for Real (PingOne, PingFederate, a gateway, owner-only) and which labs are not yet standalone: `docs/REAL-PREREQUISITES.md`, also printed at the end of setup.

```sh
scripts/pingfederate-setup.sh
```

You need Docker (OrbStack or Docker Desktop) and a license file named `pingfederate.lic`, placed at `~/.config/demo-kit/pingfederate.lic` (or set `PF_LICENSE_FILE`). The script asks you to accept Ping's terms before it installs.

**Image and container:** the script installs `pingidentity/pingfederate:13.1.3-latest` (override with `PF_IMAGE`) in a container named `id-jag-kit-pf`. If a container named `pingfederate-lab` exists from an earlier version, it reuses that one and never creates a second PingFederate. Override the name with `PF_CONTAINER`.

**Default login (new local install):**
- Username: `administrator`
- Password: `2FederateM0re`

These are the official image's defaults. They're published here, so they only suit a local install bound to 127.0.0.1. Change the password for anything else.

**Agreements:** typing `YES` at the prompt (or setting `PF_ACCEPT_EULA=YES`) accepts Ping's terms for the image and PingFederate's in-product license agreement. The script accepts the in-product agreement through the admin API; it never accepts anything before you say YES.

**First admin account:** a fresh PingFederate has no admin account until a server profile creates one. The script applies Ping's public `getting-started` profile (override with `PF_SERVER_PROFILE_URL` and `PF_SERVER_PROFILE_PATH`), which creates `administrator` with the password above. The container needs internet access to GitHub for this.

**Ports:** admin console and API at https://127.0.0.1:4731, runtime at https://127.0.0.1:4732. Override with `PF_ADMIN_PORT` and `PF_ENGINE_PORT`. If a port is taken, see "Ports, and what to do if a port is taken" above.

The admin login is saved to `~/.config/demo-kit/provisioning.json` (mode 600), not to the shared `.env`.
