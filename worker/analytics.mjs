// SOMA's YouTube analysis for NIKHILs TECH STUDIO (same model as Ganesha's Sunverse analysis).
// Numbers: YouTube Data API when YOUTUBE_API_KEY is set (every upload, exact subscribers/likes/comments);
// otherwise the public RSS feed (latest 15 uploads, views + likes) and the public channel page.
// Snapshots are kept in KV for measured growth; SOMA writes the analysis from those numbers only.
import { HttpError, nowIso } from './util.mjs';
import { generate, parseJson } from './providers.mjs';
import * as store from './store.mjs';

const API = 'https://www.googleapis.com/youtube/v3';
const MAX_VIDEOS = 200;
const MAX_SNAPS = 80;
const CACHE_MIN = 60;
const YT_HEADERS = { 'user-agent': 'Mozilla/5.0 (compatible; NTS-Website/1.0)', 'accept-language': 'en-US,en;q=0.9', cookie: 'SOCS=CAI; CONSENT=YES+1' };
const handleOf = (env) => String(env.YOUTUBE_HANDLE || '@NikhilsTechStudio').replace(/^@?/, '@');
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export const GAPS_API = [
  'Watch time, average view duration, retention, CTR and impressions are private: they need the channel owner’s YouTube Analytics sign-in (not connected).',
  'Traffic sources and audience demographics are not in the public data.',
  'Revenue needs YouTube Partner Program data.',
];
export const GAPS_RSS = ['Only the latest 15 uploads are visible without a YouTube Data API key; add YOUTUBE_API_KEY in Settings for every video, exact subscribers and comments.', 'Subscriber count is read from the public channel page and is rounded by YouTube.', ...GAPS_API];

export function parseDuration(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!m) return null;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

/** "1.2K subscribers" -> 1200 (YouTube rounds public counts) */
export function parseCount(t) {
  const m = String(t || '').replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return null;
  return Math.round(Number(m[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[String(m[2] || '').toUpperCase()] || 1));
}

async function viaApi(env, fetchImpl) {
  const yt = async (path, params) => {
    const r = await fetchImpl(`${API}/${path}?${new URLSearchParams(params)}`, { headers: { 'x-goog-api-key': env.YOUTUBE_API_KEY, accept: 'application/json' } });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`YouTube API ${path}: ${b?.error?.errors?.[0]?.reason || b?.error?.message || r.status}`);
    return b;
  };
  const handle = handleOf(env);
  const c = (await yt('channels', { part: 'snippet,statistics,contentDetails', forHandle: handle.slice(1) })).items?.[0];
  if (!c) throw new Error(`YouTube channel ${handle} not found`);
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  const ids = [];
  let pageToken;
  while (uploads && ids.length < MAX_VIDEOS) {
    const pl = await yt('playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: '50', ...(pageToken ? { pageToken } : {}) });
    for (const it of pl.items ?? []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
    pageToken = pl.nextPageToken;
    if (!pageToken) break;
  }
  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const v = await yt('videos', { part: 'snippet,statistics,contentDetails', id: ids.slice(i, i + 50).join(',') });
    for (const x of v.items ?? [])
      videos.push({ id: x.id, title: x.snippet?.title ?? '(untitled)', publishedAt: x.snippet?.publishedAt ?? null, durationSec: parseDuration(x.contentDetails?.duration), views: num(x.statistics?.viewCount), likes: num(x.statistics?.likeCount), comments: num(x.statistics?.commentCount), url: `https://www.youtube.com/watch?v=${x.id}` });
  }
  videos.sort((a, b) => Date.parse(b.publishedAt ?? 0) - Date.parse(a.publishedAt ?? 0));
  return {
    source: 'YouTube Data API',
    exact: true,
    channel: { id: c.id, title: c.snippet?.title ?? handle, handle, url: `https://www.youtube.com/${handle}`, createdAt: c.snippet?.publishedAt ?? null, subscribers: c.statistics?.hiddenSubscriberCount ? null : num(c.statistics?.subscriberCount), subscribersHidden: Boolean(c.statistics?.hiddenSubscriberCount), totalViews: num(c.statistics?.viewCount), videoCount: num(c.statistics?.videoCount) },
    videos,
  };
}

async function viaPublic(env, fetchImpl) {
  const handle = handleOf(env);
  const page = await fetchImpl(`https://www.youtube.com/${encodeURIComponent(handle)}`, { headers: YT_HEADERS });
  if (!page.ok) throw new Error(`YouTube channel page: HTTP ${page.status}`);
  const html = await page.text();
  const id = (env.YOUTUBE_CHANNEL_ID && /^UC[\w-]{22}$/.test(env.YOUTUBE_CHANNEL_ID) && env.YOUTUBE_CHANNEL_ID) || (html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/channel\/(UC[\w-]{22})/) || [])[1];
  if (!id) throw new Error('Channel ID not found on the channel page.');
  const subsText = (html.match(/"subscriberCountText":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"/) || html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/) || html.match(/([\d.,]+[KMB]?) subscribers/) || [])[1];
  const vidText = (html.match(/"videosCountText":\{"runs":\[\{"text":"([\d,.]+[KMB]?)"/) || html.match(/([\d,]+) videos/) || [])[1];
  const feed = await fetchImpl(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: YT_HEADERS });
  if (!feed.ok) throw new Error(`YouTube feed: HTTP ${feed.status}`);
  const xml = await feed.text();
  const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map(([, e]) => {
      const vid = (e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/) || [])[1];
      return { id: vid, title: decode((e.match(/<title>([^<]*)<\/title>/) || [])[1] || ''), publishedAt: (e.match(/<published>([^<]+)<\/published>/) || [])[1] || null, durationSec: null, views: num((e.match(/<media:statistics views="(\d+)"/) || [])[1]), likes: num((e.match(/<media:starRating count="(\d+)"/) || [])[1]), comments: null, url: `https://www.youtube.com/watch?v=${vid}` };
    })
    .filter((v) => v.id);
  const title = decode((xml.match(/<title>([^<]*)<\/title>/) || [])[1] || handle);
  return {
    source: 'public RSS feed + channel page',
    exact: false,
    channel: { id, title, handle, url: `https://www.youtube.com/${handle}`, createdAt: null, subscribers: subsText ? parseCount(subsText) : null, subscribersHidden: false, totalViews: null, videoCount: vidText ? parseCount(vidText) : null },
    videos,
  };
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ratio = (a, b) => (b > 0 ? a / b : null);

/** Pure arithmetic on fetched numbers; `prev` = an older snapshot for measured growth. */
export function summarize(data, prev = null, now = Date.now()) {
  const v = data.videos;
  const views = v.map((x) => x.views).filter((x) => x !== null);
  const withLikes = v.filter((x) => x.likes !== null && x.views !== null);
  const withComments = v.filter((x) => x.comments !== null && x.views !== null);
  const last30 = v.filter((x) => x.publishedAt && now - Date.parse(x.publishedAt) <= 30 * 86400_000);
  const known = v.filter((x) => x.durationSec !== null);
  const short = known.filter((x) => x.durationSec <= 180);
  const long = known.filter((x) => x.durationSec > 180);
  const avg = (xs) => (xs.length ? Math.round(sum(xs.map((x) => x.views ?? 0)) / xs.length) : null);
  const s = {
    videosAnalysed: v.length,
    totalViewsOfVideos: sum(views),
    totalLikes: sum(withLikes.map((x) => x.likes)),
    totalComments: sum(withComments.map((x) => x.comments)),
    avgViewsPerVideo: views.length ? Math.round(sum(views) / views.length) : null,
    medianViewsPerVideo: median(views),
    likeRate: ratio(sum(withLikes.map((x) => x.likes)), sum(withLikes.map((x) => x.views))),
    commentRate: withComments.length ? ratio(sum(withComments.map((x) => x.comments)), sum(withComments.map((x) => x.views))) : null,
    last30Days: { uploads: last30.length, views: sum(last30.map((x) => x.views ?? 0)) },
    upTo3Min: { count: short.length, avgViews: avg(short) },
    over3Min: { count: long.length, avgViews: avg(long) },
    topVideos: [...v].filter((x) => x.views !== null).sort((a, b) => b.views - a.views).slice(0, 5).map((x) => x.id),
    latestUpload: v[0]?.publishedAt ?? null,
  };
  if (prev) {
    const d = (a, b) => (a !== null && b !== null && a !== undefined && b !== undefined ? a - b : null);
    s.growth = { since: prev.fetchedAt, hours: Math.round((Date.parse(data.fetchedAt) - Date.parse(prev.fetchedAt)) / 3_600_000), subscribers: d(data.channel.subscribers, prev.channel.subscribers), totalViews: d(data.channel.totalViews, prev.channel.totalViews), videoCount: d(data.channel.videoCount, prev.channel.videoCount) };
  }
  return s;
}

/** YouTube Partner Program bars (public numbers only; watch hours need the owner sign-in). */
export function ypp(subscribers, today = new Date()) {
  const after = today.getTime() >= Date.UTC(2027, 1, 1);
  return [
    { id: 'fan', label: 'Fan funding', subscribers: 500, hours: 3000, shortsViews90: 3_000_000, have: subscribers },
    { id: 'ads', label: 'Ad revenue', subscribers: 1000, hours: after ? 8000 : 4000, shortsViews90: after ? 20_000_000 : 10_000_000, have: subscribers },
  ];
}

const kv = (env) => {
  if (!env.NTS_KV) throw new HttpError(503, 'Storage is not set up (NTS_KV binding missing).');
  return env.NTS_KV;
};

async function snapshots(env) {
  return (await kv(env).get('an/snaps', 'json')) || [];
}

export async function refresh(rawEnv, fetchImpl = fetch) {
  const env = await store.withSettings(rawEnv);
  const raw = env.YOUTUBE_API_KEY ? await viaApi(env, fetchImpl) : await viaPublic(env, fetchImpl);
  const snap = { ...raw, fetchedAt: nowIso() };
  const list = await snapshots(rawEnv);
  // keep the full latest snapshot; older ones only need channel totals for growth
  const slim = list.map((s) => ({ fetchedAt: s.fetchedAt, channel: s.channel }));
  await kv(rawEnv).put('an/latest', JSON.stringify(snap));
  await kv(rawEnv).put('an/snaps', JSON.stringify([{ fetchedAt: snap.fetchedAt, channel: snap.channel }, ...slim].slice(0, MAX_SNAPS)));
  return snap;
}

function baseline(list, beforeIso, minHours = 20) {
  const cutoff = Date.parse(beforeIso) - minHours * 3_600_000;
  return list.find((s) => Date.parse(s.fetchedAt) <= cutoff) || null;
}

export async function writeInsights(rawEnv, snap, summary) {
  const env = await store.withSettings(rawEnv);
  const top = summary.topVideos.map((id) => snap.videos.find((v) => v.id === id)).filter(Boolean);
  const pick = ({ title, views, likes, comments, publishedAt, durationSec }) => ({ title, views, likes, comments, publishedAt, durationSec });
  const facts = { channel: snap.channel, source: snap.source, fetchedAt: snap.fetchedAt, summary, topVideos: top.map(pick), recentVideos: snap.videos.slice(0, 10).map(pick) };
  const system = `${await store.brainContext(rawEnv)}

You are SOMA (Growth & Analytics) for NIKHILs TECH STUDIO. You analyse the YouTube channel ${snap.channel.handle} for the owner.
Use ONLY numbers present in the provided data. Never estimate reach, impressions, watch time, CTR, retention or revenue: they are not in the data. If something is null, it is unknown.
Be specific and practical, tied to the studio's goal (SQL / AI career content, followers and first paying learners). Plain English, short sentences.`;
  const prompt = `Channel data (${snap.source}):\n${JSON.stringify(facts, null, 1)}\n\nReturn JSON: {"headline":string (<=140 chars),"working":[string],"notWorking":[string],"nextActions":[{"action":string,"why":string,"measureWith":string}]}\nworking/notWorking: 2-4 items each, each citing a number from the data. nextActions: exactly 3.`;
  const r = await generate(env, { system, prompt, json: true, maxTokens: 2000 });
  const o = parseJson(r.text);
  if (!o || typeof o.headline !== 'string' || !Array.isArray(o.working) || !Array.isArray(o.notWorking) || !Array.isArray(o.nextActions) || !o.nextActions.length) throw new Error('SOMA output missing required fields');
  const insights = { headline: o.headline.slice(0, 200), working: o.working.slice(0, 5).map(String), notWorking: o.notWorking.slice(0, 5).map(String), nextActions: o.nextActions.slice(0, 3).map((a) => ({ action: String(a.action || ''), why: String(a.why || ''), measureWith: String(a.measureWith || '') })), provider: `${r.engine} · ${r.model}`, at: nowIso(), basedOn: snap.fetchedAt };
  await kv(rawEnv).put('an/insights', JSON.stringify(insights));
  return insights;
}

/** Report for Dev Mode. Refreshes at most once per CACHE_MIN unless forced. */
export async function report(rawEnv, { force = false, insights = false } = {}, fetchImpl = fetch) {
  let snap = await kv(rawEnv).get('an/latest', 'json');
  let fetchError = null;
  if (force || !snap || Date.now() - Date.parse(snap.fetchedAt) > CACHE_MIN * 60_000) {
    try {
      snap = await refresh(rawEnv, fetchImpl);
    } catch (e) {
      fetchError = String(e.message || e).slice(0, 200);
      if (!snap) return { connected: false, reason: fetchError };
    }
  }
  const prev = baseline(await snapshots(rawEnv), snap.fetchedAt);
  const summary = summarize(snap, prev);
  let ins = await kv(rawEnv).get('an/insights', 'json');
  let insightsError = null;
  if (insights || (!ins && force)) {
    try {
      ins = await writeInsights(rawEnv, snap, summary);
    } catch (e) {
      insightsError = String(e.message || e).slice(0, 240);
    }
  }
  return { connected: true, source: snap.source, exact: snap.exact, fetchedAt: snap.fetchedAt, stale: Boolean(fetchError), fetchError, channel: snap.channel, videos: snap.videos, summary, ypp: ypp(snap.channel.subscribers), insights: ins, insightsError, dataGaps: snap.exact ? GAPS_API : GAPS_RSS };
}

/** Cron: refresh numbers; rewrite SOMA's analysis once a day. */
export async function scheduled(env) {
  if (!env.NTS_KV) return;
  try {
    const snap = await refresh(env);
    const ins = await env.NTS_KV.get('an/insights', 'json');
    if (!ins || Date.now() - Date.parse(ins.at) > 20 * 3_600_000) await writeInsights(env, snap, summarize(snap, baseline(await snapshots(env), snap.fetchedAt)));
  } catch (e) {
    console.log('[analytics] scheduled failed:', e.message);
  }
}
