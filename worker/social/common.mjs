// Shared plumbing for LinkedIn / Instagram / YouTube adapters.
// Tokens are stored AES-GCM encrypted. Errors are scrubbed of any token before they are stored or returned.
import { HttpError, nowIso, publicBase } from '../util.mjs';
import { seal, open, randomToken } from '../crypto.mjs';

export const PLATFORMS = ['linkedin', 'instagram', 'youtube'];
const STATE_TTL_MS = 10 * 60_000;

export const redirectUri = (env, platform) => `${publicBase(env)}/oauth/${platform}/callback`;

export async function getConn(db, platform) {
  return db.prepare('SELECT * FROM social_connections WHERE platform = ?').bind(platform).first();
}

/** Public-safe view of a connection row (never includes tokens). */
export function connView(row, platform) {
  if (!row) return { platform, status: 'pending', accountName: null, scopes: [], expiresAt: null, lastSyncAt: null, lastError: null };
  return {
    platform,
    status: row.status,
    accountId: row.account_id,
    accountName: row.account_name,
    profileUrl: row.profile_url,
    scopes: row.scopes ? row.scopes.split(/[\s,]+/).filter(Boolean) : [],
    expiresAt: row.expires_at,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

export async function saveTokens(env, db, platform, { access, refresh = null, expiresAt = null, scopes = '', accountId = null, accountName = null, profileUrl = null }) {
  const a = await seal(env, access);
  const r = await seal(env, refresh);
  await db
    .prepare(
      `INSERT INTO social_connections (platform, status, account_id, account_name, profile_url, scopes, access_enc, access_iv, refresh_enc, refresh_iv, expires_at, last_error, updated_at)
       VALUES (?, 'connected', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(platform) DO UPDATE SET status='connected', account_id=excluded.account_id, account_name=excluded.account_name, profile_url=excluded.profile_url,
         scopes=excluded.scopes, access_enc=excluded.access_enc, access_iv=excluded.access_iv, refresh_enc=excluded.refresh_enc, refresh_iv=excluded.refresh_iv,
         expires_at=excluded.expires_at, last_error=NULL, updated_at=excluded.updated_at`,
    )
    .bind(platform, accountId, accountName, profileUrl, scopes, a.enc, a.iv, r.enc, r.iv, expiresAt, nowIso())
    .run();
}

export async function updateAccess(env, db, platform, access, expiresAt) {
  const a = await seal(env, access);
  await db.prepare('UPDATE social_connections SET access_enc=?, access_iv=?, expires_at=?, status=\'connected\', last_error=NULL, updated_at=? WHERE platform=?').bind(a.enc, a.iv, expiresAt, nowIso(), platform).run();
}

export async function tokens(env, db, platform) {
  const row = await getConn(db, platform);
  if (!row || row.status === 'pending' || !row.access_enc) throw new HttpError(409, `${label(platform)} is not connected yet. Connect it in Admin → Social Connections.`, 'not_connected');
  if (row.status === 'revoked') throw new HttpError(409, `${label(platform)} access was revoked. Reconnect it.`, 'revoked');
  return { row, access: await open(env, row.access_enc, row.access_iv), refresh: await open(env, row.refresh_enc, row.refresh_iv) };
}

export async function markError(db, platform, status, message) {
  await db.prepare('UPDATE social_connections SET status=?, last_error=?, updated_at=? WHERE platform=?').bind(status, String(message).slice(0, 500), nowIso(), platform).run();
}

export async function markSynced(db, platform) {
  await db.prepare('UPDATE social_connections SET last_sync_at=?, updated_at=? WHERE platform=?').bind(nowIso(), nowIso(), platform).run();
}

export async function disconnect(db, platform) {
  await db.prepare('DELETE FROM social_connections WHERE platform = ?').bind(platform).run();
}

export async function newState(db, platform, userId, verifier = null) {
  const state = randomToken(16);
  await db.prepare('DELETE FROM oauth_state WHERE created_at < ?').bind(new Date(Date.now() - STATE_TTL_MS).toISOString()).run();
  await db.prepare('INSERT INTO oauth_state (state, platform, verifier, user_id, created_at) VALUES (?,?,?,?,?)').bind(state, platform, verifier, userId, nowIso()).run();
  return state;
}

/** Validate and consume an OAuth state (single use, 10 min TTL, platform-bound). */
export async function consumeState(db, platform, state) {
  if (!state || !/^[a-f0-9]{32}$/.test(state)) throw new HttpError(400, 'Missing or invalid OAuth state. Start the connection again from the admin.');
  const row = await db.prepare('SELECT * FROM oauth_state WHERE state = ?').bind(state).first();
  await db.prepare('DELETE FROM oauth_state WHERE state = ?').bind(state).run();
  if (!row || row.platform !== platform || Date.now() - Date.parse(row.created_at) > STATE_TTL_MS) throw new HttpError(400, 'This connection link expired or was already used. Start again from the admin.');
  return row;
}

/** fetch + JSON with secrets scrubbed from any error text. Sets e.status / e.platformCode. */
export async function apiJson(fetchImpl, url, init, what, secrets = []) {
  let res;
  try {
    res = await fetchImpl(url, init);
  } catch (e) {
    throw new HttpError(502, `${what}: network error`);
  }
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    let msg = body?.error?.message || body?.error_description || body?.message || body?.error_message || (typeof body?.error === 'string' ? body.error : '') || `HTTP ${res.status}`;
    for (const s of secrets) if (s) msg = String(msg).split(s).join('***');
    const err = new HttpError(res.status === 401 || res.status === 403 ? 409 : 502, `${what}: ${msg}`);
    err.upstreamStatus = res.status;
    err.platformCode = body?.error?.code ?? body?.error ?? body?.serviceErrorCode ?? null;
    throw err;
  }
  return { body, headers: res.headers };
}

export const label = (p) => ({ linkedin: 'LinkedIn', instagram: 'Instagram', youtube: 'YouTube' })[p] || p;

export function callbackPage(ok, message) {
  const safe = String(message).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ok ? 'Connected' : 'Connection failed'}</title>
<body style="font:16px/1.5 system-ui;background:#16151b;color:#ecebf1;display:grid;place-items:center;min-height:100dvh;margin:0">
<main style="max-width:28rem;padding:2rem"><h1 style="font-size:1.4rem">${ok ? 'Connected' : 'Connection failed'}</h1><p>${safe}</p>
<p><a style="color:#b4a7ff" href="/admin/connections">Back to Social Connections</a></p></main>`,
    { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

/** Upsert one synced item. */
export async function upsertItem(db, item) {
  await db
    .prepare(
      `INSERT INTO social_items (id, platform, remote_id, kind, title, caption, url, thumbnail_url, published_at, metrics, synced_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, title=excluded.title, caption=excluded.caption, url=excluded.url, thumbnail_url=excluded.thumbnail_url,
         published_at=excluded.published_at, metrics=excluded.metrics, synced_at=excluded.synced_at`,
    )
    .bind(`${item.platform}:${item.remoteId}`, item.platform, item.remoteId, item.kind, item.title ?? null, item.caption ?? null, item.url, item.thumbnailUrl ?? null, item.publishedAt ?? null, item.metrics ? JSON.stringify(item.metrics) : null, nowIso())
    .run();
}

export async function snapshot(db, platform, { followers = null, views = null, posts = null, raw = null }) {
  const day = nowIso().slice(0, 10);
  await db
    .prepare('INSERT INTO channel_snapshots (platform, day, followers, views, posts, raw) VALUES (?,?,?,?,?,?) ON CONFLICT(platform, day) DO UPDATE SET followers=excluded.followers, views=excluded.views, posts=excluded.posts, raw=excluded.raw')
    .bind(platform, day, followers, views, posts, raw ? JSON.stringify(raw) : null)
    .run();
}
