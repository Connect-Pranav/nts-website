import { useEffect, useState } from 'react';
import { CheckCircle, Trash, WarningCircle } from '@phosphor-icons/react';
import { GlassButton } from '../components/GlassButton';

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

  if (err) return <p className="dev__err" role="alert">{err}</p>;
  if (!rows) return <div className="dev__skel" aria-label="Loading settings" />;

  return (
    <div className="dset">
      <p className="sec__lead" style={{ marginTop: 0 }}>
        Add API keys here. They are encrypted before saving and never shown again, only the last 4 characters. Keys added in Cloudflare always take priority.
      </p>
      <ul className="dset__list">
        {rows.map((s) => {
          const engine = s.name === 'GEMINI_API_KEY' ? 'gemini' : s.name === 'GROQ_API_KEY' ? 'groq' : null;
          const m = msg[s.name];
          return (
            <li key={s.name} className="dset__row glass">
              <div className="dset__info">
                <p className="dset__name">{s.name}</p>
                <p className="dset__label">{s.label}</p>
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
                  <input id={`set-${s.name}`} type={s.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder={s.source ? 'Replace value' : 'Paste value'} value={vals[s.name] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [s.name]: e.target.value }))} />
                  <GlassButton type="submit" size="sm" onClick={() => undefined}>
                    {busy === s.name ? 'Saving…' : 'Save'}
                  </GlassButton>
                  {s.source === 'saved' && (
                    <button type="button" className="dset__icon" aria-label={`Remove ${s.name}`} onClick={() => act(s.name, () => api(`/api/dev/settings/${s.name}`, { method: 'DELETE' }), 'Removed')}>
                      <Trash size={18} />
                    </button>
                  )}
                </form>
              )}
              {engine && s.source && (
                <GlassButton variant="secondary" size="sm" onClick={() => test(s.name, engine)}>
                  {busy === `${s.name}:test` ? 'Testing…' : 'Test'}
                </GlassButton>
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

  if (!brain) return err ? <p className="dev__err" role="alert">{err}</p> : <div className="dev__skel" aria-label="Loading brain" />;

  return (
    <div className="dbrain">
      <section className="dbrain__col glass" aria-labelledby="kn-title">
        <h2 id="kn-title">Knowledge</h2>
        <p className="dbrain__hint">Every agent reads this before it works: brand voice, audience, channels, rules. {brain.isDefault ? 'Starting text comes from the Company Blueprint.' : `Last saved ${fmt(brain.updatedAt)}.`}</p>
        <label className="sr-only" htmlFor="kn">
          Knowledge
        </label>
        <textarea id="kn" rows={18} value={draft} maxLength={12000} onChange={(e) => setDraft(e.target.value)} />
        <div className="dbrain__actions">
          <GlassButton size="sm" onClick={() => run(() => api('/api/dev/brain', { method: 'PUT', body: JSON.stringify({ knowledge: draft }) }), 'Knowledge saved')}>
            Save knowledge
          </GlassButton>
          <GlassButton size="sm" variant="secondary" onClick={() => run(() => api('/api/dev/brain/reset', { method: 'POST', body: '{}' }), 'Reset to blueprint')}>
            Reset to blueprint
          </GlassButton>
          <span className="dbrain__count">{draft.length.toLocaleString('en-IN')} / 12,000</span>
        </div>
      </section>
      <section className="dbrain__col glass" aria-labelledby="notes-title">
        <h2 id="notes-title">Saved notes ({brain.notes.length})</h2>
        <p className="dbrain__hint">Approved posts, what worked, decisions. Use “Save to Brain” on any agent result, or add one here.</p>
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
          <input id="nt" placeholder="Title (optional)" value={note.title} maxLength={120} onChange={(e) => setNote({ ...note, title: e.target.value })} />
          <label className="sr-only" htmlFor="nx">
            Note
          </label>
          <textarea id="nx" rows={3} placeholder="e.g. Carousels on SQL traps get the most saves on LinkedIn" value={note.text} maxLength={4000} required onChange={(e) => setNote({ ...note, text: e.target.value })} />
          <GlassButton type="submit" size="sm" onClick={() => undefined}>
            Add note
          </GlassButton>
        </form>
        <ul className="dbrain__notes">
          {brain.notes.map((n) => (
            <li key={n.id}>
              <div>
                <p className="dbrain__nt">{n.title}</p>
                {n.text !== n.title && <p className="dbrain__nx">{n.text}</p>}
                <p className="dbrain__nm">
                  {n.source} · {fmt(n.createdAt)}
                </p>
              </div>
              <button type="button" className="dset__icon" aria-label={`Delete note ${n.title}`} onClick={() => run(() => api(`/api/dev/brain/notes/${n.id}`, { method: 'DELETE' }), 'Note deleted')}>
                <Trash size={18} />
              </button>
            </li>
          ))}
          {!brain.notes.length && <li className="dbrain__empty">No notes yet.</li>}
        </ul>
      </section>
      {(status || err) && (
        <p className={err ? 'dev__err' : 'dbrain__ok'} role="status">
          {err || status}
        </p>
      )}
    </div>
  );
}
