// Shared helpers for the NTS Worker.
export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export function newId(prefix) {
  const rnd = crypto.getRandomValues(new Uint8Array(8));
  return `${prefix}_${Date.now().toString(36)}${[...rnd].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS, ...headers },
  });
}

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Constant-time string compare. */
export function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Read a JSON body with a size cap. */
export async function readJson(request, maxBytes = 200_000) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'Request body is too large.');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request body is too large.');
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    return v;
  } catch {
    throw new HttpError(400, 'Body must be a JSON object.');
  }
}

// ---- tiny validators: each returns a clean value or throws 400 ----
export function str(body, key, { min = 0, max = 2000, required = false, pattern } = {}) {
  let v = body[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${key} is required.`);
    return null;
  }
  if (typeof v !== 'string') throw new HttpError(400, `${key} must be text.`);
  v = v.trim();
  if (v.length < min) throw new HttpError(400, `${key} must be at least ${min} characters.`);
  if (v.length > max) throw new HttpError(400, `${key} must be at most ${max} characters.`);
  if (pattern && !pattern.test(v)) throw new HttpError(400, `${key} has an invalid format.`);
  return v;
}

export function oneOf(body, key, allowed, { required = false, fallback = null } = {}) {
  const v = body[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${key} is required.`);
    return fallback;
  }
  if (!allowed.includes(v)) throw new HttpError(400, `${key} must be one of: ${allowed.join(', ')}.`);
  return v;
}

export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HTTPS_URL = /^https:\/\/[^\s<>"']{3,1000}$/;

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
}

export function publicBase(env) {
  return String(env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
}
