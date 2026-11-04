// Worker entry for the public site: static assets + a tiny public API.
// GET /api/public/intro -> latest video from the YouTube channel (YouTube Data API v3, free key).
// Cached for 6 hours at the edge, so the daily API quota is barely touched.
import { json } from './util.mjs';
import * as dev from './dev.mjs';

const CACHE_SECONDS = 6 * 3600;

export async function latestVideo(env, fetchImpl = fetch) {
  if (!env.YOUTUBE_API_KEY) return { videoId: null, reason: 'YOUTUBE_API_KEY is not set' };
  const key = env.YOUTUBE_API_KEY;
  const handle = String(env.YOUTUBE_HANDLE || '@NikhilsTechStudio').replace(/^@?/, '@');
  const get = async (path, params) => {
    const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set('key', key);
    const r = await fetchImpl(u);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`YouTube ${path}: ${b?.error?.message || r.status}`.replace(key, '***'));
    return b;
  };
  const ch = (await get('channels', { part: 'contentDetails', forHandle: handle })).items?.[0];
  const uploads = ch?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return { videoId: null, reason: 'Channel not found' };
  const item = (await get('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: '1' })).items?.[0];
  if (!item) return { videoId: null, reason: 'Channel has no public videos' };
  return { videoId: item.contentDetails.videoId, title: item.snippet?.title ?? null, publishedAt: item.contentDetails.videoPublishedAt ?? null };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/public/intro' && request.method === 'GET') {
      const cache = caches.default;
      const cacheKey = new Request(`${url.origin}/api/public/intro`);
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
      let body;
      try {
        body = await latestVideo(env);
      } catch (e) {
        return json({ videoId: null, reason: String(e.message) }, 502);
      }
      const res = json(body, 200, { 'cache-control': `public, max-age=${CACHE_SECONDS}` });
      if (body.videoId) ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }
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
