import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.mjs';

const TOKEN = 'dev-token-0123456789abcdef';
const env = { DEV_TOKEN: TOKEN, GEMINI_API_KEY: 'g', ASSETS: { fetch: () => new Response('asset') } };
const req = (path, { token, method = 'GET', body, ip = '1.1.1.1' } = {}) =>
  new Request(`https://nts.test${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'cf-connecting-ip': ip, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

test('dev mode is locked without DEV_TOKEN', async () => {
  const r = await site.fetch(req('/api/dev/agents', { token: 'x' }), { ASSETS: env.ASSETS }, {});
  assert.equal(r.status, 503);
});

test('wrong token is rejected, right token lists every agent enabled', async () => {
  assert.equal((await site.fetch(req('/api/dev/agents', { token: 'wrong', ip: '2.2.2.2' }), env, {})).status, 401);
  const r = await site.fetch(req('/api/dev/agents', { token: TOKEN }), env, {});
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual(d.agents.map((a) => a.name), ['LinkedIn Content Writer', 'Social Media Manager', 'Growth & Analytics', 'Lead Response', 'Community Manager', 'DevOps']);
  assert.ok(d.agents.every((a) => a.enabled));
  assert.ok(!d.agents.some((a) => /sunverse|littleloop|foliocraft/i.test(a.id)));
});

test('lockout after 10 wrong tokens from one IP', async () => {
  for (let i = 0; i < 10; i++) await site.fetch(req('/api/dev/agents', { token: 'nope', ip: '3.3.3.3' }), env, {});
  const r = await site.fetch(req('/api/dev/agents', { token: TOKEN, ip: '3.3.3.3' }), env, {});
  assert.equal(r.status, 429);
});

test('run validates the task and calls the engine with the agent mission', async () => {
  const bad = await site.fetch(req('/api/dev/agents/ops_soma_analytics/run', { token: TOKEN, method: 'POST', body: { task: 'x' } }), env, {});
  assert.equal(bad.status, 400);
  const orig = globalThis.fetch;
  let sent;
  globalThis.fetch = async (_u, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Report ready' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 } }), { status: 200 });
  };
  try {
    const r = await site.fetch(req('/api/dev/agents/ops_soma_analytics/run', { token: TOKEN, method: 'POST', body: { task: 'Summarise this week' } }), env, {});
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.text, 'Report ready');
    assert.equal(d.engine, 'gemini');
    assert.match(sent.systemInstruction.parts[0].text, /Growth & Analytics/);
    assert.match(sent.systemInstruction.parts[0].text, /cannot publish/);
  } finally {
    globalThis.fetch = orig;
  }
});

test('unknown agent 404', async () => {
  const r = await site.fetch(req('/api/dev/agents/not_real/run', { token: TOKEN, method: 'POST', body: { task: 'hello there' } }), env, {});
  assert.equal(r.status, 404);
});

test('short 8-character token works', async () => {
  const r = await site.fetch(req('/api/dev/agents', { token: 'Nts@2026', ip: '9.9.9.9' }), { ...env, DEV_TOKEN: 'Nts@2026' }, {});
  assert.equal(r.status, 200);
});
