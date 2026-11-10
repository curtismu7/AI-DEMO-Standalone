import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// bootstrap.sh starts ping-shared's OWN Ping products (never AI-DEMO2's) and says plainly what it skipped.
// Pull the real block out of bootstrap.sh and run it alone in bash against a stand-in ping-shared.sh.
const src = readFileSync(new URL("../scripts/bootstrap.sh", import.meta.url), "utf8");
const block = src.match(/^# ping-shared's own Ping products[\s\S]*?^if \[ -n "\$svc_fail" \] \|\| \[ -n "\$pf_note" \];.*$/m)?.[0];
const repoRoot = new URL("..", import.meta.url).pathname;

function run({ pf = 0, gw = 6, dry = 0, verbose = 0, withScript = true, pfText = "pf output", gwText = "gw output", licenseEnv = "" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "bs-shared-"));
  if (withScript) {
    mkdirSync(join(root, "shared/ping-shared/scripts"), { recursive: true });
    const f = join(root, "shared/ping-shared/scripts/ping-shared.sh");
    writeFileSync(f, `#!/bin/bash
case "$2" in
  pingfederate) echo "${pfText}"; [ "$DRY" = 1 ] && echo "would run: docker compose --profile pingfederate up -d pingfederate"; exit ${pf} ;;
  pinggateway) echo "${gwText}"; exit ${gw} ;;
esac
`);
    chmodSync(f, 0o755);
  }
  const script = `set -u; ${licenseEnv ? `PF_LICENSE_FILE=${licenseEnv}; export PF_LICENSE_FILE; ` : ""}root="$1"; dry_run=${dry}; verbose=${verbose}; DRY=${dry}; export DRY
svc_up=""; svc_skip=""; svc_fail=""; DETAIL=""
step_detail() { DETAIL="\${DETAIL}\${1}\\n"; }
step_ok() { echo "OK $1"; }
step_warn() { echo "WARN $1"; printf '%b' "$DETAIL"; }
${block}`;
  const r = spawnSync("bash", ["-c", script, "_", root], { encoding: "utf8", env: { ...process.env, HOME: root } });
  return { status: r.status, out: r.stdout + r.stderr, root };
}

test("the ping-shared block is found in bootstrap.sh", () => assert.ok(block));

test("bootstrap names no AI-DEMO2 container and calls only ping-shared's script", () => {
  assert.match(block, /shared\/ping-shared\/scripts\/ping-shared\.sh/);
  assert.doesNotMatch(block, /ai-demo/i);
});

test("everything ready: PingFederate and PingGateway are listed as up", () => {
  const r = run({ pf: 0, gw: 0 });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^OK up: pingfederate pinggateway/m);
});

test("no licence (exit 4): a WARN that names the licence path, the script's help is shown, nothing fails", () => {
  const r = run({ pf: 4, pfText: "PingFederate skipped: there is no licence file at /x" });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^WARN .*PingFederate skipped: no licence file at .*\/\.config\/demo-kit\/pingfederate\.lic/m);
  assert.match(r.out, /there is no licence file at \/x/);
  assert.doesNotMatch(r.out, /Failed to start/);
});

test("a custom PF_LICENSE_FILE is the path named in the message", () => {
  assert.match(run({ pf: 4, licenseEnv: "/custom/pf.lic" }).out, /no licence file at \/custom\/pf\.lic/);
});

test("licence but terms not accepted (exit 5): a WARN saying so, never started, nothing fails", () => {
  const r = run({ pf: 5, pfText: "accepting Ping's terms ... your step" });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^WARN .*PingFederate not started: licence found, Ping's terms not accepted yet/m);
  assert.match(r.out, /your step/);
});

test("a real failure (exit 1) is reported as failed to start", () => {
  const r = run({ pf: 1, pfText: "docker compose could not start PingFederate" });
  assert.match(r.out, /^WARN up: none/m);
  assert.match(r.out, /Failed to start .*: pingfederate/);
  assert.match(r.out, /docker compose could not start PingFederate/);
});

test("PingGateway not configured (exit 6) is optional and silent", () => {
  const r = run({ pf: 0, gw: 6 });
  assert.doesNotMatch(r.out, /PingGateway|pinggateway/);
  assert.match(r.out, /^OK up: pingfederate$/m);
});

test("dry run prints the would-run lines", () => {
  const r = run({ pf: 0, gw: 0, dry: 1 });
  assert.match(r.out, /would run: docker compose --profile pingfederate up -d pingfederate/);
});

test("an older ping-shared without the script (pin not bumped yet) is skipped without a crash", () => {
  const r = run({ withScript: false });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^OK up: none/m);
});

// With the real submodule checked out (a full local clone), run the real script end to end with no licence.
const realScript = join(repoRoot, "shared/ping-shared/scripts/ping-shared.sh");
test("real ping-shared.sh: no licence prints the plain message and exits 4", { skip: existsSync(realScript) ? false : "submodule not checked out" }, () => {
  const home = mkdtempSync(join(tmpdir(), "bs-real-"));
  const bin = join(home, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "node"), `#!/bin/sh\ncase "$1" in */probe.mjs) echo "no shared $2" >&2; exit 1;; esac\nexec ${process.execPath} "$@"\n`);
  chmodSync(join(bin, "node"), 0o755);
  const r = spawnSync("bash", [realScript, "up", "pingfederate", "--non-interactive", "--dry-run"], { encoding: "utf8", env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home } });
  assert.equal(r.status, 4, r.stderr);
  assert.match(r.stderr, /PingFederate skipped: there is no licence file at/);
  assert.ok(r.stderr.includes(join(home, ".config/demo-kit/pingfederate.lic")));
});
