// The checker treats shared/story as a vendored pinned component (like JsonPane and diagram-kit):
// labs vendor web/src/story byte for byte (story.sha256 via checkPin.mjs), so the per-page rules
// must not judge those files. Regression: story.css's token-fallback literals tripped P7/P10 on
// allowlisted pages of a Story lab (cimd-LAB) once its pin was bumped.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCheck } from '../scripts/check-ui-patterns.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'ui-patterns');
const CANON = path.resolve(HERE, '..', 'shared', 'standalone-ui.css');

test('a story.css colour literal is not judged: web/src/story is vendored', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uistory-'));
  try {
    const app = path.join(dir, 'story-lab');
    fs.cpSync(path.join(FIX, 'clean-static'), app, { recursive: true });
    fs.copyFileSync(CANON, path.join(app, 'public', 'standalone-ui.css'));
    fs.mkdirSync(path.join(app, 'public', 'story'), { recursive: true });
    // a literal chip style exactly like shared/story/story.css line 17
    fs.writeFileSync(path.join(app, 'public', 'story', 'story.css'),
      '.story-chip{border:1px solid #d29a0e;color:#fde68a}\n');
    fs.writeFileSync(path.join(app, 'public', 'index.html'),
      fs.readFileSync(path.join(app, 'public', 'index.html'), 'utf8')
        .replace('</head>', '<link rel="stylesheet" href="story/story.css"></head>'));
    const res = runCheck({ appDirs: [app], allowlist: [], canonicalCss: CANON });
    const hits = res.pages.flatMap((pg) => pg.results).filter((r) => r.status === 'DRIFT' && (r.rule === 'T1' || r.rule === 'P7'));
    assert.deepEqual(hits, [], `story.css literals must be exempt (vendored); got: ${hits.map((h) => h.msg).join('; ')}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
