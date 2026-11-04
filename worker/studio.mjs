// Content Studio + Publishing Manager.
// Flow: topic → draft (MAYA-OPS) → variants (LAKSHMI-OPS) → preview → approval (human) → publish job → analytics.
// Nothing publishes without an approved job. Scheduled jobs are run by the cron.
import { HttpError, newId, nowIso, str, oneOf, slugify, HTTPS_URL } from './util.mjs';
import { audit } from './auth.mjs';
import * as agents from './agents.mjs';
import * as linkedin from './social/linkedin.mjs';
import * as instagram from './social/instagram.mjs';
import * as youtube from './social/youtube.mjs';

const ADAPTERS = { linkedin, instagram, youtube };
const VARIANT_PLATFORMS = ['linkedin', 'instagram', 'youtube', 'website'];
const MAX_ATTEMPTS = 3;

export async function listDrafts(db) {
  const drafts = (await db.prepare("SELECT * FROM drafts WHERE status != 'archived' ORDER BY updated_at DESC LIMIT 200").all()).results;
  const counts = (await db.prepare('SELECT draft_id, COUNT(*) AS n FROM variants GROUP BY draft_id').all()).results;
  const c = Object.fromEntries(counts.map((r) => [r.draft_id, r.n]));
  return drafts.map((d) => ({ ...d, variantCount: c[d.id] ?? 0 }));
}

export async function getDraft(db, id) {
  const d = await db.prepare('SELECT * FROM drafts WHERE id = ?').bind(id).first();
  if (!d) throw new HttpError(404, 'Draft not found.');
  const variants = (await db.prepare('SELECT * FROM variants WHERE draft_id = ? ORDER BY platform').bind(id).all()).results.map((v) => ({ ...v, meta: v.meta ? JSON.parse(v.meta) : {} }));
  const jobs = (await db.prepare('SELECT j.* FROM publish_jobs j JOIN variants v ON v.id = j.variant_id WHERE v.draft_id = ? ORDER BY j.created_at DESC').bind(id).all()).results;
  return { ...d, variants, jobs };
}

export async function createDraft(db, s, body) {
  const topic = str(body, 'topic', { required: true, min: 3, max: 300 });
  const id = newId('drf');
  const now = nowIso();
  await db.prepare('INSERT INTO drafts (id, topic, title, body, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, topic, str(body, 'title', { max: 160 }), str(body, 'body', { max: 60000 }), 'draft', s.user.id, now, now).run();
  return getDraft(db, id);
}

export async function updateDraft(db, s, id, body) {
  const d = await db.prepare('SELECT * FROM drafts WHERE id = ?').bind(id).first();
  if (!d) throw new HttpError(404, 'Draft not found.');
  const title = body.title !== undefined ? str(body, 'title', { max: 160 }) : d.title;
  const text = body.body !== undefined ? str(body, 'body', { max: 60000 }) : d.body;
  const status = oneOf(body, 'status', ['draft', 'in_review', 'approved', 'archived'], { fallback: d.status });
  await db.prepare('UPDATE drafts SET title=?, body=?, status=?, updated_at=? WHERE id=?').bind(title, text, status, nowIso(), id).run();
  if (status !== d.status) await audit(db, { userId: s.user.id, action: `draft_${status}`, target: id });
  return getDraft(db, id);
}

/** Brand & Content Agent writes the long-form body. */
export async function generateDraft(env, db, s, id, body) {
  const d = await db.prepare('SELECT * FROM drafts WHERE id = ?').bind(id).first();
  if (!d) throw new HttpError(404, 'Draft not found.');
  const kind = oneOf(body, 'kind', ['article', 'tutorial', 'explainer'], { fallback: 'article' });
  const out = await agents.draftFromTopic(env, db, { topic: d.topic, kind, audience: str(body, 'audience', { max: 200 }) || '' });
  await db.prepare('UPDATE drafts SET title=?, body=?, updated_at=? WHERE id=?').bind(out.title, `${out.excerpt ? `> ${out.excerpt}\n\n` : ''}${out.body}`, nowIso(), id).run();
  await audit(db, { userId: s.user.id, action: 'draft_generated', target: id, detail: out.runId });
  return getDraft(db, id);
}

/** Social Media Agent converts the draft into platform variants. */
export async function generateVariants(env, db, s, id, body) {
  const d = await db.prepare('SELECT * FROM drafts WHERE id = ?').bind(id).first();
  if (!d) throw new HttpError(404, 'Draft not found.');
  if (!d.body || d.body.length < 200) throw new HttpError(400, 'Write or generate the article body first (at least 200 characters).');
  const platforms = Array.isArray(body.platforms) ? body.platforms.filter((p) => VARIANT_PLATFORMS.includes(p)) : VARIANT_PLATFORMS;
  if (!platforms.length) throw new HttpError(400, 'Choose at least one platform.');
  const { variants } = await agents.adaptForPlatforms(env, db, { title: d.title || d.topic, body: d.body, platforms });
  for (const p of platforms) {
    const v = variants[p];
    if (!v) continue;
    const text = p === 'youtube' ? String(v.description || '') : String(v.text || '');
    const meta = p === 'youtube' ? { title: v.title, tags: v.tags } : {};
    await upsertVariant(db, id, p, { text, meta });
  }
  await audit(db, { userId: s.user.id, action: 'variants_generated', target: id, detail: platforms.join(',') });
  return getDraft(db, id);
}

async function upsertVariant(db, draftId, platform, { text, mediaUrl = null, meta = {} }) {
  const existing = await db.prepare('SELECT id FROM variants WHERE draft_id = ? AND platform = ?').bind(draftId, platform).first();
  if (existing) await db.prepare('UPDATE variants SET text=?, media_url=COALESCE(?, media_url), meta=?, updated_at=? WHERE id=?').bind(text, mediaUrl, JSON.stringify(meta), nowIso(), existing.id).run();
  else await db.prepare('INSERT INTO variants (id, draft_id, platform, text, media_url, meta, updated_at) VALUES (?,?,?,?,?,?,?)').bind(newId('var'), draftId, platform, text, mediaUrl, JSON.stringify(meta), nowIso()).run();
}

export async function saveVariant(db, s, draftId, body) {
  const platform = oneOf(body, 'platform', VARIANT_PLATFORMS, { required: true });
  const text = str(body, 'text', { required: true, max: 5000 });
  const mediaUrl = str(body, 'mediaUrl', { max: 1000, pattern: HTTPS_URL });
  const meta = body.meta && typeof body.meta === 'object' ? { title: String(body.meta.title || '').slice(0, 100), tags: Array.isArray(body.meta.tags) ? body.meta.tags.slice(0, 15).map(String) : [] } : {};
  if (!(await db.prepare('SELECT 1 FROM drafts WHERE id=?').bind(draftId).first())) throw new HttpError(404, 'Draft not found.');
  await upsertVariant(db, draftId, platform, { text, mediaUrl, meta });
  return getDraft(db, draftId);
}

/** Publish the website variant/draft as a CMS article (in_review → published by an admin). */
export async function draftToArticle(db, s, id) {
  const d = await db.prepare('SELECT * FROM drafts WHERE id = ?').bind(id).first();
  if (!d || !d.body) throw new HttpError(400, 'Draft has no body yet.');
  if (d.status !== 'approved') throw new HttpError(409, 'Approve the draft before turning it into a website article.');
  const teaser = await db.prepare("SELECT text FROM variants WHERE draft_id = ? AND platform = 'website'").bind(id).first();
  const body = d.body.replace(/^> .*\n\n/, '');
  const excerpt = teaser?.text || (d.body.match(/^> (.*)$/m)?.[1] ?? body.slice(0, 200));
  const articleId = d.article_id || newId('art');
  const slug = `${slugify(d.title || d.topic)}-${articleId.slice(-4)}`;
  const now = nowIso();
  if (d.article_id) await db.prepare('UPDATE articles SET title=?, excerpt=?, body=?, updated_at=? WHERE id=?').bind(d.title || d.topic, excerpt.slice(0, 300), body, now, articleId).run();
  else await db.prepare("INSERT INTO articles (id, slug, title, excerpt, body, category, status, author, updated_at) VALUES (?,?,?,?,?,'article','in_review',?,?)").bind(articleId, slug, d.title || d.topic, excerpt.slice(0, 300), body, 'NIKHILs TECH STUDIO', now).run();
  await db.prepare('UPDATE drafts SET article_id=?, updated_at=? WHERE id=?').bind(articleId, now, id).run();
  await audit(db, { userId: s.user.id, action: 'draft_to_article', target: articleId });
  return { articleId };
}

// ---------------- Publishing Manager ----------------

export async function createJob(db, s, body) {
  const variantId = str(body, 'variantId', { required: true, max: 64 });
  const v = await db.prepare('SELECT * FROM variants WHERE id = ?').bind(variantId).first();
  if (!v) throw new HttpError(404, 'Variant not found.');
  if (v.platform === 'website') throw new HttpError(400, 'Website content is published through the CMS, not as a social job.');
  if (v.platform === 'youtube') throw new HttpError(409, 'YouTube upload is not enabled through the API. Copy the title/description into YouTube Studio.');
  if (v.platform === 'instagram' && !v.media_url) throw new HttpError(400, 'Instagram needs an image or video. Add a public media URL to the Instagram variant first.');
  let scheduledAt = null;
  if (body.scheduledAt) {
    const t = Date.parse(body.scheduledAt);
    if (!Number.isFinite(t)) throw new HttpError(400, 'scheduledAt must be a date-time.');
    if (t < Date.now() - 60_000) throw new HttpError(400, 'Scheduled time is in the past.');
    scheduledAt = new Date(t).toISOString();
  }
  const id = newId('job');
  const now = nowIso();
  await db.prepare("INSERT INTO publish_jobs (id, variant_id, platform, status, scheduled_at, created_at, updated_at) VALUES (?,?,?,'awaiting_approval',?,?,?)").bind(id, variantId, v.platform, scheduledAt, now, now).run();
  await audit(db, { userId: s.user.id, action: 'job_created', target: id, detail: `${v.platform}${scheduledAt ? ` @ ${scheduledAt}` : ''}` });
  return job(db, id);
}

export async function job(db, id) {
  const j = await db.prepare('SELECT j.*, v.text, v.media_url, v.draft_id, d.title AS draft_title FROM publish_jobs j JOIN variants v ON v.id=j.variant_id JOIN drafts d ON d.id=v.draft_id WHERE j.id=?').bind(id).first();
  if (!j) throw new HttpError(404, 'Job not found.');
  return j;
}

export async function listJobs(db, status) {
  const base = 'SELECT j.*, v.text, v.media_url, v.draft_id, d.title AS draft_title FROM publish_jobs j JOIN variants v ON v.id=j.variant_id JOIN drafts d ON d.id=v.draft_id';
  const q = status ? db.prepare(`${base} WHERE j.status = ? ORDER BY j.updated_at DESC LIMIT 200`).bind(status) : db.prepare(`${base} ORDER BY j.updated_at DESC LIMIT 200`);
  return (await q.all()).results;
}

/** Human approval gate. Approving an unscheduled job publishes it immediately. */
export async function decide(env, db, s, id, body, fetchImpl = fetch) {
  const decision = oneOf(body, 'decision', ['approve', 'reject', 'cancel'], { required: true });
  const j = await db.prepare('SELECT * FROM publish_jobs WHERE id = ?').bind(id).first();
  if (!j) throw new HttpError(404, 'Job not found.');
  const now = nowIso();
  if (decision === 'cancel') {
    if (!['awaiting_approval', 'approved', 'failed'].includes(j.status)) throw new HttpError(409, `A ${j.status} job cannot be cancelled.`);
    await db.prepare("UPDATE publish_jobs SET status='cancelled', updated_at=? WHERE id=?").bind(now, id).run();
  } else {
    if (j.status !== 'awaiting_approval') throw new HttpError(409, `This job is already ${j.status}.`);
    if (decision === 'reject') await db.prepare("UPDATE publish_jobs SET status='rejected', approved_by=?, approved_at=?, updated_at=? WHERE id=?").bind(s.user.id, now, now, id).run();
    else await db.prepare("UPDATE publish_jobs SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=?").bind(s.user.id, now, now, id).run();
  }
  await audit(db, { userId: s.user.id, action: `job_${decision}`, target: id });
  if (decision === 'approve' && (!j.scheduled_at || Date.parse(j.scheduled_at) <= Date.now())) await runJob(env, db, id, fetchImpl);
  return job(db, id);
}

export async function retry(env, db, s, id, fetchImpl = fetch) {
  const j = await db.prepare('SELECT * FROM publish_jobs WHERE id = ?').bind(id).first();
  if (!j) throw new HttpError(404, 'Job not found.');
  if (j.status !== 'failed') throw new HttpError(409, 'Only failed jobs can be retried.');
  if (!j.approved_by) throw new HttpError(409, 'This job was never approved.');
  await db.prepare("UPDATE publish_jobs SET status='approved', attempts=0, last_error=NULL, updated_at=? WHERE id=?").bind(nowIso(), id).run();
  await audit(db, { userId: s.user.id, action: 'job_retry', target: id });
  await runJob(env, db, id, fetchImpl);
  return job(db, id);
}

/** Execute one approved job. Guarded so only approved jobs run, and only once at a time. */
export async function runJob(env, db, id, fetchImpl = fetch) {
  const claim = await db.prepare("UPDATE publish_jobs SET status='publishing', attempts=attempts+1, updated_at=? WHERE id=? AND status='approved' AND approved_by IS NOT NULL").bind(nowIso(), id).run();
  if (!claim.meta?.changes) return { skipped: true };
  const j = await db.prepare('SELECT j.*, v.text, v.media_url FROM publish_jobs j JOIN variants v ON v.id=j.variant_id WHERE j.id=?').bind(id).first();
  const adapter = ADAPTERS[j.platform];
  try {
    const out = await adapter.publish(env, db, { text: j.text, mediaUrl: j.media_url }, fetchImpl);
    await db.prepare("UPDATE publish_jobs SET status='published', remote_id=?, remote_url=?, last_error=NULL, updated_at=? WHERE id=?").bind(out.remoteId ?? null, out.remoteUrl ?? null, nowIso(), id).run();
    await audit(db, { action: 'job_published', target: id, detail: out.remoteUrl || out.remoteId });
    return { published: true };
  } catch (e) {
    const permanent = e.status === 400 || e.status === 409 || e.status === 501 || j.attempts >= MAX_ATTEMPTS;
    await db.prepare('UPDATE publish_jobs SET status=?, last_error=?, updated_at=? WHERE id=?').bind(permanent ? 'failed' : 'approved', String(e.message).slice(0, 500), nowIso(), id).run();
    await audit(db, { action: 'job_error', target: id, detail: e.message });
    return { error: e.message };
  }
}

/** Cron: run approved jobs that are due. */
export async function runDue(env, db, fetchImpl = fetch) {
  const due = (await db.prepare("SELECT id FROM publish_jobs WHERE status='approved' AND (scheduled_at IS NULL OR scheduled_at <= ?) ORDER BY scheduled_at LIMIT 5").bind(new Date().toISOString()).all()).results;
  const out = [];
  for (const r of due) out.push({ id: r.id, ...(await runJob(env, db, r.id, fetchImpl)) });
  return out;
}

export async function calendar(db, from, to) {
  return (await db.prepare("SELECT j.id, j.platform, j.status, j.scheduled_at, j.updated_at, d.title AS draft_title, v.draft_id FROM publish_jobs j JOIN variants v ON v.id=j.variant_id JOIN drafts d ON d.id=v.draft_id WHERE COALESCE(j.scheduled_at, j.updated_at) BETWEEN ? AND ? ORDER BY COALESCE(j.scheduled_at, j.updated_at)").bind(from, to).all()).results;
}
