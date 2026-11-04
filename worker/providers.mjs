// Free-first AI engines: Gemini (Google AI Studio free key) then Groq (free key).
// Server-side only. Keys never leave the Worker. Returns text + token usage.
import { HttpError } from './util.mjs';

export const ENGINES = ['gemini', 'groq'];

export function engineStatus(env) {
  return {
    gemini: { configured: Boolean(env.GEMINI_API_KEY), model: env.GEMINI_MODEL || 'gemini-2.5-flash' },
    groq: { configured: Boolean(env.GROQ_API_KEY), model: env.GROQ_MODEL || 'openai/gpt-oss-120b' },
  };
}

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
      const r = engine === 'gemini' ? await gemini(env, { system, prompt, maxTokens, json, files }, fetchImpl) : await groq(env, { system, prompt, maxTokens, json }, fetchImpl);
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

const GEMINI_FALLBACK_MODEL = 'gemini-flash-latest';

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
  // a retired model ID: retry once on Google's always-current flash alias
  if (res.status === 404 && model !== GEMINI_FALLBACK_MODEL) {
    model = GEMINI_FALLBACK_MODEL;
    res = await call(model);
    body = await res.json().catch(() => ({}));
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

async function groq(env, { system, prompt, maxTokens, json }, fetchImpl) {
  const model = engineStatus(env).groq.model;
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
    const gone = /does not exist|decommissioned|not found/i.test(body?.error?.message || '');
    throw new HttpError(502, `Groq: ${body?.error?.message || `HTTP ${res.status}`}${gone ? ' Settings mein GROQ_MODEL khaali chhodiye (default openai/gpt-oss-120b).' : ''}`);
  }
  const text = body.choices?.[0]?.message?.content ?? '';
  if (!text) throw new HttpError(502, 'Groq returned no text.');
  return { text, model, inputTokens: body.usage?.prompt_tokens ?? null, outputTokens: body.usage?.completion_tokens ?? null };
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
