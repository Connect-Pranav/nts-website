// Signals panel (AGENTVERSE style) and SOMA's YouTube analysis (Ganesha Sunverse style) for Dev Mode.
import { useCallback, useEffect, useState } from 'react';
import { ArrowClockwise, Brain, InstagramLogo, MagnifyingGlass, NotePencil, RedditLogo, Rss, X, YoutubeLogo } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

type Api = <T>(path: string, init?: RequestInit) => Promise<T>;
type Source = { key: string; name: string; status: 'ok' | 'error' | 'idle' | 'off'; detail: string };
type Lead = { id: string; source: string; title: string; text: string; url: string; at: string; score: number; state: string };
type Overview = { updated: string | null; sources: Source[]; leads: Lead[] };

const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const ICON: Record<string, { el: ReactNode; c: string }> = {
  scraper: { el: <MagnifyingGlass size={26} weight="bold" />, c: '#e0457b' },
  reddit: { el: <RedditLogo size={28} weight="fill" />, c: '#ff4500' },
  hn: { el: <b style={{ fontSize: 24, fontFamily: 'var(--font-display)' }}>Y</b>, c: '#ff6600' },
  rss: { el: <Rss size={26} weight="bold" />, c: '#f59e0b' },
  notes: { el: <NotePencil size={26} weight="bold" />, c: '#7c5cff' },
  memory: { el: <Brain size={26} weight="bold" />, c: '#16a3b8' },
  youtube: { el: <YoutubeLogo size={28} weight="fill" />, c: '#e00000' },
  instagram: { el: <InstagramLogo size={28} weight="bold" />, c: '#d62976' },
};

export function SignalsPanel({ api, onOpen }: { api: Api; onOpen?: (key: string) => void }) {
  const [o, setO] = useState<Overview | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    api<Overview>('/api/dev/signals').then(setO, (e: Error) => setErr(e.message));
  }, [api]);
  const scan = async () => {
    setBusy(true);
    setErr('');
    try {
      setO(await api<Overview>('/api/dev/signals/scan', { method: 'POST', body: '{}' }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const mark = async (id: string, state: string) => setO(await api<Overview>(`/api/dev/signals/leads/${id}`, { method: 'POST', body: JSON.stringify({ state }) }));
  const running = o?.sources.some((s) => s.status === 'ok');
  const src = o?.sources.find((s) => s.key === open);
  const leadView = open === 'scraper' || open === 'reddit' || open === 'hn' || open === 'rss';
  const leads = (o?.leads ?? []).filter((l) => open === 'scraper' || (open === 'reddit' && l.source.startsWith('Reddit')) || (open === 'hn' && l.source === 'Hacker News') || (open === 'rss' && l.source.startsWith('Mastodon')));

  return (
    <section className="dx-card sig" aria-labelledby="sig-title">
      <header className="sig__head">
        <div>
          <h2 id="sig-title">Signals</h2>
          <p className="dx-dim">leads, owner notes, memory and channel data · tap a source</p>
        </div>
        <div className="dx-row">
          <span className={`sig__badge ${running ? 'on' : ''}`}>{running ? 'RUNNING' : 'IDLE'}</span>
          <button type="button" className="dx-btn" onClick={scan} disabled={busy}>
            <ArrowClockwise size={14} /> {busy ? 'Scanning…' : 'Scan now'}
          </button>
        </div>
      </header>
      {err && <p className="dx-err">{err}</p>}
      <ul className="sig__grid">
        {(o?.sources ?? Object.keys(ICON).map((k) => ({ key: k, name: k, status: 'idle', detail: '' }) as Source)).map((s) => (
          <li key={s.key}>
            <button type="button" className={`sig__tile ${open === s.key ? 'on' : ''}`} onClick={() => (s.key === 'youtube' && onOpen ? onOpen('youtube') : setOpen(open === s.key ? null : s.key))} aria-expanded={open === s.key} title={s.detail}>
              <span className="sig__icon" style={{ ['--c' as string]: ICON[s.key]?.c }}>
                {ICON[s.key]?.el}
                <i className={`sig__dot sig__dot--${s.status}`} aria-label={s.status} />
              </span>
              <span className="sig__name">{s.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {src && (
        <div className="sig__drawer">
          <header className="dx-row">
            <b>{src.name}</b>
            <span className={`sig__st sig__st--${src.status}`}>{src.status}</span>
            <button type="button" className="dx-iconbtn" style={{ marginLeft: 'auto' }} onClick={() => setOpen(null)} aria-label="Close">
              <X size={16} />
            </button>
          </header>
          <p className="dx-dim">{src.detail}</p>
          {o?.updated && leadView && <p className="dx-mono dx-dim">last scan {fmt(o.updated)}</p>}
          {leadView && (
            <ul className="sig__leads">
              {leads.map((l) => (
                <li key={l.id}>
                  <div>
                    <a href={l.url} target="_blank" rel="noreferrer">
                      {l.title || l.text.slice(0, 90)}
                    </a>
                    <p className="dx-dim">{l.text.slice(0, 220)}</p>
                    <p className="dx-mono dx-dim">
                      {l.source} · score {l.score} · {l.state} · {fmt(l.at)}
                    </p>
                  </div>
                  {l.state === 'new' && (
                    <button type="button" className="dx-btn" onClick={() => mark(l.id, 'ignored')}>
                      Ignore
                    </button>
                  )}
                  {l.state === 'drafted' && (
                    <button type="button" className="dx-btn" onClick={() => mark(l.id, 'contacted')}>
                      Replied
                    </button>
                  )}
                </li>
              ))}
              {!leads.length && <li className="dx-dim">No leads yet. Scan now, or wait for the 6-hourly scan. Fresh leads get a drafted reply in the next cycle.</li>}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------- Analytics (SOMA) ----------------
type Video = { id: string; title: string; publishedAt: string | null; durationSec: number | null; views: number | null; likes: number | null; comments: number | null; url: string };
type Report = {
  connected: boolean;
  reason?: string;
  source: string;
  exact: boolean;
  fetchedAt: string;
  stale: boolean;
  fetchError: string | null;
  channel: { title: string; handle: string; url: string; subscribers: number | null; totalViews: number | null; videoCount: number | null };
  videos: Video[];
  summary: {
    avgViewsPerVideo: number | null;
    medianViewsPerVideo: number | null;
    likeRate: number | null;
    commentRate: number | null;
    totalLikes: number;
    totalComments: number;
    last30Days: { uploads: number; views: number };
    upTo3Min: { count: number; avgViews: number | null };
    over3Min: { count: number; avgViews: number | null };
    topVideos: string[];
    latestUpload: string | null;
    totalViewsOfVideos: number;
    growth?: { since: string; subscribers: number | null; totalViews: number | null; videoCount: number | null };
  };
  ypp: { id: string; label: string; subscribers: number; hours: number; shortsViews90: number; have: number | null }[];
  insights: { headline: string; working: string[]; notWorking: string[]; nextActions: { action: string; why: string; measureWith: string }[]; provider: string; at: string; basedOn: string } | null;
  insightsError: string | null;
  dataGaps: string[];
};
const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('en-IN'));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
const signed = (v: number | null | undefined) => (v === null || v === undefined ? null : `${v >= 0 ? '+' : ''}${v.toLocaleString('en-IN')}`);
const len = (s: number | null) => (s === null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function Stat({ label, value, hint, delta }: { label: string; value: string; hint?: string; delta?: string | null }) {
  return (
    <div className="dx-card an-stat">
      <p className="dx-label">{label}</p>
      <p className="an-stat__v">{value}</p>
      <p className="an-stat__h">
        {delta && <span className={delta.startsWith('-') ? 'down' : 'up'}>{delta}</span>} {hint}
      </p>
    </div>
  );
}

function Table({ videos }: { videos: Video[] }) {
  return (
    <div className="an-tw">
      <table className="an-t">
        <thead>
          <tr>
            <th>Video</th>
            <th>Published</th>
            <th className="num">Length</th>
            <th className="num">Views</th>
            <th className="num">Likes</th>
            <th className="num">Comments</th>
            <th className="num">Like rate</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((v) => (
            <tr key={v.id}>
              <td className="an-t__title">
                <a href={v.url} target="_blank" rel="noreferrer">
                  {v.title}
                </a>
              </td>
              <td>{day(v.publishedAt)}</td>
              <td className="num">{len(v.durationSec)}</td>
              <td className="num">{n(v.views)}</td>
              <td className="num">{n(v.likes)}</td>
              <td className="num">{v.comments === null ? '—' : n(v.comments)}</td>
              <td className="num">{v.likes !== null && v.views ? pct(v.likes / v.views) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalyticsPanel({ api }: { api: Api }) {
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(
    async (mode: '' | 'refresh' | 'insights') => {
      setBusy(mode || 'load');
      setErr('');
      try {
        setR(mode === 'insights' ? await api<Report>('/api/dev/analytics/insights', { method: 'POST', body: '{}' }) : await api<Report>(`/api/dev/analytics${mode === 'refresh' ? '?refresh=1' : ''}`));
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy('');
      }
    },
    [api],
  );
  useEffect(() => {
    load('');
  }, [load]);

  if (!r) return busy ? <div className="dx-skel" aria-label="Loading analytics" /> : <p className="dx-err">{err || 'Could not load analytics.'}</p>;
  if (!r.connected)
    return (
      <div className="dx-card an-empty">
        <p>Channel data couldn’t load: {r.reason}</p>
        <button type="button" className="dx-btn" onClick={() => load('refresh')}>
          Try again
        </button>
      </div>
    );
  const s = r.summary;
  const g = s.growth;
  const since = g ? `since ${fmt(g.since)}` : undefined;
  const top = s.topVideos.map((id) => r.videos.find((v) => v.id === id)).filter((v): v is Video => Boolean(v));
  const subs = r.channel.subscribers;

  return (
    <div className="an">
      <section className="an-head">
        <div>
          <p className="dx-label">YouTube channel · SOMA</p>
          <h2>
            <a href={r.channel.url} target="_blank" rel="noreferrer">
              {r.channel.title}
            </a>
          </h2>
          <p className="dx-dim">
            {r.channel.handle} · {r.source} · fetched {fmt(r.fetchedAt)}
            {r.stale && ` · latest fetch failed (${r.fetchError}); showing the previous one`}
          </p>
        </div>
        <div className="dx-row">
          <span className="sig__badge on">REAL DATA</span>
          <button type="button" className="dx-btn" onClick={() => load('refresh')} disabled={Boolean(busy)}>
            <ArrowClockwise size={14} /> {busy === 'refresh' ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

      <section className="an-grid">
        <Stat label="Subscribers" value={n(subs)} delta={signed(g?.subscribers)} hint={r.exact ? since : 'rounded by YouTube'} />
        <Stat label="Total channel views" value={r.channel.totalViews === null ? n(s.totalViewsOfVideos) : n(r.channel.totalViews)} delta={signed(g?.totalViews)} hint={r.channel.totalViews === null ? `sum of latest ${r.videos.length}` : since} />
        <Stat label="Videos" value={n(r.channel.videoCount ?? r.videos.length)} hint={s.latestUpload ? `latest ${day(s.latestUpload)}` : undefined} />
        <Stat label="Average views / video" value={n(s.avgViewsPerVideo)} hint={`median ${n(s.medianViewsPerVideo)}`} />
      </section>

      <section className="dx-card an-ypp">
        <p className="dx-label">YouTube Partner Program · subscribers</p>
        {r.ypp.map((t) => {
          const p = subs === null ? 0 : Math.min(100, (subs / t.subscribers) * 100);
          return (
            <div key={t.id} className="an-ypp__row">
              <span>{t.label}</span>
              <div className="an-ypp__bar" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} aria-label={`${t.label} progress`}>
                <i style={{ width: `${p}%` }} />
              </div>
              <span className="dx-mono">
                {n(subs)} / {n(t.subscribers)}
              </span>
            </div>
          );
        })}
        <p className="dx-dim an-small">Also needs {n(r.ypp[1].hours)} public watch hours in 12 months (or {n(r.ypp[1].shortsViews90)} Shorts views in 90 days). Watch hours are private: they need the channel owner’s YouTube Analytics sign-in.</p>
      </section>

      <section className="an-grid">
        <Stat label="Last 30 days" value={`${n(s.last30Days.views)} views`} hint={`${s.last30Days.uploads} upload(s)`} />
        <Stat label="Like rate" value={pct(s.likeRate)} hint={`${n(s.totalLikes)} likes`} />
        <Stat label="Comment rate" value={pct(s.commentRate)} hint={r.exact ? `${n(s.totalComments)} comments` : 'needs API key'} />
        <Stat label="Up to 3 min vs longer" value={`${n(s.upTo3Min.avgViews)} / ${n(s.over3Min.avgViews)}`} hint={r.exact ? `avg views · ${s.upTo3Min.count} vs ${s.over3Min.count}` : 'needs API key'} />
      </section>

      <div className="an-main">
        <div className="an-col">
          <section className="dx-card an-card">
            <h3>Top videos by views</h3>
            {top.length ? <Table videos={top} /> : <p className="dx-dim">No videos yet.</p>}
          </section>
          <section className="dx-card an-card">
            <h3>
              {r.exact ? 'All videos' : 'Latest videos'} ({r.videos.length})
            </h3>
            <Table videos={r.videos} />
          </section>
        </div>
        <div className="an-col">
          <section className="dx-card an-card">
            <header className="dx-row">
              <h3>SOMA’s analysis</h3>
              {r.insights && <span className="sig__badge on">{r.insights.provider}</span>}
            </header>
            {r.insights ? (
              <div className="an-ins">
                <p className="an-ins__h">{r.insights.headline}</p>
                <h4>Working</h4>
                <ul>
                  {r.insights.working.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <h4>Not working</h4>
                <ul>
                  {r.insights.notWorking.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <h4>Next 3 actions</h4>
                <ol>
                  {r.insights.nextActions.map((a) => (
                    <li key={a.action}>
                      <b>{a.action}</b> — {a.why} <span className="dx-dim">Measure: {a.measureWith}</span>
                    </li>
                  ))}
                </ol>
                <p className="dx-mono dx-dim">written {fmt(r.insights.at)} from the fetch of {fmt(r.insights.basedOn)}</p>
              </div>
            ) : (
              <p className="dx-dim">{r.insightsError ?? 'No written analysis yet. SOMA writes one every day automatically, or press Analyse now.'}</p>
            )}
            {r.insightsError && r.insights && <p className="dx-err">{r.insightsError}</p>}
            <button type="button" className="dx-btn dx-btn--primary" onClick={() => load('insights')} disabled={Boolean(busy)}>
              {busy === 'insights' ? 'SOMA is analysing…' : 'Analyse now'}
            </button>
          </section>
          <section className="dx-card an-card">
            <h3>What this report can’t see yet</h3>
            <ul className="an-gaps">
              {r.dataGaps.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
          {err && <p className="dx-err">{err}</p>}
        </div>
      </div>
    </div>
  );
}
