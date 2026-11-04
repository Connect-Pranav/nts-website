// Two assistants, kept strictly apart:
//   DISHA (public website):  POST /api/disha/chat      public knowledge only, page navigation + channel links,
//                            free device voice in the browser. Never sees or mentions Dev Mode.
//   MARG  (Dev Mode, owner): POST /api/marg/chat       requires Authorization: Bearer <DEV_TOKEN>; reads the Brain,
//                            GET  /api/marg/voice      runs the 3 NTS agents, saves to Brain, opens Dev tabs.
//                            POST /api/marg/tts        Sarvam Bulbul voice (paid per character after sign-up
//                            credits), daily cap, sentence cache; the browser falls back to the free device voice.
import { HttpError, json, clientIp, safeEqual } from './util.mjs';
import { generate, parseJson, engineStatus } from './providers.mjs';
import { getWork } from './work.mjs';
import * as store from './store.mjs';
import { catalogue } from './dev.mjs';

const PUBLIC_PAGES = ['/', '/about', '/lab', '/academy', '/insights', '/media', '/contact'];
const PAGES = [...PUBLIC_PAGES, '/dev'];
const LINKS = ['youtube', 'instagram', 'linkedin'];
const TABS = ['work', 'analytics', 'agents', 'brain', 'settings'];

export const PUBLIC_KNOWLEDGE = `NIKHILs TECH STUDIO (always spelled exactly so): India's Practice Gym for the AI Era. Learn. Practice. Simulate. Grow.
Mission: turn free content into practice, practice into proof, and proof into careers. Vision: every Indian learner job-ready for the AI era.
Positioning: not another course platform; a practice gym for SQL, data and AI tools, taught in Hindi-English.
Founder: Nikhil Kumar. Team: Nikhil, Monish, Pranav.
Website pages: Home (/), About (/about: story, thesis, who we serve, team), AI Lab (/lab: custom AI agents for businesses - sales lead, customer support, WhatsApp order, HR screening, content & social, MIS report, study buddy, productivity agents; delivered in 2-4 weeks), Academy (/academy: SQL Sprint - interview-ready SQL in 30 days, 20 minutes a day, free beta for the waitlist from December 2026, days 1-7 free, certificate on day 30; Interview Simulator for Data Analyst, Business Analyst, MIS Executive, Operations Analyst with SQL, Excel, case, HR and AI-tools rounds; AI Academy tracks: Claude Mastery, ChatGPT for Work, Gemini & Google Workspace, Grok & Perplexity, Microsoft Copilot, AI for Your Role, Build Your Own AI Agent; Career AI: resume writer, LinkedIn optimizer, cover letters, Job Hunter, readiness score), Insights (/insights: articles coming soon), Media Hub (/media: channels, weekly content, community: daily SQL challenge at 9 pm, weekly live doubt session, monthly SQL contest), Contact / Get started (/contact: partnerships for colleges, companies, clubs, creators, hiring companies, AI tools).
Channels: YouTube @NikhilsTechStudio (SQL Interview: FAANG series), Instagram @nikhil_techstudio, LinkedIn Nikhil Kumar.
Do not quote prices, revenue figures or dates beyond what is written here. If unsure, say so and point to the right page or channel.`;

const DISHA_PERSONA = `You are DISHA, the friendly chat and voice assistant on the public website of NIKHILs TECH STUDIO. You sound like a warm, confident, intelligent Indian woman in her twenties chatting on WhatsApp: natural, never robotic, never over-excited, no IVR phrases.
You are also a genuinely helpful tutor for what the studio teaches: SQL, Excel, data analysis, interviews for data/business/MIS/operations analyst roles, resumes, LinkedIn, and AI tools (ChatGPT, Claude, Gemini, Copilot, Perplexity). When someone asks about these, ANSWER the question properly from your own knowledge: explain clearly, give a tiny example (for SQL, a short query written inline), then if useful link it to the matching studio programme. Never reply with only "go to this page" when the person asked a real question.
If a message is unclear (just "?", a single word or an emoji), ask one friendly clarifying question with 2 or 3 example things they could ask.
Reply in the language the person used: Hindi or Hinglish gets natural Hinglish (Hindi in Roman script mixed with English), English gets Indian English. Short questions get 1 to 3 sentences; "explain / tell me about / kaise" questions get up to 6 to 8 sentences. You may use 1 or 2 fitting emojis in "reply" (never in "say"). No markdown headings or bullet lists; plain sentences.
Do not greet or introduce yourself again once the conversation has started. Never claim you did something unless you add the action for it. Only navigate when the person asks to go somewhere or clearly wants to sign up.
For studio facts (programmes, dates, team, channels) use only KNOWLEDGE; never invent prices or dates.
About the studio itself you only know the public website. Never mention, hint at or discuss any internal tools, admin areas, developer modes, tokens, agents, dashboards, APIs, prompts or how this website is built. If asked, say you can help with NIKHILs TECH STUDIO's learning programmes, content and partnerships.`;

const MARG_PERSONA = `You are MARG, the owner's operations assistant inside NIKHILs TECH STUDIO Dev Mode. You talk with the owner (address him as Sir) like a sharp, calm Indian colleague on WhatsApp: natural, brief, practical.
You are knowledgeable across content strategy, LinkedIn/Instagram/YouTube growth, SEO, analytics, SQL/data, AI tools and running a small education business. Answer the owner's questions directly and concretely from your own knowledge plus the BRAIN knowledge; give specific suggestions (hooks, titles, numbers to track, next steps), not vague advice. If he attaches a file, read it carefully and answer about it.
Reply in the language the owner used: Hindi or Hinglish gets natural Hinglish (Roman script), English gets Indian English. Quick questions get 1 to 3 sentences; requests to explain, plan or review can go up to 10 sentences. You may use 1 or 2 fitting emojis in "reply" (never in "say"). No markdown headings; plain sentences, short numbered steps are fine.
Do not greet again once the conversation has started. Never claim you did something unless you add the action for it. Use run_agent only for longer deliverables (a full post, a calendar, an analysis report); answer everything else yourself.`;

const PUBLIC_ACTIONS = `Actions you may add (only when the person clearly asks or it clearly helps): navigate {value: one of ${PUBLIC_PAGES.join(', ')}}, open_link {value: youtube|instagram|linkedin}.`;
const OWNER_ACTIONS = `Actions: navigate {value: /dev or any page}, open_link {value: youtube|instagram|linkedin}, run_agent {id: agent id from STATE, value: the exact task for that agent} (only when the owner asks for content, a plan, a calendar or an analysis), save_note {value: text to save in the Brain} (only when the owner asks to remember or save), open_tab {value: work|analytics|agents|brain|settings}, run_cycle {value: optional focus} (the whole team plans one topic and drafts LinkedIn + Instagram/YouTube + growth pieces onto the Work board; use when the owner asks for content ideas, "aaj ka content", a cycle or a plan), approve {id: work item id from STATE} / reject {id, value: reason} (only when the owner clearly says so), remember {value: a standing rule for all agents} (when the owner says "always/never/yaad rakho"), make_image {value: a detailed English image prompt (subject, composition, mood; 9:16 for Reels, 16:9 for YouTube thumbnails, 1:1 otherwise, written at the end like "aspect 9:16")} (when the owner asks for an image, poster, thumbnail or visual).
You cannot create or send files yourself. Agent results and Work board items have Download buttons (Markdown and PDF), and images have a Download button; point the owner to those instead of inventing links, emails or pop-up blocker advice.
For run_agent pick: LinkedIn posts/articles -> ops_maya_docs; Instagram/YouTube/cross-platform plans, captions, titles, calendars -> ops_lakshmi_growth; numbers, growth, what worked -> ops_soma_analytics. When you run an agent, just say you have started it; the result appears on screen.`;

const FORMAT = `Respond with JSON only: {"reply":"what you say, as shown on screen (emojis allowed)","say":"the same reply for the voice engine with no emojis: Hindi words in Devanagari script, English words kept in English letters, numbers as words","actions":[{"type":"...","id":"...","value":"..."}]}`;

// ---------------- offline answers (used when every AI engine fails) ----------------
const FAQ = [
  [/sql\s*sprint|30\s*din|30\s*days|waitlist/i, 'SQL Sprint 30 din ka programme hai: roz sirf 20 minute, interview-ready SQL. December 2026 se waitlist walon ke liye free beta, pehle 7 din free aur day 30 par certificate 🎯 Academy page par details hain.'],
  [/interview|simulator|mock/i, 'Interview Simulator mein Data Analyst, Business Analyst, MIS Executive aur Operations Analyst roles ke rounds practice hote hain: SQL, Excel, case, HR aur AI-tools 💪 Academy page par dekhiye.'],
  [/\bjoin|group\s*by|having|query|window\s*function|\bcte\b|subquery/i, 'SQL mein SELECT se columns chunte hain, WHERE se rows filter, GROUP BY se group karke COUNT/SUM nikalte hain aur HAVING se un groups ko filter karte hain. JOIN do tables ko common column par jodta hai, jaise SELECT c.name, o.amount FROM customers c JOIN orders o ON o.customer_id = c.id. Aise sawaal roz practice karne ke liye SQL Sprint best rahega 🙂'],
  [/\bsql\b/i, 'SQL (Structured Query Language) databases se data nikalne aur analyse karne ki language hai. Basic flow: SELECT columns FROM table WHERE condition, phir GROUP BY, JOIN aur window functions. Data/Business Analyst interviews mein yeh sabse zyada poocha jaata hai, isliye hamara SQL Sprint 30 din mein interview-ready banata hai 📊'],
  [/excel|power\s*bi|dashboard/i, 'Excel mein analyst ke liye sabse kaam ke skills: XLOOKUP, Pivot Tables, SUMIFS/COUNTIFS, conditional formatting aur simple dashboards. Interview Simulator ke Excel round mein inki practice hoti hai 📈'],
  [/chatgpt|claude|gemini|copilot|perplexity|grok|ai\s*tool|prompt/i, 'AI Academy mein tracks hain: Claude Mastery, ChatGPT for Work, Gemini & Google Workspace, Grok & Perplexity, Microsoft Copilot, AI for Your Role aur Build Your Own AI Agent 🤖 Achha prompt = role + task + context + output format.'],
  [/agent|business|automation|ai\s*lab|whatsapp|chatbot/i, 'AI Lab businesses ke liye custom AI agents banata hai: sales lead, customer support, WhatsApp orders, HR screening, content & social, MIS reports. Delivery 2 se 4 hafte mein 🚀'],
  [/resume|cv|linkedin\s*profile|cover\s*letter|job/i, 'Career AI tools mein resume writer, LinkedIn optimizer, cover letters, Job Hunter aur readiness score hain ✨ Resume ke liye: har point action + number + result ho, jaise "MIS report automate karke 6 ghante/week bachaye".'],
  [/founder|nikhil|team|kaun|who/i, 'NIKHILs TECH STUDIO ke founder Nikhil Kumar hain. Team: Nikhil, Monish aur Pranav 🙌'],
  [/workshop|college|partner|collab|contact|call|email|hire/i, 'Colleges, companies, clubs aur creators ke saath partnerships aur workshops karte hain 🤝 Contact page par details bhej dijiye.'],
  [/price|fee|cost|kitne|paisa|free/i, 'SQL Sprint ka beta waitlist ke liye free hai aur pehle 7 din free hain. Baaki pricing abhi announce nahi hui, Contact page par pooch sakte hain 🙂'],
  [/challenge|community|live|contest/i, 'Community mein roz raat 9 baje SQL challenge, har hafte live doubt session aur har mahine SQL contest hota hai 🏆 Media Hub par dekhiye.'],
  [/video|youtube|channel|insta|reel/i, 'Hamare YouTube @NikhilsTechStudio par SQL Interview: FAANG series chal rahi hai, aur Instagram @nikhil_techstudio par roz tips ▶️'],
];

export function offlineAnswer(text, owner) {
  const t = String(text || '').trim();
  if (owner) return { reply: 'AI engine abhi jawab nahi de raha, Sir. Settings mein Gemini/Groq key ka Test chala ke dekhiye.', actions: [{ type: 'open_tab', value: 'settings' }] };
  if (!/[\p{L}\p{N}]/u.test(t) || t.length < 2) return { reply: 'Haan ji, boliye 🙂 Aap pooch sakte hain: "SQL kya hai?", "SQL Sprint kab shuru hoga?" ya "AI Lab kya karta hai?"', actions: [] };
  for (const [re, reply] of FAQ) if (re.test(t)) return { reply, actions: [] };
  if (/^(hi+|hello|hey|namaste|hlo)\b/i.test(t)) return { reply: 'Namaste! 😊 SQL, AI tools, interviews ya hamare programmes ke baare mein kuch bhi poochiye.', actions: [] };
  return { reply: 'Yeh mujhe abhi theek se samajh nahi aaya 🙂 SQL, Excel, AI tools, interview prep, SQL Sprint ya AI Lab ke baare mein poochiye, main batati hoon.', actions: [] };
}

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
    if (type === 'navigate' && (owner ? PAGES : PUBLIC_PAGES).includes(value)) out.push({ type, value });
    else if (type === 'open_link' && LINKS.includes(value.toLowerCase())) out.push({ type, value: value.toLowerCase() });
    else if (owner && type === 'run_agent' && ids.has(String(a?.id)) && value.trim().length >= 3) out.push({ type, id: String(a.id), value: value.trim() });
    else if (owner && type === 'save_note' && value.trim().length >= 3) out.push({ type, value: value.trim() });
    else if (owner && type === 'open_tab' && TABS.includes(value)) out.push({ type, value });
    else if (owner && type === 'run_cycle') out.push({ type, value: value.trim().slice(0, 300) });
    else if (owner && (type === 'approve' || type === 'reject') && /^w_[a-z0-9]{10,40}$/.test(String(a?.id))) out.push({ type, id: String(a.id), value: value.trim().slice(0, 200) });
    else if (owner && type === 'remember' && value.trim().length >= 3) out.push({ type, value: value.trim().slice(0, 300) });
    else if (owner && type === 'make_image' && value.trim().length >= 3) out.push({ type, value: value.trim().slice(0, 1500) });
  }
  return out;
}

/** assistant: 'disha' (public, ignores any token) or 'marg' (owner only). */
export async function chat(rawEnv, request, assistant = 'disha') {
  const owner = assistant === 'marg';
  if (owner && !isOwner(rawEnv, request)) throw new HttpError(401, 'Owner only.');
  limit(`${assistant}:${clientIp(request)}`, owner ? 40 : 15, 60_000);
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'Body must be JSON.');
  }
  const msgs = (Array.isArray(body?.messages) ? body.messages : [])
    .slice(-10)
    .map((m) => ({ role: m?.role === 'assistant' || m?.role === 'disha' ? 'ASSISTANT' : 'PERSON', text: String(m?.text ?? '').slice(0, 1500).trim() }))
    .filter((m) => m.text);
  if (!msgs.length || msgs[msgs.length - 1].role !== 'PERSON') throw new HttpError(400, 'Send at least one message.');
  const page = (owner ? PAGES : PUBLIC_PAGES).includes(body?.page) ? body.page : '/';
  const env = await store.withSettings(rawEnv);

  // owner-only attachment: text files go into the prompt, images/PDFs go to Gemini
  const files = [];
  let attached = '';
  const a = owner && body?.attachment && typeof body.attachment === 'object' ? body.attachment : null;
  if (a) {
    const name = String(a.name || 'file').slice(0, 120);
    if (typeof a.text === 'string') attached = `\n\nATTACHED FILE "${name}":\n${a.text.slice(0, 30000)}`;
    else if (/^(image\/(png|jpeg|webp|gif)|application\/pdf)$/.test(String(a.mime)) && typeof a.data === 'string' && /^[A-Za-z0-9+/=]+$/.test(a.data) && a.data.length <= 7_000_000) {
      files.push({ mime: a.mime, data: a.data });
      attached = `\n\n(The owner attached "${name}"; it is included above. Read it and answer about it.)`;
    } else throw new HttpError(400, 'Yeh file type support nahi hai. Image, PDF ya text file bhejiye (max ~5 MB).');
  }

  let state = `The person is on page ${page}.`;
  let knowledge = PUBLIC_KNOWLEDGE;
  if (owner) {
    const brain = await store.getBrain(rawEnv);
    knowledge = await store.brainContext(rawEnv);
    const board = await getWork(rawEnv);
    const waiting = board.items.filter((i) => i.status === 'waiting').slice(0, 6);
    state += `\nWORK BOARD: ${board.items.length} items, ${waiting.length ? `${board.items.filter((i) => i.status === 'waiting').length} waiting for approval: ${waiting.map((i) => `${i.id} = ${i.agentName} / ${i.channel}: ${i.title}`).join('; ')}` : 'nothing waiting'}. Autopilot ${board.autopilot ? 'on (every 6 hours)' : 'off'}.${board.last ? ` Last cycle topic: ${board.last.topic}.` : ''}`;
    state += `\nRULES: ${brain.rules.length}. LESSONS LEARNED: ${brain.feedback.length}.`;
    state += `\nAGENTS: ${catalogue()
      .map((a) => `${a.id} = ${a.name}`)
      .join('; ')}.\nBRAIN NOTES: ${brain.notes.length}. ENGINES: ${Object.entries(engineStatus(env)).filter(([, e]) => e.configured).map(([k]) => k).join(', ') || 'none'}.`;
  }
  const system = `${owner ? MARG_PERSONA : DISHA_PERSONA}\n\nKNOWLEDGE:\n${knowledge}\n\n${owner ? OWNER_ACTIONS : PUBLIC_ACTIONS}\n\n${FORMAT}`;
  const prompt = `STATE:\n${state}\n\nCONVERSATION:\n${msgs.map((m) => `${m.role}: ${m.text}`).join('\n')}${attached}\n\nReply to the person's last message.`;
  let r;
  try {
    r = await generate(env, { system, prompt, maxTokens: owner ? 1600 : 1100, json: true, files });
  } catch (e) {
    if (files.length) throw e;
    const off = offlineAnswer(msgs[msgs.length - 1].text, owner);
    console.log(`[${assistant}] AI failed: ${e.message}`);
    return json({ reply: off.reply, say: off.reply.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, ''), actions: owner ? off.actions : [], offline: true, ...(owner ? { error: e.message } : {}) });
  }
  let out;
  try {
    out = parseJson(r.text);
  } catch {
    out = { reply: r.text.slice(0, 800) };
  }
  const reply = String(out.reply || '').slice(0, 1500) || 'Hmm, samajh nahi aaya. Dobara bolenge?';
  const say = String(out.say || reply).replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '').slice(0, 1500);
  return json({ reply, say, actions: cleanActions(out.actions, owner) });
}

// ---------------- Sarvam voice (owner only) ----------------
const SARVAM_URL = 'https://api.sarvam.ai/text-to-speech';
const LANGS = ['bn-IN', 'en-IN', 'gu-IN', 'hi-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'od-IN', 'pa-IN', 'ta-IN', 'te-IN'];
const SPEAKERS = ['shubh', 'priya', 'simran', 'ishita', 'ritu', 'kavya', 'shreya'];
const num = (v, d) => (Number.isFinite(Number(v)) && String(v ?? '').trim() !== '' ? Number(v) : d);
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10); // IST day
const usageKey = () => `marg/tts/usage/${today()}`;

export function voiceConfig(env) {
  const speaker = SPEAKERS.includes(String(env.MARG_SARVAM_SPEAKER || '').toLowerCase()) ? env.MARG_SARVAM_SPEAKER.toLowerCase() : 'shubh';
  return {
    enabled: Boolean(env.SARVAM_API_KEY),
    model: String(env.MARG_SARVAM_MODEL || 'bulbul:v3'),
    speaker,
    speakers: SPEAKERS,
    dailyChars: Math.max(0, Math.floor(num(env.MARG_TTS_DAILY_CHARS, 5000))),
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

  const ck = `marg/tts/cache/${await sha([c.model, speaker, lang, pace, text].join('|'))}`;
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
  if (url.pathname === '/api/disha/chat' && request.method === 'POST') return chat(rawEnv, request, 'disha');
  if (!url.pathname.startsWith('/api/marg/')) throw new HttpError(404, 'Not found.');
  if (!isOwner(rawEnv, request)) throw new HttpError(401, 'Owner only.');
  if (url.pathname === '/api/marg/chat' && request.method === 'POST') return chat(rawEnv, request, 'marg');
  const env = await store.withSettings(rawEnv);
  if (url.pathname === '/api/marg/voice' && request.method === 'GET') return json(await voiceView(env));
  if (url.pathname === '/api/marg/tts' && request.method === 'POST') {
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
