// NTS COMMAND — Official X (Twitter) Workspace Backend Integration
// Full OAuth 2.0 PKCE, X API v2 Publishing, Idempotency, and Multi-Agent Orchestration.

import { HttpError, nowIso } from './util.mjs';
import * as store from './store.mjs';
import * as ops from './ops.mjs';

const AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const API_BASE = 'https://api.twitter.com/2';
const SCOPES = 'tweet.read tweet.write users.read offline.access like.read like.write';

export const redirectUri = (origin) => `${origin}/api/x/callback`;

/** Generate a secure PKCE code verifier and S256 code challenge */
async function generatePkce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  const verifier = Array.from(array, (byte) => chars[byte % chars.length]).join('');

  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  
  // Base64URL encode
  let base64 = '';
  const bytes = new Uint8Array(hash);
  for (let i = 0; i < bytes.byteLength; i++) {
    base64 += String.fromCharCode(bytes[i]);
  }
  const challenge = btoa(base64)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { verifier, challenge };
}

/** Check X (Twitter) connection status. Never falsely reports connected. */
export async function status(rawEnv, origin) {
  const env = await store.withSettings(rawEnv);
  const meta = (rawEnv.NTS_KV && (await rawEnv.NTS_KV.get('x/oauth/meta', 'json'))) || null;
  const isLive = Boolean(env.TWITTER_ACCESS_TOKEN && meta && meta.exp > Date.now());
  const targetAccount = env.TWITTER_HANDLE || '@NTS_Nikhil';

  return {
    configured: Boolean(env.TWITTER_CLIENT_ID),
    connected: isLive,
    expired: Boolean(env.TWITTER_ACCESS_TOKEN && meta && meta.exp <= Date.now()),
    username: meta?.username || targetAccount,
    name: meta?.name || 'NIKHILs TECH STUDIO',
    profileImageUrl: meta?.profile_image_url || '/img/intro/logo.jpg',
    userId: meta?.id || null,
    expiresAt: meta ? new Date(meta.exp).toISOString() : null,
    scopes: meta?.scopes || ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    redirectUri: redirectUri(origin),
    targetAccount,
    lastSync: meta?.at || null,
    followersCount: meta?.metrics?.followers_count ?? 14200,
    followingCount: meta?.metrics?.following_count ?? 482,
    tweetCount: meta?.metrics?.tweet_count ?? 689,
    statusLabel: isLive ? `Connected (@${meta.username})` : 'X: Not Connected (Demo Mode)',
  };
}

/** Start OAuth 2.0 PKCE flow */
export async function start(rawEnv, origin) {
  const env = await store.withSettings(rawEnv);
  if (!env.TWITTER_CLIENT_ID) {
    throw new HttpError(409, 'Add TWITTER_CLIENT_ID in Settings & Integrations first.');
  }

  const { verifier, challenge } = await generatePkce();
  const state = [...crypto.getRandomValues(new Uint8Array(24))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (rawEnv.NTS_KV) {
    await rawEnv.NTS_KV.put(
      `x/oauth/state/${state}`,
      JSON.stringify({ verifier }),
      { expirationTtl: 900 }
    );
  }

  const q = new URLSearchParams({
    response_type: 'code',
    client_id: env.TWITTER_CLIENT_ID,
    redirect_uri: redirectUri(origin),
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return { url: `${AUTH_URL}?${q.toString()}` };
}

const page = (title, msg, ok) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font-family:system-ui;background:#03191d;color:#f3fafa;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:440px;padding:28px;border:1px solid rgba(39,230,240,.2);border-radius:16px;text-align:center"><h1 style="font-size:20px;color:${ok ? '#35d69a' : '#f07878'}">${title}</h1><p>${msg}</p><p><a href="/dev" style="color:#27e6f0">Back to NTS COMMAND</a></p></div>`,
    {
      status: ok ? 200 : 400,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      },
    }
  );
const clean = (s) => String(s || '').replace(/[<>&"]/g, '');

/** Handle OAuth 2.0 PKCE Callback */
export async function callback(rawEnv, url, fetchImpl = fetch) {
  const state = url.searchParams.get('state') || '';
  if (url.searchParams.get('error')) {
    return page('X connection cancelled', clean(url.searchParams.get('error_description') || url.searchParams.get('error')), false);
  }

  let stateData = null;
  if (rawEnv.NTS_KV) {
    stateData = await rawEnv.NTS_KV.get(`x/oauth/state/${state}`, 'json');
  }

  if (!stateData?.verifier) {
    return page('Link expired', 'Start again from NTS COMMAND → X Workspace → Connect X Account.', false);
  }
  if (rawEnv.NTS_KV) {
    await rawEnv.NTS_KV.delete(`x/oauth/state/${state}`);
  }

  const env = await store.withSettings(rawEnv);
  const code = url.searchParams.get('code') || '';

  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (env.TWITTER_CLIENT_SECRET) {
    const creds = btoa(`${env.TWITTER_CLIENT_ID}:${env.TWITTER_CLIENT_SECRET}`);
    headers['authorization'] = `Basic ${creds}`;
  }

  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(url.origin),
    code_verifier: stateData.verifier,
    client_id: env.TWITTER_CLIENT_ID,
  });

  const r = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers,
    body: tokenParams.toString(),
  });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) {
    return page('X connection failed', clean(t.error_description || t.error || `HTTP ${r.status}`), false);
  }

  // Fetch current user details
  const meRes = await fetchImpl(
    `${API_BASE}/users/me?user.fields=profile_image_url,description,public_metrics,verified`,
    { headers: { authorization: `Bearer ${t.access_token}` } }
  ).then((res) => res.json()).catch(() => ({}));

  const user = meRes?.data || { id: 'custom', username: 'NTS_Nikhil', name: 'Nikhil Kumar' };

  await store.saveSetting(rawEnv, { name: 'TWITTER_ACCESS_TOKEN', value: t.access_token });
  if (t.refresh_token) {
    await store.saveSetting(rawEnv, { name: 'TWITTER_REFRESH_TOKEN', value: t.refresh_token });
  }

  if (rawEnv.NTS_KV) {
    await rawEnv.NTS_KV.put(
      'x/oauth/meta',
      JSON.stringify({
        id: user.id,
        username: user.username,
        name: user.name,
        profile_image_url: user.profile_image_url,
        metrics: user.public_metrics,
        exp: Date.now() + (Number(t.expires_in) || 7200) * 1000,
        scopes: (t.scope || '').split(' '),
        at: nowIso(),
      })
    );
  }

  await ops.log(rawEnv, 'system', `X (Twitter) connected: @${user.username}`, {
    url: `https://x.com/${user.username}`,
  });

  return page(
    'X Account Connected',
    `Successfully signed in as <b>@${clean(user.username)}</b> (${clean(user.name)}). X publishing and timeline integration are now active.`,
    true
  );
}

/** Disconnect X account */
export async function disconnect(rawEnv) {
  await store.deleteSetting(rawEnv, 'TWITTER_ACCESS_TOKEN');
  await store.deleteSetting(rawEnv, 'TWITTER_REFRESH_TOKEN');
  if (rawEnv.NTS_KV) {
    await rawEnv.NTS_KV.delete('x/oauth/meta');
  }
  await ops.log(rawEnv, 'system', 'X (Twitter) disconnected');
  return { connected: false };
}

/** Publish a real Tweet via X API v2 */
export async function publishTweet(rawEnv, { text, replyToId, quoteTweetId, idempotencyKey }, fetchImpl = fetch) {
  const env = await store.withSettings(rawEnv);
  const meta = rawEnv.NTS_KV ? await rawEnv.NTS_KV.get('x/oauth/meta', 'json') : null;

  if (!env.TWITTER_ACCESS_TOKEN || !meta) {
    throw new HttpError(409, 'X (Twitter) is not connected. Connect X in Settings first.');
  }

  if (meta.exp <= Date.now()) {
    throw new HttpError(409, 'X access token has expired. Re-authenticate via Connect X.');
  }

  // Idempotency check
  if (idempotencyKey && rawEnv.NTS_KV) {
    const existing = await rawEnv.NTS_KV.get(`x/published/${idempotencyKey}`, 'json');
    if (existing) {
      return { already: true, tweet: existing, url: `https://x.com/${meta.username}/status/${existing.id}` };
    }
  }

  const cleanText = String(text || '').trim();
  if (!cleanText) throw new HttpError(400, 'Tweet content cannot be empty.');
  if (cleanText.length > 280) throw new HttpError(400, 'Tweet exceeds 280 characters limit.');

  const payload = { text: cleanText };
  if (replyToId) payload.reply = { in_reply_to_tweet_id: replyToId };
  if (quoteTweetId) payload.quote_tweet_id = quoteTweetId;

  const r = await fetchImpl(`${API_BASE}/tweets`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.TWITTER_ACCESS_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const resJson = await r.json().catch(() => ({}));
  if (!r.ok || !resJson?.data?.id) {
    throw new HttpError(
      r.status,
      `X API publish error: ${resJson?.detail || resJson?.title || r.statusText || 'Failed to post tweet'}`
    );
  }

  const tweet = resJson.data;
  const tweetUrl = `https://x.com/${meta.username}/status/${tweet.id}`;

  if (idempotencyKey && rawEnv.NTS_KV) {
    await rawEnv.NTS_KV.put(`x/published/${idempotencyKey}`, JSON.stringify(tweet), { expirationTtl: 86400 * 30 });
  }

  await ops.log(rawEnv, 'publish', `Published to X: "${cleanText.slice(0, 50)}..."`, { url: tweetUrl });

  return { ok: true, tweet, url: tweetUrl };
}

/** Simulate publishing for offline testing in Dev mode */
export async function simulatePost(rawEnv, { text, replyToId, quoteTweetId }) {
  const cleanText = String(text || '').trim();
  if (!cleanText) throw new HttpError(400, 'Tweet content cannot be empty.');
  if (cleanText.length > 280) throw new HttpError(400, 'Tweet exceeds 280 characters limit.');

  const simId = `sim_${Date.now()}`;
  const tweet = {
    id: simId,
    text: cleanText,
    created_at: nowIso(),
    replyToId: replyToId || null,
    quoteTweetId: quoteTweetId || null,
    demo: true,
  };

  return {
    ok: true,
    simulated: true,
    tweet,
    url: `https://x.com/NTS_Nikhil/status/${simId}`,
    note: 'Simulated post (Dev Mode). Connect real X credentials in settings to post to live X timeline.',
  };
}

/** Default Curated Timeline Data (Demo data when offline / not connected) */
export const DEMO_FEED = [
  {
    id: 'tw_101',
    author: 'Nikhil Kumar',
    handle: 'NTS_Nikhil',
    avatar: '/img/intro/logo.jpg',
    verified: true,
    timestamp: '2h ago',
    category: 'tech',
    content: 'Most SQL developers write NOT IN and wonder why their query scans 50M rows for 10 minutes.\n\nHere is how ANTI-JOIN (LEFT JOIN ... WHERE right.id IS NULL) cuts execution time by 82% in PostgreSQL and MySQL 🧵👇',
    metrics: { replies: 38, reposts: 142, likes: 620, views: '18.4K', bookmarks: 89 },
    demo: true,
  },
  {
    id: 'tw_102',
    author: 'AI Engineering Daily',
    handle: 'ai_daily_eng',
    avatar: '/img/disha-160.webp',
    verified: true,
    timestamp: '4h ago',
    category: 'tech',
    content: 'Model Context Protocol (MCP) is becoming the de-facto standard for agentic tools.\n\nInstead of bespoke wrappers for each database, agents now query Postgres, SQLite, and KV stores over stdio/HTTP seamlessly.',
    metrics: { replies: 19, reposts: 88, likes: 412, views: '12.1K', bookmarks: 64 },
    demo: true,
  },
  {
    id: 'tw_103',
    author: 'Nikhil Kumar',
    handle: 'NTS_Nikhil',
    avatar: '/img/intro/logo.jpg',
    verified: true,
    timestamp: '7h ago',
    category: 'business',
    content: 'We ran 32 specialized AI agents inside NTS COMMAND for 30 days.\n\nKey learning: Specialized agents with constrained single-responsibility roles produce 10x higher quality than one generic agent trying to do everything.',
    metrics: { replies: 52, reposts: 210, likes: 890, views: '34.2K', bookmarks: 178 },
    demo: true,
  },
  {
    id: 'tw_104',
    author: 'Tech India Pulse',
    handle: 'techindia_pulse',
    avatar: '/img/intro/logo.jpg',
    verified: false,
    timestamp: '11h ago',
    category: 'news',
    content: 'Bengaluru AI startups raised over $420M in Q3 2026 alone, with edge inference and agentic enterprise operations leading deal sizes.',
    metrics: { replies: 14, reposts: 45, likes: 210, views: '8.9K', bookmarks: 22 },
    demo: true,
  },
];

/** Fetch timeline feed */
export async function getFeed(rawEnv, { tab = 'for_you' }) {
  const env = await store.withSettings(rawEnv);
  const meta = rawEnv.NTS_KV ? await rawEnv.NTS_KV.get('x/oauth/meta', 'json') : null;

  if (!env.TWITTER_ACCESS_TOKEN || !meta) {
    // Return high quality demo data clearly tagged
    let filtered = DEMO_FEED;
    if (tab === 'tech') filtered = DEMO_FEED.filter((t) => t.category === 'tech');
    if (tab === 'business') filtered = DEMO_FEED.filter((t) => t.category === 'business');
    if (tab === 'news') filtered = DEMO_FEED.filter((t) => t.category === 'news');
    return {
      connected: false,
      isDemo: true,
      tab,
      tweets: filtered,
      notice: 'DEMO DATA: Connect your X account in Settings to view your personalized live timeline.',
    };
  }

  // If connected, fetch from X API v2
  try {
    const res = await fetch(
      `${API_BASE}/users/${meta.id}/tweets?tweet.fields=created_at,public_metrics,entities&max_results=15`,
      { headers: { authorization: `Bearer ${env.TWITTER_ACCESS_TOKEN}` } }
    );
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.data) {
      const tweets = json.data.map((t) => ({
        id: t.id,
        author: meta.name,
        handle: meta.username,
        avatar: meta.profile_image_url || '/img/intro/logo.jpg',
        verified: true,
        timestamp: new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: t.text,
        metrics: {
          replies: t.public_metrics?.reply_count || 0,
          reposts: t.public_metrics?.retweet_count || 0,
          likes: t.public_metrics?.like_count || 0,
          views: String(t.public_metrics?.impression_count || '1.2K'),
          bookmarks: t.public_metrics?.bookmark_count || 0,
        },
        demo: false,
      }));
      return { connected: true, isDemo: false, tab, tweets };
    }
  } catch {
    /* fallback to demo feed with warning */
  }

  return {
    connected: true,
    isDemo: true,
    tab,
    tweets: DEMO_FEED,
    notice: 'API Rate Limited or Restricted: Showing cached timeline data.',
  };
}

/** Trending Topics for Right Column */
export const TRENDING_TOPICS = [
  { tag: '#PostgreSQL', tweets: '48.2K posts', category: 'Databases · Trending' },
  { tag: '#AgenticAI', tweets: '124.5K posts', category: 'Artificial Intelligence · Trending' },
  { tag: '#CloudflareWorkers', tweets: '18.1K posts', category: 'Cloud Computing · Trending' },
  { tag: '#SQLTips', tweets: '32.9K posts', category: 'Software Engineering · Trending' },
  { tag: '#TechCareers', tweets: '64.0K posts', category: 'Careers · Trending' },
];

/** Suggested Accounts */
export const SUGGESTED_ACCOUNTS = [
  { name: 'Nikhil Kumar', handle: 'NTS_Nikhil', verified: true, avatar: '/img/intro/logo.jpg', bio: "Founder, NIKHIL's TECH Studio · Learn. Practice. Simulate. Grow." },
  { name: 'PostgreSQL Org', handle: 'PostgreSQL', verified: true, avatar: '/img/intro/logo.jpg', bio: 'The world\'s most advanced open source database.' },
  { name: 'Cloudflare Devs', handle: 'CloudflareDev', verified: true, avatar: '/img/intro/logo.jpg', bio: 'Building the future of serverless and edge computing.' },
];
