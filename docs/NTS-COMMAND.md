# NTS COMMAND

The owner-only command center of NIKHILs TECH STUDIO, served by the same Cloudflare Worker as the website at `/dev` (Dev token required).

## Architecture

```
Owner ─► NTS COMMAND UI (/dev, React)          Claude Code / any MCP client
              │  REST + SSE (/api/dev/*)                │  MCP Streamable HTTP (/mcp)
              ▼                                         ▼
        worker/brain.mjs  NTS MASTER BRAIN ◄──── worker/mcp.mjs (official MCP SDK)
        understand → plan → delegate → execute (parallel) → hold sensitive → report
              │
              ▼
        worker/tools.mjs  one tool registry (zod-validated, 26 tools), used by both
              │
   ┌──────────┼──────────────┬──────────────┬───────────────┬──────────────┐
 store.mjs  work.mjs     signals.mjs   analytics.mjs  integrations.mjs  image.mjs
 memory     team cycle   leads/CRM     YouTube/SOMA   GitHub, health,   Gemini image
 rules      work board   scraper                      YouTube comments
              │
        ops.mjs  tasks · activity log · operating mode · kill switch · token usage
        team.mjs the 6 specialist agents and the tools each one owns
```

Storage: Workers KV (`NTS_KV`). Cron: every 6 h (signals scan → analytics refresh → team cycle), skipped when paused and the cycle is skipped in Manual mode.

## Agents (only what NTS needs)

| Agent | Department | Covers (from the plan) |
|---|---|---|
| LinkedIn Content Writer (MAYA) | Content & Social | LinkedIn strategist, writer, repurposing |
| Social Media Manager (LAKSHMI) | Content & Social | campaigns, creative director, social publishing (drafts) |
| Growth & Analytics (SOMA) | Growth & Intelligence | growth, SEO, analytics, research, competitors |
| Lead Response (SETU) | Lead Operations | lead generation, qualification, response, follow-up, CRM |
| Community Manager (SAKHI) | Community | social listening, engagement intelligence, YouTube/Instagram community, auto reply, reputation |
| DevOps (VISHWA) | Engineering | DevOps & deployment, QA & testing |

Strategy, planning and coordination are the Master Brain's own job. More agents can be added in `worker/team.mjs` when a real workload appears.

## Connect Claude Code (MCP)

```
claude mcp add --transport http nts-brain https://nts-website.pravanigroup.workers.dev/mcp --header "Authorization: Bearer <MCP_TOKEN or DEV_TOKEN>"
```

Sensitive tools (`nts_approve_content`, `nts_set_mode`) never act over MCP: they create an approval task in the Approvals center.

## Settings / secrets

Set in Dev Mode → Settings (AES-GCM encrypted in KV) or as Cloudflare secrets (secrets win).

| Name | Needed for |
|---|---|
| `DEV_TOKEN` (Cloudflare secret, 8+ chars) | Dev Mode and MCP auth |
| `GEMINI_API_KEY` / `GROQ_API_KEY` | the Brain and all agents (free tiers); a no-key cloud brain is the last fallback |
| `YOUTUBE_API_KEY` | exact channel analytics and reading comments |
| `GITHUB_TOKEN` (fine-grained, this repo: Contents read, Actions read/write) | Deployments page, Run tests |
| `MCP_TOKEN` (optional, 16+ chars) | separate token for MCP clients |
| `SARVAM_API_KEY` (optional, paid) | Marg's Indian voice |

## Not connected yet (shown honestly in the UI)

- LinkedIn publishing: needs an approved LinkedIn app (Community Management API). Posting is manual: "Post on LinkedIn" opens the composer; paste the link to record it.
- YouTube comment replies: needs the channel owner's OAuth sign-in (client ID/secret). Replies are drafted and copied for now.
- Instagram: needs an Instagram Graph API token from a Business/Creator account.
- Watch time, CTR, retention: private YouTube Analytics data (owner sign-in).

## Tests

`node --test worker/test/*.test.mjs` (also runs in GitHub Actions `ci.yml`, triggerable from Deployments).
