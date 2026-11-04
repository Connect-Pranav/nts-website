// Real integrations used by NTS COMMAND tools. Each one reports "not connected" honestly when its
// credential is missing; nothing here returns made-up results.
//  - GitHub (GITHUB_TOKEN, fine-grained, this repo only): commits, workflow runs, run the CI workflow.
//  - Site health: storage round-trip, static assets, AI engines (checked inside the Worker).
//  - YouTube comments (YOUTUBE_API_KEY, public read): latest comment threads on the channel.
import { HttpError, nowIso } from './util.mjs';
import { generate, parseJson, engineStatus } from './providers.mjs';
import * as store from './store.mjs';

const GH = 'https://api.github.com';
const repoOf = (env) => (/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO || '') ? env.GITHUB_REPO : 'Connect-Pranav/nts-website');

async function gh(env, path, init = {}, fetchImpl = fetch) {
  if (!env.GITHUB_TOKEN) throw new HttpError(409, 'GitHub is not connected: add a fine-grained GITHUB_TOKEN (this repo only: Contents read, Actions read/write) in Settings.');
  const r = await fetchImpl(`${GH}${path}`, { ...init, headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${env.GITHUB_TOKEN}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'nts-command', ...(init.headers || {}) } });
  if (r.status === 204) return null;
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `GitHub ${path.split('?')[0]}: ${b.message || r.status}`);
  return b;
}

export async function deploymentStatus(env, fetchImpl = fetch) {
  const repo = repoOf(env);
  const [commits, runs] = await Promise.all([gh(env, `/repos/${repo}/commits?per_page=10`, {}, fetchImpl), gh(env, `/repos/${repo}/actions/runs?per_page=10`, {}, fetchImpl)]);
  return {
    repo,
    note: 'Production deploys come from the main branch through Cloudflare Workers Builds.',
    commits: (commits || []).map((c) => ({ sha: c.sha.slice(0, 7), message: String(c.commit?.message || '').split('\n')[0].slice(0, 120), author: c.commit?.author?.name, at: c.commit?.author?.date, url: c.html_url })),
    runs: (runs?.workflow_runs || []).map((w) => ({ id: w.id, name: w.name, status: w.status, conclusion: w.conclusion, branch: w.head_branch, at: w.created_at, url: w.html_url })),
  };
}

export async function runTests(env, ref = 'main', fetchImpl = fetch) {
  const repo = repoOf(env);
  await gh(env, `/repos/${repo}/actions/workflows/ci.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref }) }, fetchImpl);
  return { started: true, repo, workflow: 'ci.yml', ref, at: nowIso(), see: `https://github.com/${repo}/actions/workflows/ci.yml` };
}

export async function siteHealth(env) {
  const checks = [];
  const t0 = Date.now();
  try {
    const k = `health/${Date.now()}`;
    await env.NTS_KV.put(k, '1', { expirationTtl: 60 });
    checks.push({ name: 'Storage (KV)', ok: (await env.NTS_KV.get(k)) === '1' });
  } catch (e) {
    checks.push({ name: 'Storage (KV)', ok: false, error: e.message });
  }
  try {
    const r = await env.ASSETS.fetch(new Request('https://assets.local/'));
    checks.push({ name: 'Website assets', ok: r.ok, status: r.status });
  } catch (e) {
    checks.push({ name: 'Website assets', ok: false, error: e.message });
  }
  const eng = engineStatus(await store.withSettings(env));
  checks.push({ name: 'AI engines', ok: Object.values(eng).some((x) => x.configured), detail: Object.entries(eng).filter(([, x]) => x.configured).map(([k]) => k).join(', ') || 'none' });
  return { ok: checks.every((c) => c.ok), checks, ms: Date.now() - t0, at: nowIso() };
}

// ---------------- YouTube comments ----------------
async function channelId(env) {
  const snap = env.NTS_KV ? await env.NTS_KV.get('an/latest', 'json') : null;
  if (snap?.channel?.id) return snap.channel.id;
  const { resolveChannelId } = await import('./site.mjs');
  return resolveChannelId(env);
}

export async function youtubeComments(rawEnv, max = 30, fetchImpl = fetch) {
  const env = await store.withSettings(rawEnv);
  if (!env.YOUTUBE_API_KEY) throw new HttpError(409, 'YouTube comments need a YOUTUBE_API_KEY (free, Google Cloud) in Settings.');
  const id = await channelId(env);
  const r = await fetchImpl(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&allThreadsRelatedToChannelId=${id}&maxResults=${Math.min(100, max)}&order=time&textFormat=plainText`, { headers: { 'x-goog-api-key': env.YOUTUBE_API_KEY } });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `YouTube comments: ${b?.error?.errors?.[0]?.reason || b?.error?.message || r.status}`);
  return (b.items || []).map((t) => {
    const s = t.snippet?.topLevelComment?.snippet || {};
    return { id: t.id, platform: 'youtube', videoId: s.videoId || t.snippet?.videoId, author: s.authorDisplayName, text: String(s.textOriginal || s.textDisplay || '').slice(0, 1000), likes: s.likeCount ?? 0, replies: t.snippet?.totalReplyCount ?? 0, at: s.publishedAt, url: `https://www.youtube.com/watch?v=${s.videoId}&lc=${t.id}` };
  });
}

const ESCALATE = 'legal threat, serious complaint, personal information, security concern, sensitive allegation, harassment';

/** Community Manager: classify each new comment and draft a reply (stored; never published here). */
export async function analyzeComments(rawEnv, fetchImpl = fetch) {
  const list = await youtubeComments(rawEnv, 30, fetchImpl);
  const kv = rawEnv.NTS_KV;
  const known = (await kv.get('social/comments', 'json')) || [];
  const seen = new Set(known.map((c) => c.id));
  const fresh = list.filter((c) => !seen.has(c.id)).slice(0, 12);
  if (!fresh.length) return { analysed: 0, comments: known.slice(0, 60) };
  const env = await store.withSettings(rawEnv);
  const system = `${await store.brainContext(rawEnv)}

You are the NTS Community Manager. For each YouTube comment: detect intent (question, appreciation, feedback, complaint, enquiry, spam), sentiment (positive, neutral, negative), language (English, Hindi, Hinglish), and whether it must be escalated to the owner (${ESCALATE}). Draft a short, warm, natural reply in the commenter's language (1-2 sentences, never generic or repeated, no links unless needed, no promises or prices). Spam gets no reply.`;
  const prompt = `COMMENTS:\n${fresh.map((c) => `- ${c.id} | ${c.author}: ${c.text}`).join('\n')}\n\nReturn JSON: {"items":[{"id":"comment id","intent":"...","sentiment":"positive|neutral|negative","language":"...","escalate":true|false,"reason":"short","reply":"reply text or empty for spam"}]}`;
  const r = await generate(env, { system, prompt, json: true, maxTokens: 2500 });
  const out = parseJson(r.text);
  const by = new Map((out.items || []).map((x) => [x.id, x]));
  const now = nowIso();
  const rows = fresh.map((c) => {
    const a = by.get(c.id) || {};
    const spam = a.intent === 'spam';
    return { ...c, intent: String(a.intent || 'unknown'), sentiment: String(a.sentiment || 'neutral'), language: String(a.language || ''), escalate: Boolean(a.escalate), reason: String(a.reason || '').slice(0, 200), reply: spam ? '' : String(a.reply || '').slice(0, 600), status: spam ? 'ignored' : a.escalate ? 'escalated' : 'pending', analysedAt: now, brain: `${r.engine} · ${r.model}` };
  });
  const all = [...rows, ...known].slice(0, 200);
  await kv.put('social/comments', JSON.stringify(all));
  return { analysed: rows.length, comments: all.slice(0, 60) };
}
