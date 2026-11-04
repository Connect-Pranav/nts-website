import { Compass, Eye, Target, Pulse } from '@phosphor-icons/react';
import { FOUNDATION, VALUES } from '../content/blueprint';
import './Foundation.css';

/** Vision, mission, positioning, north star and values. `compact` hides the thesis (homepage). */
export function Foundation({ compact = false }: { compact?: boolean }) {
  return (
    <section className="sec foundation" aria-labelledby="foundation-title">
      <div className="wrap">
        <h2 id="foundation-title" className="sec__title">
          What we stand <em>for</em>
        </h2>
        {!compact && <p className="sec__lead">{FOUNDATION.thesis}</p>}
        <div className="sec__body fnd">
          <article className="fnd__vision glass">
            <Eye size={40} weight="light" className="card__icon" aria-hidden="true" />
            <h3>Vision</h3>
            <p className="fnd__big">{FOUNDATION.vision}</p>
          </article>
          <article className="fnd__card glass">
            <Target size={36} weight="light" className="card__icon" aria-hidden="true" />
            <h3>Mission</h3>
            <p>{FOUNDATION.mission}</p>
          </article>
          <article className="fnd__card glass">
            <Compass size={36} weight="light" className="card__icon" aria-hidden="true" />
            <h3>Positioning</h3>
            <p>{FOUNDATION.positioning}</p>
          </article>
          <article className="fnd__north glass">
            <Pulse size={36} weight="light" className="card__icon" aria-hidden="true" />
            <div>
              <h3>Our north star: {FOUNDATION.northStar.name}</h3>
              <p>{FOUNDATION.northStar.text}</p>
            </div>
          </article>
        </div>
        <ul className="vals" aria-label="Our values">
          {VALUES.map((v) => (
            <li key={v.title}>
              <h3>{v.title}</h3>
              <p>{v.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
