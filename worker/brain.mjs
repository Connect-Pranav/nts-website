// NTS MASTER BRAIN: turns one owner instruction into a plan, delegates each step to the specialist agent
// that owns the tool, runs independent steps in parallel, holds sensitive steps for approval, and reports
// only what actually happened. Progress streams to the dashboard as Server-Sent Events.
import { HttpError, newId, nowIso } from './util.mjs';
import { generate, parseJson } from './providers.mjs';
import * as store from './store.mjs';
import * as ops from './ops.mjs';
import { TOOLS, callTool } from './tools.mjs';
import { AGENTS, DEPARTMENTS, agentById } from './team.mjs';

// tools the Brain uses itself (planning, memory, task bookkeeping); agent tools are delegated
const BRAIN_TOOLS = ['nts_get_business_context', 'nts_search_memory', 'nts_save_memory', 'nts_list_agents', 'nts_get_agent_status', 'nts_create_task', 'nts_get_task_status', 'nts_update_task', 'nts_get_execution_logs', 'nts_get_api_usage', 'nts_set_mode', 'nts_approve_content'];
const MAX_STEPS = 6;

function toolCatalogue() {
  return Object.entries(TOOLS)
    .map(([name, t]) => {
      const owners = AGENTS.filter((a) => a.tools.includes(name)).map((a) => a.id);
      const args = Object.keys(t.input).join(', ') || 'none';
      return `- ${name}(${args})${t.sensitive ? ' [needs owner approval]' : ''} owner: ${owners.length ? owners.join(' | ') : 'brain'} :: ${t.description}`;
    })
    .join('\n');
}

const PLAN_SYS = (context) => `${context}

You are the NTS MASTER BRAIN, the orchestrator of NTS COMMAND for NIKHILs TECH STUDIO. You are not an agent: you understand the owner's instruction, plan it, and delegate each step to the specialist agent that owns the tool.
AGENTS:
${AGENTS.map((a) => `- ${a.id} (${a.name}, ${DEPARTMENTS[a.dept]}): ${a.job}`).join('\n')}
TOOLS (use exact names and argument keys):
${toolCatalogue()}
Rules:
- Use the fewest steps that fully achieve the outcome (max ${MAX_STEPS}). Pick only the agents needed.
- A step's agent must own its tool ("brain" for brain tools). nts_run_agent is for written deliverables: put the full instruction in "task".
- Use dependsOn when a step needs another step's result; its output is passed to it automatically.
- Nothing can be published, posted or sent: there is no LinkedIn/Instagram publishing or email integration yet. Draft and hold for approval instead, and say so.
- For a plain question you can answer from the context, return no steps and answer in "reply".
- Reply in the owner's language (Hinglish if he writes Hinglish).
Return ONLY JSON: {"outcome":"max 15 words","reply":"one or two sentences for the owner before work starts","steps":[{"id":"s1","title":"max 10 words","agent":"agent id or brain","tool":"tool name","args":{},"dependsOn":[]}]}`;

const REPORT_SYS = `You are the NTS MASTER BRAIN reporting back to the owner. Report ONLY what the step results show: what was done, key outputs, what failed and why, what is waiting for approval and the next step. Never claim something was published, sent or deployed unless a result proves it. Use the owner's language. Plain text, short paragraphs, at most 8 short bullet lines with "- ".`;

function validate(plan) {
  const steps = [];
  const ids = new Set();
  for (const s of (Array.isArray(plan?.steps) ? plan.steps : []).slice(0, MAX_STEPS)) {
    const tool = TOOLS[s?.tool] ? s.tool : null;
    if (!tool) continue;
    const owners = AGENTS.filter((a) => a.tools.includes(tool)).map((a) => a.id);
    let agent = s.agent;
    if (BRAIN_TOOLS.includes(tool)) agent = owners.includes(agent) ? agent : 'brain';
    else if (!owners.includes(agent)) agent = owners[0];
    const id = /^[\w-]{1,12}$/.test(s.id) && !ids.has(s.id) ? s.id : `s${steps.length + 1}`;
    ids.add(id);
    steps.push({ id, title: String(s.title || tool).slice(0, 100), agent, tool, args: s.args && typeof s.args === 'object' ? s.args : {}, dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.map(String) : [] });
  }
  for (const s of steps) s.dependsOn = s.dependsOn.filter((d) => ids.has(d) && d !== s.id);
  return steps;
}

const brief = (r) => {
  const s = typeof r === 'string' ? r : JSON.stringify(r);
  return s.length > 1500 ? `${s.slice(0, 1500)}…` : s;
};

/** Run one command. `emit(event, data)` streams progress. Returns the stored command record. */
export async function runCommand(rawEnv, text, emit = () => {}) {
  const instruction = String(text || '').trim();
  if (instruction.length < 2 || instruction.length > 4000) throw new HttpError(400, 'Command must be 2 to 4000 characters.');
  const env = await store.withSettings(rawEnv);
  const o = await ops.getOps(rawEnv);
  const cmd = { id: newId('c'), text: instruction, at: nowIso(), status: 'planning', steps: [], reply: '', report: '' };
  emit('stage', { stage: 'understand' });
  await ops.log(rawEnv, 'command', `Owner: ${instruction.slice(0, 140)}`);

  const context = await store.brainContext(rawEnv);
  emit('stage', { stage: 'plan' });
  const pr = await generate(env, { system: PLAN_SYS(context), prompt: `OPERATING MODE: ${o.mode}${o.paused ? ' (PAUSED by kill switch)' : ''}\nOWNER INSTRUCTION: ${instruction}`, json: true, maxTokens: 1800 });
  await ops.countTokens(rawEnv, pr);
  const plan = parseJson(pr.text);
  const steps = validate(plan);
  cmd.outcome = String(plan.outcome || '').slice(0, 160);
  cmd.reply = String(plan.reply || '').slice(0, 600);
  cmd.brain = `${pr.engine} · ${pr.model}`;
  cmd.steps = steps.map((s) => ({ ...s, agentName: s.agent === 'brain' ? 'NTS Brain' : agentById(s.agent)?.name, status: 'planned' }));
  emit('plan', { outcome: cmd.outcome, reply: cmd.reply, steps: cmd.steps, brain: cmd.brain });

  // create a traceable task per step
  for (const s of cmd.steps) {
    const t = await ops.createTask(rawEnv, { title: s.title, agent: s.agent === 'brain' ? null : s.agent, tool: s.tool, args: s.args, status: 'planned', commandId: cmd.id });
    s.taskId = t.id;
  }

  emit('stage', { stage: 'delegate' });
  const done = new Map();
  const pending = new Set(cmd.steps.map((s) => s.id));
  emit('stage', { stage: 'execute' });
  while (pending.size) {
    const wave = cmd.steps.filter((s) => pending.has(s.id) && s.dependsOn.every((d) => done.has(d)));
    if (!wave.length) {
      for (const s of cmd.steps.filter((x) => pending.has(x.id))) {
        s.status = 'failed';
        s.error = 'Blocked: a step it depends on did not finish.';
        await ops.updateTask(rawEnv, s.taskId, { status: 'failed', error: s.error });
        emit('step', s);
      }
      break;
    }
    await Promise.all(
      wave.map(async (s) => {
        pending.delete(s.id);
        const blocked = s.dependsOn.some((d) => done.get(d)?.status !== 'completed');
        if (blocked) {
          s.status = 'failed';
          s.error = 'Skipped: a step it depends on failed or is waiting for approval.';
          await ops.updateTask(rawEnv, s.taskId, { status: 'failed', error: s.error });
        } else if (TOOLS[s.tool].sensitive) {
          s.status = 'waiting';
          await ops.updateTask(rawEnv, s.taskId, { status: 'waiting', approval: { requestedAt: nowIso(), reason: 'Sensitive action' } });
          await ops.log(rawEnv, 'approval', `Approval needed: ${s.title}`);
        } else {
          s.status = 'in_progress';
          emit('step', s);
          let args = s.args;
          if (s.tool === 'nts_run_agent' && s.dependsOn.length) args = { ...args, task: `${args.task || s.title}\n\nINPUT FROM EARLIER STEPS:\n${s.dependsOn.map((d) => `${d}: ${brief(done.get(d)?.result)}`).join('\n')}`.slice(0, 4000) };
          try {
            const r = await callTool(rawEnv, s.tool, args, { task: { id: s.taskId }, title: s.title, agent: s.agent, agentName: s.agentName, commandId: cmd.id, via: 'brain' });
            s.status = 'completed';
            s.result = r.result;
          } catch (e) {
            s.status = 'failed';
            s.error = String(e.message || e).slice(0, 400);
          }
        }
        done.set(s.id, s);
        emit('step', s);
      }),
    );
  }

  emit('stage', { stage: 'monitor' });
  if (cmd.steps.length) {
    const rr = await generate(env, {
      system: REPORT_SYS,
      prompt: `OWNER INSTRUCTION: ${instruction}\nOUTCOME WANTED: ${cmd.outcome}\nSTEP RESULTS:\n${cmd.steps.map((s) => `- ${s.id} ${s.title} [${s.agentName}] ${s.status}${s.error ? ` ERROR: ${s.error}` : ''}${s.result ? ` RESULT: ${brief(s.result)}` : ''}`).join('\n')}`,
      maxTokens: 1200,
    }).catch((e) => ({ text: `Report could not be written (${e.message}). Step statuses above are accurate.` }));
    if (rr.engine) await ops.countTokens(rawEnv, rr);
    cmd.report = rr.text.slice(0, 4000);
  } else cmd.report = cmd.reply;
  const failed = cmd.steps.filter((s) => s.status === 'failed').length;
  const waiting = cmd.steps.filter((s) => s.status === 'waiting').length;
  cmd.status = failed ? (failed === cmd.steps.length ? 'failed' : 'partial') : waiting ? 'waiting' : 'completed';
  emit('stage', { stage: 'learn' });
  await saveCommand(rawEnv, cmd);
  await ops.log(rawEnv, cmd.status === 'failed' ? 'error' : 'command', `Brain ${cmd.status}: ${cmd.outcome || instruction.slice(0, 80)}`);
  emit('done', { id: cmd.id, status: cmd.status, report: cmd.report, steps: cmd.steps });
  return cmd;
}

async function saveCommand(env, cmd) {
  const list = (await env.NTS_KV.get('commands', 'json')) || [];
  const slim = { ...cmd, steps: cmd.steps.map((s) => ({ ...s, result: s.result ? brief(s.result) : undefined })) };
  list.unshift(slim);
  await env.NTS_KV.put('commands', JSON.stringify(list.slice(0, 40)));
}

export async function commands(env) {
  return (env.NTS_KV && (await env.NTS_KV.get('commands', 'json'))) || [];
}

/** Approve or reject a step that was held for approval. Approving runs it now. */
export async function decideTask(env, taskId, action, reason = '') {
  const t = await ops.getTask(env, taskId);
  if (t.status !== 'waiting') throw new HttpError(409, `Task is ${t.status}, not waiting for approval.`);
  if (action === 'reject') {
    await ops.log(env, 'approval', `Rejected: ${t.title}${reason ? ` (${reason})` : ''}`);
    return ops.updateTask(env, taskId, { status: 'failed', error: `Rejected by owner${reason ? `: ${reason}` : ''}` });
  }
  await ops.log(env, 'approval', `Approved: ${t.title}`);
  await callTool(env, t.tool, t.args || {}, { task: { id: t.id }, title: t.title, agent: t.agent, via: 'approval' }).catch(() => {});
  return ops.getTask(env, taskId);
}

/** SSE response for the dashboard. */
export function streamCommand(env, text, ctx) {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const enc = new TextEncoder();
  const emit = (event, data) => w.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)).catch(() => {});
  const job = runCommand(env, text, emit)
    .catch((e) => emit('error', { error: String(e.message || e) }))
    .finally(() => w.close().catch(() => {}));
  ctx?.waitUntil?.(job);
  return new Response(readable, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}
