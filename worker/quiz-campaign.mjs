// LinkedIn Quiz Campaign Manager — NTS COMMAND V2.0
// Manages 30-day SQL quiz campaigns: create, validate, schedule, publish, track.
// Integrates with existing KV work board + D1 database + hourly cron.
import { HttpError, newId, nowIso } from './util.mjs';
import { polishPost } from './postfmt.mjs';
import { QUIZ_LIBRARY } from './quiz-library.mjs';

const CAMPAIGN_ID_PREFIX = 'qc';
const POST_ID_PREFIX = 'qp';
const COMMENT_ID_PREFIX = 'qm';

// ─── Campaign CRUD ───

export async function createCampaign(db, env, { name, startDate, mode = 'approval' } = {}) {
  if (!name) throw new HttpError(400, 'Campaign name is required.');
  if (!startDate) throw new HttpError(400, 'Start date is required (YYYY-MM-DD).');
  const id = newId(CAMPAIGN_ID_PREFIX);
  const start = new Date(startDate + 'T13:30:00+05:30');
  if (isNaN(start.getTime())) throw new HttpError(400, 'Invalid start date.');
  const end = new Date(start.getTime() + 29 * 24 * 60 * 60 * 1000);
  const endDateStr = end.toISOString().slice(0, 10);
  const now = nowIso();
  await db.prepare(`INSERT INTO linkedin_quiz_campaigns (id, name, start_date, end_date, timezone, publishing_time, comment_delay_hours, status, mode, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
    id, name, startDate, endDateStr, 'Asia/Kolkata', '13:30', 24, 'active', mode, now
  ).run();
  // Populate quiz posts from library
  await populatePosts(db, env, id, startDate, mode);
  return getCampaign(db, id);
}

export async function getCampaign(db, id) {
  const c = await db.prepare('SELECT * FROM linkedin_quiz_campaigns WHERE id = ?').bind(id).first();
  if (!c) throw new HttpError(404, 'Campaign not found.');
  const posts = (await db.prepare('SELECT * FROM linkedin_quiz_posts WHERE campaign_id = ? ORDER BY day_number').bind(id).all()).results;
  const comments = (await db.prepare('SELECT qm.* FROM linkedin_quiz_comments qm JOIN linkedin_quiz_posts qp ON qp.id = qm.post_id WHERE qp.campaign_id = ? ORDER BY qm.scheduled_at').bind(id).all()).results;
  const stats = {
    total: posts.length,
    approved: posts.filter(p => p.approval_status === 'approved').length,
    pending: posts.filter(p => p.approval_status === 'pending').length,
    rejected: posts.filter(p => p.approval_status === 'rejected').length,
    published: posts.filter(p => p.publishing_status === 'published').length,
    failed: posts.filter(p => p.publishing_status === 'failed').length,
    scheduled: posts.filter(p => p.publishing_status === 'scheduled').length,
    pendingComments: comments.filter(cm => cm.status === 'action_required').length,
  };
  return { campaign: c, posts, comments, stats };
}

export async function listCampaigns(db) {
  return (await db.prepare('SELECT * FROM linkedin_quiz_campaigns ORDER BY created_at DESC LIMIT 20').all()).results;
}

// ─── Populate 30 posts from the validated library ───

async function populatePosts(db, env, campaignId, startDate, mode) {
  const library = QUIZ_LIBRARY;
  if (!library || library.length < 30) throw new HttpError(500, 'Quiz library incomplete.');
  const now = nowIso();
  const batch = [];
  const baseDate = new Date(startDate + 'T13:30:00+05:30');
  for (let i = 0; i < 30; i++) {
    const q = library[i];
    // 01:30 PM IST = 08:00 UTC on the specified date
    const dayDate = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    const scheduledAtClean = dayDate.toISOString();
    const postId = newId(POST_ID_PREFIX);
    const commentId = newId(COMMENT_ID_PREFIX);
    const approvalStatus = mode === 'autonomous' && q.quality_score >= 90 ? 'approved' : 'pending';
    // Comment scheduled 24 hours after post
    const commentScheduled = new Date(Date.parse(scheduledAtClean) + 24 * 60 * 60 * 1000).toISOString();

    batch.push(
      db.prepare(`INSERT INTO linkedin_quiz_posts (id, campaign_id, day_number, scheduled_at, topic, difficulty, hook, scenario, question, option_a, option_b, option_c, option_d, correct_answer, post_content, answer_comment, hashtags, quality_score, approval_status, publishing_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(postId, campaignId, i + 1, scheduledAtClean, q.topic, q.difficulty, q.hook, q.scenario, q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.post_content, q.answer_comment, q.hashtags, q.quality_score, approvalStatus, 'scheduled', now, now)
    );
    batch.push(
      db.prepare(`INSERT INTO linkedin_quiz_comments (id, post_id, comment_content, scheduled_at, status) VALUES (?,?,?,?,?)`)
        .bind(commentId, postId, q.answer_comment, commentScheduled, 'pending')
    );
  }
  // D1 batch (max 100 statements per batch)
  await db.batch(batch);
}

// ─── Post approval / rejection ───

export async function approvePost(db, env, postId) {
  const p = await db.prepare('SELECT * FROM linkedin_quiz_posts WHERE id = ?').bind(postId).first();
  if (!p) throw new HttpError(404, 'Quiz post not found.');
  if (p.approval_status === 'approved') return p;
  const now = nowIso();
  await db.prepare("UPDATE linkedin_quiz_posts SET approval_status = 'approved', updated_at = ? WHERE id = ?").bind(now, postId).run();
  // Create matching work board item in KV for the existing cron to pick up
  await createWorkItem(env, p, now);
  return db.prepare('SELECT * FROM linkedin_quiz_posts WHERE id = ?').bind(postId).first();
}

export async function rejectPost(db, postId, reason) {
  const p = await db.prepare('SELECT * FROM linkedin_quiz_posts WHERE id = ?').bind(postId).first();
  if (!p) throw new HttpError(404, 'Quiz post not found.');
  const now = nowIso();
  await db.prepare("UPDATE linkedin_quiz_posts SET approval_status = 'rejected', publishing_status = 'skipped', updated_at = ? WHERE id = ?").bind(now, postId).run();
  return db.prepare('SELECT * FROM linkedin_quiz_posts WHERE id = ?').bind(postId).first();
}

export async function approveAll(db, env, campaignId) {
  const posts = (await db.prepare("SELECT * FROM linkedin_quiz_posts WHERE campaign_id = ? AND approval_status = 'pending' ORDER BY day_number").bind(campaignId).all()).results;
  const now = nowIso();
  for (const p of posts) {
    await db.prepare("UPDATE linkedin_quiz_posts SET approval_status = 'approved', updated_at = ? WHERE id = ?").bind(now, p.id).run();
    await createWorkItem(env, p, now);
  }
  return { approved: posts.length };
}

// ─── Edit a quiz post before approval ───

export async function updatePost(db, postId, body) {
  const p = await db.prepare('SELECT * FROM linkedin_quiz_posts WHERE id = ?').bind(postId).first();
  if (!p) throw new HttpError(404, 'Quiz post not found.');
  if (p.publishing_status === 'published') throw new HttpError(409, 'Cannot edit a published post.');
  const now = nowIso();
  const fields = ['hook', 'scenario', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'post_content', 'answer_comment', 'hashtags'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(String(body[f]));
    }
  }
  if (!updates.length) return p;
  updates.push('updated_at = ?');
  values.push(now);
  values.push(postId);
  await db.prepare(`UPDATE linkedin_quiz_posts SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  // Update the comment if answer_comment changed
  if (body.answer_comment) {
    await db.prepare('UPDATE linkedin_quiz_comments SET comment_content = ? WHERE post_id = ?').bind(body.answer_comment, postId).run();
  }
  return db.prepare('SELECT * FROM linkedin_quiz_posts WHERE id = ?').bind(postId).first();
}

// ─── Reschedule a post ───

export async function reschedulePost(db, postId, newScheduledAt) {
  const p = await db.prepare('SELECT * FROM linkedin_quiz_posts WHERE id = ?').bind(postId).first();
  if (!p) throw new HttpError(404, 'Quiz post not found.');
  if (p.publishing_status === 'published') throw new HttpError(409, 'Cannot reschedule a published post.');
  const t = Date.parse(newScheduledAt);
  if (!Number.isFinite(t)) throw new HttpError(400, 'Invalid date-time.');
  const now = nowIso();
  const scheduledIso = new Date(t).toISOString();
  await db.prepare('UPDATE linkedin_quiz_posts SET scheduled_at = ?, updated_at = ? WHERE id = ?').bind(scheduledIso, now, postId).run();
  // Update comment schedule too (24h later)
  const campaign = await db.prepare('SELECT comment_delay_hours FROM linkedin_quiz_campaigns WHERE id = ?').bind(p.campaign_id).first();
  const delay = (campaign?.comment_delay_hours || 24) * 60 * 60 * 1000;
  const commentScheduled = new Date(t + delay).toISOString();
  await db.prepare('UPDATE linkedin_quiz_comments SET scheduled_at = ? WHERE post_id = ?').bind(commentScheduled, postId).run();
  return db.prepare('SELECT * FROM linkedin_quiz_posts WHERE id = ?').bind(postId).first();
}

// ─── Create KV work board item (bridges into existing publish cron) ───

async function createWorkItem(env, quizPost, now) {
  if (!env.NTS_KV) return;
  const w = (await env.NTS_KV.get('work', 'json')) || { items: [], topics: [], cycles: 0 };
  // Dedup: don't add if already present
  if (w.items.some(i => i.quizPostId === quizPost.id)) return;
  const item = {
    id: newId('w'),
    agent: 'ops_maya_docs',
    agentName: 'LinkedIn Content Writer',
    channel: 'LinkedIn',
    title: `SQL Quiz Day ${quizPost.day_number}: ${quizPost.topic}`,
    body: quizPost.post_content,
    status: 'ready',   // approved quiz posts go straight to ready
    scheduledFor: quizPost.scheduled_at,
    createdAt: now,
    quizPostId: quizPost.id,
    topic: quizPost.topic,
    by: 'quiz-campaign',
  };
  w.items.push(item);
  // Store the work_item_id back on the quiz post
  if (env.DB) {
    await env.DB.prepare('UPDATE linkedin_quiz_posts SET work_item_id = ? WHERE id = ?').bind(item.id, quizPost.id).run();
  }
  await env.NTS_KV.put('work', JSON.stringify(w));
}

// ─── Sync: after cron publishes a work item, update quiz post status ───

export async function syncPublishStatus(db, env) {
  if (!env.NTS_KV) return { synced: 0 };
  const w = await env.NTS_KV.get('work', 'json');
  if (!w?.items) return { synced: 0 };
  let synced = 0;
  for (const item of w.items) {
    if (!item.quizPostId || !item.postedUrl) continue;
    const p = await db.prepare('SELECT * FROM linkedin_quiz_posts WHERE id = ? AND publishing_status != ?').bind(item.quizPostId, 'published').first();
    if (!p) continue;
    const now = nowIso();
    await db.prepare("UPDATE linkedin_quiz_posts SET publishing_status = 'published', linkedin_post_id = ?, linkedin_post_url = ?, updated_at = ? WHERE id = ?")
      .bind(item.postUrn || null, item.postedUrl, now, item.quizPostId).run();
    // Mark answer comment as action_required (LinkedIn API can't post comments)
    await db.prepare("UPDATE linkedin_quiz_comments SET status = 'action_required' WHERE post_id = ? AND status = 'pending'")
      .bind(item.quizPostId).run();
    synced++;
  }
  return { synced };
}

// ─── Mark comment as manually posted ───

export async function markCommentPosted(db, commentId) {
  const c = await db.prepare('SELECT * FROM linkedin_quiz_comments WHERE id = ?').bind(commentId).first();
  if (!c) throw new HttpError(404, 'Comment not found.');
  const now = nowIso();
  await db.prepare("UPDATE linkedin_quiz_comments SET status = 'published', published_at = ? WHERE id = ?").bind(now, commentId).run();
  return { ok: true };
}

// ─── Campaign analytics summary ───

export async function campaignAnalytics(db, campaignId) {
  const posts = (await db.prepare('SELECT * FROM linkedin_quiz_posts WHERE campaign_id = ? ORDER BY day_number').bind(campaignId).all()).results;
  const published = posts.filter(p => p.publishing_status === 'published');
  const comments = (await db.prepare('SELECT qm.* FROM linkedin_quiz_comments qm JOIN linkedin_quiz_posts qp ON qp.id = qm.post_id WHERE qp.campaign_id = ?').bind(campaignId).all()).results;

  const byDifficulty = {};
  for (const p of posts) {
    if (!byDifficulty[p.difficulty]) byDifficulty[p.difficulty] = { total: 0, published: 0, avgScore: 0, scores: [] };
    byDifficulty[p.difficulty].total++;
    if (p.publishing_status === 'published') byDifficulty[p.difficulty].published++;
    byDifficulty[p.difficulty].scores.push(p.quality_score);
  }
  for (const d of Object.values(byDifficulty)) {
    d.avgScore = d.scores.length ? Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length) : 0;
    delete d.scores;
  }

  return {
    campaignId,
    totalPosts: posts.length,
    published: published.length,
    scheduled: posts.filter(p => p.publishing_status === 'scheduled').length,
    failed: posts.filter(p => p.publishing_status === 'failed').length,
    avgQualityScore: posts.length ? Math.round(posts.reduce((a, p) => a + p.quality_score, 0) / posts.length) : 0,
    commentsPosted: comments.filter(c => c.status === 'published').length,
    commentsPending: comments.filter(c => c.status === 'action_required').length,
    byDifficulty,
    // LinkedIn API doesn't support reading analytics for personal profiles
    engagement: { available: false, reason: 'LinkedIn restricts personal-profile analytics (r_member_social) to approved partners.' },
  };
}

// ─── Initialize default campaign (called once) ───

export async function initDefaultCampaign(db, env) {
  const existing = await db.prepare("SELECT id FROM linkedin_quiz_campaigns WHERE status = 'active' LIMIT 1").first();
  if (existing) return getCampaign(db, existing.id);
  return createCampaign(db, env, {
    name: '30 Days of Practical SQL & Business Analytics Challenges',
    startDate: '2026-11-11',
    mode: 'approval',
  });
}

// ─── DB Resolver: Cloudflare D1 or KV Adapter Fallback ───

export function getDb(env) {
  if (env.DB) return env.DB;
  if (!env.NTS_KV) throw new HttpError(503, 'Storage unavailable.');
  return createKvDb(env.NTS_KV);
}

function createKvDb(kv) {
  let cache = null;
  let batchMode = false;
  const load = async () => {
    if (!cache) {
      cache = (await kv.get('quiz/state', 'json')) || {
        campaigns: [],
        posts: [],
        comments: [],
        analytics: [],
      };
    }
    return cache;
  };
  const save = async () => {
    if (batchMode) return;
    if (cache) await kv.put('quiz/state', JSON.stringify(cache));
  };

  return {
    prepare(sql) {
      return {
        _sql: sql,
        _params: [],
        bind(...args) {
          this._params = args;
          return this;
        },
        async run() {
          const s = sql.trim();
          const t = await load();
          if (s.startsWith('INSERT INTO linkedin_quiz_campaigns')) {
            const [id, name, start_date, end_date, timezone, publishing_time, comment_delay_hours, status, mode, created_at] = this._params;
            t.campaigns.push({ id, name, start_date, end_date, timezone, publishing_time, comment_delay_hours, status, mode, created_at });
            await save();
          } else if (s.startsWith('INSERT INTO linkedin_quiz_posts')) {
            const [id, campaign_id, day_number, scheduled_at, topic, difficulty, hook, scenario, question, option_a, option_b, option_c, option_d, correct_answer, post_content, answer_comment, hashtags, quality_score, approval_status, publishing_status, created_at, updated_at] = this._params;
            t.posts.push({ id, campaign_id, day_number, scheduled_at, topic, difficulty, hook, scenario, question, option_a, option_b, option_c, option_d, correct_answer, post_content, answer_comment, hashtags, quality_score, approval_status, publishing_status, created_at, updated_at });
            await save();
          } else if (s.startsWith('INSERT INTO linkedin_quiz_comments')) {
            const [id, post_id, comment_content, scheduled_at, status] = this._params;
            t.comments.push({ id, post_id, comment_content, scheduled_at, status });
            await save();
          } else if (s.startsWith('UPDATE linkedin_quiz_posts')) {
            const id = this._params.at(-1);
            const p = t.posts.find((x) => x.id === id);
            if (p) {
              if (s.includes("approval_status = 'approved'")) p.approval_status = 'approved';
              if (s.includes("approval_status = 'rejected'")) {
                p.approval_status = 'rejected';
                p.publishing_status = 'skipped';
              }
              if (s.includes("publishing_status = 'published'")) {
                p.publishing_status = 'published';
                p.linkedin_post_id = this._params[0];
                p.linkedin_post_url = this._params[1];
              }
              if (s.includes('work_item_id = ?')) p.work_item_id = this._params[0];
              if (s.includes('scheduled_at = ?')) p.scheduled_at = this._params[0];
              if (s.includes('post_content = ?')) {
                const fields = ['hook', 'scenario', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'post_content', 'answer_comment', 'hashtags'];
                for (let k = 0; k < this._params.length - 2; k++) {
                  const val = this._params[k];
                  for (const f of fields) {
                    if (s.includes(`${f} = ?`) && this._params.indexOf(val) === k) {
                      p[f] = val;
                    }
                  }
                }
              }
              p.updated_at = new Date().toISOString();
              await save();
            }
          } else if (s.startsWith('UPDATE linkedin_quiz_comments')) {
            if (s.includes("status = 'action_required'")) {
              const postId = this._params[0];
              for (const c of t.comments) {
                if (c.post_id === postId && c.status === 'pending') c.status = 'action_required';
              }
              await save();
            } else if (s.includes("status = 'published'")) {
              const id = this._params.at(-1);
              const c = t.comments.find((x) => x.id === id);
              if (c) {
                c.status = 'published';
                c.published_at = this._params[0];
                await save();
              }
            } else if (s.includes('comment_content = ?')) {
              const postId = this._params[1];
              const c = t.comments.find((x) => x.post_id === postId);
              if (c) {
                c.comment_content = this._params[0];
                await save();
              }
            }
          }
          return { success: true };
        },
        async first() {
          const s = sql.trim();
          const t = await load();
          if (s.includes('FROM linkedin_quiz_campaigns WHERE id = ?')) {
            return t.campaigns.find((c) => c.id === this._params[0]) || null;
          }
          if (s.includes("FROM linkedin_quiz_campaigns WHERE status = 'active'")) {
            return t.campaigns.find((c) => c.status === 'active') || null;
          }
          if (s.includes('FROM linkedin_quiz_posts WHERE id = ?')) {
            return t.posts.find((p) => p.id === this._params[0]) || null;
          }
          if (s.includes('FROM linkedin_quiz_comments WHERE id = ?')) {
            return t.comments.find((c) => c.id === this._params[0]) || null;
          }
          if (s.includes('comment_delay_hours FROM linkedin_quiz_campaigns')) {
            const c = t.campaigns.find((x) => x.id === this._params[0]);
            return c ? { comment_delay_hours: c.comment_delay_hours } : null;
          }
          return null;
        },
        async all() {
          const s = sql.trim();
          const t = await load();
          if (s.includes('FROM linkedin_quiz_campaigns')) {
            return { results: [...t.campaigns].sort((a, b) => b.created_at.localeCompare(a.created_at)) };
          }
          if (s.includes('FROM linkedin_quiz_posts WHERE campaign_id = ?')) {
            return { results: t.posts.filter((p) => p.campaign_id === this._params[0]).sort((a, b) => a.day_number - b.day_number) };
          }
          if (s.includes('FROM linkedin_quiz_comments')) {
            return { results: [...t.comments] };
          }
          return { results: [] };
        },
      };
    },
    async batch(stmts) {
      batchMode = true;
      try {
        for (const st of stmts) await st.run();
      } finally {
        batchMode = false;
      }
      if (cache) await kv.put('quiz/state', JSON.stringify(cache));
    },
  };
}
