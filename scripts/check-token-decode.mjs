#!/usr/bin/env node
// Rule 24b guard (advisory): a lab that renders a JWT must do it through the shared decoded JsonPane.
// Fails when a web source file shows token-shaped strings via hand-rolled display sites instead of the
// shared pane, or hand-rolls JWT segment decoding. Advisory: exit 0 always, findings printed with ADVICE.
// Flip to enforced (exit 1 on findings) with CHECK_TOKEN_DECODE_ENFORCE=1 once the sweep completes.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const SKIP = new Set(["node_modules", "dist", ".git", "coverage"]);
const findings = [];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name), out); continue; }
    if (/\.(jsx?|mjs)$/.test(e.name) && !/\.test\.|JsonPane|safeText/.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}

const web = path.join(root, "web/src");
if (fs.existsSync(web)) {
  for (const f of walk(web)) {
    const rel = path.relative(root, f);
    let text; try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
    // Hand-rolled JWT segment decoding (base64url segment -> JSON.parse), outside the shared pane.
    if (/atob\(/.test(text) && /JSON\.parse/.test(text) && !/decodeSegment|fromB64u|unb64u|WebCrypto|crypto\.subtle/.test(text) && /eyJ|jwt|header|payload/i.test(text))
      findings.push(`${rel}: hand-rolled JWT decode (atob + JSON.parse); use decodeSegment from web/src/components/JsonPane.jsx`);
    // A raw JWT string piped into a display sink with no decoded view nearby.
    if (/eyJ[A-Za-z0-9_-]{8,}\./.test(text) && /dangerouslySetInnerHTML|innerHTML\s*=/.test(text))
      findings.push(`${rel}: JWT near an HTML sink; render through the shared pane as text only`);
  }
}
if (findings.length) {
  console.log(`check-token-decode (advisory): ${findings.length} finding(s)`);
  for (const f of findings) console.log(`  ADVICE ${f}`);
  if (process.env.CHECK_TOKEN_DECODE_ENFORCE === "1") process.exit(1);
} else {
  console.log("check-token-decode (advisory): clean");
}
process.exit(0);
