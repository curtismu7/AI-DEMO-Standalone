# Release notes

What changed in the standalone labs. The newest entry is on top; the shelf shows
the latest entry when a new one appears after your last visit.

Format: each release is a `## <version>` heading (version = YYYY-MM-DD or a tag).
The shelf's "What's new" panel compares its stored version against the first
heading here — so always add a NEW heading at the top; never edit an old one.

<!-- SHELF RELEASES BELOW — newest first, one "## version" heading per release -->

## 2026-11-05

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
