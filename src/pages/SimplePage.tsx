import { SITE } from '../config';
import { GlassButton } from '../components/GlassButton';

// Interim pages: real routes with real copy. Full page content is built in the next phase (approved homepage first).
export const PAGES: Record<string, { title: string; lead: string; anchors?: string[] }> = {
  '/about': { title: 'About the studio', lead: `${SITE.positioning}. Our mission: ${SITE.mission.charAt(0).toLowerCase()}${SITE.mission.slice(1)}` },
  '/lab': { title: 'AI Lab', lead: 'AI experiments, tools, demonstrations and case studies, built in the open.' },
  '/academy': { title: 'Academy', lead: 'Practical AI tutorials, hands-on exercises, career readiness and workshops for institutions.', anchors: ['career'] },
  '/insights': { title: 'Insights', lead: 'Articles, tutorials and clear explainers on AI tools and the AI-era job market.' },
  '/media': { title: 'Media Hub', lead: 'Our YouTube videos, Instagram Reels and LinkedIn posts in one place.' },
  '/contact': { title: 'Get started', lead: 'Partnerships, institutional programmes and collaborations. Reach us on any channel below.' },
};

export function SimplePage({ path }: { path: string }) {
  const p = PAGES[path];
  if (!p) return <NotFound />;
  return (
    <section className="page container" aria-labelledby="page-title">
      <h1 id="page-title">{p.title}</h1>
      <p className="lead">{p.lead}</p>
      {p.anchors?.map((a) => <span key={a} id={a} />)}
      <p className="note glass">This page is being built. Meanwhile, the newest lessons are on our channels.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 28 }}>
        <GlassButton href={SITE.social.youtube} external arrow>
          YouTube
        </GlassButton>
        <GlassButton href={SITE.social.instagram} external variant="secondary">
          Instagram
        </GlassButton>
        <GlassButton href={SITE.social.linkedin} external variant="secondary">
          LinkedIn
        </GlassButton>
      </div>
    </section>
  );
}

export function NotFound() {
  return (
    <section className="page container" aria-labelledby="page-title">
      <h1 id="page-title">Page not found</h1>
      <p className="lead">That link does not exist. Head back to the homepage or use search.</p>
      <div style={{ marginTop: 28 }}>
        <GlassButton href="/" arrow>
          Back to home
        </GlassButton>
      </div>
    </section>
  );
}
