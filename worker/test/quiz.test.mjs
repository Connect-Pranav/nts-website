import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUIZ_LIBRARY } from '../quiz-library.mjs';
import * as quiz from '../quiz-campaign.mjs';

function makeMockDB() {
  const tables = {
    linkedin_quiz_campaigns: [],
    linkedin_quiz_posts: [],
    linkedin_quiz_comments: [],
    linkedin_quiz_analytics: [],
  };

  return {
    tables,
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
          if (s.startsWith('INSERT INTO linkedin_quiz_campaigns')) {
            const [id, name, start_date, end_date, timezone, publishing_time, comment_delay_hours, status, mode, created_at] = this._params;
            tables.linkedin_quiz_campaigns.push({ id, name, start_date, end_date, timezone, publishing_time, comment_delay_hours, status, mode, created_at });
            return { success: true };
          }
          if (s.startsWith('INSERT INTO linkedin_quiz_posts')) {
            const [id, campaign_id, day_number, scheduled_at, topic, difficulty, hook, scenario, question, option_a, option_b, option_c, option_d, correct_answer, post_content, answer_comment, hashtags, quality_score, approval_status, publishing_status, created_at, updated_at] = this._params;
            tables.linkedin_quiz_posts.push({ id, campaign_id, day_number, scheduled_at, topic, difficulty, hook, scenario, question, option_a, option_b, option_c, option_d, correct_answer, post_content, answer_comment, hashtags, quality_score, approval_status, publishing_status, created_at, updated_at });
            return { success: true };
          }
          if (s.startsWith('INSERT INTO linkedin_quiz_comments')) {
            const [id, post_id, comment_content, scheduled_at, status] = this._params;
            tables.linkedin_quiz_comments.push({ id, post_id, comment_content, scheduled_at, status });
            return { success: true };
          }
          if (s.startsWith('UPDATE linkedin_quiz_posts')) {
            const id = this._params.at(-1);
            const p = tables.linkedin_quiz_posts.find(x => x.id === id);
            if (p) {
              if (s.includes("approval_status = 'approved'")) p.approval_status = 'approved';
              if (s.includes("approval_status = 'rejected'")) p.approval_status = 'rejected';
              if (s.includes("publishing_status = 'published'")) {
                p.publishing_status = 'published';
                p.linkedin_post_url = this._params[1];
              }
              if (s.includes("work_item_id = ?")) p.work_item_id = this._params[0];
            }
            return { success: true };
          }
          if (s.startsWith('UPDATE linkedin_quiz_comments')) {
            if (s.includes("status = 'action_required'")) {
              const postId = this._params[0];
              for (const c of tables.linkedin_quiz_comments) {
                if (c.post_id === postId && c.status === 'pending') c.status = 'action_required';
              }
            }
            if (s.includes("status = 'published'")) {
              const id = this._params.at(-1);
              const c = tables.linkedin_quiz_comments.find(x => x.id === id);
              if (c) c.status = 'published';
            }
            return { success: true };
          }
          return { success: true };
        },
        async first() {
          const s = sql.trim();
          if (s.includes('FROM linkedin_quiz_campaigns WHERE id = ?')) {
            return tables.linkedin_quiz_campaigns.find(c => c.id === this._params[0]) || null;
          }
          if (s.includes("FROM linkedin_quiz_campaigns WHERE status = 'active'")) {
            return tables.linkedin_quiz_campaigns.find(c => c.status === 'active') || null;
          }
          if (s.includes('FROM linkedin_quiz_posts WHERE id = ?')) {
            return tables.linkedin_quiz_posts.find(p => p.id === this._params[0]) || null;
          }
          if (s.includes('FROM linkedin_quiz_comments WHERE id = ?')) {
            return tables.linkedin_quiz_comments.find(c => c.id === this._params[0]) || null;
          }
          return null;
        },
        async all() {
          const s = sql.trim();
          if (s.includes('FROM linkedin_quiz_campaigns')) {
            return { results: [...tables.linkedin_quiz_campaigns] };
          }
          if (s.includes('FROM linkedin_quiz_posts WHERE campaign_id = ?')) {
            return { results: tables.linkedin_quiz_posts.filter(p => p.campaign_id === this._params[0]) };
          }
          if (s.includes('FROM linkedin_quiz_comments')) {
            return { results: [...tables.linkedin_quiz_comments] };
          }
          return { results: [] };
        }
      };
    },
    async batch(stmts) {
      for (const st of stmts) {
        await st.run();
      }
    }
  };
}

function makeKV() {
  const m = new Map();
  return {
    m,
    get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    put: async (k, v) => void m.set(k, v),
  };
}

test('Quiz Library: Contains exactly 30 validated curriculum scenarios with >=90 score', () => {
  assert.equal(QUIZ_LIBRARY.length, 30);
  for (let i = 0; i < 30; i++) {
    const q = QUIZ_LIBRARY[i];
    assert.equal(q.day, i + 1);
    assert.ok(q.topic.length > 5, `Day ${i + 1} topic missing`);
    assert.ok(q.quality_score >= 90, `Day ${i + 1} quality score too low: ${q.quality_score}`);
    assert.ok(['A', 'B', 'C', 'D'].includes(q.correct_answer), `Day ${i + 1} invalid correct_answer`);
    assert.ok(q.post_content.includes("NIKHILs TECH Studio"), `Day ${i + 1} missing brand signature`);
    assert.ok(q.post_content.includes("A)"), `Day ${i + 1} missing option A`);
    assert.ok(q.answer_comment.includes(`Option ${q.correct_answer}`), `Day ${i + 1} answer comment mismatch`);
  }
});

test('Quiz Campaign: createCampaign initializes 30 posts, 30 comments, and schedules at 08:00 UTC', async () => {
  const db = makeMockDB();
  const kv = makeKV();
  const env = { DB: db, NTS_KV: kv };

  const res = await quiz.createCampaign(db, env, {
    name: '30 Days of SQL & Analytics',
    startDate: '2026-11-11',
    mode: 'approval'
  });

  assert.ok(res.campaign.id.startsWith('qc_'));
  assert.equal(res.posts.length, 30);
  assert.equal(res.comments.length, 30);
  assert.equal(res.stats.total, 30);
  assert.equal(res.stats.pending, 30);
  assert.equal(res.stats.approved, 0);

  // Check Day 1 scheduling: 01:30 PM IST = 08:00 UTC
  const d1 = res.posts[0];
  assert.equal(d1.day_number, 1);
  assert.equal(d1.scheduled_at, '2026-11-11T08:00:00.000Z');
  assert.equal(d1.approval_status, 'pending');

  // Check comment schedule is exactly 24 hours later
  const c1 = res.comments[0];
  assert.equal(c1.scheduled_at, '2026-11-12T08:00:00.000Z');
});

test('Quiz Campaign: approvePost approves post and bridges into KV work board for cron', async () => {
  const db = makeMockDB();
  const kv = makeKV();
  const env = { DB: db, NTS_KV: kv };

  const res = await quiz.createCampaign(db, env, {
    name: '30 Days of SQL',
    startDate: '2026-11-11',
  });

  const p1 = res.posts[0];
  const approved = await quiz.approvePost(db, env, p1.id);
  assert.equal(approved.approval_status, 'approved');

  // Check KV work board
  const w = await kv.get('work', 'json');
  assert.ok(w);
  assert.equal(w.items.length, 1);
  assert.equal(w.items[0].quizPostId, p1.id);
  assert.equal(w.items[0].channel, 'LinkedIn');
  assert.equal(w.items[0].status, 'ready');
  assert.equal(w.items[0].scheduledFor, '2026-11-11T08:00:00.000Z');
});

test('Quiz Campaign: syncPublishStatus propagates published URL and sets comment to action_required', async () => {
  const db = makeMockDB();
  const kv = makeKV();
  const env = { DB: db, NTS_KV: kv };

  const res = await quiz.createCampaign(db, env, {
    name: '30 Days of SQL',
    startDate: '2026-11-11',
  });

  const p1 = res.posts[0];
  await quiz.approvePost(db, env, p1.id);

  // Simulate cron publishing the work item to LinkedIn
  const w = await kv.get('work', 'json');
  w.items[0].postedUrl = 'https://www.linkedin.com/feed/update/urn:li:share:123456789/';
  w.items[0].postUrn = 'urn:li:share:123456789';
  await kv.put('work', JSON.stringify(w));

  // Sync
  const syncRes = await quiz.syncPublishStatus(db, env);
  assert.equal(syncRes.synced, 1);

  const updatedP1 = await db.prepare('SELECT * FROM linkedin_quiz_posts WHERE id = ?').bind(p1.id).first();
  assert.equal(updatedP1.publishing_status, 'published');
  assert.equal(updatedP1.linkedin_post_url, 'https://www.linkedin.com/feed/update/urn:li:share:123456789/');

  // The comment must now be flagged as action_required for manual posting
  const c1 = db.tables.linkedin_quiz_comments.find(c => c.post_id === p1.id);
  assert.equal(c1.status, 'action_required');

  // Mark comment as manually posted
  const cmDone = await quiz.markCommentPosted(db, c1.id);
  assert.equal(cmDone.ok, true);
  assert.equal(c1.status, 'published');
});
