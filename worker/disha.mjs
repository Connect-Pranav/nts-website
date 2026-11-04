// DISHA: NIKHILs TECH STUDIO chat + voice agent (ported from AGENTVERSE's VANI).
//   POST /api/disha/chat    public; owner mode when Authorization: Bearer <DEV_TOKEN>
//   GET  /api/disha/voice   owner only: Sarvam voice config + today's usage (never the key)
//   POST /api/disha/tts     owner only: { text, lang?, speaker?, pace? } -> audio/mpeg (Sarvam Bulbul)
// Visitors get the free device voice; Sarvam (paid per character after sign-up credits) is owner-only,
// capped per day, cached per sentence, and falls back to the free device voice in the browser.
import { HttpError, json, clientIp, safeEqual } from './util.mjs';
import { generate, parseJson } from './providers.mjs';
import * as store from './store.mjs';
import { catalogue } from './dev.mjs';

const PAGES = ['/', '/about', '/lab', '/academy', '/insights', '/media', '/contact', '/dev'];
const LINKS = ['youtube', 'instagram', 'linkedin'];
const TABS = ['agents', 'brain', 'settings'];

export const PUBLIC_KNOWLEDGE = `NIKHILs TECH STUDIO (always spelled exactly so): India's Practice Gym for the AI Era. Learn. Practice. Simulate. Grow.
Mission: turn free content into practice, practice into proof, and proof into careers. Vision: every Indian learner job-ready for the AI era.
Positioning: not another course platform; a practice gym for SQL, data and AI tools, taught in Hindi-English.
Founder: Nikhil Kumar. Team: Nikhil, Monish, Pranav.
Website pages: Home (/), About (/about: story, thesis, who we serve, team), AI Lab (/lab: custom AI agents for businesses - sales lead, customer support, WhatsApp order, HR screening, content & social, MIS report, study buddy, productivity agents; delivered in 2-4 weeks), Academy (/academy: SQL Sprint - interview-ready SQL in 30 days, 20 minutes a day, free beta for the waitlist from December 2026, days 1-7 free, certificate on day 30; Interview Simulator for Data Analyst, Business Analyst, MIS Executive, Operations Analyst with SQL, Excel, case, HR and AI-tools rounds; AI Academy tracks: Claude Mastery, ChatGPT for Work, Gemini & Google Workspace, Grok & Perplexity, Microsoft Copilot, AI for Your Role, Build Your Own AI Agent; Career AI: resume writer, LinkedIn optimizer, cover letters, Job Hunter, readiness score), Insights (/insights: articles coming soon), Media Hub (/media: channels, weekly content, community: daily SQL challenge at 9 pm, weekly live doubt session, monthly SQL contest), Contact / Get started (/contact: partnerships for colleges, companies, clubs, creators, hiring companies, AI tools).
Channels: YouTube @NikhilsTechStudio (SQL Interview: FAANG series), Instagram @nikhil_techstudio, LinkedIn Nikhil Kumar.
Do not quote prices, revenue figures or dates beyond what is written here. If unsure, say so and point to the right page or channel.`;

const PERSONA = `You are DISHA, the voice and chat assistant of NIKHILs TECH STUDIO. You sound like a warm, confident, intelligent Indian woman in her twenties: natural, never robotic, never over-excited, no IVR phrases.
Reply in the language the person used: Hindi or Hinglish gets natural spoken Hinglish (Hindi in Roman script mixed with English), English gets Indian English. Usually 1 to 3 short spoken sentences; go longer only when asked to explain. Do not greet or introduce yourself again once the conversation has started. No markdown, no emojis, no lists, no ids read aloud.
Never claim you did something unless you add the action for it.`;

const PUBLIC_ACTIONS = `Actions you may add (only when the person clearly asks or it clearly helps): navigate {value: one of ${PAGES.filter((p) => p !== '/dev').join(', ')}}, open_link {value: youtube|instagram|linkedin}.`;
const OWNER_ACTIONS = `You are talking to the OWNER (signed in to Dev Mode). Extra actions: run_agent {id: agent id from STATE, value: the exact task for that agent} (only when the owner asks for content, a plan, a calendar or an analysis), save_note {value: text to save in the Brain} (only when the owner asks to remember or save), open_tab {value: agents|brain|settings}, navigate {value: /dev or any page}.
For run_agent pick: LinkedIn posts/articles -> ops_maya_docs; Instagram/YouTube/cross-platform plans, captions, titles, calendars -> ops_lakshmi_growth; numbers, growth, what worked -> ops_soma_analytics. When you run an agent, just say you have started it; the result appears on screen.`;

const FORMAT = `Respond with JSON only: {"reply":"what you say, as shown on screen","say":"the same reply written for the voice engine: Hindi words in Devanagari script, English words kept in English letters, numbers as words","actions":[{"type":"...","id":"...","value":"..."}]}`;

// Best-effort per-isolate limits
const hits = new Map();
function limit(key, max, windowMs) {
  const now = Date.now();
  const e = hits.get(key);
  if (!e || now - e.t > windowMs) {
    hits.set(key, { t: now, n: 1 });
    return;
  }
  if (++e.n > max) throw new HttpError(429, 'Thoda ruk jaiye, bahut saare messages aa gaye. Ek minute baad try karein.');
}

export function isOwner(env, request) {
  const h = request.headers.get('authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  return Boolean(env.DEV_TOKEN && env.DEV_TOKEN.length >= 8 && t && safeEqual(t, env.DEV_TOKEN));
}

/** Keep only allowed, well-formed actions. */
export function cleanActions(list, owner) {
  const ids = new Set(catalogue().map((a) => a.id));
  const out = [];
  for (const a of Array.isArray(list) ? list.slice(0, 5) : []) {
    const type = String(a?.type || '').toLowerCase();
    const value = a?.value == null ? '' : String(a.value).slice(0, 4000);
    if (type === 'navigate' && PAGES.includes(value) && (owner || value !== '/dev')) out.push({ type, value });
    else if (type === 'open_link' && LINKS.includes(value.toLowerCase())) out.push({ type, value: value.toLowerCase() });
    else if (owner && type === 'run_agent' && ids.has(String(a?.id)) && value.trim().length >= 3) out.push({ type, id: String(a.id), value: value.trim() });
    else if (owner && type === 'save_note' && value.trim().length >= 3) out.push({ type, value: value.trim() });
    else if (owner && type === 'open_tab' && TABS.includes(value)) out.push({ type, value });
  }
  return out;
}

export async function chat(rawEnv, request) {
  const owner = isOwner(rawEnv, request);
  limit(`chat:${clientIp(request)}`, owner ? 40 : 15, 60_000);
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'Body must be JSON.');
  }
  const msgs = (Array.isArray(body?.messages) ? body.messages : [])
    .slice(-10)
    .map((m) => ({ role: m?.role === 'disha' ? 'DISHA' : 'PERSON', text: String(m?.text ?? '').slice(0, 1500).trim() }))
    .filter((m) => m.text);
  if (!msgs.length || msgs[msgs.length - 1].role !== 'PERSON') throw new HttpError(400, 'Send at least one message.');
  const page = PAGES.includes(body?.page) ? body.page : '/';
  const env = await store.withSettings(rawEnv);

  let state = `The person is on page ${page}.`;
  let knowledge = PUBLIC_KNOWLEDGE;
  if (owner) {
    const brain = await store.getBrain(rawEnv);
    knowledge = await store.brainContext(rawEnv);
    state += `\nAGENTS: ${catalogue()
      .map((a) => `${a.id} = ${a.name}`)
      .join('; ')}.\nBRAIN NOTES: ${brain.notes.length}. ENGINES: ${['gemini', 'groq'].filter((e) => env[`${e.toUpperCase()}_API_KEY`]).join(', ') || 'none'}.`;
  }
  const system = `${PERSONA}\n\nKNOWLEDGE:\n${knowledge}\n\n${owner ? OWNER_ACTIONS : PUBLIC_ACTIONS}\n\n${FORMAT}`;
  const prompt = `STATE:\n${state}\n\nCONVERSATION:\n${msgs.map((m) => `${m.role}: ${m.text}`).join('\n')}\n\nReply to the person's last message.`;
  const r = await generate(env, { system, prompt, maxTokens: owner ? 900 : 600, json: true });
  let out;
  try {
    out = parseJson(r.text);
  } catch {
    out = { reply: r.text.slice(0, 800) };
  }
  const reply = String(out.reply || '').slice(0, 1500) || 'Hmm, samajh nahi aaya. Dobara bolenge?';
  return json({ reply, say: String(out.say || reply).slice(0, 1500), actions: cleanActions(out.actions, owner), owner, engine: r.engine });
}

// ---------------- Sarvam voice (owner only) ----------------
const SARVAM_URL = 'https://api.sarvam.ai/text-to-speech';
const LANGS = ['bn-IN', 'en-IN', 'gu-IN', 'hi-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'od-IN', 'pa-IN', 'ta-IN', 'te-IN'];
const SPEAKERS = ['priya', 'simran', 'ishita', 'ritu', 'kavya', 'shreya'];
const num = (v, d) => (Number.isFinite(Number(v)) && String(v ?? '').trim() !== '' ? Number(v) : d);
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10); // IST day
const usageKey = () => `disha/tts/usage/${today()}`;

export function voiceConfig(env) {
  const speaker = SPEAKERS.includes(String(env.DISHA_SARVAM_SPEAKER || '').toLowerCase()) ? env.DISHA_SARVAM_SPEAKER.toLowerCase() : 'priya';
  return {
    enabled: Boolean(env.SARVAM_API_KEY),
    model: String(env.DISHA_SARVAM_MODEL || 'bulbul:v3'),
    speaker,
    speakers: SPEAKERS,
    dailyChars: Math.max(0, Math.floor(num(env.DISHA_TTS_DAILY_CHARS, 5000))),
    maxChars: 900,
  };
}

export async function voiceView(env) {
  const c = voiceConfig(env);
  const used = env.NTS_KV ? Number(await env.NTS_KV.get(usageKey())) || 0 : 0;
  return { ...c, usedToday: used, leftToday: Math.max(0, c.dailyChars - used) };
}

async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

export async function tts(env, body, fetchImpl = fetch) {
  const c = voiceConfig(env);
  if (!c.enabled) throw new HttpError(503, 'Sarvam voice is not set up: add SARVAM_API_KEY in Dev Mode → Settings.');
  const kv = env.NTS_KV;
  if (!kv) throw new HttpError(503, 'Storage (NTS_KV) is not connected.');
  const text = String(body?.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) throw new HttpError(400, 'text is required');
  if (text.length > c.maxChars) throw new HttpError(413, `text is longer than ${c.maxChars} characters`);
  const lang = LANGS.includes(body?.lang) ? body.lang : /[ऀ-ॿ]/.test(text) ? 'hi-IN' : 'en-IN';
  const speaker = SPEAKERS.includes(String(body?.speaker || '').toLowerCase()) ? String(body.speaker).toLowerCase() : c.speaker;
  const pace = Math.round(Math.min(2, Math.max(0.5, num(body?.pace, 1))) * 100) / 100;

  const ck = `disha/tts/cache/${await sha([c.model, speaker, lang, pace, text].join('|'))}`;
  const hit = await kv.get(ck, 'arrayBuffer');
  if (hit) return hit;

  const used = Number(await kv.get(usageKey())) || 0;
  if (used + text.length > c.dailyChars) throw new HttpError(429, `Sarvam daily limit reached (${c.dailyChars} characters). Using the free device voice until midnight IST.`);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25_000);
  let r;
  try {
    r = await fetchImpl(SARVAM_URL, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'api-subscription-key': env.SARVAM_API_KEY },
      body: JSON.stringify({ text, target_language_code: lang, speaker, pace, model: c.model, output_audio_codec: 'mp3', speech_sample_rate: 24000 }),
    });
  } catch (e) {
    throw new HttpError(504, `Sarvam did not answer (${e?.name === 'AbortError' ? 'timeout' : 'network'})`);
  } finally {
    clearTimeout(timer);
  }
  let j = null;
  try {
    j = await r.json();
  } catch {
    /* non-JSON */
  }
  if (!r.ok) {
    const why =
      r.status === 402 || j?.error?.code === 'insufficient_quota_error'
        ? 'Sarvam credits are used up. Add credits on dashboard.sarvam.ai or keep the free device voice.'
        : r.status === 401 || r.status === 403
          ? 'Sarvam rejected the API key. Check SARVAM_API_KEY in Settings.'
          : r.status === 429
            ? 'Sarvam rate limit. Try again in a minute.'
            : `Sarvam error: ${String(j?.error?.message || j?.message || `HTTP ${r.status}`).slice(0, 160)}`;
    throw new HttpError(r.status === 400 || r.status === 422 ? 400 : 502, why);
  }
  const b64 = Array.isArray(j?.audios) ? j.audios[0] : null;
  if (!b64) throw new HttpError(502, 'Sarvam returned no audio.');
  const bin = atob(b64);
  const audio = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) audio[i] = bin.charCodeAt(i);
  await kv.put(usageKey(), String(used + text.length), { expirationTtl: 3 * 86400 });
  if (audio.byteLength < 2_000_000) await kv.put(ck, audio, { expirationTtl: 14 * 86400 });
  return audio.buffer;
}

export async function handle(rawEnv, request, url) {
  if (url.pathname === '/api/disha/chat' && request.method === 'POST') return chat(rawEnv, request);
  if (!isOwner(rawEnv, request)) throw new HttpError(401, 'Owner only.');
  const env = await store.withSettings(rawEnv);
  if (url.pathname === '/api/disha/voice' && request.method === 'GET') return json(await voiceView(env));
  if (url.pathname === '/api/disha/tts' && request.method === 'POST') {
    limit(`tts:${clientIp(request)}`, 60, 60_000);
    let body;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, 'Body must be JSON.');
    }
    const audio = await tts(env, body);
    return new Response(audio, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
  }
  throw new HttpError(404, 'Not found.');
}
