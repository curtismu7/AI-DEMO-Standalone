# Local Docker AI gateway: what PingOne needs, then the install

> **Optional, and not used in our setup.** On 2026-11-23 we dropped the local Docker gateway and use only the hosted shared gateways (`mcpgw-cm-pool1`, `mcpgw-ct-pool2`). What we learned: it enrolled and authorised keyed calls fine, but a door whose backend is a cluster-internal address cannot be reached from Docker (500, see "Problems we hit"), and whether a separate Cluster ID changes that was never tested (the second token was not generated). Use this guide only if you need a gateway on your own machine, for doors whose backend that machine can reach.

For: a colleague who wants a PingOne Privilege AI gateway running on their own Mac (Docker Desktop or OrbStack) or Linux box. It builds on Ping's "Configuring a Local AI Gateway with Docker" (`~/Downloads/docker-local-ai-gateway.md`), adds the PingOne side that guide assumes, and records what went wrong when we did it. The cluster gateways and the whole environment rebuild are in `SETUP-Privilege-gateway-GUIDE.md`.

## Part 1: what PingOne must have first

The install in Part 2 fails in confusing ways if any of these is missing. Each row says how to check it. The scripts are in `scripts/` and are safe to re-run.

| # | Requirement | Why | Check | Script / console |
|---|---|---|---|---|
| 1 | A PingOne environment with **PingOne Privilege** enabled, created **by a person in the console** | Only the creator gets the PingOne Privilege Administrator role (read-only), and nobody can grant it later. An API-created environment has no Privilege admin and a half-built tenant | Overview → the Privilege card exists; you can open the Privilege console | Guide 1, Step 1 (console) |
| 2 | Privilege service in **agent mode with gateway features**: product tag `AUTHENTICATION_MODE_AGENT` and tenant profile `AgentLess: true` | Without `AgentLess: true` the console has no **Directory → Nodes** page. A tenant created straight in agent mode comes out `false`; create it in *No Endpoint Controller* mode, then switch to agent mode (or flip the tag AGENTLESS → AGENT once) | Privilege console → Directory → **Nodes** exists | `step11_validate.py` ("AgentLess=true") |
| 3 | **Users** in the environment, in a group the Privilege app allows (we use `PrivilegeAdmins`), with a password | Privilege only knows users of its own environment who are in that group; a sign-in through the gateway for anyone else is refused | Privilege console users == group members | `step03_copy_users.py`, `step04b_local_admin.py` |
| 4 | Your admin login holds **Identity Data Admin** and **PingOne Privilege Administrator** on that environment | Identity Data Admin shows the Users page; Privilege Administrator opens the Privilege console and Nodes | Admin console → your user → Roles | `step04_admins_and_app.py` |
| 5 | A default **sign-on policy** (`Single_Factor`) | An API-made environment has none; every app sign-in (including the gateway's) then fails with "unexpected error" | `GET /signOnPolicies` shows one `default: true` | `step05_signon_policies.py` |
| 6 | The environment's **one shared OIDC app, "PingOne Privilege"** (Code, Authorization Code, Client Secret Post, grant on the `openid` resource for `openid profile email`, enabled) with **this gateway's redirect** `https://<gateway host>/callback` in its redirect URIs | Every gateway signs users in through that one app (same client id and secret); the only per-gateway setting is the redirect, which must equal the gateway's server URL host plus `/callback`, character for character. **Do not create a second app per gateway**: it only adds a secret to keep and rotate (we had one, "Local AI Gateway", and deleted it on 2026-11-23, nothing used it) | `step11_validate.py`, or sign-in works in Part 2, Step 5 | `step12_gateway_redirect.py --host <gateway host>` |
| 7 | Privilege **tenant MFA off** (`EnableMFA: false`) until PingID or PingOne MFA is set up and tested | A tenant with MFA on and no working second factor locks the desktop agent and its console out, and only Ping can switch it off again | `step11_validate.py` ("tenant MFA off") | `step10_tenant_profile.py` only for diagnosis; Privilege ignores edits to the profile |
| 8 | The tenant's PingOne **sign-in settings**: `IdpType: Ping`, OIDC domain `https://auth.pingone.com/<env id>/as`, client = the environment's *PingOne Privilege* app | Privilege uses these to sync users and groups from PingOne | `step11_validate.py` | Set by Privilege when it provisions |

Run `python3 -I scripts/step11_validate.py` to check items 1–5, 7 and 8 in one go. Item 6 is checked by Step 5 below.

If you use the PingOne API as an admin, remember a role can only be granted by someone who holds it. The worker that makes everything else cannot grant PingOne Privilege Administrator.

## Part 2: install

Ports 8623, 8680 and 8690 must be free. The gateway image is `public.ecr.aws/s7q1z8z4/privilege-aigw` (use the tag from the console's generated command; `v1.261120` is the newest we have run).

### Step 1: register the gateway on the shared OIDC app (no new app)
Decide the gateway's host name first; it is the host of its `SERVER_URL` (for example `localhost:8623`, or a name such as `pingid-gw.local.ping-devops.com` that your hosts file points at 127.0.0.1). Then add `https://<that host>/callback` to the shared app's redirect URIs:

```bash
python3 -I scripts/step12_gateway_redirect.py --host <gateway host> [--dry-run]
```

It backs up the app, adds the one redirect (whole-object PUT), reads it back and checks the `openid` grant. By hand: PingOne → Applications → **PingOne Privilege** → Configuration → add the redirect URI. The client id and secret the gateway needs are that app's own: `step08_gateway_values.py` writes them, with the three endpoint URLs and scopes, to `~/.config/demo-kit/rebuild-gw/local-pingone.env` (mode 600); without the rebuild scripts, copy them from the app in the PingOne console. Never create a separate "local gateway" app.

### Step 2: register the node (Privilege console)
Open the Privilege console as your admin (Overview card → **Privileged Access Management**; the local console is `https://local.procyon.ai:8643/ui/` while the desktop agent is paired). Go to **Directory → Nodes → Add New → Add via Docker → AI GW**, then fill in:
- **Cluster ID**: a unique name, for example `my-local-aigw`. It cannot be changed afterwards.
- **Host IP**: `127.0.0.1`.
- **AI Gateway Server URL**: `https://localhost:8623`.
- **OIDC client id / secret / auth / token / user URLs** and **User ID Claim `sub`**: the shared app's values from Step 1 (the same ones the cluster gateways use).

Click **Get Docker Command**, then **Copy Docker Command**. The registration token inside it lasts about two hours, is single-use, and must not contain stray spaces. Never paste it into chat, a repo or a log.

### Step 3: run the container
Run the copied command. On a Mac, swap `--net=host` for `-p 8623:8623 -p 8680:8680 -p 8690:8690` and keep the files under `~/pingidentity-local` (`config`, `ssl`, `logs`, `recordings`). Start with `/procyon/bin/mcpgw -mcpconfpath /procyon/config/pingone.env -hostname 127.0.0.1`. The config file holds `SERVER_URL`, `OIDC_*` and `USER_ID_CLAIM`.

### Step 4: TLS
Without a certificate in the SSL folder the gateway serves plain HTTP, which clients reject. Create a self-signed one and restart:

```bash
openssl req -x509 -newkey rsa:2048 -keyout ~/pingidentity-local/ssl/aigw-key.pem \
  -out ~/pingidentity-local/ssl/aigw-cert.pem -days 825 -nodes \
  -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
docker restart privilege-aigw
```

The log must say `MCP Gateway starting in TLS mode on :8623`.

### Step 5: verify
- The log is a file, not the container console: `tail -f ~/pingidentity-local/logs/cyonproxy.log`. `docker logs` stays empty.
- **Directory → Nodes** shows the gateway with status **Success** within about 30 seconds, and the log has `Node <id> established command stream`.
- `curl -ski https://localhost:8623/.well-known/openid-configuration` answers **401** with `authorization_uri`, `token_uri` and `resource_metadata`.
- Open `https://localhost:8623/` in a private browser window and sign in as a `PrivilegeAdmins` user. That exercises the OIDC app from row 6.

## Problems we hit (and what they meant)
| Symptom | Cause | Fix |
|---|---|---|
| No **Directory → Nodes** page | Tenant profile `AgentLess: false` | Flip the Privilege tag to `AUTHENTICATION_MODE_AGENTLESS`, wait about a minute, flip it back to `AUTHENTICATION_MODE_AGENT`; the profile keeps `AgentLess: true` |
| Edits to the tenant profile "succeed" but nothing changes | Privilege resets provisioning-owned fields | Change the product tag instead |
| Container restarts, `Error getting proxy cert ... "not found"` | Token for another tenant, expired, spent, or copied with spaces | Generate a new command, copy the token exactly, remove the old container and its `ssl` files first |
| Sign-in says "unexpected error" | No default sign-on policy | `step05_signon_policies.py` |
| Sign-in returns `redirect_uri` error | The app's redirect differs from the gateway's server URL | Make them equal |
| Desktop agent shows "Failed to initiate MFA verification" | The agent fell back to another tenant that has MFA on | Set the preferred tenant to the new environment (`POST 127.0.0.1:8008/setpreftenant {"Tenant":"<env id>"}`), then Connect |
| `has same NodeURL ... misconfigured Node` | Expected with `127.0.0.1` | Ignore if the node shows Success |
| A keyed door call returns **500** and the log says `Failed to dial ... .svc.cluster.local ... lookup ... server misbehaving` | Doors are tenant-wide, so the local gateway can authorise any door, but a door whose backend is a cluster-internal address cannot be reached from Docker (seen 2026-11-23 on `lab-banking-full`, token Cluster ID `ai-demo-cmuir`) | Use doors whose backend the Mac can reach (for example `host.docker.internal`). Whether a separate Cluster ID for the local node changes the routing is not tested yet |
| Two OIDC apps for one gateway | An older version of step 12 created a per-gateway app | Keep only the shared "PingOne Privilege" app; check nothing uses the extra one (client id in repos, Helm values, container env), back up its definition, then delete it |
| 8680 and 8690 give no HTTP answer | Internal mesh ports | Expected |
