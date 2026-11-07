# Standalone Labs — Setup for Yourself

One command. Everything (git, Node, Docker, GitHub CLI, all 69 demo apps, the launcher) installs itself.

## Setup

```sh
curl -fsSL https://raw.githubusercontent.com/curtismu7/AI-DEMO-Standalone/main/scripts/install.sh | bash
```

Works on a completely blank Mac. If you prefer two steps:

```sh
git clone --recurse-submodules https://github.com/curtismu7/AI-DEMO-Standalone.git ~/Development/AI-DEMO-Standalone
cd ~/Development/AI-DEMO-Standalone && scripts/setup.sh
```

**What you'll be asked for**

1. Your Mac password (tool installs and a hosts entry)
2. A GitHub login in the browser — your normal Ping GitHub account is fine; the repos are public
3. First run only: a macOS "Command Line Tools" popup — click Install and let it finish; the script waits
4. PingOne credentials (live mode only — skip for mock mode; every demo works in mock mode)

**When it finishes**, open the shelf:

👉 **https://local.ping-devops.com:8443**

Click any demo to open it. Start a specific lab with:

```sh
cd ~/Development/AI-DEMO-Standalone
scripts/setup.sh --start <lab-name>     # e.g. --start gateway-suite-LAB
scripts/setup.sh --start-all            # every lab that has a compose file
```

## Help

All commands are safe to re-run — they pick up where they left off and never delete your work.

```sh
scripts/setup.sh --help                 # all options
scripts/setup.sh                        # full setup (also updates an existing install)
scripts/setup.sh update                 # pull the latest demos + lab pins only
scripts/setup.sh teardown --dry-run     # preview removing the PingOne demo environment
scripts/setup.sh teardown               # actually remove it (asks you to type the env id)
scripts/setup.sh --start <lab-name>     # start one lab
scripts/setup.sh --start-all            # start every lab
scripts/setup.sh --app <lab-name>       # (re)initialize one lab only
scripts/setup.sh --skip-install         # setup without npm install/build
scripts/setup.sh --dry-run              # show what setup would do, change nothing
scripts/setup.sh --verbose              # show all tool output (brew, npm)
```

**Common situations**

- **Something failed mid-way** → re-run the same command; completed steps are skipped.
- **A lab won't start** → `cd standalone/<lab-name>` and run `npm start` or `docker compose up -d` there to see the real error.
- **A lab's header has no "Shelf" button** → the lab was built before `SHELF_URL` existed: `cd standalone/<lab-name> && SHELF_URL=$(grep ^SHELF_URL= ~/Development/.env | cut -d= -f2) docker compose up -d --build`. `scripts/setup.sh --start <lab>` passes it automatically.
- **Launcher down after a reboot** → the launchd watchdog restarts it every 5 minutes, or run `scripts/lab-proxy-watchdog.sh`.
- **Deleting the demo PingOne environment** → `scripts/setup.sh teardown --dry-run` first, then without `--dry-run`. Credentials are read from `~/.config/demo-kit/provisioning.json` (no prompts).
- **Stuck on a red step** → send the output; each step prints its own failure reason and next action.

## What setup does

Eleven steps, one status line each (`[n/11] Step ..... OK`), a summary box at the end:

1. **Homebrew** — installs it if missing (macOS's package manager; everything below uses it)
2. **Node 26** — required version; detects nvm or brew, resolves version-manager shadowing automatically
3. **gh CLI + access** — installs GitHub's CLI, browser login, and verifies the demo repos are reachable
4. **Docker** — installs OrbStack and starts it
5. **hosts entry** — adds `local.ping-devops.com` to `/etc/hosts` (one domain for everything, no more hosts edits ever)
6. **PingOne** — creates the demo environment and writes `~/Development/.env` (live mode); skipped if already configured
7. **Authorize snapshot** — checks the PingOne Authorize policy needed by live mode (mock mode needs none)
8. **Submodules** — downloads all 69 demo app repos
9. **Shelf + installs** — builds the demo shelf and installs the four main labs' npm dependencies
10. **UI standard + env** — runs the family's quick consistency checks
11. **Launcher** — starts the lab-proxy at `https://local.ping-devops.com:8443` and installs a launchd agent so it survives reboots

Then it prints a summary: mode (live/mock), how many labs and containers are running, and the shelf URL.

**Existing install?** Nothing is re-installed or overwritten: the installer switches to your checkout, pulls fast-forward-only, and continues — your local commits and files are never discarded. If `~/Development/AI-DEMO-Standalone` exists but isn't a checkout, the installer refuses and tells you how to move it aside (it never deletes).
