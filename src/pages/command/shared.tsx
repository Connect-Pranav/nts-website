// Shared helpers for NTS COMMAND pages.
import type { ReactNode } from 'react';

export type Api = <T>(path: string, init?: RequestInit) => Promise<T>;
export type Go = (page: Page, arg?: string) => void;
export type Page = 'overview' | 'brain' | 'agents' | 'work' | 'approvals' | 'leads' | 'linkedin' | 'social' | 'analytics' | 'deploy' | 'memory' | 'settings';

export type Ops = { mode: 'manual' | 'assisted' | 'autonomous'; paused: boolean };
export type Overview = {
  ops: Ops;
  kpis: { agents: number; runningTasks: number; completed: number; completedWeek: number; newLeads: number; approvals: number; readyToPost: number; deployments: number | null };
  health: { brain: boolean; engines: string[]; runtime: boolean; integrations: { on: number; total: number; list: { name: string; on: boolean }[] }; automation: string };
  agents: { id: string; name: string; code: string; dept: string; job: string; status: 'running' | 'idle' | 'failed'; last: { title: string; status: string; at: string } | null }[];
  activity: { id: string; kind: string; text: string; at: string; url?: string }[];
  workflows: { id: string; name: string; kind: string; status: string; done: number; total: number; at: string }[];
  growth: { at: string; subscribers: number | null; views: number | null }[];
  usage: { day: string; cloudBrainCalls: number; images: number; tokens: Record<string, { calls: number; input: number; output: number; costUsd: number }> };
};

export const ago = (iso?: string | null) => {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
export const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export function Card({ title, icon, action, children, className = '' }: { title?: ReactNode; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`nc-card ${className}`}>
      {(title || action) && (
        <header className="nc-card__head">
          {icon && <span className="nc-card__icon">{icon}</span>}
          <h2>{title}</h2>
          {action && <div className="nc-card__act">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Pill({ tone = 'idle', children }: { tone?: 'ok' | 'warn' | 'bad' | 'idle' | 'live'; children: ReactNode }) {
  return <span className={`nc-pill nc-pill--${tone}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="nc-empty">{children}</p>;
}

export const toneOf = (s: string): 'ok' | 'warn' | 'bad' | 'idle' | 'live' => (/(completed|ready|ok|approved|replied|won|online|healthy|active)/.test(s) ? 'ok' : /(waiting|pending|escalated|partial|planned|qualified|meeting)/.test(s) ? 'warn' : /(failed|rejected|error|lost)/.test(s) ? 'bad' : /(running|in_progress)/.test(s) ? 'live' : 'idle');
