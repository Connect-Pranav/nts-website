// Signals for the NTS agent team (same idea as AGENTVERSE): a free lead scraper (Reddit, Hacker News,
// Mastodon RSS) for people asking about SQL, data careers and AI tools, plus the Brain, the YouTube channel
// and Instagram. Leads feed the next cycle: the team drafts a helpful public reply that waits for approval.
// Nothing is ever posted or sent automatically.
import { HttpError, nowIso } from './util.mjs';
import * as store from './store.mjs';

const KEY = 'signals';
const MAX_LEADS = 80;
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; NTS-Signals/1.0; +https://nts-website.pravanigroup.workers.dev)' };
export const QUERIES = ['learn sql', 'sql interview', 'data analyst interview', 'chatgpt resume', 'learn excel for job', 'ai agent small business'];
const TAGS = ['learnsql', 'sql', 'dataanalytics', 'careeradvice', 'chatgpt'];
const INTENT = /\b(how (do|can|to)|help|need|looking for|recommend|beginner|struggl|stuck|advice|suggest|course|learn|prepare|interview|any tips|where (do|can|to)|kaise)\b/i;
const NOISE = /\b(hiring|we are hiring|job alert|apply here|sponsored|promo|discount|giveaway)\b/i;

const strip = (s) =>
  String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

export function score(title, text) {
  const t = `${title} ${text}`;
  if (NOISE.test(t)) return 0;
  let s = 3;
  if (INTENT.test(t)) s += 3;
  if (/\?/.test(title)) s += 2;
  if (/\b(sql|excel|power bi|data analyst|business analyst|mis)\b/i.test(t)) s += 1;
  if (/\b(chatgpt|claude|gemini|ai tool|ai agent|resume|linkedin)\b/i.test(t)) s += 1;
  return Math.min(10, s);
}

async function hackerNews(fetchImpl, since) {
  const out = [];
  for (const q of QUERIES) {
    const r = await fetchImpl(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=(story,comment)&hitsPerPage=8&numericFilters=created_at_i>${since}`, { headers: UA });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    for (const h of j.hits || []) {
      const title = strip(h.title || h.story_title || '');
      const text = strip(h.comment_text || h.story_text || '').slice(0, 600);
      out.push({ id: `hn_${h.objectID}`, source: 'Hacker News', title: title || text.slice(0, 90), text, url: `https://news.ycombinator.com/item?id=${h.objectID}`, at: h.created_at || nowIso(), query: q });
    }
  }
  return out;
}

async function reddit(fetchImpl) {
  const out = [];
  for (const q of QUERIES.slice(0, 4)) {
    const r = await fetchImpl(`https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&t=week&limit=8`, { headers: UA });
    if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 403 ? ' (Reddit blocks cloud servers without an app login)' : ''}`);
    const j = await r.json();
    for (const c of j?.data?.children || []) {
      const d = c.data || {};
      out.push({ id: `rd_${d.id}`, source: `Reddit r/${d.subreddit}`, title: strip(d.title), text: strip(d.selftext).slice(0, 600), url: `https://www.reddit.com${d.permalink}`, at: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : nowIso(), query: q });
    }
  }
  return out;
}

async function mastodon(fetchImpl) {
  const out = [];
  for (const tag of TAGS) {
    const r = await fetchImpl(`https://mastodon.social/tags/${tag}.rss`, { headers: UA });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = await r.text();
    for (const [, it] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const link = strip((it.match(/<link>([^<]+)<\/link>/) || [])[1]);
      const text = strip((it.match(/<description>([\s\S]*?)<\/description>/) || [])[1]).slice(0, 600);
      if (!link || !text) continue;
      out.push({ id: `md_${link.split('/').pop()}`, source: `Mastodon #${tag}`, title: text.slice(0, 100), text, url: link, at: new Date((it.match(/<pubDate>([^<]+)<\/pubDate>/) || [])[1] || Date.now()).toISOString(), query: `#${tag}` });
    }
  }
  return out;
}

const kv = (env) => {
  if (!env.NTS_KV) throw new HttpError(503, 'Storage is not set up (NTS_KV binding missing).');
  return env.NTS_KV;
};

export async function getSignals(env) {
  const s = env.NTS_KV ? await env.NTS_KV.get(KEY, 'json') : null;
  return { updated: s?.updated ?? null, health: s?.health ?? {}, leads: s?.leads ?? [] };
}

/** Scrape every source; one failing source never stops the others. */
export async function scrape(env, fetchImpl = fetch) {
  const s = await getSignals(env);
  const since = Math.floor(Date.now() / 1000) - 7 * 86400;
  const found = [];
  const health = {};
  for (const [name, fn] of [
    ['hackernews', () => hackerNews(fetchImpl, since)],
    ['reddit', () => reddit(fetchImpl)],
    ['rss', () => mastodon(fetchImpl)],
  ]) {
    try {
      const items = await fn();
      found.push(...items);
      health[name] = { ok: true, items: items.length, at: nowIso() };
    } catch (e) {
      health[name] = { ok: false, items: 0, at: nowIso(), error: String(e.message || e).slice(0, 160) };
    }
  }
  const known = new Map(s.leads.map((l) => [l.id, l]));
  for (const l of found) {
    if (known.has(l.id)) continue;
    const sc = score(l.title, l.text);
    if (sc < 5) continue;
    known.set(l.id, { ...l, score: sc, state: 'new', foundAt: nowIso() });
  }
  const leads = [...known.values()].sort((a, b) => Number(b.state === 'new') - Number(a.state === 'new') || b.score - a.score || Date.parse(b.at) - Date.parse(a.at));
  const out = { updated: nowIso(), health, leads: leads.slice(0, MAX_LEADS) };
  await kv(env).put(KEY, JSON.stringify(out));
  return out;
}

export const STAGES = ['new', 'drafted', 'contacted', 'responded', 'qualified', 'meeting', 'won', 'lost', 'ignored'];
export async function setLeadState(env, id, state) {
  if (!STAGES.includes(state)) throw new HttpError(400, `state must be one of ${STAGES.join(', ')}.`);
  const s = await getSignals(env);
  const l = s.leads.find((x) => x.id === id);
  if (!l) throw new HttpError(404, 'Lead not found.');
  l.state = state;
  (l.history = l.history || []).unshift({ state, at: nowIso() });
  await kv(env).put(KEY, JSON.stringify(s));
  return s;
}

/** Owner-added lead (an enquiry from DM, email, event...). */
export async function addLead(env, body) {
  const title = String(body?.title ?? '').trim().slice(0, 160);
  const text = String(body?.text ?? '').trim().slice(0, 1500);
  if (title.length < 2) throw new HttpError(400, 'Lead needs a name or title.');
  const s = await getSignals(env);
  const id = `mn_${Date.now().toString(36)}`;
  s.leads.unshift({ id, source: String(body?.source || 'Manual').slice(0, 60), title, text, url: /^https?:\/\//.test(body?.url || '') ? body.url : '', at: nowIso(), score: score(title, text) || 5, state: 'new', foundAt: nowIso(), history: [{ state: 'new', at: nowIso() }] });
  await kv(env).put(KEY, JSON.stringify(s));
  return s;
}

export async function setLeadDraft(env, id, draft) {
  const s = await getSignals(env);
  const l = s.leads.find((x) => x.id === id);
  if (!l) throw new HttpError(404, 'Lead not found.');
  l.draft = { text: String(draft).slice(0, 2000), at: nowIso() };
  if (l.state === 'new') l.state = 'drafted';
  await kv(env).put(KEY, JSON.stringify(s));
  return l;
}

/** Top fresh leads for the next cycle (marked drafted once used). */
export async function freshLeads(env, n = 2) {
  const s = await getSignals(env);
  return s.leads.filter((l) => l.state === 'new').slice(0, n);
}

/** One view for the Signals panel: every source and its status. */
export async function overview(env) {
  const [s, brain, an] = await Promise.all([getSignals(env), store.getBrain(env), env.NTS_KV ? env.NTS_KV.get('an/latest', 'json') : null]);
  const h = s.health;
  const fresh = s.leads.filter((l) => l.state === 'new').length;
  const stat = (x) => (!x ? 'idle' : x.ok ? 'ok' : 'error');
  return {
    updated: s.updated,
    sources: [
      { key: 'scraper', name: 'Lead scraper', status: s.updated ? (Object.values(h).some((x) => x.ok) ? 'ok' : 'error') : 'idle', detail: s.updated ? `${fresh} fresh of ${s.leads.length} leads · every 6 h` : 'Not run yet. Press Scan now.' },
      { key: 'reddit', name: 'Reddit', status: stat(h.reddit), detail: h.reddit ? (h.reddit.ok ? `${h.reddit.items} posts checked` : h.reddit.error) : 'Searches r/all for SQL, data and AI career questions.' },
      { key: 'hn', name: 'Hacker News', status: stat(h.hackernews), detail: h.hackernews ? (h.hackernews.ok ? `${h.hackernews.items} posts checked` : h.hackernews.error) : 'Free Algolia search, no key.' },
      { key: 'rss', name: 'RSS feeds', status: stat(h.rss), detail: h.rss ? (h.rss.ok ? `${h.rss.items} Mastodon posts (#learnsql, #sql, #dataanalytics, #careeradvice, #chatgpt)` : h.rss.error) : 'Mastodon tag feeds.' },
      { key: 'notes', name: 'Owner notes', status: brain.notes.length ? 'ok' : 'idle', detail: `${brain.notes.length} notes in the Brain` },
      { key: 'memory', name: 'Team memory', status: 'ok', detail: `${brain.rules.length} rules · ${brain.feedback.length} learned` },
      { key: 'youtube', name: 'YouTube', status: an ? 'ok' : 'idle', detail: an ? `${an.channel?.handle} · ${an.videos?.length ?? 0} videos · ${an.source}` : 'Open Analytics to fetch the channel.' },
      { key: 'instagram', name: 'Instagram', status: 'off', detail: 'Not connected: needs an Instagram Graph API token from a Business/Creator account. Agents still draft Reels and captions.' },
    ],
    leads: s.leads.slice(0, 40),
  };
}
