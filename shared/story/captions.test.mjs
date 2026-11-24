// captions.js: parse the shared wording file and run the parity check. node --test shared/story/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCaptions, parity, CaptionsError } from './captions.js';

const FILE = `<!-- editing notes -->

# Opening Slide

## Title
Agents calling agents

## Lead
A2A hands work to another agent.

## Column A: Obvious way
- Each agent holds the other's credentials
- Nothing in the middle decides

## Column B: With a gateway
- Each agent shows its own identity

## Verdict
This is a real run.

---

# Closing Slide

## Title
That is the story

## Lead
Done.

## Column A: Seen
- one

## Column B: Not seen
- two

## Verdict
Bye.

---

# Slide: part2

## Title
Part 2

## Lead
An agent in AWS.

## Column A: Ways
- a

## Column B: Watch
- b

## Verdict
v

## Image
console-app.jpg

## Layout
wide

---

# Step: p1_intro

## Title
Ask the main agent

## Text
Type a question here. It answers {status}.

---

# Step: sample_intro

## Title
Simulated

## Text
This is a local stand-in.
`;

test('parses the opening, closing, slides and steps', () => {
  const c = parseCaptions(FILE);
  assert.equal(c.opening.title, 'Agents calling agents');
  assert.deepEqual(c.opening.colA, { heading: 'Obvious way', lines: ["Each agent holds the other's credentials", 'Nothing in the middle decides'] });
  assert.equal(c.closing.verdict, 'Bye.');
  assert.deepEqual(Object.keys(c.slides), ['part2']);
  assert.equal(c.slides.part2.image, 'console-app.jpg');
  assert.equal(c.slides.part2.wide, true);
  assert.equal(c.opening.image, null);
  assert.equal(c.opening.wide, false);
  assert.deepEqual(c.steps.p1_intro, { title: 'Ask the main agent', text: 'Type a question here. It answers {status}.' });
  assert.deepEqual(Object.keys(c.steps), ['p1_intro', 'sample_intro']);
});

test('a missing piece is an error that names it', () => {
  assert.throws(() => parseCaptions(FILE.replace('# Closing Slide', '# Slide: closing_x')), /no "# Closing Slide"/);
  assert.throws(() => parseCaptions(FILE.replace('## Text\nThis is a local stand-in.', '')), /step "sample_intro" needs both/);
  assert.throws(() => parseCaptions(FILE.replace('## Verdict\nv\n', '')), /Slide "part2" is missing a "## Verdict"/);
  assert.throws(() => parseCaptions(FILE.replace('- b\n', '')), /no "- " bullet lines/);
  assert.throws(() => parseCaptions(FILE + '\n---\n\n# Banner: x\n\n## Title\nt\n'), (e) => e instanceof CaptionsError && /unrecognised section heading/.test(e.message));
});

test('a repeated key is an error, not a silent overwrite', () => {
  assert.throws(() => parseCaptions(FILE + '\n---\n\n# Step: p1_intro\n\n## Title\nt\n\n## Text\nx\n'), /step "p1_intro" appears twice/);
});

test('parity: matching keys give no problems; either side missing a key is reported', () => {
  const c = parseCaptions(FILE);
  const keys = { steps: ['p1_intro', 'sample_intro'], slides: ['opening', 'closing', 'part2'] };
  assert.deepEqual(parity(c, keys), []);
  assert.deepEqual(parity(c, { ...keys, steps: ['p1_intro', 'sample_intro', 'p1_answer'] }), ['the demo has step "p1_answer" but captions.md does not']);
  assert.deepEqual(parity(c, { ...keys, steps: ['p1_intro'] }), ['captions.md has step "sample_intro" but the demo does not']);
  assert.deepEqual(parity(c, { ...keys, steps: ['p1_intro'] }, { allowUnused: ['sample_intro'] }), []);
  assert.deepEqual(parity(c, { ...keys, slides: ['opening', 'closing'] }), ['captions.md has slide "part2" but the demo does not']);
});

test('regression: a file saved with Windows line endings parses the same as one with Unix line endings', () => {
  assert.deepEqual(parseCaptions(FILE.replace(/\n/g, '\r\n')), parseCaptions(FILE));
});

test('regression: a closing --- with no newline after it does not leak into the last section', () => {
  const c = parseCaptions(FILE.trimEnd() + '\n\n---');
  assert.equal(c.steps.sample_intro.text, 'This is a local stand-in.');
  assert.equal(parseCaptions(FILE.trimEnd() + '\n\n---\n').steps.sample_intro.text, 'This is a local stand-in.');
});
