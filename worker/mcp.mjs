// NTS BRAIN MCP server: the official MCP TypeScript SDK over Streamable HTTP (stateless, JSON responses),
// served by the same Cloudflare Worker at POST /mcp. Tools come from worker/tools.mjs, so Claude Code and
// the dashboard run exactly the same code. Auth: Authorization: Bearer <MCP_TOKEN or DEV_TOKEN>.
// Sensitive tools called over MCP never act directly: they create an approval task for the owner.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { json, safeEqual } from './util.mjs';
import { TOOLS, callTool } from './tools.mjs';
import * as ops from './ops.mjs';

const INSTRUCTIONS = `NTS BRAIN for NIKHILs TECH STUDIO. Call nts_get_business_context before planning. Agents only draft: nothing is published, posted or sent without the owner. Sensitive tools return an approval request instead of acting.`;

function authorized(env, request) {
  const token = env.MCP_TOKEN && env.MCP_TOKEN.length >= 16 ? env.MCP_TOKEN : env.DEV_TOKEN;
  if (!token || token.length < 8) return false;
  const h = request.headers.get('authorization') || '';
  const got = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  return Boolean(got) && safeEqual(got, token);
}

export function buildServer(env) {
  const server = new McpServer({ name: 'nts-brain', version: '1.0.0' }, { instructions: INSTRUCTIONS });
  for (const [name, t] of Object.entries(TOOLS)) {
    server.registerTool(name, { description: t.description, inputSchema: t.input, annotations: { readOnlyHint: /^nts_(get|search|list|check)_/.test(name), destructiveHint: false, openWorldHint: /scan|youtube|deployment|tests|analytics|image/.test(name) } }, async (args) => {
      try {
        if (t.sensitive) {
          const task = await ops.createTask(env, { title: `${name} (requested via MCP)`, tool: name, args, status: 'waiting' });
          await ops.log(env, 'approval', `Approval needed (MCP): ${name}`);
          const out = { approvalRequired: true, task: task.id, message: 'Held for the owner in the NTS Approvals center.' };
          return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
        }
        const r = await callTool(env, name, args ?? {}, { title: name, via: 'mcp' });
        const out = { task: r.task, ...(r.result && typeof r.result === 'object' && !Array.isArray(r.result) ? r.result : { result: r.result }) };
        return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: String(e.message || e) }] };
      }
    });
  }
  return server;
}

export async function handleMcp(env, request) {
  if (!authorized(env, request)) return json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized: send Authorization: Bearer <MCP_TOKEN>' }, id: null }, 401, { 'www-authenticate': 'Bearer' });
  const server = buildServer(env);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // stateless: one server per request
    queueMicrotask(() => server.close().catch(() => {}));
  }
}
