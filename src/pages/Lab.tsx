import { GlassButton } from '../components/GlassButton';
import { AGENT_DELIVERY, AGENTS_FOR_BUSINESS, LAB_LATER } from '../content/blueprint';
import { Cards, PageHero, Section, Steps } from './parts';

export function Lab() {
  return (
    <>
      <PageHero eyebrow="AI Lab" title={<>We practise what we <em>teach</em></>} lead="Custom AI agents for real business workflows, and the experiments we build in the open.">
        <GlassButton href="#agents" arrow>
          Custom AI agents
        </GlassButton>
        <GlassButton href="/academy#ai-academy" variant="secondary">
          AI Academy
        </GlassButton>
      </PageHero>
      <Section id="agents" title={<>Custom AI agents for <em>business</em></>} lead="Agents built for specific business needs, delivered in two to four weeks each.">
        <Cards items={AGENTS_FOR_BUSINESS.map((a) => ({ title: a.title, text: a.text, meta: a.who }))} cols={4} />
      </Section>
      <Section id="delivery" title="How we deliver an agent">
        <Steps items={AGENT_DELIVERY} />
      </Section>
      <Section id="next" title="In the lab next" lead="Built only after our first two products prove themselves with learners.">
        <Cards items={LAB_LATER} cols={3} />
      </Section>
      <section className="sec">
        <div className="wrap">
          <div className="band glass">
            <div>
              <h2>Have a workflow an agent could run?</h2>
              <p>Tell us the job. We will tell you honestly whether an agent fits.</p>
            </div>
            <GlassButton href="/contact" arrow>
              Discuss an agent
            </GlassButton>
          </div>
        </div>
      </section>
    </>
  );
}
