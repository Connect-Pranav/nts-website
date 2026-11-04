// Dev Mode: token-gated access to every agent (NTS bindings + full Ganesha catalogue), all enabled.
// Auth: Authorization: Bearer <DEV_TOKEN> (Worker secret, 24+ characters). Constant-time compare.
// Agents only draft text here. They cannot publish, spend money or touch any other project.
import NTS from '../agents/registry.json' with { type: 'json' };
import CATALOG from '../agents/ganesha-catalog.snapshot.json' with { type: 'json' };
import { HttpError, json, safeEqual, clientIp } from './util.mjs';
import { generate, engineStatus } from './providers.mjs';
import { BRAND } from './agents.mjs';

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
  if (!env.DEV_TOKEN || env.DEV_TOKEN.length < 24) throw new HttpError(503, 'Dev mode is locked: set a DEV_TOKEN secret (24+ characters) on the Worker.');
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

const NTS_ROLE = Object.fromEntries(NTS.agents.map((a) => [a.id, a]));

export function catalogue() {
  const agents = CATALOG.agents.map((a) => ({
    id: a.id,
    name: a.name,
    team: a.team,
    teamName: CATALOG.teams[a.team]?.name ?? a.team,
    role: a.role,
    mission: a.mission,
    ntsRole: NTS_ROLE[a.id]?.label ?? null,
    approvalRequired: a.approvalRequired ?? [],
    enabled: true,
  }));
  const dal = NTS.agents.find((a) => a.id === 'dal_abba');
  if (dal) agents.unshift({ id: dal.id, name: dal.name, team: 'nts', teamName: 'NIKHILs TECH STUDIO', role: dal.label, mission: dal.scope, ntsRole: dal.label, approvalRequired: [], enabled: true });
  return agents;
}

export async function handle(env, request, url) {
  authorize(env, request);
  if (url.pathname === '/api/dev/session' && request.method === 'POST') {
    return json({ ok: true, engines: engineStatus(env), agents: catalogue().length });
  }
  if (url.pathname === '/api/dev/agents' && request.method === 'GET') {
    return json({ agents: catalogue(), source: CATALOG.source, engines: engineStatus(env) });
  }
  const m = url.pathname.match(/^\/api\/dev\/agents\/([a-z0-9_]{2,64})\/run$/);
  if (m && request.method === 'POST') {
    const agent = catalogue().find((a) => a.id === m[1]);
    if (!agent) throw new HttpError(404, 'Unknown agent.');
    if (bump(runs, clientIp(request), 60_000) > 20) throw new HttpError(429, 'Slow down: 20 runs a minute in dev mode.');
    let body;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, 'Body must be JSON: {"task": "..."}');
    }
    const task = typeof body?.task === 'string' ? body.task.trim() : '';
    if (task.length < 3 || task.length > 4000) throw new HttpError(400, 'Task must be 3 to 4000 characters.');
    const system = `${BRAND}

You are ${agent.name}, ${agent.role} (agent id ${agent.id}), running in NIKHILs TECH STUDIO Dev Mode.
Your mission: ${agent.mission}
Rules: produce the deliverable as text only. You cannot publish, post, spend money, deploy or contact anyone. Flag anything that would need human approval${agent.approvalRequired.length ? ` (${agent.approvalRequired.join(', ')})` : ''}. Separate facts from assumptions; never invent numbers or sources.`;
    const r = await generate(env, { system, prompt: task, maxTokens: 2500 });
    return json({ agent: agent.id, text: r.text, engine: r.engine, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, latencyMs: r.latencyMs, costUsd: r.costUsd });
  }
  throw new HttpError(404, 'Not found.');
}
