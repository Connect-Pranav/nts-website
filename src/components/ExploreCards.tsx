import { ArrowRight, Brain, Briefcase, CaretDown, Stack } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { onLinkClick } from '../lib/router';
import './ExploreCards.css';

const CARDS: { title: string; text: string; href: string; icon: Icon }[] = [
  { title: 'AI Learning', text: 'Build real, job-ready AI skills.', href: '/academy', icon: Brain },
  { title: 'Practical AI Projects', text: 'Turn ideas into working solutions.', href: '/lab', icon: Stack },
  { title: 'Career Readiness', text: 'Get future-ready for AI careers.', href: '/academy#career', icon: Briefcase },
];

export function ExploreCards() {
  const jump = () => document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <section className="explore container" aria-labelledby="explore-title">
      <button type="button" className="explore__jump" onClick={jump} aria-label="Jump to Explore What You Can Build">
        <CaretDown size={20} weight="bold" />
      </button>
      <h2 id="explore-title" className="explore__title">
        <span id="explore" className="explore__anchor" />
        <span>
          Explore What You Can <span className="explore__accent">Build</span>
        </span>
      </h2>
      <ul className="explore__grid">
        {CARDS.map(({ title, text, href, icon: I }) => (
          <li key={title}>
            <a className="ecard glass" href={href} onClick={onLinkClick}>
              <I className="ecard__icon" size={46} weight="light" aria-hidden="true" />
              <span className="ecard__body">
                <span className="ecard__title">{title}</span>
                <span className="ecard__text">{text}</span>
              </span>
              <span className="ecard__arrow" aria-hidden="true">
                <ArrowRight size={20} weight="bold" />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
