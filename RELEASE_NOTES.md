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

## 3.13 (2026-11-22)

**Postman collections and MCP servers across the fleet**

- Every flow-driven lab now ships a Postman collection (`postman/<slug>.postman_collection.json`), generated from a per-lab spec by the new `shared/postman/generator.mjs` (spec → Postman v2.1; mock-only lanes labelled `(MOCK ONLY)`). The owner fills the git-ignored live environment from the shared env file with `shared/postman/fill-env.mjs` — real settings never enter a repo.
- Five labs also ship companion stdio MCP servers (`mcp/server.mjs`) that proxy a running lab as tools: cimd-LAB (6 tools), id-jag-standalone-LAB (8), mock-authorize-LAB (9), token-workbench-LAB (9), mcp-gateway-lab-LAB (8).
- Covered labs: cimd, id-jag-standalone, token-workbench, mock-authorize, mcp-resource-server, mcp-gateway-lab, stolen-token, trusted-issuers, p1-third-party-exchange, obo-lab, delegation-lab, ciba-approval-sequence, ciba-hitl, intent-par-inspector, session, gateway-claims, pf-array-claims, privilege-api-explorer, saas-access, wimse-lab, workload-identity.
- Every collection verified green with `newman` against its running lab; every MCP server smoke-tested over stdio. `mock-authorize` also gained urlencoded-body and other generator capabilities; see `shared/postman/README.md` for the conventions.

## 3.12 (2026-11-22)

**New labs**

- salesforce-privilege-LAB (Demo, D145, port 7835): a simulated rehearsal of connecting a Salesforce Developer org to PingOne Privilege and running a time-boxed permission set grant, then its revoke, against a mock org. It teaches what goes wrong while connecting (17 scripted scenarios, most of them a failure and its fix) and why. Mock by default; an owner-run, read-only Real mode reads one org's permission sets and users. Every behaviour was observed once on one org and is UNVERIFIED as a product claim.

## 3.11 (2026-11-22)

**New labs**

- privilege-gateway-client-LAB (Demo, D144, port 7833): a verdict-first client for a PingOne Privilege MCP gateway. Pick one of three standing doors (every tool, seven read-only tools, no policy), run a tool, and read the verdict first with the identity the gateway evaluated. Evidence opens in pop-out panels: movie reel, token sequence, sequence view, a call-path diagram and the gateway trace. Mock is fully offline; Real uses your own gateway with an agent key per door and a pi.flow page login. Stories, personas, presenter mode and a talk track.

## 3.10 (2026-11-21)

**New labs**

- ciba-approval-sequence-LAB (Demo, port 7834): the agent booking that policy holds for out-of-band CIBA approval, as a clickable 71-message sequence diagram — ten lifelines, three phases (search, a held booking write, replay and polling). Click any message for its request, response, decoded tokens and the RFC/spec standards behind it, or Simulate to walk all 71. Mock/Real toggle, talk track. Ported from the AI-DEMO2 banking demo's CIBA approval sequence page.


## 3.9 (2026-11-21)

**Improved**

- diagram-studio-LAB (Tool, port 6001): a new **All diagrams** page, and the shelf's Open button now lands on it. Every diagram is in a section (Basics, Architecture, Tokens and delegation, Agent privilege, Personal agent, Agent onboarding and audit, Sign-in and approval, Lab flows), with a text filter. Tags work like the shelf's: a **Ping product** menu that lists only the products that appear in diagrams, plus tag chips for Ping products, Subjects and Standards and protocols (alternatives inside a group, all apply across groups, with counts), a Close button whose open or closed state is remembered, and **Group by** Section, Ping product, Subject or Standard. The view is in the address, so a filtered page can be shared. Tags are derived from each diagram's own words and the standards its steps cite, then corrected by a short curated list; some may be wrong.
- diagram-studio-LAB: the library grows from 52 to **92 diagrams**. 40 were converted from the demo family's own diagram pages with generic names: 29 box-and-arrow flows and 11 Mermaid sequences drawn as lifeline sequences. The step text of the converted sequences is generated from the messages and its standards links come from keyword rules, so treat them as a starting point. Pages that need live data, an editor, or a customer's names (server topology, System Flow Live, Canvas, two customer-specific pages) are not included, and the page lists them with the reason.
- diagram-studio-LAB: a new **sequence layout** (lifelines, numbered messages in order, phase bands, notes, alt and loop frames), and the first diagram that uses it: an agent booking held for out-of-band CIBA approval, 71 messages across ten lifelines. Click any message for its request, response and the RFCs behind it, or Simulate to walk it. Generic component names only.
- demo-shelf-LAB (Shelf): a card's open path (`openPath`) now also applies to its lab-proxy address, so a lab that has a proxy route can open on a specific page. Diagram Studio uses it (`/#all`).

## 3.8 (2026-11-20)

**New labs**

- agent-identity-academy-LAB (Demo, port 7831): the Agent Identity Academy as a standalone — 13 lessons, one per agent type and per control (landscape, OIDC/PKCE sign-in, RFC 8693 delegated access, the Personal Agent, the enterprise Digital Assistant, MCP discovery vs execution, Authorize permit/deny, human approval/CIBA, A2A delegation, Privilege MCP, threat defense, lifecycle and revocation, the evidence map), each with a frame-by-frame evidence reel, a mock claim-diff table and a diagram-studio diagram, over the discover/register/authenticate/authorize/govern lifecycle. Mock only, every token a labelled mock sample.

## 3.7 (2026-11-20)

**New labs**

- pf-array-claims-LAB (Tester, port 7828): the isMemberOf claim-shape use case — a PingFederate token can carry groups as a delimited string or a JSON array, and a group policy answers differently: substring search over the string over-grants to decoy names, the array gives exact membership. Mint panel (both shapes, decoded claims), three simulated cases, "The fix" guide, IS/IS-NOT panel. Mock only, example group names.

## 3.6 (2026-11-20)

**New labs**

- privilege-shelf-LAB (Demo, port 7830): the Privilege family on one page — all 40 Privilege-tagged standalone labs with a one-line what-it-does, catalog id and its open link through the shared lab proxy, plus 21 Privilege feature cards and three presenter stories. Search across the cards. Index only, mock only: the page opens links, it makes no calls.

## 3.5 (2026-11-19)

**New labs**

- privilege-google-secrets-LAB (D137, Demo, port 7827): Privilege Hubs brokering a Google Secret Manager credential to an AI agent — the agent holds only a Privilege agent access key; the gateway policy allows the in-scope secret (custodian release, masked, labelled mock) and refuses the out-of-scope ask, the refusal rendered as the gateway's own decision. GatewayTrace on every hop; ReactFlow flow with Simulate/Reset/speed; Mock/Real toggle (Mock fully offline, no live mode shipped). Also registered: agent-privilege-guide-lab (D136, port 7826, by its own session).

## 3.4 (2026-11-18)

**New labs**

- intent-console-lab-LAB (D134, Demo, port 7825): the Privilege console's AI Intents page as a standalone simulation — intents with exemplars, twins, floors and Acts (shapes measured from the console swagger), a per-app modelAIIntentConfig, and a lab-invented resolution engine over a stand-in encoder on the KServe v2 wire. Six doctor-checked scenarios; twin intents within 0.05 are refused as ambiguous, never guessed. Mock only, fully offline, no live mode.

## 3.3 (2026-11-18)

**New labs**

- wimse-lab-LAB (D138, Demo, port 7822): a mock of the IETF WIMSE architecture — trust domains, Workload Identity Tokens (WIT) with a confirmation key, Workload Proof Tokens (WPT) binding audience + identity + user context per request, a multi-hop chain (gateway → orders → billing), and a Break-it pane (wrong audience, swapped context, swapped identity, expired, rogue trust domain) that shows the exact refusal each time.
- workload-cert-lab-LAB (D139, Demo, port 7823): X.509/SPIFFE-style workload identity — a trust-domain root CA signs real short-lived certificates with SPIFFE SAN URIs, a 4-step mutual-TLS walkthrough, and a Break-it pane (foreign-domain cert, expired SVID, tampered bytes). Pairs with wimse-lab (JWT variant) and workload-identity-lab (Privilege gateway variant).


## 3.2 (2026-11-18)

**Updated Authorize policy — if you use live Authorize, re-import it.**

- `policy/ai-demo-p1az.standalone.snapshot.json` now includes the airline booking rules: an agent spend limit (500) and premium-only bookings over 750 (new attributes AgentSpendLimit and MemberTier, 2 conditions, 2 rules). It is now 3 policies, 35 rules, 43 conditions.
- To pick it up: run the update command, then PingOne console -> Authorize -> Trust Framework -> Import the new file. There is no import API. Mock mode needs nothing.
- Re-importing replaces the policy objects, so if you changed `HasValidMcpAudience` to your own gateway URI, set it again after the import.
- New: a setup guide PDF (`docs/standalone-labs-setup-guide.pdf`) with the policy download link.

## 3.1 (2026-11-18)

**New labs**

- pf-agent-client-sync-lab (D000 provisional, port 7824): PingFederate 13.1 AI-Agent-tagged OAuth clients (`_pf_system_tag_ai_agent`) synced one-way into simulated PingIDM managed agent records — the foundation for agent identity, ownership and lifecycle. Mock is fully offline; Real reads a real PF Admin API read-only from the app's own .env.

## 3.0 (2026-11-17)

**MAJOR — if you already have the labs installed, re-run setup to pick up the new PingOne flow.**

- Setup now builds everything from just four inputs: your Administrators environment ID, a Worker app's client ID and secret, and the region. It creates the demo environment, the per-environment worker and user apps for you — no other console work.
- All four can be passed in the install command itself:
  `curl -fsSL https://raw.githubusercontent.com/curtismu7/AI-DEMO-Standalone/main/scripts/install.sh | PINGONE_REGION=com PINGONE_ADMIN_ENV_ID=<id> PINGONE_WORKER_CLIENT_ID=<id> PINGONE_WORKER_CLIENT_SECRET=<secret> bash`
- Setup now prints the P1AZ policy snapshot path and the exact console import steps (live Authorize mode; mock mode needs nothing).
- Fixed: teardown credentials were saved empty — teardown now runs without prompting as intended.

## 2.17 (2026-11-16)

**New lab**
- poppy-verification-LAB (D136 provisional, Tester, port 7821): checks a Company and its issuer against the Personal Agent Protocol 1.0 (published 2026-11-14) with 107 spec-linked checks across discovery, issuer metadata, Poppy-Session, sign-in and resources. Mock runs a reference Company and issuer you can break with 28 defects and watch the named checks fail; Real probes the Company and issuer you type with this agent's own key (sign-in checks need a person and are skipped there). It is a fork of poppy-agent-tester-LAB. A pass is not a certification.

## 2.16 (2026-11-16)

**New lab**
- cedar-in-privilege-LAB (D135, Demo, port 7820): a guided tour of Cedar AI policies in PingOne Privilege with a set-up guide and a Cedar IS / IS NOT panel. Three cases: hold a call for a human, narrow a token's scope, and match the agent's `act.sub` claim. All simulated in the lab; only the `act.sub` case was measured on a real tenant (one real agent, one run). The matching live pages are in the main demo app.

## 2.15 (2026-11-16)

**New lab**
- cedar-act-sub-LAB (D134, Tester, port 7819): a mock gateway that walks a measured Cedar `act.sub` run — one door guarded by two Active `act.sub` policies, the tool whose policy matches the token's `act.sub` is allowed and the tool whose policy names a different value is refused. The run was measured on one real tenant with one real PingFederate token; everything else on the page is simulated and labelled as such. Mock by default; Real is disabled in the UI, and the real probe (`npm run real`) is a terminal script that is owner-run.

## 2.14 (2026-11-14)

**New lab**
- privilege-bulk-users-lab (Tester, port 7817): register many people for PingOne Privilege by API instead of one at a time — a guide to the two routes (the PingOne Management API: create in the Privilege environment and add to the Privilege group; the Privilege console API, still unverified against a real console) and a runnable Plan, Apply and Verify lab with a typed-count gate, a shared 429 back-off, safe re-runs and six Mock scenarios. Mock by default; Real is owner-run.

## 2.13 (2026-11-12)

**New lab**
- mfa-admin-mcp-lab (Tester, port 7815): administer PingOne's early-access MFA administration MCP tool set — environment MFA settings, device-authentication and FIDO passkey policies, notification policies, OATH tokens, and email/phone/WhatsApp delivery settings — through MCP tools instead of console pages. Safety classes (read/write/destructive), a confirm gate with exact-argument hashing, a metadata poison scan, a redacted audit log, and an inspector layout with talk track. Mock by default (26 MFA mock tools + a general-admin sample, role-gated viewer/admin); Live is owner-run against the hosted PingOne MCP server. Fork of pingone-mcp-inspector-LAB.

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
