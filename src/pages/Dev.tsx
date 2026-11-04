import { useEffect, useMemo, useState } from 'react';
import { LockKey, LockKeyOpen, Robot, X } from '@phosphor-icons/react';
import { GlassButton } from '../components/GlassButton';
import './Dev.css';

type Agent = { id: string; name: string; team: string; teamName: string; role: string; mission: string; ntsRole: string | null; approvalRequired: string[]; enabled: boolean };
type Engines = Record<string, { configured: boolean; model: string }>;
type RunResult = { text: string; engine: string; model: string; inputTokens: number | null; outputTokens: number | null; latencyMs: number };

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
  const d = await r.json().catch(() => ({ error: `Request failed (HTTP ${r.status}). Is the Worker deployed?` }));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d as T;
}

export function Dev() {
  const [token, setToken] = useState(readToken);
  const [input, setInput] = useState('');
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [engines, setEngines] = useState<Engines>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [team, setTeam] = useState('all');
  const [off, setOff] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(OFF_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [open, setOpen] = useState<Agent | null>(null);

  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex, nofollow';
    document.head.appendChild(m);
    return () => m.remove();
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
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const teams = useMemo(() => {
    const t = new Map<string, string>();
    agents?.forEach((a) => t.set(a.team, a.teamName));
    return [...t.entries()];
  }, [agents]);
  const shown = agents?.filter((a) => team === 'all' || a.team === team) ?? [];
  const enabledCount = agents ? agents.filter((a) => !off.includes(a.id)).length : 0;
  const engineReady = Object.values(engines).some((e) => e.configured);

  if (!token || !agents) {
    return (
      <section className="dev wrap" aria-labelledby="dev-title">
        <form className="dev__gate glass" onSubmit={unlock}>
          <LockKey size={40} weight="light" className="card__icon" aria-hidden="true" />
          <h1 id="dev-title">Dev Mode</h1>
          <p>Enter your dev token to open the agent console. The token stays in this tab only.</p>
          <label htmlFor="dev-token" className="dev__label">
            Dev token
          </label>
          <input id="dev-token" type="password" autoComplete="off" spellCheck={false} value={input} onChange={(e) => setInput(e.target.value)} required minLength={8} aria-describedby={error ? 'dev-err' : undefined} />
          {error && (
            <p id="dev-err" className="dev__err" role="alert">
              {error}
            </p>
          )}
          <GlassButton type="submit" onClick={() => undefined} arrow>
            {busy ? 'Checking…' : 'Unlock'}
          </GlassButton>
        </form>
      </section>
    );
  }

  return (
    <section className="dev wrap" aria-labelledby="dev-title">
      <header className="dev__head">
        <div>
          <p className="phero__eyebrow">Dev Mode</p>
          <h1 id="dev-title" className="sec__title">
            Agent <em>console</em>
          </h1>
          <p className="sec__lead">
            {enabledCount} of {agents.length} agents enabled for LinkedIn, Instagram and YouTube. Agents draft text only; nothing is published from here.
          </p>
        </div>
        <div className="dev__headside">
          <p className={`dev__engine ${engineReady ? 'ok' : 'no'}`}>
            {engineReady
              ? `Engine: ${Object.entries(engines)
                  .filter(([, e]) => e.configured)
                  .map(([k, e]) => `${k} (${e.model})`)
                  .join(', ')}`
              : 'No AI engine key set: add GEMINI_API_KEY or GROQ_API_KEY to run agents'}
          </p>
          <GlassButton variant="secondary" size="sm" onClick={lock} icon={<LockKeyOpen size={18} />}>
            Lock
          </GlassButton>
        </div>
      </header>

      {teams.length > 1 && (
      <div className="dev__filters" role="toolbar" aria-label="Filter by team">
        <button type="button" className={team === 'all' ? 'on' : ''} onClick={() => setTeam('all')}>
          All ({agents.length})
        </button>
        {teams.map(([k, n]) => (
          <button key={k} type="button" className={team === k ? 'on' : ''} onClick={() => setTeam(k)}>
            {n}
          </button>
        ))}
        <button type="button" className="dev__all" onClick={() => setOff([])}>
          Enable all
        </button>
      </div>
      )}

      <ul className="dev__grid">
        {shown.map((a) => {
          const enabled = !off.includes(a.id);
          return (
            <li key={a.id} className={`dev__agent glass ${enabled ? '' : 'is-off'}`} style={{ marginTop: 0 }}>
              <div className="dev__agenttop">
                <Robot size={26} weight="light" aria-hidden="true" className="card__icon" />
                <label className="dev__switch">
                  <input type="checkbox" checked={enabled} onChange={() => setOff((o) => (enabled ? [...o, a.id] : o.filter((x) => x !== a.id)))} />
                  <span aria-hidden="true" />
                  <span className="sr-only">{enabled ? `Disable ${a.name}` : `Enable ${a.name}`}</span>
                </label>
              </div>
              <h2>{a.name}</h2>
              <p className="dev__role">{a.role}</p>
              {a.ntsRole && <p className="dev__nts">NTS: {a.ntsRole}</p>}
              <p className="dev__mission">{a.mission}</p>
              <div style={{ marginTop: 'auto', paddingTop: 14 }}>
                {enabled ? (
                  <GlassButton size="sm" onClick={() => setOpen(a)} arrow>
                    Run
                  </GlassButton>
                ) : (
                  <span className="dev__offlabel">Disabled</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {open && <RunPanel token={token} agent={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function RunPanel({ token, agent, onClose }: { token: string; agent: Agent; onClose: () => void }) {
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<RunResult | null>(null);
  const [err, setErr] = useState('');

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
    try {
      setRes(await api<RunResult>(token, `/api/dev/agents/${agent.id}/run`, { method: 'POST', body: JSON.stringify({ task }) }));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dev__runwrap" role="dialog" aria-modal="true" aria-labelledby="run-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dev__run glass" onSubmit={run}>
        <button type="button" className="dev__x" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <h2 id="run-title">
          {agent.name} <span>{agent.role}</span>
        </h2>
        <label htmlFor="task" className="dev__label">
          Task
        </label>
        <textarea id="task" rows={5} value={task} onChange={(e) => setTask(e.target.value)} minLength={3} maxLength={4000} required placeholder="Describe the task for this agent" autoFocus />
        <GlassButton type="submit" onClick={() => undefined} arrow>
          {busy ? 'Running…' : 'Run agent'}
        </GlassButton>
        {err && (
          <p className="dev__err" role="alert">
            {err}
          </p>
        )}
        {res && (
          <div className="dev__out" aria-live="polite">
            <p className="dev__meta">
              {res.engine} · {res.model} · {res.inputTokens ?? '?'} in / {res.outputTokens ?? '?'} out tokens · {(res.latencyMs / 1000).toFixed(1)}s
            </p>
            <pre>{res.text}</pre>
          </div>
        )}
      </form>
    </div>
  );
}
