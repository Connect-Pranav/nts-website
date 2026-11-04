// Free-first AI engines: Gemini (Google AI Studio free key) then Groq (free key).
// Server-side only. Keys never leave the Worker. Returns text + token usage.
import { HttpError } from './util.mjs';

export const ENGINES = ['gemini', 'groq'];

export function engineStatus(env) {
  return {
    gemini: { configured: Boolean(env.GEMINI_API_KEY), model: env.GEMINI_MODEL || 'gemini-2.5-flash' },
    groq: { configured: Boolean(env.GROQ_API_KEY), model: env.GROQ_MODEL || 'llama-3.3-70b-versatile' },
  };
}

const price = (v) => {
  if (!v) return null;
  const [i, o] = String(v).split(',').map(Number);
  return Number.isFinite(i) && Number.isFinite(o) ? { i, o } : null;
};

/** Call the first configured engine; fall back to the next on failure. */
export async function generate(env, { system, prompt, maxTokens = 2048, json = false }, fetchImpl = fetch) {
  const order = ENGINES.filter((e) => engineStatus(env)[e].configured);
  if (!order.length) throw new HttpError(503, 'No AI engine configured. Add a free GEMINI_API_KEY (aistudio.google.com) or GROQ_API_KEY (console.groq.com).');
  let lastErr;
  for (const engine of order) {
    const started = Date.now();
    try {
      const r = engine === 'gemini' ? await gemini(env, { system, prompt, maxTokens, json }, fetchImpl) : await groq(env, { system, prompt, maxTokens, json }, fetchImpl);
      const p = price(engine === 'gemini' ? env.GEMINI_PRICE_PER_MTOK : env.GROQ_PRICE_PER_MTOK);
      const cost = p ? ((r.inputTokens ?? 0) * p.i + (r.outputTokens ?? 0) * p.o) / 1e6 : null;
      return { ...r, engine, latencyMs: Date.now() - started, costUsd: cost };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function gemini(env, { system, prompt, maxTokens, json }, fetchImpl) {
  const model = engineStatus(env).gemini.model;
  const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7, ...(json ? { responseMimeType: 'application/json' } : {}) },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, `Gemini: ${body?.error?.message || `HTTP ${res.status}`}`);
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
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, `Groq: ${body?.error?.message || `HTTP ${res.status}`}`);
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
