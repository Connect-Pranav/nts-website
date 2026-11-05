import { useEffect, useState } from 'react';
import { CheckCircle, Copy, DownloadSimple, FilePdf, ImageSquare, Trash, WarningCircle } from '@phosphor-icons/react';
import { downloadImage, downloadMarkdown, downloadPdf } from '../lib/download';

export type Engines = Record<string, { configured: boolean; model: string }>;
type Api = <T>(path: string, init?: RequestInit) => Promise<T>;

type Setting = { name: string; label: string; secret: boolean; testable: boolean; source: 'cloudflare' | 'saved' | null; preview: string | null; broken: boolean; updatedAt: string | null };
type Note = { id: string; title: string; text: string; source: string; createdAt: string };
type Brain = { knowledge: string; notes: Note[]; rules: string[]; feedback: { text: string; at: string }[]; updatedAt: string | null; isDefault: boolean };

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function SettingsPanel({ api, onEngines }: { api: Api; onEngines: (e: Engines) => void }) {
  const [rows, setRows] = useState<Setting[] | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api<{ settings: Setting[]; engines: Engines }>('/api/dev/settings')
      .then((d) => {
        setRows(d.settings);
        onEngines(d.engines);
      })
      .catch((e: Error) => setErr(e.message));
  }, [api, onEngines]);

  async function act(name: string, fn: () => Promise<{ settings: Setting[]; engines: Engines }>, okText: string) {
    setBusy(name);
    try {
      const d = await fn();
      setRows(d.settings);
      onEngines(d.engines);
      setVals((v) => ({ ...v, [name]: '' }));
      setMsg((m) => ({ ...m, [name]: { ok: true, text: okText } }));
    } catch (e) {
      setMsg((m) => ({ ...m, [name]: { ok: false, text: (e as Error).message } }));
    } finally {
      setBusy('');
    }
  }

  async function test(name: string, engine: string) {
    setBusy(`${name}:test`);
    try {
      const r = await api<{ model: string; latencyMs: number }>('/api/dev/settings/test', { method: 'POST', body: JSON.stringify({ engine }) });
      setMsg((m) => ({ ...m, [name]: { ok: true, text: `Working: ${r.model} replied in ${(r.latencyMs / 1000).toFixed(1)}s` } }));
    } catch (e) {
      setMsg((m) => ({ ...m, [name]: { ok: false, text: (e as Error).message } }));
    } finally {
      setBusy('');
    }
  }

  if (err) return <p className="dx-err" role="alert">{err}</p>;
  if (!rows) return <div className="dx-skel" aria-label="Loading settings" />;

  return (
    <div className="dset">
      <p className="dx-mono dx-dim dset__note">keys are encrypted · only last 4 chars shown · Cloudflare secrets override</p>
      {[rows.filter((r) => /(_API_KEY|_TOKEN|_CLIENT_ID|_CLIENT_SECRET|_URL)$/.test(r.name)), rows.filter((r) => !/(_API_KEY|_TOKEN|_CLIENT_ID|_CLIENT_SECRET|_URL)$/.test(r.name))].map((group, gi) => {
        const list = (
      <ul className="dset__list">
        {group.map((s) => {
          const engine = s.name === 'GEMINI_API_KEY' ? 'gemini' : s.name === 'GROQ_API_KEY' ? 'groq' : null;
          const m = msg[s.name];
          return (
            <li key={s.name} className="dset__row dx-card">
              <div className="dset__info">
                <p className="dset__name">
                  <i className={`dx-dot ${s.broken ? 'dx-dot--bad' : s.source ? 'dx-dot--ok' : ''}`} /> {s.name}
                </p>
                <p className="dset__label">{s.label.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+-\s+.*$/, '').trim()}</p>
                <p className={`dset__status ${s.source ? 'on' : ''}`}>
                  {s.broken
                    ? 'Saved value cannot be read (Dev token changed). Save it again.'
                    : s.source === 'cloudflare'
                      ? `Set in Cloudflare ${s.preview ?? ''}`
                      : s.source === 'saved'
                        ? `Saved ${s.preview ?? ''} · ${fmt(s.updatedAt)}`
                        : 'Not set'}
                </p>
              </div>
              {s.source === 'cloudflare' && <span className="dx-mono dx-dim">managed in Cloudflare</span>}
              {s.source !== 'cloudflare' && (
                <form
                  className="dset__form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(s.name, () => api('/api/dev/settings', { method: 'POST', body: JSON.stringify({ name: s.name, value: vals[s.name] ?? '' }) }), 'Saved');
                  }}
                >
                  <label className="sr-only" htmlFor={`set-${s.name}`}>
                    {s.name}
                  </label>
                  <input className="dx-input" id={`set-${s.name}`} type={s.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder={s.source ? 'Replace value' : 'Paste value'} value={vals[s.name] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [s.name]: e.target.value }))} />
                  <button type="submit" className="dx-btn dx-btn--primary" disabled={!vals[s.name]?.trim() || busy === s.name}>
                    {busy === s.name ? 'Saving…' : 'Save'}
                  </button>
                  {s.source === 'saved' && (
                    <button type="button" className="dx-iconbtn" aria-label={`Remove ${s.name}`} onClick={() => act(s.name, () => api(`/api/dev/settings/${s.name}`, { method: 'DELETE' }), 'Removed')}>
                      <Trash size={18} />
                    </button>
                  )}
                </form>
              )}
              {engine && s.source && (
                <button type="button" className="dx-btn" onClick={() => test(s.name, engine)}>
                  {busy === `${s.name}:test` ? 'Testing…' : 'Test'}
                </button>
              )}
              {m && (
                <p className={`dset__msg ${m.ok ? 'ok' : 'no'}`} role="status">
                  {m.ok ? <CheckCircle size={16} weight="fill" /> : <WarningCircle size={16} weight="fill" />} {m.text}
                </p>
              )}
            </li>
          );
        })}
      </ul>
        );
        return gi === 0 ? (
          <div key="keys">{list}</div>
        ) : (
          <details key="adv" className="dset__adv">
            <summary className="dx-label">Advanced ({group.length})</summary>
            {list}
          </details>
        );
      })}
    </div>
  );
}

export function BrainPanel({ api }: { api: Api }) {
  const [brain, setBrain] = useState<Brain | null>(null);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState({ title: '', text: '' });
  const [rule, setRule] = useState('');
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Brain>('/api/dev/brain')
      .then((b) => {
        setBrain(b);
        setDraft(b.knowledge);
      })
      .catch((e: Error) => setErr(e.message));
  }, [api]);

  async function run(fn: () => Promise<Brain>, done: string) {
    setErr('');
    try {
      const b = await fn();
      setBrain(b);
      setDraft(b.knowledge);
      setStatus(done);
      setTimeout(() => setStatus(''), 2500);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (!brain) return err ? <p className="dx-err" role="alert">{err}</p> : <div className="dx-skel" aria-label="Loading brain" />;

  return (
    <div className="dbrain">
      <section className="dbrain__col dx-card" aria-labelledby="kn-title">
        <header className="dbrain__head">
          <h2 id="kn-title">Knowledge</h2>
          <span className="dx-mono dx-dim">{brain.isDefault ? 'blueprint default' : `saved ${fmt(brain.updatedAt)}`}</span>
        </header>
        <label className="sr-only" htmlFor="kn">
          Knowledge
        </label>
        <textarea id="kn" className="dx-input dx-mono" rows={20} value={draft} maxLength={12000} onChange={(e) => setDraft(e.target.value)} />
        <div className="dbrain__actions">
          <button type="button" className="dx-btn dx-btn--primary" disabled={draft === brain.knowledge} onClick={() => run(() => api('/api/dev/brain', { method: 'PUT', body: JSON.stringify({ knowledge: draft }) }), 'knowledge saved')}>
            Save
          </button>
          <button type="button" className="dx-btn" onClick={() => run(() => api('/api/dev/brain/reset', { method: 'POST', body: '{}' }), 'reset to blueprint')}>
            Reset
          </button>
          {(status || err) && (
            <span className={err ? 'dx-err' : 'dx-ok'} role="status">
              {err || status}
            </span>
          )}
          <span className="dbrain__count dx-mono dx-dim">{draft.length.toLocaleString('en-IN')} / 12,000</span>
        </div>
      </section>
      <div className="dbrain__side">
      <section className="dbrain__col dx-card" aria-labelledby="rules-title">
        <header className="dbrain__head">
          <h2 id="rules-title">Rules</h2>
          <span className="dx-mono dx-dim">every agent follows these</span>
        </header>
        <ul className="dbrain__rules">
          {brain.rules.map((r, i) => (
            <li key={r}>
              <span>{r}</span>
              <button type="button" className="dx-iconbtn" aria-label={`Delete rule ${r}`} onClick={() => run(() => api(`/api/dev/brain/rules/${i}`, { method: 'DELETE' }), 'rule removed')}>
                <Trash size={16} />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="dx-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api('/api/dev/brain/rules', { method: 'POST', body: JSON.stringify({ text: rule }) }), 'rule added').then(() => setRule(''));
          }}
        >
          <label className="sr-only" htmlFor="rule">
            New rule
          </label>
          <input id="rule" className="dx-input" style={{ flex: 1 }} value={rule} maxLength={300} onChange={(e) => setRule(e.target.value)} placeholder="e.g. Always end LinkedIn posts with a question" />
          <button type="submit" className="dx-btn dx-btn--primary" disabled={rule.trim().length < 3}>
            Add
          </button>
        </form>
        <header className="dbrain__head" style={{ marginTop: 6 }}>
          <h2>Learned</h2>
          <span className="dx-mono dx-dim">from your approve / reject</span>
        </header>
        <ul className="dbrain__rules dbrain__learned">
          {brain.feedback.slice(0, 8).map((f) => (
            <li key={f.at + f.text}>
              <span className={/^Rejected/.test(f.text) ? 'no' : 'ok'}>{f.text}</span>
            </li>
          ))}
          {!brain.feedback.length && <li className="dx-dim">Nothing yet. Approve or reject work and the team learns.</li>}
        </ul>
      </section>
      <section className="dbrain__col dx-card" aria-labelledby="notes-title">
        <header className="dbrain__head">
          <h2 id="notes-title">Notes</h2>
          <span className="dx-mono dx-dim">{brain.notes.length}</span>
        </header>
        <form
          className="dbrain__add"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api('/api/dev/brain/notes', { method: 'POST', body: JSON.stringify(note) }), 'Note added').then(() => setNote({ title: '', text: '' }));
          }}
        >
          <label className="sr-only" htmlFor="nt">
            Note title
          </label>
          <input id="nt" className="dx-input" placeholder="Title (optional)" value={note.title} maxLength={120} onChange={(e) => setNote({ ...note, title: e.target.value })} />
          <label className="sr-only" htmlFor="nx">
            Note
          </label>
          <textarea id="nx" className="dx-input" rows={3} placeholder="e.g. Carousels on SQL traps get the most saves on LinkedIn" value={note.text} maxLength={4000} required onChange={(e) => setNote({ ...note, text: e.target.value })} />
          <button type="submit" className="dx-btn dx-btn--primary">
            Add note
          </button>
        </form>
        <ul className="dbrain__notes">
          {brain.notes.map((n) => (
            <li key={n.id}>
              <div>
                <p className="dbrain__nt">{n.title}</p>
                {n.text !== n.title && <p className="dbrain__nx">{n.text}</p>}
                <p className="dbrain__nm dx-mono dx-dim">
                  {n.source} · {fmt(n.createdAt)}
                </p>
              </div>
              <button type="button" className="dx-iconbtn" aria-label={`Delete note ${n.title}`} onClick={() => run(() => api(`/api/dev/brain/notes/${n.id}`, { method: 'DELETE' }), 'Note deleted')}>
                <Trash size={18} />
              </button>
            </li>
          ))}
          {!brain.notes.length && <li className="dbrain__empty">No notes yet.</li>}
        </ul>
      </section>
      </div>
    </div>
  );
}

// ---------------- Work board (agent team cycle) ----------------
type Item = { id: string; agent: string; agentName: string; channel: string; title: string; body: string; status: 'waiting' | 'ready' | 'rejected'; topic: string; createdAt: string; brain: string; by: string; reason?: string; url?: string; leadId?: string };
type Board = { items: Item[]; topics: string[]; cycles: number; updated: string | null; last: { topic: string; why: string; summary: string; count: number; brain: string; by: string; at: string } | null; autopilot: boolean };
const FLOW = ['Brain', 'Plan', 'Agents draft', 'You approve', 'Team learns'];

export function WorkPanel({ api, ready }: { api: Api; ready: boolean }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [filter, setFilter] = useState<Item['status']>('waiting');
  const [focus, setFocus] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [rej, setRej] = useState<{ id: string; text: string } | null>(null);
  const [copied, setCopied] = useState('');
  const [imgs, setImgs] = useState<Record<string, { mime: string; data: string; engine: string } | 'busy' | { error: string }>>({});

  async function makeImage(it: Item) {
    setImgs((m) => ({ ...m, [it.id]: 'busy' }));
    const aspect = it.channel === 'YouTube' ? '16:9' : it.channel === 'Instagram' ? '9:16' : it.channel === 'LinkedIn' ? '4:5' : '1:1';
    try {
      const d = await api<{ mime: string; data: string; engine: string }>('/api/dev/image', { method: 'POST', body: JSON.stringify({ prompt: `Visual for this ${it.channel} post titled "${it.title}". Content: ${it.body.slice(0, 700)}`, aspect }) });
      setImgs((m) => ({ ...m, [it.id]: d }));
    } catch (e) {
      setImgs((m) => ({ ...m, [it.id]: { error: (e as Error).message } }));
    }
  }

  useEffect(() => {
    const load = () => api<Board>('/api/dev/work').then(setBoard, (e: Error) => setErr(e.message));
    load();
    window.addEventListener('nts:work', load);
    return () => window.removeEventListener('nts:work', load);
  }, [api]);

  async function act(key: string, fn: () => Promise<Board>) {
    setBusy(key);
    setErr('');
    try {
      setBoard(await fn());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  const post = (path: string, b: object) => api<Board>(path, { method: 'POST', body: JSON.stringify(b) });

  if (!board) return err ? <p className="dx-err" role="alert">{err}</p> : <div className="dx-skel" aria-label="Loading work" />;
  const count = (s: Item['status']) => board.items.filter((i) => i.status === s).length;
  const shown = board.items.filter((i) => i.status === filter);

  return (
    <div className="dwork">
      <section className="dx-card dwork__run">
        <ol className="dwork__flow" aria-label="How the team works">
          {FLOW.map((f, i) => (
            <li key={f} className={busy === 'cycle' && i < 3 ? 'on' : ''}>
              <span>{i + 1}</span> {f}
            </li>
          ))}
        </ol>
        <form
          className="dwork__form"
          onSubmit={(e) => {
            e.preventDefault();
            act('cycle', () => post('/api/dev/work/cycle', { focus })).then(() => {
              setFocus('');
              setFilter('waiting');
            });
          }}
        >
          <label className="sr-only" htmlFor="focus">
            Focus for this cycle
          </label>
          <input id="focus" className="dx-input" value={focus} maxLength={300} onChange={(e) => setFocus(e.target.value)} placeholder="Focus (optional), e.g. SQL JOIN mistakes for freshers" />
          <button type="submit" className="dx-btn dx-btn--primary" disabled={!ready || busy === 'cycle'} title={ready ? '' : 'No AI engine yet: add a key in Settings'}>
            {busy === 'cycle' ? 'Team working…' : 'Run cycle'}
          </button>
        </form>
        <div className="dwork__meta">
          <label className="dx-switch" title="Runs one cycle every 6 hours">
            <input type="checkbox" checked={board.autopilot} onChange={(e) => act('auto', () => post('/api/dev/work/autopilot', { on: e.target.checked }))} />
            <span aria-hidden="true" />
            <span className="sr-only">Autopilot</span>
          </label>
          <span>Autopilot {board.autopilot ? 'on · every 6 h' : 'off'}</span>
          <span className="dx-dim">· {board.cycles} cycles</span>
          {board.last && (
            <span className="dx-dim dwork__last" title={board.last.why}>
              · last: “{board.last.topic}” via {board.last.brain}
            </span>
          )}
        </div>
        {err && (
          <p className="dx-err" role="alert">
            {err}
          </p>
        )}
      </section>

      <div className="dwork__tabs" role="tablist" aria-label="Filter work">
        {(['waiting', 'ready', 'rejected'] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={filter === s} className={filter === s ? 'on' : ''} onClick={() => setFilter(s)}>
            {s === 'waiting' ? 'Needs approval' : s === 'ready' ? 'Approved' : 'Rejected'} <small>{count(s)}</small>
          </button>
        ))}
      </div>

      <ul className="dwork__list">
        {shown.map((it) => (
          <li key={it.id} className="dx-card dwork__item">
            <header>
              <span className={`dwork__ch dwork__ch--${it.channel.toLowerCase()}`}>{it.channel}</span>
              <span className="dx-mono dx-dim">{it.agentName}</span>
              <span className="dx-mono dx-dim dwork__when">{fmt(it.createdAt)}</span>
            </header>
            <h3>{it.title}</h3>
            <pre>{it.body}</pre>
            {it.url && (
              <a className="dx-mono" href={it.url} target="_blank" rel="noreferrer">
                ↗ open the lead’s thread (reply yourself after approval)
              </a>
            )}
            {it.reason && <p className="dx-mono dx-dim">note: {it.reason}</p>}
            {(() => {
              const im = imgs[it.id];
              if (!im) return null;
              if (im === 'busy') return <p className="dx-mono dx-dim">image ban rahi hai…</p>;
              if ('error' in im) return <p className="dx-err">{im.error}</p>;
              return (
                <figure className="dwork__img">
                  <img src={`data:${im.mime};base64,${im.data}`} alt={`Visual for ${it.title}`} />
                  <figcaption className="dx-row">
                    <button type="button" className="dx-btn" onClick={() => downloadImage(it.title, im.mime, im.data)}>
                      <DownloadSimple size={15} /> Image
                    </button>
                    <span className="dx-mono dx-dim">{im.engine}</span>
                  </figcaption>
                </figure>
              );
            })()}
            <div className="dx-row">
              {it.status === 'waiting' && rej?.id !== it.id && (
                <>
                  <button type="button" className="dx-btn dx-btn--primary" disabled={busy === it.id} onClick={() => act(it.id, () => post(`/api/dev/work/${it.id}/approve`, {}))}>
                    <CheckCircle size={15} /> Approve
                  </button>
                  <button type="button" className="dx-btn" onClick={() => setRej({ id: it.id, text: '' })}>
                    <WarningCircle size={15} /> Reject
                  </button>
                </>
              )}
              {rej?.id === it.id && (
                <form
                  className="dwork__rej"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(it.id, () => post(`/api/dev/work/${it.id}/reject`, { reason: rej.text })).then(() => setRej(null));
                  }}
                >
                  <input className="dx-input" autoFocus value={rej.text} maxLength={200} onChange={(e) => setRej({ id: it.id, text: e.target.value })} placeholder="Why? The team learns from this (optional)" />
                  <button type="submit" className="dx-btn dx-btn--primary">
                    Reject
                  </button>
                  <button type="button" className="dx-btn" onClick={() => setRej(null)}>
                    Cancel
                  </button>
                </form>
              )}
              <button
                type="button"
                className="dx-btn"
                onClick={() => {
                  navigator.clipboard?.writeText(it.body);
                  setCopied(it.id);
                  setTimeout(() => setCopied(''), 1500);
                }}
              >
                <Copy size={15} /> {copied === it.id ? 'Copied' : 'Copy'}
              </button>
              {it.channel === 'X' && it.status === 'ready' && (
                <a className="dx-btn dx-btn--primary" href={`https://x.com/intent/post?text=${encodeURIComponent(it.body.split(/\n-{3,}\n/)[0].slice(0, 280))}`} target="_blank" rel="noreferrer" title="Opens the X composer with the first post">
                  𝕏 Post on X
                </a>
              )}
              {it.channel === 'X' && <span className={`dx-mono ${it.body.split(/\n-{3,}\n/)[0].length > 280 ? 'dx-err' : 'dx-dim'}`}>{it.body.split(/\n-{3,}\n/)[0].length}/280</span>}
              <button type="button" className="dx-btn" onClick={() => downloadPdf(it.title, it.body)}>
                <FilePdf size={15} /> PDF
              </button>
              <button type="button" className="dx-btn" onClick={() => downloadMarkdown(it.title, it.body)}>
                <DownloadSimple size={15} /> .md
              </button>
              <button type="button" className="dx-btn" disabled={imgs[it.id] === 'busy'} onClick={() => makeImage(it)}>
                <ImageSquare size={15} /> {imgs[it.id] && imgs[it.id] !== 'busy' && !('error' in (imgs[it.id] as object)) ? 'New image' : 'Make image'}
              </button>
              <button type="button" className="dx-iconbtn" aria-label={`Delete ${it.title}`} onClick={() => act(it.id, () => api(`/api/dev/work/${it.id}`, { method: 'DELETE' }))}>
                <Trash size={17} />
              </button>
            </div>
          </li>
        ))}
        {!shown.length && <li className="dwork__empty dx-dim">{filter === 'waiting' ? 'Nothing waiting. Run a cycle and the team will draft LinkedIn, Instagram/YouTube and growth pieces.' : 'Nothing here yet.'}</li>}
      </ul>
    </div>
  );
}
