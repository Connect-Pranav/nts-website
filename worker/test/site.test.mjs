import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestVideo } from '../site.mjs';

const fake = (routes) => async (u) => {
  const url = new URL(u);
  const body = routes[url.pathname.split('/').pop()](url);
  return { ok: true, status: 200, json: async () => body };
};

test('returns latest upload from the channel handle', async () => {
  const seen = [];
  const f = fake({
    channels: (u) => (seen.push(u.searchParams.get('forHandle')), { items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUabc' } } }] }),
    playlistItems: (u) => (assert.equal(u.searchParams.get('playlistId'), 'UUabc'), { items: [{ snippet: { title: 'SQL Interview' }, contentDetails: { videoId: 'AbCdEfGhIjK', videoPublishedAt: '2026-11-04T05:00:00Z' } }] }),
  });
  const r = await latestVideo({ YOUTUBE_API_KEY: 'k', YOUTUBE_HANDLE: 'NikhilsTechStudio' }, f);
  assert.equal(r.videoId, 'AbCdEfGhIjK');
  assert.deepEqual(seen, ['@NikhilsTechStudio']);
});

test('no key -> no video, clear reason', async () => {
  const r = await latestVideo({});
  assert.equal(r.videoId, null);
  assert.match(r.reason, /YOUTUBE_API_KEY/);
});

test('API error message never leaks the key', async () => {
  const f = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'bad key secretKEY123' } }) });
  await assert.rejects(latestVideo({ YOUTUBE_API_KEY: 'secretKEY123' }, f), (e) => !e.message.includes('secretKEY123'));
});
