import { GlassButton } from '../components/GlassButton';
import { AUDIENCES, FOUNDATION, JOURNEY, TEAM, UNITS } from '../content/blueprint';
import { Cards, PageHero, Section, Steps } from './parts';

export function About() {
  return (
    <>
      <PageHero eyebrow="About the studio" title={<>Career readiness for the <em>AI era</em></>} lead={FOUNDATION.bigIdea}>
        <GlassButton href="/academy" arrow>
          Explore Academy
        </GlassButton>
        <GlassButton href="/contact" variant="secondary">
          Partner with us
        </GlassButton>
      </PageHero>
      <Section id="thesis" title={<>Our <em>thesis</em></>}>
        <p className="about__thesis">{FOUNDATION.thesis}</p>
      </Section>
      <Section id="who" title="Who we serve" lead="Students and switchers learn with us from day one. Professionals and institutions help us scale.">
        <Cards items={AUDIENCES.map((a) => ({ title: a.title, text: a.who, meta: a.need }))} cols={4} />
      </Section>
      <Section id="journey" title="From first video to first job" lead="Every step builds proof, and every success story brings the next learner in.">
        <Steps items={JOURNEY} />
      </Section>
      <Section id="units" title={<>One studio, four <em>units</em></>} lead="Media attracts, Practice converts, Careers retains and Business scales.">
        <Cards items={UNITS} cols={4} />
      </Section>
      <Section id="team" title="The founding team" lead="No titles, just clear ownership. Every area has one owner.">
        <Cards items={TEAM.map((t) => ({ title: t.name, text: t.owns }))} cols={3} />
      </Section>
    </>
  );
}
