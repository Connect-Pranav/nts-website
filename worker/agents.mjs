// NTS bindings of existing Ganesha agents (see agents/registry.json and docs/AGENT_MAPPING.md).
// GANESHA orchestrates; MAYA-OPS drafts; LAKSHMI-OPS adapts per platform; SOMA analyses.
// No agent can publish: publishing only happens for jobs an admin approved.
import REGISTRY from '../agents/registry.json' with { type: 'json' };
import { HttpError, newId, nowIso } from './util.mjs';
import { generate, parseJson } from './providers.mjs';

export { REGISTRY };
const ROLE_TO_ID = Object.fromEntries(REGISTRY.agents.map((a) => [a.ntsRole, a.id]));

export const BRAND = `Brand: NIKHILs TECH STUDIO (always spelled exactly so).
Positioning: India's Practice Gym for the AI Era. Promise: Learn. Practice. Simulate. Grow.
Mission: turn free content into practice, practice into proof, and proof into careers.
Focus: practical AI adoption, AI tools and experiments, career readiness and interview practice (SQL interview simulations, Claude, ChatGPT, Gemini), workshops and institutional programmes.
Voice: calm, clear, practical, Indian English; premium tech-documentary rather than hype. No motivational clichés, no fake statistics, no invented testimonials, no emojis unless asked.
Typical closing line: "Stay curious. Stay hungry. Follow for more."`;

export async function listAgents(db) {
  const rows = (await db.prepare('SELECT agent_id, enabled FROM agent_state').all()).results;
  const state = Object.fromEntries(rows.map((r) => [r.agent_id, Boolean(r.enabled)]));
  const stats = (await db.prepare("SELECT agent_id, COUNT(*) AS runs, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed, SUM(COALESCE(input_tokens,0)) AS tin, SUM(COALESCE(output_tokens,0)) AS tout, SUM(cost_usd) AS cost, MAX(created_at) AS last FROM agent_runs GROUP BY agent_id").all()).results;
  const s = Object.fromEntries(stats.map((r) => [r.agent_id, r]));
  return REGISTRY.agents.map((a) => ({
    ...a,
    enabled: a.selected ? (state[a.id] ?? true) : false,
    stats: { runs: s[a.id]?.runs ?? 0, failed: s[a.id]?.failed ?? 0, inputTokens: s[a.id]?.tin ?? 0, outputTokens: s[a.id]?.tout ?? 0, costUsd: s[a.id]?.cost ?? null, lastRunAt: s[a.id]?.last ?? null },
  }));
}

export async function setEnabled(db, agentId, enabled) {
  const a = REGISTRY.agents.find((x) => x.id === agentId);
  if (!a) throw new HttpError(404, 'Unknown agent.');
  if (!a.selected) throw new HttpError(409, `${a.label} is a Phase ${a.phase} capability and cannot be enabled yet.`);
  await db.prepare('INSERT INTO agent_state (agent_id, enabled, updated_at) VALUES (?,?,?) ON CONFLICT(agent_id) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at').bind(agentId, enabled ? 1 : 0, nowIso()).run();
  return { agentId, enabled };
}

async function assertEnabled(db, role) {
  const id = ROLE_TO_ID[role];
  const a = REGISTRY.agents.find((x) => x.id === id);
  if (!a?.selected) throw new HttpError(409, `${a?.label ?? role} is not active.`);
  const row = await db.prepare('SELECT enabled FROM agent_state WHERE agent_id = ?').bind(id).first();
  if (row && !row.enabled) throw new HttpError(409, `${a.label} (${a.name}) is disabled. Enable it in Admin → Agents.`);
  return a;
}

/** Run one agent task with full logging. */
async function runAgent(env, db, role, task, ref, call, fetchImpl) {
  const a = await assertEnabled(db, role);
  const id = newId('run');
  await db.prepare("INSERT INTO agent_runs (id, agent_id, task, status, ref, created_at) VALUES (?,?,?,'running',?,?)").bind(id, a.id, task, ref, nowIso()).run();
  try {
    const r = await generate(env, call, fetchImpl);
    await db
      .prepare("UPDATE agent_runs SET status='succeeded', engine=?, model=?, input_tokens=?, output_tokens=?, cost_usd=?, latency_ms=?, finished_at=? WHERE id=?")
      .bind(r.engine, r.model, r.inputTokens, r.outputTokens, r.costUsd, r.latencyMs, nowIso(), id)
      .run();
    return { ...r, runId: id };
  } catch (e) {
    await db.prepare("UPDATE agent_runs SET status='failed', error=?, finished_at=? WHERE id=?").bind(String(e.message).slice(0, 500), nowIso(), id).run();
    throw e;
  }
}

/** GANESHA orchestration: retries a step once on transient failure, records the error otherwise. */
async function orchestrate(env, db, step, fn) {
  await assertEnabled(db, 'orchestrator');
  const id = newId('run');
  await db.prepare("INSERT INTO agent_runs (id, agent_id, task, status, created_at) VALUES (?,?,?,'running',?)").bind(id, ROLE_TO_ID.orchestrator, step, nowIso()).run();
  let attempt = 0;
  for (;;) {
    try {
      const out = await fn();
      await db.prepare("UPDATE agent_runs SET status='succeeded', finished_at=? WHERE id=?").bind(nowIso(), id).run();
      return out;
    } catch (e) {
      attempt++;
      const transient = e.status === 502 || e.status === 503 || e.status === 504;
      if (!transient || attempt > 1) {
        await db.prepare("UPDATE agent_runs SET status='failed', error=?, finished_at=? WHERE id=?").bind(String(e.message).slice(0, 500), nowIso(), id).run();
        throw e;
      }
    }
  }
}

/** Topic → long-form draft (MAYA-OPS, orchestrated by GANESHA). */
export async function draftFromTopic(env, db, { topic, kind = 'article', audience = '' }, fetchImpl = fetch) {
  return orchestrate(env, db, `draft:${kind}`, async () => {
    const r = await runAgent(env, db, 'brand_content', `draft_${kind}`, null, {
      system: `${BRAND}\nYou are the Brand & Content writer. Write accurate, practical content. If a fact is uncertain, say so rather than inventing it.`,
      prompt: `Write a ${kind === 'tutorial' ? 'step-by-step tutorial' : kind === 'explainer' ? 'clear explainer' : 'practical article'} for the NIKHILs TECH STUDIO website.
Topic: ${topic}
${audience ? `Audience: ${audience}\n` : ''}Return JSON: {"title": string (max 80 chars), "excerpt": string (max 200 chars), "body": markdown string (600-1100 words, H2 subheadings, one practice exercise near the end)}.`,
      json: true,
      maxTokens: 4096,
    }, fetchImpl);
    const out = parseJson(r.text);
    if (!out.title || !out.body) throw new HttpError(502, 'The draft came back incomplete. Try again.');
    return { title: String(out.title).slice(0, 120), excerpt: String(out.excerpt || '').slice(0, 300), body: String(out.body), runId: r.runId };
  });
}

/** Draft → platform variants (LAKSHMI-OPS). */
export async function adaptForPlatforms(env, db, { title, body, platforms }, fetchImpl = fetch) {
  return orchestrate(env, db, 'adapt', async () => {
    const r = await runAgent(env, db, 'social_media', 'adapt_variants', null, {
      system: `${BRAND}\nYou are the Social Media agent. Adapt one article into native posts. Never claim results or numbers that are not in the article.`,
      prompt: `Article title: ${title}\n\nArticle:\n${String(body).slice(0, 12000)}\n\nCreate posts for: ${platforms.join(', ')}.
Rules: linkedin = 120-220 words, hook line first, short paragraphs, 3 relevant hashtags at the end, no links in the body.
instagram = Reel/post caption, 60-140 words, line breaks, 5-8 hashtags at the end.
youtube = {"title" max 95 chars, "description" 120-250 words with a short chapter outline, "tags" array of 8-12}.
website = a 2-sentence teaser.
Return JSON: {"linkedin": {"text": string}, "instagram": {"text": string}, "youtube": {"title": string, "description": string, "tags": string[]}, "website": {"text": string}} including only the requested platforms.`,
      json: true,
      maxTokens: 3000,
    }, fetchImpl);
    return { variants: parseJson(r.text), runId: r.runId };
  });
}

/** Analytics → recommendations (SOMA). Uses only numbers from synced official data. */
export async function recommend(env, db, summary, fetchImpl = fetch) {
  return orchestrate(env, db, 'recommend', async () => {
    const r = await runAgent(env, db, 'growth_analytics', 'recommendations', null, {
      system: `${BRAND}\nYou are the Growth & Analytics agent. Base every statement on the data provided. If data is missing or too thin, say exactly what is missing.`,
      prompt: `Channel data (from official APIs, JSON):\n${JSON.stringify(summary).slice(0, 12000)}\n\nWrite 3-5 concise, specific recommendations in markdown bullets. For each, cite the metric it is based on. End with one line on what data would improve the analysis.`,
      maxTokens: 1200,
    }, fetchImpl);
    const rid = newId('rec');
    await db.prepare('INSERT INTO recommendations (id, agent_run_id, body, created_at) VALUES (?,?,?,?)').bind(rid, r.runId, r.text, nowIso()).run();
    return { id: rid, body: r.text };
  });
}

export async function runs(db, agentId, limit = 50) {
  const q = agentId ? db.prepare('SELECT * FROM agent_runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?').bind(agentId, limit) : db.prepare('SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT ?').bind(limit);
  return (await q.all()).results;
}
