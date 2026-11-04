import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.mjs';
import { generate } from '../providers.mjs';

function makeKV() {
  const m = new Map();
  return { m, get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k) };
}
const TOKEN = 'Nts@2026';
const base = (extra = {}) => ({ DEV_TOKEN: TOKEN, GEMINI_API_KEY: 'AQ.TESTKEY1234567890abcdefghijklmnop', NTS_KV: makeKV(), ASSETS: { fetch: () => new Response('a') }, ...extra });
const req = (path, method = 'GET', b) => new Request(`https://nts.test${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'cf-connecting-ip': '9.9.9.9' }, body: b ? JSON.stringify(b) : undefined });

test('cycle -> board -> approve/reject -> lessons + example in Brain -> next cycle reads them', async () => {
  const orig = globalThis.fetch;
  const prompts = [];
  globalThis.fetch = async (u, init) => {
    const body = JSON.parse(init.body);
    prompts.push(body.contents[0].parts.at(-1).text);
    const out = { topic: 'SQL JOIN traps', why: 'top asked', summary: 'done', items: [
      { agent: 'ops_maya_docs', channel: 'LinkedIn', title: 'JOIN trap post', body: 'Hook...\nCTA', needs_approval: true },
      { agent: 'ops_lakshmi_growth', channel: 'Instagram', title: 'Reel script', body: 'Scene 1..', needs_approval: true },
      { agent: 'bogus', channel: 'Mars', title: 'SEO keywords', body: 'sql join, interview', needs_approval: false },
    ] };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }), { status: 200 });
  };
  try {
    const env = base();
    let r = await site.fetch(req('/api/dev/work/cycle', 'POST', { focus: 'freshers' }), env, {});
    let d = await r.json();
    assert.equal(r.status, 200, JSON.stringify(d));
    assert.equal(d.items.length, 3);
    assert.equal(d.items[2].agent, 'ops_soma_analytics');
    assert.equal(d.items[2].channel, 'All');
    assert.equal(d.items[2].status, 'ready');
    assert.match(prompts[0], /OWNER RULES[\s\S]*FOCUS ON: freshers/);
    const [a, b] = d.items;
    r = await site.fetch(req(`/api/dev/work/${a.id}/approve`, 'POST', {}), env, {});
    assert.equal((await r.json()).items[0].status, 'ready');
    r = await site.fetch(req(`/api/dev/work/${b.id}/reject`, 'POST', { reason: 'too salesy' }), env, {});
    assert.equal(r.status, 200);
    r = await site.fetch(req(`/api/dev/work/${b.id}/reject`, 'POST', {}), env, {});
    assert.equal(r.status, 409);
    const brain = await (await site.fetch(req('/api/dev/brain'), env, {})).json();
    assert.equal(brain.feedback.length, 2);
    assert.match(brain.feedback[0].text, /Rejected.*too salesy/);
    assert.match(brain.notes[0].title, /Approved example: JOIN trap post/);
    await site.fetch(req('/api/dev/work/cycle', 'POST', {}), env, {});
    assert.match(prompts[1], /RECENT OWNER FEEDBACK[\s\S]*too salesy/);
    assert.match(prompts[1], /RECENT TOPICS[^\n]*SQL JOIN traps/);
    assert.match(prompts[1], /Approved example: JOIN trap post/);
    r = await site.fetch(req('/api/dev/work/autopilot', 'POST', { on: false }), env, {});
    assert.equal((await r.json()).autopilot, false);
  } finally {
    globalThis.fetch = orig;
  }
});

test('retired model ids are rediscovered from the live list (Groq + Gemini)', async () => {
  const orig = globalThis.fetch;
  const used = [];
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.endsWith('/openai/v1/models')) return new Response(JSON.stringify({ data: [{ id: 'whisper-large' }, { id: 'qwen/qwen3.6-27b' }] }));
    if (u.includes('groq')) {
      const m = JSON.parse(init.body).model;
      used.push(m);
      if (m === 'openai/gpt-oss-120b') return new Response(JSON.stringify({ error: { message: 'The model `openai/gpt-oss-120b` does not exist' } }), { status: 404 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }));
    }
    if (u.includes('/models?pageSize')) return new Response(JSON.stringify({ models: [{ name: 'models/gemini-9.0-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-9.0-flash-lite', supportedGenerationMethods: ['generateContent'] }] }));
    used.push(u.split('/models/')[1]);
    if (u.includes('gemini-flash-latest')) return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }));
  };
  try {
    const r = await generate({ GROQ_API_KEY: 'gsk_x' }, { system: 's', prompt: 'p' });
    assert.equal(r.model, 'qwen/qwen3.6-27b');
    const g = await generate({ GEMINI_API_KEY: 'AQ.x' }, { system: 's', prompt: 'p' });
    assert.equal(g.model, 'gemini-9.0-flash');
  } finally {
    globalThis.fetch = orig;
  }
});

test('images: Gemini Flash Image first, then Pollinations; owner only', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (u) => {
    u = String(u);
    if (u.includes('generativelanguage')) return new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 });
    if (u.includes('image.pollinations.ai')) return new Response(new Uint8Array([255, 216, 255]), { headers: { 'content-type': 'image/jpeg' } });
    throw new Error('unexpected ' + u);
  };
  try {
    const env = base();
    const r = await site.fetch(req('/api/dev/image', 'POST', { prompt: 'SQL reel cover', aspect: '9:16' }), env, {});
    const d = await r.json();
    assert.equal(r.status, 200, JSON.stringify(d));
    assert.equal(d.data, '/9j/');
    assert.match(d.engine, /pollinations/);
    const anon = await site.fetch(new Request('https://nts.test/api/dev/image', { method: 'POST', body: '{}', headers: { 'cf-connecting-ip': '1.2.3.4' } }), env, {});
    assert.equal(anon.status, 401);
  } finally {
    globalThis.fetch = orig;
  }
});
