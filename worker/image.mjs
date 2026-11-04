// Image generation for Dev Mode (owner only), free-first:
// Gemini Flash Image ("Nano Banana", free tier with a Gemini key) -> Cloudflare Workers AI FLUX schnell
// (free daily allowance) -> Pollinations (no key). Returns base64 so nothing is stored or made public.
import { HttpError } from './util.mjs';

const ASPECTS = ['1:1', '9:16', '16:9', '4:5', '3:4'];
const STYLE = 'Clean, premium, modern tech-education visual for NIKHILs TECH STUDIO: graphite and warm gold palette, soft studio lighting. No logos, no watermarks, no brand marks. Avoid text unless the prompt asks for exact words.';

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function geminiModels(env, fetchImpl) {
  const r = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': String(env.GEMINI_API_KEY).trim() } });
  const j = await r.json().catch(() => ({}));
  // free tier: Flash Image only (Pro image models are paid)
  return (j.models || []).map((m) => m.name.replace('models/', '')).filter((n) => /gemini/.test(n) && /flash/.test(n) && /image/.test(n) && !/pro/.test(n));
}

async function gemini(env, prompt, aspect, fetchImpl) {
  const tried = new Set();
  const list = [env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'];
  let lastErr = 'no image model';
  for (let i = 0; i < list.length && i < 4; i++) {
    const model = list[i];
    if (tried.has(model)) continue;
    tried.add(model);
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': String(env.GEMINI_API_KEY).trim() },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `${STYLE}\n\n${prompt}` }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'], imageConfig: { aspectRatio: aspect } } }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      const part = (body.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
      if (part) return { mime: part.inlineData.mimeType || 'image/png', data: part.inlineData.data, engine: `gemini · ${model}` };
      lastErr = `no image returned (${body.candidates?.[0]?.finishReason ?? 'unknown'})`;
    } else {
      lastErr = body?.error?.message || `HTTP ${res.status}`;
      if (res.status === 404 && list.length === 1) list.push(...(await geminiModels(env, fetchImpl).catch(() => [])));
    }
  }
  throw new Error(`Gemini: ${String(lastErr).slice(0, 160)}`);
}

async function workersAi(env, prompt) {
  const r = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt: `${STYLE}\n\n${prompt}`.slice(0, 2000), steps: 6 });
  if (!r?.image) throw new Error('Workers AI: empty');
  return { mime: 'image/jpeg', data: r.image, engine: 'workers-ai · flux-1-schnell' };
}

async function pollinations(prompt, aspect, fetchImpl) {
  const [w, h] = { '1:1': [1024, 1024], '9:16': [768, 1344], '16:9': [1344, 768], '4:5': [896, 1120], '3:4': [864, 1152] }[aspect];
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(`${STYLE} ${prompt}`.slice(0, 1500))}?width=${w}&height=${h}&nologo=true&model=flux`;
  const r = await fetchImpl(url, { headers: { 'user-agent': 'nts-website/1.0' } });
  if (!r.ok) throw new Error(`Pollinations: HTTP ${r.status}`);
  const mime = r.headers.get('content-type') || 'image/jpeg';
  if (!mime.startsWith('image/')) throw new Error('Pollinations: not an image');
  return { mime, data: toB64(await r.arrayBuffer()), engine: 'pollinations · flux' };
}

export async function generateImage(env, body, fetchImpl = fetch) {
  const prompt = String(body?.prompt ?? '').replace(/\s+/g, ' ').trim();
  if (prompt.length < 3 || prompt.length > 1500) throw new HttpError(400, 'Image prompt must be 3 to 1500 characters.');
  const aspect = ASPECTS.includes(body?.aspect) ? body.aspect : '1:1';
  // daily cap: stays inside free allowances
  const cap = Number(env.IMAGE_DAILY) > 0 ? Number(env.IMAGE_DAILY) : 60;
  const key = `img/usage/${new Date().toISOString().slice(0, 10)}`;
  const used = env.NTS_KV ? Number(await env.NTS_KV.get(key)) || 0 : 0;
  if (used >= cap) throw new HttpError(429, `Aaj ki image limit (${cap}) poori ho gayi. Kal phir try karein.`);
  if (env.NTS_KV) await env.NTS_KV.put(key, String(used + 1), { expirationTtl: 3 * 86400 });
  const errs = [];
  const chain = [];
  if (env.GEMINI_API_KEY) chain.push(() => gemini(env, prompt, aspect, fetchImpl));
  if (env.AI) chain.push(() => workersAi(env, prompt));
  if (env.CLOUD_POLLINATIONS !== 'off') chain.push(() => pollinations(prompt, aspect, fetchImpl));
  for (const step of chain) {
    try {
      return { ...(await step()), prompt, aspect };
    } catch (e) {
      errs.push(String(e?.message ?? e).slice(0, 160));
    }
  }
  throw new HttpError(502, `Image nahi bani: ${errs.join(' | ') || 'no image engine'}`);
}
