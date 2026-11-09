# lib-labs.sh — which labs to start and how. Sourced by bootstrap.sh and setup.sh (update);
# the caller sets $root (the family checkout) and $dry_run (1 = print only).
#
# The shelf's history (standalone/demo-shelf-LAB/.data/last-running.json, most recent first)
# decides what comes back; scripts/first-run-labs.txt (the owner's top 10) fills the rest for
# a machine with less history.

# lab_compose_file <lab-dir>: the compose file that deploys a lab, as an absolute path. Same
# source as the shelf's Start button — the shelf seed's composeFile (relative to standalone/) —
# so a new lab deploys as soon as its shelf entry lands; falls back to the usual spots in the dir.
lab_compose_file() {
  local app="$1" seed="$root/standalone/demo-shelf-LAB/data/demos.json" f
  if [ -f "$seed" ]; then
    f="$(node -e '
      const [seed, app] = process.argv.slice(1);
      const d = JSON.parse(require("fs").readFileSync(seed, "utf8"));
      const hit = (d.demos || d).find((x) => (x.composeFile || "").split("/")[0] === app);
      if (hit) console.log(hit.composeFile);' "$seed" "$app" 2>/dev/null)"
    [ -n "$f" ] && [ -f "$root/standalone/$f" ] && { echo "$root/standalone/$f"; return 0; }
  fi
  for f in docker-compose.yml compose.yml deploy/docker-compose.yml; do
    [ -f "$root/standalone/$app/$f" ] && { echo "$root/standalone/$app/$f"; return 0; }
  done
  return 1
}

# Compose files of the projects running now (one per line), so "already up" is exact, not a name guess.
running_compose_files() {
  docker compose ls --format json 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>{for(const p of JSON.parse(s||"[]"))for(const f of String(p.ConfigFiles||"").split(","))console.log(f)})' 2>/dev/null || true
}

# top_labs <n> [history-only]: lab dirs to start, one per line, at most <n>.
#   1. the shelf's history (.data/last-running.json, most recent first): what the user had running;
#   2. unless history-only: scripts/first-run-labs.txt in file order (the owner's first-run picks),
#      or the shelf seed's order when that file is missing.
top_labs() {
  node -e '
    const fs = require("fs"), path = require("path");
    const [root, n, mode] = [process.argv[1], Number(process.argv[2]), process.argv[3] || ""];
    const shelf = path.join(root, "standalone/demo-shelf-LAB");
    const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
    const list = (d) => (d && (d.demos || d)) || [];
    const reg = [...list(read(path.join(shelf, ".data/demos.local.json"))), ...list(read(path.join(shelf, "data/demos.json")))];
    const exists = (dir) => dir && dir !== "demo-shelf-LAB" && fs.existsSync(path.join(root, "standalone", dir));
    // registry composeFile -> lab dir under standalone/ (seed paths are relative; local ones may be absolute)
    const dirOf = (d) => {
      const f = d && d.composeFile; if (!f) return null;
      const rel = path.relative(path.join(root, "standalone"), path.resolve(path.join(root, "standalone"), f));
      const dir = rel.split(path.sep)[0];
      return !dir.startsWith("..") && exists(dir) ? dir : null;
    };
    const out = [];
    const add = (dir) => { if (dir && !out.includes(dir) && out.length < n) out.push(dir); };
    for (const e of list(read(path.join(shelf, ".data/last-running.json")))) add(dirOf(reg.find((d) => d.id === e.id)));
    if (mode !== "history-only") {
      let picks = null;
      try { picks = fs.readFileSync(path.join(root, "scripts/first-run-labs.txt"), "utf8"); } catch {}
      if (picks !== null) {
        for (const line of picks.split("\n")) { const dir = line.replace(/#.*/, "").trim(); if (exists(dir)) add(dir); }
      } else {
        for (const d of list(read(path.join(shelf, "data/demos.json")))) add(dirOf(d));
      }
    }
    console.log(out.join("\n"));' "$root" "$1" "${2:-}"
}

# record_started <lab-dir...>: put these labs at the front of the shelf's history, first argument
# most recent, the same file and shape the shelf writes ({demos:[{id,ts}]}), so labs started
# here come back next time too. A lab with no shelf entry is skipped.
record_started() {
  [ "$#" -gt 0 ] || return 0
  [ "${dry_run:-0}" = 1 ] && return 0
  node -e '
    const fs = require("fs"), path = require("path");
    const [root, ...dirs] = process.argv.slice(1);
    const shelf = path.join(root, "standalone/demo-shelf-LAB");
    const file = path.join(shelf, ".data/last-running.json");
    const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
    const seed = (read(path.join(shelf, "data/demos.json")) || {}).demos || [];
    let demos = ((read(file) || {}).demos || []).filter((e) => e && typeof e.id === "string" && Number.isFinite(e.ts));
    const now = Date.now();
    dirs.slice().reverse().forEach((dir, i) => {
      const hit = seed.find((d) => (d.composeFile || "").split("/")[0] === dir);
      if (!hit) return;
      demos = [{ id: hit.id, ts: now + i }, ...demos.filter((e) => e.id !== hit.id)];
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + ".tmp", JSON.stringify({ demos }, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(file + ".tmp", file);' "$root" "$@"
}

# start_one <lab-dir>: deploy one lab. Returns 0 when it is up, 1 when it failed.
# Docker first (rulebook: every lab ships a local Docker standalone): `up -d --build` from the
# compose file's own folder, exactly like the shelf, so relative paths and .env resolve the same.
# --build makes a re-run after an update pick up new lab code; unchanged labs stay as they are.
start_one() {
  local app="$1" dir="$root/standalone/$1" script compose
  if [ ! -d "$dir" ]; then echo "  no such lab dir: standalone/$1"; return 1; fi
  if [ "$app" != "demo-shelf-LAB" ] && compose="$(lab_compose_file "$app")"; then
    if [ "${dry_run:-0}" = 1 ]; then echo "  $1: would run docker compose -f ${compose#"$root/"} up -d --build"; return 0; fi
    if (cd "$(dirname "$compose")" && perl -e 'alarm 900; exec @ARGV' docker compose -f "$compose" up -d --build > "/tmp/standalone-$1.log" 2>&1); then
      echo "  $1: up (${compose#"$root/standalone/"})"
      return 0
    fi
    echo "  $1: docker compose failed — log: /tmp/standalone-$1.log"
    return 1
  fi
  # No compose file: the lab's own start script (the shelf has `npm run docker`, its compose wrapper).
  for script in docker docker:up start; do
    if [ -f "$dir/package.json" ] && node -e "const p=require('$dir/package.json'); process.exit(p.scripts && p.scripts['$script'] ? 0 : 1)" 2>/dev/null; then
      if [ "${dry_run:-0}" = 1 ]; then echo "  $1: would run npm run $script"; return 0; fi
      if [ "$script" = "start" ]; then
        # npm start = long-running node server; run it detached so the server keeps
        # living after this script returns, log to /tmp.
        (cd "$dir" && nohup npm start > "/tmp/standalone-$1.log" 2>&1 &)
        sleep 3
        echo "  $1: launched detached (log: /tmp/standalone-$1.log)"
        return 0
      fi
      # npm run docker = compose wrapper that exits when done; cap at 3 min for safety.
      if (cd "$dir" && perl -e 'alarm 180; exec @ARGV' npm run "$script" > /dev/null 2>&1); then
        echo "  $1: npm run $script"
        return 0
      fi
      echo "  $1: npm run $script failed or timed out (cd standalone/$1 && npm run $script to see why)"
      return 1
    fi
  done
  echo "  $1: no start script or compose file — check its README"
  return 1
}

# start_labs <lab-dir...>: start each, then record the ones that came up in the shelf's history.
start_labs() {
  local app ok=""   # a plain string: macOS bash 3.2 treats an empty array as unbound under set -u
  for app in "$@"; do start_one "$app" && ok="$ok $app"; done
  # shellcheck disable=SC2086  # lab dir names have no spaces
  [ -n "$ok" ] && record_started $ok
  return 0
}

# ---- submodules a user cannot access ----------------------------------------------------------
# Some lab repos can be private. A user without access must still get every other lab, so a
# failed submodule update is retried one lab at a time and the inaccessible ones are skipped.

# submodule_repo <path>: owner/name of that submodule's GitHub repo (from .gitmodules).
submodule_repo() {
  git -C "$root" config -f .gitmodules --get-regexp '^submodule\..*\.path$' | while read -r key p; do
    [ "$p" = "$1" ] || continue
    git -C "$root" config -f .gitmodules --get "${key%.path}.url" | sed -E 's#^https://github.com/##; s#^git@github.com:##; s#\.git$##'
  done
}
# has_access <path>: can the signed-in GitHub account see that submodule's repo?
has_access() {
  local repo; repo="$(submodule_repo "$1")"
  [ -n "$repo" ] && gh api "repos/$repo" --jq .full_name > /dev/null 2>&1
}
# submodules_each: init every submodule on its own (no credential prompts); prints the failed paths.
submodules_each() {
  local p failed=""
  for p in $(git -C "$root" config -f .gitmodules --get-regexp '^submodule\..*\.path$' | awk '{print $2}'); do
    GIT_TERMINAL_PROMPT=0 git -C "$root" submodule update --init --recursive -- "$p" > /dev/null 2>&1 || failed="$failed $p"
  done
  echo $failed
}
# split_by_access <path...>: sets $no_access_paths (skipped: repo not visible to this account)
# and $broken_paths (visible but failed: a real error).
split_by_access() {
  local p; no_access_paths=""; broken_paths=""
  for p in "$@"; do
    if has_access "$p"; then broken_paths="$broken_paths $p"; else no_access_paths="$no_access_paths $p"; fi
  done
}
