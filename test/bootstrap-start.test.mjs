import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Pull the real argument loop and lab_compose_file() out of bootstrap.sh and run them alone in bash.
const src = readFileSync(new URL("../scripts/bootstrap.sh", import.meta.url), "utf8");
const argLoop = src.match(/^while \[ "\$#" -gt 0 \]; do[\s\S]*?^done$/m)?.[0];
const lib = readFileSync(new URL("../scripts/lib-labs.sh", import.meta.url), "utf8");
const composeFn = lib.match(/^lab_compose_file\(\) \{[\s\S]*?^\}$/m)?.[0];

function parse(...args) {
  const script = `set -u; start_app=; start_top=; start_all=0; BOOTSTRAP_APP=; skip_install=0; verbose=0; dry_run=0; run_pingone=
${argLoop}
echo "start=$start_app top=$start_top all=$start_all app=$BOOTSTRAP_APP"`;
  const r = spawnSync("bash", ["-c", script, "_", ...args], { encoding: "utf8" });
  return { status: r.status, out: r.stdout.trim() };
}

test("argument loop is found", () => assert.ok(argLoop));

test("--start <lab> and --app <lab> take the next argument", () => {
  assert.equal(parse("--start", "pingone-events-LAB", "--app", "observability-LAB").out,
    "start=pingone-events-LAB top= all=0 app=observability-LAB");
});

test("= forms work", () => {
  assert.equal(parse("--start=a", "--app=b", "--start-top=3").out, "start=a top=3 all=0 app=b");
});

test("--start-top defaults to 10 and takes a number", () => {
  assert.equal(parse("--start-top").out, "start= top=10 all=0 app=");
  assert.equal(parse("--start-top", "4", "--skip-install").out, "start= top=4 all=0 app=");
});

test("--start-all sets the flag", () => assert.equal(parse("--start-all").out, "start= top= all=1 app="));

test("--no-start is accepted", () => assert.equal(parse("--no-start").status, 0));

test("unknown arguments and missing values fail", () => {
  assert.equal(parse("bogus").status, 2);
  assert.equal(parse("--nope").status, 2);
  assert.equal(parse("--start").status, 2);
  assert.equal(parse("--app", "--verbose").status, 2);
});

function composeFor(root, app) {
  const r = spawnSync("bash", ["-c", `set -u; root="$1"; ${composeFn}\nlab_compose_file "$2"`, "_", root, app], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim().replace(root + "/standalone/", "") : null;
}

test("lab_compose_file prefers the shelf seed, then the usual spots", () => {
  assert.ok(composeFn);
  const root = mkdtempSync(join(tmpdir(), "bs-"));
  const mk = (p) => { mkdirSync(join(root, "standalone", p, ".."), { recursive: true }); writeFileSync(join(root, "standalone", p), ""); };
  mkdirSync(join(root, "standalone/demo-shelf-LAB/data"), { recursive: true });
  writeFileSync(join(root, "standalone/demo-shelf-LAB/data/demos.json"),
    JSON.stringify({ demos: [{ id: "x", composeFile: "seeded-LAB/deploy/docker-compose.yml" }] }));
  mk("seeded-LAB/deploy/docker-compose.yml");
  mk("seeded-LAB/docker-compose.yml");
  mk("plain-LAB/docker-compose.yml");
  mk("deployonly-LAB/deploy/docker-compose.yml");
  mkdirSync(join(root, "standalone/none-LAB"));
  assert.equal(composeFor(root, "seeded-LAB"), "seeded-LAB/deploy/docker-compose.yml");
  assert.equal(composeFor(root, "plain-LAB"), "plain-LAB/docker-compose.yml");
  assert.equal(composeFor(root, "deployonly-LAB"), "deployonly-LAB/deploy/docker-compose.yml");
  assert.equal(composeFor(root, "none-LAB"), null);
});

const topFn = lib.match(/^top_labs\(\) \{[\s\S]*?^\}$/m)?.[0];
const recordFn = lib.match(/^record_started\(\) \{[\s\S]*?^\}$/m)?.[0];
function topLabs(root, n, mode = "") {
  const r = spawnSync("bash", ["-c", `set -u; root="$1"; ${topFn}\ntop_labs "$2" "$3"`, "_", root, String(n), mode], { encoding: "utf8" });
  return r.stdout.trim().split("\n").filter(Boolean);
}
function shelfRoot({ seed, last, local, picks }) {
  const root = mkdtempSync(join(tmpdir(), "bs-top-"));
  const shelf = join(root, "standalone/demo-shelf-LAB");
  mkdirSync(join(shelf, "data"), { recursive: true });
  mkdirSync(join(shelf, ".data"), { recursive: true });
  for (const d of seed) mkdirSync(join(root, "standalone", d.composeFile.split("/")[0]), { recursive: true });
  writeFileSync(join(shelf, "data/demos.json"), JSON.stringify({ demos: seed }));
  if (last) writeFileSync(join(shelf, ".data/last-running.json"), JSON.stringify({ demos: last.map((id) => ({ id, ts: 1 })) }));
  if (local) writeFileSync(join(shelf, ".data/demos.local.json"), JSON.stringify({ demos: local }));
  if (picks) { mkdirSync(join(root, "scripts"), { recursive: true }); writeFileSync(join(root, "scripts/first-run-labs.txt"), picks); }
  return root;
}
const seed = ["a", "b", "c", "d"].map((x) => ({ id: x, composeFile: `${x}-LAB/docker-compose.yml` }));

test("top_labs with no history and no picks file takes the shelf order, capped at n", () => {
  assert.ok(topFn);
  assert.deepEqual(topLabs(shelfRoot({ seed }), 3), ["a-LAB", "b-LAB", "c-LAB"]);
});

test("top_labs puts history first and skips unknown ids", () => {
  const root = shelfRoot({ seed, last: ["c", "gone", "a"] });
  assert.deepEqual(topLabs(root, 3), ["c-LAB", "a-LAB", "b-LAB"]);
});

test("top_labs fills from the first-run picks, in file order, skipping comments and missing labs", () => {
  const picks = "# owner picks\nd-LAB\nnope-LAB\n\nb-LAB  # second\na-LAB\n";
  assert.deepEqual(topLabs(shelfRoot({ seed, picks }), 10), ["d-LAB", "b-LAB", "a-LAB"]);
  assert.deepEqual(topLabs(shelfRoot({ seed, picks, last: ["c", "b"] }), 3), ["c-LAB", "b-LAB", "d-LAB"]);
});

test("top_labs history-only returns just the history (what update restarts)", () => {
  assert.deepEqual(topLabs(shelfRoot({ seed, picks: "a-LAB\n", last: ["c"] }), 10, "history-only"), ["c-LAB"]);
  assert.deepEqual(topLabs(shelfRoot({ seed, picks: "a-LAB\n" }), 10, "history-only"), []);
});

test("top_labs never lists the shelf itself and resolves absolute local compose paths", () => {
  const root = shelfRoot({ seed: [{ id: "shelf", composeFile: "demo-shelf-LAB/docker-compose.yml" }, ...seed] });
  writeFileSync(join(root, "standalone/demo-shelf-LAB/.data/demos.local.json"),
    JSON.stringify({ demos: [{ id: "x", composeFile: join(root, "standalone/d-LAB/docker-compose.yml") }] }));
  writeFileSync(join(root, "standalone/demo-shelf-LAB/.data/last-running.json"), JSON.stringify({ demos: [{ id: "x", ts: 1 }] }));
  assert.deepEqual(topLabs(root, 2), ["d-LAB", "a-LAB"]);
});

test("record_started writes the shelf's history shape, first argument most recent, deduplicated", () => {
  assert.ok(recordFn);
  const root = shelfRoot({ seed, last: ["b", "d"] });
  const r = spawnSync("bash", ["-c", `set -u; root="$1"; dry_run=0; ${recordFn}\nrecord_started a-LAB b-LAB zzz-LAB`, "_", root], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const file = join(root, "standalone/demo-shelf-LAB/.data/last-running.json");
  const demos = JSON.parse(readFileSync(file, "utf8")).demos;
  assert.deepEqual(demos.map((e) => e.id), ["a", "b", "d"]);
  assert.ok(demos.every((e) => Number.isFinite(e.ts)));
  assert.ok(demos[0].ts > demos[1].ts, "first argument is the most recent");
  // what top_labs then returns: the same order
  assert.deepEqual(topLabs(root, 3), ["a-LAB", "b-LAB", "d-LAB"]);
});

test("the repo's first-run picks name exactly 10 real labs", () => {
  const picks = readFileSync(new URL("../scripts/first-run-labs.txt", import.meta.url), "utf8")
    .split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
  const modules = readFileSync(new URL("../.gitmodules", import.meta.url), "utf8");
  assert.equal(picks.length, 10);
  assert.equal(new Set(picks).size, 10);
  for (const p of picks) assert.ok(modules.includes(`path = standalone/${p}\n`), `${p} is a submodule`);
});

const fnOf = (name) => lib.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}$`, "m"))?.[0];
function accessRoot() {
  const root = mkdtempSync(join(tmpdir(), "bs-acc-"));
  spawnSync("git", ["init", "-q", root]);
  writeFileSync(join(root, ".gitmodules"), [
    '[submodule "standalone/open-LAB"]', "\tpath = standalone/open-LAB", "\turl = https://github.com/o/open-LAB.git",
    '[submodule "standalone/secret-LAB"]', "\tpath = standalone/secret-LAB", "\turl = https://github.com/o/secret-LAB.git", ""].join("\n"));
  // a fake gh: only o/open-LAB is visible to "this account"
  const bin = join(root, "bin"); mkdirSync(bin);
  writeFileSync(join(bin, "gh"), '#!/bin/sh\n[ "$2" = "repos/o/open-LAB" ] && { echo o/open-LAB; exit 0; }\nexit 1\n', { mode: 0o755 });
  return { root, bin };
}

test("submodule_repo maps a path to owner/name from .gitmodules", () => {
  const { root } = accessRoot();
  const r = spawnSync("bash", ["-c", `set -u; root="$1"; ${fnOf("submodule_repo")}\nsubmodule_repo standalone/secret-LAB`, "_", root], { encoding: "utf8" });
  assert.equal(r.stdout.trim(), "o/secret-LAB");
});

test("split_by_access skips repos this account cannot see and keeps real failures", () => {
  const { root, bin } = accessRoot();
  const fns = ["submodule_repo", "has_access", "split_by_access"].map(fnOf).join("\n");
  const r = spawnSync("bash", ["-c", `set -u; root="$1"; ${fns}\nsplit_by_access standalone/open-LAB standalone/secret-LAB; echo "skip=[$no_access_paths] broken=[$broken_paths]"`, "_", root],
    { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  assert.equal(r.stdout.trim(), "skip=[ standalone/secret-LAB] broken=[ standalone/open-LAB]");
});
