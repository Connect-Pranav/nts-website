// Owner policy for comment replies on YouTube and Instagram.
// auto (owner's choice, Nov 2026): safe replies are posted without asking: thanks, questions,
// feedback and enquiries that are not negative. Escalations (legal, complaints, personal data,
// security, harassment), negative comments and spam are never auto-answered; they wait for the owner.
import * as ops from './ops.mjs';

const KEY = 'social/policy';
const SAFE_INTENT = /^(appreciation|question|feedback|enquiry|inquiry)$/i;
const MAX_PER_RUN = 10;

export async function getPolicy(env) {
  const p = env.NTS_KV ? await env.NTS_KV.get(KEY, 'json') : null;
  return { auto: p?.auto !== false, updatedAt: p?.updatedAt ?? null };
}
export async function setPolicy(env, auto) {
  const p = { auto: Boolean(auto), updatedAt: new Date().toISOString() };
  await env.NTS_KV.put(KEY, JSON.stringify(p));
  await ops.log(env, 'system', `Comment replies: ${p.auto ? 'automatic (safe replies)' : 'owner approval'}`);
  return p;
}

/** Safe to post without the owner. */
export const eligible = (c) => c.status === 'pending' && !c.escalate && !c.replyId && String(c.reply || '').trim().length >= 2 && c.sentiment !== 'negative' && SAFE_INTENT.test(String(c.intent || ''));

/** Post every safe pending reply (max 10 a run). Stops a platform at its first failure (e.g. not connected). */
export async function run(rawEnv, fetchImpl = fetch) {
  if (!rawEnv.NTS_KV || !(await getPolicy(rawEnv)).auto) return { posted: 0, skipped: 'manual' };
  const { publishReply } = await import('./youtube.mjs');
  const list = (await rawEnv.NTS_KV.get('social/comments', 'json')) || [];
  const blocked = new Set();
  let posted = 0;
  const errors = [];
  for (const c of list.filter(eligible).slice(0, MAX_PER_RUN)) {
    const platform = c.platform || 'youtube';
    if (blocked.has(platform)) continue;
    try {
      await publishReply(rawEnv, c.id, undefined, fetchImpl);
      posted++;
    } catch (e) {
      blocked.add(platform);
      errors.push(`${platform}: ${e.message}`);
    }
  }
  if (errors.length) await ops.log(rawEnv, 'error', `Auto-reply paused for ${[...blocked].join(', ')}: ${errors[0].slice(0, 140)}`);
  return { posted, errors };
}
