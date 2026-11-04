# NIKHILs TECH STUDIO: Website 2.0

India's Practice Gym for the AI Era. Learn. Practice. Simulate. Grow.

**Status:** Homepage built to the approved Graphite & Gold glassmorphism design (Emerald Teal was the earlier version), with Founder's note and Vision/Mission/Values. About, AI Lab, Academy, Media Hub, Insights and Contact are filled from the Company Blueprint Book (Edition 1). Internal-only material (pricing, revenue targets, finance, risks, legal) is deliberately not published. The admin dashboard, social integrations and agents come in the next phases (backend modules already in `worker/`, not yet wired).

## Stack
React 18 + TypeScript + Vite, plain CSS with design tokens (`src/styles/tokens.css`). Hosted on Cloudflare Workers (free tier, static assets with SPA fallback). This is the same stack as Ganesha AI Studio, but kept fully separate.

## Run
```bash
npm install
npm run dev        # local dev
npm run build      # typecheck + production build to dist/
npx wrangler deploy   # deploy (after `npx wrangler login`)
```

## Edit
- Intro video for **Watch Intro**: set `introVideoId` in `src/config.ts`. While it's empty, the button opens the YouTube channel.
- Social links and nav: `src/config.ts`.
- Colours: `src/styles/tokens.css` (dark + light modes of one Graphite & Gold palette: #17191D, #24262A, #AEB2B8, #D8B98B, #F5F1E9).
- YouTube tile (homepage): plays the channel's uploads as a looping, muted playlist via `/api/public/youtube` (needs `YOUTUBE_API_KEY`). Without the key it shows a link to the channel.

## Components
`Header`, `HeroSection`, `GlassButton`, `FeaturePillars`, `ExploreCards`, `Footer`, `SearchDialog`, `VideoModal`.

## Docs
`docs/AUDIT.md`, `docs/AGENT_MAPPING.md`, `migrations/0001_init.sql` (database schema for the next phase).

## Dev Mode (`/dev`)
Token-protected agent console. Open it from the `</>` icon in the header (inside the menu on phones); search engines are told not to index it.
- Tabs: **Agents** (run a task, Copy, Save to Brain), **Brain** (company knowledge + saved notes that every agent reads), **Settings** (add API keys from the site, encrypted in KV with a key derived from `DEV_TOKEN`; Cloudflare secrets take priority; Test button per engine).
- Storage: KV namespace `NTS_KV`, created automatically on deploy (free tier).
- Set the secret: `npx wrangler secret put DEV_TOKEN` (8+ characters).
- Open `/dev`, enter the token. It is kept in that browser tab only (sessionStorage).
- Only the agents NTS needs (registry entries with `dev: true`): **LinkedIn Content Writer** (MAYA-OPS), **Social Media Manager** for LinkedIn, Instagram and YouTube (LAKSHMI-OPS), **Growth & Analytics** (SOMA). GANESHA orchestrates the content workflow behind the scenes. No Sunverse, LittleLoop or Foliocraft agents.
- **Run** sends a task to the agent on free engines (`GEMINI_API_KEY` or `GROQ_API_KEY` secrets). Agents only draft text: no publishing, posting, spending or deploying.
- 10 wrong tokens from one IP lock it for 15 minutes; 20 runs per minute max.

## Secrets (Cloudflare → Worker → Settings → Variables and Secrets)
| Name | Needed for |
|---|---|
| `YOUTUBE_API_KEY` | Watch Intro plays the latest @NikhilsTechStudio video |
| `DEV_TOKEN` | Dev Mode access |
| `GEMINI_API_KEY` / `GROQ_API_KEY` | Running agents in Dev Mode (free tiers) |

## Disha (chat + voice assistant, every page)
All VANI features from AGENTVERSE, rebuilt for NTS: floating orb, chat panel, full-screen mode, mic input (Hindi/Hinglish/English), spoken replies, conversation mode, "Hi Disha" wake word, stop/interrupt, clear chat, opening brief, suggestion chips, and a local rule brain when no AI key is set.
- **Visitors:** answers from public NTS knowledge, navigates pages, opens YouTube/Instagram/LinkedIn. Free device voice.
- **Owner** (Dev token entered in this tab): Disha reads the Brain, runs the 3 agents (LinkedIn Content Writer, Social Media Manager, Growth & Analytics), saves results to the Brain, opens Dev tabs.
- **Voice:** owner can use Sarvam Bulbul (`SARVAM_API_KEY` in Dev Mode → Settings; voice `DISHA_SARVAM_SPEAKER`, daily cap `DISHA_TTS_DAILY_CHARS`, default 5000). Sarvam is paid per character after sign-up credits; cached per sentence; falls back to the free device voice. Visitors never use Sarvam.
- API: `POST /api/disha/chat`, `GET /api/disha/voice` (owner), `POST /api/disha/tts` (owner).
