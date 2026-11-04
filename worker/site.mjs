// Worker entry for the public site: static assets + a tiny public API.
// GET /api/public/intro -> latest video from the YouTube channel (YouTube Data API v3, free key).
// Cached for 6 hours at the edge, so the daily API quota is barely touched.
import { json } from './util.mjs';
import * as dev from './dev.mjs';

const CACHE_SECONDS = 6 * 3600;

/** Channel info + latest uploads via YouTube Data API v3 (free key). */
export async function channelVideos(env, fetchImpl = fetch, max = 12) {
  if (!env.YOUTUBE_API_KEY) return { channel: null, videos: [], reason: 'YOUTUBE_API_KEY is not set' };
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
  return { channel: { id: ch.id, title: ch.snippet?.title ?? null, uploadsPlaylistId: uploads }, videos };
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/public/intro') return cached(url, ctx, () => latestVideo(env));
    if (request.method === 'GET' && url.pathname === '/api/public/youtube') return cached(url, ctx, () => channelVideos(env));
    if (url.pathname.startsWith('/api/dev/')) {
      try {
        return await dev.handle(env, request, url);
      } catch (e) {
        return json({ error: e.status ? e.message : 'Something went wrong.' }, e.status || 500);
      }
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
