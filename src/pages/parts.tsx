import type { ReactNode } from 'react';

export function PageHero({ eyebrow, title, lead, children }: { eyebrow: string; title: ReactNode; lead: string; children?: ReactNode }) {
  return (
    <section className="phero" aria-labelledby="page-title">
      <div className="wrap">
        <p className="phero__eyebrow">{eyebrow}</p>
        <h1 id="page-title" className="phero__title">
          {title}
        </h1>
        <p className="phero__lead">{lead}</p>
        {children && <div className="phero__ctas">{children}</div>}
      </div>
    </section>
  );
}

export function Section({ id, title, lead, children }: { id?: string; title: ReactNode; lead?: string; children: ReactNode }) {
  const hid = id ? `${id}-title` : undefined;
  return (
    <section className="sec" id={id} aria-labelledby={hid}>
      <div className="wrap">
        <h2 id={hid} className="sec__title">
          {title}
        </h2>
        {lead && <p className="sec__lead">{lead}</p>}
        <div className="sec__body">{children}</div>
      </div>
    </section>
  );
}

export function Cards({ items, cols = 3 }: { items: { title: string; text: string; meta?: string }[]; cols?: 2 | 3 | 4 }) {
  return (
    <ul className={`g g-${cols}`}>
      {items.map((i) => (
        <li key={i.title}>
          <article className="card glass card--hover">
            <h3>{i.title}</h3>
            <p>{i.text}</p>
            {i.meta && <p className="meta">{i.meta}</p>}
          </article>
        </li>
      ))}
    </ul>
  );
}

export function Steps({ items }: { items: string[] }) {
  return (
    <ol className="steps" style={{ ['--n' as string]: items.length }}>
      {items.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  );
}
