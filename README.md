# NIKHILs TECH STUDIO: Website 2.0

India's Practice Gym for the AI Era. Learn. Practice. Simulate. Grow.

**Status:** Homepage built to the approved Emerald Teal glassmorphism design, with Founder's note and Vision/Mission/Values. About, AI Lab, Academy, Media Hub, Insights and Contact are filled from the Company Blueprint Book (Edition 1). Internal-only material (pricing, revenue targets, finance, risks, legal) is deliberately not published. The admin dashboard, social integrations and agents come in the next phases (backend modules already in `worker/`, not yet wired).

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
- Colours: `src/styles/tokens.css` (dark + light modes of one Emerald Teal palette).

## Components
`Header`, `HeroSection`, `GlassButton`, `FeaturePillars`, `ExploreCards`, `Footer`, `SearchDialog`, `VideoModal`.

## Docs
`docs/AUDIT.md`, `docs/AGENT_MAPPING.md`, `migrations/0001_init.sql` (database schema for the next phase).

## Dev Mode (`/dev`)
Token-protected agent console, hidden from navigation and search engines.
- Set the secret: `npx wrangler secret put DEV_TOKEN` (24+ random characters).
- Open `/dev`, enter the token. It is kept in that browser tab only (sessionStorage).
- All 32 agents are enabled: the 31 Ganesha agents (read-only snapshot in `agents/ganesha-catalog.snapshot.json`) plus Dal_Abba. Toggle any off for the session.
- **Run** sends a task to the agent on free engines (`GEMINI_API_KEY` or `GROQ_API_KEY` secrets). Agents only draft text: no publishing, posting, spending or deploying.
- 10 wrong tokens from one IP lock it for 15 minutes; 20 runs per minute max.

## Secrets (Cloudflare → Worker → Settings → Variables and Secrets)
| Name | Needed for |
|---|---|
| `YOUTUBE_API_KEY` | Watch Intro plays the latest @NikhilsTechStudio video |
| `DEV_TOKEN` | Dev Mode access |
| `GEMINI_API_KEY` / `GROQ_API_KEY` | Running agents in Dev Mode (free tiers) |
