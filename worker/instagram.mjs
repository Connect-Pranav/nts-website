// Instagram professional account (Business/Creator). Two Meta login flows are supported:
// - "Instagram Login" (older apps): instagram.com/oauth, graph.instagram.com, 60-day token refreshed by cron.
// - "Unified login" (newer apps, set IG_CONFIG_ID): Facebook Login for Business with a configuration,
//   graph.facebook.com, system-user token that does not expire.
// Reads account + post numbers and comments, and posts approved comment replies.
import { HttpError, nowIso } from './util.mjs';
import * as store from './store.mjs';
import * as ops from './ops.mjs';

const G = 'https://graph.instagram.com';
const FB = 'https://graph.facebook.com';
const SCOPES = ['instagram_business_basic', 'instagram_business_manage_comments', 'instagram_business_manage_insights'];
export const redirectUri = (origin) => `${origin}/api/ig/callback`;

async function call(token, path, params = {}, init = {}, fetchImpl = fetch, host = G) {
  const u = new URL(`${host}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', token);
  const r = await fetchImpl(u, init);
  const b = await r.json().catch(() => ({}));
  if (!r.ok || b.error) {
    const msg = String(b.error?.message || `HTTP ${r.status}`).split(token).join('***');
    throw new HttpError(r.status === 400 && b.error?.code === 190 ? 409 : 502, `Instagram: ${msg}${b.error?.code === 190 ? ' (sign-in expired: Connect Instagram again)' : ''}`);
  }
  return b;
}

async function token(rawEnv) {
  const env = await store.withSettings(rawEnv);
  if (!env.IG_ACCESS_TOKEN) throw new HttpError(409, 'Instagram is not connected. Social Engagement → Connect Instagram (or paste IG_ACCESS_TOKEN in Settings).');
  return env.IG_ACCESS_TOKEN;
}

/** Token + how to reach the account: Instagram-login token uses /me, unified-login token uses the IG user id. */
async function ctx(rawEnv) {
  const tok = await token(rawEnv);
  const meta = (rawEnv.NTS_KV && (await rawEnv.NTS_KV.get('ig/meta', 'json'))) || {};
  return meta.mode === 'fb' && meta.id ? { tok, host: FB, me: `/${meta.id}`, meta } : { tok, host: G, me: '/me', meta };
}

export async function status(rawEnv, origin) {
  const env = await store.withSettings(rawEnv);
  let meta = (rawEnv.NTS_KV && (await rawEnv.NTS_KV.get('ig/meta', 'json'))) || null;
  if (env.IG_ACCESS_TOKEN && !meta?.username && meta?.mode !== 'fb') {
    // token pasted by hand: learn the username once
    const me = await call(env.IG_ACCESS_TOKEN, '/me', { fields: 'user_id,username' }).catch(() => null);
    if (me) {
      meta = { id: me.user_id || me.id, username: me.username, exp: null, refreshedAt: null };
      await rawEnv.NTS_KV.put('ig/meta', JSON.stringify(meta));
    }
  }
  return { configured: Boolean(env.IG_APP_ID && env.IG_APP_SECRET), login: env.IG_CONFIG_ID ? 'unified' : 'instagram', connected: Boolean(env.IG_ACCESS_TOKEN), username: meta?.username ?? null, expiresAt: meta?.exp ? new Date(meta.exp).toISOString() : null, redirectUri: redirectUri(origin) };
}

export async function start(rawEnv, origin) {
  const env = await store.withSettings(rawEnv);
  if (!env.IG_APP_ID || !env.IG_APP_SECRET) throw new HttpError(409, 'Add IG_APP_ID and IG_APP_SECRET in Settings first.');
  const state = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await rawEnv.NTS_KV.put(`ig/oauth/state/${state}`, '1', { expirationTtl: 900 });
  if (env.IG_CONFIG_ID) {
    const f = new URLSearchParams({ client_id: env.IG_APP_ID, config_id: env.IG_CONFIG_ID, redirect_uri: redirectUri(origin), response_type: 'code', override_default_response_type: 'true', state });
    return { url: `https://www.facebook.com/dialog/oauth?${f}` };
  }
  const q = new URLSearchParams({ client_id: env.IG_APP_ID, redirect_uri: redirectUri(origin), response_type: 'code', scope: SCOPES.join(','), state, enable_fb_login: 'false', force_reauth: 'true' });
  return { url: `https://www.instagram.com/oauth/authorize?${q}` };
}

const page = (title, msg, ok) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font-family:system-ui;background:#03191d;color:#f3fafa;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:440px;padding:28px;border:1px solid rgba(39,230,240,.2);border-radius:16px;text-align:center"><h1 style="font-size:20px;color:${ok ? '#35d69a' : '#f07878'}">${title}</h1><p>${msg}</p><p><a href="/dev" style="color:#27e6f0">Back to NTS COMMAND</a></p></div>`, { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
const clean = (s) => String(s || '').replace(/[<>&"]/g, '');

async function remember(rawEnv, tok, expiresIn, fetchImpl) {
  await store.saveSetting(rawEnv, { name: 'IG_ACCESS_TOKEN', value: tok });
  const me = await call(tok, '/me', { fields: 'user_id,username' }, {}, fetchImpl).catch(() => ({}));
  await rawEnv.NTS_KV.put('ig/meta', JSON.stringify({ id: me.user_id || me.id, username: me.username, exp: Date.now() + (Number(expiresIn) || 5_184_000) * 1000, refreshedAt: nowIso() }));
  return me;
}

export async function callback(rawEnv, url, fetchImpl = fetch) {
  const state = url.searchParams.get('state') || '';
  if (url.searchParams.get('error')) return page('Instagram sign-in cancelled', clean(url.searchParams.get('error_description') || url.searchParams.get('error')), false);
  if (!/^[a-f0-9]{48}$/.test(state) || !(await rawEnv.NTS_KV.get(`ig/oauth/state/${state}`))) return page('Link expired', 'Start again from NTS COMMAND → Social Engagement → Connect Instagram.', false);
  await rawEnv.NTS_KV.delete(`ig/oauth/state/${state}`);
  const env = await store.withSettings(rawEnv);
  const code = String(url.searchParams.get('code') || '').replace(/#_$/, '');
  if (env.IG_CONFIG_ID) return callbackUnified(rawEnv, env, url, code, fetchImpl);
  const r = await fetchImpl('https://api.instagram.com/oauth/access_token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.IG_APP_ID, client_secret: env.IG_APP_SECRET, grant_type: 'authorization_code', redirect_uri: redirectUri(url.origin), code }) });
  const t = await r.json().catch(() => ({}));
  const short = t.access_token || t.data?.[0]?.access_token;
  if (!r.ok || !short) return page('Instagram sign-in failed', clean(t.error_message || t.error?.message || `HTTP ${r.status}`), false);
  const l = await fetchImpl(`${G}/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: env.IG_APP_SECRET, access_token: short })}`).then((x) => x.json()).catch(() => ({}));
  if (!l.access_token) return page('Instagram sign-in failed', clean(l.error?.message || 'Could not get a long-lived token.'), false);
  const me = await remember(rawEnv, l.access_token, l.expires_in, fetchImpl);
  await ops.log(rawEnv, 'system', `Instagram connected: @${me.username || '?'}`);
  return page('Instagram connected', `Signed in as <b>@${clean(me.username)}</b>. The token renews itself automatically.`, true);
}

/** Unified login: code → system-user token (never expires) → the Instagram account it was given. */
async function callbackUnified(rawEnv, env, url, code, fetchImpl) {
  const t = await fetchImpl(`${FB}/oauth/access_token?${new URLSearchParams({ client_id: env.IG_APP_ID, client_secret: env.IG_APP_SECRET, redirect_uri: redirectUri(url.origin), code })}`)
    .then((x) => x.json())
    .catch(() => ({}));
  if (!t.access_token) return page('Instagram sign-in failed', clean(t.error?.message || 'Could not get an access token.'), false);
  const tok = t.access_token;
  const why = [];
  const ig = await findAccount(tok, fetchImpl, `${env.IG_APP_ID}|${env.IG_APP_SECRET}`, why);
  if (!ig) return page('Instagram not found', `Signed in, but no Instagram professional account was shared with NTS Command. Connect again and tick the Instagram account.<br><small style="opacity:.6">${clean(why.join(' · ')).slice(0, 600)}</small>`, false);
  await store.saveSetting(rawEnv, { name: 'IG_ACCESS_TOKEN', value: tok });
  await rawEnv.NTS_KV.put('ig/meta', JSON.stringify({ mode: 'fb', id: ig.id, username: ig.username || null, exp: t.expires_in ? Date.now() + Number(t.expires_in) * 1000 : null, refreshedAt: nowIso() }));
  await ops.log(rawEnv, 'system', `Instagram connected: @${ig.username || ig.id}`);
  return page('Instagram connected', `Signed in as <b>@${clean(ig.username || ig.id)}</b>. This sign-in does not expire.`, true);
}

/** The Instagram account a unified-login token can act on. The token's own grant (debug_token →
 * granular_scopes target ids) is the most reliable; assigned and Page-linked accounts are fallbacks. */
export async function findAccount(tok, fetchImpl = fetch, appToken = '', why = []) {
  if (appToken) {
    const d = await call(appToken, '/debug_token', { input_token: tok }, {}, fetchImpl, FB).catch((e) => (why.push(`debug_token: ${e.message}`), null));
    const ids = [...new Set((d?.data?.granular_scopes || []).filter((g) => /^instagram_/.test(g.scope)).flatMap((g) => g.target_ids || []))];
    for (const id of ids) {
      const a = await call(tok, `/${id}`, { fields: 'id,username' }, {}, fetchImpl, FB).catch((e) => (why.push(`${id}: ${e.message}`), null));
      if (a?.username) return a;
    }
    if (ids.length) return { id: ids[0], username: null };
    if (d?.data) why.push(`scopes: ${(d.data.scopes || []).join(',') || 'none'}`);
  }
  const tries = [
    ['/me/assigned_instagram_accounts', { fields: 'id,username' }, (b) => b.data?.[0]],
    ['/me/instagram_accounts', { fields: 'id,username' }, (b) => b.data?.[0]],
    ['/me/accounts', { fields: 'instagram_business_account{id,username}' }, (b) => b.data?.find((p) => p.instagram_business_account)?.instagram_business_account],
  ];
  for (const [path, params, pick] of tries) {
    const b = await call(tok, path, params, {}, fetchImpl, FB).catch((e) => (why.push(`${path}: ${e.message}`), null));
    const a = b && pick(b);
    if (a?.id) return a;
  }
  return null;
}

export async function disconnect(rawEnv) {
  await store.deleteSetting(rawEnv, 'IG_ACCESS_TOKEN');
  await rawEnv.NTS_KV.delete('ig/meta');
  await ops.log(rawEnv, 'system', 'Instagram disconnected');
  return { connected: false };
}

/** Cron: renew the long-lived token when it is older than 20 days (valid 60). */
export async function refresh(rawEnv, fetchImpl = fetch) {
  const env = await store.withSettings(rawEnv);
  if (!env.IG_ACCESS_TOKEN || !rawEnv.NTS_KV) return null;
  const meta = (await rawEnv.NTS_KV.get('ig/meta', 'json')) || {};
  if (meta.mode === 'fb') return null; // system-user token: nothing to refresh
  if (meta.refreshedAt && Date.now() - Date.parse(meta.refreshedAt) < 20 * 86400_000) return null;
  const r = await call(env.IG_ACCESS_TOKEN, '/refresh_access_token', { grant_type: 'ig_refresh_token' }, {}, fetchImpl);
  await remember(rawEnv, r.access_token, r.expires_in, fetchImpl);
  return true;
}

/** Account numbers + recent posts (insights where Instagram provides them). */
export async function analytics(rawEnv, fetchImpl = fetch) {
  const { tok, host, me: mePath } = await ctx(rawEnv);
  const me = await call(tok, mePath, { fields: `${host === G ? 'user_id,' : ''}username,name,followers_count,follows_count,media_count` }, {}, fetchImpl, host);
  const media = await call(tok, `${mePath}/media`, { fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count', limit: '25' }, {}, fetchImpl, host);
  const posts = await Promise.all(
    (media.data || []).map(async (m, i) => {
      let ins = {};
      if (i < 12) {
        const metric = m.media_product_type === 'REELS' ? 'reach,saved,shares,views' : 'reach,saved,shares';
        const d = await call(tok, `/${m.id}/insights`, { metric }, {}, fetchImpl, host).catch(() => null);
        for (const x of d?.data || []) ins[x.name] = x.values?.[0]?.value ?? x.total_value?.value ?? null;
      }
      return { id: m.id, caption: String(m.caption || '').slice(0, 140), type: m.media_product_type || m.media_type, url: m.permalink, at: m.timestamp, likes: m.like_count ?? null, comments: m.comments_count ?? null, reach: ins.reach ?? null, saves: ins.saved ?? null, shares: ins.shares ?? null, views: ins.views ?? null };
    }),
  );
  const sum = (k) => posts.reduce((s, p) => s + (p[k] || 0), 0);
  const withReach = posts.filter((p) => p.reach);
  return {
    account: { username: me.username, name: me.name, followers: me.followers_count ?? null, following: me.follows_count ?? null, posts: me.media_count ?? null, url: `https://www.instagram.com/${me.username}/` },
    totals: { likes: sum('likes'), comments: sum('comments'), saves: sum('saves'), shares: sum('shares'), reach: sum('reach'), engagementRate: withReach.length ? (withReach.reduce((s, p) => s + (p.likes || 0) + (p.comments || 0) + (p.saves || 0) + (p.shares || 0), 0) / withReach.reduce((s, p) => s + p.reach, 0)) : null },
    posts,
    fetchedAt: nowIso(),
  };
}

/** Recent comments on the latest posts (for the Community Manager). */
export async function comments(rawEnv, max = 40, fetchImpl = fetch) {
  const { tok, host, me: mePath, meta } = await ctx(rawEnv);
  const media = await call(tok, `${mePath}/media`, { fields: 'id,permalink,caption', limit: '8' }, {}, fetchImpl, host);
  const out = [];
  for (const m of media.data || []) {
    const c = await call(tok, `/${m.id}/comments`, { fields: 'id,text,username,timestamp,like_count', limit: '25' }, {}, fetchImpl, host).catch(() => ({ data: [] }));
    for (const x of c.data || []) if (x.username !== meta.username) out.push({ id: x.id, platform: 'instagram', mediaId: m.id, author: x.username, text: String(x.text || '').slice(0, 1000), likes: x.like_count ?? 0, at: x.timestamp, url: m.permalink, post: String(m.caption || '').slice(0, 200) });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, max);
}

export async function reply(rawEnv, commentId, message, fetchImpl = fetch) {
  const { tok, host } = await ctx(rawEnv);
  const r = await call(tok, `/${commentId}/replies`, { message }, { method: 'POST' }, fetchImpl, host);
  return r.id;
}
