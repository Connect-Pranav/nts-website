// Telegram Approvals & Notification Management — NTS COMMAND V2.0
// Real Telegram BotFather connectivity + simulated testing panel for offline testing.
// Clearly marked "Telegram: Not Connected" until live token is configured.

import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle,
  CircleNotch,
  PaperPlaneTilt,
  ShieldCheck,
  WarningCircle,
  ArrowSquareOut,
  Sparkle,
} from '@phosphor-icons/react';
import { Card, Pill, type Api, when, ago } from './shared';

export type TelegramStatus = {
  connected: boolean;
  configured: boolean;
  botUsername: string | null;
  botName?: string | null;
  chatId: string | null;
  adminCount: number;
  webhookActive: boolean;
  statusLabel: string;
  error?: string;
};

export type TelegramLog = {
  action: string;
  itemId?: string;
  title?: string;
  userId?: string;
  username?: string;
  liveTelegramSent?: boolean;
  at: string;
};

export function TelegramApprovalsPage({ api }: { api: Api }) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [logs, setLogs] = useState<TelegramLog[]>([]);
  const [busy, setBusy] = useState<string>('');
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);

  // Form states
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [adminIds, setAdminIds] = useState('');

  const load = useCallback(async () => {
    try {
      const s = await api<TelegramStatus>('/api/dev/telegram/status');
      setStatus(s);
      if (s.chatId) setChatId(s.chatId);
      const l = await api<{ logs: TelegramLog[] }>('/api/dev/telegram/logs');
      setLogs(l.logs || []);
    } catch (e) {
      setMsg({ text: (e as Error).message, kind: 'err' });
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const saveConfig = async () => {
    setBusy('save');
    setMsg(null);
    try {
      if (botToken) await api('/api/dev/settings', { method: 'POST', body: JSON.stringify({ name: 'TELEGRAM_BOT_TOKEN', value: botToken.trim() }) });
      if (chatId) await api('/api/dev/settings', { method: 'POST', body: JSON.stringify({ name: 'TELEGRAM_CHAT_ID', value: chatId.trim() }) });
      if (adminIds) await api('/api/dev/settings', { method: 'POST', body: JSON.stringify({ name: 'TELEGRAM_ADMIN_IDS', value: adminIds.trim() }) });
      setMsg({ text: 'Telegram credentials saved securely to Worker settings.', kind: 'ok' });
      setBotToken('');
      await load();
    } catch (e) {
      setMsg({ text: (e as Error).message, kind: 'err' });
    } finally {
      setBusy('');
    }
  };

  const testConnection = async () => {
    setBusy('test');
    setMsg(null);
    try {
      const res = await api<{ ok: boolean; messageId?: number }>('/api/dev/telegram/test', {
        method: 'POST',
        body: JSON.stringify({ chatId: chatId || undefined }),
      });
      if (res.ok) {
        setMsg({ text: `Test message sent successfully to Telegram! (Message ID: ${res.messageId})`, kind: 'ok' });
      }
    } catch (e) {
      setMsg({ text: `Test failed: ${(e as Error).message}`, kind: 'err' });
    } finally {
      setBusy('');
    }
  };

  const simulateApproval = async () => {
    setBusy('sim');
    setMsg(null);
    try {
      const res = await api<{ ok: boolean; note: string; liveTelegramSent: boolean }>('/api/dev/telegram/simulate', {
        method: 'POST',
        body: JSON.stringify({
          title: 'PostgreSQL Anti-Join Pitfalls & Solutions',
          channel: 'LinkedIn',
        }),
      });
      setMsg({
        text: res.note,
        kind: 'ok',
      });
      await load();
    } catch (e) {
      setMsg({ text: (e as Error).message, kind: 'err' });
    } finally {
      setBusy('');
    }
  };

  const disconnect = async () => {
    setBusy('disconnect');
    setMsg(null);
    try {
      await api('/api/dev/settings/TELEGRAM_BOT_TOKEN', { method: 'DELETE' });
      await api('/api/dev/settings/TELEGRAM_CHAT_ID', { method: 'DELETE' });
      await api('/api/dev/settings/TELEGRAM_ADMIN_IDS', { method: 'DELETE' });
      setMsg({ text: 'Telegram disconnected.', kind: 'ok' });
      await load();
    } catch (e) {
      setMsg({ text: (e as Error).message, kind: 'err' });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="pg">
      {/* ─── Status Card ─── */}
      <Card
        title="Telegram Approvals Bot"
        icon={<PaperPlaneTilt size={22} />}
        action={
          status?.connected ? (
            <Pill tone="ok">{status.statusLabel}</Pill>
          ) : (
            <Pill tone="bad">Telegram: Not Connected</Pill>
          )
        }
      >
        <p className="ov-muted" style={{ marginBottom: 14 }}>
          Connect an authorized Telegram bot to receive real-time publishing alerts and approve or reject content from mobile with inline interactive buttons (<code>[APPROVE]</code>, <code>[REJECT]</code>, <code>[EDIT]</code>).
        </p>

        {msg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              marginBottom: 16,
              background: msg.kind === 'ok' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${msg.kind === 'ok' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: msg.kind === 'ok' ? '#34d399' : '#f87171',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
            }}
          >
            {msg.kind === 'ok' ? <CheckCircle size={16} /> : <WarningCircle size={16} />}
            <span>{msg.text}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="dx-mono dx-dim" style={{ fontSize: 11 }}>BOT STATUS</span>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, color: status?.connected ? '#10b981' : '#f87171' }}>
              {status?.connected ? `@${status.botUsername}` : 'Not Connected'}
            </div>
            <span className="ov-muted" style={{ fontSize: 12 }}>{status?.connected ? 'Online & Listening' : 'Awaiting Bot Token'}</span>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="dx-mono dx-dim" style={{ fontSize: 11 }}>ADMIN CHAT ID</span>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
              {status?.chatId ? status.chatId : '—'}
            </div>
            <span className="ov-muted" style={{ fontSize: 12 }}>Target dispatch channel</span>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="dx-mono dx-dim" style={{ fontSize: 11 }}>AUTHORIZED ADMINS</span>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
              {status?.adminCount ?? 0} Users
            </div>
            <span className="ov-muted" style={{ fontSize: 12 }}>Allowed to approve</span>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="dx-mono dx-dim" style={{ fontSize: 11 }}>WEBHOOK ENDPOINT</span>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, color: '#38bdf8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              /api/telegram/webhook
            </div>
            <span className="ov-muted" style={{ fontSize: 12 }}>Callback query handler</span>
          </div>
        </div>

        {/* ─── Bot Credentials Setup ─── */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', marginTop: 12 }}>
          <h3 style={{ fontSize: 15, margin: '0 0 12px 0' }}>Bot Configuration & Credentials</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            <div>
              <label className="dx-label">Telegram Bot Token (from @BotFather)</label>
              <input
                type="password"
                className="dx-input"
                placeholder={status?.connected ? '••••••••••••••••••••••••••••••' : 'e.g. 1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ'}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
              />
              <span className="ov-muted" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                Obtain by sending <code>/newbot</code> to <strong>@BotFather</strong> on Telegram.
              </span>
            </div>

            <div>
              <label className="dx-label">Admin Chat ID or Channel ID</label>
              <input
                type="text"
                className="dx-input"
                placeholder="e.g. 987654321 or @NTS_Approvals"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
              />
              <span className="ov-muted" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                Target chat/group to receive approval alerts (find via <strong>@userinfobot</strong>).
              </span>
            </div>

            <div>
              <label className="dx-label">Authorized Admin User IDs (comma separated)</label>
              <input
                type="text"
                className="dx-input"
                placeholder="e.g. 123456789, 987654321"
                value={adminIds}
                onChange={(e) => setAdminIds(e.target.value)}
              />
              <span className="ov-muted" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                Your numeric Telegram User ID from <strong>@userinfobot</strong> (do not put Dev Token here).
              </span>
            </div>
          </div>

          <div className="dx-row" style={{ marginTop: 16, gap: 10, justifyContent: 'space-between' }}>
            <div className="dx-row" style={{ gap: 8 }}>
              <button type="button" className="dx-btn dx-btn--primary" onClick={saveConfig} disabled={busy === 'save'}>
                {busy === 'save' ? <CircleNotch className="spin" size={14} /> : <ShieldCheck size={14} />}
                Save Bot Credentials
              </button>
              {status?.connected && (
                <button type="button" className="dx-btn" onClick={testConnection} disabled={busy === 'test'}>
                  {busy === 'test' ? <CircleNotch className="spin" size={14} /> : <Bell size={14} />}
                  Send Test Ping
                </button>
              )}
            </div>

            {status?.configured && (
              <button type="button" className="nc-link" onClick={disconnect} disabled={busy === 'disconnect'}>
                Disconnect Bot
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* ─── Development Simulation Panel ─── */}
      <Card
        title="Development Testing & Simulation Center"
        icon={<Sparkle size={20} />}
        action={<Pill tone="live">[DEVELOPMENT SIMULATION]</Pill>}
      >
        <p className="ov-muted" style={{ marginBottom: 14 }}>
          Test the entire approval pipeline in simulation mode. Simulates an agent drafting a post, dispatches inline interactive buttons, and validates the callback flow without affecting production feeds.
        </p>

        <div className="dx-row" style={{ gap: 10, marginBottom: 16 }}>
          <button
            type="button"
            className="dx-btn dx-btn--primary"
            onClick={simulateApproval}
            disabled={busy === 'sim'}
          >
            {busy === 'sim' ? <CircleNotch className="spin" size={14} /> : <PaperPlaneTilt size={14} />}
            Simulate Pending Approval
          </button>
        </div>

        {/* ─── Audit Trail / Recent Events ─── */}
        <h4 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.6)', margin: '14px 0 8px 0' }}>
          Recent Telegram Approval Audit Trail
        </h4>

        {logs.length === 0 ? (
          <p className="ov-muted" style={{ fontSize: 13 }}>No Telegram events recorded yet. Run a simulated approval above to test.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {logs.map((log, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Pill tone={log.action.includes('approve') ? 'ok' : log.action.includes('reject') ? 'bad' : 'warn'}>
                    {log.action}
                  </Pill>
                  <span style={{ fontWeight: 600 }}>{log.title || log.itemId || 'Item'}</span>
                  {log.username && <span className="ov-muted">by @{log.username}</span>}
                </div>
                <span className="dx-mono dx-dim" style={{ fontSize: 11 }}>
                  {when(log.at)} ({ago(log.at)})
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ─── 30-Second BotFather Quick Setup Guide ─── */}
      <Card title="How to Setup Your Telegram Approval Bot in 30 Seconds" icon={<ArrowSquareOut size={20} />}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: 14, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <strong style={{ color: '#38bdf8' }}>Step 1: Open @BotFather</strong>
            <p className="ov-muted" style={{ fontSize: 13, marginTop: 6 }}>
              Open Telegram, search for <code>@BotFather</code> and send <code>/newbot</code>. Give your bot a name like <strong>NTS COMMAND Bot</strong>.
            </p>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: 14, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <strong style={{ color: '#38bdf8' }}>Step 2: Copy Bot Token</strong>
            <p className="ov-muted" style={{ fontSize: 13, marginTop: 6 }}>
              BotFather will reply with an HTTP API token (e.g. <code>123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11</code>). Paste it into the form above.
            </p>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: 14, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <strong style={{ color: '#38bdf8' }}>Step 3: Get Your Chat ID</strong>
            <p className="ov-muted" style={{ fontSize: 13, marginTop: 6 }}>
              Start your bot, then message <code>@userinfobot</code> in Telegram to instantly get your numeric Telegram ID and enter it as Chat ID.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
