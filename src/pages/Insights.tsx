import { GlassButton } from '../components/GlassButton';
import { CONTENT_PILLARS } from '../content/blueprint';
import { SITE } from '../config';
import { PageHero, Section } from './parts';

export function Insights() {
  return (
    <>
      <PageHero eyebrow="Insights" title={<>Clear thinking on <em>AI and careers</em></>} lead="Articles, tutorials and explainers on SQL, AI tools and the AI-era job market." />
      <Section id="topics" title="Topics we cover">
        <ul className="chips">
          {CONTENT_PILLARS.map((p) => (
            <li key={p.title}>
              {p.title}: {p.text}
            </li>
          ))}
        </ul>
        <div className="band glass" style={{ marginTop: 28 }}>
          <div>
            <h2>The first articles are on their way</h2>
            <p>Until they land, every lesson is free on YouTube.</p>
          </div>
          <GlassButton href={SITE.social.youtube} external arrow>
            Watch on YouTube
          </GlassButton>
        </div>
      </Section>
    </>
  );
}
