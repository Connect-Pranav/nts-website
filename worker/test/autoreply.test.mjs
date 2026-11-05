import test from 'node:test';
import assert from 'node:assert/strict';
import { eligible } from '../autoreply.mjs';

test('auto-reply only posts safe replies', () => {
  const ok = { status: 'pending', escalate: false, reply: 'Thanks!', sentiment: 'positive', intent: 'appreciation' };
  assert.ok(eligible(ok));
  assert.ok(eligible({ ...ok, intent: 'question', sentiment: 'neutral' }));
  assert.ok(!eligible({ ...ok, sentiment: 'negative' }));
  assert.ok(!eligible({ ...ok, intent: 'complaint' }));
  assert.ok(!eligible({ ...ok, escalate: true }));
  assert.ok(!eligible({ ...ok, status: 'escalated' }));
  assert.ok(!eligible({ ...ok, replyId: 'x' }));
  assert.ok(!eligible({ ...ok, reply: '' }));
  assert.ok(!eligible({ ...ok, intent: 'spam' }));
});
