import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.mjs';
import { commentary, versions } from '../linkedin.mjs';

function makeKV() {
  const m = new Map();
  return { m, get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k) };
}
const TOKEN = 'Nts@2026';
const req = (path, method = 'GET', b) => new Request(`https://nts.test${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: b ? JSON.stringify(b) : undefined });

test('little-text escaping keeps hashtags; versions are recent months', () => {
  assert.equal(commentary('JOIN (inner) vs LEFT_JOIN @you #SQL #DataAnalytics'), 'JOIN \\(inner\\) vs LEFT\\_JOIN \\@you {hashtag|\\#|SQL} {hashtag|\\#|DataAnalytics}');
  assert.deepEqual(versions(new Date('2026-11-05T00:00:00Z')), ['202610', '202609', '202608', '202606']);
});

test('LinkedIn: connect (state-checked), post an approved draft once, refuse unapproved', async () => {
  const env = { DEV_TOKEN: TOKEN, LI_CLIENT_ID: '86abcxyz12', LI_CLIENT_SECRET: 'WPL_AP1.secret.value', NTS_KV: makeKV(), ASSETS: { fetch: () => new Response('ok') } };
  env.NTS_KV.m.set('work', JSON.stringify({ items: [
    { id: 'w_aaaaaaaaaaaa1', channel: 'LinkedIn', title: 'JOIN trap', body: 'Most freshers miss this. #SQL', status: 'ready' },
    { id: 'w_aaaaaaaaaaaa2', channel: 'LinkedIn', title: 'Draft', body: 'x', status: 'waiting' },
  ] }));
  const { url } = await (await site.fetch(req('/api/dev/linkedin/connect', 'POST', {}), env, {})).json();
  assert.match(url, /scope=openid\+profile\+w_member_social/);
  const state = new URL(url).searchParams.get('state');
  const orig = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.includes('/oauth/v2/accessToken')) return new Response(JSON.stringify({ access_token: 'AQV_access_token_value_1234567890', expires_in: 5184000, scope: 'openid,profile,w_member_social' }));
    if (u.includes('/v2/userinfo')) return new Response(JSON.stringify({ sub: 'abc123XYZ', name: 'Nikhil Kumar' }));
    if (u.includes('/rest/posts')) {
      sent.push({ body: JSON.parse(init.body), version: init.headers['linkedin-version'] });
      return new Response('', { status: 201, headers: { 'x-restli-id': 'urn:li:share:7300000000000000000' } });
    }
    throw new Error('unexpected ' + u);
  };
  try {
    const cb = await site.fetch(new Request(`https://nts.test/api/li/callback?code=abc&state=${state}`), env, {});
    assert.equal(cb.status, 200);
    let st = await (await site.fetch(req('/api/dev/linkedin'), env, {})).json();
    assert.deepEqual([st.connected, st.name], [true, 'Nikhil Kumar']);
    let r = await site.fetch(req('/api/dev/linkedin/publish/w_aaaaaaaaaaaa2', 'POST', {}), env, {});
    assert.equal(r.status, 409); // not approved
    r = await site.fetch(req('/api/dev/linkedin/publish/w_aaaaaaaaaaaa1', 'POST', {}), env, {});
    const d = await r.json();
    assert.equal(d.url, 'https://www.linkedin.com/feed/update/urn:li:share:7300000000000000000/');
    assert.equal(sent[0].body.author, 'urn:li:person:abc123XYZ');
    assert.equal(sent[0].body.commentary, 'Most freshers miss this. {hashtag|\\#|SQL}');
    r = await site.fetch(req('/api/dev/linkedin/publish/w_aaaaaaaaaaaa1', 'POST', {}), env, {});
    assert.equal((await r.json()).already, true);
    assert.equal(sent.length, 1);
  } finally {
    globalThis.fetch = orig;
  }
});
