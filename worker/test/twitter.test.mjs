import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.mjs';
import * as twitter from '../twitter.mjs';

function makeKV() {
  const m = new Map();
  return {
    m,
    get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    put: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
  };
}

const TOKEN = 'Nts@2026';
const req = (path, method = 'GET', b) =>
  new Request(`https://nts.test${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: b ? JSON.stringify(b) : undefined,
  });

test('X (Twitter): initial status is not connected', async () => {
  const env = { DEV_TOKEN: TOKEN, NTS_KV: makeKV(), ASSETS: { fetch: () => new Response('ok') } };
  const res = await (await site.fetch(req('/api/dev/x'), env, {})).json();
  assert.equal(res.connected, false);
  assert.equal(res.configured, false);
  assert.equal(res.targetAccount, '@NTS_Nikhil');
});

test('X (Twitter): start generates PKCE challenge and authorization URL', async () => {
  const env = {
    DEV_TOKEN: TOKEN,
    TWITTER_CLIENT_ID: 'x_client_id_123',
    TWITTER_CLIENT_SECRET: 'x_client_secret_abc',
    NTS_KV: makeKV(),
    ASSETS: { fetch: () => new Response('ok') },
  };

  const res = await (await site.fetch(req('/api/dev/x/connect', 'POST', {}), env, {})).json();
  assert.match(res.url, /twitter\.com\/i\/oauth2\/authorize/);
  assert.match(res.url, /code_challenge_method=S256/);
  assert.match(res.url, /code_challenge=/);
  assert.match(res.url, /state=/);

  const url = new URL(res.url);
  const state = url.searchParams.get('state');
  assert.ok(state);

  // Check state stored in KV
  const stored = await env.NTS_KV.get(`x/oauth/state/${state}`, 'json');
  assert.ok(stored?.verifier);
});

test('X (Twitter): callback exchanges code, reads user profile, and enables live status', async () => {
  const env = {
    DEV_TOKEN: TOKEN,
    TWITTER_CLIENT_ID: 'x_client_id_123',
    TWITTER_CLIENT_SECRET: 'x_client_secret_abc',
    NTS_KV: makeKV(),
    ASSETS: { fetch: () => new Response('ok') },
  };

  const { url } = await twitter.start(env, 'https://nts.test');
  const state = new URL(url).searchParams.get('state');

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.includes('/2/oauth2/token')) {
      return new Response(
        JSON.stringify({
          access_token: 'tw_access_token_val_123',
          refresh_token: 'tw_refresh_token_val_456',
          expires_in: 7200,
          scope: 'tweet.read tweet.write users.read offline.access',
        })
      );
    }
    if (u.includes('/2/users/me')) {
      return new Response(
        JSON.stringify({
          data: {
            id: '99887766',
            name: 'Nikhil Kumar',
            username: 'NTS_Nikhil',
            profile_image_url: 'https://pbs.twimg.com/profile_images/nikhil.jpg',
            public_metrics: { followers_count: 15400, following_count: 490, tweet_count: 720 },
          },
        })
      );
    }
    throw new Error('unexpected ' + u);
  };

  try {
    const cbRes = await site.fetch(new Request(`https://nts.test/api/x/callback?code=mock_code&state=${state}`), env, {});
    assert.equal(cbRes.status, 200);

    const st = await (await site.fetch(req('/api/dev/x'), env, {})).json();
    assert.equal(st.connected, true);
    assert.equal(st.username, 'NTS_Nikhil');
    assert.equal(st.followersCount, 15400);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('X (Twitter): publish validates length, handles idempotency, and dispatches via v2', async () => {
  const env = {
    DEV_TOKEN: TOKEN,
    TWITTER_ACCESS_TOKEN: 'live_token_abc',
    NTS_KV: makeKV(),
    ASSETS: { fetch: () => new Response('ok') },
  };
  await env.NTS_KV.put(
    'x/oauth/meta',
    JSON.stringify({
      id: '99887766',
      username: 'NTS_Nikhil',
      exp: Date.now() + 3600_000,
    })
  );

  const origFetch = globalThis.fetch;
  const dispatched = [];
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.includes('/2/tweets')) {
      dispatched.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ data: { id: '1855600000000000001', text: JSON.parse(init.body).text } }));
    }
    throw new Error('unexpected ' + u);
  };

  try {
    // Over length limit
    const longTweet = 'x'.repeat(281);
    const r1 = await site.fetch(req('/api/dev/x/publish', 'POST', { text: longTweet }), env, {});
    assert.equal(r1.status, 400);

    // Valid tweet
    const r2 = await site.fetch(
      req('/api/dev/x/publish', 'POST', {
        text: 'PostgreSQL vs MySQL: Which handles hash joins better? #SQL',
        idempotencyKey: 'idemp_key_1',
      }),
      env,
      {}
    );
    assert.equal(r2.status, 200);
    const d2 = await r2.json();
    assert.equal(d2.ok, true);
    assert.equal(d2.tweet.id, '1855600000000000001');
    assert.equal(dispatched[0].text, 'PostgreSQL vs MySQL: Which handles hash joins better? #SQL');

    // Duplicate idempotency check
    const r3 = await site.fetch(
      req('/api/dev/x/publish', 'POST', {
        text: 'PostgreSQL vs MySQL: Which handles hash joins better? #SQL',
        idempotencyKey: 'idemp_key_1',
      }),
      env,
      {}
    );
    const d3 = await r3.json();
    assert.equal(d3.already, true);
  } finally {
    globalThis.fetch = origFetch;
  }
});
