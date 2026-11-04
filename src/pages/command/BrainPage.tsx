import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Brain, CheckCircle, CircleNotch, Copy, HourglassMedium, Plug, Sparkle, WarningCircle, XCircle } from '@phosphor-icons/react';
import type { Api } from './shared';
import { Card, Pill, ago, toneOf } from './shared';

type Step = { id: string; title: string; agent: string; agentName?: string; tool: string; status: string; error?: string; result?: unknown };
type Run = { text: string; stage: string; outcome?: string; reply?: string; steps: Step[]; report?: string; status?: string; error?: string; brain?: string };
type Cmd = { id: string; text: string; at: string; status: string; outcome?: string; report?: string; steps: Step[] };
const STAGES = ['understand', 'plan', 'delegate', 'execute', 'monitor', 'learn'];

function StepIcon({ s }: { s: string }) {
  if (s === 'completed') return <CheckCircle size={18} weight="fill" className="ok" />;
  if (s === 'failed') return <XCircle size={18} weight="fill" className="bad" />;
  if (s === 'waiting') return <HourglassMedium size={18} weight="fill" className="warn" />;
  if (s === 'in_progress') return <CircleNotch size={18} className="spin" />;
  return <span className="br-dot" />;
}

const preview = (r: unknown) => {
  if (r == null) return '';
  if (typeof r === 'string') return r;
  const o = r as Record<string, unknown>;
  if (typeof o.text === 'string') return o.text;
  return JSON.stringify(r, null, 1);
};

export function BrainPage({ token, api, initial, onConsumed }: { token: string; api: Api; initial?: string; onConsumed: () => void }) {
  const [text, setText] = useState('');
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<Cmd[]>([]);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);
  const loadHist = () => api<{ commands: Cmd[] }>('/api/dev/commands').then((d) => setHist(d.commands), () => {});

  async function go(instruction: string) {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setRun({ text: instruction, stage: 'understand', steps: [] });
    try {
      const r = await fetch('/api/dev/command', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ text: instruction }) });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = (chunk.match(/^event: (.+)$/m) || [])[1];
          const data = JSON.parse((chunk.match(/^data: (.+)$/m) || [])[1] || '{}');
          setRun((cur) => {
            if (!cur) return cur;
            if (ev === 'stage') return { ...cur, stage: data.stage };
            if (ev === 'plan') return { ...cur, outcome: data.outcome, reply: data.reply, steps: data.steps, brain: data.brain };
            if (ev === 'step') return { ...cur, steps: cur.steps.map((s) => (s.id === data.id ? { ...s, ...data } : s)) };
            if (ev === 'done') return { ...cur, stage: 'done', report: data.report, status: data.status, steps: data.steps };
            if (ev === 'error') return { ...cur, stage: 'done', status: 'failed', error: data.error };
            return cur;
          });
        }
      }
    } catch (e) {
      setRun((cur) => (cur ? { ...cur, stage: 'done', status: 'failed', error: (e as Error).message } : cur));
    } finally {
      setBusy(false);
      loadHist();
      window.dispatchEvent(new Event('nts:work'));
    }
  }

  useEffect(() => {
    loadHist();
    if (initial && !started.current) {
      started.current = true;
      setText('');
      go(initial);
      onConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mcpUrl = `${window.location.origin}/mcp`;
  const cli = `claude mcp add --transport http nts-brain ${mcpUrl} --header "Authorization: Bearer <MCP_TOKEN or DEV_TOKEN>"`;
  const stageIx = run ? (run.stage === 'done' ? STAGES.length : STAGES.indexOf(run.stage)) : -1;

  return (
    <div className="br">
      <div className="br-main">
        <section className="nc-card br-cmd">
          <header className="dx-row">
            <Brain size={26} className="ov-brain__ic" />
            <div>
              <h2>NTS Brain</h2>
              <p className="ov-muted">One instruction → plan → the right agents → real tool calls → report. The chat is the command surface, not an agent.</p>
            </div>
          </header>
          <form
            className="ov-cmd"
            onSubmit={(e) => {
              e.preventDefault();
              const t = text;
              setText('');
              go(t);
            }}
          >
            <Sparkle size={18} className="ov-cmd__s" />
            <label className="sr-only" htmlFor="br-in">
              Command
            </label>
            <input id="br-in" value={text} onChange={(e) => setText(e.target.value)} placeholder='e.g. "Create 3 LinkedIn posts on SQL JOIN traps and check our YouTube growth"' maxLength={4000} disabled={busy} />
            <button type="submit" className="ov-cmd__go" aria-label="Run" disabled={busy}>
              {busy ? <CircleNotch size={18} className="spin" /> : <ArrowRight size={18} weight="bold" />}
            </button>
          </form>
          {run && (
            <div className="br-run" aria-live="polite">
              <p className="br-q">“{run.text}”</p>
              <ol className="br-stages">
                {STAGES.map((s, i) => (
                  <li key={s} className={i < stageIx ? 'done' : i === stageIx ? 'on' : ''}>
                    {s}
                  </li>
                ))}
              </ol>
              {run.outcome && (
                <p>
                  <b>Outcome:</b> {run.outcome} {run.brain && <span className="ov-muted">· {run.brain}</span>}
                </p>
              )}
              {run.reply && <p className="ov-muted">{run.reply}</p>}
              <ul className="br-steps">
                {run.steps.map((s) => (
                  <li key={s.id}>
                    <StepIcon s={s.status} />
                    <div>
                      <b>{s.title}</b>
                      <small>
                        {s.agentName || s.agent} · <code>{s.tool}</code> · {s.status === 'waiting' ? 'waiting for your approval (Approvals)' : s.status}
                      </small>
                      {s.error && <p className="dx-err">{s.error}</p>}
                      {s.result != null && (
                        <details>
                          <summary>Output</summary>
                          <pre>{preview(s.result).slice(0, 4000)}</pre>
                        </details>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {run.error && (
                <p className="dx-err">
                  <WarningCircle size={16} /> {run.error}
                </p>
              )}
              {run.report && (
                <div className="br-report">
                  <Pill tone={toneOf(run.status || '')}>{run.status}</Pill>
                  <pre>{run.report}</pre>
                </div>
              )}
            </div>
          )}
        </section>

        <Card title="Command history">
          <ul className="br-hist">
            {hist.map((c) => (
              <li key={c.id}>
                <details>
                  <summary>
                    <Pill tone={toneOf(c.status)}>{c.status}</Pill> <b>{c.outcome || c.text.slice(0, 80)}</b> <small className="ov-muted">{ago(c.at)}</small>
                  </summary>
                  <p className="ov-muted">“{c.text}”</p>
                  <ul className="br-steps">
                    {c.steps.map((s) => (
                      <li key={s.id}>
                        <StepIcon s={s.status} />
                        <div>
                          <b>{s.title}</b>
                          <small>
                            {s.agentName || s.agent} · <code>{s.tool}</code> · {s.status}
                          </small>
                          {s.error && <p className="dx-err">{s.error}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {c.report && <pre className="br-rep2">{c.report}</pre>}
                </details>
              </li>
            ))}
            {!hist.length && <li className="ov-muted">No commands yet.</li>}
          </ul>
        </Card>
      </div>
      <aside className="br-side">
        <Card title="MCP connection" icon={<Plug size={20} />} action={<Pill tone="ok">Streamable HTTP</Pill>}>
          <p className="ov-muted">The same tools the Brain uses, for Claude Code or any MCP client. Sensitive tools only create approval requests.</p>
          <p className="dx-label">Endpoint</p>
          <code className="br-code">{mcpUrl}</code>
          <p className="dx-label">Claude Code</p>
          <code className="br-code">{cli}</code>
          <button
            type="button"
            className="dx-btn"
            onClick={() => {
              navigator.clipboard?.writeText(cli);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Copy size={14} /> {copied ? 'Copied' : 'Copy command'}
          </button>
        </Card>
      </aside>
    </div>
  );
}
