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
