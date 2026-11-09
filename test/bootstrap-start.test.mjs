import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Pull the real argument loop and lab_compose_file() out of bootstrap.sh and run them alone in bash.
const src = readFileSync(new URL("../scripts/bootstrap.sh", import.meta.url), "utf8");
const argLoop = src.match(/^while \[ "\$#" -gt 0 \]; do[\s\S]*?^done$/m)?.[0];
const composeFn = src.match(/^lab_compose_file\(\) \{[\s\S]*?^\}$/m)?.[0];

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

const topFn = src.match(/^top_labs\(\) \{[\s\S]*?^\}$/m)?.[0];
function topLabs(root, n) {
  const r = spawnSync("bash", ["-c", `set -u; root="$1"; ${topFn}\ntop_labs "$2"`, "_", root, String(n)], { encoding: "utf8" });
  return r.stdout.trim().split("\n").filter(Boolean);
}
function shelfRoot({ seed, last, local }) {
  const root = mkdtempSync(join(tmpdir(), "bs-top-"));
  const shelf = join(root, "standalone/demo-shelf-LAB");
  mkdirSync(join(shelf, "data"), { recursive: true });
  mkdirSync(join(shelf, ".data"), { recursive: true });
  for (const d of seed) mkdirSync(join(root, "standalone", d.composeFile.split("/")[0]), { recursive: true });
  writeFileSync(join(shelf, "data/demos.json"), JSON.stringify({ demos: seed }));
  if (last) writeFileSync(join(shelf, ".data/last-running.json"), JSON.stringify({ demos: last.map((id) => ({ id })) }));
  if (local) writeFileSync(join(shelf, ".data/demos.local.json"), JSON.stringify({ demos: local }));
  return root;
}
const seed = ["a", "b", "c", "d"].map((x) => ({ id: x, composeFile: `${x}-LAB/docker-compose.yml` }));

test("top_labs with no history takes the shelf order, capped at n", () => {
  assert.ok(topFn);
  assert.deepEqual(topLabs(shelfRoot({ seed }), 3), ["a-LAB", "b-LAB", "c-LAB"]);
});

test("top_labs puts recently used labs first, fills from the shelf order, skips unknown ids", () => {
  const root = shelfRoot({ seed, last: ["c", "gone", "a"] });
  assert.deepEqual(topLabs(root, 3), ["c-LAB", "a-LAB", "b-LAB"]);
});

test("top_labs never lists the shelf itself and resolves absolute local compose paths", () => {
  const root = shelfRoot({ seed: [{ id: "shelf", composeFile: "demo-shelf-LAB/docker-compose.yml" }, ...seed] });
  writeFileSync(join(root, "standalone/demo-shelf-LAB/.data/demos.local.json"),
    JSON.stringify({ demos: [{ id: "x", composeFile: join(root, "standalone/d-LAB/docker-compose.yml") }] }));
  writeFileSync(join(root, "standalone/demo-shelf-LAB/.data/last-running.json"), JSON.stringify({ demos: [{ id: "x" }] }));
  assert.deepEqual(topLabs(root, 2), ["d-LAB", "a-LAB"]);
});
