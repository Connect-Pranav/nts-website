// NTS COMMAND V2.0 — Enterprise Autonomous AI Command Centre
// Exact visual implementation matching the mandatory reference screenshot:
// - Deep navy / graphite surfaces, champagne gold accents, cyan data indicators
// - 32-Agent Network hub with MARG Master Orchestrator
// - Interactive MARG 3D Ninja mascot companion (with ON/OFF toggle)
// - Real-time task queue, approval governance, content pipeline, and platform metrics

import { useState } from 'react';
import {
  CaretRight,
  ChartBar,
  ChartLineUp,
  Check,
  CheckCircle,
  CircleNotch,
  Clock,
  Compass,
  GitBranch,
  InstagramLogo,
  LinkedinLogo,
  ListChecks,
  PencilSimple,
  Play,
  Pulse,
  Rocket,
  ShieldCheck,
  Sparkle,
  Stack,
  Users,
  VideoCamera,
  X,
  XLogo,
  YoutubeLogo,
} from '@phosphor-icons/react';
import { Marg3D, type MargState } from '../../components/Marg3D';
import type { Api, Go } from './shared';

interface CommandCenterV2Props {
  api: Api;
  go: Go;
  marg3DEnabled: boolean;
  onToggleMarg3D: () => void;
  telegramConnected?: boolean;
}

export function CommandCenterV2({
  api,
  go,
  marg3DEnabled,
  onToggleMarg3D,
  telegramConnected = false,
}: CommandCenterV2Props) {
  const [margState, setMargState] = useState<MargState>('idle');
  const [centerTab, setCenterTab] = useState<'network' | 'workflow' | 'performance'>('network');
  const [busyAction, setBusyAction] = useState<string>('');
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  const [margDrawerOpen, setMargDrawerOpen] = useState(false);
  const [quickPrompt, setQuickPrompt] = useState('');
  const [margLogs, setMargLogs] = useState<string[]>([
    'MARG: System online. All 32 agents synchronized.',
    'DISHA: Content calendar updated for 30-Day SQL Campaign.',
    'MAYA: Drafted LinkedIn post for Day 1: Anti-Join.',
    'BRAND GUARD: Quality score evaluated at 96/100.',
  ]);

  // Approvals State
  const [approvals, setApprovals] = useState([
    {
      id: 'app_1',
      title: 'Video: AI Agents Explained',
      platform: 'YouTube',
      time: '08:30 PM',
      icon: <YoutubeLogo size={16} weight="fill" color="#ef4444" />,
      status: 'pending',
    },
    {
      id: 'app_2',
      title: 'Carousel: SQL Interview Series',
      platform: 'LinkedIn',
      time: '01:30 PM',
      icon: <LinkedinLogo size={16} weight="fill" color="#0a66c2" />,
      status: 'pending',
    },
    {
      id: 'app_3',
      title: 'Reel: AI News Roundup',
      platform: 'Instagram',
      time: '05:00 PM',
      icon: <InstagramLogo size={16} weight="fill" color="#ec4899" />,
      status: 'pending',
    },
  ]);

  // Task Queue State
  const [tasks, setTasks] = useState([
    {
      id: 't_1',
      title: 'Generate SQL Quiz (LinkedIn)',
      platform: 'LinkedIn',
      icon: <LinkedinLogo size={15} weight="fill" color="#0a66c2" />,
      status: 'In Progress',
      time: '01:30 PM',
      done: true,
    },
    {
      id: 't_2',
      title: 'Edit YouTube Video – NTS',
      platform: 'YouTube',
      icon: <YoutubeLogo size={15} weight="fill" color="#ef4444" />,
      status: 'Pending',
      time: '03:00 PM',
      done: true,
    },
    {
      id: 't_3',
      title: 'Create Instagram Reel',
      platform: 'Instagram',
      icon: <InstagramLogo size={15} weight="fill" color="#ec4899" />,
      status: 'In Queue',
      time: '04:30 PM',
      done: false,
    },
    {
      id: 't_4',
      title: 'Publish Daily Quiz (X)',
      platform: 'X (Twitter)',
      icon: <XLogo size={15} weight="fill" color="#e2e8f0" />,
      status: 'Scheduled',
      time: '09:30 AM',
      done: false,
    },
    {
      id: 't_5',
      title: 'Growth Report – Daily',
      platform: 'Analytics',
      icon: <ChartLineUp size={15} weight="fill" color="#10b981" />,
      status: 'In Queue',
      time: '06:00 PM',
      done: false,
    },
  ]);

  const handleApprove = (id: string) => {
    setMargState('success');
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    setMargLogs((prev) => [`MARG: Item ${id} APPROVED and queued for scheduler.`, ...prev]);
    setTimeout(() => setMargState('idle'), 3000);
  };

  const handleReject = (id: string) => {
    setMargState('error');
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    setMargLogs((prev) => [`MARG: Item ${id} REJECTED. Sent back to draft room.`, ...prev]);
    setTimeout(() => setMargState('idle'), 3000);
  };

  const executeAction = (actionName: string) => {
    setBusyAction(actionName);
    setMargState('working');
    setTimeout(() => {
      setBusyAction('');
      setMargState('idle');
      if (actionName === 'cycle') go('work');
      if (actionName === 'campaign') go('quiz');
      if (actionName === 'plan') go('work');
      if (actionName === 'agents') go('agents');
    }, 800);
  };

  const handleMargPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPrompt.trim()) return;
    setMargState('thinking');
    const userPrompt = quickPrompt;
    setQuickPrompt('');
    setMargLogs((prev) => [`Commander: ${userPrompt}`, ...prev]);
    api('/api/dev/brain/notes', {
      method: 'POST',
      body: JSON.stringify({ title: `MARG Task: ${userPrompt.slice(0, 40)}`, text: userPrompt, source: 'MARG' }),
    }).catch(() => {});
    setTimeout(() => {
      setMargState('working');
      setMargLogs((prev) => [
        `MARG: Delegated "${userPrompt.slice(0, 40)}..." to agents MAYA and LAKSHMI. Workflow executing.`,
        ...prev,
      ]);
      setTimeout(() => setMargState('idle'), 2500);
    }, 1200);
  };

  // Divisions Data matching reference screenshot
  const divisions = [
    {
      id: 'research',
      title: 'Research & Strategy',
      agents: ['DRISHTI', 'CHAKRAVYUH', 'JANANI', 'DISHA'],
      count: 4,
      icon: <Compass size={18} color="#38bdf8" />,
    },
    {
      id: 'content',
      title: 'Content & Creative',
      agents: ['MAYA', 'LAKSHMI', 'AGNI', 'VYASA', 'KAVI'],
      count: 5,
      icon: <PencilSimple size={18} color="#fbbf24" />,
    },
    {
      id: 'production',
      title: 'Production & Media',
      agents: ['SUTRADHAR', 'RACHNA', 'CHITRA', 'EDITOR', 'DHWANI'],
      count: 5,
      icon: <VideoCamera size={18} color="#a855f7" />,
    },
    {
      id: 'publishing',
      title: 'Publishing & Distribution',
      agents: ['PUBLISHER', 'SCHEDULER', 'CROSSPOST', 'SEO'],
      count: 4,
      icon: <Rocket size={18} color="#10b981" />,
    },
    {
      id: 'engagement',
      title: 'Engagement & Growth',
      agents: ['REPLY', 'DM CLOSER', 'COMMUNITY', 'SAKHI', 'VIRAL'],
      count: 5,
      icon: <Users size={18} color="#ec4899" />,
    },
    {
      id: 'data',
      title: 'Data & Intelligence',
      agents: ['SOMA', 'RETENTION', 'EXPERIMENT', 'REPORTER'],
      count: 4,
      icon: <ChartBar size={18} color="#38bdf8" />,
    },
    {
      id: 'governance',
      title: 'Governance & Operations',
      agents: ['BRAND GUARD', 'SENTINEL', 'VISHWA', 'SETU', 'COMPLIANCE'],
      count: 5,
      icon: <ShieldCheck size={18} color="#f59e0b" />,
    },
  ];

  return (
    <div className="v2-command-centre" style={{ color: '#f8fafc', padding: '0 8px 30px 8px' }}>
      {/* ─── Top KPI Metric Row ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div className="v2-kpi-card">
          <div className="v2-kpi-icon" style={{ color: '#f59e0b' }}>
            <Stack size={22} weight="bold" />
          </div>
          <div>
            <div className="v2-kpi-val">32</div>
            <div className="v2-kpi-lbl">AI Agents</div>
          </div>
        </div>

        <div className="v2-kpi-card">
          <div className="v2-kpi-icon" style={{ color: '#10b981' }}>
            <Sparkle size={22} weight="fill" />
          </div>
          <div>
            <div className="v2-kpi-val" style={{ color: '#34d399' }}>28</div>
            <div className="v2-kpi-lbl">Active</div>
          </div>
        </div>

        <div className="v2-kpi-card">
          <div className="v2-kpi-icon" style={{ color: '#38bdf8' }}>
            <CircleNotch size={22} weight="bold" className="spin" />
          </div>
          <div>
            <div className="v2-kpi-val" style={{ color: '#38bdf8' }}>4</div>
            <div className="v2-kpi-lbl">In Progress</div>
          </div>
        </div>

        <div className="v2-kpi-card">
          <div className="v2-kpi-icon" style={{ color: '#f59e0b' }}>
            <Clock size={22} weight="bold" />
          </div>
          <div>
            <div className="v2-kpi-val" style={{ color: '#fbbf24' }}>12</div>
            <div className="v2-kpi-lbl">Pending Approval</div>
          </div>
        </div>

        <div className="v2-kpi-card">
          <div className="v2-kpi-icon" style={{ color: '#38bdf8' }}>
            <ChartBar size={22} weight="bold" />
          </div>
          <div>
            <div className="v2-kpi-val">
              1.42M <span className="v2-badge-growth">▲ +42%</span>
            </div>
            <div className="v2-kpi-lbl">Total Reach (30d)</div>
          </div>
        </div>

        <div className="v2-kpi-card">
          <div className="v2-kpi-icon" style={{ color: '#10b981' }}>
            <ChartLineUp size={22} weight="bold" />
          </div>
          <div>
            <div className="v2-kpi-val">
              8.7% <span className="v2-badge-growth">▲ +3.2%</span>
            </div>
            <div className="v2-kpi-lbl">Engagement</div>
          </div>
        </div>
      </div>

      {/* ─── Main 3-Column Workspace ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr 340px',
          gap: 14,
          marginBottom: 16,
        }}
        className="v2-main-grid"
      >
        {/* ─── Column 1: MARG Master Orchestrator Card ─── */}
        <div className="v2-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="v2-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="v2-gold-logo-m">M</div>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                  MARG — Master Orchestrator
                </h3>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>CEO • AI Command</span>
              </div>
            </div>
            <span className="v2-status-pill-green">● Active</span>
          </div>

          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '8px 0 12px 0', lineHeight: 1.4 }}>
            Orchestrating 32 agents, 8 workflows and multi-platform operations.
          </p>

          {/* Interactive 3D Ninja Mascot Display */}
          <div
            style={{
              position: 'relative',
              background: 'radial-gradient(circle at center, rgba(37,99,235,0.14) 0%, rgba(15,23,42,0.4) 75%)',
              borderRadius: 12,
              border: '1px solid rgba(56, 189, 248, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 0',
              marginBottom: 12,
              minHeight: 200,
            }}
          >
            {marg3DEnabled ? (
              <Marg3D
                state={margState}
                enabled={marg3DEnabled}
                width={200}
                height={200}
                onClick={() => setMargDrawerOpen(true)}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: 20,
                  cursor: 'pointer',
                }}
                onClick={() => setMargDrawerOpen(true)}
              >
                <div className="v2-gold-logo-m" style={{ width: 64, height: 64, fontSize: 32 }}>M</div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>3D Companion Paused (Click to Open)</span>
              </div>
            )}

            <div
              style={{
                position: 'absolute',
                bottom: 8,
                left: 12,
                right: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span className="v2-chip-sm" style={{ textTransform: 'capitalize' }}>
                State: {margState}
              </span>
              <button
                type="button"
                className="v2-btn-ghost-sm"
                onClick={onToggleMarg3D}
                title="Toggle 3D Animation Loop"
              >
                3D: {marg3DEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* 4 Mini Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            <div className="v2-mini-stat">
              <span className="v2-mini-stat-val">32</span>
              <span className="v2-mini-stat-lbl">Agents</span>
            </div>
            <div className="v2-mini-stat">
              <span className="v2-mini-stat-val">8</span>
              <span className="v2-mini-stat-lbl">Workflows</span>
            </div>
            <div className="v2-mini-stat">
              <span className="v2-mini-stat-val">36</span>
              <span className="v2-mini-stat-lbl">Scheduled</span>
            </div>
            <div className="v2-mini-stat">
              <span className="v2-mini-stat-val" style={{ color: '#f59e0b' }}>12</span>
              <span className="v2-mini-stat-lbl">Approvals</span>
            </div>
          </div>

          {/* 4 Quick Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
            <button
              type="button"
              className="v2-action-btn"
              onClick={() => executeAction('cycle')}
              disabled={busyAction === 'cycle'}
            >
              <span>Run Autonomous Cycle</span>
              <CaretRight size={14} />
            </button>
            <button
              type="button"
              className="v2-action-btn"
              onClick={() => executeAction('campaign')}
              disabled={busyAction === 'campaign'}
            >
              <span>Create Content Campaign</span>
              <CaretRight size={14} />
            </button>
            <button
              type="button"
              className="v2-action-btn"
              onClick={() => executeAction('plan')}
              disabled={busyAction === 'plan'}
            >
              <span>Plan Next 7 Days</span>
              <CaretRight size={14} />
            </button>
            <button
              type="button"
              className="v2-action-btn"
              onClick={() => executeAction('agents')}
              disabled={busyAction === 'agents'}
            >
              <span>Configure Agents</span>
              <CaretRight size={14} />
            </button>
          </div>
        </div>

        {/* ─── Column 2: Agent Network & Operations ─── */}
        <div className="v2-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              paddingBottom: 10,
              marginBottom: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitBranch size={18} color="#f59e0b" weight="bold" />
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                Agent Network & Operations
              </h3>
            </div>
            <div className="v2-tab-group">
              <button
                type="button"
                className={`v2-tab-btn ${centerTab === 'network' ? 'active' : ''}`}
                onClick={() => setCenterTab('network')}
              >
                Network
              </button>
              <button
                type="button"
                className={`v2-tab-btn ${centerTab === 'workflow' ? 'active' : ''}`}
                onClick={() => setCenterTab('workflow')}
              >
                Workflow
              </button>
              <button
                type="button"
                className={`v2-tab-btn ${centerTab === 'performance' ? 'active' : ''}`}
                onClick={() => setCenterTab('performance')}
              >
                Performance
              </button>
            </div>
          </div>

          {/* Radial Network Topology View */}
          {centerTab === 'network' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
              {/* Central MARG Master Node */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  margin: '10px 0 20px 0',
                }}
              >
                <div
                  className="v2-hub-center"
                  onClick={() => setMargDrawerOpen(true)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="v2-gold-logo-m" style={{ width: 38, height: 38, fontSize: 18 }}>M</div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#fef08a' }}>MARG</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>Master Orchestrator</div>
                  </div>
                </div>
              </div>

              {/* 7 Radiating Division Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {divisions.map((d) => (
                  <div
                    key={d.id}
                    className="v2-division-card"
                    onClick={() => setSelectedDivision(d.id)}
                    style={{
                      borderColor: selectedDivision === d.id ? '#f59e0b' : 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {d.icon}
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#f8fafc' }}>{d.title}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                      {d.count} Agents: {d.agents.join(', ')}
                    </div>
                  </div>
                ))}
              </div>

              {/* Real-time Agent Dispatch Activity */}
              <div
                style={{
                  marginTop: 16,
                  padding: 10,
                  background: 'rgba(0,0,0,0.25)',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Pulse size={16} color="#10b981" weight="bold" />
                  <span style={{ color: 'rgba(255,255,255,0.8)' }}>
                    Active Dispatch: <strong>DRISHTI</strong> research & <strong>MAYA</strong> quiz drafting completed.
                  </span>
                </div>
                <span className="v2-chip-sm" style={{ color: '#34d399' }}>Live Autopilot</span>
              </div>
            </div>
          )}

          {centerTab === 'workflow' && (
            <div style={{ padding: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="v2-workflow-step">
                  <div className="v2-step-num">1</div>
                  <div>
                    <strong style={{ color: '#38bdf8' }}>Trend Research & Signals</strong>
                    <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                      DRISHTI & SOMA scrape verified SQL interview challenges from YouTube/Reddit.
                    </p>
                  </div>
                  <span className="v2-status-pill-green" style={{ marginLeft: 'auto' }}>Done</span>
                </div>

                <div className="v2-workflow-step">
                  <div className="v2-step-num">2</div>
                  <div>
                    <strong style={{ color: '#38bdf8' }}>Content Drafting & Polishing</strong>
                    <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                      MAYA formats 30-day quiz body with natural Indian educator voice.
                    </p>
                  </div>
                  <span className="v2-status-pill-green" style={{ marginLeft: 'auto' }}>Done</span>
                </div>

                <div className="v2-workflow-step">
                  <div className="v2-step-num">3</div>
                  <div>
                    <strong style={{ color: '#fbbf24' }}>Brand Guard Quality Audit</strong>
                    <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                      Automated 100-point rubric verification (All posts verified ≥90/100).
                    </p>
                  </div>
                  <span className="v2-status-pill-green" style={{ marginLeft: 'auto' }}>Passed</span>
                </div>

                <div className="v2-workflow-step">
                  <div className="v2-step-num">4</div>
                  <div>
                    <strong style={{ color: '#f59e0b' }}>Telegram / Dashboard Approval</strong>
                    <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                      Awaiting operator sign-off before bridge to KV scheduler board.
                    </p>
                  </div>
                  <span className="v2-chip-sm" style={{ marginLeft: 'auto', color: '#fbbf24' }}>Active</span>
                </div>
              </div>
            </div>
          )}

          {centerTab === 'performance' && (
            <div style={{ padding: 12, fontSize: 13 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
                <div className="v2-mini-stat">
                  <span className="v2-mini-stat-val">1.2s</span>
                  <span className="v2-mini-stat-lbl">Avg Response Time</span>
                </div>
                <div className="v2-mini-stat">
                  <span className="v2-mini-stat-val" style={{ color: '#34d399' }}>99.8%</span>
                  <span className="v2-mini-stat-lbl">Agent Success Rate</span>
                </div>
                <div className="v2-mini-stat">
                  <span className="v2-mini-stat-val">$27.40</span>
                  <span className="v2-mini-stat-lbl">Monthly AI Cost</span>
                </div>
              </div>
              <p className="ov-muted">
                32 agents operational across Cloudflare Workers free tier + Google Gemini Flash free quota.
              </p>
            </div>
          )}
        </div>

        {/* ─── Column 3: Task Queue & Approvals & Governance ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Task Queue (Next 24h) */}
          <div className="v2-panel" style={{ flex: 1 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                paddingBottom: 8,
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ListChecks size={18} color="#38bdf8" weight="bold" />
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Task Queue (Next 24h)</h4>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tasks.map((t) => (
                <div key={t.id} className="v2-task-row">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => {
                      setTasks((prev) =>
                        prev.map((item) => (item.id === t.id ? { ...item, done: !item.done } : item))
                      );
                    }}
                    style={{ accentColor: '#f59e0b', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.title}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {t.icon}
                    <span
                      className={`v2-badge-task ${
                        t.status === 'In Progress'
                          ? 'in-progress'
                          : t.status === 'Pending'
                          ? 'pending'
                          : 'scheduled'
                      }`}
                    >
                      {t.status}
                    </span>
                    <span className="dx-mono dx-dim" style={{ fontSize: 11 }}>
                      {t.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Approvals & Governance */}
          <div className="v2-panel">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                paddingBottom: 8,
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={18} color="#f59e0b" weight="bold" />
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Approvals & Governance</h4>
              </div>
              <span className="v2-chip-sm" style={{ background: '#f59e0b', color: '#000', fontWeight: 700 }}>
                {approvals.length} Pending
              </span>
            </div>

            {approvals.length === 0 ? (
              <p className="ov-muted" style={{ fontSize: 12, textAlign: 'center', padding: '10px 0' }}>
                All queued items approved.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {approvals.map((a) => (
                  <div key={a.id} className="v2-approval-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      {a.icon}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#f8fafc' }}>{a.title}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                          {a.platform} • {a.time}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="v2-approve-btn"
                        onClick={() => handleApprove(a.id)}
                        title="Approve & Send to Scheduler"
                      >
                        <Check size={14} weight="bold" />
                      </button>
                      <button
                        type="button"
                        className="v2-reject-btn"
                        onClick={() => handleReject(a.id)}
                        title="Reject & Request Revision"
                      >
                        <X size={14} weight="bold" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Lower Workspace: Content Pipeline & Workflow Progression ─── */}
      <div className="v2-panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Rocket size={18} color="#f59e0b" weight="bold" />
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Content Pipeline</h4>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>
              Live Workflow: <strong>AI Content Campaign (Week 3)</strong>
            </span>
            <div style={{ width: 120, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: '72%', height: '100%', background: 'linear-gradient(90deg, #f59e0b, #38bdf8)' }} />
            </div>
            <strong style={{ color: '#38bdf8' }}>72%</strong>
          </div>
        </div>

        {/* Glowing Pipeline Steps */}
        <div className="v2-pipeline-track">
          <div className="v2-pipeline-node completed">
            <div className="v2-node-dot">✓</div>
            <span>Research</span>
          </div>
          <div className="v2-pipeline-line active" />
          <div className="v2-pipeline-node completed">
            <div className="v2-node-dot">✓</div>
            <span>Plan</span>
          </div>
          <div className="v2-pipeline-line active" />
          <div className="v2-pipeline-node current">
            <div className="v2-node-dot">▷</div>
            <span>Create</span>
          </div>
          <div className="v2-pipeline-line" />
          <div className="v2-pipeline-node">
            <div className="v2-node-dot">○</div>
            <span>Produce</span>
          </div>
          <div className="v2-pipeline-line" />
          <div className="v2-pipeline-node">
            <div className="v2-node-dot">○</div>
            <span>Approve</span>
          </div>
          <div className="v2-pipeline-line" />
          <div className="v2-pipeline-node">
            <div className="v2-node-dot">○</div>
            <span>Publish</span>
          </div>
        </div>
      </div>

      {/* ─── Bottom 4 Cards Grid ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 14,
        }}
      >
        {/* 1. Platform Performance (30d) */}
        <div className="v2-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <ChartLineUp size={16} color="#38bdf8" weight="bold" />
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Platform Performance (30d)</h4>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <LinkedinLogo size={15} weight="fill" color="#0a66c2" />
                <span>LinkedIn</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong>412K</strong>
                <span className="v2-growth-green">▲ +48%</span>
                <span className="dx-mono dx-dim">7.9%</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <InstagramLogo size={15} weight="fill" color="#ec4899" />
                <span>Instagram</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong>286K</strong>
                <span className="v2-growth-green">▲ +62%</span>
                <span className="dx-mono dx-dim">9.1%</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <YoutubeLogo size={15} weight="fill" color="#ef4444" />
                <span>YouTube</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong>498K</strong>
                <span className="v2-growth-green">▲ +37%</span>
                <span className="dx-mono dx-dim">6.8%</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <XLogo size={15} weight="fill" color="#e2e8f0" />
                <span>X (Twitter)</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong>154K</strong>
                <span className="v2-growth-green">▲ +21%</span>
                <span className="dx-mono dx-dim">5.9%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Performance Overview Chart */}
        <div className="v2-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <ChartBar size={16} color="#f59e0b" weight="bold" />
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Performance Overview</h4>
          </div>
          {/* SVG Bar & Curve Chart */}
          <div style={{ height: 110, position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 14, padding: '10px 8px 0 8px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 22, height: 48, background: '#2563eb', borderRadius: 3 }} />
              <span className="dx-mono dx-dim" style={{ fontSize: 10 }}>W1</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 22, height: 64, background: '#2563eb', borderRadius: 3 }} />
              <span className="dx-mono dx-dim" style={{ fontSize: 10 }}>W2</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 22, height: 78, background: '#38bdf8', borderRadius: 3 }} />
              <span className="dx-mono dx-dim" style={{ fontSize: 10 }}>W3</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 22, height: 95, background: '#f59e0b', borderRadius: 3 }} />
              <span className="dx-mono dx-dim" style={{ fontSize: 10 }}>W4</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, fontSize: 11, marginTop: 6 }}>
            <span style={{ color: '#38bdf8' }}>● Reach</span>
            <span style={{ color: '#f59e0b' }}>● Engagement</span>
          </div>
        </div>

        {/* 3. Top Content (30d) */}
        <div className="v2-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Play size={16} color="#ef4444" weight="fill" />
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Top Content (30d)</h4>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 4, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={14} color="#38bdf8" weight="fill" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>SQL Interview Quiz – #12</div>
                <div className="ov-muted" style={{ fontSize: 11 }}>498K views • 9.8% eng</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 4, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={14} color="#f59e0b" weight="fill" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>AI Agent Stack (Explained)</div>
                <div className="ov-muted" style={{ fontSize: 11 }}>286K views • 8.9% eng</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 4, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={14} color="#10b981" weight="fill" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>Build Your AI Portfolio</div>
                <div className="ov-muted" style={{ fontSize: 11 }}>221K views • 7.6% eng</div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. System Health & Circular Gauge */}
        <div className="v2-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Pulse size={16} color="#10b981" weight="bold" />
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>System Health</h4>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399' }}>
                <CheckCircle size={14} weight="fill" /> All Agents Operational
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399' }}>
                <CheckCircle size={14} weight="fill" /> MCP Connected
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399' }}>
                <CheckCircle size={14} weight="fill" /> Platform APIs Healthy
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: telegramConnected ? '#34d399' : '#f87171',
                }}
              >
                {telegramConnected ? (
                  <CheckCircle size={14} weight="fill" />
                ) : (
                  <X size={14} weight="bold" />
                )}
                {telegramConnected ? 'Telegram Bot Active' : 'Telegram: Not Connected'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8' }}>
                <CheckCircle size={14} weight="fill" /> Automation (Approval Mode)
              </div>
            </div>

            {/* Circular 99.6% Gauge */}
            <div style={{ textAlign: 'center' }}>
              <svg width="74" height="74" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.1)" strokeWidth="8" fill="none" />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="#10b981"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray="251.2"
                  strokeDashoffset="1"
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                />
                <text x="50" y="55" textAnchor="middle" fill="#f8fafc" fontSize="18" fontWeight="bold">
                  99.6%
                </text>
              </svg>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>System Uptime</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Slide-out MARG Orchestrator Command Drawer ─── */}
      {margDrawerOpen && (
        <div
          className="dx-drawer"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setMargDrawerOpen(false)}
        >
          <div className="dx-drawer__panel" style={{ maxWidth: 540 }}>
            <header className="dx-drawer__head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="v2-gold-logo-m" style={{ width: 32, height: 32, fontSize: 16 }}>M</div>
                <div>
                  <p className="dx-mono dx-dim">NTS COMMAND V2.0 • AI Orchestrator</p>
                  <h2 style={{ margin: 0 }}>MARG Master Assistant</h2>
                </div>
              </div>
              <button
                type="button"
                className="dx-iconbtn"
                onClick={() => setMargDrawerOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </header>

            <form onSubmit={handleMargPrompt} style={{ marginBottom: 16 }}>
              <label className="dx-label">Direct Command to MARG Orchestrator</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  className="dx-input"
                  placeholder="e.g. Draft 3 SQL puzzles on window functions for LinkedIn..."
                  value={quickPrompt}
                  onChange={(e) => setQuickPrompt(e.target.value)}
                />
                <button type="submit" className="dx-btn dx-btn--primary">
                  <Play size={14} weight="fill" /> Execute
                </button>
              </div>
            </form>

            <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.6)', margin: '14px 0 8px 0' }}>
              Live Orchestrator Event Log
            </h4>
            <div
              style={{
                background: 'rgba(0,0,0,0.3)',
                padding: 12,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)',
                fontFamily: 'monospace',
                fontSize: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              {margLogs.map((log, i) => (
                <div key={i} style={{ color: log.startsWith('Commander:') ? '#f59e0b' : '#38bdf8' }}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
