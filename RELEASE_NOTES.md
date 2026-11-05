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
