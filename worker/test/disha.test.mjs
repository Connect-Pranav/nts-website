import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.mjs';
import { cleanActions } from '../disha.mjs';

function makeKV() {
  const m = new Map();
  return { m, get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : t === 'arrayBuffer' ? m.get(k) : m.get(k)) : null), put: async (k, v) => void m.set(k, v) };
}
const TOKEN = 'Nts@2026';
const base = (extra = {}) => ({ DEV_TOKEN: TOKEN, GEMINI_API_KEY: 'AIzaTESTKEY1234567890abcdefghijklmnop', NTS_KV: makeKV(), ASSETS: { fetch: () => new Response('a') }, ...extra });
const post = (path, body, { token, ip = '5.5.5.5' } = {}) =>
  new Request(`https://nts.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

function mockGemini(reply) {
  const orig = globalThis.fetch;
  const seen = {};
  globalThis.fetch = async (u, init) => {
    seen.url = String(u);
    seen.body = JSON.parse(init.body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }), { status: 200 });
  };
  return { seen, restore: () => (globalThis.fetch = orig) };
}

test('public chat: answers with public knowledge, strips owner-only actions', async () => {
  const g = mockGemini({ reply: 'SQL Sprint dekhiye!', say: 'SQL Sprint देखिए!', actions: [{ type: 'navigate', value: '/academy' }, { type: 'run_agent', id: 'ops_maya_docs', value: 'x post' }, { type: 'navigate', value: '/dev' }] });
  try {
    const r = await site.fetch(post('/api/disha/chat', { messages: [{ role: 'user', text: 'SQL kaise seekhun?' }], page: '/' }), base(), {});
    const d = await r.json();
    assert.equal(r.status, 200);
    assert.equal(d.owner, false);
    assert.deepEqual(d.actions, [{ type: 'navigate', value: '/academy' }]);
    const sys = g.seen.body.systemInstruction.parts[0].text;
    assert.match(sys, /DISHA/);
    assert.match(sys, /SQL Sprint/);
    assert.doesNotMatch(sys, /run_agent/);
  } finally {
    g.restore();
  }
});

test('owner chat: gets Brain + agent actions', async () => {
  const g = mockGemini({ reply: 'LinkedIn writer ko kaam de diya.', actions: [{ type: 'run_agent', id: 'ops_maya_docs', value: 'Write a LinkedIn post on JOIN traps' }, { type: 'open_tab', value: 'brain' }] });
  try {
    const r = await site.fetch(post('/api/disha/chat', { messages: [{ role: 'user', text: 'JOIN trap pe LinkedIn post likho' }], page: '/dev' }, { token: TOKEN }), base(), {});
    const d = await r.json();
    assert.equal(d.owner, true);
    assert.deepEqual(d.actions.map((a) => a.type), ['run_agent', 'open_tab']);
    assert.match(g.seen.body.systemInstruction.parts[0].text, /NTS BRAIN/);
  } finally {
    g.restore();
  }
});

test('cleanActions rejects unknown agents and bad pages', () => {
  assert.deepEqual(cleanActions([{ type: 'run_agent', id: 'sunverse_tumburu_music_director', value: 'song' }, { type: 'navigate', value: '/evil' }, { type: 'open_link', value: 'YouTube' }], true), [{ type: 'open_link', value: 'youtube' }]);
});

test('voice endpoints are owner only; tts uses Sarvam with cap and cache', async () => {
  const env = base({ SARVAM_API_KEY: 'sk_sarvam_test_1234567890', DISHA_TTS_DAILY_CHARS: '20' });
  assert.equal((await site.fetch(post('/api/disha/tts', { text: 'Namaste' }), env, {})).status, 401);
  const orig = globalThis.fetch;
  let calls = 0;
  let sent;
  globalThis.fetch = async (u, init) => {
    calls++;
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ audios: [btoa('ID3fakeaudio')] }), { status: 200 });
  };
  try {
    let r = await site.fetch(post('/api/disha/tts', { text: 'Namaste' }, { token: TOKEN }), env, {});
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'audio/mpeg');
    assert.equal(sent.target_language_code, 'en-IN');
    assert.equal(sent.speaker, 'priya');
    r = await site.fetch(post('/api/disha/tts', { text: 'Namaste' }, { token: TOKEN }), env, {});
    assert.equal(calls, 1, 'second call served from cache');
    r = await site.fetch(post('/api/disha/tts', { text: 'This sentence is too long for the cap' }, { token: TOKEN }), env, {});
    assert.equal(r.status, 429);
  } finally {
    globalThis.fetch = orig;
  }
});
