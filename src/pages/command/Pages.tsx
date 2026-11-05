// NTS COMMAND module pages. Every number comes from stored records or a live integration;
// integrations without credentials show a clear "not connected" state.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowSquareOut, CheckCircle, CircleNotch, Copy, GitBranch, Heartbeat, LinkedinLogo, MagnifyingGlass, Play, Plus, Rocket, ShieldCheck, Trash, UsersThree, XCircle, YoutubeLogo, InstagramLogo, PaperPlaneTilt, CalendarBlank, PencilSimpleLine } from '@phosphor-icons/react';
import type { Api, Go } from './shared';
import { Card, Empty, Pill, ago, toneOf, when } from './shared';
import { LinkedInPreview } from './LinkedInPreview';
import { lintPost, polishPost } from '../../../worker/postfmt.mjs';

const tool = <T,>(api: Api, name: string, args: object = {}) => api<{ ok: boolean; task: string; result: T }>('/api/dev/tool', { method: 'POST', body: JSON.stringify({ name, args }) }).then((r) => r.result);

// ---------------- Agents ----------------
type AgentRow = { id: string; name: string; code: string; teamName: string; mission: string; covers: string[]; tools: string[]; approvalRequired: string[] };
type Task = { id: string; title: string; agent: string | null; tool: string | null; status: string; error: string | null; output: string | null; createdAt: string; updatedAt: string; ms: number | null; priority: string; commandId: string | null; args?: unknown };

export function AgentsPage({ api, onRun, focus }: { api: Api; onRun: (a: { id: string; name: string; role: string; mission: string }) => void; focus?: string }) {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => {
    api<{ agents: AgentRow[] }>('/api/dev/agents').then((d) => setAgents(d.agents));
    api<{ tasks: Task[] }>('/api/dev/tasks').then((d) => setTasks(d.tasks));
  }, [api]);
  useEffect(() => {
    if (focus) document.getElementById(`ag-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [focus, agents]);
  return (
    <div className="pg">
      <p className="ov-muted pg-lead">Six specialists, chosen for what NTS actually does. Strategy, planning and coordination are the NTS Brain’s own job, so they are not separate agents.</p>
      <ul className="ag-grid">
        {agents.map((a) => {
          const mine = tasks.filter((t) => t.agent === a.id);
          const ok = mine.filter((t) => t.status === 'completed').length;
          const bad = mine.filter((t) => t.status === 'failed').length;
          const avg = mine.filter((t) => t.ms).reduce((s, t, _, arr) => s + (t.ms || 0) / arr.length, 0);
          const running = mine.some((t) => t.status === 'in_progress');
          return (
            <li key={a.id} id={`ag-${a.id}`} className={`nc-card ag ${focus === a.id ? 'is-focus' : ''}`}>
              <header>
                <div>
                  <h3>{a.name}</h3>
                  <p className="dx-mono ov-muted">
                    {a.code} · {a.teamName}
                  </p>
                </div>
                <Pill tone={running ? 'live' : 'idle'}>{running ? 'Running' : 'Ready'}</Pill>
              </header>
              <p>{a.mission}</p>
              <p className="ag-covers">
                <b>Covers:</b> {a.covers.join(', ')}
              </p>
              <div className="ag-tools">
                {a.tools.map((t) => (
                  <code key={t}>{t}</code>
                ))}
              </div>
              {a.approvalRequired.length > 0 && <p className="ov-muted">Needs your approval for: {a.approvalRequired.join(', ').replace(/_/g, ' ')}</p>}
              <dl className="ag-stats">
                <div>
                  <dt>Done</dt>
                  <dd>{ok}</dd>
                </div>
                <div>
                  <dt>Failed</dt>
                  <dd>{bad}</dd>
                </div>
                <div>
                  <dt>Success</dt>
                  <dd>{ok + bad ? `${Math.round((ok / (ok + bad)) * 100)}%` : '—'}</dd>
                </div>
                <div>
                  <dt>Avg time</dt>
                  <dd>{avg ? `${(avg / 1000).toFixed(1)}s` : '—'}</dd>
                </div>
              </dl>
              {mine[0] && (
                <p className="ov-muted">
                  Last: {mine[0].title} · {mine[0].status} · {ago(mine[0].updatedAt)}
                </p>
              )}
              <button type="button" className="dx-btn dx-btn--primary" onClick={() => onRun({ id: a.id, name: a.name, role: `${a.code} agent`, mission: a.mission })}>
                <Play size={14} weight="fill" /> Give a task
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------- Tasks board ----------------
const COLS: [string, string][] = [
  ['backlog', 'Backlog'],
  ['planned', 'Planned'],
  ['in_progress', 'In progress'],
  ['waiting', 'Waiting for approval'],
  ['completed', 'Completed'],
  ['failed', 'Failed'],
];
export function TasksBoard({ api, newTask }: { api: Api; newTask?: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agent, setAgent] = useState('all');
  const [title, setTitle] = useState('');
  const [open, setOpen] = useState<Task | null>(null);
  const load = useCallback(() => api<{ tasks: Task[] }>('/api/dev/tasks').then((d) => setTasks(d.tasks)), [api]);
  useEffect(() => {
    load();
    window.addEventListener('nts:work', load);
    return () => window.removeEventListener('nts:work', load);
  }, [load]);
  const agents = useMemo(() => [...new Set(tasks.map((t) => t.agent).filter(Boolean))] as string[], [tasks]);
  const shown = tasks.filter((t) => agent === 'all' || t.agent === agent);
  const move = async (t: Task, status: string) => {
    await api(`/api/dev/tasks/${t.id}`, { method: 'POST', body: JSON.stringify({ status }) });
    load();
  };
  return (
    <Card
      title="Tasks & workflows"
      action={
        <select className="dx-input nc-select" value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Filter by agent">
          <option value="all">All agents</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      }
    >
      <form
        className="dx-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (title.trim().length < 3) return;
          await api('/api/dev/tasks', { method: 'POST', body: JSON.stringify({ title }) });
          setTitle('');
          load();
        }}
      >
        <label className="sr-only" htmlFor="nt-title">
          New task
        </label>
        <input id="nt-title" className="dx-input" style={{ flex: 1 }} autoFocus={newTask} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New backlog task (or give the Brain a command to plan and run it)" maxLength={160} />
        <button type="submit" className="dx-btn dx-btn--primary">
          <Plus size={14} /> Add
        </button>
      </form>
      <div className="tb">
        {COLS.map(([k, label]) => {
          const col = shown.filter((t) => t.status === k);
          return (
            <section key={k} className="tb-col">
              <h3>
                {label} <small>{col.length}</small>
              </h3>
              <ul>
                {col.slice(0, 25).map((t) => (
                  <li key={t.id}>
                    <button type="button" className="tb-card" onClick={() => setOpen(open?.id === t.id ? null : t)}>
                      <b>{t.title}</b>
                      <small>
                        {t.agent || 'brain'} · {ago(t.updatedAt)}
                      </small>
                    </button>
                    {open?.id === t.id && (
                      <div className="tb-detail">
                        {t.tool && <code>{t.tool}</code>}
                        {t.error && <p className="dx-err">{t.error}</p>}
                        {t.output && <pre>{t.output.slice(0, 1500)}</pre>}
                        <div className="dx-row">
                          {k === 'backlog' && (
                            <button type="button" className="dx-btn" onClick={() => move(t, 'planned')}>
                              Plan
                            </button>
                          )}
                          {(k === 'backlog' || k === 'planned') && (
                            <button type="button" className="dx-btn" onClick={() => move(t, 'completed')}>
                              Mark done
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------- Approvals ----------------
type WorkItem = { id: string; agentName: string; channel: string; title: string; body: string; status: string; createdAt: string; url?: string; scheduledFor?: string; postedUrl?: string };
type Comment = { id: string; author: string; text: string; reply: string; intent: string; sentiment: string; language: string; escalate: boolean; reason: string; status: string; at: string; url: string; likes: number };

export function ApprovalsPage({ api, go }: { api: Api; go: Go }) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const load = useCallback(() => {
    api<{ items: WorkItem[] }>('/api/dev/work').then((d) => setItems(d.items.filter((i) => i.status === 'waiting')));
    api<{ tasks: Task[] }>('/api/dev/tasks').then((d) => setTasks(d.tasks.filter((t) => t.status === 'waiting')));
    api<{ comments: Comment[] }>('/api/dev/social').then((d) => setComments(d.comments.filter((c) => c.status === 'pending' || c.status === 'escalated')));
  }, [api]);
  useEffect(load, [load]);
  const act = async (key: string, path: string, b: object = {}) => {
    setBusy(key);
    try {
      await api(path, { method: 'POST', body: JSON.stringify(b) });
      window.dispatchEvent(new Event('nts:work'));
      load();
    } finally {
      setBusy('');
    }
  };
  const total = items.length + tasks.length + comments.length;
  return (
    <div className="pg">
      <p className="ov-muted pg-lead">Everything external or sensitive waits here: drafts to publish, held Brain steps, comment replies and escalations. Approving a draft teaches the team; rejecting with a reason teaches it too.</p>
      {!total && <Empty>Nothing needs your approval right now.</Empty>}
      {tasks.length > 0 && (
        <Card title={`Held Brain steps (${tasks.length})`} icon={<ShieldCheck size={20} />}>
          <ul className="ap-list">
            {tasks.map((t) => (
              <li key={t.id}>
                <div>
                  <b>{t.title}</b>
                  <small>
                    <code>{t.tool}</code> · {JSON.stringify(t.args ?? {})} · {ago(t.createdAt)}
                  </small>
                </div>
                <div className="dx-row">
                  <button type="button" className="dx-btn dx-btn--primary" disabled={busy === t.id} onClick={() => act(t.id, `/api/dev/tasks/${t.id}/approve`)}>
                    <CheckCircle size={14} /> Approve & run
                  </button>
                  <button type="button" className="dx-btn" onClick={() => act(t.id, `/api/dev/tasks/${t.id}/reject`, { reason: reason[t.id] || '' })}>
                    <XCircle size={14} /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {items.length > 0 && (
        <Card title={`Drafts to approve (${items.length})`} icon={<PaperPlaneTilt size={20} />}>
          <ul className="ap-list">
            {items.map((it) => (
              <li key={it.id} className="ap-draft">
                <div>
                  <b>
                    <Pill tone="idle">{it.channel}</Pill> {it.title}
                  </b>
                  <small>
                    {it.agentName} · {ago(it.createdAt)}
                  </small>
                  <pre>{it.body}</pre>
                  {it.url && (
                    <a href={it.url} target="_blank" rel="noreferrer">
                      ↗ lead thread
                    </a>
                  )}
                </div>
                <div className="ap-acts">
                  <input className="dx-input" placeholder="Reason / change request (optional)" value={reason[it.id] || ''} onChange={(e) => setReason({ ...reason, [it.id]: e.target.value })} aria-label="Reason" />
                  <div className="dx-row">
                    <button type="button" className="dx-btn dx-btn--primary" disabled={busy === it.id} onClick={() => act(it.id, `/api/dev/work/${it.id}/approve`, { reason: reason[it.id] || '' })}>
                      <CheckCircle size={14} /> Approve
                    </button>
                    <button type="button" className="dx-btn" disabled={busy === it.id} onClick={() => act(it.id, `/api/dev/work/${it.id}/reject`, { reason: reason[it.id] || '' })}>
                      <XCircle size={14} /> Reject
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {comments.length > 0 && (
        <Card
          title={`Comment replies (${comments.length})`}
          icon={<YoutubeLogo size={20} />}
          action={
            <button type="button" className="nc-link" onClick={() => go('social')}>
              Open Social
            </button>
          }
        >
          <ul className="ap-list">
            {comments.slice(0, 8).map((c) => (
              <li key={c.id}>
                <div>
                  <b>
                    {c.author}: “{c.text.slice(0, 140)}”
                  </b>
                  <small>
                    {c.intent} · {c.sentiment} · {c.status === 'escalated' ? `escalated: ${c.reason}` : `reply: ${c.reply}`}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ---------------- Leads & CRM ----------------
type Lead = { id: string; source: string; title: string; text: string; url: string; at: string; score: number; state: string; draft?: { text: string; at: string } };
const STAGES = ['new', 'drafted', 'contacted', 'responded', 'qualified', 'meeting', 'won', 'lost', 'ignored'];

export function LeadsPage({ api }: { api: Api }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stage, setStage] = useState('open');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [add, setAdd] = useState({ title: '', text: '', source: 'WhatsApp', url: '' });
  const [copied, setCopied] = useState('');
  const load = useCallback(() => tool<{ leads: Lead[] }>(api, 'nts_get_leads', { limit: 80 }).then((r) => setLeads(r.leads), (e: Error) => setErr(e.message)), [api]);
  useEffect(() => {
    load();
  }, [load]);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr('');
    try {
      await fn();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const shown = leads.filter((l) => (stage === 'open' ? !['won', 'lost', 'ignored'].includes(l.state) : stage === 'all' ? true : l.state === stage));
  const count = (s: string) => leads.filter((l) => l.state === s).length;
  const sources = [...new Set(leads.map((l) => l.source.split(' ')[0]))];
  return (
    <div className="pg">
      <section className="ld-funnel">
        {['new', 'drafted', 'contacted', 'responded', 'qualified', 'meeting', 'won'].map((s) => (
          <button key={s} type="button" className={`nc-card ld-stage ${stage === s ? 'on' : ''}`} onClick={() => setStage(stage === s ? 'open' : s)}>
            <b>{count(s)}</b>
            <small>{s}</small>
          </button>
        ))}
      </section>
      <div className="dx-row">
        <button type="button" className="dx-btn dx-btn--primary" disabled={busy === 'scan'} onClick={() => run('scan', () => tool(api, 'nts_scan_leads'))}>
          <MagnifyingGlass size={14} /> {busy === 'scan' ? 'Scanning…' : 'Find leads now'}
        </button>
        <select className="dx-input nc-select" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stage filter">
          <option value="open">Open</option>
          <option value="all">All</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="ov-muted">
          {leads.length} leads · sources: {sources.join(', ') || '—'}
        </span>
      </div>
      {err && <p className="dx-err">{err}</p>}
      <div className="ld-wrap">
        <ul className="ld-list">
          {shown.map((l) => (
            <li key={l.id} className="nc-card ld">
              <header>
                <a href={l.url || undefined} target="_blank" rel="noreferrer">
                  {l.title}
                </a>
                <Pill tone={toneOf(l.state)}>{l.state}</Pill>
              </header>
              <p className="ov-muted">{l.text.slice(0, 260)}</p>
              <p className="dx-mono ov-muted">
                {l.source} · intent {l.score}/10 · {ago(l.at)}
              </p>
              {l.draft && (
                <div className="ld-draft">
                  <p className="dx-label">Drafted reply · send it yourself</p>
                  <pre>{l.draft.text}</pre>
                  <button
                    type="button"
                    className="dx-btn"
                    onClick={() => {
                      navigator.clipboard?.writeText(l.draft!.text);
                      setCopied(l.id);
                      setTimeout(() => setCopied(''), 1500);
                    }}
                  >
                    <Copy size={14} /> {copied === l.id ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}
              <div className="dx-row">
                <button type="button" className="dx-btn" disabled={busy === l.id} onClick={() => run(l.id, () => tool(api, 'nts_draft_lead_reply', { id: l.id }))}>
                  {busy === l.id ? <CircleNotch size={14} className="spin" /> : <PaperPlaneTilt size={14} />} {l.draft ? 'Redraft reply' : 'Draft reply'}
                </button>
                <label className="sr-only" htmlFor={`st-${l.id}`}>
                  Stage
                </label>
                <select id={`st-${l.id}`} className="dx-input nc-select" value={l.state} onChange={(e) => run(`${l.id}s`, () => tool(api, 'nts_update_lead', { id: l.id, stage: e.target.value }))}>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {l.url && (
                  <a className="dx-btn" href={l.url} target="_blank" rel="noreferrer">
                    <ArrowSquareOut size={14} /> Open
                  </a>
                )}
              </div>
            </li>
          ))}
          {!shown.length && <Empty>No leads here. “Find leads now” scans Hacker News, Reddit and Mastodon for people asking about SQL, data careers and AI tools.</Empty>}
        </ul>
        <Card title="Add an enquiry" icon={<UsersThree size={20} />}>
          <form
            className="ld-add"
            onSubmit={(e) => {
              e.preventDefault();
              run('add', async () => {
                await api('/api/dev/leads', { method: 'POST', body: JSON.stringify(add) });
                setAdd({ title: '', text: '', source: 'WhatsApp', url: '' });
              });
            }}
          >
            <input className="dx-input" required placeholder="Name / company" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} aria-label="Name" />
            <select className="dx-input" value={add.source} onChange={(e) => setAdd({ ...add, source: e.target.value })} aria-label="Source">
              {['WhatsApp', 'Instagram DM', 'LinkedIn', 'Email', 'Website', 'Event', 'Referral'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <textarea className="dx-input" rows={4} placeholder="What did they ask?" value={add.text} onChange={(e) => setAdd({ ...add, text: e.target.value })} aria-label="Enquiry" />
            <input className="dx-input" placeholder="Link (optional)" value={add.url} onChange={(e) => setAdd({ ...add, url: e.target.value })} aria-label="Link" />
            <button type="submit" className="dx-btn dx-btn--primary" disabled={busy === 'add'}>
              <Plus size={14} /> Add lead
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

// ---------------- LinkedIn Studio ----------------
export function LinkedInPage({ api }: { api: Api }) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [posted, setPosted] = useState<Record<string, string>>({});
  const [look, setLook] = useState<Record<string, boolean>>({});
  const [li, setLi] = useState<{ configured: boolean; connected: boolean; expired: boolean; name: string | null; expiresAt: string | null; redirectUri: string } | null>(null);
  const load = useCallback(() => {
    api<{ items: WorkItem[] }>('/api/dev/work').then((d) => setItems(d.items.filter((i) => i.channel === 'LinkedIn')));
    api<typeof li>('/api/dev/linkedin').then(setLi, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);
  const connectLi = async () => {
    setErr('');
    try {
      window.location.href = (await api<{ url: string }>('/api/dev/linkedin/connect', { method: 'POST', body: '{}' })).url;
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const postNow = async (id: string) => {
    setBusy(id);
    setErr('');
    try {
      await api(`/api/dev/linkedin/publish/${id}`, { method: 'POST', body: '{}' });
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  useEffect(() => {
    load();
  }, [load]);
  const save = async (id: string, b: object) => {
    setErr('');
    try {
      await api(`/api/dev/work/${id}`, { method: 'POST', body: JSON.stringify(b) });
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const groups: [string, WorkItem[]][] = [
    ['Drafts waiting for approval', items.filter((i) => i.status === 'waiting')],
    ['Approved · ready to post', items.filter((i) => i.status === 'ready' && !i.postedUrl)],
    ['Published', items.filter((i) => i.postedUrl)],
  ];
  const cal = items.filter((i) => i.scheduledFor && !i.postedUrl).sort((a, b) => Date.parse(a.scheduledFor!) - Date.parse(b.scheduledFor!));
  return (
    <div className="pg">
      <Card
        title="LinkedIn account"
        icon={<LinkedinLogo size={20} />}
        action={
          li?.connected ? (
            <Pill tone="ok">Connected{li.name ? ` · ${li.name}` : ''}</Pill>
          ) : (
            <Pill tone="warn">{li?.expired ? 'Sign-in expired' : 'Not connected'}</Pill>
          )
        }
      >
        {li?.connected ? (
          <div className="dx-row">
            <span className="ov-muted">Approved drafts post to this personal profile. Sign-in valid until {when(li.expiresAt)} (LinkedIn asks again every 60 days).</span>
            <button type="button" className="nc-link" onClick={() => api('/api/dev/linkedin', { method: 'DELETE' }).then(load)}>
              Disconnect
            </button>
          </div>
        ) : li?.configured ? (
          <button type="button" className="dx-btn dx-btn--primary" onClick={connectLi}>
            <LinkedinLogo size={14} /> {li.expired ? 'Reconnect LinkedIn' : 'Connect LinkedIn'}
          </button>
        ) : (
          <p className="ov-muted">
            Create a LinkedIn developer app with the self-serve products “Sign In with LinkedIn using OpenID Connect” and “Share on LinkedIn”, add redirect URL <code className="br-code" style={{ display: 'inline-block', margin: 0 }}>{li?.redirectUri}</code>, then save LI_CLIENT_ID and LI_CLIENT_SECRET in Settings.
          </p>
        )}
      </Card>
      <Card title="New LinkedIn posts" icon={<PencilSimpleLine size={20} />}>
        <form
          className="dx-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (topic.trim().length < 3) return;
            setBusy('new');
            setErr('');
            try {
              await tool(api, 'nts_create_linkedin_post', { topic, count: 3 });
              setTopic('');
              load();
            } catch (x) {
              setErr((x as Error).message);
            } finally {
              setBusy('');
            }
          }}
        >
          <label className="sr-only" htmlFor="li-topic">
            Topic
          </label>
          <input id="li-topic" className="dx-input" style={{ flex: 1 }} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic, e.g. 3 SQL JOIN mistakes freshers make" maxLength={500} />
          <button type="submit" className="dx-btn dx-btn--primary" disabled={busy === 'new'}>
            {busy === 'new' ? 'Writing…' : 'Write 3 drafts'}
          </button>
        </form>
        <p className="ov-muted">Research → draft → your review → schedule → post. Approved posts go out with “Post now” or automatically at their scheduled time (checked every hour). Personal profile only: Company Page posting needs LinkedIn’s Community Management API review.</p>
        {err && <p className="dx-err">{err}</p>}
      </Card>
      {cal.length > 0 && (
        <Card title="Content calendar" icon={<CalendarBlank size={20} />}>
          <ul className="li-cal">
            {cal.map((i) => (
              <li key={i.id}>
                <b>{new Date(i.scheduledFor!).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</b> {i.title}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {groups.map(([label, list]) => (
        <Card key={label} title={`${label} (${list.length})`}>
          <ul className="li-list">
            {list.map((i) => (
              <li key={i.id} className="li-post">
                <div className="li-preview">
                  <div className="lip-tabs" role="tablist" aria-label={`View ${i.title}`}>
                    <button type="button" role="tab" aria-selected={!look[i.id]} className={look[i.id] ? '' : 'on'} onClick={() => setLook({ ...look, [i.id]: false })}>
                      <PencilSimpleLine size={13} /> {i.postedUrl ? 'Text' : 'Edit'}
                    </button>
                    <button type="button" role="tab" aria-selected={Boolean(look[i.id])} className={look[i.id] ? 'on' : ''} onClick={() => setLook({ ...look, [i.id]: true })}>
                      <LinkedinLogo size={13} /> LinkedIn preview
                    </button>
                  </div>
                  {look[i.id] ? (
                    <LinkedInPreview text={edit[i.id] ?? i.body} name={li?.name || 'Your name'} headline="NIKHILs TECH STUDIO" />
                  ) : (
                    <textarea className="dx-input" rows={8} value={edit[i.id] ?? i.body} onChange={(e) => setEdit({ ...edit, [i.id]: e.target.value })} aria-label={`Edit ${i.title}`} disabled={Boolean(i.postedUrl)} />
                  )}
                  <small className="ov-muted">{(edit[i.id] ?? i.body).length} / 3000 characters</small>
                  {!i.postedUrl && lintPost(edit[i.id] ?? i.body).length > 0 && (
                    <div className="lip-lint" role="status">
                      <ul>
                        {lintPost(edit[i.id] ?? i.body).map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                      {polishPost(edit[i.id] ?? i.body) !== (edit[i.id] ?? i.body) && (
                        <button type="button" className="dx-btn" onClick={() => setEdit({ ...edit, [i.id]: polishPost(edit[i.id] ?? i.body) })}>
                          Fix format
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="li-side">
                  <b>{i.title}</b>
                  <small className="ov-muted">
                    {i.agentName} · {ago(i.createdAt)}
                  </small>
                  {edit[i.id] !== undefined && edit[i.id] !== i.body && (
                    <button type="button" className="dx-btn" onClick={() => save(i.id, { body: edit[i.id] }).then(() => setEdit((x) => ({ ...x, [i.id]: undefined as unknown as string })))}>
                      Save edit
                    </button>
                  )}
                  {i.status === 'waiting' && (
                    <div className="dx-row">
                      <button type="button" className="dx-btn dx-btn--primary" onClick={() => api(`/api/dev/work/${i.id}/approve`, { method: 'POST', body: '{}' }).then(load)}>
                        Approve
                      </button>
                      <button type="button" className="dx-btn" onClick={() => api(`/api/dev/work/${i.id}/reject`, { method: 'POST', body: '{}' }).then(load)}>
                        Reject
                      </button>
                    </div>
                  )}
                  {!i.postedUrl && (
                    <label className="li-sched">
                      <span className="dx-label">Schedule</span>
                      <input type="datetime-local" className="dx-input" value={i.scheduledFor ? new Date(Date.parse(i.scheduledFor) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} onChange={(e) => save(i.id, { scheduledFor: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                    </label>
                  )}
                  {i.status === 'ready' && !i.postedUrl && li?.connected && (
                    <button type="button" className="dx-btn dx-btn--primary" disabled={busy === i.id} onClick={() => postNow(i.id)}>
                      <PaperPlaneTilt size={14} /> {busy === i.id ? 'Posting…' : 'Post now'}
                    </button>
                  )}
                  {i.status === 'ready' && !i.postedUrl && (
                    <>
                      <a className={`dx-btn ${li?.connected ? '' : 'dx-btn--primary'}`} href={`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(polishPost(edit[i.id] ?? i.body))}`} target="_blank" rel="noreferrer">
                        <LinkedinLogo size={14} /> {li?.connected ? 'Post manually' : 'Post on LinkedIn'}
                      </a>
                      <div className="dx-row">
                        <input className="dx-input" style={{ flex: 1 }} placeholder="Paste the post link" value={posted[i.id] || ''} onChange={(e) => setPosted({ ...posted, [i.id]: e.target.value })} aria-label="Post link" />
                        <button type="button" className="dx-btn" onClick={() => save(i.id, { postedUrl: posted[i.id] || '' })}>
                          Mark posted
                        </button>
                      </div>
                    </>
                  )}
                  {i.postedUrl && (
                    <a href={i.postedUrl} target="_blank" rel="noreferrer">
                      ↗ View on LinkedIn
                    </a>
                  )}
                  {!i.postedUrl && (
                    <button type="button" className="nc-link li-del" onClick={() => window.confirm(`Delete “${i.title}”?`) && api(`/api/dev/work/${i.id}`, { method: 'DELETE' }).then(load)}>
                      <Trash size={13} /> Delete draft
                    </button>
                  )}
                </div>
              </li>
            ))}
            {!list.length && <Empty>Nothing here.</Empty>}
          </ul>
        </Card>
      ))}
    </div>
  );
}

// ---------------- Social Engagement ----------------
export function SocialPage({ api }: { api: Api }) {
  const [d, setD] = useState<{ comments: Comment[]; youtube: boolean; instagram: boolean } | null>(null);
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [yt, setYt] = useState<{ configured: boolean; connected: boolean; redirectUri: string; channel: { title: string } | null } | null>(null);
  const [posting, setPosting] = useState('');
  const [ig, setIg] = useState<{ configured: boolean; connected: boolean; username: string | null; expiresAt: string | null; redirectUri: string } | null>(null);
  const load = useCallback(() => {
    api<{ comments: Comment[]; youtube: boolean; instagram: boolean }>('/api/dev/social').then(setD, (e: Error) => setErr(e.message));
    api<{ configured: boolean; connected: boolean; redirectUri: string; channel: { title: string } | null }>('/api/dev/youtube').then(setYt, () => {});
    api<{ configured: boolean; connected: boolean; username: string | null; expiresAt: string | null; redirectUri: string }>('/api/dev/instagram').then(setIg, () => {});
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);
  const connect = async () => {
    setErr('');
    try {
      const r = await api<{ url: string }>('/api/dev/youtube/connect', { method: 'POST', body: '{}' });
      window.location.href = r.url;
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const publish = async (c: Comment) => {
    setPosting(c.id);
    setErr('');
    try {
      await api(`/api/dev/social/${c.id}/publish`, { method: 'POST', body: JSON.stringify({ reply: edit[c.id] ?? c.reply }) });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPosting('');
    }
  };
  const set = async (c: Comment, b: object) => {
    await api(`/api/dev/social/${c.id}`, { method: 'POST', body: JSON.stringify(b) });
    load();
  };
  if (!d) return err ? <p className="dx-err">{err}</p> : <div className="dx-skel" />;
  const cs = d.comments;
  const n = (f: (c: Comment) => boolean) => cs.filter(f).length;
  const shown = cs.filter((c) => filter === 'all' || c.status === filter || (filter === 'negative' && c.sentiment === 'negative'));
  return (
    <div className="pg">
      <section className="ld-funnel">
        {[
          ['Comments analysed', cs.length],
          ['Pending reply', n((c) => c.status === 'pending')],
          ['Replied', n((c) => c.status === 'replied')],
          ['Escalated', n((c) => c.status === 'escalated')],
          ['Positive', n((c) => c.sentiment === 'positive')],
          ['Negative', n((c) => c.sentiment === 'negative')],
        ].map(([l, v]) => (
          <div key={l as string} className="nc-card ld-stage">
            <b>{v as number}</b>
            <small>{l as string}</small>
          </div>
        ))}
      </section>
      <Card title="Platforms" icon={<Heartbeat size={20} />}>
        <ul className="so-plat">
          <li>
            <YoutubeLogo size={22} weight="fill" /> YouTube · reading comments: <Pill tone={d.youtube ? 'ok' : 'warn'}>{d.youtube ? 'connected' : 'add YOUTUBE_API_KEY'}</Pill> · posting replies:{' '}
            {yt?.connected ? (
              <>
                <Pill tone="ok">signed in{yt.channel ? ` as ${yt.channel.title}` : ''}</Pill>
                <button type="button" className="nc-link" onClick={() => api('/api/dev/youtube', { method: 'DELETE' }).then(load)}>
                  Disconnect
                </button>
              </>
            ) : yt?.configured ? (
              <button type="button" className="dx-btn dx-btn--primary" onClick={connect}>
                <YoutubeLogo size={14} weight="fill" /> Connect YouTube
              </button>
            ) : (
              <Pill tone="warn">add YT_CLIENT_ID + YT_CLIENT_SECRET in Settings</Pill>
            )}
          </li>
          {yt && !yt.connected && (
            <li className="ov-muted">
              Google OAuth client (Web application) → Authorized redirect URI: <code className="br-code" style={{ display: 'inline-block', margin: 0 }}>{yt.redirectUri}</code>
            </li>
          )}
          <li>
            <InstagramLogo size={22} /> Instagram · comments, replies & analytics:{' '}
            {ig?.connected ? (
              <>
                <Pill tone="ok">connected{ig.username ? ` as @${ig.username}` : ''}</Pill>
                <button type="button" className="nc-link" onClick={() => api('/api/dev/instagram', { method: 'DELETE' }).then(load)}>
                  Disconnect
                </button>
              </>
            ) : ig?.configured ? (
              <button
                type="button"
                className="dx-btn dx-btn--primary"
                onClick={async () => {
                  setErr('');
                  try {
                    window.location.href = (await api<{ url: string }>('/api/dev/instagram/connect', { method: 'POST', body: '{}' })).url;
                  } catch (e) {
                    setErr((e as Error).message);
                  }
                }}
              >
                <InstagramLogo size={14} /> Connect Instagram
              </button>
            ) : (
              <Pill tone="warn">add IG_APP_ID + IG_APP_SECRET in Settings (or paste IG_ACCESS_TOKEN)</Pill>
            )}
          </li>
          {ig && !ig.connected && (
            <li className="ov-muted">
              Meta app → Instagram → API setup with Instagram login → Business login settings → OAuth redirect URI: <code className="br-code" style={{ display: 'inline-block', margin: 0 }}>{ig.redirectUri}</code>
            </li>
          )}
          <li className="ov-muted">Mode: approval. Every reply is drafted and checked, and is posted only when you press “Approve & post reply” (or post it yourself). Legal threats, serious complaints, personal data, security and harassment are always escalated, never auto-answered.</li>
        </ul>
        <div className="dx-row">
          <button
            type="button"
            className="dx-btn dx-btn--primary"
            disabled={busy || (!d.youtube && !d.instagram)}
            onClick={async () => {
              setBusy(true);
              setErr('');
              try {
                await tool(api, 'nts_analyze_comments');
                await load();
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Reading comments…' : 'Fetch & analyse new comments'}
          </button>
          <select className="dx-input nc-select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter">
            {['pending', 'escalated', 'replied', 'ignored', 'negative', 'all'].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        {err && <p className="dx-err">{err}</p>}
      </Card>
      <ul className="li-list">
        {shown.map((c) => (
          <li key={c.id} className="nc-card so-c">
            <header className="dx-row">
              {(c as Comment & { platform?: string }).platform === 'instagram' ? <InstagramLogo size={18} /> : <YoutubeLogo size={18} weight="fill" />}
              <b>{c.author}</b>
              <Pill tone={c.sentiment === 'positive' ? 'ok' : c.sentiment === 'negative' ? 'bad' : 'idle'}>{c.sentiment}</Pill>
              <Pill tone="idle">{c.intent}</Pill>
              <Pill tone={toneOf(c.status)}>{c.status}</Pill>
              <small className="ov-muted">
                {c.language} · {when(c.at)}
              </small>
            </header>
            <p>“{c.text}”</p>
            {c.escalate && <p className="dx-err">Escalated: {c.reason}</p>}
            {c.status !== 'ignored' && (
              <>
                <textarea className="dx-input" rows={2} value={edit[c.id] ?? c.reply} onChange={(e) => setEdit({ ...edit, [c.id]: e.target.value })} aria-label="Reply" />
                <div className="dx-row">
                  {((c as Comment & { platform?: string }).platform === 'instagram' ? ig?.connected : yt?.connected) && c.status !== 'replied' && (
                    <button type="button" className="dx-btn dx-btn--primary" disabled={posting === c.id} onClick={() => publish(c)}>
                      <PaperPlaneTilt size={14} /> {posting === c.id ? 'Posting…' : 'Approve & post reply'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`dx-btn ${yt?.connected ? '' : 'dx-btn--primary'}`}
                    onClick={() => {
                      navigator.clipboard?.writeText(edit[c.id] ?? c.reply);
                      window.open(c.url, '_blank', 'noopener');
                    }}
                  >
                    <Copy size={14} /> Copy & open comment
                  </button>
                  {c.status !== 'replied' && (
                    <button type="button" className="dx-btn" onClick={() => set(c, { status: 'replied', reply: edit[c.id] ?? c.reply })}>
                      <CheckCircle size={14} /> Mark replied
                    </button>
                  )}
                  <button type="button" className="dx-btn" onClick={() => set(c, { status: 'ignored' })}>
                    Ignore
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
        {!shown.length && <Empty>{d.youtube || d.instagram ? 'No comments in this view. Fetch new comments above.' : 'Connect YouTube (API key) or Instagram to read comments.'}</Empty>}
      </ul>
    </div>
  );
}

// ---------------- Deployments ----------------
type Health = { ok: boolean; checks: { name: string; ok: boolean; detail?: string; error?: string; status?: number }[]; ms: number; at: string };
type Deploy = { repo: string; note: string; commits: { sha: string; message: string; author: string; at: string; url: string }[]; runs: { id: number; name: string; status: string; conclusion: string | null; branch: string; at: string; url: string }[] };

export function DeployPage({ api }: { api: Api }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [dep, setDep] = useState<Deploy | null>(null);
  const [depErr, setDepErr] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(() => {
    tool<Health>(api, 'nts_check_site_health').then(setHealth, () => {});
    tool<Deploy>(api, 'nts_get_deployment_status').then(
      (d) => {
        setDep(d);
        setDepErr('');
      },
      (e: Error) => setDepErr(e.message),
    );
  }, [api]);
  useEffect(load, [load]);
  return (
    <div className="pg">
      <div className="dp-grid">
        <Card title="Production health" icon={<Heartbeat size={20} />} action={health && <Pill tone={health.ok ? 'ok' : 'bad'}>{health.ok ? 'Healthy' : 'Problem'}</Pill>}>
          {health ? (
            <ul className="dp-checks">
              {health.checks.map((c) => (
                <li key={c.name}>
                  {c.ok ? <CheckCircle size={18} weight="fill" className="ok" /> : <XCircle size={18} weight="fill" className="bad" />} {c.name} <small className="ov-muted">{c.detail || c.error || (c.status ? `HTTP ${c.status}` : '')}</small>
                </li>
              ))}
              <li className="ov-muted">
                checked {ago(health.at)} · {health.ms} ms
              </li>
            </ul>
          ) : (
            <div className="dx-skel" />
          )}
          <button type="button" className="dx-btn" onClick={load}>
            Re-check
          </button>
        </Card>
        <Card title="Release flow" icon={<Rocket size={20} />}>
          <ol className="dp-flow">
            {['Requirement', 'Task', 'Plan', 'Code', 'Tests (CI)', 'Build', 'Your approval', 'Merge to main', 'Cloudflare deploy', 'Health check'].map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="ov-muted">Production deploys only from main through Cloudflare Workers Builds. Merging to main is always your action.</p>
        </Card>
      </div>
      <Card
        title="GitHub"
        icon={<GitBranch size={20} />}
        action={
          dep ? (
            <button
              type="button"
              className="dx-btn dx-btn--primary"
              onClick={async () => {
                setMsg('');
                try {
                  await tool(api, 'nts_run_tests', { ref: 'main' });
                  setMsg('CI started on main. Refresh in a minute.');
                } catch (e) {
                  setMsg((e as Error).message);
                }
              }}
            >
              <Play size={14} weight="fill" /> Run tests
            </button>
          ) : undefined
        }
      >
        {depErr ? (
          <Empty>{depErr}</Empty>
        ) : !dep ? (
          <div className="dx-skel" />
        ) : (
          <div className="dp-gh">
            {msg && <p className="ov-muted">{msg}</p>}
            <div>
              <p className="dx-label">Workflow runs · {dep.repo}</p>
              <ul className="ap-list">
                {dep.runs.map((r) => (
                  <li key={r.id}>
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.name} · {r.branch}
                    </a>
                    <Pill tone={toneOf(r.conclusion || r.status)}>{r.conclusion || r.status}</Pill>
                    <small className="ov-muted">{ago(r.at)}</small>
                  </li>
                ))}
                {!dep.runs.length && <Empty>No workflow runs yet.</Empty>}
              </ul>
            </div>
            <div>
              <p className="dx-label">Recent commits</p>
              <ul className="ap-list">
                {dep.commits.map((c) => (
                  <li key={c.sha}>
                    <a href={c.url} target="_blank" rel="noreferrer">
                      <code>{c.sha}</code> {c.message}
                    </a>
                    <small className="ov-muted">{ago(c.at)}</small>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------- Memory search ----------------
type Mem = { type: string; id: string; category: string; title: string; text: string; at: string | null };
export function MemorySearch({ api }: { api: Api }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Mem[] | null>(null);
  return (
    <Card title="Search memory" icon={<MagnifyingGlass size={20} />}>
      <form
        className="dx-row"
        onSubmit={(e) => {
          e.preventDefault();
          api<{ results: Mem[] }>(`/api/dev/memory/search?q=${encodeURIComponent(q)}`).then((d) => setRes(d.results));
        }}
      >
        <label className="sr-only" htmlFor="mem-q">
          Search
        </label>
        <input id="mem-q" className="dx-input" style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search knowledge, rules, lessons and notes" />
        <button type="submit" className="dx-btn dx-btn--primary">
          Search
        </button>
      </form>
      {res && (
        <ul className="ap-list">
          {res.map((m) => (
            <li key={m.type + m.id}>
              <div>
                <b>
                  <Pill tone="idle">{m.category}</Pill> {m.title}
                </b>
                <small>{m.text}</small>
              </div>
            </li>
          ))}
          {!res.length && <Empty>No matches.</Empty>}
        </ul>
      )}
    </Card>
  );
}

export { Trash };
