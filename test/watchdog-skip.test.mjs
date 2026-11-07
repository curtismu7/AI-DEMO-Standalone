import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Pull is_skipped() out of the watchdog and run it alone in bash, so the real function is tested.
const src = readFileSync(new URL("../scripts/lab-proxy-watchdog.sh", import.meta.url), "utf8");
const fn = src.match(/^is_skipped\(\) \{[\s\S]*?^\}$/m)?.[0];

function skipped(listFile, name) {
  const r = spawnSync("bash", ["-c", `set -u; skip_file="$1"; ${fn}\nis_skipped "$2"`, "_", listFile, name]);
  return r.status === 0;
}
const listWith = (text) => { const f = join(mkdtempSync(join(tmpdir(), "wd-")), "skip"); writeFileSync(f, text); return f; };

test("is_skipped is found in the watchdog", () => assert.ok(fn));

test("no skip file means nothing is skipped", () => {
  assert.equal(skipped("/nonexistent/watchdog-skip", "ai-demo-ui"), false);
});

test("exact names and globs match", () => {
  const f = listWith("ai-demo-*\nhostile-mcp-hostile-mcp-1\n");
  assert.equal(skipped(f, "ai-demo-ui"), true);
  assert.equal(skipped(f, "hostile-mcp-hostile-mcp-1"), true);
  assert.equal(skipped(f, "obo-lab-obo-lab-1"), false);
});

test("comments, blank lines and surrounding spaces are ignored", () => {
  const f = listWith("# stopped on purpose\n\n  *-lab-*   # all labs\n");
  assert.equal(skipped(f, "obo-lab-obo-lab-1"), true);
  assert.equal(skipped(f, "learning-hub"), false);
});

test("a comment-only or empty file skips nothing", () => {
  assert.equal(skipped(listWith("# nothing\n"), "ai-demo-ui"), false);
  assert.equal(skipped(listWith(""), "ai-demo-ui"), false);
});

test("a last line with no trailing newline still counts", () => {
  assert.equal(skipped(listWith("ai-demo-*"), "ai-demo-ui"), true);
});

test("the proxy is not exempt in the function but step 1 is the only caller", () => {
  const callers = src.match(/is_skipped "\$c"/g) || [];
  assert.equal(callers.length, 1);
});
