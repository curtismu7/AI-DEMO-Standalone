# AI-DEMO-Standalone

Parent repo for the standalone SE demo apps. Each app is its own repo under `ping-sandbox`, added as a git submodule under `standalone/`.

```sh
git clone --recurse-submodules https://github.com/ping-sandbox/AI-DEMO-Standalone.git
git submodule update --init --recursive
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
| intent-par-inspector-LAB | Tester | standalone/intent-par-inspector-LAB |
| ping-gateway-route-LAB | Tester | standalone/ping-gateway-route-LAB |

## Ports, and what to do if a port is taken

Each app sets its own ports. Ranges and variables are in each app's README:
- ai-gateway-client-LAB: 6880 (`PORT`)
- mcp-demo-client-privilege-LAB: 6884 (`PORT`)
- privilege-a2a-anthropic-demo-LAB: 6881-6883 (`MAIN_AGENT_PORT`, `WORKER_AGENT_PORT`, `MCP_SERVER_PORT`)
- privilege-demo-LAB: 4510 (`PORT`)
- privilege-map-LAB: 5300 dev, 5301 Docker (`PORT`, `HOST_PORT`)
- agent-mcp-door-demo-LAB: 6850-6879 (`PORT`)
- id-jag-standalone-LAB: 4720-4723 (`PORT`, and the Docker `HOST_PORT`, `AS_HOST_PORT`, `MCP_HOST_PORT`)

If a port is taken: find the process with `lsof -iTCP:<port> -sTCP:LISTEN -n -P`. Stop it if it is an old copy of the app (`kill <PID>`). Otherwise start the app on another port, using the variable above.

## Is every app on the standard? (fleet check)

```
node scripts/fleet-check.mjs            # one table for every app on the demo shelf
node scripts/fleet-check.mjs --only token-workbench,session-lab
node scripts/fleet-check.mjs --json     # same data for other tools; --strict exits 1 if any app has a problem
```

It reads the app list from the shelf registry on GitHub and shallow-clones each app, so it never relies on a local checkout (a local checkout can sit on an old branch). Per app it reports the vendored `standalone-ui.css` (canonical, stale or none, against GitHub's copy), the `check-css.sh` failures, whether `scripts/check-ui-standard.sh` exists and its pin matches, the rule 19 Mock/Real toggle, and the latest CI result on main. The toggle column is a static look at the source (a POST `/mode` route and a toggle in the UI); it does not start the app, so prove a switch in a browser. Needs `gh` signed in with access to the `ping-sandbox` repos.

## PingFederate (for apps that need it)

Some apps (for example id-jag-standalone) need a PingFederate. The setup script checks for one first. If one answers, it asks for its admin login. If none is running, it installs the official image in Docker and binds it to 127.0.0.1 only.

```sh
scripts/pingfederate-setup.sh
```

You need Docker (OrbStack or Docker Desktop) and a license file named `pingfederate.lic`, placed at `~/Documents/pingfederate.lic` (or set `PF_LICENSE_FILE`). The script asks you to accept Ping's terms before it installs.

**Default login (new local install):**
- Username: `administrator`
- Password: `2FederateM0re`

These are the official image's defaults. They're published here, so they only suit a local install bound to 127.0.0.1. Change the password for anything else.

**Agreements:** typing `YES` at the prompt (or setting `PF_ACCEPT_EULA=YES`) accepts Ping's terms for the image and PingFederate's in-product license agreement. The script accepts the in-product agreement through the admin API; it never accepts anything before you say YES.

**First admin account:** a fresh PingFederate has no admin account until a server profile creates one. The script applies Ping's public `getting-started` profile (override with `PF_SERVER_PROFILE_URL` and `PF_SERVER_PROFILE_PATH`), which creates `administrator` with the password above. The container needs internet access to GitHub for this.

**Ports:** admin console and API at https://127.0.0.1:4731, runtime at https://127.0.0.1:4732. Override with `PF_ADMIN_PORT` and `PF_ENGINE_PORT`. If a port is taken, see "Ports, and what to do if a port is taken" above.

The admin login is saved to `~/.config/demo-kit/provisioning.json` (mode 600), not to the shared `.env`.
