import { LinkedinLogo, Quotes } from '@phosphor-icons/react';
import { FOUNDER } from '../content/blueprint';
import { GlassButton } from './GlassButton';
import './FounderNote.css';

/** Founder's view: photo + note from the Company Blueprint. */
export function FounderNote() {
  const paras = FOUNDER.note;
  return (
    <section className="sec founder" aria-labelledby="founder-title">
      <div className="wrap">
        <div className="founder__panel glass">
          <figure className="founder__photo">
            <img src={FOUNDER.photo} alt={`${FOUNDER.name}, founder of NIKHILs TECH STUDIO`} width={850} height={880} loading="lazy" decoding="async" />
          </figure>
          <div className="founder__copy">
            <h2 id="founder-title" className="sec__title">
              A note from the <em>founder</em>
            </h2>
            <blockquote className="founder__quote">
              <Quotes size={34} weight="fill" aria-hidden="true" />
              <p>{FOUNDER.pullQuote}</p>
            </blockquote>
            {paras.map((p) => (
              <p key={p.slice(0, 24)} className="founder__p">
                {p}
              </p>
            ))}
            <div className="founder__sign">
              <div>
                <p className="founder__name">{FOUNDER.name}</p>
                <p className="founder__role">{FOUNDER.role}</p>
              </div>
              <div className="founder__ctas">
                <GlassButton href="/about" size="sm" arrow>
                  Our story
                </GlassButton>
                <GlassButton href={FOUNDER.linkedin} external size="sm" variant="secondary" icon={<LinkedinLogo size={18} />}>
                  Connect
                </GlassButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
