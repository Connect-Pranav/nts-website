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
  GITHUB_TOKEN: { label: 'GitHub token (optional) - fine-grained, this repo only: Contents read, Actions read/write. For Deployments and Run tests', secret: true, check: (v) => /^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(v) || 'should start with github_pat_ (fine-grained token)' },
  GITHUB_REPO: { label: 'GitHub repo (optional, default Connect-Pranav/nts-website)', secret: false, check: (v) => /^[\w.-]+\/[\w.-]+$/.test(v) || 'must look like owner/repo' },
  MCP_TOKEN: { label: 'MCP token (optional) - separate token for Claude Code; otherwise the Dev token is used', secret: true, check: (v) => /^[\x21-\x7e]{16,200}$/.test(v) || 'at least 16 characters, no spaces' },
  YT_CLIENT_ID: { label: 'YouTube sign-in: OAuth client ID (Web application) - lets the Community Manager post comment replies', secret: false, check: (v) => /^[\w-]+\.apps\.googleusercontent\.com$/.test(v) || 'should end with .apps.googleusercontent.com' },
  YT_CLIENT_SECRET: { label: 'YouTube sign-in: OAuth client secret', secret: true, check: (v) => /^[\w-]{20,80}$/.test(v) || 'looks incomplete (usually starts with GOCSPX-)' },
  YT_REFRESH_TOKEN: { label: 'YouTube channel sign-in (set by Connect YouTube)', secret: true, internal: true, check: (v) => /^[\w./-]{20,300}$/.test(v) || 'invalid token' },
  IG_CONFIG_ID: { label: 'Instagram: Configuration ID (newer Meta apps: Instagram API → API setup with Unified login). With it, IG_APP_ID/IG_APP_SECRET are the Meta App ID and App secret (App settings → Basic)', secret: false, check: (v) => /^\d{6,25}$/.test(v) || 'should be the numeric Configuration ID' },
  IG_APP_ID: { label: 'Instagram: App ID (Meta App ID for unified login, or the Instagram App ID for Instagram login)', secret: false, check: (v) => /^\d{6,25}$/.test(v) || 'should be the numeric Instagram App ID' },
  IG_APP_SECRET: { label: 'Instagram: App secret (Meta App secret for unified login, or the Instagram app secret)', secret: true, check: (v) => /^[a-f0-9]{16,64}$/i.test(v) || 'looks incomplete' },
  IG_ACCESS_TOKEN: { label: 'Instagram access token (set by Connect Instagram, or paste a long-lived IGAA… token from the Meta dashboard)', secret: true, check: (v) => /^[\w.-]{40,600}$/.test(v) || 'looks incomplete (starts with IGAA)' },
  LI_CLIENT_ID: { label: 'LinkedIn app: Client ID (products: Sign In with LinkedIn using OpenID Connect + Share on LinkedIn)', secret: false, check: (v) => /^[A-Za-z0-9]{8,40}$/.test(v) || 'looks wrong (LinkedIn Client IDs are short letters/numbers)' },
  LI_CLIENT_SECRET: { label: 'LinkedIn app: Primary Client Secret', secret: true, check: (v) => /^[\w.=-]{10,120}$/.test(v) || 'looks incomplete' },
  LI_ACCESS_TOKEN: { label: 'LinkedIn sign-in (set by Connect LinkedIn)', secret: true, internal: true, check: (v) => /^[\w.=~+/-]{20,1000}$/.test(v) || 'invalid token' },
  WAITLIST_URL: { label: 'SQL Sprint waitlist link (optional) - LinkedIn posts use it as the call to action', secret: false, check: (v) => /^https:\/\/[^\s]{4,300}$/.test(v) || 'must be a full https:// link' },
  GEMINI_MODEL: { label: 'Gemini model (optional, default gemini-flash-latest)', secret: false, check: (v) => /^[a-z0-9][a-z0-9.\-]{2,60}$/.test(v) || 'must be a model ID like gemini-2.5-flash' },
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
  return Object.entries(SETTINGS).filter(([, def]) => !def.internal).map(([name, def]) => {
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
  if (/\s/.test(value) || value.length > (def.internal || name === 'IG_ACCESS_TOKEN' ? 1000 : 300)) throw new HttpError(400, `${name}: no spaces, max 300 characters.`);
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
Goal right now: followers and the first paying learners (SQL Sprint waitlist, workshops, AI Lab clients).
Topic ideas: SQL interview tip, Claude workflow, resume with AI, AI agent for a small business, Excel for analysts, ChatGPT for real jobs.
Formats that work: LinkedIn text post or carousel with one strong hook line; 30-second Reel/Short in 3 scenes (hook, value, CTA); YouTube title + description + tags; SEO keywords.
Every piece of content ends with one clear call to action.`;

export const DEFAULT_RULES = [
  'Never invent prices, numbers, results or testimonials; use [placeholders].',
  'Helpful first: no spam, no hard sell, no bulk or unsolicited DMs, no follow-for-follow or giveaway bait.',
  'Nothing is posted or sent without owner approval.',
];
const MAX_RULES = 30;
export const MEMORY_CATEGORIES = ['organization', 'brand', 'project', 'decision', 'execution', 'customer'];
const MAX_FEEDBACK = 20;

const MAX_KNOWLEDGE = 12000;
const MAX_NOTES = 100;
const MAX_NOTE = 4000;

export async function getBrain(env) {
  const b = env.NTS_KV ? await env.NTS_KV.get('brain', 'json') : null;
  return { knowledge: b?.knowledge ?? DEFAULT_KNOWLEDGE, notes: b?.notes ?? [], rules: b?.rules ?? [...DEFAULT_RULES], feedback: b?.feedback ?? [], updatedAt: b?.updatedAt ?? null, isDefault: !b?.knowledge };
}

async function putBrain(env, brain) {
  brain.updatedAt = nowIso();
  await kv(env).put('brain', JSON.stringify({ knowledge: brain.knowledge, notes: brain.notes, rules: brain.rules, feedback: brain.feedback, updatedAt: brain.updatedAt }));
  return brain;
}

export async function addRule(env, body) {
  const text = String(body?.text ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 3 || text.length > 300) throw new HttpError(400, 'Rule must be 3 to 300 characters.');
  const b = await getBrain(env);
  if (!b.rules.includes(text)) b.rules.push(text);
  b.rules = b.rules.slice(-MAX_RULES);
  return putBrain(env, b);
}

export async function deleteRule(env, index) {
  const b = await getBrain(env);
  b.rules.splice(Number(index), 1);
  return putBrain(env, b);
}

/** Owner approvals/rejections become lessons every agent reads (newest first). */
export async function learn(env, lesson) {
  const b = await getBrain(env);
  b.feedback.unshift({ text: String(lesson).slice(0, 300), at: nowIso() });
  b.feedback = b.feedback.slice(0, MAX_FEEDBACK);
  return putBrain(env, b);
}

export async function clearFeedback(env) {
  const b = await getBrain(env);
  b.feedback = [];
  return putBrain(env, b);
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
  const category = MEMORY_CATEGORIES.includes(body?.category) ? body.category : /approved/i.test(String(body?.source)) ? 'execution' : 'organization';
  b.notes.unshift({ id: newId('note'), title: title || text.slice(0, 60), text, category, source: String(body?.source ?? 'manual').slice(0, 60), createdAt: nowIso() });
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
  const rules = b.rules.length ? `\n\nOWNER RULES (must follow):\n- ${b.rules.join('\n- ')}` : '';
  const fb = b.feedback.length ? `\n\nRECENT OWNER FEEDBACK (learn from it: repeat what was approved, avoid what was rejected):\n- ${b.feedback.slice(0, 12).map((f) => f.text).join('\n- ')}` : '';
  return `NTS BRAIN (company knowledge, follow it):\n${b.knowledge}${rules}${fb}${notes ? `\n\nSAVED NOTES (most recent first):\n${notes}` : ''}`;
}

/** Keyword search across knowledge, rules, lessons and notes (scored, newest first on ties). */
export async function searchMemory(env, query, limit = 8) {
  const b = await getBrain(env);
  const words = String(query || '').toLowerCase().split(/[^a-z0-9\u0900-\u097f]+/).filter((w) => w.length > 2);
  const docs = [
    ...b.notes.map((n) => ({ type: 'note', id: n.id, category: n.category || 'organization', title: n.title, text: n.text, at: n.createdAt })),
    ...b.rules.map((r, i) => ({ type: 'rule', id: `rule_${i}`, category: 'decision', title: 'Owner rule', text: r, at: null })),
    ...b.feedback.map((f, i) => ({ type: 'lesson', id: `lesson_${i}`, category: 'decision', title: 'Learned', text: f.text, at: f.at })),
    ...b.knowledge.split('\n').filter((l) => l.trim()).map((l, i) => ({ type: 'knowledge', id: `k_${i}`, category: 'brand', title: 'Brain knowledge', text: l, at: b.updatedAt })),
  ];
  const scored = docs
    .map((d) => {
      const t = `${d.title} ${d.text}`.toLowerCase();
      return { ...d, score: words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0) };
    })
    .filter((d) => !words.length || d.score > 0)
    .sort((a, b2) => b2.score - a.score || String(b2.at).localeCompare(String(a.at)));
  return scored.slice(0, limit).map(({ score, ...d }) => ({ ...d, text: d.text.slice(0, 600), score }));
}
