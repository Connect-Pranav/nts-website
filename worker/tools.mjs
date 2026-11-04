// NTS BRAIN tool registry. One definition per tool, used by BOTH the MCP server (/mcp) and the
// Master Brain's command executor, so the dashboard and Claude Code call exactly the same code.
// Every tool validates input with zod, returns structured JSON and touches real data/integrations.
// `sensitive: true` tools never run from a plan without owner approval.
import { z } from 'zod';
import { HttpError } from './util.mjs';
import { generate } from './providers.mjs';
import * as store from './store.mjs';
import * as work from './work.mjs';
import * as signals from './signals.mjs';
import * as analytics from './analytics.mjs';
import * as ops from './ops.mjs';
import * as integ from './integrations.mjs';
import { generateImage } from './image.mjs';
import { AGENTS, DEPARTMENTS, agentById } from './team.mjs';

async function runAgent(rawEnv, agentId, task) {
  const agent = agentById(agentId);
  if (!agent) throw new HttpError(404, `Unknown agent ${agentId}.`);
  const env = await store.withSettings(rawEnv);
  const system = `${await store.brainContext(rawEnv)}

You are the ${agent.name} agent (${agent.code}) of NIKHILs TECH STUDIO. Your job: ${agent.job}
Rules: produce the deliverable as text only; you cannot publish, post, send, spend money or deploy. Separate facts from assumptions; never invent numbers, results or sources. Flag anything that needs owner approval.`;
  const r = await generate(env, { system, prompt: task, maxTokens: 2500 });
  await ops.countTokens(rawEnv, r);
  return { agent: agent.id, text: r.text, engine: r.engine, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
}

const AGENT_IDS = AGENTS.map((a) => a.id);

export const TOOLS = {
  nts_get_business_context: {
    description: 'NTS business context: brand, audience, channels, owner rules and lessons learned. Call before planning work.',
    input: {},
    run: async (env) => ({ context: await store.brainContext(env) }),
  },
  nts_search_memory: {
    description: 'Search NTS memory (knowledge, owner rules, lessons learned, notes) by keywords.',
    input: { query: z.string().min(2).max(200), limit: z.number().int().min(1).max(20).optional() },
    run: async (env, a) => ({ results: await store.searchMemory(env, a.query, a.limit ?? 8) }),
  },
  nts_save_memory: {
    description: 'Save a note to NTS memory. category: organization, brand, project, decision, execution or customer.',
    input: { title: z.string().min(2).max(120), text: z.string().min(3).max(4000), category: z.enum(store.MEMORY_CATEGORIES).optional() },
    run: async (env, a) => {
      const b = await store.addNote(env, { ...a, source: 'NTS Brain' });
      return { saved: b.notes[0] };
    },
  },
  nts_list_agents: {
    description: 'List the NTS specialist agents, their departments and tools.',
    input: {},
    run: async () => ({ agents: AGENTS.map((a) => ({ id: a.id, name: a.name, code: a.code, department: DEPARTMENTS[a.dept], job: a.job, tools: a.tools })) }),
  },
  nts_get_agent_status: {
    description: 'Status of one agent: running/idle, its latest tasks and failures.',
    input: { agent: z.enum(AGENT_IDS) },
    run: async (env, a) => {
      const mine = (await ops.tasks(env)).filter((t) => t.agent === a.agent);
      return { agent: a.agent, status: mine.some((t) => t.status === 'in_progress') ? 'running' : 'idle', completed: mine.filter((t) => t.status === 'completed').length, failed: mine.filter((t) => t.status === 'failed').length, recent: mine.slice(0, 5).map(({ id, title, status, updatedAt }) => ({ id, title, status, updatedAt })) };
    },
  },
  nts_create_task: {
    description: 'Create a backlog/planned task on the NTS work board (does not run it).',
    input: { title: z.string().min(3).max(160), agent: z.enum(AGENT_IDS).optional(), priority: z.enum(['low', 'normal', 'high']).optional(), status: z.enum(['backlog', 'planned']).optional() },
    run: async (env, a) => ({ task: await ops.createTask(env, { ...a, status: a.status || 'backlog' }) }),
  },
  nts_get_task_status: {
    description: 'Get a task by id, or the latest tasks when no id is given.',
    input: { id: z.string().max(60).optional() },
    run: async (env, a) => (a.id ? { task: await ops.getTask(env, a.id) } : { tasks: (await ops.tasks(env)).slice(0, 20) }),
  },
  nts_update_task: {
    description: 'Update a task status/title/priority.',
    input: { id: z.string().max(60), status: z.enum(['backlog', 'planned', 'in_progress', 'waiting', 'completed', 'failed']).optional(), title: z.string().max(160).optional(), priority: z.enum(['low', 'normal', 'high']).optional() },
    run: async (env, a) => ({ task: await ops.updateTask(env, a.id, a) }),
  },
  nts_get_execution_logs: {
    description: 'Recent NTS activity log (commands, agent runs, approvals, scans, deploy checks).',
    input: { limit: z.number().int().min(1).max(100).optional() },
    run: async (env, a) => ({ events: await ops.events(env, a.limit ?? 30) }),
  },
  nts_run_agent: {
    description: 'Run one specialist agent on a written task and return its text deliverable (drafts only).',
    input: { agent: z.enum(AGENT_IDS), task: z.string().min(3).max(4000) },
    run: async (env, a) => runAgent(env, a.agent, a.task),
  },
  nts_create_linkedin_post: {
    description: 'LinkedIn Content Writer drafts LinkedIn post(s) on a topic; each draft lands on the Work board waiting for approval.',
    input: { topic: z.string().min(3).max(500), count: z.number().int().min(1).max(5).optional() },
    run: async (env, a) => {
      const n = a.count ?? 1;
      const r = await runAgent(env, 'ops_maya_docs', `Write ${n} LinkedIn post(s) about: ${a.topic}. Separate posts with a line containing only "---". Each: hook line, short lines, one practical takeaway, 3-5 hashtags, one CTA.`);
      const posts = r.text.split(/\n-{3,}\n/).map((x) => x.trim()).filter(Boolean).slice(0, n);
      const items = await work.addItems(env, posts.map((body, i) => ({ agent: 'ops_maya_docs', channel: 'LinkedIn', title: `${a.topic.slice(0, 60)}${n > 1 ? ` (${i + 1})` : ''}`, body, status: 'waiting' })), `${r.engine} · ${r.model}`);
      return { drafted: items.length, items: items.map(({ id, title, status }) => ({ id, title, status })) };
    },
  },
  nts_run_content_cycle: {
    description: 'Full team content cycle: pick one opportunity from the Brain and draft LinkedIn, Instagram/YouTube and growth pieces (+ replies for fresh leads) onto the Work board.',
    input: { focus: z.string().max(300).optional() },
    run: async (env, a) => {
      const w = await work.runCycle(env, { focus: a.focus || '', by: 'brain' });
      return { last: w.last, waiting: w.items.filter((i) => i.status === 'waiting').length };
    },
  },
  nts_approve_content: {
    description: 'Approve or reject a Work board item (approval becomes a lesson and an example).',
    sensitive: true,
    input: { id: z.string().max(60), action: z.enum(['approve', 'reject']), reason: z.string().max(200).optional() },
    run: async (env, a) => {
      const w = await work.decide(env, a.id, a.action, a.reason || '');
      return { item: w.items.find((i) => i.id === a.id) };
    },
  },
  nts_get_leads: {
    description: 'Leads in the NTS CRM (scraped or added), optionally filtered by stage.',
    input: { stage: z.enum(signals.STAGES).optional(), limit: z.number().int().min(1).max(80).optional() },
    run: async (env, a) => {
      const s = await signals.getSignals(env);
      return { updated: s.updated, leads: s.leads.filter((l) => !a.stage || l.state === a.stage).slice(0, a.limit ?? 20) };
    },
  },
  nts_scan_leads: {
    description: 'Scan Hacker News, Reddit and Mastodon RSS now for people asking about SQL, data careers and AI tools.',
    input: {},
    run: async (env) => {
      const s = await signals.scrape(env);
      return { health: s.health, fresh: s.leads.filter((l) => l.state === 'new').length, total: s.leads.length };
    },
  },
  nts_draft_lead_reply: {
    description: 'Lead Response agent drafts a short, helpful reply for one lead (saved on the lead; never sent).',
    input: { id: z.string().max(60) },
    run: async (env, a) => {
      const l = (await signals.getSignals(env)).leads.find((x) => x.id === a.id);
      if (!l) throw new HttpError(404, 'Lead not found.');
      const r = await runAgent(env, 'ops_lead_response', `Draft a short public reply (max 90 words) to this ${l.source} post. Answer their actual question first; mention NIKHILs TECH STUDIO only if it genuinely helps.\nTitle: ${l.title}\nText: ${l.text}`);
      const lead = await signals.setLeadDraft(env, a.id, r.text);
      return { lead: { id: lead.id, state: lead.state, draft: lead.draft, url: lead.url } };
    },
  },
  nts_update_lead: {
    description: 'Move a lead to a CRM stage: new, drafted, contacted, responded, qualified, meeting, won, lost, ignored.',
    input: { id: z.string().max(60), stage: z.enum(signals.STAGES) },
    run: async (env, a) => {
      const s = await signals.setLeadState(env, a.id, a.stage);
      return { lead: s.leads.find((l) => l.id === a.id) };
    },
  },
  nts_get_social_analytics: {
    description: 'YouTube channel analytics for @NikhilsTechStudio: totals, growth, engagement, top videos and SOMA analysis.',
    input: { refresh: z.boolean().optional() },
    run: async (env, a) => {
      const r = await analytics.report(env, { force: Boolean(a.refresh) });
      if (!r.connected) return r;
      const { videos, ...rest } = r;
      return { ...rest, latestVideos: videos.slice(0, 10) };
    },
  },
  nts_get_youtube_comments: {
    description: 'Latest YouTube comments on the NTS channel (public read; needs YOUTUBE_API_KEY).',
    input: { max: z.number().int().min(1).max(100).optional() },
    run: async (env, a) => ({ comments: await integ.youtubeComments(env, a.max ?? 30) }),
  },
  nts_analyze_comments: {
    description: 'Community Manager classifies new YouTube comments (intent, sentiment, language, escalation) and drafts replies for approval.',
    input: {},
    run: async (env) => {
      const r = await integ.analyzeComments(env);
      return { analysed: r.analysed, pending: r.comments.filter((c) => c.status === 'pending').length, escalated: r.comments.filter((c) => c.status === 'escalated').length };
    },
  },
  nts_generate_image: {
    description: 'Generate an image (Gemini Flash Image, free fallbacks). aspect: 1:1, 9:16, 16:9, 4:5, 3:4. Returns size, not the bytes.',
    input: { prompt: z.string().min(3).max(1500), aspect: z.enum(['1:1', '9:16', '16:9', '4:5', '3:4']).optional() },
    run: async (env, a) => {
      const img = await generateImage(await store.withSettings(env), a);
      return { engine: img.engine, mime: img.mime, bytes: Math.round((img.data.length * 3) / 4), note: 'Open Dev Mode to view and download images.' };
    },
  },
  nts_get_deployment_status: {
    description: 'Recent GitHub commits and workflow runs for the NTS website (needs GITHUB_TOKEN).',
    input: {},
    run: async (env) => integ.deploymentStatus(await store.withSettings(env)),
  },
  nts_run_tests: {
    description: 'Start the CI workflow (tests + build) on GitHub Actions for a branch (needs GITHUB_TOKEN).',
    input: { ref: z.string().max(80).optional() },
    run: async (env, a) => integ.runTests(await store.withSettings(env), a.ref || 'main'),
  },
  nts_check_site_health: {
    description: 'Live health check of the NTS Worker: storage, website assets and AI engines.',
    input: {},
    run: async (env) => integ.siteHealth(env),
  },
  nts_get_api_usage: {
    description: 'Today’s AI usage: calls and tokens per engine, cloud-brain calls and images.',
    input: {},
    run: async (env) => ops.usage(env),
  },
  nts_set_mode: {
    description: 'Set the operating mode (manual, assisted, autonomous) or pause/resume all autonomous execution.',
    sensitive: true,
    input: { mode: z.enum(ops.MODES).optional(), paused: z.boolean().optional() },
    run: async (env, a) => ops.setOps(env, a),
  },
};

export const toolNames = Object.keys(TOOLS);

/** Validate + run a tool; records a task and an activity line. */
export async function callTool(env, name, args = {}, ctx = {}) {
  const t = TOOLS[name];
  if (!t) throw new HttpError(404, `Unknown tool ${name}.`);
  const parsed = z.object(t.input).strict().safeParse(args ?? {});
  if (!parsed.success) throw new HttpError(400, `Invalid input for ${name}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'} ${i.message}`).join('; ')}`);
  const started = Date.now();
  const task = ctx.task || (await ops.createTask(env, { title: ctx.title || name, agent: ctx.agent || null, tool: name, args: parsed.data, status: 'in_progress', commandId: ctx.commandId }));
  if (ctx.task) await ops.updateTask(env, task.id, { status: 'in_progress' });
  try {
    const out = await t.run(env, parsed.data);
    await ops.updateTask(env, task.id, { status: 'completed', output: JSON.stringify(out).slice(0, 6000), ms: Date.now() - started });
    await ops.log(env, 'tool', `${ctx.agentName ? `${ctx.agentName}: ` : ''}${ctx.title || name} ✓`, { tool: name, via: ctx.via || 'dashboard' });
    return { ok: true, task: task.id, result: out };
  } catch (e) {
    await ops.updateTask(env, task.id, { status: 'failed', error: String(e.message || e).slice(0, 500), ms: Date.now() - started });
    await ops.log(env, 'error', `${ctx.title || name} failed: ${String(e.message || e).slice(0, 140)}`, { tool: name, via: ctx.via || 'dashboard' });
    throw e;
  }
}
