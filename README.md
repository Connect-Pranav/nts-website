# NIKHILs TECH STUDIO: Website 2.0

India's Practice Gym for the AI Era. Learn. Practice. Simulate. Grow.

**Status:** Homepage built to the approved Emerald Teal glassmorphism design. Inner pages are live routes with interim copy. The admin dashboard, social integrations and agents come in the next phases (backend modules already in `worker/`, not yet wired).

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
