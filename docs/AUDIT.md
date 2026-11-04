# Architecture Audit — NIKHILs TECH STUDIO Website 2.0

Audit date: 2026-11-04. Read-only inspection — no existing repository was modified.

| Repo inspected | Commit | Purpose |
|---|---|---|
| `Connect-Pranav/Ganesha-AI-Studio` | `bc8b2c3` | Agent ecosystem (31 agents), Worker + D1 backend patterns |
| `Connect-Pranav/Nikhils_Tech_Studio` | `5240531` | Existing NTS internal OS, official logo, Dal_Abba (AI Ninja) assistant |

## 1. Existing frontend / backend

**Ganesha AI Studio**
- Frontend: React 18 + TypeScript 5.6 + Vite 5, no CSS framework (hand-written CSS), Three.js for an optional 3D scene.
- Backend: Cloudflare Worker (`worker/index.mjs`, ~7.9k lines across 28 modules) serving `dist/` as static assets + `/api/*`.
- Database: Cloudflare D1 `ganesha` with 21 forward migrations + rollbacks. KV `MEDIA` for reel media. Cron every 5 min.
- Auth: single `ADMIN_TOKEN` bearer token, constant-time compare (`safeEqual`).
- Secrets: Worker secrets, or AES-GCM-encrypted rows in D1 (key derived from `ADMIN_TOKEN`). Values never returned to the browser.
- AI providers (`worker/providers.mjs`): Gemini (free) → Groq (free) first; Claude/OpenAI only when explicitly named. Every call logged to `provider_calls` (tokens, latency, never prompt text).
- OAuth: Instagram API with Instagram Login (`/ig/callback`) and Google OAuth for YouTube Analytics (`/yt/callback`), both with a D1 `*_oauth_state` table (TTL) and encrypted refresh tokens.
- Deployment: GitHub → Cloudflare Workers Builds, `pravanigroup.workers.dev`. `keep_vars: true`.
- Tests: `node --test` against worker modules.

**Nikhils_Tech_Studio (NTS OS)**
- Static site, vanilla ES5, ~3.3k lines JS, GitHub Pages. Data in `localStorage`/IndexedDB; Google Apps Script for shared requests.
- `logo.jpg` — the official logo (blue neon ring, rising bars, "NIKHILs TECH STUDIO", "Learn. Practice. Simulate. Grow."). **Reused unchanged.**
- `social.js` — manual social tracking with an honest "nothing is connected without a backend" model. Its API/scope notes informed the integration layer here.
- `ninja-*.js` — **Dal_Abba**, the NTS AI Ninja: local rule brain + optional on-device WebLLM. This is the existing agent for "NIKHIL AI Ninja — Phase 2".

## 2. Agents, orchestration, MCP

- `agents/registry.json` holds 31 agents across 5 teams (master, sunverse, littleloop, foliocraft, ops), each with mission, I/O, permissions, `approvalRequired`, engines, retries and a contract file.
- Orchestration: `worker/orchestrator.mjs` + `agents/pipelines.json` (template pipelines), plus GitHub Actions runners.
- MCP: none in the Ganesha repo. AGENTVERSE hosts a separate Song Studio MCP for Sunverse, which isn't relevant to NTS.
- Full mapping: see [`AGENT_MAPPING.md`](AGENT_MAPPING.md).

## 3. Design skills and themes

- Skills available in this session: `frontend-design`, `design-taste-frontend` (TasteSkill), `ui-ux-pro-max`.
- Existing themes: Ganesha has Classic navy + optional neon HUD. NTS OS has glass dark/light tokens (green botanical splash). **Neither is reused.** The brief asks for one new system (Dark Studio / Light Studio, graphite + purple/orange). It is built once in `src/styles/tokens.css` and nothing else.
- Note: the official logo is blue, and the brief's accents are purple and warm orange. The logo stays untouched inside a neutral graphite frame so the colours don't clash.

## 4. Reuse decisions

| Area | Decision | Reason |
|---|---|---|
| Stack | React + TS + Vite + Cloudflare Worker + D1 (same as Ganesha) | Proven on the owner's account, free tier, no new platform |
| Next.js / Tailwind | **Not used** | Next.js on Workers needs the OpenNext adapter (heavier, more moving parts). Tailwind adds a build dependency where a 1-file token system is enough. Recorded as a deliberate deviation from the "preferred if compatible" note. |
| Auth | **Upgraded** from a shared bearer token to password login + server sessions + CSRF + roles | The public site and admin share an origin, so cookie sessions are safer than a token in localStorage |
| Provider layer | Same free-first pattern (Gemini → Groq), re-implemented in a small module | Ganesha's module is coupled to its own tables. Copying the pattern, not the file, keeps NTS isolated |
| OAuth pattern | Same state-table + encrypted-token pattern | Proven. Extended to LinkedIn |
| Database | **New D1 database `nts`** | The brief requires NTS to stay separate from Ganesha / GANESHA GROWTH AI |
| Logo | Reused as-is | Brand rule: never invent a replacement |
| Dal_Abba | Reused in Phase 2 as the public assistant | Avoids a duplicate assistant |

## 5. Gaps found

- No NTS backend exists today. NTS OS is browser-only.
- No NTS social OAuth apps exist yet. LinkedIn is a **personal profile** (`/in/nikhil-kumar-3782a9444`). The Instagram and YouTube handles haven't been supplied yet.
- No NTS database. A new one is created.
