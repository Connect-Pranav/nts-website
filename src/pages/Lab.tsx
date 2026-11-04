import { GlassButton } from '../components/GlassButton';
import { AGENT_DELIVERY, AGENTS_FOR_BUSINESS, LAB_LATER } from '../content/blueprint';
import { Cards, PageHero, Section, Steps } from './parts';

const SUITE = [
  { title: 'Learn AI', text: 'AI Academy tracks for Claude, ChatGPT, Gemini, Grok, Copilot and NotebookLM, plus a prompt library.', meta: 'For students, professionals and teams' },
  { title: 'Career AI', text: 'AI Resume Writer, LinkedIn Optimizer, Cover Letter AI, Job Hunter and the Interview Simulator.', meta: 'For job seekers and switchers' },
  { title: 'Business AI', text: 'Custom AI agents built for one specific business workflow.', meta: 'For SMEs, colleges, creators and local businesses' },
];

export function Lab() {
  return (
    <>
      <PageHero eyebrow="AI Lab" title={<>We practise what we <em>teach</em></>} lead="The NTS AI Suite: learn AI tools, use AI to get hired, and get AI agents built for your work. One login and one AI profile across all of it.">
        <GlassButton href="#agents" arrow>
          Custom AI agents
        </GlassButton>
        <GlassButton href="/academy#ai-academy" variant="secondary">
          AI Academy
        </GlassButton>
      </PageHero>
      <Section id="suite" title={<>Three AI product <em>lines</em></>} lead="Learners move from learning AI to getting hired with it. Businesses come straight to Business AI.">
        <Cards items={SUITE} cols={3} />
      </Section>
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
