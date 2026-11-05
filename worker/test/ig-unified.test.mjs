import test from 'node:test';
import assert from 'node:assert/strict';
import { findAccount } from '../instagram.mjs';

test('unified login: finds the Instagram account from assigned accounts, then Page links', async () => {
  const calls = [];
  const f = (answers) => async (u) => {
    const url = new URL(u);
    calls.push(url.host + url.pathname);
    const a = answers[url.pathname];
    return new Response(JSON.stringify(a ?? { error: { message: 'no' } }), { status: a ? 200 : 400 });
  };
  assert.deepEqual(await findAccount('t', f({ '/me/assigned_instagram_accounts': { data: [{ id: '178', username: 'nikhil_techstudio' }] } })), { id: '178', username: 'nikhil_techstudio' });
  assert.equal(calls[0], 'graph.facebook.com/me/assigned_instagram_accounts');
  const viaPage = await findAccount('t', f({ '/me/accounts': { data: [{ id: 'p1' }, { id: 'p2', instagram_business_account: { id: '179', username: 'nts' } }] } }));
  assert.equal(viaPage.id, '179');
  assert.equal(await findAccount('t', f({})), null);
  const viaGrant = await findAccount('t', f({ '/debug_token': { data: { granular_scopes: [{ scope: 'instagram_basic', target_ids: ['1784'] }] } }, '/1784': { id: '1784', username: 'nikhil_techstudio' } }), 'app|secret');
  assert.deepEqual(viaGrant, { id: '1784', username: 'nikhil_techstudio' });
});
