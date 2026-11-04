import { useEffect, useState } from 'react';

export type YtVideo = { id: string; title: string; thumbnail: string | null; publishedAt: string | null };
export type YtData = { channel: { id: string; title: string | null; uploadsPlaylistId: string } | null; videos: YtVideo[] };

const ID = /^[A-Za-z0-9_-]{11}$/;
let pending: Promise<YtData | null> | null = null;

/** Channel uploads from the Worker (/api/public/youtube). One request per page load, shared by all callers. */
export function loadYouTube(): Promise<YtData | null> {
  if (!pending) {
    pending = fetch('/api/public/youtube')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: YtData | null) => {
        if (!d || !d.channel || !Array.isArray(d.videos)) return null;
        if (!/^[A-Za-z0-9_-]{10,40}$/.test(d.channel.uploadsPlaylistId)) return null;
        return { channel: d.channel, videos: d.videos.filter((v) => ID.test(v.id)) };
      })
      .catch(() => null);
  }
  return pending;
}

export function useYouTube() {
  const [data, setData] = useState<YtData | null | undefined>(undefined); // undefined = loading
  useEffect(() => {
    let alive = true;
    loadYouTube().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);
  return data;
}
