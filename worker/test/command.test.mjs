import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.mjs';
import { TOOLS } from '../tools.mjs';
import { AGENTS } from '../team.mjs';

function makeKV() {
  const m = new Map();
  return { m, get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k) };
}
const TOKEN = 'Nts@2026';
const base = () => ({ DEV_TOKEN: TOKEN, GEMINI_API_KEY: 'AQ.TESTKEY1234567890abcdefghijklmnop', NTS_KV: makeKV(), ASSETS: { fetch: () => new Response('ok') } });
const rpc = (env, body, token = TOKEN) => site.fetch(new Request('https://nts.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }), env, {});

test('roster: only needed agents, every agent tool exists', () => {
  assert.equal(AGENTS.length, 6);
  for (const a of AGENTS) for (const t of a.tools) assert.ok(TOOLS[t], `${a.id} -> ${t}`);
});

test('MCP over Streamable HTTP (SDK): auth, initialize, tools/list, tools/call, sensitive -> approval', async () => {
  const env = base();
  assert.equal((await rpc(env, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'wrong-token')).status, 401);
  let r = await rpc(env, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
  let d = await r.json();
  assert.equal(d.result.serverInfo.name, 'nts-brain');
  r = await rpc(env, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  d = await r.json();
  const names = d.result.tools.map((t) => t.name);
  assert.ok(names.includes('nts_search_memory') && names.includes('nts_create_linkedin_post'));
  assert.equal(d.result.tools.find((t) => t.name === 'nts_search_memory').inputSchema.required[0], 'query');
  r = await rpc(env, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nts_search_memory', arguments: { query: 'SQL interview' } } });
  d = await r.json();
  assert.ok(d.result.structuredContent.results.length > 0);
  r = await rpc(env, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nts_set_mode', arguments: { mode: 'manual' } } });
  d = await r.json();
  assert.equal(d.result.structuredContent.approvalRequired, true);
  const ops = await (await site.fetch(new Request('https://nts.test/api/dev/ops', { headers: { authorization: `Bearer ${TOKEN}` } }), env, {})).json();
  assert.equal(ops.mode, 'assisted');
  r = await rpc(env, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nts_search_memory', arguments: { query: 'x' } } });
  d = await r.json();
  assert.equal(d.result.isError, true); // zod: min 2 chars
});

test('Master Brain: plan -> delegate -> parallel execute -> hold sensitive -> report (SSE)', async () => {
  const orig = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async (u, init) => {
    const body = JSON.parse(init.body);
    const sys = body.systemInstruction?.parts?.[0]?.text || '';
    call++;
    let text;
    if (sys.includes('NTS MASTER BRAIN, the orchestrator')) text = JSON.stringify({ outcome: 'Two LinkedIn drafts + mode change', reply: 'Theek hai.', steps: [
      { id: 's1', title: 'Find past SQL lessons', agent: 'brain', tool: 'nts_search_memory', args: { query: 'SQL' } },
      { id: 's2', title: 'Draft LinkedIn posts', agent: 'ops_soma_analytics', tool: 'nts_create_linkedin_post', args: { topic: 'SQL JOIN traps', count: 2 } },
      { id: 's3', title: 'Switch to manual', agent: 'brain', tool: 'nts_set_mode', args: { mode: 'manual' } },
      { id: 's4', title: 'Bogus', agent: 'brain', tool: 'nts_publish_everything', args: {} },
    ] });
    else if (sys.includes('reporting back')) text = 'Done: 2 drafts waiting for approval. Mode change waiting for you.';
    else text = 'Post one hook\n---\nPost two hook';
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }));
  };
  try {
    const env = base();
    const res = await site.fetch(new Request('https://nts.test/api/dev/command', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'cf-connecting-ip': '6.6.6.6' }, body: JSON.stringify({ text: '2 LinkedIn posts banao aur manual mode karo' }) }), env, { waitUntil: () => {} });
    assert.match(res.headers.get('content-type'), /event-stream/);
    const sse = await res.text();
    const done = JSON.parse(sse.split('event: done\ndata: ')[1].split('\n')[0]);
    const by = Object.fromEntries(done.steps.map((s) => [s.id, s]));
    assert.equal(done.steps.length, 3); // unknown tool dropped
    assert.equal(by.s2.agent, 'ops_maya_docs'); // re-delegated to the tool owner
    assert.equal(by.s1.status, 'completed');
    assert.equal(by.s2.status, 'completed');
    assert.equal(by.s3.status, 'waiting');
    assert.equal(done.status, 'waiting');
    const ov = await (await site.fetch(new Request('https://nts.test/api/dev/overview', { headers: { authorization: `Bearer ${TOKEN}` } }), env, {})).json();
    assert.equal(ov.kpis.approvals, 3); // 2 drafts + 1 held step
    assert.equal(ov.ops.mode, 'assisted');
    const held = (await (await site.fetch(new Request('https://nts.test/api/dev/tasks', { headers: { authorization: `Bearer ${TOKEN}` } }), env, {})).json()).tasks.find((t) => t.status === 'waiting');
    const ap = await site.fetch(new Request(`https://nts.test/api/dev/tasks/${held.id}/approve`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: '{}' }), env, {});
    assert.equal((await ap.json()).task.status, 'completed');
    const o2 = await (await site.fetch(new Request('https://nts.test/api/dev/ops', { headers: { authorization: `Bearer ${TOKEN}` } }), env, {})).json();
    assert.equal(o2.mode, 'manual');
    assert.ok(ov.usage.tokens.gemini.calls >= 2);
  } finally {
    globalThis.fetch = orig;
  }
});
