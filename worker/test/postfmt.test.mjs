import test from 'node:test';
import assert from 'node:assert/strict';
import { lintPost, polishPost } from '../postfmt.mjs';

const draft = `◆ Hook: "Stop Googling answers."
◆ Slide 1: Identify the role.
◆ Slide 2: Prompt **Claude**.
◆ Takeaway: One prompt, one plan.
◆ CTA: What would you ask first?
#AI #Claude #AI`;

test('polishPost strips script labels and lays the post out for the feed', () => {
  const p = polishPost(draft);
  assert.equal(p, 'Stop Googling answers.\n\n→ Identify the role.\n→ Prompt Claude.\n\nOne prompt, one plan.\n\nWhat would you ask first?\n\n#AI #Claude');
  assert.equal(polishPost(p), p);
  assert.deepEqual(lintPost(p), []);
});

test('lintPost flags labels and promised links', () => {
  const issues = lintPost(`${draft}\nGet the free template, link in comments`);
  assert.ok(issues.some((m) => /labels/.test(m)));
  assert.ok(issues.some((m) => /link/.test(m)));
});

test('labels behind emoji bullets (🔹) are stripped too', () => {
  const t = '🔹 Hook: "Stop Googling."\n🔹 Slide 1: Identify the role.\n🔹 CTA: Which step is hardest?\n#AI';
  assert.equal(polishPost(t), 'Stop Googling.\n\n→ Identify the role.\n\nWhich step is hardest?\n\n#AI');
  assert.deepEqual(lintPost(polishPost(t)), []);
});
