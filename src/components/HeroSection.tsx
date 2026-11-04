import { Play } from '@phosphor-icons/react';
import { SITE } from '../config';
import { GlassButton } from './GlassButton';
import './HeroSection.css';

type Props = { onWatchIntro: () => void };

export function HeroSection({ onWatchIntro }: Props) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__inner container">
        <div className="hero__copy">
          <p className="hero__eyebrow">India&rsquo;s practice gym for the AI era</p>
          <h1 id="hero-title" className="hero__title">
            <span className="hero__line">Learn. Practice.</span>{" "}
            <span className="hero__line">
              Simulate. <span className="hero__grow">Grow.</span>
            </span>
          </h1>
          <p className="hero__desc">{SITE.mission}</p>
          <div className="hero__ctas">
            <GlassButton href="/academy" arrow>
              Explore Academy
            </GlassButton>
            <GlassButton variant="secondary" onClick={onWatchIntro} icon={<Play size={22} weight="regular" />}>
              Watch Intro
            </GlassButton>
          </div>
        </div>
        <div className="hero__visual">
          <img
            src="/img/hero-studio-gold.webp"
            width={902}
            height={427}
            alt="A laptop showing the NIKHILs TECH STUDIO logo next to a branded studio coffee mug on a dark desk with warm gold light"
            fetchPriority="high"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
}
