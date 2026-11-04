// Dev Mode: token-gated console for the NTS agents that manage LinkedIn, Instagram and YouTube.
// Auth: Authorization: Bearer <DEV_TOKEN> (Worker secret, 8+ characters). Constant-time compare.
// Agents only draft text here. They cannot publish, spend money or touch any other project.
import NTS from '../agents/registry.json' with { type: 'json' };
import { HttpError, json, safeEqual, clientIp } from './util.mjs';
import { generate, engineStatus } from './providers.mjs';
import * as store from './store.mjs';

// Best-effort, per-isolate limits (no database needed). Cloudflare also rate-limits at the edge.
const fails = new Map();
const runs = new Map();
function bump(map, key, windowMs) {
  const now = Date.now();
  const e = map.get(key);
  if (!e || now - e.t > windowMs) {
    map.set(key, { t: now, n: 1 });
    return 1;
  }
  e.n += 1;
  return e.n;
}

export function authorize(env, request) {
  if (!env.DEV_TOKEN || env.DEV_TOKEN.length < 8) throw new HttpError(503, 'Dev mode is locked: set a DEV_TOKEN secret (8+ characters) on the Worker.');
  const ip = clientIp(request);
  const f = fails.get(ip);
  if (f && f.n >= 10 && Date.now() - f.t < 15 * 60_000) throw new HttpError(429, 'Too many wrong tokens. Try again in 15 minutes.');
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token || !safeEqual(token, env.DEV_TOKEN)) {
    bump(fails, ip, 15 * 60_000);
    throw new HttpError(401, 'Invalid dev token.');
  }
  fails.delete(ip);
}

/** Only the agents NTS needs (registry entries with dev: true). Orchestration runs behind the scenes. */
export function catalogue() {
  return NTS.agents
    .filter((a) => a.selected && a.dev)
    .map((a) => ({
      id: a.id,
      name: a.label,
      team: 'nts',
      teamName: 'NIKHILs TECH STUDIO',
      role: `${a.name} agent`,
      mission: a.scope,
      ntsRole: null,
      approvalRequired: a.approvalRequired ?? [],
      enabled: true,
    }));
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Body must be JSON.');
  }
}

export async function handle(rawEnv, request, url) {
  authorize(rawEnv, request);
  const env = await store.withSettings(rawEnv);
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/dev/session' && method === 'POST') return json({ ok: true, engines: engineStatus(env), agents: catalogue().length });
  if (path === '/api/dev/agents' && method === 'GET') return json({ agents: catalogue(), engines: engineStatus(env) });

  // Settings
  if (path === '/api/dev/settings' && method === 'GET') return json({ settings: await store.listSettings(rawEnv), engines: engineStatus(env) });
  if (path === '/api/dev/settings' && method === 'POST') {
    const settings = await store.saveSetting(rawEnv, await body(request));
    return json({ settings, engines: engineStatus(await store.withSettings(rawEnv)) });
  }
  const del = path.match(/^\/api\/dev\/settings\/([A-Z_]{3,40})$/);
  if (del && method === 'DELETE') {
    const settings = await store.deleteSetting(rawEnv, del[1]);
    return json({ settings, engines: engineStatus(await store.withSettings(rawEnv)) });
  }
  if (path === '/api/dev/settings/test' && method === 'POST') {
    const { engine } = await body(request);
    if (!['gemini', 'groq'].includes(engine)) throw new HttpError(400, 'engine must be gemini or groq.');
    if (!engineStatus(env)[engine].configured) throw new HttpError(409, `${engine} key is not set.`);
    const r = await generate(env, { system: 'Reply with exactly: OK', prompt: 'Connection test', maxTokens: 20, only: engine });
    return json({ ok: true, engine: r.engine, model: r.model, latencyMs: r.latencyMs, reply: r.text.slice(0, 40) });
  }

  // Brain
  if (path === '/api/dev/brain' && method === 'GET') return json(await store.getBrain(rawEnv));
  if (path === '/api/dev/brain' && method === 'PUT') return json(await store.setKnowledge(rawEnv, await body(request)));
  if (path === '/api/dev/brain/reset' && method === 'POST') return json(await store.resetKnowledge(rawEnv));
  if (path === '/api/dev/brain/notes' && method === 'POST') return json(await store.addNote(rawEnv, await body(request)));
  const dn = path.match(/^\/api\/dev\/brain\/notes\/(note_[a-z0-9]{10,40})$/);
  if (dn && method === 'DELETE') return json(await store.deleteNote(rawEnv, dn[1]));

  // Run an agent (with the Brain)
  const m = path.match(/^\/api\/dev\/agents\/([a-z0-9_]{2,64})\/run$/);
  if (m && method === 'POST') {
    const agent = catalogue().find((a) => a.id === m[1]);
    if (!agent) throw new HttpError(404, 'Unknown agent.');
    if (bump(runs, clientIp(request), 60_000) > 20) throw new HttpError(429, 'Slow down: 20 runs a minute in dev mode.');
    const b = await body(request);
    const task = typeof b?.task === 'string' ? b.task.trim() : '';
    if (task.length < 3 || task.length > 4000) throw new HttpError(400, 'Task must be 3 to 4000 characters.');
    const system = `${await store.brainContext(rawEnv)}

You are the ${agent.name} for NIKHILs TECH STUDIO (agent id ${agent.id}). Channels: LinkedIn (Nikhil Kumar), Instagram @nikhil_techstudio, YouTube @NikhilsTechStudio.
Your job: ${agent.mission}
Rules: produce the deliverable as text only. You cannot publish, post, spend money, deploy or contact anyone. Flag anything that would need human approval${agent.approvalRequired.length ? ` (${agent.approvalRequired.join(', ')})` : ''}. Separate facts from assumptions; never invent numbers or sources.`;
    const r = await generate(env, { system, prompt: task, maxTokens: 2500 });
    return json({ agent: agent.id, text: r.text, engine: r.engine, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, latencyMs: r.latencyMs, costUsd: r.costUsd });
  }
  throw new HttpError(404, 'Not found.');
}
