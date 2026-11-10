// Dev Mode: a standalone console (no public header/footer). Agents, Brain, Settings + Marg.
import { useCallback, useEffect, useState } from 'react';
import { ArrowSquareOut, Bell, Brain, Crown, CaretLeft, ChartLineUp, CopySimple, Database, GearSix, House, Kanban, LinkedinLogo, ListChecks, LockKey, Moon, PaperPlaneTilt, Play, Robot, Rocket, ShieldCheck, SignOut, Sparkle, Sun, UsersThree, X, ChatsCircle } from '@phosphor-icons/react';
import { BrainPanel, SettingsPanel, WorkPanel } from './DevPanels';
import { AnalyticsPanel, InstagramAnalytics, SignalsPanel } from './DevInsights';
import { OverviewPage } from './command/Overview';
import { TelegramApprovalsPage } from './command/TelegramApprovals';
import { BrainPage } from './command/BrainPage';
import { AgentsPage, ApprovalsPage, DeployPage, LeadsPage, LinkedInPage, MemorySearch, SocialPage, TasksBoard } from './command/Pages';
import { QuizStudio } from './command/QuizStudio';
import type { Page } from './command/shared';
import './command/command.css';
import { Assistant } from '../components/Assistant';
import { navigate } from '../lib/router';
import { downloadMarkdown, downloadPdf } from '../lib/download';
import './Dev.css';

type Agent = { id: string; name: string; role: string; mission: string; enabled: boolean };
type Engines = Record<string, { configured: boolean; model: string }>;
type RunResult = { text: string; engine: string; model: string; inputTokens: number | null; outputTokens: number | null; latencyMs: number };
type Tab = Page;

const KEY = 'nts-dev-token'; // sessionStorage only: cleared when the tab closes

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

const NAV: [Tab, string, typeof Robot][][] = [
  [
    ['overview', 'Overview', House],
    ['brain', 'NTS Brain (MCP)', Brain],
    ['agents', 'Agents', Robot],
    ['work', 'Work & Tasks', Kanban],
    ['approvals', 'Approvals', ShieldCheck],
    ['telegram', 'Telegram Approvals', PaperPlaneTilt],
  ],
  [
    ['leads', 'Leads & CRM', UsersThree],
    ['linkedin', 'LinkedIn Studio', LinkedinLogo],
    ['quiz', 'Quiz Studio', ListChecks],
    ['social', 'Social Engagement', ChatsCircle],
    ['analytics', 'Analytics', ChartLineUp],
    ['deploy', 'Deployments', Rocket],
  ],
  [
    ['memory', 'Memory', Database],
    ['settings', 'Settings & Integrations', GearSix],
  ],
];
const TABS = NAV.flat();
const OWNER = 'Commander';

export function Dev({ theme, onToggleTheme }: { theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const [arg, setArg] = useState<string | undefined>();
  const [collapsed, setCollapsed] = useState(false);
  const [cmd, setCmd] = useState('');
  const [approvals, setApprovals] = useState(0);
  const [token, setToken] = useState(readToken);
  const [input, setInput] = useState('');
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [engines, setEngines] = useState<Engines>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState<Agent | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  const bound = useCallback(<T,>(path: string, init?: RequestInit) => api<T>(token, path, init), [token]);
  const onEngines = useCallback((e: Engines) => setEngines(e), []);

  useEffect(() => {
    const onTab = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      if (TABS.some(([k]) => k === t)) setTab(t as Tab);
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

  const go = useCallback((p: Tab, a?: string) => {
    setArg(a);
    setTab(p);
    document.getElementById('main')?.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    if (!token) return;
    const poll = () => api<{ kpis: { approvals: number } }>(token, '/api/dev/overview').then((d) => setApprovals(d.kpis.approvals), () => {});
    poll();
    const t = setInterval(poll, 45_000);
    window.addEventListener('nts:work', poll);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('nc-top-cmd')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(t);
      window.removeEventListener('nts:work', poll);
      window.removeEventListener('keydown', onKey);
    };
  }, [token]);

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

  return (
    <div className={`dx nc ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="dx-side nc-side" aria-label="NTS COMMAND navigation">
        <div className="dx-side__brand nc-brand">
          <img src="/img/intro/logo.jpg" alt="" width={34} height={34} />
          <span>
            <span className="nc-brand__t">
              NTS <b>COMMAND</b>
            </span>
            <small>NIKHILs TECH STUDIO</small>
          </span>
        </div>
        <nav className="dx-nav nc-nav" role="tablist" aria-label="Sections">
          {NAV.map((group, gi) => (
            <div key={gi} className="nc-nav__g">
              {group.map(([k, label, I]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => go(k)} title={label}>
                  <I size={19} aria-hidden="true" />
                  <span>{label}</span>
                  {k === 'approvals' && approvals > 0 && <small className="nc-badge">{approvals}</small>}
                  {k === 'settings' && !engineReady && <i className="dx-dot dx-dot--bad" aria-label="needs setup" />}
                </button>
              ))}
            </div>
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
          <button type="button" className="dx-side__act nc-collapse" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <CaretLeft size={16} /> <span>Collapse</span>
          </button>
        </div>
      </aside>

      <main className="dx-main nc-main" id="main" tabIndex={-1}>
        <header className="nc-top">
          <form
            className="nc-top__cmd"
            onSubmit={(e) => {
              e.preventDefault();
              if (cmd.trim()) {
                go('brain', cmd.trim());
                setCmd('');
              }
            }}
          >
            <Sparkle size={18} aria-hidden="true" />
            <label className="sr-only" htmlFor="nc-top-cmd">
              Ask NTS Brain
            </label>
            <input id="nc-top-cmd" value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder='Ask NTS Brain anything… e.g. "Create 5 LinkedIn posts for next week"' maxLength={4000} />
            <kbd>Ctrl K</kbd>
          </form>
          <button type="button" className="nc-bell" onClick={() => go('approvals')} aria-label={`${approvals} approvals waiting`}>
            <Bell size={22} />
            {approvals > 0 && <i />}
          </button>
          <div className="nc-me">
            <span className="nc-me__av" aria-hidden="true">
              <Crown size={20} weight="fill" />
            </span>
            <span>
              <b>{OWNER}</b>
              <small>Owner</small>
            </span>
          </div>
        </header>
        {tab !== 'overview' && (
          <div className="dx-top nc-title">
            <p className="dx-mono dx-dim">
              nts / command / <span className="dx-accent">{tab}</span>
            </p>
            <h1>{TABS.find(([k]) => k === tab)?.[1]}</h1>
          </div>
        )}

        {tab === 'overview' && <OverviewPage api={bound} go={go} owner={OWNER} />}
        {tab === 'telegram' && <TelegramApprovalsPage api={bound} />}
        {tab === 'brain' && <BrainPage key={arg || 'brain'} token={token} api={bound} initial={arg} onConsumed={() => setArg(undefined)} />}
        {tab === 'agents' && <AgentsPage api={bound} focus={arg} onRun={(a) => setOpen({ ...a, enabled: true })} />}
        {tab === 'work' && (
          <>
            <SignalsPanel api={bound} onOpen={() => go('analytics')} />
            <WorkPanel api={bound} ready={engineReady} />
            <div style={{ height: 14 }} />
            <TasksBoard api={bound} newTask={arg === 'new-task'} />
          </>
        )}
        {tab === 'approvals' && <ApprovalsPage api={bound} go={go} />}
        {tab === 'leads' && <LeadsPage api={bound} />}
        {tab === 'linkedin' && <LinkedInPage api={bound} />}
        {tab === 'quiz' && <QuizStudio api={bound} />}
        {tab === 'social' && <SocialPage api={bound} />}
        {tab === 'analytics' && (
          <>
            <AnalyticsPanel api={bound} />
            <InstagramAnalytics api={bound} />
          </>
        )}
        {tab === 'deploy' && <DeployPage api={bound} />}
        {tab === 'memory' && (
          <>
            <MemorySearch api={bound} />
            <div style={{ height: 14 }} />
            <BrainPanel api={bound} />
          </>
        )}
        {tab === 'settings' && <SettingsPanel api={bound} onEngines={onEngines} />}
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
