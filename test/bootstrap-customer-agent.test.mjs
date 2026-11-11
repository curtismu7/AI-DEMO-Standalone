import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// bootstrap.sh offers the Customer Agent LAB PingOne apps for full Real (owner decision 2026-11-10: part of bootstrap, as an
// offer that asks first). Run the real block from bootstrap.sh in bash against stand-ins. The lab's setup script is a stub that
// records its arguments: the real PingOne is never contacted.
const src = readFileSync(new URL("../scripts/bootstrap.sh", import.meta.url), "utf8");
const repoRoot = new URL("..", import.meta.url).pathname;
const block = src.match(/^# ---- Customer Agent LAB: PingOne apps[\s\S]*?^# ---- end Customer Agent LAB step.*$/m)?.[0];

const NAMES = ["CAL_USER_CLIENT_ID", "CAL_USER_CLIENT_SECRET", "CAL_AGENT_CLIENT_ID", "CAL_AGENT_CLIENT_SECRET", "CAL_DEMO_USERNAME", "CAL_AGENT_GATEWAY_URL", "CAL_GATEWAY_AUDIENCE", "CAL_GATEWAY_SCOPE"];
// Sentinel values: if any of these ever appears in bootstrap's output, a value leaked.
const VALUES = {
  CAL_USER_CLIENT_ID: "sentinel-user-id-4f1c",
  CAL_USER_CLIENT_SECRET: "sentinel-user-secret-9d2e",
  CAL_AGENT_CLIENT_ID: "sentinel-agent-id-83ab",
  CAL_AGENT_CLIENT_SECRET: "sentinel-agent-secret-c07f",
  CAL_DEMO_USERNAME: "sentinel-demouser-51e8",
  CAL_AGENT_GATEWAY_URL: "https://sentinel-gw-6b2d.corp.test/mcp",
  CAL_GATEWAY_AUDIENCE: "https://sentinel-aud-e4c9.corp.test/mcp",
  CAL_GATEWAY_SCOPE: "sentinel:scope-2a90",
};
const OTHER = { PINGONE_ENVIRONMENT_ID: "sentinel-env-id-77aa", PINGONE_CLIENT_SECRET: "sentinel-old-secret-d31c" };
const ADMIN_SECRET = "sentinel-admin-secret-55bb";
const SENTINELS = [...Object.values(VALUES), ...Object.values(OTHER), ADMIN_SECRET];

const envText = (over = {}) => {
  const all = { ...OTHER, ...VALUES, ...over };
  return Object.entries(all).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
};
const COMPLETE = envText();
const PARTIAL = envText({ CAL_USER_CLIENT_ID: null, CAL_USER_CLIENT_SECRET: null, CAL_AGENT_CLIENT_ID: null, CAL_AGENT_CLIENT_SECRET: null });

const LINE = "node standalone/customer-agent-LAB/scripts/owner/pingone-real-setup.mjs";
const CREDS_TEXT = `PINGONE_REGION=com\nPINGONE_ADMIN_ENV_ID=sentinel-admin-env\nPINGONE_ADMIN_CLIENT_ID=sentinel-admin-id\nPINGONE_ADMIN_CLIENT_SECRET=${ADMIN_SECRET}\n`;

// env: text of the lab's .env (null = no file); creds: write the admin credentials file; tty/answer: whether and what the user
// types; preview/apply: exit codes of the stub setup script; dry: dry_run; lab: "full" (stub script), "none" (empty dir), "old"
// (checkout without the script), "missing" (no dir); runPingone: value of $run_pingone (null = unset, as when no flag was given);
// credEnv: "default" or a path for STANDALONE_CRED_FILE; sh: which bash.
function run({ env = PARTIAL, creds = true, tty = false, answer = "", preview = 0, apply = 0, dry = 0, lab = "full", runPingone = null, credEnv = "default", sh = "bash" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "bs-cal-"));
  const labDir = join(root, "standalone/customer-agent-LAB");
  const calls = join(root, "calls.log");
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  // anything else the block might run on a shared system would be recorded here
  for (const cmd of ["kubectl", "docker", "bash-ingress"]) {
    writeFileSync(join(bin, cmd), `#!/bin/sh\necho "${cmd} $*" >> "${root}/other-calls.log"\n`);
    chmodSync(join(bin, cmd), 0o755);
  }
  if (lab !== "missing") mkdirSync(labDir, { recursive: true });
  if (lab === "old") writeFileSync(join(labDir, "README.md"), "older checkout\n");
  if (lab === "full") {
    mkdirSync(join(labDir, "scripts/owner"), { recursive: true });
    writeFileSync(join(labDir, "scripts/owner/pingone-real-setup.mjs"), `import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(calls)}, "ARGS[" + args.join(" ") + "]\\n");
const apply = args.includes("--apply");
console.log(apply ? "APPLY-STUB-LINE app creation output" : "PREVIEW-STUB-LINE plan output");
const code = apply ? ${apply} : ${preview};
if (code) { console.error("failed: stub message from the setup script"); process.exit(code); }
`);
  }
  if (env !== null && (lab === "full" || lab === "old")) writeFileSync(join(labDir, ".env"), env);
  const credFile = credEnv === "default" ? join(root, ".config/demo-kit/provisioning.json") : credEnv;
  if (creds) { mkdirSync(dirname(credFile), { recursive: true }); writeFileSync(credFile, CREDS_TEXT); }
  const script = `set -eu; root="$1"; dry_run=${dry}; ${runPingone === null ? "" : `run_pingone=${runPingone};`} STEP_DETAIL=""
step() { printf 'STEP %s\\n' "$1"; }
step_ok() { echo "OK $1"; }
step_skip() { echo "SKIP $1"; }
step_warn() { echo "WARN $1"; printf '%b' "$STEP_DETAIL"; }
step_detail() { STEP_DETAIL="\${STEP_DETAIL}\${1}\\n"; }
is_interactive() { return ${tty ? 0 : 1}; }
${block}
echo "AFTER the block"`;
  const childEnv = { ...process.env, HOME: root, PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}` };
  delete childEnv.STANDALONE_CRED_FILE;
  if (credEnv !== "default") childEnv.STANDALONE_CRED_FILE = credEnv;
  const r = spawnSync(sh, ["-c", script, "_", root], { encoding: "utf8", input: answer, env: childEnv });
  const called = existsSync(calls) ? readFileSync(calls, "utf8") : "";
  const other = existsSync(join(root, "other-calls.log")) ? readFileSync(join(root, "other-calls.log"), "utf8") : "";
  return { status: r.status, out: r.stdout + r.stderr, called, other, root, labDir };
}

const noLeak = (r, label = "") => { for (const s of SENTINELS) assert.ok(!r.out.includes(s), `${label}: output leaked a value: ${s}\n${r.out}`); };
const REMAINING = /Still manual \(bootstrap never runs these/;

test("the block is found in bootstrap.sh and parses under bash", () => {
  assert.ok(block);
  assert.equal(spawnSync("bash", ["-n", join(repoRoot, "scripts/bootstrap.sh")]).status, 0);
});

// ---- already configured ----
test("settings complete: 'OK already configured' and nothing else; the script is not run", () => {
  for (const o of [{ tty: false }, { tty: true, answer: "y\n" }, { dry: 1 }, { creds: false }, { creds: false, tty: true, answer: "y\n" }]) {
    const r = run({ env: COMPLETE, ...o });
    assert.equal(r.status, 0, r.out);
    assert.equal(r.out, "STEP Customer Agent LAB: PingOne apps for full Real\nOK already configured\nAFTER the block\n", JSON.stringify(o));
    assert.equal(r.called, "");
    noLeak(r, "complete");
  }
});

test("quoted values, an export prefix and CRLF-free spacing still count as set", () => {
  const e = envText().split("\n").map((l, i) => (i % 3 === 0 && l ? `export ${l.replace(/=(.*)$/, '="$1"')}` : l)).join("\n");
  assert.match(run({ env: e }).out, /^OK already configured$/m);
});

test("each of the eight names is needed: leaving out, blanking or commenting out any one is not 'configured'", () => {
  for (const [i, n] of NAMES.entries()) {
    const hows = [["absent", envText({ [n]: null })], ["empty", envText({ [n]: "" })]];
    if (i === 0) hows.push(["empty quotes", envText({ [n]: '""' })], ["commented", envText({ [n]: null }) + `# ${n}=${VALUES[n]}\n`]);
    for (const [how, env] of hows) {
      const r = run({ env, tty: false });
      assert.doesNotMatch(r.out, /already configured/, `${n} ${how}`);
      assert.match(r.out, /^SKIP not run \(no prompt here\)/m, `${n} ${how}`);
    }
  }
});

test(".env.example placeholders are not settings (a copied .env.example is not 'configured')", () => {
  const example = envText({
    CAL_USER_CLIENT_ID: "00000000-0000-0000-0000-000000000000", CAL_USER_CLIENT_SECRET: "replace-me",
    CAL_AGENT_CLIENT_ID: "00000000-0000-0000-0000-000000000000", CAL_AGENT_CLIENT_SECRET: "replace-me",
    CAL_DEMO_USERNAME: "demo.user@example.invalid", CAL_AGENT_GATEWAY_URL: "https://agent-gateway.example/mcp",
    CAL_GATEWAY_AUDIENCE: "replace-me", CAL_GATEWAY_SCOPE: "replace-me",
  });
  assert.doesNotMatch(run({ env: example }).out, /already configured/);
  for (const n of NAMES) {
    const ph = { CAL_USER_CLIENT_ID: "00000000-0000-0000-0000-000000000000", CAL_USER_CLIENT_SECRET: "REPLACE-ME", CAL_AGENT_CLIENT_ID: "00000000-0000-0000-0000-000000000000", CAL_AGENT_CLIENT_SECRET: "replace-me", CAL_DEMO_USERNAME: "demo.user@example.invalid", CAL_AGENT_GATEWAY_URL: "https://agent-gateway.example/mcp", CAL_GATEWAY_AUDIENCE: "replace-me", CAL_GATEWAY_SCOPE: "replace-me" }[n];
    assert.doesNotMatch(run({ env: envText({ [n]: ph }) }).out, /already configured/, n);
  }
});

test("no .env at all is not configured", () => {
  assert.doesNotMatch(run({ env: null }).out, /already configured/);
});

// ---- the lab or the credentials are absent ----
test("admin credentials absent: one hint line naming the file, no question, no error, script not run", () => {
  for (const o of [{ tty: false }, { tty: true, answer: "y\n" }, { dry: 1 }]) {
    const r = run({ creds: false, ...o });
    assert.equal(r.status, 0, r.out);
    assert.equal(r.called, "");
    assert.equal(r.out.split("\n").filter((l) => /^(SKIP|WARN|FAIL)/.test(l)).length, 1, r.out);
    assert.match(r.out, /^SKIP optional; to offer it, PingOne admin credentials must be in ~\/\.config\/demo-kit\/provisioning\.json \(scripts\/pingone-setup\.sh writes that file\)$/m);
    assert.doesNotMatch(r.out, /\[y\/N\]|WARN|FAIL|failed/);
    assert.match(r.out, /AFTER the block/);
  }
});

test("an empty credentials file counts as absent", () => {
  const r = run({ creds: false });
  mkdirSync(join(r.root, ".config/demo-kit"), { recursive: true });
  writeFileSync(join(r.root, ".config/demo-kit/provisioning.json"), "");
  const again = spawnSync("bash", ["-c", `set -eu; root="$1"; dry_run=0; step(){ echo "STEP $1"; }; step_ok(){ echo "OK $1"; }; step_skip(){ echo "SKIP $1"; }; step_warn(){ echo "WARN $1"; }; is_interactive(){ return 1; }\n${block}`, "_", r.root], { encoding: "utf8", env: { ...process.env, HOME: r.root } });
  assert.match(again.stdout, /^SKIP optional; to offer it, PingOne admin credentials must be in/m);
});

test("STANDALONE_CRED_FILE moves the credentials file, and the hint names the file that was looked for", () => {
  const away = join(mkdtempSync(join(tmpdir(), "bs-cal-cred-")), "elsewhere.json");
  const absent = run({ creds: false, credEnv: away });
  assert.ok(absent.out.includes(`must be in ${away} (`), absent.out);
  assert.doesNotMatch(absent.out, /provisioning\.json/);
  const present = run({ credEnv: away, tty: false });
  assert.match(present.out, /^SKIP not run \(no prompt here\)/m);
});

test("customer-agent-LAB not checked out (no folder, or an empty submodule folder): skipped quietly", () => {
  for (const lab of ["missing", "none"]) {
    const r = run({ lab, tty: true, answer: "y\n" });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /^SKIP customer-agent-LAB not checked out \(optional\)$/m, lab);
    assert.equal(r.called, "");
    assert.doesNotMatch(r.out, /\[y\/N\]|WARN|FAIL/);
  }
});

test("an older checkout without the setup script is skipped with a plain reason, no crash", () => {
  const r = run({ lab: "old", tty: true, answer: "y\n" });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^SKIP this customer-agent-LAB checkout has no scripts\/owner\/pingone-real-setup\.mjs yet/m);
});

test("--no-pingone (run_pingone=0) skips it, even interactive", () => {
  const r = run({ runPingone: 0, tty: true, answer: "y\n" });
  assert.equal(r.called, "");
  assert.match(r.out, /^SKIP --no-pingone: mock mode$/m);
  assert.equal(run({ runPingone: 1, tty: false }).called, "");
  assert.match(run({ runPingone: 1, tty: false }).out, /^SKIP not run \(no prompt here\)/m);
});

// ---- interactive ----
test("interactive yes: the preview is shown first, then the question, then --apply", () => {
  const r = run({ tty: true, answer: "y\n" });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.called, "ARGS[]\nARGS[--apply]\n");
  const at = (s) => r.out.indexOf(s);
  assert.ok(at("PREVIEW-STUB-LINE") > -1 && at("PREVIEW-STUB-LINE") < at("[y/N]"), r.out);
  assert.ok(at("[y/N]") < at("APPLY-STUB-LINE"), r.out);
  assert.ok(at("APPLY-STUB-LINE") < at("OK two PingOne apps ready"), r.out);
  assert.match(r.out, /^OK two PingOne apps ready; standalone\/customer-agent-LAB\/\.env written \(backup first\)$/m);
  assert.match(r.out, /AFTER the block/);
  noLeak(r, "yes");
});

test("the one sentence before the question says what it creates, where, the gateway caveat and the backup", () => {
  const r = run({ tty: true, answer: "n\n" });
  const q = r.out.indexOf("[y/N]");
  const sentence = r.out.slice(0, q).split("\n").filter((l) => /creates two PingOne apps/.test(l));
  assert.equal(sentence.length, 1, r.out);
  const s = sentence[0];
  assert.match(s, /two PingOne apps in the environment named in standalone\/customer-agent-LAB\/\.env/);
  assert.match(s, /writes that file \(backed up first\)/);
  assert.match(s, /SE Agent Gateway only if that is the environment whose tokens the gateway accepts/);
  assert.match(s, /gateway accepts only the owner's environment/);
  assert.equal(s.trim().split(/(?<=\.)\s/).length, 1, "one sentence");
});

test("script output is passed through unchanged (preview and apply)", () => {
  const r = run({ tty: true, answer: "y\n" });
  assert.match(r.out, /^PREVIEW-STUB-LINE plan output$/m);
  // (no ^ here: the user's Enter is not echoed when stdin is a pipe, so the output continues the question line)
  assert.match(r.out, /APPLY-STUB-LINE app creation output$/m);
});

test("interactive 'yes', 'YES', 'Yes' and 'Y' also create the apps", () => {
  for (const a of ["yes\n", "YES\n", "Yes\n", "Y\n"]) assert.equal(run({ tty: true, answer: a }).called, "ARGS[]\nARGS[--apply]\n", a);
});

test("interactive no, empty answer (default N), end of input and anything else: the preview ran, --apply did NOT", () => {
  for (const a of ["n\n", "N\n", "\n", "", "no\n", "maybe\n", "yy\n", "yes please\n"]) {
    const r = run({ tty: true, answer: a });
    assert.equal(r.status, 0, r.out);
    assert.equal(r.called, "ARGS[]\n", `answer ${JSON.stringify(a)}: ${r.out}`);
    assert.match(r.out, new RegExp(`^SKIP not created \\(you said no\\); later: ${LINE.replace(/[.]/g, "\\.")} \\(preview\\), then ${LINE.replace(/[.]/g, "\\.")} --apply$`, "m"));
    assert.doesNotMatch(r.out, REMAINING);
    assert.doesNotMatch(r.out, /APPLY-STUB-LINE/);
  }
});

// ---- not interactive, or a dry run ----
test("non-interactive: neither preview nor apply, no question, one line with the command", () => {
  const r = run({ tty: false, answer: "y\n" });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.called, "");
  assert.equal(r.out.split("\n").filter((l) => /^SKIP/.test(l)).length, 1);
  assert.match(r.out, new RegExp(`^SKIP not run \\(no prompt here\\); preview: ${LINE.replace(/[.]/g, "\\.")}   then create: ${LINE.replace(/[.]/g, "\\.")} --apply$`, "m"));
  assert.doesNotMatch(r.out, /\[y\/N\]|PREVIEW-STUB|APPLY-STUB/);
  assert.doesNotMatch(r.out, REMAINING);
});

test("dry run: neither preview nor apply, no question even interactive, one line with the command", () => {
  const r = run({ dry: 1, tty: true, answer: "y\n" });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.called, "");
  assert.match(r.out, new RegExp(`^SKIP dry run: would preview, ask, then run: ${LINE.replace(/[.]/g, "\\.")} --apply$`, "m"));
  assert.doesNotMatch(r.out, /\[y\/N\]|PREVIEW-STUB|APPLY-STUB/);
  assert.doesNotMatch(r.out, REMAINING);
});

// ---- failures never abort ----
test("a failing preview: a WARN with the script's own message, no question, no apply, setup carries on", () => {
  const r = run({ tty: true, answer: "y\n", preview: 1 });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.called, "ARGS[]\n");
  assert.match(r.out, /^WARN the preview failed \(exit 1\): failed: stub message from the setup script; nothing was changed; setup carries on; retry: node standalone\/customer-agent-LAB\/scripts\/owner\/pingone-real-setup\.mjs$/m);
  assert.doesNotMatch(r.out, /\[y\/N\]/);
  assert.doesNotMatch(r.out, REMAINING);
  assert.match(r.out, /AFTER the block/);
});

test("a failing apply: a WARN with the script's own message, setup carries on, no remaining-steps text", () => {
  for (const code of [1, 2, 3]) {
    const r = run({ tty: true, answer: "y\n", apply: code });
    assert.equal(r.status, 0, r.out);
    assert.equal(r.called, "ARGS[]\nARGS[--apply]\n", "one try, no retry loop");
    assert.match(r.out, new RegExp(`^WARN creating the apps failed \\(exit ${code}\\): failed: stub message from the setup script; setup carries on; re-running reuses apps already made: ${LINE.replace(/[.]/g, "\\.")} --apply$`, "m"));
    assert.doesNotMatch(r.out, REMAINING);
    assert.match(r.out, /AFTER the block/);
    noLeak(r, "applyfail");
  }
});

test("a timeout (exit 142) is reported honestly, for the preview and for the apply", () => {
  assert.match(run({ tty: true, answer: "y\n", preview: 142 }).out, /^WARN the preview did not finish in 2 minutes; nothing was changed; setup carries on/m);
  const a = run({ tty: true, answer: "y\n", apply: 142 });
  assert.match(a.out, /^WARN creating the apps did not finish in 2 minutes; setup carries on/m);
  assert.equal(a.status, 0);
});

// ---- the remaining owner steps ----
test("after a successful apply the remaining owner steps are printed, with the exact commands", () => {
  const r = run({ tty: true, answer: "y\n" });
  assert.match(r.out, REMAINING);
  assert.match(r.out, /PingOne Authorize: add the new agent client id to HasValidActorChain\. One id, additive only: export first, diff exactly one added id\./);
  assert.match(r.out, /Checklist: standalone\/customer-agent-LAB\/scripts\/owner\/p1az-add-actor\.md/);
  assert.match(r.out, /SE ingress \(writes to the shared SE cluster\): cd standalone\/customer-agent-LAB && bash scripts\/owner\/agent-gateway-ingress\.sh$/m);
  assert.match(r.out, /^\s+then, once its preview looks right:\s+bash scripts\/owner\/agent-gateway-ingress\.sh --apply$/m);
  assert.match(r.out, /Rebuild the lab: cd standalone\/customer-agent-LAB && HOST_PORT=5603 docker compose up --build -d$/m);
  assert.ok(r.out.indexOf("OK two PingOne apps ready") < r.out.indexOf("Still manual"), "after the OK line");
});

test("the remaining-steps text is printed only after a successful apply, in no other state", () => {
  const others = [
    run({ env: COMPLETE }), run({ creds: false }), run({ lab: "missing" }), run({ lab: "old" }), run({ runPingone: 0 }),
    run({ tty: false }), run({ dry: 1, tty: true }), run({ tty: true, answer: "n\n" }), run({ tty: true, answer: "" }),
    run({ tty: true, answer: "y\n", preview: 1 }), run({ tty: true, answer: "y\n", apply: 1 }),
  ];
  for (const r of others) assert.doesNotMatch(r.out, REMAINING, r.out);
  assert.match(run({ tty: true, answer: "y\n" }).out, REMAINING);
});

test("bootstrap runs nothing on a shared system: no kubectl, docker or ingress call, and no --fix-act", () => {
  for (const o of [{ tty: true, answer: "y\n" }, { tty: false }, { dry: 1 }, { tty: true, answer: "y\n", apply: 1 }]) {
    const r = run(o);
    assert.equal(r.other, "", JSON.stringify(o));
    assert.doesNotMatch(r.called, /fix-act/);
  }
  // the ingress script and --fix-act appear in the block only as text it prints or as a name, never as a command it runs
  const executable = block.split("\n").filter((l) => !/^\s*#/.test(l) && !/printf '/.test(l)).join("\n");
  assert.doesNotMatch(executable, /agent-gateway-ingress|kubectl|fix-act|docker compose/);
});

// ---- secrets ----
test("no value from the stand-in .env, the .env of the lab or the admin credentials is ever printed", () => {
  const runs = [
    run({ env: COMPLETE }), run({ env: COMPLETE, creds: false }), run({ tty: true, answer: "y\n" }), run({ tty: true, answer: "n\n" }),
    run({ tty: false }), run({ dry: 1 }), run({ creds: false }), run({ tty: true, answer: "y\n", preview: 1 }), run({ tty: true, answer: "y\n", apply: 1 }),
    run({ lab: "old" }), run({ runPingone: 0 }),
  ];
  for (const [i, r] of runs.entries()) noLeak(r, `run ${i}`);
});

test("the block never traces or cats anything, and reads the lab's .env only through cal_set", () => {
  assert.doesNotMatch(block, /\bcat\b|set -x|xtrace/);
  const readers = block.split("\n").filter((l) => !/^\s*#/.test(l) && /\$cal_dir\/\.env/.test(l));
  assert.equal(readers.length, 1, readers.join("\n"));
  assert.match(readers[0], /^\s*v="\$\(grep -E /);
});

// ---- works under the bash macOS ships (3.2) and under set -eu ----
test("the block also runs under /bin/bash (macOS ships 3.2) and under set -eu", { skip: !existsSync("/bin/bash") }, () => {
  const yes = run({ tty: true, answer: "y\n", sh: "/bin/bash" });
  assert.equal(yes.status, 0, yes.out);
  assert.equal(yes.called, "ARGS[]\nARGS[--apply]\n");
  assert.match(yes.out, /^OK two PingOne apps ready/m);
  assert.match(run({ creds: false, sh: "/bin/bash" }).out, /must be in ~\/\.config\/demo-kit\/provisioning\.json/);
  assert.match(run({ env: COMPLETE, sh: "/bin/bash" }).out, /^OK already configured$/m);
  assert.equal(run({ tty: true, answer: "y\n", apply: 1, sh: "/bin/bash" }).status, 0);
});

// ---- the step count, the help and the docs ----
test("the step count is consistent: STEP_TOTAL equals the number of steps, and SETUP.md lists that many", () => {
  const total = Number(src.match(/^STEP_TOTAL=(\d+)$/m)[1]);
  const steps = [...src.matchAll(/^step "([^"]+)"$/gm)].map((m) => m[1]);
  assert.equal(steps.length, total, `steps: ${steps.join(" | ")}`);
  assert.equal(total, 16);
  assert.equal(steps[steps.length - 2], "Customer Agent LAB: PingOne apps for full Real", "just before the launcher");
  assert.equal(steps[steps.length - 3], "PingGateway");
  assert.equal(steps[steps.length - 1], "Launcher");
  const setup = readFileSync(join(repoRoot, "SETUP.md"), "utf8");
  const section = setup.match(/## What setup does[\s\S]*?(?=\n## |\n\*\*Existing install)/)[0];
  assert.match(section, new RegExp(`${total} steps, one status line each \\(\`\\[n/${total}\\] Step`));
  const listed = [...section.matchAll(/^(\d+)\. \*\*([^*]+)\*\*/gm)];
  assert.equal(listed.length, total, "SETUP.md lists every step");
  assert.deepEqual(listed.map((m) => Number(m[1])), Array.from({ length: total }, (_, i) => i + 1));
  assert.match(listed[total - 2][2], /Customer Agent LAB/);
});

test("--help (bootstrap and setup.sh) describes the step honestly", () => {
  const h = spawnSync("bash", [join(repoRoot, "scripts/bootstrap.sh"), "--help"], { encoding: "utf8" });
  assert.equal(h.status, 0);
  assert.match(h.stdout, /--non-interactive[\s\S]*the optional Customer Agent LAB PingOne apps are not created/);
  assert.match(h.stdout, /Customer Agent LAB, full Real \(optional, asked first\)/);
  assert.match(h.stdout, /y\/N \(default N\)/);
  assert.match(h.stdout, /backed\s+up first/);
  assert.match(h.stdout, /accepts tokens only from the owner's environment, so a colleague's own environment cannot\s+use it/);
  assert.match(h.stdout, /Authorize policy entry and the SE ingress stay manual/);
  // setup.sh is read, never run: it syncs and re-execs the canonical checkout under the real $HOME, even for --help.
  const setupSrc = readFileSync(join(repoRoot, "scripts/setup.sh"), "utf8");
  assert.match(setupSrc, /--non-interactive\s+Never ask a question \(the optional PingGateway and the Customer Agent LAB PingOne apps are then not started\)/);
});

test("the docs say the same: group E, README and SETUP.md", () => {
  const doc = readFileSync(join(repoRoot, "docs/REAL-PREREQUISITES.md"), "utf8");
  const e = doc.match(/^## E\. Owner only[\s\S]*?(?=\n## F\.)/m)[0];
  assert.match(e, /Bootstrap offers the PingOne apps/);
  assert.match(e, /Authorize policy entry and the SE ingress stay manual/);
  assert.match(e, /colleague's own PingOne environment cannot use the SE Agent Gateway/);
  assert.match(e, /agent-gateway-ingress\.sh/);
  const summary = doc.match(/<!-- summary:start -->[\s\S]*?<!-- summary:end -->/)[0];
  assert.match(summary, /Setup \(bootstrap\) offers its PingOne apps and asks first/);
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  assert.match(readme, /Customer Agent LAB/);
  assert.match(readme, /Authorize policy entry and the SE ingress stay manual/);
  const setup = readFileSync(join(repoRoot, "SETUP.md"), "utf8");
  assert.match(setup, /--non-interactive[^\n]*PingOne apps/);
});

test("the docs hold no secret, tenant id or uuid in what this change added", () => {
  for (const f of ["docs/REAL-PREREQUISITES.md", "README.md", "SETUP.md", "scripts/bootstrap.sh"]) {
    const t = readFileSync(join(repoRoot, f), "utf8");
    assert.doesNotMatch(t, /(?!0{8}-0{4}-0{4}-0{4}-0{12})[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, f);
  }
});
