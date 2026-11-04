// Admin authentication: email + password, server-side sessions, CSRF token, roles, rate limits, audit.
// The first owner is bootstrapped from Worker secrets ADMIN_EMAIL + ADMIN_PASSWORD on first login.
import { HttpError, newId, nowIso, clientIp, safeEqual, EMAIL } from './util.mjs';
import { hashPassword, verifyPassword, sha256Hex, randomToken } from './crypto.mjs';

export const COOKIE = '__Host-nts_session';
const SESSION_TTL_MS = 12 * 3600_000; // 12 hours
const ROLE_RANK = { editor: 1, owner: 2 };

/** Fixed-window rate limit stored in D1. Throws 429 when exceeded. */
export async function rateLimit(db, bucket, limit, windowSec) {
  const win = Math.floor(Date.now() / 1000 / windowSec) * windowSec;
  await db
    .prepare('INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1) ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1')
    .bind(bucket, win)
    .run();
  const row = await db.prepare('SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?').bind(bucket, win).first();
  if (Math.random() < 0.02) await db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(win - 86400).run();
  if ((row?.count ?? 0) > limit) throw new HttpError(429, 'Too many requests. Please wait a few minutes and try again.');
}

export async function audit(db, { userId = null, action, target = null, detail = null, ip = null }) {
  await db
    .prepare('INSERT INTO audit_log (user_id, action, target, detail, ip, created_at) VALUES (?,?,?,?,?,?)')
    .bind(userId, action, target, detail ? String(detail).slice(0, 1000) : null, ip, nowIso())
    .run();
}

function readCookie(request, name) {
  const h = request.headers.get('cookie') || '';
  for (const part of h.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function sessionCookie(token, maxAgeSec) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

export async function login(env, db, request, body) {
  const ip = clientIp(request);
  await rateLimit(db, `login:${await sha256Hex(ip)}`, 8, 900);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!EMAIL.test(email) || password.length < 8 || password.length > 200) throw new HttpError(400, 'Enter your email and password.');

  let user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) {
    // Bootstrap the owner once, from secrets, when no users exist yet.
    const count = (await db.prepare('SELECT COUNT(*) AS n FROM users').first())?.n ?? 0;
    const bootEmail = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (count === 0 && bootEmail && env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length >= 12 && email === bootEmail && safeEqual(password, env.ADMIN_PASSWORD)) {
      user = { id: newId('usr'), email, name: 'Owner', role: 'owner', pass_hash: await hashPassword(password), created_at: nowIso() };
      await db.prepare('INSERT INTO users (id, email, name, role, pass_hash, created_at) VALUES (?,?,?,?,?,?)').bind(user.id, user.email, user.name, user.role, user.pass_hash, user.created_at).run();
      await audit(db, { userId: user.id, action: 'owner_bootstrapped', ip });
    }
  } else if (!(await verifyPassword(password, user.pass_hash))) {
    user = null;
  }
  if (!user) {
    await audit(db, { action: 'login_failed', target: email, ip });
    throw new HttpError(401, 'Email or password is incorrect.');
  }

  const token = randomToken(32);
  const csrf = randomToken(16);
  const now = Date.now();
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(new Date(now).toISOString()).run();
  await db
    .prepare('INSERT INTO sessions (id_hash, user_id, csrf, created_at, expires_at, ip) VALUES (?,?,?,?,?,?)')
    .bind(await sha256Hex(token), user.id, csrf, new Date(now).toISOString(), new Date(now + SESSION_TTL_MS).toISOString(), ip)
    .run();
  await db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(nowIso(), user.id).run();
  await audit(db, { userId: user.id, action: 'login', ip });
  return {
    body: { user: { id: user.id, email: user.email, name: user.name, role: user.role }, csrf },
    cookie: sessionCookie(token, SESSION_TTL_MS / 1000),
  };
}

/** Resolve the session for a request; returns { user, csrf, idHash } or null. */
export async function session(db, request) {
  const token = readCookie(request, COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const idHash = await sha256Hex(token);
  const row = await db
    .prepare('SELECT s.csrf, s.expires_at, u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?')
    .bind(idHash)
    .first();
  if (!row || Date.parse(row.expires_at) < Date.now()) return null;
  return { user: { id: row.id, email: row.email, name: row.name, role: row.role }, csrf: row.csrf, idHash };
}

/** Require a session (and role); for unsafe methods also require the CSRF header and same-origin. */
export async function requireAdmin(env, db, request, role = 'editor') {
  const s = await session(db, request);
  if (!s) throw new HttpError(401, 'Please sign in.');
  if ((ROLE_RANK[s.user.role] ?? 0) < ROLE_RANK[role]) throw new HttpError(403, 'Only the owner can do this.');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const header = request.headers.get('x-csrf-token') || '';
    if (!safeEqual(header, s.csrf)) throw new HttpError(403, 'Security check failed. Refresh the page and try again.');
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Cross-origin request blocked.');
  }
  return s;
}

export async function logout(db, request) {
  const s = await session(db, request);
  if (s) await db.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(s.idHash).run();
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function changePassword(db, s, body) {
  const current = String(body.current || '');
  const next = String(body.next || '');
  if (next.length < 12) throw new HttpError(400, 'New password must be at least 12 characters.');
  const row = await db.prepare('SELECT pass_hash FROM users WHERE id = ?').bind(s.user.id).first();
  if (!row || !(await verifyPassword(current, row.pass_hash))) throw new HttpError(400, 'Current password is incorrect.');
  await db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').bind(await hashPassword(next), s.user.id).run();
  await db.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash != ?').bind(s.user.id, s.idHash).run();
  await audit(db, { userId: s.user.id, action: 'password_changed' });
  return { ok: true };
}

export async function listUsers(db) {
  return (await db.prepare('SELECT id, email, name, role, created_at, last_login_at FROM users ORDER BY created_at').all()).results;
}

export async function createUser(db, s, body) {
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim().slice(0, 80) || null;
  const role = body.role === 'owner' ? 'owner' : 'editor';
  const password = String(body.password || '');
  if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email.');
  if (password.length < 12) throw new HttpError(400, 'Temporary password must be at least 12 characters.');
  if (await db.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) throw new HttpError(409, 'That email already has an account.');
  const id = newId('usr');
  await db.prepare('INSERT INTO users (id, email, name, role, pass_hash, created_at) VALUES (?,?,?,?,?,?)').bind(id, email, name, role, await hashPassword(password), nowIso()).run();
  await audit(db, { userId: s.user.id, action: 'user_created', target: email, detail: role });
  return { id, email, name, role };
}

export async function deleteUser(db, s, id) {
  if (id === s.user.id) throw new HttpError(400, 'You cannot remove your own account.');
  await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  await audit(db, { userId: s.user.id, action: 'user_removed', target: id });
  return { ok: true };
}
