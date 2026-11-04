// YouTube — YouTube Data API v3 (official).
// Two modes:
//   1. Public data with a free API key (YOUTUBE_API_KEY + YOUTUBE_HANDLE): channel info, videos, playlists, public stats.
//      This needs no OAuth and is labelled "Public data" — never "Connected".
//   2. Google OAuth (youtube.readonly) for the channel owner: same reads via the owner's channel; shown as "Connected".
// Publishing (videos.insert) is NOT enabled: Google locks uploads from unaudited API projects to private,
// and Workers cannot stream large video files reliably. The admin says so instead of faking it.
import { HttpError } from '../util.mjs';
import { apiJson, newState, consumeState, redirectUri, saveTokens, tokens, updateAccess, markError, markSynced, upsertItem, snapshot, getConn } from './common.mjs';
import { pkceChallenge, randomToken } from '../crypto.mjs';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/youtube/v3';
export const SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];

export const appConfigured = (env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const publicConfigured = (env) => Boolean(env.YOUTUBE_API_KEY && (env.YOUTUBE_HANDLE || env.YOUTUBE_CHANNEL_ID));

export function capabilities(conn, env) {
  const c = conn?.status === 'connected';
  const pub = publicConfigured(env);
  return {
    readPosts: c || pub ? { available: true, note: c ? 'Via your Google sign-in.' : 'Public data via API key.' } : { available: false, reason: 'Set YOUTUBE_API_KEY and YOUTUBE_HANDLE, or connect Google.' },
    analytics: c || pub ? { available: true, note: 'Public statistics (views, likes, subscribers).' } : { available: false, reason: 'Not configured.' },
    publish: { available: false, reason: 'Video upload via API needs a Google API audit (unaudited uploads are forced private). Upload in YouTube Studio; the site picks it up on the next sync.' },
    schedule: { available: false, reason: 'Schedule premieres in YouTube Studio.' },
  };
}

export async function startConnect(env, db, userId) {
  if (!appConfigured(env)) throw new HttpError(409, 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first (see docs/OAUTH_SETUP.md).');
  const verifier = randomToken(32);
  const state = await newState(db, 'youtube', userId, verifier);
  const u = new URL(AUTH);
  u.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri', redirectUri(env, 'youtube'));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPES.join(' '));
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', await pkceChallenge(verifier));
  u.searchParams.set('code_challenge_method', 'S256');
  return { url: u.toString() };
}

export async function finishConnect(env, db, url, fetchImpl = fetch) {
  const st = await consumeState(db, 'youtube', url.searchParams.get('state'));
  if (url.searchParams.get('error')) throw new HttpError(400, `Google: ${url.searchParams.get('error')}`);
  const code = url.searchParams.get('code');
  if (!code) throw new HttpError(400, 'Google did not return a code.');
  const form = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: 'authorization_code', redirect_uri: redirectUri(env, 'youtube'), code, code_verifier: st.verifier });
  const { body: tok } = await apiJson(fetchImpl, TOKEN, { method: 'POST', body: form }, 'Google token exchange', [env.GOOGLE_CLIENT_SECRET, code]);
  if (!tok.refresh_token) throw new HttpError(400, 'Google returned no refresh token. Remove the app at myaccount.google.com → Security → Third-party access, then connect again.');
  const u = new URL(`${API}/channels`);
  u.searchParams.set('part', 'snippet');
  u.searchParams.set('mine', 'true');
  const { body: ch } = await apiJson(fetchImpl, u, { headers: { authorization: `Bearer ${tok.access_token}` } }, 'YouTube channel', [tok.access_token]);
  const c = ch.items?.[0];
  if (!c) throw new HttpError(400, 'This Google account has no YouTube channel. Sign in with the account that owns @NikhilsTechStudio.');
  await saveTokens(env, db, 'youtube', {
    access: tok.access_token,
    refresh: tok.refresh_token,
    expiresAt: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
    scopes: tok.scope ?? SCOPES.join(' '),
    accountId: c.id,
    accountName: c.snippet?.title ?? null,
    profileUrl: c.snippet?.customUrl ? `https://www.youtube.com/${c.snippet.customUrl}` : `https://www.youtube.com/channel/${c.id}`,
  });
  return { accountName: c.snippet?.title };
}

/** Returns a function that authorises a URL: OAuth bearer if connected, otherwise API key. */
async function authorizer(env, db, fetchImpl) {
  const conn = await getConn(db, 'youtube');
  if (conn?.status === 'connected') {
    const { row, access, refresh } = await tokens(env, db, 'youtube');
    let token = access;
    if (!row.expires_at || Date.parse(row.expires_at) < Date.now() + 60_000) {
      try {
        const form = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: refresh });
        const { body } = await apiJson(fetchImpl, TOKEN, { method: 'POST', body: form }, 'Google token refresh', [env.GOOGLE_CLIENT_SECRET, refresh]);
        token = body.access_token;
        await updateAccess(env, db, 'youtube', token, new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString());
      } catch (e) {
        await markError(db, 'youtube', 'revoked', 'Google sign-in expired or was removed. Reconnect YouTube.');
        throw e;
      }
    }
    return { mode: 'oauth', channel: { mine: true, id: row.account_id }, auth: (u) => ({ url: u, init: { headers: { authorization: `Bearer ${token}` } } }), secrets: [token] };
  }
  if (!publicConfigured(env)) throw new HttpError(409, 'YouTube is not configured. Set YOUTUBE_API_KEY and YOUTUBE_HANDLE, or connect Google.', 'not_connected');
  return {
    mode: 'public',
    channel: env.YOUTUBE_CHANNEL_ID ? { id: env.YOUTUBE_CHANNEL_ID } : { handle: env.YOUTUBE_HANDLE },
    auth: (u) => {
      u.searchParams.set('key', env.YOUTUBE_API_KEY);
      return { url: u, init: {} };
    },
    secrets: [env.YOUTUBE_API_KEY],
  };
}

async function get(fetchImpl, a, path, params, what) {
  const u = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const { url, init } = a.auth(u);
  return (await apiJson(fetchImpl, url, init, what, a.secrets)).body;
}

export async function sync(env, db, fetchImpl = fetch) {
  const a = await authorizer(env, db, fetchImpl);
  const chParams = { part: 'snippet,statistics,contentDetails' };
  if (a.channel.mine) chParams.mine = 'true';
  else if (a.channel.id) chParams.id = a.channel.id;
  else chParams.forHandle = String(a.channel.handle).replace(/^@?/, '@');
  const ch = (await get(fetchImpl, a, 'channels', chParams, 'YouTube channel')).items?.[0];
  if (!ch) throw new HttpError(404, 'YouTube channel not found. Check YOUTUBE_HANDLE.');
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  const list = uploads ? await get(fetchImpl, a, 'playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: '25' }, 'YouTube uploads') : { items: [] };
  const ids = (list.items ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean);
  let n = 0;
  if (ids.length) {
    const vids = await get(fetchImpl, a, 'videos', { part: 'snippet,statistics,contentDetails', id: ids.join(',') }, 'YouTube videos');
    for (const v of vids.items ?? []) {
      const dur = v.contentDetails?.duration ?? '';
      const short = /^PT(\d{1,2}S|1M)$/.test(dur) || /^PT[0-5]?\dS$/.test(dur);
      await upsertItem(db, {
        platform: 'youtube',
        remoteId: v.id,
        kind: short ? 'short' : 'video',
        title: v.snippet?.title,
        caption: (v.snippet?.description ?? '').slice(0, 600),
        url: short ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
        thumbnailUrl: v.snippet?.thumbnails?.maxres?.url ?? v.snippet?.thumbnails?.high?.url ?? v.snippet?.thumbnails?.medium?.url ?? null,
        publishedAt: v.snippet?.publishedAt,
        metrics: { views: num(v.statistics?.viewCount), likes: num(v.statistics?.likeCount), comments: num(v.statistics?.commentCount), duration: dur },
      });
      n++;
    }
  }
  const pls = await get(fetchImpl, a, 'playlists', { part: 'snippet,contentDetails', channelId: ch.id, maxResults: '25' }, 'YouTube playlists');
  for (const p of pls.items ?? []) {
    await upsertItem(db, {
      platform: 'youtube',
      remoteId: `pl_${p.id}`,
      kind: 'playlist',
      title: p.snippet?.title,
      caption: (p.snippet?.description ?? '').slice(0, 400),
      url: `https://www.youtube.com/playlist?list=${p.id}`,
      thumbnailUrl: p.snippet?.thumbnails?.high?.url ?? p.snippet?.thumbnails?.medium?.url ?? null,
      publishedAt: p.snippet?.publishedAt,
      metrics: { videos: p.contentDetails?.itemCount ?? null },
    });
  }
  const s = ch.statistics ?? {};
  await snapshot(db, 'youtube', { followers: s.hiddenSubscriberCount ? null : num(s.subscriberCount), views: num(s.viewCount), posts: num(s.videoCount) });
  if (a.mode === 'oauth') await markSynced(db, 'youtube');
  else await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('youtube_public_sync', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(JSON.stringify({ at: new Date().toISOString(), channel: ch.snippet?.title, id: ch.id }), new Date().toISOString()).run();
  return { items: n, playlists: (pls.items ?? []).length, mode: a.mode, channel: ch.snippet?.title };
}

const num = (v) => (v === undefined || v === null ? null : Number(v));

export async function publish() {
  throw new HttpError(501, 'YouTube upload is not enabled. Upload in YouTube Studio; the video appears on the site after the next sync.');
}
