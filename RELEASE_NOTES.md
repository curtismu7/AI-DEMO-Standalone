# Release notes

What changed in the standalone labs. The newest entry is on top; the shelf shows
the latest entry when a new one appears after your last visit.

Format: the shelf compares the version in `VERSION` (repo root) against what the
user last dismissed. Add a NEW `## <version>` heading at the top of the list below
whenever you bump VERSION; never edit an old entry.

## Version semantics
- **MAJOR** (2.1 -> 3.0): breaking — new setup requirements, PingOne tenant changes, lab removals. Users MUST re-run setup.
- **MINOR** (2.0 -> 2.1): new labs, new features, notice-worthy improvements. Opens the What's-new panel.
- Fixes that need no user action: no VERSION bump, no panel — just commit.

## How to release
1. Update VERSION (repo root), e.g. `2.1` -> `2.2`
2. Add a `## 2.2` heading at the TOP of the list below with the changes
3. Update UPDATES.md's notice text (or empty it)
4. Commit + push — every shelf picks it up within 5 minutes

<!-- SHELF RELEASES BELOW — newest first, one "## version" heading per release -->

## 2.12 (2026-11-12)

**New lab**
- ai-demo-standalone-lab (Demo, port 7810): the AI Demo standalone - the AI-DEMO2 dashboard as a standalone lab. All 87 use cases in one catalog; 31 run in-app against the mock PDP (token, gateway, policy, HITL obligations) covering foundations, attacks (token theft, takeover, bad client), controls (overscoped tokens, gateway search filter, public tools), HITL (step-up, consent, CIBA) and A2A hand-off; the rest open their shelf lab. Evidence views (chain map, token cards, demo hops, receipts), a scripted assistant, a talk track and a Quick Config dialog. Hardened with a real-browser e2e in CI and a Docker smoke.

## 2.11 (2026-11-11)

**New labs**
- pf-privilege-obo-lab (Demo, port 7812): the simulated PingFederate to Privilege on-behalf-of chain - user SSO, RFC 8693 token exchange (sub = user, act.sub = agent), the Privilege federated-identity check, grant tiers, an Active Cedar policy and Pass Agent Token passthrough - as an interactive flow walk with eight scenarios and a twelve-card issues panel of measured traps and fixes.

## 2.10 (2026-11-10)

**New labs**
- privilege-k8-kits (Tool, port 7809): download hub for the Agent Privilege Gateway Kubernetes deployment kits — the single-gateway quick-start package and the multi-gateway HA package, plus the shared deployment guide.

## 2.9 (2026-11-10)

**Improved**
- Shelf banners fold: a closed What's new panel or Updates banner now folds to a one-line strip with a Show button instead of disappearing. Show re-opens it for that visit only; a new release or a new lab opens the full panel again. The fold is remembered across visits (same localStorage keys as before).
- Ports reserved: demo-map-lab on 7808, ping-shared's PingGateway on 7809.
- pingone-setup: clearer guidance when the worker lacks an Organization Admin role (early probe plus an ACCESS_FAILED hint).

## 2.8 (2026-11-10)

**New labs**
- demo-map: a one-page map of the demo family. A row for the Personal Agent demo, the Digital Worker agent and each Ping product (PingOne, PingFederate, PingGateway, Privilege, Authorize, Protect), with the shelf's apps that belong in it and the AI-DEMO2 pages for it. Mock uses a made-up sample; Real reads your local shelf.

**Improved**
- The shelf has a PingOne Protect tag, and the apps that use PingOne Authorize or PingOne Protect now carry them (Muse, Personal Agent Flow, Customer Agent, agent-mcp-door, agent-preferences).

## 2.7 (2026-11-09)

**New labs**
- customer-agent (D24): the customer-facing AI agent with all 87 use cases, each routed Here, Here + go deeper, Hand off or Guide. A movie reel, sequence view and step detail for every run; hand-offs to 30 labs, whose Back button resumes the chat; an A2A page; a Scripted or local llama.cpp brain. Mock runs offline; Live reads the lab's own .env.

**Improved**
- pingone-signin: a Passkey tab walks through passkey registration and sign-in step by step, with every server check shown and a replayed sign-in refused. Mock only; the Real card lists the tenant setup.
- token-workbench: Real mode gets, verifies and introspects tokens against one PingOne or PingFederate issuer you configure in its .env, with a log of every HTTP call. Mock stays the default.
- Dialogs in 10 labs are now movable, resizable and can pop out into their own window (gateway-suite, hitl-mfa, id-jag, mcp-tools, pingone-mcp-inspector, muse, personal-agent-demo, pingcli, pingfederate, pingone).
- 29 labs show "Opened from Customer Agent LAB" with a Back button when you arrive from the customer agent.

## 2.6 (2026-11-09)

**New labs**
- a2a-lab (D122): a generalist agent hands off to a specialist through two RFC 8693 exchanges, and an unregistered specialist is denied.

## 2.5 (2026-11-09)

**New labs**
- mcp-skills (D127): test how a host handles the MCP Skills extension (SEP-2640) — a skills server in Mock or Real (a folder you mount read-only), 23 hostile cases a correct host must catch, and a verifier that checks digests, sizes, frontmatter, approvals and origins. Simulated and unverified against a vendor gateway; nothing is executed.

## 2.4 (2026-11-09)

**New labs**
- pingcli (D126): watch an admin automate PingOne with Ping CLI — 14 read-only commands streamed to the browser, an install, init, auth and run guide, and an easy-read table. Mock plays canned output; Real runs pingcli 1.2.0 against your own environment.
- observability (D123): follow a log line from PingOne, PingFederate and Ping Gateway to a searchable, alertable store, with seeded logs, a query box and three alert rules.
- pingone-events (D124): see what PingOne delivers through a webhook subscription, with delivery health and optional forwarding to Elasticsearch.
- aggregate-entitlement (D125): see how an MCP aggregate lists only the tools each caller may use and refuses the rest by name.
- privilege-logging: drive each Privilege gateway use case and see what gets logged for user, agent, tool and policy decision.
- field-notes: a library of pages about our apps and what we learned, one Markdown file each.
- env-map: a map of where software runs (your Mac, Kubernetes, SaaS) as a movable diagram and a table, with a what-if view.

**Setup**
- Every new lab is on the shelf and reachable at `https://local.ping-devops.com:8443/<lab>/`; `scripts/setup.sh --start <lab-dir>` starts one.

## 2.3 (2026-11-07)

**Shelf**
- A Help button in the header opens a drawer listing every way to start a demo: Start on a card, "Restore last set" after a restart, the `scripts/setup.sh` commands (`--start`, `--start-top=10`, `--start-all`), and what to do when Start does nothing.

**Setup**
- `scripts/setup.sh --start-all` now warns on a Mac with under 16 GB of RAM and points to `--start-top=10` or `--start <lab-dir>`.
- The setup summary tells you where to lower OrbStack's memory if many labs are running.

## 2.2 (2026-11-06)

**Shelf**
- Theme picker (Auto / Light / Dark) in the header of the labs.
- The shelf remembers which labs were running: "Restore last set" brings them back after a restart, and `scripts/setup.sh --start-top <n>` starts the most recently used.
- Ping products dropdown with product tags on every card.

**New labs**
- mcp-gateway-lab (D116): a third-party weather MCP server scoped at the gateway with a live, editable policy.
- agent-preferences-lab (D117).
- hitl-mfa-lab (D119): human consent, MFA step-up and out-of-band CIBA approval for an agent moving money.
- delegation-lab (D120): delegated token chain, group entitlement and tiered capabilities.

**Fixes**
- Data Protection and Intent / Purpose labs: the "Run the same text through live Privilege" button is readable in dark mode (it was white on white).
- Privilege A2A and the MCP demo client now run in Docker behind the shared lab proxy.
- The lab proxy no longer goes down when one lab is stopped.
- Coding Agents lab: agent skins keep their client colours, now defined once as variables.
- Diagram Studio library holds all 33 diagrams, including the ID-JAG Runner flow.

**Infrastructure**
- Style-guard checksums refreshed across the fleet and CI fixed in cimd, agent-kill-switch, ping-gateway-route, pingone-signin and id-jag-standalone.
- docs/DEMO-URLS.md lists every lab route on this machine.

## 2.1 (2026-11-05)

**Shelf**
- Update notices: the shelf shows a banner when the family publishes updates, with a copyable update command.
- One-command lifecycle: `scripts/setup.sh` now handles setup, updates (`setup update`), starting labs (`--start`, `--start-all`), and PingOne teardown.
- PingOne teardown runs without prompts (admin credentials saved to `~/.config/demo-kit/provisioning.json` at setup time).

**Setup**
- `install.sh` one-liner works on a completely blank Mac (auto-installs the Xcode Command Line Tools).
- Bootstrap output redesigned: one status line per step, failure details only when needed, summary box at the end.
- Node 26 detection handles nvm machines (installs/aliases 26 in nvm before touching brew).
- Docker engine flexibility: OrbStack is installed by default, Docker Desktop is detected and used as-is.
- Running `scripts/setup.sh` from anywhere auto-installs to `~/Development/AI-DEMO-Standalone` and pulls the latest.

**New labs**
- gateway-suite-lab (D115): AI Gateway demo suite — End to End relay + Personal Agent MCP tab; Real mode verified.

**Infrastructure**
- Fleet mirrors complete under curtismu7; every submodule pin verified; stale ping-sandbox remotes swept.
- Lab-proxy routing for gateway-suite and the shelf link service (header "Shelf" button in every lab).
