// YouTube channel sign-in (OAuth 2.0, scope youtube.force-ssl) so the Community Manager can post
// approved comment replies through the official API. Only the refresh token is kept, AES-GCM encrypted
// in KV like every other setting. Owner-only start; the callback is validated by a one-time state.
import { HttpError, nowIso } from './util.mjs';
import * as store from './store.mjs';
import * as ops from './ops.mjs';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';
export const redirectUri = (origin) => `${origin}/api/yt/callback`;

export async function status(rawEnv, origin) {
  const env = await store.withSettings(rawEnv);
  return { configured: Boolean(env.YT_CLIENT_ID && env.YT_CLIENT_SECRET), connected: Boolean(env.YT_REFRESH_TOKEN), redirectUri: redirectUri(origin), channel: (rawEnv.NTS_KV && (await rawEnv.NTS_KV.get('yt/oauth/channel', 'json'))) || null };
}

/** Owner starts sign-in: returns the Google consent URL (state stored for 15 min). */
export async function start(rawEnv, origin) {
  const env = await store.withSettings(rawEnv);
  if (!env.YT_CLIENT_ID || !env.YT_CLIENT_SECRET) throw new HttpError(409, 'Add YT_CLIENT_ID and YT_CLIENT_SECRET in Settings first.');
  const state = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await rawEnv.NTS_KV.put(`yt/oauth/state/${state}`, '1', { expirationTtl: 900 });
  const q = new URLSearchParams({ client_id: env.YT_CLIENT_ID, redirect_uri: redirectUri(origin), response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
  return { url: `${AUTH}?${q}` };
}

const page = (title, msg, ok) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font-family:system-ui;background:#03191d;color:#f3fafa;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:440px;padding:28px;border:1px solid rgba(39,230,240,.2);border-radius:16px;text-align:center"><h1 style="font-size:20px;color:${ok ? '#35d69a' : '#f07878'}">${title}</h1><p>${msg}</p><p><a href="/dev" style="color:#27e6f0">Back to NTS COMMAND</a></p></div>`, { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });

/** Google redirects here with ?code&state. Public route; trusts only a valid one-time state. */
export async function callback(rawEnv, url, fetchImpl = fetch) {
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  if (url.searchParams.get('error')) return page('Sign-in cancelled', `Google said: ${url.searchParams.get('error').replace(/[<>&"]/g, '')}`, false);
  if (!/^[a-f0-9]{48}$/.test(state) || !(await rawEnv.NTS_KV.get(`yt/oauth/state/${state}`))) return page('Link expired', 'Start again from NTS COMMAND → Social Engagement → Connect YouTube.', false);
  await rawEnv.NTS_KV.delete(`yt/oauth/state/${state}`);
  const env = await store.withSettings(rawEnv);
  const r = await fetchImpl(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.YT_CLIENT_ID, client_secret: env.YT_CLIENT_SECRET, redirect_uri: redirectUri(url.origin), grant_type: 'authorization_code' }) });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.refresh_token) return page('Sign-in failed', t.error_description || t.error || 'No refresh token returned. Remove the app from your Google account permissions and try again.', false);
  await store.saveSetting(rawEnv, { name: 'YT_REFRESH_TOKEN', value: t.refresh_token });
  await rawEnv.NTS_KV.put('yt/oauth/access', JSON.stringify({ token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 }), { expirationTtl: Math.max(60, t.expires_in - 60) });
  // which channel did we get?
  const ch = await fetchImpl('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { authorization: `Bearer ${t.access_token}` } }).then((x) => x.json()).catch(() => ({}));
  const c = ch.items?.[0];
  if (c) await rawEnv.NTS_KV.put('yt/oauth/channel', JSON.stringify({ id: c.id, title: c.snippet?.title, at: nowIso() }));
  await ops.log(rawEnv, 'system', `YouTube connected${c ? `: ${c.snippet?.title}` : ''}`);
  return page('YouTube connected', `${c ? `Signed in as <b>${String(c.snippet?.title).replace(/[<>&]/g, '')}</b>. ` : ''}The Community Manager can now post the replies you approve.`, true);
}

export async function disconnect(rawEnv) {
  await store.deleteSetting(rawEnv, 'YT_REFRESH_TOKEN');
  await rawEnv.NTS_KV.delete('yt/oauth/access');
  await rawEnv.NTS_KV.delete('yt/oauth/channel');
  await ops.log(rawEnv, 'system', 'YouTube disconnected');
  return { connected: false };
}

async function accessToken(rawEnv, fetchImpl) {
  const cached = await rawEnv.NTS_KV.get('yt/oauth/access', 'json');
  if (cached?.token && cached.exp > Date.now()) return cached.token;
  const env = await store.withSettings(rawEnv);
  if (!env.YT_REFRESH_TOKEN) throw new HttpError(409, 'YouTube is not connected. Social Engagement → Connect YouTube.');
  const r = await fetchImpl(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.YT_CLIENT_ID, client_secret: env.YT_CLIENT_SECRET, refresh_token: env.YT_REFRESH_TOKEN, grant_type: 'refresh_token' }) });
  const t = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `YouTube sign-in expired (${t.error || r.status}). Connect YouTube again${t.error === 'invalid_grant' ? ' (apps in Google "Testing" mode must sign in again every 7 days)' : ''}.`);
  await rawEnv.NTS_KV.put('yt/oauth/access', JSON.stringify({ token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 }), { expirationTtl: Math.max(60, t.expires_in - 60) });
  return t.access_token;
}

/** Post an approved reply under a comment thread. Idempotent: a comment is replied to once. */
export async function publishReply(rawEnv, commentId, text, fetchImpl = fetch) {
  const list = (await rawEnv.NTS_KV.get('social/comments', 'json')) || [];
  const c = list.find((x) => x.id === commentId);
  if (!c) throw new HttpError(404, 'Comment not found.');
  if (c.replyId) return { already: true, replyId: c.replyId };
  if (c.status === 'escalated' && !text) throw new HttpError(409, 'Escalated comments need your own reply text.');
  const body = String(text ?? c.reply ?? '').trim();
  if (body.length < 2 || body.length > 2000) throw new HttpError(400, 'Reply must be 2 to 2000 characters.');
  const token = await accessToken(rawEnv, fetchImpl);
  const r = await fetchImpl('https://www.googleapis.com/youtube/v3/comments?part=snippet', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ snippet: { parentId: commentId, textOriginal: body } }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `YouTube reply failed: ${b?.error?.errors?.[0]?.reason || b?.error?.message || r.status}`);
  c.replyId = b.id;
  c.reply = body;
  c.status = 'replied';
  c.repliedAt = nowIso();
  await rawEnv.NTS_KV.put('social/comments', JSON.stringify(list));
  await ops.log(rawEnv, 'publish', `YouTube reply posted to ${c.author}`);
  return { replyId: b.id, url: c.url };
}
