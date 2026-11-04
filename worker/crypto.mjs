// Encryption for OAuth tokens (AES-GCM, key from TOKEN_ENC_KEY) and password hashing (PBKDF2-SHA256).
import { HttpError } from './util.mjs';

const enc = new TextEncoder();
const dec = new TextDecoder();
export const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export function randomToken(bytes = 32) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

let cachedKey = null;
let cachedRaw = null;
async function tokenKey(env) {
  const raw = env.TOKEN_ENC_KEY;
  if (!raw || raw.length < 32) throw new HttpError(503, 'TOKEN_ENC_KEY is not set (32+ random characters). Social tokens cannot be stored safely without it.');
  if (cachedRaw === raw) return cachedKey;
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`nts-tokens:${raw}`));
  cachedKey = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
  cachedRaw = raw;
  return cachedKey;
}

/** Encrypt a secret. Returns { enc, iv } as base64. */
export async function seal(env, plaintext) {
  if (plaintext === null || plaintext === undefined) return { enc: null, iv: null };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(env), enc.encode(String(plaintext)));
  return { enc: b64(ct), iv: b64(iv) };
}

export async function open(env, encText, ivText) {
  if (!encText || !ivText) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivText) }, await tokenKey(env), unb64(encText));
    return dec.decode(pt);
  } catch {
    throw new HttpError(409, 'A stored token could not be decrypted (TOKEN_ENC_KEY changed?). Reconnect the account.');
  }
}

const ITER = 100_000; // Workers cap PBKDF2 at 100k iterations.

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, ITER);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(bits)}`;
}

export async function verifyPassword(password, stored) {
  const [alg, iter, salt, hash] = String(stored).split('$');
  if (alg !== 'pbkdf2') return false;
  const bits = await pbkdf2(password, unb64(salt), Number(iter));
  const a = unb64(hash);
  const b = new Uint8Array(bits);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function pbkdf2(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
}

/** PKCE helpers */
export async function pkceChallenge(verifier) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
  return b64(d).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
