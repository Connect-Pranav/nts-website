// Instagram — "Instagram API with Instagram Login" (official). Account must be Professional (Creator/Business).
// Scopes: instagram_business_basic, instagram_business_content_publish, instagram_business_manage_insights.
// Long-lived tokens last 60 days and are refreshed automatically by the cron when older than 24 h.
import { HttpError } from '../util.mjs';
import { apiJson, newState, consumeState, redirectUri, saveTokens, tokens, updateAccess, markError, markSynced, upsertItem, snapshot } from './common.mjs';

const AUTH = 'https://www.instagram.com/oauth/authorize';
const TOKEN = 'https://api.instagram.com/oauth/access_token';
export const SCOPES = ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_insights'];
const graph = (env) => `https://graph.instagram.com/${env.IG_GRAPH_VERSION || 'v24.0'}`;

export const appConfigured = (env) => Boolean(env.IG_APP_ID && env.IG_APP_SECRET);

export function capabilities(conn) {
  const s = conn?.scopes ?? [];
  const c = conn?.status === 'connected';
  const need = (scope, what) => (c && s.includes(scope) ? { available: true } : { available: false, reason: c ? `${scope} was not granted. Reconnect to allow ${what}.` : 'Connect Instagram first.' });
  return {
    readPosts: need('instagram_business_basic', 'reading media'),
    analytics: need('instagram_business_manage_insights', 'insights'),
    publish: { ...need('instagram_business_content_publish', 'publishing'), note: 'Needs a public image or video URL (upload it in Admin → CMS → Images).' },
    schedule: { available: true, note: 'Scheduled on this site; posted at the scheduled time.' },
  };
}

export async function startConnect(env, db, userId) {
  if (!appConfigured(env)) throw new HttpError(409, 'Set IG_APP_ID and IG_APP_SECRET first (see docs/OAUTH_SETUP.md).');
  const state = await newState(db, 'instagram', userId);
  const u = new URL(AUTH);
  u.searchParams.set('client_id', env.IG_APP_ID);
  u.searchParams.set('redirect_uri', redirectUri(env, 'instagram'));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPES.join(','));
  u.searchParams.set('state', state);
  return { url: u.toString() };
}

export async function finishConnect(env, db, url, fetchImpl = fetch) {
  await consumeState(db, 'instagram', url.searchParams.get('state'));
  if (url.searchParams.get('error')) throw new HttpError(400, `Instagram: ${url.searchParams.get('error_description') || url.searchParams.get('error')}`);
  const code = (url.searchParams.get('code') || '').replace(/#_$/, '');
  if (!code) throw new HttpError(400, 'Instagram did not return a code.');
  const form = new URLSearchParams({ client_id: env.IG_APP_ID, client_secret: env.IG_APP_SECRET, grant_type: 'authorization_code', redirect_uri: redirectUri(env, 'instagram'), code });
  const { body: short } = await apiJson(fetchImpl, TOKEN, { method: 'POST', body: form }, 'Instagram token exchange', [env.IG_APP_SECRET, code]);
  const shortTok = short.access_token ?? short.data?.[0]?.access_token;
  const granted = short.permissions ?? short.data?.[0]?.permissions ?? SCOPES;
  const lu = new URL('https://graph.instagram.com/access_token');
  lu.searchParams.set('grant_type', 'ig_exchange_token');
  lu.searchParams.set('client_secret', env.IG_APP_SECRET);
  lu.searchParams.set('access_token', shortTok);
  const { body: long } = await apiJson(fetchImpl, lu, {}, 'Instagram long-lived token', [env.IG_APP_SECRET, shortTok]);
  const me = await profile(env, long.access_token, fetchImpl);
  await saveTokens(env, db, 'instagram', {
    access: long.access_token,
    expiresAt: new Date(Date.now() + (long.expires_in ?? 5184000) * 1000).toISOString(),
    scopes: Array.isArray(granted) ? granted.join(' ') : String(granted).replace(/,/g, ' '),
    accountId: me.user_id ?? me.id,
    accountName: me.username ? `@${me.username}` : null,
    profileUrl: me.username ? `https://www.instagram.com/${me.username}/` : null,
  });
  return { accountName: me.username };
}

async function profile(env, access, fetchImpl) {
  const u = new URL(`${graph(env)}/me`);
  u.searchParams.set('fields', 'user_id,username,account_type,followers_count,media_count');
  u.searchParams.set('access_token', access);
  return (await apiJson(fetchImpl, u, {}, 'Instagram profile', [access])).body;
}

/** Refresh the long-lived token when it is older than 24h and not yet expired. */
export async function refreshIfDue(env, db, fetchImpl = fetch) {
  const row = await db.prepare("SELECT * FROM social_connections WHERE platform='instagram' AND status='connected'").first();
  if (!row) return { skipped: true };
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) {
    await markError(db, 'instagram', 'expired', 'Token expired. Reconnect Instagram.');
    return { expired: true };
  }
  if (Date.now() - Date.parse(row.updated_at) < 24 * 3600_000) return { skipped: true };
  const { access } = await tokens(env, db, 'instagram');
  const u = new URL('https://graph.instagram.com/refresh_access_token');
  u.searchParams.set('grant_type', 'ig_refresh_token');
  u.searchParams.set('access_token', access);
  try {
    const { body } = await apiJson(fetchImpl, u, {}, 'Instagram token refresh', [access]);
    await updateAccess(env, db, 'instagram', body.access_token, new Date(Date.now() + (body.expires_in ?? 5184000) * 1000).toISOString());
    return { refreshed: true };
  } catch (e) {
    if (e.upstreamStatus === 400 || e.upstreamStatus === 401) await markError(db, 'instagram', 'revoked', e.message);
    throw e;
  }
}

export async function sync(env, db, fetchImpl = fetch) {
  const { access } = await tokens(env, db, 'instagram');
  try {
    const me = await profile(env, access, fetchImpl);
    const u = new URL(`${graph(env)}/me/media`);
    u.searchParams.set('fields', 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count');
    u.searchParams.set('limit', '30');
    u.searchParams.set('access_token', access);
    const { body } = await apiJson(fetchImpl, u, {}, 'Instagram media', [access]);
    let n = 0;
    for (const m of body.data ?? []) {
      await upsertItem(db, {
        platform: 'instagram',
        remoteId: m.id,
        kind: m.media_product_type === 'REELS' ? 'reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : m.media_type === 'VIDEO' ? 'video' : 'image',
        caption: m.caption ?? null,
        url: m.permalink,
        thumbnailUrl: m.thumbnail_url ?? (m.media_type === 'IMAGE' ? m.media_url : null),
        publishedAt: m.timestamp,
        metrics: { likes: m.like_count ?? null, comments: m.comments_count ?? null },
      });
      n++;
    }
    await snapshot(db, 'instagram', { followers: me.followers_count ?? null, posts: me.media_count ?? null });
    await markSynced(db, 'instagram');
    return { items: n };
  } catch (e) {
    if (e.upstreamStatus === 401 || e.upstreamStatus === 403) await markError(db, 'instagram', 'revoked', e.message);
    else await markError(db, 'instagram', 'connected', e.message);
    throw e;
  }
}

/** Publish an image or a Reel. media_url must be publicly reachable. */
export async function publish(env, db, { text, mediaUrl, mediaType }, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const { row, access } = await tokens(env, db, 'instagram');
  if (!(row.scopes || '').includes('instagram_business_content_publish')) throw new HttpError(409, 'Publishing permission was not granted. Reconnect Instagram.');
  if (!mediaUrl || !/^https:\/\//.test(mediaUrl)) throw new HttpError(400, 'Instagram posts need a public https image or video URL.');
  if (text && text.length > 2200) throw new HttpError(400, 'Instagram captions are limited to 2200 characters.');
  const isVideo = mediaType === 'video' || /\.(mp4|mov)(\?|$)/i.test(mediaUrl);
  const form = new URLSearchParams({ caption: text || '', access_token: access });
  if (isVideo) {
    form.set('media_type', 'REELS');
    form.set('video_url', mediaUrl);
  } else form.set('image_url', mediaUrl);
  const { body: container } = await apiJson(fetchImpl, `${graph(env)}/me/media`, { method: 'POST', body: form }, 'Instagram create container', [access]);
  // Wait for processing (videos take longer). Bounded polling.
  for (let i = 0; i < (isVideo ? 20 : 5); i++) {
    const su = new URL(`${graph(env)}/${container.id}`);
    su.searchParams.set('fields', 'status_code');
    su.searchParams.set('access_token', access);
    const { body: st } = await apiJson(fetchImpl, su, {}, 'Instagram container status', [access]);
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new HttpError(502, `Instagram could not process the media (${st.status_code}).`);
    if (i === (isVideo ? 19 : 4)) throw new HttpError(504, 'Instagram is still processing the media. The job will retry.');
    await sleep(isVideo ? 3000 : 1000);
  }
  const pub = new URLSearchParams({ creation_id: container.id, access_token: access });
  const { body: done } = await apiJson(fetchImpl, `${graph(env)}/me/media_publish`, { method: 'POST', body: pub }, 'Instagram publish', [access]);
  let permalink = null;
  try {
    const pu = new URL(`${graph(env)}/${done.id}`);
    pu.searchParams.set('fields', 'permalink');
    pu.searchParams.set('access_token', access);
    permalink = (await apiJson(fetchImpl, pu, {}, 'Instagram permalink', [access])).body.permalink ?? null;
  } catch {
    /* permalink is optional */
  }
  return { remoteId: done.id, remoteUrl: permalink };
}
