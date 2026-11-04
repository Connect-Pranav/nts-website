// Dev Mode: token-gated console for the NTS agents that manage LinkedIn, Instagram and YouTube.
// Auth: Authorization: Bearer <DEV_TOKEN> (Worker secret, 8+ characters). Constant-time compare.
// Agents only draft text here. They cannot publish, spend money or touch any other project.
import { AGENTS, DEPARTMENTS } from './team.mjs';
import { HttpError, json, safeEqual, clientIp } from './util.mjs';
import { generate, engineStatus } from './providers.mjs';
import * as store from './store.mjs';
import * as work from './work.mjs';
import { generateImage } from './image.mjs';
import * as signals from './signals.mjs';
import * as analytics from './analytics.mjs';
import * as ops from './ops.mjs';
import * as brain from './brain.mjs';
import * as integ from './integrations.mjs';
import * as yt from './youtube.mjs';
import * as li from './linkedin.mjs';
import * as ig from './instagram.mjs';
import { TOOLS, callTool } from './tools.mjs';

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
  return AGENTS.map((a) => ({ id: a.id, name: a.name, team: a.dept, teamName: DEPARTMENTS[a.dept], role: `${a.code} agent`, code: a.code, mission: a.job, covers: a.covers, tools: a.tools, ntsRole: null, approvalRequired: a.approval, enabled: true }));
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Body must be JSON.');
  }
}

export async function handle(rawEnv, request, url, ctx) {
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
    if (!['gemini', 'groq', 'cloud'].includes(engine)) throw new HttpError(400, 'engine must be gemini, groq or cloud.');
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
  if (path === '/api/dev/brain/rules' && method === 'POST') return json(await store.addRule(rawEnv, await body(request)));
  const dr = path.match(/^\/api\/dev\/brain\/rules\/(\d{1,2})$/);
  if (dr && method === 'DELETE') return json(await store.deleteRule(rawEnv, dr[1]));
  if (path === '/api/dev/brain/feedback' && method === 'DELETE') return json(await store.clearFeedback(rawEnv));

  // Image generation (Gemini Flash Image -> Workers AI -> Pollinations)
  if (path === '/api/dev/image' && method === 'POST') {
    if (bump(runs, `img:${clientIp(request)}`, 60_000) > 8) throw new HttpError(429, 'Slow down: 8 images a minute.');
    return json(await generateImage(env, await body(request)));
  }

  // NTS COMMAND: Master Brain, operations, approvals
  if (path === '/api/dev/command' && method === 'POST') {
    if (bump(runs, `cmd:${clientIp(request)}`, 60_000) > 6) throw new HttpError(429, 'At most 6 commands a minute.');
    return brain.streamCommand(rawEnv, (await body(request))?.text, ctx);
  }
  if (path === '/api/dev/commands' && method === 'GET') return json({ commands: await brain.commands(rawEnv) });
  if (path === '/api/dev/ops' && method === 'GET') return json(await ops.getOps(rawEnv));
  if (path === '/api/dev/ops' && method === 'POST') return json(await ops.setOps(rawEnv, await body(request)));
  if (path === '/api/dev/tasks' && method === 'GET') return json({ tasks: await ops.tasks(rawEnv) });
  if (path === '/api/dev/tasks' && method === 'POST') return json({ task: await ops.createTask(rawEnv, { ...(await body(request)), status: 'backlog' }) });
  const tk = path.match(/^\/api\/dev\/tasks\/(t_[a-z0-9]{10,40})(?:\/(approve|reject))?$/);
  if (tk && tk[2] && method === 'POST') return json({ task: await brain.decideTask(rawEnv, tk[1], tk[2], (await body(request))?.reason) });
  if (tk && !tk[2] && method === 'POST') return json({ task: await ops.updateTask(rawEnv, tk[1], await body(request)) });
  if (path === '/api/dev/events' && method === 'GET') return json({ events: await ops.events(rawEnv, 60) });
  if (path === '/api/dev/overview' && method === 'GET') return json(await overview(rawEnv, env));
  if (path === '/api/dev/memory/search' && method === 'GET') return json({ results: await store.searchMemory(rawEnv, url.searchParams.get('q') || '', 30) });
  if (path === '/api/dev/tools' && method === 'GET') return json({ tools: Object.entries(TOOLS).map(([n, t]) => ({ name: n, description: t.description, args: Object.keys(t.input), sensitive: Boolean(t.sensitive) })) });
  if (path === '/api/dev/tool' && method === 'POST') {
    const b = await body(request);
    if (!TOOLS[b?.name]) throw new HttpError(404, 'Unknown tool.');
    if (TOOLS[b.name].sensitive) throw new HttpError(403, 'Sensitive tool: use the Approvals center.');
    return json(await callTool(rawEnv, b.name, b.args || {}, { title: b.title || b.name, via: 'dashboard' }));
  }
  if (path === '/api/dev/social' && method === 'GET') return json({ comments: (await rawEnv.NTS_KV.get('social/comments', 'json')) || [], youtube: Boolean(env.YOUTUBE_API_KEY), instagram: Boolean(env.IG_ACCESS_TOKEN) });
  const sc = path.match(/^\/api\/dev\/social\/([\w-]{2,80})$/);
  if (sc && method === 'POST') {
    const b = await body(request);
    const list = (await rawEnv.NTS_KV.get('social/comments', 'json')) || [];
    const c = list.find((x) => x.id === sc[1]);
    if (!c) throw new HttpError(404, 'Comment not found.');
    if (typeof b?.reply === 'string') c.reply = b.reply.slice(0, 600);
    if (['pending', 'approved', 'replied', 'ignored', 'escalated'].includes(b?.status)) c.status = b.status;
    await rawEnv.NTS_KV.put('social/comments', JSON.stringify(list));
    if (b?.status) await ops.log(rawEnv, 'social', `Comment by ${c.author}: ${b.status}`);
    return json({ comment: c });
  }
  if (path === '/api/dev/instagram' && method === 'GET') return json(await ig.status(rawEnv, url.origin));
  if (path === '/api/dev/instagram/connect' && method === 'POST') return json(await ig.start(rawEnv, url.origin));
  if (path === '/api/dev/instagram' && method === 'DELETE') return json(await ig.disconnect(rawEnv));
  if (path === '/api/dev/instagram/analytics' && method === 'GET') return json(await ig.analytics(rawEnv));
  if (path === '/api/dev/linkedin' && method === 'GET') return json(await li.status(rawEnv, url.origin));
  if (path === '/api/dev/linkedin/connect' && method === 'POST') return json(await li.start(rawEnv, url.origin));
  if (path === '/api/dev/linkedin' && method === 'DELETE') return json(await li.disconnect(rawEnv));
  const lp = path.match(/^\/api\/dev\/linkedin\/publish\/(w_[a-z0-9]{10,40})$/);
  if (lp && method === 'POST') return json(await li.publish(rawEnv, lp[1]));
  if (path === '/api/dev/youtube' && method === 'GET') return json(await yt.status(rawEnv, url.origin));
  if (path === '/api/dev/youtube/connect' && method === 'POST') return json(await yt.start(rawEnv, url.origin));
  if (path === '/api/dev/youtube' && method === 'DELETE') return json(await yt.disconnect(rawEnv));
  const pub = path.match(/^\/api\/dev\/social\/([\w-]{2,80})\/publish$/);
  if (pub && method === 'POST') return json(await yt.publishReply(rawEnv, pub[1], (await body(request))?.reply));
  if (path === '/api/dev/leads' && method === 'POST') return json(await signals.addLead(rawEnv, await body(request)));

  // Signals (lead scraper + sources) and SOMA analytics
  if (path === '/api/dev/signals' && method === 'GET') return json(await signals.overview(rawEnv));
  if (path === '/api/dev/signals/scan' && method === 'POST') {
    if (bump(runs, `scan:${clientIp(request)}`, 60_000) > 3) throw new HttpError(429, 'Scan at most 3 times a minute.');
    await signals.scrape(rawEnv);
    return json(await signals.overview(rawEnv));
  }
  const ld = path.match(/^\/api\/dev\/signals\/leads\/([a-z]{2}_[A-Za-z0-9_-]{1,40})$/);
  if (ld && method === 'POST') {
    await signals.setLeadState(rawEnv, ld[1], (await body(request))?.state);
    return json(await signals.overview(rawEnv));
  }
  if (path === '/api/dev/analytics' && method === 'GET') return json(await analytics.report(rawEnv, { force: url.searchParams.get('refresh') === '1' }));
  if (path === '/api/dev/analytics/insights' && method === 'POST') {
    if (bump(runs, `ins:${clientIp(request)}`, 60_000) > 3) throw new HttpError(429, 'At most 3 analyses a minute.');
    return json(await analytics.report(rawEnv, { force: true, insights: true }));
  }

  // Work board: the agent team cycle (think -> plan -> execute -> learn)
  if (path === '/api/dev/work' && method === 'GET') return json(await work.getWork(rawEnv));
  if (path === '/api/dev/work/cycle' && method === 'POST') {
    if (bump(runs, clientIp(request), 60_000) > 20) throw new HttpError(429, 'Slow down: 20 runs a minute in dev mode.');
    const b = await body(request);
    return json(await work.runCycle(rawEnv, { focus: typeof b?.focus === 'string' ? b.focus : '', by: 'owner' }));
  }
  if (path === '/api/dev/work/autopilot' && method === 'POST') return json(await work.setAutopilot(rawEnv, (await body(request))?.on));
  const wi = path.match(/^\/api\/dev\/work\/(w_[a-z0-9]{10,40})(?:\/(approve|reject))?$/);
  if (wi && wi[2] && method === 'POST') return json(await work.decide(rawEnv, wi[1], wi[2], (await body(request))?.reason));
  if (wi && !wi[2] && method === 'DELETE') return json(await work.removeItem(rawEnv, wi[1]));
  if (wi && !wi[2] && method === 'POST') return json(await work.updateItem(rawEnv, wi[1], await body(request)));

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

/** Overview numbers: every value is counted from stored records or live integrations; null = not connected. */
async function overview(rawEnv, env) {
  const [tasks, w, sig, o, ev, snaps, cmds, usage] = await Promise.all([ops.tasks(rawEnv), work.getWork(rawEnv), signals.getSignals(rawEnv), ops.getOps(rawEnv), ops.events(rawEnv, 12), rawEnv.NTS_KV.get('an/snaps', 'json'), brain.commands(rawEnv), ops.usage(rawEnv)]);
  const eng = engineStatus(env);
  const week = Date.now() - 7 * 86400_000;
  const integrations = [
    ['AI engine', Object.values(eng).some((e) => e.configured)],
    ['YouTube API', Boolean(env.YOUTUBE_API_KEY)],
    ['GitHub', Boolean(env.GITHUB_TOKEN)],
    ['Sarvam voice', Boolean(env.SARVAM_API_KEY)],
    ['Instagram', Boolean(env.IG_ACCESS_TOKEN)],
    ['LinkedIn publishing', false],
  ];
  const running = new Set(tasks.filter((t) => t.status === 'in_progress' && t.agent).map((t) => t.agent));
  const lastRun = (id) => tasks.find((t) => t.agent === id);
  return {
    ops: o,
    kpis: {
      agents: AGENTS.length,
      runningTasks: tasks.filter((t) => t.status === 'in_progress').length,
      completed: tasks.filter((t) => t.status === 'completed').length + w.items.filter((i) => i.status === 'ready').length,
      completedWeek: tasks.filter((t) => t.status === 'completed' && Date.parse(t.updatedAt) >= week).length,
      newLeads: sig.leads.filter((l) => l.state === 'new').length,
      approvals: w.items.filter((i) => i.status === 'waiting').length + tasks.filter((t) => t.status === 'waiting').length,
      readyToPost: w.items.filter((i) => i.status === 'ready').length,
      deployments: null,
    },
    health: {
      brain: Object.values(eng).some((e) => e.configured),
      engines: Object.entries(eng).filter(([, e]) => e.configured).map(([k]) => k),
      runtime: true,
      integrations: { on: integrations.filter(([, x]) => x).length, total: integrations.length, list: integrations.map(([name, on]) => ({ name, on })) },
      automation: o.paused ? 'paused' : o.mode,
    },
    agents: AGENTS.map((a) => {
      const t = lastRun(a.id);
      return { id: a.id, name: a.name, code: a.code, dept: DEPARTMENTS[a.dept], job: a.job, status: running.has(a.id) ? 'running' : t?.status === 'failed' ? 'failed' : 'idle', last: t ? { title: t.title, status: t.status, at: t.updatedAt } : null };
    }),
    activity: ev,
    workflows: [
      ...cmds.slice(0, 4).map((c) => ({ id: c.id, name: c.outcome || c.text.slice(0, 60), kind: 'command', status: c.status, done: c.steps.filter((s) => ['completed', 'failed'].includes(s.status)).length, total: c.steps.length, at: c.at })),
      ...(w.last ? [{ id: 'cycle', name: `Team cycle: ${w.last.topic}`, kind: 'cycle', status: 'completed', done: w.last.count, total: w.last.count, at: w.last.at }] : []),
    ].slice(0, 5),
    growth: (snaps || []).filter((s) => Date.parse(s.fetchedAt) >= Date.now() - 8 * 86400_000).reverse().map((s) => ({ at: s.fetchedAt, subscribers: s.channel?.subscribers ?? null, views: s.channel?.totalViews ?? null })),
    usage,
  };
}
