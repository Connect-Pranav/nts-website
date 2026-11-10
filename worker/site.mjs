// Worker entry for the public site: static assets + a tiny public API.
// GET /api/public/intro -> latest video from the YouTube channel (YouTube Data API v3, free key).
// Cached for 6 hours at the edge, so the daily API quota is barely touched.
import { json } from './util.mjs';
import * as dev from './dev.mjs';
import * as work from './work.mjs';
import * as analytics from './analytics.mjs';
import { handleMcp } from './mcp.mjs';
import * as ytOAuth from './youtube.mjs';
import * as liOAuth from './linkedin.mjs';
import * as igOAuth from './instagram.mjs';
import * as disha from './disha.mjs';
import { withSettings } from './store.mjs';

const CACHE_SECONDS = 6 * 3600;

const YT_HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; NTS-Website/1.0)',
  'accept-language': 'en-US,en;q=0.9',
  cookie: 'SOCS=CAI; CONSENT=YES+1', // skip the EU consent interstitial
};
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Find the channel ID for a handle from the public channel page (no API key). */
export async function resolveChannelId(env, fetchImpl = fetch) {
  if (env.YOUTUBE_CHANNEL_ID && CHANNEL_ID.test(env.YOUTUBE_CHANNEL_ID)) return env.YOUTUBE_CHANNEL_ID;
  const handle = String(env.YOUTUBE_HANDLE || '@NikhilsTechStudio').replace(/^@?/, '@');
  const r = await fetchImpl(`https://www.youtube.com/${encodeURIComponent(handle)}`, { headers: YT_HEADERS });
  if (!r.ok) throw new Error(`YouTube channel page: HTTP ${r.status}`);
  const html = await r.text();
  const m =
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/) ||
    html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/) ||
    html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/);
  if (!m) throw new Error('Could not find the channel ID on the channel page. Set YOUTUBE_CHANNEL_ID.');
  return m[1];
}

/** Latest uploads from the public RSS feed (no API key, up to 15 videos). */
export async function feedVideos(channelId, fetchImpl = fetch) {
  const r = await fetchImpl(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { headers: YT_HEADERS });
  if (!r.ok) throw new Error(`YouTube feed: HTTP ${r.status}`);
  const xml = await r.text();
  const title = decode((xml.match(/<title>([^<]*)<\/title>/) || [])[1] || '');
  const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map(([, e]) => ({
      id: (e.match(/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/) || [])[1],
      title: decode((e.match(/<title>([^<]*)<\/title>/) || [])[1] || ''),
      thumbnail: (e.match(/<media:thumbnail url="([^"]+)"/) || [])[1] || null,
      publishedAt: (e.match(/<published>([^<]+)<\/published>/) || [])[1] || null,
    }))
    .filter((v) => v.id);
  return { title, videos };
}

/** Channel info + latest uploads. Uses the Data API when a key is set, otherwise the public feed. */
export async function channelVideos(env, fetchImpl = fetch, max = 12) {
  if (!env.YOUTUBE_API_KEY) {
    const id = await resolveChannelId(env, fetchImpl);
    const feed = await feedVideos(id, fetchImpl);
    return { channel: { id, title: feed.title || null, uploadsPlaylistId: `UU${id.slice(2)}` }, videos: feed.videos.slice(0, max), source: 'rss' };
  }
  const key = env.YOUTUBE_API_KEY;
  const handle = String(env.YOUTUBE_HANDLE || '@NikhilsTechStudio').replace(/^@?/, '@');
  const get = async (path, params) => {
    const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set('key', key);
    const r = await fetchImpl(u);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`YouTube ${path}: ${b?.error?.message || r.status}`.split(key).join('***'));
    return b;
  };
  const ch = (await get('channels', { part: 'snippet,contentDetails', forHandle: handle })).items?.[0];
  const uploads = ch?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return { channel: null, videos: [], reason: 'Channel not found' };
  const items = (await get('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: String(max) })).items ?? [];
  const videos = items
    .filter((i) => i.contentDetails?.videoId && i.snippet?.title !== 'Private video' && i.snippet?.title !== 'Deleted video')
    .map((i) => ({
      id: i.contentDetails.videoId,
      title: i.snippet?.title ?? '',
      thumbnail: i.snippet?.thumbnails?.medium?.url ?? i.snippet?.thumbnails?.default?.url ?? null,
      publishedAt: i.contentDetails.videoPublishedAt ?? i.snippet?.publishedAt ?? null,
    }));
  return { channel: { id: ch.id, title: ch.snippet?.title ?? null, uploadsPlaylistId: uploads }, videos, source: 'api' };
}

/** Latest upload (used by Watch Intro). */
export async function latestVideo(env, fetchImpl = fetch) {
  const d = await channelVideos(env, fetchImpl, 1);
  const v = d.videos[0];
  if (!v) return { videoId: null, reason: d.reason || 'Channel has no public videos' };
  return { videoId: v.id, title: v.title, publishedAt: v.publishedAt };
}

async function cached(url, ctx, compute) {
  const cache = caches.default;
  const key = new Request(`${url.origin}${url.pathname}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  let body;
  try {
    body = await compute();
  } catch (e) {
    return json({ error: String(e.message) }, 502);
  }
  const ok = Boolean(body.videoId || body.videos?.length);
  const res = json(body, 200, { 'cache-control': ok ? `public, max-age=${CACHE_SECONDS}` : 'no-store' });
  if (ok) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/** Hourly: fetch + analyse new YouTube/Instagram comments; safe replies go out automatically (owner policy). */
async function socialHourly(env) {
  try {
    const { analyzeComments } = await import('./integrations.mjs');
    await analyzeComments(env);
  } catch (e) {
    console.log('[social] hourly:', e.message);
  }
}

export default {
  // Cloudflare cron (free): the NTS agent team runs a cycle on autopilot
  async scheduled(event, env, ctx) {
    if (event.cron === '5 * * * *') {
      return ctx.waitUntil(Promise.all([
        liOAuth.scheduled(env),
        socialHourly(env),
        env.DB ? import('./quiz-campaign.mjs').then(m => m.syncPublishStatus(env.DB, env)).catch(e => console.log('[quiz] hourly sync:', e.message)) : Promise.resolve()
      ])); // hourly: due LinkedIn posts + new comments + quiz sync
    }
    ctx.waitUntil(Promise.all([analytics.scheduled(env), work.scheduled(env), liOAuth.scheduled(env), igOAuth.refresh(env).catch((e) => console.log('[instagram] refresh failed:', e.message))]));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/public/intro') return cached(url, ctx, async () => latestVideo(await withSettings(env)));
    if (request.method === 'GET' && url.pathname === '/api/public/youtube') return cached(url, ctx, async () => channelVideos(await withSettings(env)));
    if (url.pathname === '/api/ig/callback' && request.method === 'GET') {
      try {
        return await igOAuth.callback(env, url);
      } catch (e) {
        return json({ error: e.status ? e.message : 'Sign-in failed.' }, e.status || 500);
      }
    }
    if (url.pathname === '/api/li/callback' && request.method === 'GET') {
      try {
        return await liOAuth.callback(env, url);
      } catch (e) {
        return json({ error: e.status ? e.message : 'Sign-in failed.' }, e.status || 500);
      }
    }
    if (url.pathname === '/api/yt/callback' && request.method === 'GET') {
      try {
        return await ytOAuth.callback(env, url);
      } catch (e) {
        return json({ error: e.status ? e.message : 'Sign-in failed.' }, e.status || 500);
      }
    }
    if (url.pathname === '/mcp') {
      try {
        return await handleMcp(await withSettings(env), request);
      } catch (e) {
        return json({ jsonrpc: '2.0', error: { code: -32603, message: e.status ? e.message : 'Internal error' }, id: null }, e.status || 500);
      }
    }
    if (url.pathname.startsWith('/api/disha/') || url.pathname.startsWith('/api/marg/')) {
      try {
        return await disha.handle(env, request, url);
      } catch (e) {
        return json({ error: e.status ? e.message : 'Something went wrong.' }, e.status || 500);
      }
    }
    if (url.pathname.startsWith('/api/dev/')) {
      try {
        return await dev.handle(env, request, url, ctx);
      } catch (e) {
        return json({ error: e.status ? e.message : 'Something went wrong.' }, e.status || 500);
      }
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
