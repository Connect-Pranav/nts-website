import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.mjs';
import { parseCount, summarize } from '../analytics.mjs';
import { score } from '../signals.mjs';

function makeKV() {
  const m = new Map();
  return { m, get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k) };
}
const TOKEN = 'Nts@2026';
const base = (extra = {}) => ({ DEV_TOKEN: TOKEN, GEMINI_API_KEY: 'AQ.TESTKEY1234567890abcdefghijklmnop', NTS_KV: makeKV(), ASSETS: { fetch: () => new Response('a') }, ...extra });
const req = (path, method = 'GET', b) => new Request(`https://nts.test${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'cf-connecting-ip': '8.8.8.8' }, body: b ? JSON.stringify(b) : undefined });

test('helpers: counts, lead scoring, summary', () => {
  assert.equal(parseCount('1.2K subscribers'), 1200);
  assert.equal(parseCount('15 videos'), 15);
  assert.ok(score('How do I prepare for a SQL interview?', 'beginner here') >= 8);
  assert.equal(score('We are hiring SQL devs', 'apply here'), 0);
  const s = summarize({ fetchedAt: new Date().toISOString(), channel: {}, videos: [{ id: 'a', views: 100, likes: 10, comments: null, durationSec: null, publishedAt: new Date().toISOString() }, { id: 'b', views: 50, likes: 5, comments: null, durationSec: null, publishedAt: '2020-01-01T00:00:00Z' }] });
  assert.equal(s.avgViewsPerVideo, 75);
  assert.equal(s.likeRate, 0.1);
  assert.equal(s.commentRate, null);
  assert.deepEqual(s.topVideos, ['a', 'b']);
});

test('analytics without a YouTube key: channel page + RSS; SOMA insights from those numbers', async () => {
  const orig = globalThis.fetch;
  let somaPrompt = '';
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.startsWith('https://www.youtube.com/%40')) return new Response('<html>"externalId":"UC1234567890123456789012" ... "subscriberCountText":{"simpleText":"1.5K subscribers"} "videosCountText":{"runs":[{"text":"42"}</html>');
    if (u.includes('feeds/videos.xml')) return new Response('<feed><title>NIKHILs TECH STUDIO</title><entry><yt:videoId>abcdefghijk</yt:videoId><title>SQL Join Trap</title><published>2026-11-01T00:00:00Z</published><media:starRating count="12" average="5"/><media:statistics views="340"/></entry></feed>');
    if (u.includes('generativelanguage')) {
      somaPrompt = JSON.parse(init.body).contents[0].parts.at(-1).text;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ headline: 'Join Trap leads', working: ['340 views'], notWorking: ['x'], nextActions: [{ action: 'a', why: 'b', measureWith: 'c' }] }) }] } }] }));
    }
    throw new Error('unexpected ' + u);
  };
  try {
    const env = base();
    let d = await (await site.fetch(req('/api/dev/analytics'), env, {})).json();
    assert.equal(d.connected, true);
    assert.equal(d.channel.subscribers, 1500);
    assert.equal(d.channel.videoCount, 42);
    assert.equal(d.videos[0].views, 340);
    assert.equal(d.videos[0].likes, 12);
    assert.equal(d.exact, false);
    d = await (await site.fetch(req('/api/dev/analytics/insights', 'POST', {}), env, {})).json();
    assert.equal(d.insights.headline, 'Join Trap leads');
    assert.match(somaPrompt, /SQL Join Trap/);
  } finally {
    globalThis.fetch = orig;
  }
});

test('signals: scan keeps going when Reddit blocks; fresh lead reaches the next cycle', async () => {
  const orig = globalThis.fetch;
  let cyclePrompt = '';
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (u.includes('hn.algolia.com')) return new Response(JSON.stringify({ hits: u.includes('learn%20sql') ? [{ objectID: '42', title: 'Ask HN: How do I learn SQL for a data analyst interview?', created_at: new Date().toISOString() }] : [] }));
    if (u.includes('reddit.com')) return new Response('blocked', { status: 403 });
    if (u.includes('mastodon.social')) return new Response('<rss><channel></channel></rss>');
    if (u.includes('generativelanguage')) {
      cyclePrompt = JSON.parse(init.body).contents[0].parts.at(-1).text;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ topic: 't', items: [{ agent: 'ops_soma_analytics', channel: 'All', title: 'Reply', body: 'Start with SELECT...', needs_approval: true, lead_id: 'hn_42' }] }) }] } }] }));
    }
    throw new Error('unexpected ' + u);
  };
  try {
    const env = base();
    const o = await (await site.fetch(req('/api/dev/signals/scan', 'POST', {}), env, {})).json();
    const by = Object.fromEntries(o.sources.map((s) => [s.key, s]));
    assert.equal(by.hn.status, 'ok');
    assert.equal(by.reddit.status, 'error');
    assert.equal(by.instagram.status, 'off');
    assert.equal(o.leads[0].id, 'hn_42');
    const w = await (await site.fetch(req('/api/dev/work/cycle', 'POST', {}), env, {})).json();
    assert.match(cyclePrompt, /FRESH LEADS[\s\S]*hn_42/);
    assert.equal(w.items[0].url, 'https://news.ycombinator.com/item?id=42');
    const o2 = await (await site.fetch(req('/api/dev/signals'), env, {})).json();
    assert.equal(o2.leads[0].state, 'drafted');
  } finally {
    globalThis.fetch = orig;
  }
});
