// Dev Mode: a standalone console (no public header/footer). Agents, Brain, Settings + Marg.
import { useCallback, useEffect, useState } from 'react';
import { ArrowSquareOut, Brain, ChartLineUp, CopySimple, GearSix, Kanban, LockKey, Moon, Play, Robot, SignOut, Sun, X } from '@phosphor-icons/react';
import { BrainPanel, SettingsPanel, WorkPanel } from './DevPanels';
import { AnalyticsPanel, SignalsPanel } from './DevInsights';
import { Assistant } from '../components/Assistant';
import { navigate } from '../lib/router';
import { downloadMarkdown, downloadPdf } from '../lib/download';
import './Dev.css';

type Agent = { id: string; name: string; role: string; mission: string; enabled: boolean };
type Engines = Record<string, { configured: boolean; model: string }>;
type RunResult = { text: string; engine: string; model: string; inputTokens: number | null; outputTokens: number | null; latencyMs: number };
type Tab = 'work' | 'analytics' | 'agents' | 'brain' | 'settings';

const KEY = 'nts-dev-token'; // sessionStorage only: cleared when the tab closes
const OFF_KEY = 'nts-dev-off';

function readToken() {
  try {
    return sessionStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const d = await r.json().catch(() => ({ error: `Request failed (HTTP ${r.status}).` }));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d as T;
}

const TABS: [Tab, string, typeof Robot][] = [
  ['work', 'Work', Kanban],
  ['analytics', 'Analytics', ChartLineUp],
  ['agents', 'Agents', Robot],
  ['brain', 'Brain', Brain],
  ['settings', 'Settings', GearSix],
];

export function Dev({ theme, onToggleTheme }: { theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const [token, setToken] = useState(readToken);
  const [input, setInput] = useState('');
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [engines, setEngines] = useState<Engines>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(OFF_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [open, setOpen] = useState<Agent | null>(null);
  const [tab, setTab] = useState<Tab>('work');
  const bound = useCallback(<T,>(path: string, init?: RequestInit) => api<T>(token, path, init), [token]);
  const onEngines = useCallback((e: Engines) => setEngines(e), []);

  useEffect(() => {
    const onTab = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      if (t === 'work' || t === 'analytics' || t === 'agents' || t === 'brain' || t === 'settings') setTab(t);
    };
    window.addEventListener('nts:devtab', onTab);
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex, nofollow';
    document.head.appendChild(m);
    document.body.classList.add('is-dev');
    return () => {
      window.removeEventListener('nts:devtab', onTab);
      m.remove();
      document.body.classList.remove('is-dev');
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    api<{ agents: Agent[]; engines: Engines }>(token, '/api/dev/agents')
      .then((d) => {
        if (!alive) return;
        setAgents(d.agents);
        setEngines(d.engines);
        setError('');
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message);
        setAgents(null);
        if (/token/i.test(e.message)) lock();
      });
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    try {
      sessionStorage.setItem(OFF_KEY, JSON.stringify(off));
    } catch {
      /* ignore */
    }
  }, [off]);

  function lock() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setToken('');
    setAgents(null);
    window.dispatchEvent(new Event('nts:devtoken'));
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(input.trim(), '/api/dev/session', { method: 'POST', body: '{}' });
      try {
        sessionStorage.setItem(KEY, input.trim());
      } catch {
        /* token then lives in memory only */
      }
      setToken(input.trim());
      setInput('');
      window.dispatchEvent(new Event('nts:devtoken'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const engineList = Object.entries(engines);
  const engineReady = engineList.some(([, e]) => e.configured);

  if (!token || !agents) {
    return (
      <div className="dx dx--gate">
        <form className="dx-gate" onSubmit={unlock}>
          <div className="dx-gate__brand">
            <img src="/img/intro/logo.jpg" alt="" width={36} height={36} />
            <span>
              NTS <b>dev</b>
            </span>
          </div>
          <p className="dx-mono dx-dim">
            <span className="dx-accent">nts@dev</span>:~$ authenticate
          </p>
          <label htmlFor="dev-token" className="dx-label">
            Dev token
          </label>
          <div className="dx-gate__row">
            <LockKey size={18} className="dx-dim" aria-hidden="true" />
            <input id="dev-token" type="password" autoComplete="off" spellCheck={false} value={input} onChange={(e) => setInput(e.target.value)} required minLength={8} autoFocus aria-describedby={error ? 'dev-err' : undefined} />
          </div>
          {error && (
            <p id="dev-err" className="dx-err" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="dx-btn dx-btn--primary" disabled={busy}>
            {busy ? 'Checking…' : 'Unlock'}
          </button>
          <button type="button" className="dx-link" onClick={() => navigate('/')}>
            ← Back to website
          </button>
        </form>
      </div>
    );
  }

  const enabled = agents.filter((a) => !off.includes(a.id)).length;

  return (
    <div className="dx">
      <aside className="dx-side" aria-label="Dev navigation">
        <div className="dx-side__brand">
          <img src="/img/intro/logo.jpg" alt="" width={30} height={30} />
          <span>
            NTS <b>dev</b>
          </span>
        </div>
        <nav className="dx-nav" role="tablist" aria-label="Dev sections">
          {TABS.map(([k, label, I]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <I size={18} aria-hidden="true" />
              <span>{label}</span>
              {k === 'agents' && <small>{enabled}</small>}
              {k === 'settings' && !engineReady && <i className="dx-dot dx-dot--bad" aria-label="needs setup" />}
            </button>
          ))}
        </nav>
        <div className="dx-side__foot">
          <p className="dx-label">Engines</p>
          {engineList.map(([k, e]) => (
            <p key={k} className="dx-eng" title={e.model}>
              <i className={`dx-dot ${e.configured ? 'dx-dot--ok' : ''}`} />
              <span>{k}</span>
              <small className="dx-mono">{e.configured ? e.model.replace(/^.*\//, '') : 'off'}</small>
            </p>
          ))}
          <button type="button" className="dx-side__act" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} <span>{theme === 'dark' ? 'Light' : 'Dark'} theme</span>
          </button>
          <button type="button" className="dx-side__act" onClick={() => navigate('/')}>
            <ArrowSquareOut size={16} /> <span>Website</span>
          </button>
          <button type="button" className="dx-side__act" onClick={lock}>
            <SignOut size={16} /> <span>Lock</span>
          </button>
        </div>
      </aside>

      <main className="dx-main" id="main" tabIndex={-1}>
        <header className="dx-top">
          <p className="dx-mono dx-dim">
            nts / dev / <span className="dx-accent">{tab}</span>
          </p>
          <h1>{TABS.find(([k]) => k === tab)?.[1]}</h1>
        </header>

        {tab === 'work' && (
          <>
            <SignalsPanel api={bound} onOpen={() => setTab('analytics')} />
            <WorkPanel api={bound} ready={engineReady} />
          </>
        )}
        {tab === 'analytics' && <AnalyticsPanel api={bound} />}
        {tab === 'settings' && <SettingsPanel api={bound} onEngines={onEngines} />}
        {tab === 'brain' && <BrainPanel api={bound} />}
        {tab === 'agents' && (
          <ul className="dx-agents">
            {agents.map((a) => {
              const on = !off.includes(a.id);
              return (
                <li key={a.id} className={`dx-card dx-agent ${on ? '' : 'is-off'}`}>
                  <span className="dx-agent__icon" aria-hidden="true">
                    <Robot size={20} />
                  </span>
                  <div className="dx-agent__body">
                    <p className="dx-agent__name">{a.name}</p>
                    <p className="dx-mono dx-dim">{a.role.replace(/ agent$/i, '')}</p>
                  </div>
                  <label className="dx-switch">
                    <input type="checkbox" checked={on} onChange={() => setOff((o) => (on ? [...o, a.id] : o.filter((x) => x !== a.id)))} />
                    <span aria-hidden="true" />
                    <span className="sr-only">{on ? `Disable ${a.name}` : `Enable ${a.name}`}</span>
                  </label>
                  <button type="button" className="dx-btn dx-btn--primary" disabled={!on || !engineReady} onClick={() => setOpen(a)} title={engineReady ? 'Run' : 'Add an AI key in Settings'}>
                    <Play size={14} weight="fill" /> Run
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {open && <RunPanel token={token} agent={open} onClose={() => setOpen(null)} />}
      <Assistant kind="marg" token={token} />
    </div>
  );
}

function RunPanel({ token, agent, onClose }: { token: string; agent: Agent; onClose: () => void }) {
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<RunResult | null>(null);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setRes(null);
    setSaved('');
    try {
      setRes(await api<RunResult>(token, `/api/dev/agents/${agent.id}/run`, { method: 'POST', body: JSON.stringify({ task }) }));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveToBrain() {
    if (!res) return;
    try {
      await api(token, '/api/dev/brain/notes', { method: 'POST', body: JSON.stringify({ title: `${agent.name}: ${task.slice(0, 80)}`, text: res.text.slice(0, 4000), source: agent.name }) });
      setSaved('saved to brain');
    } catch (x) {
      setSaved((x as Error).message);
    }
  }

  return (
    <div className="dx-drawer" role="dialog" aria-modal="true" aria-labelledby="run-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dx-drawer__panel" onSubmit={run}>
        <header className="dx-drawer__head">
          <div>
            <p className="dx-mono dx-dim">run / {agent.role.replace(/ agent$/i, '')}</p>
            <h2 id="run-title">{agent.name}</h2>
          </div>
          <button type="button" className="dx-iconbtn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <label htmlFor="task" className="dx-label">
          Task
        </label>
        <textarea id="task" className="dx-input" rows={5} value={task} onChange={(e) => setTask(e.target.value)} minLength={3} maxLength={4000} required placeholder="e.g. 3 LinkedIn post ideas on SQL JOIN mistakes" autoFocus />
        <button type="submit" className="dx-btn dx-btn--primary" disabled={busy}>
          <Play size={14} weight="fill" /> {busy ? 'Running…' : 'Run agent'}
        </button>
        {err && (
          <p className="dx-err" role="alert">
            {err}
          </p>
        )}
        {res && (
          <div className="dx-out" aria-live="polite">
            <p className="dx-mono dx-dim">
              {res.engine} · {res.model} · {res.inputTokens ?? '?'}→{res.outputTokens ?? '?'} tok · {(res.latencyMs / 1000).toFixed(1)}s
            </p>
            <pre>{res.text}</pre>
            <div className="dx-row">
              <button type="button" className="dx-btn" onClick={() => navigator.clipboard?.writeText(res.text)}>
                <CopySimple size={14} /> Copy
              </button>
              <button type="button" className="dx-btn" onClick={saveToBrain}>
                <Brain size={14} /> Save to Brain
              </button>
              <button type="button" className="dx-btn" onClick={() => downloadPdf(`${agent.name} - ${task.slice(0, 50)}`, res.text)}>
                PDF
              </button>
              <button type="button" className="dx-btn" onClick={() => downloadMarkdown(`${agent.name} - ${task.slice(0, 50)}`, res.text)}>
                .md
              </button>
              {saved && <span className="dx-mono dx-dim">{saved}</span>}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
