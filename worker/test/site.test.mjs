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

test('no key -> reads the public channel page + RSS feed', async () => {
  const { channelVideos } = await import('../site.mjs');
  const calls = [];
  const f = async (u) => {
    const url = String(u);
    calls.push(url);
    if (url === 'https://www.youtube.com/%40NikhilsTechStudio')
      return new Response('<html><link rel="canonical" href="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"></html>');
    if (url.startsWith('https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv'))
      return new Response(`<feed><title>NikhilsTechStudio</title>
<entry><yt:videoId>AbCdEfGhIjK</yt:videoId><title>SQL Interview : FAANG | Retained Users &amp; the Join Trap</title><published>2026-11-04T06:00:00+00:00</published><media:thumbnail url="https://i.ytimg.com/vi/AbCdEfGhIjK/hqdefault.jpg" width="480" height="360"/></entry>
<entry><yt:videoId>ZyXwVuTsRqP</yt:videoId><title>Anti Join</title><published>2026-11-02T06:00:00+00:00</published></entry></feed>`);
    return new Response('nope', { status: 404 });
  };
  const d = await channelVideos({}, f);
  assert.equal(d.source, 'rss');
  assert.equal(d.channel.uploadsPlaylistId, 'UUabcdefghijklmnopqrstuv');
  assert.deepEqual(d.videos.map((v) => v.id), ['AbCdEfGhIjK', 'ZyXwVuTsRqP']);
  assert.equal(d.videos[0].title, 'SQL Interview : FAANG | Retained Users & the Join Trap');
  const v = await latestVideo({}, f);
  assert.equal(v.videoId, 'AbCdEfGhIjK');
});

test('YOUTUBE_CHANNEL_ID skips the channel-page lookup', async () => {
  const { resolveChannelId } = await import('../site.mjs');
  assert.equal(await resolveChannelId({ YOUTUBE_CHANNEL_ID: 'UCabcdefghijklmnopqrstuv' }, () => { throw new Error('should not fetch'); }), 'UCabcdefghijklmnopqrstuv');
});

test('API error message never leaks the key', async () => {
  const f = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'bad key secretKEY123' } }) });
  await assert.rejects(latestVideo({ YOUTUBE_API_KEY: 'secretKEY123' }, f), (e) => !e.message.includes('secretKEY123'));
});

test('channelVideos returns uploads playlist and videos, skipping private ones', async () => {
  const { channelVideos } = await import('../site.mjs');
  const f = fake({
    channels: () => ({ items: [{ id: 'UCx', snippet: { title: 'NikhilsTechStudio' }, contentDetails: { relatedPlaylists: { uploads: 'UUx' } } }] }),
    playlistItems: () => ({ items: [
      { snippet: { title: 'Anti Join', thumbnails: { medium: { url: 'https://i.ytimg.com/a.jpg' } } }, contentDetails: { videoId: 'AAAAAAAAAAA' } },
      { snippet: { title: 'Private video' }, contentDetails: { videoId: 'BBBBBBBBBBB' } },
    ] }),
  });
  const d = await channelVideos({ YOUTUBE_API_KEY: 'k' }, f);
  assert.equal(d.channel.uploadsPlaylistId, 'UUx');
  assert.deepEqual(d.videos.map((v) => v.id), ['AAAAAAAAAAA']);
});
