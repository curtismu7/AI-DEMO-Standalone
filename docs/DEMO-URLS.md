# Demo URLs — what to open, and what each one is for

Everything runs on this machine. Two doorways:

- **Domain doorway** — `https://local.ping-devops.com:8443/<route>/` — served by the shared lab-proxy; works in any browser on this Mac, no `/etc/hosts` entries.
- **AI-DEMO2** — `https://local.ping-devops.com:4000/...` — the main Super Banking demo (sign in as `demouser` / `Baseball123!` unless noted).

Status column: ✅ verified answering during the last sweep (2026-11-06), ❌ proxied but nothing is listening (502), ⚠️ route exists but the lab refused a plain probe (Host check / stopped container / needs its own sign-in) — open it in the browser before assuming it is down.

---

## Start here

| URL | What it is |
|---|---|
| `https://local.ping-devops.com:8443/demo-shelf` | **The shelf** — one card per demo with Start / Stop / Open buttons, tag filters and search. If you only bookmark one URL, bookmark this. |
| `https://local.ping-devops.com:8443/learning-hub/` | **Learning Hub** — the docs/glossary pack behind the demos. |

## The ID-JAG path (this week's work)

| URL | What it is |
|---|---|
| ✅ `https://local.ping-devops.com:8443/idjag-runner/` | **Tarun ID-JAG Runner** — run the ID-JAG (cross-app access) demo without Postman: password grant, RFC 8693 exchange (three subject variants), jwt-bearer redeem, introspection, four refusal cases, JWKS inspector, flow diagram. Sign in: `demouser`, password only (`Baseball123!`); demo clients pre-filled. One-liner for any other machine: `curl -fsSL https://raw.githubusercontent.com/curtismu7/idjag-runner-LAB/main/scripts/remote-install.sh \| bash` |
| `https://local.ping-devops.com:8443/id-jag-kit` | The id-jag-kit playground (standalone ID-JAG kit UI; upstream of the runner). |
| `https://local.ping-devops.com:4000/pingfederate-id-jag/runner` | **AI-DEMO2 page** introducing the Runner Lab (CTA + the four acts, each naming the authorization server). |
| `https://local.ping-devops.com:4000/pingfederate-id-jag` | AI-DEMO2's ID-JAG explainer. |
| `https://local.ping-devops.com:4000/pingfederate-id-jag/playground` | AI-DEMO2's ID-JAG playground (issue + validate ID-JAGs against oauth-mcp or PF-PF). |
| `https://local.ping-devops.com:4000/pingfederate-id-jag/learn` | Glossary + source library for ID-JAG terms. |
| `https://local.ping-devops.com:4000/pingfederate-id-jag/inspect` | Paste any token, see the spec checks. |

## PingFederate / PingOne product labs

| URL | What it is |
|---|---|
| ✅ `https://local.ping-devops.com:8443/pingfederate-lab/` | One card per PingFederate feature: pi.flow sign-in, DCR, RAR+PAR, CIBA, DPoP, token exchange (act), PKCE + a Protocol Playground. Drives a real PF. |
| ⚠️ `https://local.ping-devops.com:8443/pingone-lab` | The PingOne twin: pi.flow, PKCE, PAR, JAR, CIBA poll, device authorization, token exchange. |
| ⚠️ `https://local.ping-devops.com:8443/pingone-signin-lab/` | Sign-in behaviour lab: failures, lockout, replay, MFA step-up (RFC 9470), CIBA with a mock phone. |
| ✅ `https://local.ping-devops.com:8443/pingone-mcp-inspector/` | Inspect PingOne MCP calls (needs its own sign-in, hence the probe status). |
| ✅ `https://local.ping-devops.com:8443/p1az-inspector/` | Send decisions to PingOne Authorize, see verdicts + statements + the exact call (offline and live tabs). |

## Agent security labs

| URL | What it is |
|---|---|
| ✅ `https://local.ping-devops.com:8443/gateway-claims/` | What the agent gateway added: nested-claim gate (`act.sub` via RequiredClaims) and gateway posture view. |
| ✅ `https://local.ping-devops.com:8443/gateway-suite/` | AI Gateway demo suite: end-to-end agent relay with AI Guard block traces + remote MCP with OAuth. |
| ⚠️ `https://local.ping-devops.com:8443/token-workbench/` | Decode/trace a token, test wrong-token rejection against stub authorization servers. |
| ⚠️ `https://local.ping-devops.com:8443/agent-kill-switch/` | Kill-switch lab: revoke an agent's access mid-session and watch it lose access. |
| ✅ `https://local.ping-devops.com:8443/hostile-mcp/` | A hostile MCP server vs a governed client — tool poisoning, exfil attempts, side-by-side. |
| `https://local.ping-devops.com:8443/mcp-scanner/` | MCP security scanner lab. |
| ✅ `https://local.ping-devops.com:8443/ai-guard-sidecar/` | AI Guard sidecar: request inspection and blocking in front of an agent. |
| ✅ `https://local.ping-devops.com:8443/agent-registry-demo/` | Agent registry: registering agents, credentials, scoping. |
| ⚠️ `https://local.ping-devops.com:8443/agent-kill-switch/` | (see above) |
| `https://local.ping-devops.com:8443/obo-lab/`, `.../jit-lab/`, `.../jev-lab/` | On-behalf-of, just-in-time access, and JSON event verification labs. |
| ✅ `https://local.ping-devops.com:8443/agentcore-pingone/` | Bedrock AgentCore + PingOne M2M / user-federation leg. |

## Identity / protocol labs

| URL | What it is |
|---|---|
| ✅ `https://local.ping-devops.com:8443/cimd-lab/` | CIMD (client_id metadata documents) both ways against real PingFederate. |
| ✅ `https://local.ping-devops.com:8443/ciba-hitl-lab/` | CIBA + human-in-the-loop walkthrough (24 steps, Simulate walk-through). |
| ✅ `https://local.ping-devops.com:8443/data-protection/` | Data-protection patterns lab. |
| ✅ `https://local.ping-devops.com:8443/intent-purpose-behaviour/` | Intent / purpose / behaviour binding lab. |
| ✅ `https://local.ping-devops.com:8443/saas-access/` | SaaS access patterns lab. |
| ⚠️ `https://local.ping-devops.com:8443/meridian-a2a-hop/` | A2A hop with Privilege doors (Meridian vertical). |
| ✅ `https://local.ping-devops.com:8443/hitl-mfa-lab/` | HITL + MFA lab. |
| ✅ `https://local.ping-devops.com:8443/agentcore-pingone/` | (see above) |

## Agent experience demos

| URL | What it is |
|---|---|
| ✅ `https://local.ping-devops.com:8443/agent-connect/` | Agent Connect (CIMD-based sign-in front end). |
| ✅ `https://local.ping-devops.com:8443/gateway-suite/` | (see above) |
| `http://127.0.0.1:5100` | **Muse** — the airline personal agent (host-run, not proxied). |
| ✅ `https://local.ping-devops.com:8443/customer-agent/` | Customer agent lab. |
| ⚠️ `https://local.ping-devops.com:8443/ai-gateway-client/` | AI gateway client demo. |
| ✅ `https://local.ping-devops.com:8443/no-tool-no-promise/` | "No tool, no promise" — what an agent claims vs what it can actually do. |

## AI-DEMO2 main demo (the big one)

| URL | What it is |
|---|---|
| `https://local.ping-devops.com:4000` | **Super Banking demo** — the full reference implementation (PingOne + PingFederate + MCP + agents). Sign in `demouser` / `Baseball123!`. |
| `https://local.ping-devops.com:4000/pingfederate-id-jag/runner` | (see ID-JAG path above) |
| `http://127.0.0.1:16686` | Jaeger — distributed traces for the AI-DEMO2 stack. |

## Privilege, gateway and MCP labs (added 2026-11-06 sweep)

| URL | What it is |
|---|---|
| ✅ `https://local.ping-devops.com:8443/mcp-gateway-lab/` | **MCP Gateway Lab** — a third-party weather MCP server scoped at the gateway with a live, admin-editable state-scope policy; the backend never sees the restriction. |
| ✅ `https://local.ping-devops.com:8443/privilege-a2a/` | **Privilege A2A** (Anthropic) — main agent, worker agent and MCP server in one compose; the Access Review demo. |
| ✅ `https://local.ping-devops.com:8443/mcp-demo-client/` | **MCP Demo Client for Privilege** — chat client that drives a Privilege-fronted MCP server (offline mode by default). |
| ✅ `https://local.ping-devops.com:8443/privilege-demo/` | **Privilege demo** — a policy enforcement point: an agent's MCP tool calls are checked against Cedar policies and allowed, denied or held for approval. |
| ⚠️ `https://local.ping-devops.com:8443/privilege-map/` | **Privilege Map** — ReactFlow diagrams and feature cards for Federated Identity (agent access keys, the five gateway checks). Answered 421 (Host check) on the probe. |
| ⚠️ `https://local.ping-devops.com:8443/mcp-discovery/` | **MCP Discovery** — read-only discovery of MCP servers, tool-metadata probing, poisoned-metadata flags, scan diff. Answered 421 (Host check) on the probe. |
| ✅ `https://local.ping-devops.com:8443/jev-lab/` | **JEV Decision Model** (D113). |
| ✅ `https://local.ping-devops.com:8443/jit-lab/` | **JIT Ephemeral Credentials** (D112). |
| ❌ `https://local.ping-devops.com:8443/triton/` | Triton — proxied to host port 8597; answered 502 (nothing listening). Start it before opening. |

## Tools / infrastructure

| URL | What it is |
|---|---|
| ✅ `https://local.ping-devops.com:8443/demo-shelf` | (see Start here) |
| ✅ `https://local.ping-devops.com:8443/learning-hub/` | (see Start here) |
| `http://127.0.0.1:4405` | The shelf **start agent** API (loopback-only, token-authed) — the shelf uses it to start/stop labs; not for browsers. |
| ✅ `https://local.ping-devops.com:8443/coding-agents/` | Coding-agents lab (needs its own sign-in). |
| ✅ `https://local.ping-devops.com:8443/deploy-test/` | Deployment test target. |

---

## Notes

- **PingFederate itself**: the SE US K8s tenant the ID-JAG lab drives is `https://cmuir-pf-acme.ping-devops.com` (public; the `idjag-*` demo objects live there). The local AI-DEMO2 PF is at `http://127.0.0.1:9031` (runtime) / `http://127.0.0.1:9999` (admin console), started separately via `scripts/pingfederate/docker-compose.local.yml`.
- **All loopback-only.** Every lab publishes on `127.0.0.1:` — nothing here is reachable from the network, by design (typed secrets rule).
- **Anything 403/421**: that lab's own Host check or sign-in, not the proxy. Open it in a browser; if it still refuses, check its container: `docker ps | grep <name>`.
- **Anything 502**: that lab's container is stopped — start it from the shelf card or `cd ~/Development/AI-DEMO-Standalone/standalone/<lab> && docker compose up -d`.
- **The shelf is the source of truth for what is installed**: it reads `.data/demos.local.json`; `npm run doctor` inside `demo-shelf-LAB` validates it.
- The **"Restore last set"** button on the shelf (new, PR #2) restarts the demos that were running before the last machine restart; `scripts/setup.sh --start-top <n>` does it from bootstrap.
