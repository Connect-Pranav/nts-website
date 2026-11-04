// LinkedIn — official OAuth 2.0 + Posts API.
// Products needed on the LinkedIn developer app: "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn".
// Scopes: openid profile w_member_social.
// Reality check (shown in the admin): reading a *personal profile's* posts and their engagement needs
// r_member_social, which LinkedIn restricts to approved partners. So reads are reported as unavailable.
import { HttpError } from '../util.mjs';
import { apiJson, newState, consumeState, redirectUri, saveTokens, tokens, markError } from './common.mjs';

const AUTH = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO = 'https://api.linkedin.com/v2/userinfo';
const POSTS = 'https://api.linkedin.com/rest/posts';
export const SCOPES = ['openid', 'profile', 'w_member_social'];

export const appConfigured = (env) => Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET);

export function capabilities(conn) {
  const scopes = conn?.scopes ?? [];
  const connected = conn?.status === 'connected';
  return {
    readPosts: { available: false, reason: 'LinkedIn restricts reading personal-profile posts (r_member_social) to approved partners. Posts are linked, not mirrored.' },
    analytics: { available: false, reason: 'Personal-profile analytics are not offered through the LinkedIn API.' },
    publish: connected && scopes.includes('w_member_social') ? { available: true } : { available: false, reason: connected ? 'w_member_social was not granted. Reconnect and allow posting.' : 'Connect LinkedIn first.' },
    schedule: { available: true, note: 'Scheduled on this site; LinkedIn has no scheduling API for members. Jobs are posted at the scheduled time.' },
  };
}

export async function startConnect(env, db, userId) {
  if (!appConfigured(env)) throw new HttpError(409, 'Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET first (see docs/OAUTH_SETUP.md).');
  const state = await newState(db, 'linkedin', userId);
  const u = new URL(AUTH);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', env.LINKEDIN_CLIENT_ID);
  u.searchParams.set('redirect_uri', redirectUri(env, 'linkedin'));
  u.searchParams.set('scope', SCOPES.join(' '));
  u.searchParams.set('state', state);
  return { url: u.toString() };
}

export async function finishConnect(env, db, url, fetchImpl = fetch) {
  await consumeState(db, 'linkedin', url.searchParams.get('state'));
  if (url.searchParams.get('error')) throw new HttpError(400, `LinkedIn: ${url.searchParams.get('error_description') || url.searchParams.get('error')}`);
  const code = url.searchParams.get('code');
  if (!code) throw new HttpError(400, 'LinkedIn did not return a code.');
  const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(env, 'linkedin'), client_id: env.LINKEDIN_CLIENT_ID, client_secret: env.LINKEDIN_CLIENT_SECRET });
  const { body: tok } = await apiJson(fetchImpl, TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form }, 'LinkedIn token exchange', [env.LINKEDIN_CLIENT_SECRET, code]);
  const { body: me } = await apiJson(fetchImpl, USERINFO, { headers: { authorization: `Bearer ${tok.access_token}` } }, 'LinkedIn profile', [tok.access_token]);
  await saveTokens(env, db, 'linkedin', {
    access: tok.access_token,
    refresh: tok.refresh_token ?? null,
    expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
    scopes: tok.scope ?? SCOPES.join(' '),
    accountId: me.sub,
    accountName: me.name ?? null,
    profileUrl: env.LINKEDIN_PROFILE_URL || null,
  });
  return { accountName: me.name ?? me.sub };
}

/** Publish a text post as the connected member. Returns { remoteId, remoteUrl }. */
export async function publish(env, db, { text }, fetchImpl = fetch) {
  const { row, access } = await tokens(env, db, 'linkedin');
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) {
    await markError(db, 'linkedin', 'expired', 'Access token expired (LinkedIn tokens last about 60 days). Reconnect.');
    throw new HttpError(409, 'LinkedIn access expired. Reconnect LinkedIn.', 'expired');
  }
  if (!text || text.length > 3000) throw new HttpError(400, 'LinkedIn post text must be 1–3000 characters.');
  try {
    const { headers } = await apiJson(
      fetchImpl,
      POSTS,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access}`,
          'content-type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': env.LINKEDIN_API_VERSION || '202510',
        },
        body: JSON.stringify({
          author: `urn:li:person:${row.account_id}`,
          commentary: escapeLittleText(text),
          visibility: 'PUBLIC',
          distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        }),
      },
      'LinkedIn publish',
      [access],
    );
    const urn = headers.get('x-restli-id') || headers.get('x-linkedin-id');
    return { remoteId: urn, remoteUrl: urn ? `https://www.linkedin.com/feed/update/${urn}/` : null };
  } catch (e) {
    if (e.upstreamStatus === 401) await markError(db, 'linkedin', 'expired', 'LinkedIn rejected the token (expired or revoked). Reconnect.');
    if (e.upstreamStatus === 403) await markError(db, 'linkedin', 'revoked', 'LinkedIn denied posting permission. Reconnect and allow posting.');
    throw e;
  }
}

/** LinkedIn "little text" reserves these characters; escape so posts render literally. */
export function escapeLittleText(s) {
  return String(s).replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => `\\${c}`);
}
