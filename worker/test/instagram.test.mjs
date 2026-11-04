import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.mjs';

function makeKV() {
  const m = new Map();
  return { m, get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k) };
}
const TOKEN = 'Nts@2026';
const req = (path, method = 'GET', b) => new Request(`https://nts.test${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: b ? JSON.stringify(b) : undefined });

test('Instagram: connect -> long-lived token, analytics, comments analysed, approved reply posted once', async () => {
  const env = { DEV_TOKEN: TOKEN, GEMINI_API_KEY: 'AQ.TESTKEY1234567890abcdefghijklmnop', IG_APP_ID: '1234567890', IG_APP_SECRET: 'abcdef0123456789abcdef0123456789', NTS_KV: makeKV(), ASSETS: { fetch: () => new Response('ok') } };
  const { url } = await (await site.fetch(req('/api/dev/instagram/connect', 'POST', {}), env, {})).json();
  assert.match(url, /instagram_business_manage_comments/);
  const state = new URL(url).searchParams.get('state');
  const orig = globalThis.fetch;
  const replies = [];
  globalThis.fetch = async (u, init) => {
    const s = String(u);
    if (s.includes('api.instagram.com/oauth/access_token')) return new Response(JSON.stringify({ access_token: 'IGQshort', user_id: 1 }));
    if (s.includes('graph.instagram.com/access_token')) return new Response(JSON.stringify({ access_token: 'IGAA' + 'x'.repeat(60), expires_in: 5184000 }));
    if (s.includes('/me?')) return new Response(JSON.stringify({ user_id: '17841', username: 'nikhil_techstudio', followers_count: 420, follows_count: 10, media_count: 2 }));
    if (s.includes('/me/media')) return new Response(JSON.stringify({ data: [{ id: 'm1', caption: 'SQL tip', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/abc/', timestamp: '2026-11-01T10:00:00+0000', like_count: 30, comments_count: 2 }] }));
    if (s.includes('/m1/insights')) return new Response(JSON.stringify({ data: [{ name: 'reach', values: [{ value: 900 }] }, { name: 'saved', values: [{ value: 12 }] }] }));
    if (s.includes('/m1/comments')) return new Response(JSON.stringify({ data: [{ id: 'c1', text: 'Kya ye free hai?', username: 'ravi', timestamp: '2026-11-02T10:00:00+0000' }, { id: 'c2', text: 'thanks!', username: 'nikhil_techstudio', timestamp: '2026-11-02T11:00:00+0000' }] }));
    if (s.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [{ id: 'c1', intent: 'question', sentiment: 'neutral', language: 'Hinglish', escalate: false, reply: 'Haan Ravi, bilkul free hai 🙂' }] }) }] } }] }));
    if (s.includes('/c1/replies')) {
      replies.push(new URL(s).searchParams.get('message'));
      return new Response(JSON.stringify({ id: 'r1' }));
    }
    throw new Error('unexpected ' + s);
  };
  try {
    const cb = await site.fetch(new Request(`https://nts.test/api/ig/callback?code=abc%23_&state=${state}`), env, {});
    assert.equal(cb.status, 200);
    const st = await (await site.fetch(req('/api/dev/instagram'), env, {})).json();
    assert.deepEqual([st.connected, st.username], [true, 'nikhil_techstudio']);
    const an = await (await site.fetch(req('/api/dev/instagram/analytics'), env, {})).json();
    assert.equal(an.account.followers, 420);
    assert.equal(an.posts[0].reach, 900);
    const t = await (await site.fetch(req('/api/dev/tool', 'POST', { name: 'nts_analyze_comments' }), env, {})).json();
    assert.equal(t.result.analysed, 1); // own comment skipped
    const r = await (await site.fetch(req('/api/dev/social/c1/publish', 'POST', {}), env, {})).json();
    assert.equal(r.replyId, 'r1');
    assert.deepEqual(replies, ['Haan Ravi, bilkul free hai 🙂']);
  } finally {
    globalThis.fetch = orig;
  }
});
