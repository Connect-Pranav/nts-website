import { GlassButton } from '../components/GlassButton';
import { AI_EXTRAS, AI_TRACKS, CAREER_AI, INTERVIEW_SIM, JOB_HUNTER, SQL_SPRINT } from '../content/blueprint';
import { SITE } from '../config';
import { Cards, PageHero, Section, Steps } from './parts';

export function Academy() {
  return (
    <>
      <PageHero eyebrow="Academy" title={<>Learn it. Practise it. <em>Prove it.</em></>} lead="Short, practical tracks where every lesson is a real job task. SQL first, then the AI tools every job now needs, then the support to get hired.">
        <GlassButton href="#sql-sprint" arrow>
          See SQL Sprint
        </GlassButton>
        <GlassButton href={SITE.social.youtube} external variant="secondary">
          Free lessons on YouTube
        </GlassButton>
      </PageHero>

      <Section id="sql-sprint" title={<>Practise <em>daily</em></>}>
        <div className="panel glass">
          <div>
            <h3>{SQL_SPRINT.title}</h3>
            <p className="promise">{SQL_SPRINT.promise}</p>
            <span className="status">{SQL_SPRINT.status}</span>
            <ol className="path" aria-label="The 30-day path">
              {SQL_SPRINT.path.map((p) => (
                <li key={p.stage}>
                  <b>{p.stage}</b>
                  <span>{p.days}</span>
                  {p.note && <i>{p.note}</i>}
                </li>
              ))}
            </ol>
          </div>
          <ul className="ticks">
            {SQL_SPRINT.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </Section>

      <Section id="interview" title={<>Simulate the <em>real round</em></>}>
        <div className="panel glass">
          <div>
            <h3>{INTERVIEW_SIM.title}</h3>
            <p className="promise">{INTERVIEW_SIM.promise}</p>
            <p className="label">Roles</p>
            <ul className="chips">
              {INTERVIEW_SIM.roles.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="label">Rounds</p>
            <ul className="chips">
              {INTERVIEW_SIM.rounds.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          <div>
            <ul className="g g-2">
              {INTERVIEW_SIM.features.map((f) => (
                <li key={f.title}>
                  <div className="card" style={{ background: 'var(--glass-highlight)', padding: 18 }}>
                    <h3>{f.title}</h3>
                    <p>{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <Steps items={INTERVIEW_SIM.flow} />
        </div>
      </Section>

      <Section id="ai-academy" title={<>AI <em>Academy</em></>} lead="Tool tracks built around real tasks, not feature tours. Our Claude and Grok videos become the free first lessons.">
        <ul className="rows">
          {AI_TRACKS.map((t) => (
            <li key={t.title} className="row glass">
              <h3>{t.title}</h3>
              <p>{t.teach}</p>
              <p>{t.task}</p>
              <span className="len">{t.length}</span>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 18 }}>
          <Cards items={AI_EXTRAS} cols={3} />
        </div>
      </Section>

      <Section id="career" title={<>Career <em>readiness</em></>} lead="Everything a job seeker needs after learning the skill: written, matched and tracked by AI.">
        <Cards items={CAREER_AI} cols={4} />
        <div className="panel glass" style={{ marginTop: 18 }}>
          <div>
            <h3>{JOB_HUNTER.title}</h3>
            <p className="promise">{JOB_HUNTER.promise}</p>
            <div style={{ marginTop: 20 }}>
              <Steps items={JOB_HUNTER.steps} />
            </div>
          </div>
          <ul className="g g-2">
            {JOB_HUNTER.features.map((f) => (
              <li key={f.title}>
                <div className="card" style={{ background: 'var(--glass-highlight)', padding: 18 }}>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <section className="sec">
        <div className="wrap">
          <div className="band glass">
            <div>
              <h2>Bring the Academy to your campus or team</h2>
              <p>Workshops, team seats and readiness reports for colleges and companies.</p>
            </div>
            <GlassButton href="/contact" arrow>
              Partner with us
            </GlassButton>
          </div>
        </div>
      </section>
    </>
  );
}
