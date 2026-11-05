// LinkedIn: sign in once (OpenID Connect + Share on LinkedIn, both self-serve, no partner review) and post
// approved drafts to the signed-in member's personal profile through the official Posts API.
// Self-serve tokens last 60 days and cannot be refreshed: the dashboard shows the expiry and asks to
// reconnect. Company Page posting needs LinkedIn's Community Management API review (not used here).
import { HttpError, nowIso } from './util.mjs';
import * as store from './store.mjs';
import * as ops from './ops.mjs';
import { polishPost } from './postfmt.mjs';

const AUTH = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken';
const SCOPE = 'openid profile w_member_social';
export const redirectUri = (origin) => `${origin}/api/li/callback`;

/** LinkedIn API versions are YYYYMM and retire after about a year: use recent months, newest first. */
export function versions(now = new Date()) {
  const out = [];
  for (const back of [1, 2, 3, 5]) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** Posts API "little text": escape reserved characters, keep #hashtags as real hashtags. */
export function commentary(text) {
  const esc = (s) => s.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
  return String(text)
    .split(/(#[\p{L}\p{N}_]+)/u)
    .map((part) => (/^#[\p{L}\p{N}_]+$/u.test(part) ? `{hashtag|\\#|${part.slice(1)}}` : esc(part)))
    .join('');
}

export async function status(rawEnv, origin) {
  const env = await store.withSettings(rawEnv);
  const meta = (rawEnv.NTS_KV && (await rawEnv.NTS_KV.get('li/oauth/meta', 'json'))) || null;
  const live = Boolean(env.LI_ACCESS_TOKEN && meta && meta.exp > Date.now());
  return { configured: Boolean(env.LI_CLIENT_ID && env.LI_CLIENT_SECRET), connected: live, expired: Boolean(env.LI_ACCESS_TOKEN && meta && meta.exp <= Date.now()), name: meta?.name ?? null, expiresAt: meta ? new Date(meta.exp).toISOString() : null, redirectUri: redirectUri(origin) };
}

export async function start(rawEnv, origin) {
  const env = await store.withSettings(rawEnv);
  if (!env.LI_CLIENT_ID || !env.LI_CLIENT_SECRET) throw new HttpError(409, 'Add LI_CLIENT_ID and LI_CLIENT_SECRET in Settings first.');
  const state = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await rawEnv.NTS_KV.put(`li/oauth/state/${state}`, '1', { expirationTtl: 900 });
  const q = new URLSearchParams({ response_type: 'code', client_id: env.LI_CLIENT_ID, redirect_uri: redirectUri(origin), state, scope: SCOPE });
  return { url: `${AUTH}?${q}` };
}

const page = (title, msg, ok) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font-family:system-ui;background:#03191d;color:#f3fafa;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:440px;padding:28px;border:1px solid rgba(39,230,240,.2);border-radius:16px;text-align:center"><h1 style="font-size:20px;color:${ok ? '#35d69a' : '#f07878'}">${title}</h1><p>${msg}</p><p><a href="/dev" style="color:#27e6f0">Back to NTS COMMAND</a></p></div>`, { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
const clean = (s) => String(s || '').replace(/[<>&"]/g, '');

export async function callback(rawEnv, url, fetchImpl = fetch) {
  const state = url.searchParams.get('state') || '';
  if (url.searchParams.get('error')) return page('LinkedIn sign-in cancelled', clean(url.searchParams.get('error_description') || url.searchParams.get('error')), false);
  if (!/^[a-f0-9]{48}$/.test(state) || !(await rawEnv.NTS_KV.get(`li/oauth/state/${state}`))) return page('Link expired', 'Start again from NTS COMMAND → LinkedIn Studio → Connect LinkedIn.', false);
  await rawEnv.NTS_KV.delete(`li/oauth/state/${state}`);
  const env = await store.withSettings(rawEnv);
  const r = await fetchImpl(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: redirectUri(url.origin), client_id: env.LI_CLIENT_ID, client_secret: env.LI_CLIENT_SECRET }) });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) return page('LinkedIn sign-in failed', clean(t.error_description || t.error || `HTTP ${r.status}`), false);
  if (!String(t.scope || '').includes('w_member_social')) return page('Posting permission missing', 'Add the “Share on LinkedIn” product to your LinkedIn app, then connect again.', false);
  const me = await fetchImpl('https://api.linkedin.com/v2/userinfo', { headers: { authorization: `Bearer ${t.access_token}` } }).then((x) => x.json()).catch(() => ({}));
  if (!me.sub) return page('LinkedIn sign-in failed', 'Could not read your LinkedIn member id (add the “Sign In with LinkedIn using OpenID Connect” product).', false);
  await store.saveSetting(rawEnv, { name: 'LI_ACCESS_TOKEN', value: t.access_token });
  await rawEnv.NTS_KV.put('li/oauth/meta', JSON.stringify({ sub: me.sub, name: me.name || `${me.given_name || ''} ${me.family_name || ''}`.trim(), exp: Date.now() + (Number(t.expires_in) || 5_184_000) * 1000, at: nowIso() }));
  await ops.log(rawEnv, 'system', `LinkedIn connected: ${me.name || me.sub}`, { url: 'https://www.linkedin.com/in/me/' });
  return page('LinkedIn connected', `Signed in as <b>${clean(me.name)}</b>. Approved drafts can now be posted to this profile. LinkedIn asks to sign in again every 60 days.`, true);
}

export async function disconnect(rawEnv) {
  await store.deleteSetting(rawEnv, 'LI_ACCESS_TOKEN');
  await rawEnv.NTS_KV.delete('li/oauth/meta');
  await ops.log(rawEnv, 'system', 'LinkedIn disconnected');
  return { connected: false };
}

/** Publish one approved LinkedIn item from the Work board. Idempotent. */
export async function publish(rawEnv, itemId, fetchImpl = fetch) {
  const w = await rawEnv.NTS_KV.get('work', 'json');
  const it = w?.items?.find((i) => i.id === itemId);
  if (!it) throw new HttpError(404, 'Item not found.');
  if (it.channel !== 'LinkedIn') throw new HttpError(400, 'Only LinkedIn items can be posted here.');
  if (it.postedUrl) return { already: true, url: it.postedUrl };
  if (it.status !== 'ready') throw new HttpError(409, 'Approve the draft before posting.');
  const env = await store.withSettings(rawEnv);
  const meta = await rawEnv.NTS_KV.get('li/oauth/meta', 'json');
  if (!env.LI_ACCESS_TOKEN || !meta?.sub) throw new HttpError(409, 'LinkedIn is not connected. LinkedIn Studio → Connect LinkedIn.');
  if (meta.exp <= Date.now()) throw new HttpError(409, 'LinkedIn sign-in expired (60 days). Connect LinkedIn again.');
  const text = polishPost(String(it.body)).slice(0, 3000);
  const body = JSON.stringify({ author: `urn:li:person:${meta.sub}`, commentary: commentary(text), visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false });
  let last = '';
  for (const v of versions()) {
    const r = await fetchImpl('https://api.linkedin.com/rest/posts', { method: 'POST', headers: { authorization: `Bearer ${env.LI_ACCESS_TOKEN}`, 'content-type': 'application/json', 'linkedin-version': v, 'x-restli-protocol-version': '2.0.0' }, body });
    if (r.status === 201 || r.ok) {
      const urn = r.headers.get('x-restli-id') || r.headers.get('x-linkedin-id') || '';
      it.postedUrl = urn ? `https://www.linkedin.com/feed/update/${urn}/` : 'https://www.linkedin.com/in/me/recent-activity/all/';
      it.postedAt = nowIso();
      it.postUrn = urn || undefined;
      await rawEnv.NTS_KV.put('work', JSON.stringify(w));
      await ops.log(rawEnv, 'publish', `LinkedIn post published: ${it.title}`, { url: it.postedUrl });
      return { url: it.postedUrl, urn, version: v };
    }
    const b = await r.json().catch(() => ({}));
    last = `${r.status} ${b.message || b.code || ''}`.trim();
    if (r.status === 401) throw new HttpError(409, 'LinkedIn sign-in is no longer valid. Connect LinkedIn again.');
    if (!/version|NONEXISTENT_VERSION|426/i.test(`${r.status} ${b.code} ${b.message}`)) break; // only retry on version problems
  }
  await ops.log(rawEnv, 'error', `LinkedIn post failed: ${it.title} (${last})`);
  throw new HttpError(502, `LinkedIn post failed: ${last}`);
}

/** Cron: post approved LinkedIn drafts whose scheduled time has come (the owner scheduled them). */
export async function scheduled(env) {
  if (!env.NTS_KV) return;
  const o = await ops.getOps(env);
  if (o.paused) return;
  const w = await env.NTS_KV.get('work', 'json');
  const due = (w?.items || []).filter((i) => i.channel === 'LinkedIn' && i.status === 'ready' && !i.postedUrl && i.scheduledFor && Date.parse(i.scheduledFor) <= Date.now());
  for (const it of due.slice(0, 3)) await publish(env, it.id).catch((e) => console.log('[linkedin] scheduled post failed:', e.message));
}
