import { useEffect, useState } from 'react';
import { CheckCircle, Trash, WarningCircle } from '@phosphor-icons/react';

export type Engines = Record<string, { configured: boolean; model: string }>;
type Api = <T>(path: string, init?: RequestInit) => Promise<T>;

type Setting = { name: string; label: string; secret: boolean; testable: boolean; source: 'cloudflare' | 'saved' | null; preview: string | null; broken: boolean; updatedAt: string | null };
type Note = { id: string; title: string; text: string; source: string; createdAt: string };
type Brain = { knowledge: string; notes: Note[]; updatedAt: string | null; isDefault: boolean };

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
      {[rows.filter((r) => /_API_KEY$/.test(r.name)), rows.filter((r) => !/_API_KEY$/.test(r.name))].map((group, gi) => {
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
  );
}
