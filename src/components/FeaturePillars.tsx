import { ChartBar, GraduationCap, Play, Stack } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import './FeaturePillars.css';

const PILLARS: { title: string; text: string; icon: Icon }[] = [
  { title: 'Learn', text: 'Core principles via free, concise engineering breakdowns.', icon: GraduationCap },
  { title: 'Practice', text: 'Daily in-browser SQL queries and terminal challenges.', icon: Stack },
  { title: 'Simulate', text: 'Realistic technical rounds and production business scenarios.', icon: Play },
  { title: 'Grow', text: 'Verifiable project proof that clears interviews and earns promotion.', icon: ChartBar },
];

export function FeaturePillars() {
  return (
    <section className="pillars container" aria-label="How the studio works">
      <ol className="pillars__box glass">
        {PILLARS.map(({ title, text, icon: I }) => (
          <li key={title} className="pillar">
            <I className="pillar__icon" size={46} weight="light" aria-hidden="true" />
            <div>
              <h2 className="pillar__title">{title}</h2>
              <p className="pillar__text">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
