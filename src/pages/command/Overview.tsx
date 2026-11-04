import { useEffect, useState } from 'react';
import { InstagramLogo, XLogo, WarningCircle, MagnifyingGlass, ArrowRight, Brain, ChartBar, ChartLineUp, CheckCircle, Code, FlowArrow, Heartbeat, Kanban, Lightning, LinkedinLogo, Microphone, Paperclip, Plus, Pulse, Rocket, ShieldCheck, Sparkle, UsersThree, YoutubeLogo, ChatCircleText, PencilSimple, ClockCounterClockwise, Stop } from '@phosphor-icons/react';
import type { Api, Go, Overview as OV, Ops } from './shared';
import { Card, Pill, ago, toneOf } from './shared';

const STEPS = ['Understand', 'Plan', 'Delegate', 'Execute', 'Monitor', 'Learn'];
const QUICK = ['Create a LinkedIn content plan for next week', 'Find new leads and draft replies', 'Analyse our YouTube growth', 'Check site health and deployments'];
const AGENT_ICON: Record<string, JSX.Element> = {
  ops_maya_docs: <LinkedinLogo size={22} />,
  ops_lakshmi_growth: <PencilSimple size={22} />,
  ops_soma_analytics: <ChartBar size={22} />,
  ops_lead_response: <ChatCircleText size={22} />,
  ops_community: <YoutubeLogo size={22} />,
  ops_devops: <Code size={22} />,
};

function eventIcon(e: { kind: string; text: string }) {
  const t = e.text.toLowerCase();
  if (e.kind === 'error') return ['#f07878', <WarningCircle size={18} weight="fill" />] as const;
  if (/linkedin/.test(t)) return ['#0a66c2', <LinkedinLogo size={18} weight="fill" />] as const;
  if (/instagram/.test(t)) return ['#d62976', <InstagramLogo size={18} weight="bold" />] as const;
  if (/youtube|comment/.test(t)) return ['#e00000', <YoutubeLogo size={18} weight="fill" />] as const;
  if (/\bx\b|twitter|tweet/.test(t)) return ['#111', <XLogo size={18} weight="bold" />] as const;
  if (/deploy|github|test|health|ci\b|commit/.test(t)) return ['#2b4d55', <Code size={18} weight="bold" />] as const;
  if (/lead|scan|signal/.test(t)) return ['#7c5cff', <MagnifyingGlass size={18} weight="bold" />] as const;
  if (e.kind === 'approval') return ['#b8892f', <ShieldCheck size={18} weight="fill" />] as const;
  if (/analytic|growth|cycle|report|soma/.test(t) || e.kind === 'cycle') return ['#1f7a52', <ChartBar size={18} weight="fill" />] as const;
  return ['#0f6f75', <Brain size={18} />] as const;
}

function greeting() {
  const h = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Mountains() {
  return (
    <svg className="ov-hero__art" viewBox="0 0 800 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <radialGradient id="ovSun" cx="62%" cy="58%" r="45%">
          <stop offset="0" stopColor="#ffe3a3" stopOpacity="0.95" />
          <stop offset="0.25" stopColor="#e9c77d" stopOpacity="0.5" />
          <stop offset="1" stopColor="#0a3c43" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ovM1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d6a70" />
          <stop offset="1" stopColor="#0a3c43" />
        </linearGradient>
        <linearGradient id="ovM2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f4d54" />
          <stop offset="1" stopColor="#052329" />
        </linearGradient>
        <linearGradient id="ovM3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#073139" />
          <stop offset="1" stopColor="#03191d" />
        </linearGradient>
      </defs>
      <rect width="800" height="260" fill="url(#ovSun)" />
      <path d="M0 170 L90 120 L160 150 L250 80 L330 135 L420 70 L500 125 L560 95 L640 140 L720 100 L800 130 V260 H0Z" fill="url(#ovM1)" opacity="0.75" />
      <path d="M0 200 L120 150 L210 185 L300 130 L390 180 L470 140 L560 175 L660 135 L800 180 V260 H0Z" fill="url(#ovM2)" />
      <path d="M0 230 L140 195 L260 225 L380 190 L520 225 L640 200 L800 220 V260 H0Z" fill="url(#ovM3)" />
    </svg>
  );
}

function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return <p className="ov-muted">Collecting daily snapshots: the chart fills in as the channel is refreshed (every 6 hours).</p>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const W = 280;
  const H = 70;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * W, H - 6 - (max === min ? 0.5 : (p - min) / (max - min)) * (H - 12)]);
  return (
    <svg className="ov-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Subscriber trend">
      <defs>
        <linearGradient id="ovFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--nc-primary)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--nc-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M${xy.map((p) => p.join(',')).join(' L')} L${W},${H} L0,${H}Z`} fill="url(#ovFill)" />
      <polyline points={xy.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--nc-primary)" strokeWidth="2" />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#fff" />
      ))}
    </svg>
  );
}

export function OverviewPage({ api, go, owner }: { api: Api; go: Go; owner: string }) {
  const [d, setD] = useState<OV | null>(null);
  const [err, setErr] = useState('');
  const [cmd, setCmd] = useState('');
  const load = () => api<OV>('/api/dev/overview').then(setD, (e: Error) => setErr(e.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setOps = async (b: Partial<Ops>) => {
    await api('/api/dev/ops', { method: 'POST', body: JSON.stringify(b) });
    load();
  };
  if (!d) return err ? <p className="dx-err">{err}</p> : <div className="dx-skel" aria-label="Loading overview" />;
  const k = d.kpis;
  const subs = d.growth.map((g) => g.subscribers).filter((x): x is number => x !== null);
  const views = d.growth.map((g) => g.views).filter((x): x is number => x !== null);
  const delta = (xs: number[]) => (xs.length > 1 ? xs[xs.length - 1] - xs[0] : null);
  const kpis = [
    { label: 'Specialist agents', value: k.agents, icon: <UsersThree size={20} />, hint: `${d.agents.filter((a) => a.status === 'running').length} running now`, go: 'agents' as const },
    { label: 'Running tasks', value: k.runningTasks, icon: <Pulse size={20} />, hint: 'live', go: 'work' as const },
    { label: 'Completed', value: k.completed, icon: <CheckCircle size={20} />, hint: `${k.completedWeek} this week`, go: 'work' as const },
    { label: 'Leads (new)', value: k.newLeads, icon: <UsersThree size={20} />, hint: 'from Signals', go: 'leads' as const },
    { label: 'Need approval', value: k.approvals, icon: <ShieldCheck size={20} />, hint: k.approvals ? 'waiting for you' : 'all clear', go: 'approvals' as const },
    { label: 'Ready to post', value: k.readyToPost, icon: <Rocket size={20} />, hint: 'approved drafts', go: 'linkedin' as const },
  ];
  const run = (text: string) => text.trim() && go('brain', text.trim());

  return (
    <div className="ov">
      <div className="ov-main">
        <section className="ov-hero">
          <Mountains />
          <div className="ov-hero__in">
            <h1>
              {greeting()}, {owner} <span aria-hidden="true">👋</span>
            </h1>
            <p>NTS COMMAND — One Brain. Many Specialists. One Business.</p>
            <div className="ov-modes" role="radiogroup" aria-label="Operating mode">
              <span className="ov-dev">
                <Code size={16} /> Dev Mode
              </span>
              {(['manual', 'assisted', 'autonomous'] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={d.ops.mode === m} className={d.ops.mode === m ? 'on' : ''} onClick={() => setOps({ mode: m })} title={m === 'manual' ? 'Agents act only when you instruct them' : m === 'assisted' ? 'Team drafts on autopilot; you approve anything external' : 'Predefined workflows run automatically within approved policies'}>
                  {m === 'manual' ? <UsersThree size={16} /> : m === 'assisted' ? <Sparkle size={16} /> : <Lightning size={16} />} {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
              <button type="button" className={`ov-kill ${d.ops.paused ? 'on' : ''}`} onClick={() => setOps({ paused: !d.ops.paused })} title="Kill switch: pause all autonomous execution">
                <Stop size={16} weight="fill" /> {d.ops.paused ? 'Paused · resume' : 'Pause all'}
              </button>
            </div>
          </div>
        </section>

        <section className="ov-kpis" aria-label="Key numbers">
          {kpis.map((x) => (
            <button key={x.label} type="button" className="nc-card ov-kpi" onClick={() => go(x.go)}>
              <span className="ov-kpi__l">
                {x.icon} {x.label}
              </span>
              <b>{x.value}</b>
              <small>{x.hint}</small>
            </button>
          ))}
        </section>

        <section className="nc-card ov-brain">
          <div className="ov-brain__body">
            <header>
              <Brain size={34} className="ov-brain__ic" />
              <div>
                <h2>
                  NTS Brain (MCP) <Pill tone={d.health.brain ? 'ok' : 'bad'}>{d.health.brain ? 'Online' : 'No AI key'}</Pill>
                </h2>
                <p>Your central intelligence for strategy, execution and growth.</p>
              </div>
            </header>
            <form
              className="ov-cmd"
              onSubmit={(e) => {
                e.preventDefault();
                run(cmd);
              }}
            >
              <Sparkle size={18} className="ov-cmd__s" />
              <label className="sr-only" htmlFor="ov-cmd">
                Tell NTS Brain what to do
              </label>
              <input id="ov-cmd" value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="Tell NTS Brain what to do…" maxLength={4000} />
              <button type="button" className="ov-cmd__i" aria-label="Attach (opens Marg chat)" title="Attach files in the Marg chat" onClick={() => window.dispatchEvent(new Event('nts:openmarg'))}>
                <Paperclip size={18} />
              </button>
              <button type="button" className="ov-cmd__i" aria-label="Voice (opens Marg chat)" title="Voice commands are in the Marg chat" onClick={() => window.dispatchEvent(new Event('nts:openmarg'))}>
                <Microphone size={18} />
              </button>
              <button type="submit" className="ov-cmd__go" aria-label="Run">
                <ArrowRight size={18} weight="bold" />
              </button>
            </form>
            <div className="ov-chips">
              {QUICK.map((q) => (
                <button key={q} type="button" onClick={() => run(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
          <div className="ov-holo" aria-hidden="true">
            <Brain size={110} weight="thin" />
            <i />
          </div>
          <ul className="ov-steps" aria-label="How the Brain works">
            {STEPS.map((s) => (
              <li key={s}>
                <CheckCircle size={16} weight="fill" /> {s}
              </li>
            ))}
          </ul>
        </section>

        <Card
          title="Active agents"
          icon={<FlowArrow size={20} />}
          action={
            <button type="button" className="nc-link" onClick={() => go('agents')}>
              View all <ArrowRight size={14} />
            </button>
          }
        >
          <ul className="ov-agents">
            {d.agents.map((a) => (
              <li key={a.id}>
                <button type="button" className="ov-agent" onClick={() => go('agents', a.id)}>
                  <span className="ov-agent__ic">{AGENT_ICON[a.id] ?? <Sparkle size={22} />}</span>
                  <b>{a.name}</b>
                  <small>{a.dept}</small>
                  <Pill tone={a.status === 'running' ? 'live' : a.status === 'failed' ? 'bad' : 'idle'}>{a.status === 'running' ? 'Running' : a.status === 'failed' ? 'Last run failed' : 'Ready'}</Pill>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="ov-bottom">
          <Card
            title="Current workflows"
            icon={<Kanban size={20} />}
            action={
              <button type="button" className="nc-link" onClick={() => go('work')}>
                View all <ArrowRight size={14} />
              </button>
            }
          >
            <ul className="ov-flows">
              {d.workflows.map((w) => {
                const p = w.total ? Math.round((w.done / w.total) * 100) : 100;
                return (
                  <li key={w.id}>
                    <span className="ov-flows__ic">{w.kind === 'cycle' ? <Sparkle size={18} /> : <Brain size={18} />}</span>
                    <div>
                      <b>{w.name}</b>
                      <small>
                        {w.kind === 'cycle' ? 'Plan → Draft → Approve' : 'Understand → Plan → Delegate → Execute'} · {ago(w.at)}
                      </small>
                    </div>
                    <span className="ov-bar" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={`${w.name} progress`}>
                      <i style={{ width: `${p}%` }} />
                    </span>
                    <Pill tone={toneOf(w.status)}>{w.status}</Pill>
                  </li>
                );
              })}
              {!d.workflows.length && <li className="ov-muted">No workflows yet. Give the Brain a command or run a team cycle.</li>}
            </ul>
          </Card>
          <Card title="Growth snapshot" icon={<ChartLineUp size={20} />} action={<span className="ov-muted">YouTube · last 7 days</span>}>
            <div className="ov-growth">
              <div>
                <b className="ov-up">{delta(subs) === null ? '—' : `${delta(subs)! >= 0 ? '+' : ''}${delta(subs)}`}</b>
                <small>Subscribers</small>
              </div>
              <div>
                <b className="ov-up">{delta(views) === null ? '—' : `${delta(views)! >= 0 ? '+' : ''}${delta(views)!.toLocaleString('en-IN')}`}</b>
                <small>Channel views</small>
              </div>
              <div>
                <b className="ov-up">{d.kpis.newLeads}</b>
                <small>New leads</small>
              </div>
              <Spark points={subs} />
            </div>
          </Card>
        </div>
      </div>

      <aside className="ov-side">
        <Card title="System health" icon={<Heartbeat size={20} />} action={<Pill tone={d.health.brain ? 'ok' : 'warn'}>{d.health.brain ? 'Operational' : 'Needs AI key'}</Pill>}>
          <dl className="ov-health">
            <div>
              <dt>
                <Brain size={16} /> NTS Brain (MCP)
              </dt>
              <dd className={d.health.brain ? 'ok' : 'bad'}>{d.health.brain ? 'Online' : 'Offline'}</dd>
            </div>
            <div>
              <dt>
                <Pulse size={16} /> Agent runtime
              </dt>
              <dd className="ok">Healthy</dd>
            </div>
            <div>
              <dt>
                <FlowArrow size={16} /> Integrations
              </dt>
              <dd title={d.health.integrations.list.map((i) => `${i.name}: ${i.on ? 'on' : 'off'}`).join('\n')}>
                {d.health.integrations.on} / {d.health.integrations.total}
              </dd>
            </div>
            <div>
              <dt>
                <Lightning size={16} /> Automation
              </dt>
              <dd className={d.ops.paused ? 'bad' : 'ok'}>{d.ops.paused ? 'Paused' : d.ops.mode[0].toUpperCase() + d.ops.mode.slice(1)}</dd>
            </div>
          </dl>
        </Card>
        <Card title="Today’s activity" icon={<ClockCounterClockwise size={20} />} action={<Pill tone="live">Live</Pill>}>
          <ul className="ov-act">
            {d.activity.slice(0, 7).map((e) => (
              <li key={e.id}>
                <span className="ov-act__ic" style={{ background: eventIcon(e)[0] }}>
                  {eventIcon(e)[1]}
                </span>
                <span>{e.text}</span>
                <small>{ago(e.at)}</small>
              </li>
            ))}
            {!d.activity.length && <li className="ov-muted">Nothing yet today.</li>}
          </ul>
        </Card>
        <Card title="Quick actions" icon={<Lightning size={20} />}>
          <div className="ov-quick">
            <button type="button" onClick={() => go('work', 'new-task')}>
              <Plus size={22} /> New task
            </button>
            <button type="button" onClick={() => go('work', 'cycle')}>
              <FlowArrow size={22} /> Run cycle
            </button>
            <button type="button" onClick={() => go('linkedin')}>
              <PencilSimple size={22} /> Create content
            </button>
            <button type="button" onClick={() => go('leads')}>
              <UsersThree size={22} /> Find leads
            </button>
            <button type="button" onClick={() => go('deploy')}>
              <Rocket size={22} /> Deployments
            </button>
            <button type="button" onClick={() => go('analytics')}>
              <ChartBar size={22} /> Analytics
            </button>
          </div>
        </Card>
      </aside>
    </div>
  );
}
