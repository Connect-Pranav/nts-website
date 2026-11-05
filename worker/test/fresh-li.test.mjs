import test from 'node:test';
import assert from 'node:assert/strict';
import { getWork } from '../work.mjs';

const kv = (data) => {
  const m = new Map(Object.entries(data).map(([k, v]) => [k, JSON.stringify(v)]));
  return { get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v), m };
};

test('old unposted LinkedIn drafts are replaced once by fresh feed-ready drafts', async () => {
  const old = { id: 'w1', channel: 'LinkedIn', title: 'old', body: '🔹 Hook: "x"', status: 'ready', createdAt: '2026-11-05T10:00:00Z' };
  const posted = { ...old, id: 'w2', postedUrl: 'https://www.linkedin.com/feed/update/1' };
  const yt = { ...old, id: 'w3', channel: 'YouTube' };
  const NTS_KV = kv({ work: { items: [old, posted, yt] } });
  const w = await getWork({ NTS_KV });
  assert.deepEqual(w.items.filter((i) => i.channel !== 'LinkedIn' || i.postedUrl).map((i) => i.id), ['w2', 'w3']);
  const fresh = w.items.filter((i) => i.channel === 'LinkedIn' && !i.postedUrl);
  assert.equal(fresh.length, 3);
  assert.ok(fresh.every((i) => i.status === 'waiting' && !/Hook:|Slide \d/.test(i.body)));
  const again = await getWork({ NTS_KV });
  assert.equal(again.items.length, w.items.length);
});
