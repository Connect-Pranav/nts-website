// Operations state for NTS COMMAND: operating mode + kill switch, task records, activity log.
// Stored in Workers KV (free tier). Every task has a traceable status:
// backlog -> planned -> in_progress -> waiting (approval) -> completed | failed
import { HttpError, newId, nowIso } from './util.mjs';

export const MODES = ['manual', 'assisted', 'autonomous'];
const STATUSES = ['backlog', 'planned', 'in_progress', 'waiting', 'completed', 'failed'];
const MAX_TASKS = 300;
const MAX_EVENTS = 200;

const kv = (env) => {
  if (!env.NTS_KV) throw new HttpError(503, 'Storage is not set up (NTS_KV binding missing).');
  return env.NTS_KV;
};

// ---------------- mode / kill switch ----------------
export async function getOps(env) {
  const o = env.NTS_KV ? await env.NTS_KV.get('ops', 'json') : null;
  return { mode: MODES.includes(o?.mode) ? o.mode : 'assisted', paused: Boolean(o?.paused), updatedAt: o?.updatedAt ?? null };
}
export async function setOps(env, body) {
  const o = await getOps(env);
  if (body?.mode !== undefined) {
    if (!MODES.includes(body.mode)) throw new HttpError(400, 'mode must be manual, assisted or autonomous.');
    o.mode = body.mode;
  }
  if (body?.paused !== undefined) o.paused = Boolean(body.paused);
  o.updatedAt = nowIso();
  await kv(env).put('ops', JSON.stringify(o));
  await log(env, 'system', o.paused ? 'All autonomous execution paused (kill switch)' : `Operating mode: ${o.mode}`);
  return o;
}

// ---------------- activity log ----------------
export async function log(env, kind, text, extra = {}) {
  if (!env.NTS_KV) return;
  const list = (await env.NTS_KV.get('events', 'json')) || [];
  list.unshift({ id: newId('e'), kind, text: String(text).slice(0, 240), at: nowIso(), ...extra });
  await env.NTS_KV.put('events', JSON.stringify(list.slice(0, MAX_EVENTS)));
}
export async function events(env, n = 30) {
  return ((env.NTS_KV && (await env.NTS_KV.get('events', 'json'))) || []).slice(0, n);
}

// ---------------- tasks ----------------
export async function tasks(env) {
  return (env.NTS_KV && (await env.NTS_KV.get('tasks', 'json'))) || [];
}
async function putTasks(env, list) {
  await kv(env).put('tasks', JSON.stringify(list.slice(0, MAX_TASKS)));
}

export async function createTask(env, t) {
  const list = await tasks(env);
  const task = {
    id: newId('t'),
    title: String(t.title || 'Task').slice(0, 160),
    agent: t.agent || null,
    tool: t.tool || null,
    args: t.args ?? null,
    status: STATUSES.includes(t.status) ? t.status : 'planned',
    commandId: t.commandId || null,
    priority: ['low', 'normal', 'high'].includes(t.priority) ? t.priority : 'normal',
    output: null,
    error: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ms: null,
  };
  list.unshift(task);
  await putTasks(env, list);
  return task;
}

export async function updateTask(env, id, patch) {
  const list = await tasks(env);
  const t = list.find((x) => x.id === id);
  if (!t) throw new HttpError(404, 'Task not found.');
  if (patch.status !== undefined && !STATUSES.includes(patch.status)) throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}.`);
  for (const k of ['status', 'output', 'error', 'ms', 'title', 'priority', 'approval']) if (patch[k] !== undefined) t[k] = patch[k];
  t.updatedAt = nowIso();
  await putTasks(env, list);
  return t;
}

export async function getTask(env, id) {
  const t = (await tasks(env)).find((x) => x.id === id);
  if (!t) throw new HttpError(404, 'Task not found.');
  return t;
}

// ---------------- usage (counters kept by providers/image/cloud) ----------------
export async function usage(env) {
  const day = new Date().toISOString().slice(0, 10);
  const get = async (k) => (env.NTS_KV ? Number(await env.NTS_KV.get(k)) || 0 : 0);
  const tok = (env.NTS_KV && (await env.NTS_KV.get(`usage/tokens/${day}`, 'json'))) || {};
  return { day, cloudBrainCalls: await get(`brain/cloud/${day}`), images: await get(`img/usage/${day}`), tokens: tok };
}

/** Called after every model call; tallies tokens per engine per day (cost estimate only if prices are set). */
export async function countTokens(env, r) {
  if (!env.NTS_KV || !r) return;
  const day = new Date().toISOString().slice(0, 10);
  const k = `usage/tokens/${day}`;
  const t = (await env.NTS_KV.get(k, 'json')) || {};
  const e = (t[r.engine] = t[r.engine] || { calls: 0, input: 0, output: 0, costUsd: 0 });
  e.calls += 1;
  e.input += r.inputTokens || 0;
  e.output += r.outputTokens || 0;
  e.costUsd += r.costUsd || 0;
  await env.NTS_KV.put(k, JSON.stringify(t), { expirationTtl: 40 * 86400 });
}
