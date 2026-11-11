import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// bootstrap.sh offers ping-shared's minimal PingGateway (rule 20: probe, reuse, or OFFER; never silently), and ends
// with "What each lab needs for Real". Run the real blocks from bootstrap.sh in bash against stand-ins.
const src = readFileSync(new URL("../scripts/bootstrap.sh", import.meta.url), "utf8");
const repoRoot = new URL("..", import.meta.url).pathname;
const gwBlock = src.match(/^# ---- PingGateway \(optional[\s\S]*?^# ---- end PingGateway step.*$/m)?.[0];
const isInteractiveFn = src.match(/^is_interactive\(\).*$/m)?.[0];
const reqBlock = src.match(/^# ---- What each lab needs for Real[\s\S]*?^# ---- end Real prerequisites.*$/m)?.[0];
const doc = join(repoRoot, "docs/REAL-PREREQUISITES.md");

const GOOD = "GATEWAY_ISSUER=https://idp.corp.test/as\nGATEWAY_AUDIENCE=https://mcp.corp.test/\n";

// env: text of shared/ping-shared/.env (null = no file); probe: exit code of the stand-in probe.mjs;
// tty: whether the user can be asked; answer: what they type; start: exit code of the stand-in `up pinggateway`.
function run({ env = GOOD, probe = 1, tty = false, answer = "", start = 0, dry = 0, withScript = true, withProbe = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "bs-gw-"));
  const dir = join(root, "shared/ping-shared");
  mkdirSync(join(dir, "scripts"), { recursive: true });
  const calls = join(root, "calls.log");
  if (withScript) {
    const f = join(dir, "scripts/ping-shared.sh");
    writeFileSync(f, `#!/bin/bash\necho "$@" >> "${calls}"\necho "start output line"\nexit ${start}\n`);
    chmodSync(f, 0o755);
  }
  if (withProbe) writeFileSync(join(dir, "probe.mjs"), `process.exit(${probe});\n`);
  if (env !== null) writeFileSync(join(dir, ".env"), env);
  const script = `set -u; root="$1"; dry_run=${dry}; STEP_DETAIL=""
step() { printf 'STEP %s\\n' "$1"; }
step_ok() { echo "OK $1"; }
step_skip() { echo "SKIP $1"; }
step_warn() { echo "WARN $1"; printf '%b' "$STEP_DETAIL"; }
step_detail() { STEP_DETAIL="\${STEP_DETAIL}\${1}\\n"; }
is_interactive() { return ${tty ? 0 : 1}; }
${gwBlock}`;
  const r = spawnSync("bash", ["-c", script, "_", root], { encoding: "utf8", input: answer, env: { ...process.env, HOME: root } });
  const called = existsSync(calls) ? readFileSync(calls, "utf8") : "";
  return { status: r.status, out: r.stdout + r.stderr, called, root };
}

test("the blocks are found in bootstrap.sh", () => { assert.ok(gwBlock); assert.ok(isInteractiveFn); assert.ok(reqBlock); });

test("settings present + interactive yes: the gateway is started through ping-shared", () => {
  const r = run({ tty: true, answer: "y\n" });
  assert.equal(r.status, 0, r.out);
  assert.match(r.called, /^up pinggateway$/m);
  assert.match(r.out, /^OK started, health on http:\/\/127\.0\.0\.1:7809\/health/m);
  assert.match(r.out, /\[y\/N\]/);
});

test("the question names the host port from ping-shared/.env when it moved it", () => {
  const r = run({ env: GOOD + "PINGGATEWAY_HOST_PORT=7899\n", tty: true, answer: "y\n" });
  assert.match(r.out, /127\.0\.0\.1:7899\?/);
  assert.match(r.out, /health on http:\/\/127\.0\.0\.1:7899\/health/);
});

test("interactive 'YES' and 'yes' also start it", () => {
  for (const a of ["yes\n", "YES\n", "Y\n"]) assert.match(run({ tty: true, answer: a }).called, /up pinggateway/, a);
});

test("interactive no, empty answer (default N) and end of input: nothing is started", () => {
  for (const a of ["n\n", "\n", "", "no\n", "maybe\n"]) {
    const r = run({ tty: true, answer: a });
    assert.equal(r.called, "", `answer ${JSON.stringify(a)}: ${r.out}`);
    assert.match(r.out, /^SKIP not started \(you said no\); start it later: shared\/ping-shared\/scripts\/ping-shared\.sh up pinggateway/m);
  }
});

test("non-interactive: not started, one line saying how to start it, no question asked", () => {
  const r = run({ tty: false, answer: "y\n" });
  assert.equal(r.called, "");
  assert.match(r.out, /^SKIP configured, not started \(no prompt here\); start it: shared\/ping-shared\/scripts\/ping-shared\.sh up pinggateway$/m);
  assert.doesNotMatch(r.out, /\[y\/N\]/);
});

test("settings absent: one short hint naming the file and the two names, no error", () => {
  for (const env of [null, "", "# GATEWAY_ISSUER=https://x.test\n", "GATEWAY_ISSUER=https://idp.corp.test/as\n", "GATEWAY_AUDIENCE=https://mcp.corp.test/\n", "GATEWAY_ISSUER=\nGATEWAY_AUDIENCE=\n"]) {
    const r = run({ env, tty: true, answer: "y\n" });
    assert.equal(r.status, 0, r.out);
    assert.equal(r.called, "", `env ${JSON.stringify(env)}`);
    assert.match(r.out, /^SKIP optional; to use it set GATEWAY_ISSUER and GATEWAY_AUDIENCE in shared\/ping-shared\/\.env$/m);
    assert.doesNotMatch(r.out, /\[y\/N\]|WARN|FAIL/);
  }
});

test(".env.example placeholders do not count as settings", () => {
  const r = run({ env: "GATEWAY_ISSUER=https://issuer.example/as\nGATEWAY_AUDIENCE=https://mcp.example/\n", tty: true, answer: "y\n" });
  assert.equal(r.called, "");
  assert.match(r.out, /^SKIP optional; to use it set/m);
  const quoted = run({ env: `GATEWAY_ISSUER="https://idp.corp.test/as"\nGATEWAY_AUDIENCE='https://mcp.corp.test/'\n`, tty: true, answer: "y\n" });
  assert.match(quoted.called, /up pinggateway/);
});

test("a healthy gateway is reused: no question, nothing started", () => {
  const r = run({ probe: 0, tty: true, answer: "y\n" });
  assert.equal(r.called, "");
  assert.match(r.out, /^OK reusing the healthy gateway already on 127\.0\.0\.1:7809$/m);
  assert.doesNotMatch(r.out, /\[y\/N\]/);
  // even with no settings at all
  assert.match(run({ probe: 0, env: null }).out, /^OK reusing the healthy gateway/m);
});

test("dry run: nothing is started and no question is asked, even interactive", () => {
  const r = run({ dry: 1, tty: true, answer: "y\n" });
  assert.equal(r.called, "");
  assert.match(r.out, /^SKIP dry run: would ask, then run shared\/ping-shared\/scripts\/ping-shared\.sh up pinggateway$/m);
  assert.doesNotMatch(r.out, /\[y\/N\]/);
});

test("start failure: a WARN with the script's output, setup carries on (exit 0)", () => {
  const r = run({ tty: true, answer: "y\n", start: 1 });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^WARN did not start \(exit 1\); setup carries on; retry: shared\/ping-shared\/scripts\/ping-shared\.sh up pinggateway$/m);
  assert.match(r.out, /start output line/);
});

test("start timeout (exit 142) and a racing 'not configured' (exit 6) are reported honestly", () => {
  assert.match(run({ tty: true, answer: "y\n", start: 142 }).out, /^WARN did not finish in 5 minutes; setup carries on/m);
  assert.match(run({ tty: true, answer: "y\n", start: 6 }).out, /^SKIP settings missing/m);
});

test("an older ping-shared without the script is skipped without a crash", () => {
  const r = run({ withScript: false, tty: true, answer: "y\n" });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^SKIP ping-shared not checked out/m);
});

test("no probe.mjs (older pin) falls through to the settings check", () => {
  const r = run({ withProbe: false, tty: false });
  assert.match(r.out, /^SKIP configured, not started/m);
});

test("the gateway block never prints a setting value", () => {
  const secret = "GATEWAY_ISSUER=https://secret-issuer.corp.test/as\nGATEWAY_AUDIENCE=https://secret-aud.corp.test/\n";
  for (const o of [run({ env: secret, tty: true, answer: "y\n" }), run({ env: secret, tty: false }), run({ env: secret, dry: 1 })]) {
    assert.doesNotMatch(o.out, /secret-issuer|secret-aud/);
  }
});

test("is_interactive is false when stdin is not a terminal or --non-interactive was given", () => {
  const f = (flag) => spawnSync("bash", ["-c", `non_interactive=${flag}; ${isInteractiveFn}; is_interactive`], { encoding: "utf8", input: "" }).status;
  assert.notEqual(f(0), 0); // stdin is a pipe here
  assert.notEqual(f(1), 0);
});

test("bootstrap takes --non-interactive and documents it", () => {
  assert.match(src, /--non-interactive\) non_interactive=1 ;;/);
  assert.match(src, /^\s+--non-interactive\s+Never ask a question/m);
  const h = spawnSync("bash", [join(repoRoot, "scripts/bootstrap.sh"), "--help"], { encoding: "utf8" });
  assert.match(h.stdout, /--non-interactive/);
});

// ---- the closing section and the doc ----
test("the closing section prints the doc's summary and the doc path", () => {
  const r = spawnSync("bash", ["-c", `root="$1"; ${reqBlock}`, "_", repoRoot], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  for (const g of ["A  Nothing", "B  Your own PingOne", "C  A PingFederate", "D  A gateway", "E  Owner only"]) assert.ok(r.stdout.includes(g), g);
  assert.match(r.stdout, /Demo PingGateway MCP/);
  assert.match(r.stdout, /Not yet standalone/);
  assert.match(r.stdout, /Per lab, with where each is documented: docs\/REAL-PREREQUISITES\.md/);
  assert.ok(r.stdout.split("\n").length < 24, "concise: a short summary plus the path");
});

test("the closing section is the last thing bootstrap prints", () => {
  assert.ok(src.indexOf("# ---- What each lab needs for Real") > src.indexOf("Many labs running?"));
  assert.ok(src.trimEnd().endsWith("# ---- end Real prerequisites ---------------------------------------------------------------------------------------"));
});

const docText = existsSync(doc) ? readFileSync(doc, "utf8") : "";
const modulePaths = [...readFileSync(join(repoRoot, ".gitmodules"), "utf8").matchAll(/^\s*path\s*=\s*(\S+)/gm)].map((m) => m[1]);
const moduleNames = new Set(modulePaths.map((p) => p.split("/").pop()));

test("docs/REAL-PREREQUISITES.md exists and has the five groups and the honest marker", () => {
  assert.ok(docText.length > 1000);
  for (const h of [/^## A\. Nothing/m, /^## B\. Your own PingOne/m, /^## C\. A PingFederate/m, /^## D\. A gateway/m, /^## E\. Owner only/m]) assert.match(docText, h);
  assert.match(docText, /NOT YET STANDALONE: needs a repoint/);
  assert.match(docText, /standalone\/customer-agent-LAB\/scripts\/owner\//);
  assert.match(docText, /"Demo PingGateway MCP"/);
});

test("every lab named in the doc exists in .gitmodules", () => {
  const named = [...docText.matchAll(/`([A-Za-z0-9][A-Za-z0-9-]*-(?:LAB|lab))`/g)].map((m) => m[1]);
  assert.ok(named.length > 40, `only ${named.length} labs named`);
  const unknown = named.filter((n) => !moduleNames.has(n));
  assert.deepEqual([...new Set(unknown)], [], "names not in .gitmodules");
});

test("every standalone lab in .gitmodules is classified somewhere in the doc", () => {
  const missing = modulePaths.filter((p) => p.startsWith("standalone/")).map((p) => p.split("/").pop()).filter((n) => !docText.includes("`" + n + "`"));
  assert.deepEqual(missing, [], "labs missing from the doc (add a line, or the doc is stale)");
});

test("the 'not yet standalone' labs from the audit are all marked inline and listed", () => {
  const list = docText.match(/^## Not yet standalone, in one list[\s\S]*$/m)[0];
  const lines = docText.split("\n");
  for (const n of ["ping-services-stub-LAB", "ping-gateway-route-LAB", "muse-LAB", "jit-lab-LAB", "p1az-inspector-LAB", "mcp-tools-LAB", "pingone-mcp-inspector-LAB", "privilege-a2a-anthropic-demo-LAB", "observability-LAB", "pingcli-LAB", "pingone-events-LAB"]) {
    assert.ok(list.includes("`" + n + "`"), `${n} not in the one-list`);
    // the marker sits on the first line of its bullet; the lab may be named on that line or the continuation lines
    const hit = lines.some((l, i) => l.includes("NOT YET STANDALONE") && [l, lines[i + 1] ?? "", lines[i + 2] ?? ""].join(" ").includes("`" + n + "`"));
    assert.ok(hit, `${n} has no inline NOT YET STANDALONE marker`);
  }
});

test("the doc holds no secret, tenant id or uuid", () => {
  assert.doesNotMatch(docText, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.doesNotMatch(docText, /secret\s*[:=]\s*[A-Za-z0-9]{12,}/i);
});
