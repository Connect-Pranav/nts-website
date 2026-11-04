import { InstagramLogo, LinkedinLogo, YoutubeLogo } from '@phosphor-icons/react';
import { GlassButton } from '../components/GlassButton';
import { COMMUNITY, WEEKLY_CONTENT } from '../content/blueprint';
import { SITE } from '../config';
import { PageHero, Section } from './parts';

const CHANNELS = [
  { name: 'YouTube', handle: '@NikhilsTechStudio', text: 'Long tutorials, including the SQL Interview: FAANG series.', href: SITE.social.youtube, icon: YoutubeLogo, cta: 'Subscribe' },
  { name: 'Instagram', handle: '@nikhil_techstudio', text: 'Daily Reels: quick lessons and AI tips in 30 seconds.', href: SITE.social.instagram, icon: InstagramLogo, cta: 'Follow' },
  { name: 'LinkedIn', handle: 'Nikhil Kumar', text: 'Daily SQL challenges, career advice and building in public.', href: SITE.social.linkedin, icon: LinkedinLogo, cta: 'Connect' },
];

export function Media() {
  return (
    <>
      <PageHero eyebrow="Media Hub" title={<>Free lessons, <em>every day</em></>} lead="Skill sikho, practice karo, job pakdo. Pick the channel you use most." />
      <Section id="channels" title="Our channels">
        <ul className="g g-3">
          {CHANNELS.map(({ name, handle, text, href, icon: I, cta }) => (
            <li key={name}>
              <article className="card glass card--hover" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <I size={40} weight="light" className="card__icon" aria-hidden="true" />
                <h3>{name}</h3>
                <p className="meta" style={{ marginTop: 0 }}>{handle}</p>
                <p style={{ flex: 1 }}>{text}</p>
                <div style={{ marginTop: 14 }}>
                  <GlassButton href={href} external size="sm" arrow>
                    {cta}
                  </GlassButton>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </Section>
      <Section id="weekly" title="Every week">
        <ul className="rows">
          {WEEKLY_CONTENT.map((w) => (
            <li key={w.format} className="row glass" style={{ gridTemplateColumns: 'minmax(180px,1.4fr) 1fr 1.4fr' }}>
              <h3>{w.format}</h3>
              <p className="len" style={{ color: 'var(--mint)' }}>{w.count}</p>
              <p>{w.channel}</p>
            </li>
          ))}
        </ul>
      </Section>
      <Section id="community" title={<>The NTS <em>community</em></>} lead="Practice is easier together.">
        <ul className="ticks">
          {COMMUNITY.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Section>
    </>
  );
}
