// Dev Mode storage in Cloudflare KV (binding NTS_KV, free tier, auto-created on deploy).
// Settings: API keys saved from the Dev Mode UI, AES-GCM encrypted with a key derived from DEV_TOKEN.
//   Worker secrets with the same name always win. Values never go back to the browser (only last 4 chars).
// Brain: NTS knowledge + saved notes that every agent reads before it works.
import { HttpError, newId, nowIso } from './util.mjs';
import { b64, unb64 } from './crypto.mjs';
import { BRAND } from './agents.mjs';

export const SETTINGS = {
  GEMINI_API_KEY: { label: 'Gemini API key (free, aistudio.google.com) - runs the agents', secret: true, test: 'gemini', check: (v) => /^[A-Za-z0-9._-]{30,200}$/.test(v) || 'looks incomplete. Copy the whole key from aistudio.google.com/apikey' },
  GROQ_API_KEY: { label: 'Groq API key (free, console.groq.com) - backup engine', secret: true, test: 'groq', check: (v) => /^gsk_[A-Za-z0-9]{20,}$/.test(v) || 'should start with "gsk_"' },
  YOUTUBE_API_KEY: { label: 'YouTube Data API key (optional) - the site already works without it', secret: true, check: (v) => /^[A-Za-z0-9._-]{30,200}$/.test(v) || 'looks incomplete. Copy the whole key' },
  SARVAM_API_KEY: { label: 'Sarvam AI key (dashboard.sarvam.ai) - natural Indian voice for Marg, paid per character after sign-up credits', secret: true, check: (v) => /^[A-Za-z0-9._-]{16,200}$/.test(v) || 'looks incomplete. Copy the whole key from dashboard.sarvam.ai' },
  MARG_SARVAM_SPEAKER: { label: 'Marg voice (optional, default shubh): shubh, priya, simran, ishita, ritu, kavya or shreya', secret: false, check: (v) => /^(shubh|priya|simran|ishita|ritu|kavya|shreya)$/.test(v) || 'must be one of shubh, priya, simran, ishita, ritu, kavya, shreya' },
  MARG_TTS_DAILY_CHARS: { label: 'Sarvam daily character limit (optional, default 5000)', secret: false, check: (v) => (/^\d{1,6}$/.test(v) && Number(v) <= 200000) || 'must be a whole number up to 200000' },
  GEMINI_MODEL: { label: 'Gemini model (optional, default gemini-2.5-flash)', secret: false, check: (v) => /^[a-z0-9][a-z0-9.\-]{2,60}$/.test(v) || 'must be a model ID like gemini-2.5-flash' },
  GROQ_MODEL: { label: 'Groq model (optional, default openai/gpt-oss-120b)', secret: false, check: (v) => /^[A-Za-z0-9][A-Za-z0-9._:\/-]{2,80}$/.test(v) || 'must be a model ID' },
};

const kv = (env) => {
  if (!env.NTS_KV) throw new HttpError(503, 'Storage is not connected (KV binding NTS_KV missing). Redeploy with the latest wrangler.jsonc.');
  return env.NTS_KV;
};

async function cryptoKey(env) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nts-settings:${env.DEV_TOKEN}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function readSaved(env) {
  if (!env.NTS_KV || !env.DEV_TOKEN) return {};
  const stored = (await env.NTS_KV.get('settings', 'json')) || {};
  const key = await cryptoKey(env);
  const out = {};
  for (const [name, v] of Object.entries(stored)) {
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, key, unb64(v.enc));
      out[name] = { value: new TextDecoder().decode(pt), updatedAt: v.updatedAt };
    } catch {
      out[name] = { value: null, updatedAt: v.updatedAt, broken: true }; // DEV_TOKEN changed since it was saved
    }
  }
  return out;
}

/** env with saved settings filled in (Worker secrets win). */
export async function withSettings(env) {
  try {
    const saved = await readSaved(env);
    const merged = { ...env };
    for (const [k, v] of Object.entries(saved)) if (!env[k] && v.value) merged[k] = v.value;
    return merged;
  } catch {
    return env;
  }
}

export async function listSettings(env) {
  const saved = await readSaved(env);
  return Object.entries(SETTINGS).map(([name, def]) => {
    const fromWorker = Boolean(env[name]);
    const s = saved[name];
    const value = fromWorker ? env[name] : s?.value;
    return {
      name,
      label: def.label,
      secret: def.secret,
      testable: Boolean(def.test),
      source: fromWorker ? 'cloudflare' : s?.value ? 'saved' : null,
      preview: value ? (def.secret ? `••••${String(value).slice(-4)}` : value) : null,
      broken: Boolean(s?.broken),
      updatedAt: fromWorker ? null : (s?.updatedAt ?? null),
    };
  });
}

export async function saveSetting(env, body) {
  const name = String(body?.name || '');
  const def = SETTINGS[name];
  if (!def) throw new HttpError(400, 'Unknown setting.');
  const value = String(body?.value ?? '').trim();
  if (!value) throw new HttpError(400, 'Enter a value.');
  if (/\s/.test(value) || value.length > 300) throw new HttpError(400, `${name}: no spaces, max 300 characters.`);
  const ok = def.check(value);
  if (ok !== true) throw new HttpError(400, `${name} ${ok}.`);
  const store = kv(env);
  const stored = (await store.get('settings', 'json')) || {};
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(env), new TextEncoder().encode(value));
  stored[name] = { enc: b64(ct), iv: b64(iv), updatedAt: nowIso() };
  await store.put('settings', JSON.stringify(stored));
  return listSettings(env);
}

export async function deleteSetting(env, name) {
  if (!SETTINGS[name]) throw new HttpError(400, 'Unknown setting.');
  const store = kv(env);
  const stored = (await store.get('settings', 'json')) || {};
  delete stored[name];
  await store.put('settings', JSON.stringify(stored));
  return listSettings(env);
}

// ---------------- Brain ----------------

export const DEFAULT_KNOWLEDGE = `${BRAND}

Channels: LinkedIn (Nikhil Kumar, personal profile), Instagram @nikhil_techstudio, YouTube @NikhilsTechStudio.
Team: Nikhil (vision, product, teaching voice), Monish (videos, brand look), Pranav (go-to-market, community, LinkedIn).
Audience: students and freshers (B.Tech, BCA, B.Com, MBA, 20-24, Tier 1/2/3 cities), career switchers from sales, ops, BPO and finance, working professionals who need Excel, SQL and AI at work.
Content pillars: SQL (zero to interview), AI tools (Claude, Grok, ChatGPT for real jobs), Careers (interview prep and advice), Behind NTS (building in public).
Current series: "SQL Interview : FAANG" on YouTube (Join Trap, Integer Division Trap, Anti Join).
Weekly rhythm: 3 long tutorials, 7 Shorts/Reels, a daily SQL challenge, 1 success story, 1 newsletter.
North star: Weekly Active Practisers. Views are vanity; practice is value.
Every piece of content ends with one clear call to action.`;

const MAX_KNOWLEDGE = 12000;
const MAX_NOTES = 100;
const MAX_NOTE = 4000;

export async function getBrain(env) {
  const b = env.NTS_KV ? await env.NTS_KV.get('brain', 'json') : null;
  return { knowledge: b?.knowledge ?? DEFAULT_KNOWLEDGE, notes: b?.notes ?? [], updatedAt: b?.updatedAt ?? null, isDefault: !b?.knowledge };
}

async function putBrain(env, brain) {
  brain.updatedAt = nowIso();
  await kv(env).put('brain', JSON.stringify({ knowledge: brain.knowledge, notes: brain.notes, updatedAt: brain.updatedAt }));
  return brain;
}

export async function setKnowledge(env, body) {
  const text = String(body?.knowledge ?? '').trim();
  if (text.length < 20) throw new HttpError(400, 'Knowledge must be at least 20 characters.');
  if (text.length > MAX_KNOWLEDGE) throw new HttpError(400, `Knowledge is limited to ${MAX_KNOWLEDGE} characters.`);
  const b = await getBrain(env);
  b.knowledge = text;
  return putBrain(env, b);
}

export async function resetKnowledge(env) {
  const b = await getBrain(env);
  b.knowledge = DEFAULT_KNOWLEDGE;
  return putBrain(env, b);
}

export async function addNote(env, body) {
  const text = String(body?.text ?? '').trim();
  const title = String(body?.title ?? '').trim().slice(0, 120);
  if (text.length < 3) throw new HttpError(400, 'Note is empty.');
  if (text.length > MAX_NOTE) throw new HttpError(400, `Notes are limited to ${MAX_NOTE} characters.`);
  const b = await getBrain(env);
  b.notes.unshift({ id: newId('note'), title: title || text.slice(0, 60), text, source: String(body?.source ?? 'manual').slice(0, 60), createdAt: nowIso() });
  b.notes = b.notes.slice(0, MAX_NOTES);
  return putBrain(env, b);
}

export async function deleteNote(env, id) {
  const b = await getBrain(env);
  b.notes = b.notes.filter((n) => n.id !== id);
  return putBrain(env, b);
}

/** Text block injected into every agent run (bounded). */
export async function brainContext(env) {
  const b = await getBrain(env);
  let notes = '';
  for (const n of b.notes) {
    const line = `- ${n.title}: ${n.text.replace(/\s+/g, ' ').slice(0, 600)}\n`;
    if (notes.length + line.length > 6000) break;
    notes += line;
  }
  return `NTS BRAIN (company knowledge, follow it):\n${b.knowledge}${notes ? `\n\nSAVED NOTES (most recent first):\n${notes}` : ''}`;
}
