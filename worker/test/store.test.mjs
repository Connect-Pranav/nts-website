import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.mjs';

const TOKEN = 'Nts@2026';
function makeKV() {
  const m = new Map();
  return { m, get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v) };
}
const mk = (kv, extra = {}) => ({ DEV_TOKEN: TOKEN, NTS_KV: kv, ASSETS: { fetch: () => new Response('a') }, ...extra });
const req = (path, method = 'GET', body) =>
  new Request(`https://nts.test${path}`, { method, headers: { authorization: `Bearer ${TOKEN}`, 'cf-connecting-ip': '7.7.7.7', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const call = async (env, ...a) => {
  const r = await site.fetch(req(...a), env, { waitUntil() {} });
  return { status: r.status, body: await r.json() };
};

test('settings: save encrypted, list shows only last 4, invalid rejected, delete', async () => {
  const kv = makeKV();
  const env = mk(kv);
  let r = await call(env, '/api/dev/settings', 'POST', { name: 'GEMINI_API_KEY', value: 'not-a-key' });
  assert.equal(r.status, 400);
  r = await call(env, '/api/dev/settings', 'POST', { name: 'GEMINI_API_KEY', value: 'AIzaSyTESTKEY1234567890abcdefghijklmnop' });
  assert.equal(r.status, 200);
  const g = r.body.settings.find((s) => s.name === 'GEMINI_API_KEY');
  assert.equal(g.source, 'saved');
  assert.equal(g.preview, '••••mnop');
  assert.equal(r.body.engines.gemini.configured, true);
  assert.ok(!kv.m.get('settings').includes('AIzaSyTESTKEY'), 'stored encrypted');
  r = await call(env, '/api/dev/settings/GEMINI_API_KEY', 'DELETE');
  assert.equal(r.body.engines.gemini.configured, false);
});

test('Cloudflare secret wins over saved value', async () => {
  const env = mk(makeKV(), { GROQ_API_KEY: 'gsk_fromCloudflare1234567890abcd' });
  const r = await call(env, '/api/dev/settings');
  const g = r.body.settings.find((s) => s.name === 'GROQ_API_KEY');
  assert.equal(g.source, 'cloudflare');
  assert.equal(g.preview, '••••abcd');
});

test('brain: default knowledge, edit, notes add/delete, used in agent runs', async () => {
  const kv = makeKV();
  const env = mk(kv, { GEMINI_API_KEY: 'AIzaSyTESTKEY1234567890abcdefghijklmnop' });
  let r = await call(env, '/api/dev/brain');
  assert.equal(r.body.isDefault, true);
  assert.match(r.body.knowledge, /@NikhilsTechStudio/);
  r = await call(env, '/api/dev/brain', 'PUT', { knowledge: 'Always write in Hinglish. Brand: NIKHILs TECH STUDIO.' });
  assert.equal(r.body.knowledge, 'Always write in Hinglish. Brand: NIKHILs TECH STUDIO.');
  r = await call(env, '/api/dev/brain/notes', 'POST', { title: 'Best post', text: 'Carousel on JOIN traps got the most saves.' });
  const id = r.body.notes[0].id;
  const orig = globalThis.fetch;
  let sys;
  globalThis.fetch = async (_u, init) => {
    sys = JSON.parse(init.body).systemInstruction.parts[0].text;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'done' }] } }] }), { status: 200 });
  };
  try {
    const run = await call(env, '/api/dev/agents/ops_maya_docs/run', 'POST', { task: 'Write a LinkedIn post' });
    assert.equal(run.status, 200);
    assert.match(sys, /Always write in Hinglish/);
    assert.match(sys, /JOIN traps got the most saves/);
    assert.match(sys, /LinkedIn Content Writer/);
  } finally {
    globalThis.fetch = orig;
  }
  r = await call(env, `/api/dev/brain/notes/${id}`, 'DELETE');
  assert.equal(r.body.notes.length, 0);
});

test('saved Gemini key is used by agent runs', async () => {
  const kv = makeKV();
  const env = mk(kv);
  await call(env, '/api/dev/settings', 'POST', { name: 'GEMINI_API_KEY', value: 'AIzaSyTESTKEY1234567890abcdefghijklmnop' });
  const orig = globalThis.fetch;
  let key;
  globalThis.fetch = async (_u, init) => {
    key = init.headers['x-goog-api-key'];
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }), { status: 200 });
  };
  try {
    const t = await call(env, '/api/dev/settings/test', 'POST', { engine: 'gemini' });
    assert.equal(t.status, 200);
    assert.equal(key, 'AIzaSyTESTKEY1234567890abcdefghijklmnop');
  } finally {
    globalThis.fetch = orig;
  }
});
