// NTS agent team cycle, modelled on AGENTVERSE: think -> plan -> execute -> learn.
// One brain call per cycle: the orchestrator picks one content opportunity from the Brain, and the three
// NTS agents write the finished deliverables. Everything lands on the Work board as "waiting" (needs owner
// approval) or "ready". Approve/reject becomes a lesson in the Brain that every later run reads, approved
// pieces are kept as examples, and recent topics are never repeated. Cron runs it on autopilot (free).
import { polishPost } from './postfmt.mjs';
import { HttpError, newId, nowIso } from './util.mjs';
import { generate, parseJson } from './providers.mjs';
import * as store from './store.mjs';
import * as signals from './signals.mjs';
import { countTokens, log, getOps } from './ops.mjs';

const KEY = 'work';
const MAX_ITEMS = 150;
const CHANNELS = ['LinkedIn', 'Instagram', 'YouTube', 'X', 'All'];

// What each NTS agent owns (ids match agents/registry.json entries with dev: true)
export const TEAM = {
  ops_maya_docs: { name: 'LinkedIn Content Writer', job: 'Feed-ready LinkedIn text posts for Nikhil Kumar, written exactly as they will be posted: hook as line 1 (under 140 chars), blank lines between short paragraphs, one practical takeaway, a question or follow CTA, 3-5 hashtags on the last line. Never labels like Hook:/Slide 1:/CTA:, never markdown, never promise links or templates that do not exist.' },
  ops_lakshmi_growth: { name: 'Social Media Manager', job: 'Instagram Reels and YouTube Shorts scripts in 3 scenes (hook, value, CTA) with on-screen text, captions with hashtags, YouTube title + description + tags, posting slot, and X (Twitter) posts: max 280 characters each, a short thread only when it truly helps (separate tweets with a line "---").' },
  ops_soma_analytics: { name: 'Growth & Analytics', job: 'SEO keywords, what to post next and why, which metric to watch for this piece, one small growth experiment. Never invent numbers; say what to measure instead.' },
};

const SYS = `You are the NTS agent team for NIKHILs TECH STUDIO, working for the owner. In ONE response: pick one high-value content opportunity (think, plan), then produce the finished deliverables (execute).
AGENTS:
${Object.entries(TEAM)
  .map(([id, a]) => `- ${id} = ${a.name}: ${a.job}`)
  .join('\n')}
Produce 3 to 5 items across the agents (each agent at least once). Every item is ready to copy and use.
If FRESH LEADS are given, add one extra item per lead (agent ops_soma_analytics, channel "All") with "lead_id": a short, genuinely helpful public reply that answers the person's actual question first and mentions the studio only if it truly helps.
Follow the OWNER RULES and the BRAIN strictly, and learn from RECENT OWNER FEEDBACK. Never invent facts, prices, numbers, results or testimonials; use [placeholders].
Never write bulk or unsolicited DMs, follow-for-follow, giveaway bait or messages with placeholders like [Follower Name].
Return ONLY JSON: {"topic":"max 8 words","why":"max 20 words","items":[{"agent":"agent id","channel":"LinkedIn|Instagram|YouTube|X|All","title":"max 10 words","body":"max 220 words","needs_approval":true|false,"lead_id":"id or null"}],"summary":"max 20 words"}. needs_approval=true for anything that would be published or sent to a person.`;

const kv = (env) => {
  if (!env.NTS_KV) throw new HttpError(503, 'Storage is not set up (NTS_KV binding missing).');
  return env.NTS_KV;
};

export async function getWork(env) {
  const w = env.NTS_KV ? await env.NTS_KV.get(KEY, 'json') : null;
  // unposted LinkedIn drafts are always shown and posted in feed-ready form (older drafts had Hook:/Slide 1: labels)
  const items = (w?.items ?? []).map((i) => (i.channel === 'LinkedIn' && !i.postedUrl && i.body ? { ...i, body: polishPost(i.body) } : i));
  return { items, topics: w?.topics ?? [], cycles: w?.cycles ?? 0, updated: w?.updated ?? null, last: w?.last ?? null, autopilot: w?.autopilot !== false };
}
async function putWork(env, w) {
  await kv(env).put(KEY, JSON.stringify(w));
  return w;
}

/** One autonomous cycle. Returns the updated board. */
export async function runCycle(rawEnv, { focus = '', by = 'owner' } = {}) {
  const store_ = kv(rawEnv);
  if (await store_.get('work/lock')) throw new HttpError(409, 'Team is already working on a cycle. Try again in a minute.');
  await store_.put('work/lock', '1', { expirationTtl: 60 });
  try {
    const env = await store.withSettings(rawEnv);
    const w = await getWork(rawEnv);
    let user = await store.brainContext(rawEnv);
    const recent = w.items.slice(0, 10).map((i) => i.title);
    if (recent.length) user += `\n\nRECENT OUTPUTS (do not repeat):\n- ${recent.join('\n- ')}`;
    if (w.topics.length) user += `\nRECENT TOPICS (pick something different): ${w.topics.slice(0, 10).join(', ')}`;
    const leads = await signals.freshLeads(rawEnv, 2).catch(() => []);
    if (leads.length) user += `\n\nFRESH LEADS (id | source | title | text):\n${leads.map((l) => `- ${l.id} | ${l.source} | ${l.title} | ${l.text.slice(0, 300)}`).join('\n')}`;
    const f = String(focus || '').trim().slice(0, 300);
    if (f) user += `\n\nOWNER WANTS THIS CYCLE TO FOCUS ON: ${f}`;
    const r = await generate(env, { system: SYS, prompt: user, maxTokens: 3500, json: true });
    await countTokens(rawEnv, r);
    const out = parseJson(r.text);
    const now = nowIso();
    const items = [];
    for (const it of (Array.isArray(out.items) ? out.items : []).slice(0, 8)) {
      if (!it || typeof it.body !== 'string' || !it.body.trim()) continue;
      const lead = it.lead_id ? leads.find((l) => l.id === it.lead_id) : null;
      const agent = TEAM[it.agent] ? it.agent : /linkedin/i.test(`${it.channel} ${it.title}`) ? 'ops_maya_docs' : /seo|metric|keyword|analytic/i.test(`${it.title}`) ? 'ops_soma_analytics' : 'ops_lakshmi_growth';
      items.push({
        id: newId('w'),
        agent,
        agentName: TEAM[agent].name,
        channel: CHANNELS.includes(it.channel) ? it.channel : 'All',
        title: String(it.title || TEAM[agent].name).slice(0, 100),
        body: String(it.body).slice(0, 2500),
        status: it.needs_approval === false ? 'ready' : 'waiting',
        topic: String(out.topic || '').slice(0, 80),
        createdAt: now,
        brain: `${r.engine} · ${r.model}`,
        by,
        ...(lead ? { leadId: lead.id, url: lead.url, status: 'waiting' } : {}),
      });
      if (lead) await signals.setLeadState(rawEnv, lead.id, 'drafted').catch(() => {});
    }
    if (!items.length) throw new HttpError(502, 'The team returned no usable work. Run the cycle again.');
    w.items = [...items, ...w.items].slice(0, MAX_ITEMS);
    w.topics = [String(out.topic || '').slice(0, 80), ...w.topics].filter(Boolean).slice(0, 20);
    w.cycles += 1;
    w.updated = now;
    w.last = { topic: String(out.topic || '').slice(0, 80), why: String(out.why || '').slice(0, 200), summary: String(out.summary || '').slice(0, 200), count: items.length, brain: `${r.engine} · ${r.model}`, by, at: now };
    await log(rawEnv, 'cycle', `Team cycle (${by}): "${w.last.topic}" · ${items.length} items`);
    return putWork(rawEnv, w);
  } finally {
    await store_.delete?.('work/lock');
  }
}

/** Add finished drafts to the board (used by tools such as nts_create_linkedin_post). */
export async function addItems(env, list, brain = '') {
  const w = await getWork(env);
  const now = nowIso();
  const items = list.map((it) => ({ id: newId('w'), agent: it.agent, agentName: TEAM[it.agent]?.name || it.agent, channel: CHANNELS.includes(it.channel) ? it.channel : 'All', title: String(it.title).slice(0, 100), body: (it.channel === 'LinkedIn' ? polishPost(String(it.body)) : String(it.body)).slice(0, 2500), status: it.status === 'ready' ? 'ready' : 'waiting', topic: '', createdAt: now, brain, by: 'brain' }));
  w.items = [...items, ...w.items].slice(0, MAX_ITEMS);
  w.updated = now;
  await putWork(env, w);
  return items;
}

/** Approve or reject a waiting item. The decision becomes a lesson; approved pieces become examples. */
export async function decide(env, id, action, reason = '') {
  const w = await getWork(env);
  const it = w.items.find((i) => i.id === id);
  if (!it) throw new HttpError(404, 'Item not found.');
  if (it.status !== 'waiting') throw new HttpError(409, `Already ${it.status}.`);
  const why = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (action === 'approve') {
    it.status = 'ready';
    await log(env, 'approval', `Approved: ${it.title}`);
    await store.learn(env, `Approved (${it.agentName}, ${it.channel}): ${it.title}${why ? ` | note: ${why}` : ''}`);
    await store.addNote(env, { title: `Approved example: ${it.title}`.slice(0, 120), text: it.body.slice(0, 3000), source: `${it.agentName} (approved)` });
  } else {
    it.status = 'rejected';
    await log(env, 'approval', `Rejected: ${it.title}${why ? ` (${why})` : ''}`);
    await store.learn(env, `Rejected (${it.agentName}, ${it.channel}): ${it.title}${why ? ` | reason: ${why}` : ''}`);
  }
  it.decidedAt = nowIso();
  if (why) it.reason = why;
  return putWork(env, w);
}

/** Edit a draft, set its schedule, or record where it was posted (manual publishing). */
export async function updateItem(env, id, b) {
  const w = await getWork(env);
  const it = w.items.find((i) => i.id === id);
  if (!it) throw new HttpError(404, 'Item not found.');
  if (typeof b?.title === 'string' && b.title.trim()) it.title = b.title.trim().slice(0, 100);
  if (typeof b?.body === 'string' && b.body.trim()) it.body = b.body.slice(0, 2500);
  if (b?.scheduledFor === null) delete it.scheduledFor;
  else if (typeof b?.scheduledFor === 'string') {
    if (Number.isNaN(Date.parse(b.scheduledFor))) throw new HttpError(400, 'scheduledFor must be a date.');
    it.scheduledFor = new Date(b.scheduledFor).toISOString();
  }
  if (typeof b?.postedUrl === 'string') {
    if (b.postedUrl && !/^https:\/\/(www\.)?(linkedin\.com|instagram\.com|youtube\.com|youtu\.be)\//.test(b.postedUrl)) throw new HttpError(400, 'postedUrl must be a LinkedIn, Instagram or YouTube link.');
    it.postedUrl = b.postedUrl || undefined;
    if (b.postedUrl) {
      it.postedAt = nowIso();
      await log(env, 'publish', `Posted (manual): ${it.title}`);
    }
  }
  return putWork(env, w);
}

export async function removeItem(env, id) {
  const w = await getWork(env);
  w.items = w.items.filter((i) => i.id !== id);
  return putWork(env, w);
}

export async function setAutopilot(env, on) {
  const w = await getWork(env);
  w.autopilot = Boolean(on);
  return putWork(env, w);
}

/** Cron entry: runs a cycle only when autopilot is on and nothing is piling up unreviewed. */
export async function scheduled(env) {
  if (!env.NTS_KV) return;
  const o = await getOps(env);
  if (o.paused) return; // kill switch: nothing autonomous runs
  await signals.scrape(env).catch((e) => console.log('[signals] scrape failed:', e.message));
  const w = await getWork(env);
  if (!w.autopilot || o.mode === 'manual') return; // manual mode: agents act only when instructed
  if (w.items.filter((i) => i.status === 'waiting').length >= 25) return; // wait for the owner to review
  try {
    await runCycle(env, { by: 'autopilot' });
  } catch (e) {
    console.log('[work] autopilot cycle failed:', e.message);
  }
}
