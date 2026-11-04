// Free-first AI engines (same chain as AGENTVERSE): Gemini (free key) -> Groq (free key) -> Cloud brain
// (no key: Pollinations, then Cloudflare Workers AI free allowance). Retired model IDs are rediscovered
// from the provider's live model list. Server-side only; keys never leave the Worker.
import { HttpError } from './util.mjs';

export const ENGINES = ['gemini', 'groq', 'cloud'];

// per-isolate memory of the last model that worked after a rediscovery
const LIVE = { gemini: null, groq: null };

export function engineStatus(env) {
  return {
    gemini: { configured: Boolean(env.GEMINI_API_KEY), model: LIVE.gemini || env.GEMINI_MODEL || 'gemini-flash-latest' },
    groq: { configured: Boolean(env.GROQ_API_KEY), model: LIVE.groq || env.GROQ_MODEL || 'openai/gpt-oss-120b' },
    cloud: { configured: Boolean(env.AI) || env.CLOUD_BRAIN === 'on', model: 'free cloud brain' },
  };
}
const gone = (status, msg) => status === 404 || /does not exist|decommissioned|not found|no longer supported|deprecated/i.test(msg || '');
const ver = (id) => parseFloat((String(id).match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);

const price = (v) => {
  if (!v) return null;
  const [i, o] = String(v).split(',').map(Number);
  return Number.isFinite(i) && Number.isFinite(o) ? { i, o } : null;
};

/** Call the first configured engine; fall back to the next on failure. */
export async function generate(env, { system, prompt, maxTokens = 2048, json = false, only = null, files = [] }, fetchImpl = fetch) {
  // files (images / PDFs) can only be read by Gemini
  if (files.length) only = 'gemini';
  const order = ENGINES.filter((e) => engineStatus(env)[e].configured && (!only || e === only));
  if (!order.length) {
    if (files.length) throw new HttpError(503, 'Image ya PDF padhne ke liye Gemini key chahiye (Settings).');
    throw new HttpError(503, 'No AI engine configured. Add a free GEMINI_API_KEY (aistudio.google.com) or GROQ_API_KEY (console.groq.com).');
  }
  const errors = [];
  for (const engine of order) {
    const started = Date.now();
    try {
      const args = { system, prompt, maxTokens, json, files };
      const r = engine === 'gemini' ? await gemini(env, args, fetchImpl) : engine === 'groq' ? await groq(env, args, fetchImpl) : await cloud(env, args, fetchImpl);
      const p = price(engine === 'gemini' ? env.GEMINI_PRICE_PER_MTOK : env.GROQ_PRICE_PER_MTOK);
      const cost = p ? ((r.inputTokens ?? 0) * p.i + (r.outputTokens ?? 0) * p.o) / 1e6 : null;
      return { ...r, engine, latencyMs: Date.now() - started, costUsd: cost };
    } catch (e) {
      errors.push(e);
    }
  }
  // show every engine's reason, not just the last one
  if (errors.length === 1) throw errors[0];
  throw new HttpError(502, errors.map((e) => e.message).join(' | '));
}

async function discoverGemini(env, fetchImpl) {
  const r = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': String(env.GEMINI_API_KEY).trim() } });
  const j = await r.json().catch(() => ({}));
  const ms = (j.models || [])
    .filter((x) => (x.supportedGenerationMethods || []).includes('generateContent') && /gemini/.test(x.name) && /flash/.test(x.name) && !/image|tts|audio|live|embed|vision|thinking-exp|learnlm/.test(x.name))
    .map((x) => x.name.replace('models/', ''))
    .sort((a, b) => /preview|exp/.test(a) - /preview|exp/.test(b) || /lite/.test(a) - /lite/.test(b) || ver(b.replace('gemini-', '')) - ver(a.replace('gemini-', '')));
  return ms[0] || 'gemini-flash-latest';
}

async function gemini(env, { system, prompt, maxTokens, json, files = [] }, fetchImpl) {
  let model = engineStatus(env).gemini.model;
  const call = (m) =>
    fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      method: 'POST',
      // works for both key formats (AIza... and the newer AQ. auth keys)
      headers: { 'content-type': 'application/json', 'x-goog-api-key': String(env.GEMINI_API_KEY).trim() },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [...files.map((f) => ({ inlineData: { mimeType: f.mime, data: f.data } })), { text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
    });
  let res = await call(model);
  let body = await res.json().catch(() => ({}));
  // a retired model ID: find the current flash model from Google's live list and retry once
  if (gone(res.status, body?.error?.message)) {
    const next = await discoverGemini(env, fetchImpl).catch(() => 'gemini-flash-latest');
    if (next !== model) {
      model = next;
      res = await call(model);
      body = await res.json().catch(() => ({}));
      if (res.ok) LIVE.gemini = model;
    }
  }
  if (!res.ok) {
    const reason = body?.error?.details?.find?.((d) => d?.reason)?.reason;
    const hint = res.status === 401 || res.status === 403 ? ' (key galat/disabled hai ya Gemini API is project mein enabled nahi hai; AI Studio se nayi key banaiye)' : '';
    throw new HttpError(502, `Gemini: ${body?.error?.message || `HTTP ${res.status}`}${reason ? ` [${reason}]` : ''}${hint}`);
  }
  const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!text) throw new HttpError(502, `Gemini returned no text (${body.candidates?.[0]?.finishReason ?? 'unknown'}).`);
  return { text, model, inputTokens: body.usageMetadata?.promptTokenCount ?? null, outputTokens: body.usageMetadata?.candidatesTokenCount ?? null };
}

async function discoverGroq(env, fetchImpl) {
  const r = await fetchImpl('https://api.groq.com/openai/v1/models', { headers: { authorization: `Bearer ${env.GROQ_API_KEY}` } });
  const j = await r.json().catch(() => ({}));
  const ids = (j.data || []).filter((x) => x.active !== false && !/whisper|tts|guard|playai|distil|vision|embed|compound|orpheus|prompt/i.test(x.id)).map((x) => x.id);
  const pref = [/gpt-oss-120b/, /qwen3/, /llama-4/, /kimi/, /gpt-oss/, /llama/];
  return pref.map((p) => ids.find((i) => p.test(i))).find(Boolean) || ids[0] || null;
}

async function groq(env, args, fetchImpl) {
  const first = engineStatus(env).groq.model;
  try {
    return await groqCall(env, args, first, fetchImpl);
  } catch (e) {
    if (!e.gone) throw e;
    const next = await discoverGroq(env, fetchImpl).catch(() => null);
    if (!next || next === first) throw e;
    const r = await groqCall(env, args, next, fetchImpl);
    LIVE.groq = next;
    return r;
  }
}

async function groqCall(env, { system, prompt, maxTokens, json }, model, fetchImpl) {
  const res = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      // reasoning models spend tokens thinking; keep it short for chat
      ...(/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new HttpError(502, `Groq: ${body?.error?.message || `HTTP ${res.status}`}`);
    err.gone = gone(res.status, body?.error?.message);
    throw err;
  }
  const text = body.choices?.[0]?.message?.content ?? '';
  if (!text) throw new HttpError(502, 'Groq returned no text.');
  return { text, model, inputTokens: body.usage?.prompt_tokens ?? null, outputTokens: body.usage?.completion_tokens ?? null };
}

// ---------------- Cloud brain (no key) ----------------
const CF_MODELS = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/qwen/qwen3-30b-a3b-fp8', '@cf/meta/llama-3.1-8b-instruct-fp8'];
const aiText = (r) => {
  if (typeof r === 'string') return r;
  if (typeof r?.response === 'string') return r.response;
  if (r?.response && typeof r.response === 'object') return JSON.stringify(r.response);
  const c = r?.choices?.[0]?.message?.content ?? r?.choices?.[0]?.text;
  return typeof c === 'string' ? c : '';
};

async function cloud(env, { system, prompt, maxTokens, json }, fetchImpl) {
  // daily cap keeps it inside free allowances (no surprise spend)
  const cap = Number(env.CLOUD_BRAIN_DAILY) > 0 ? Number(env.CLOUD_BRAIN_DAILY) : 300;
  const key = `brain/cloud/${new Date().toISOString().slice(0, 10)}`;
  const used = env.NTS_KV ? Number(await env.NTS_KV.get(key)) || 0 : 0;
  if (used >= cap) throw new HttpError(429, `Cloud brain: aaj ki free limit (${cap}) poori ho gayi.`);
  if (env.NTS_KV) await env.NTS_KV.put(key, String(used + 1), { expirationTtl: 3 * 86400 });
  const sys = `${system}${json ? '\nReturn ONLY valid JSON.' : ''}`;
  const errs = [];
  if (env.CLOUD_POLLINATIONS !== 'off') {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 45_000);
    try {
      const r = await fetchImpl('https://text.pollinations.ai/openai', {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'user-agent': 'nts-website/1.0' },
        body: JSON.stringify({ model: 'openai', messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }], temperature: 0.7 }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = aiText(await r.json()).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (text) return { text, model: 'pollinations', inputTokens: null, outputTokens: null };
      errs.push('pollinations: empty');
    } catch (e) {
      errs.push(`pollinations: ${String(e?.message ?? e).slice(0, 60)}`);
    } finally {
      clearTimeout(t);
    }
  }
  if (env.AI) {
    for (const model of CF_MODELS) {
      try {
        const r = await env.AI.run(model, { messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }], max_tokens: Math.min(maxTokens, 2048), temperature: 0.7 });
        const text = aiText(r).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        if (text) return { text, model: model.replace('@cf/', ''), inputTokens: null, outputTokens: null };
        errs.push(`${model.split('/').pop()}: empty`);
      } catch (e) {
        errs.push(`${model.split('/').pop()}: ${String(e?.message ?? e).slice(0, 60)}`);
      }
    }
  }
  throw new HttpError(502, `Cloud brain: ${errs.join(' | ') || 'not available'}`);
}

/** Parse JSON from a model reply, tolerating ```json fences. */
export function parseJson(text) {
  const t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new HttpError(502, 'The AI reply was not valid JSON. Try again.');
  }
}
