import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.mjs';

function makeKV() {
  const m = new Map();
  return { m, get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k) };
}
const TOKEN = 'Nts@2026';
const req = (path, method = 'GET', b) => new Request(`https://nts.test${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: b ? JSON.stringify(b) : undefined });

test('YouTube sign-in: state-checked callback, encrypted refresh token, idempotent reply post', async () => {
  const env = { DEV_TOKEN: TOKEN, YT_CLIENT_ID: 'abc-123.apps.googleusercontent.com', YT_CLIENT_SECRET: 'GOCSPX-secretsecretsecret', NTS_KV: makeKV(), ASSETS: { fetch: () => new Response('ok') } };
  env.NTS_KV.m.set('social/comments', JSON.stringify([{ id: 'Ugzabc123', author: 'Ravi', text: 'Great video', reply: 'Thank you Ravi!', status: 'pending', url: 'https://www.youtube.com/watch?v=x&lc=Ugzabc123' }]));
  let st = await (await site.fetch(req('/api/dev/youtube'), env, {})).json();
  assert.deepEqual([st.configured, st.connected, st.redirectUri], [true, false, 'https://nts.test/api/yt/callback']);
  const { url } = await (await site.fetch(req('/api/dev/youtube/connect', 'POST', {}), env, {})).json();
  const state = new URL(url).searchParams.get('state');
  assert.match(url, /scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.force-ssl/);
  // forged state is rejected
  assert.equal((await site.fetch(new Request(`https://nts.test/api/yt/callback?code=x&state=${'a'.repeat(48)}`), env, {})).status, 400);
  const orig = globalThis.fetch;
  const posted = [];
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'ya29.x', refresh_token: '1//refresh-token-value-abc', expires_in: 3600 }));
    if (u.includes('channels?part=snippet&mine=true')) return new Response(JSON.stringify({ items: [{ id: 'UC1', snippet: { title: 'NIKHILs TECH STUDIO' } }] }));
    if (u.includes('/youtube/v3/comments')) {
      posted.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: 'Ugzabc123.reply1' }));
    }
    throw new Error('unexpected ' + u);
  };
  try {
    const cb = await site.fetch(new Request(`https://nts.test/api/yt/callback?code=4/abc&state=${state}`), env, {});
    assert.equal(cb.status, 200);
    assert.match(await cb.text(), /YouTube connected/);
    assert.ok(!JSON.stringify([...env.NTS_KV.m.values()]).includes('1//refresh-token-value-abc')); // stored encrypted
    st = await (await site.fetch(req('/api/dev/youtube'), env, {})).json();
    assert.equal(st.connected, true);
    assert.equal(st.channel.title, 'NIKHILs TECH STUDIO');
    // replay of the same state fails
    assert.equal((await site.fetch(new Request(`https://nts.test/api/yt/callback?code=4/abc&state=${state}`), env, {})).status, 400);
    let r = await site.fetch(req('/api/dev/social/Ugzabc123/publish', 'POST', { reply: 'Thank you so much Ravi!' }), env, {});
    assert.equal((await r.json()).replyId, 'Ugzabc123.reply1');
    assert.deepEqual(posted[0], { snippet: { parentId: 'Ugzabc123', textOriginal: 'Thank you so much Ravi!' } });
    r = await site.fetch(req('/api/dev/social/Ugzabc123/publish', 'POST', {}), env, {});
    assert.equal((await r.json()).already, true);
    assert.equal(posted.length, 1);
  } finally {
    globalThis.fetch = orig;
  }
});
