import { useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { navigate } from '../lib/router';
import './Dialog.css';

type Entry = { title: string; text: string; href: string; keywords: string };

// Site index: every page and homepage section a visitor can reach.
const INDEX: Entry[] = [
  { title: 'Home', text: "India's practice gym for the AI era", href: '/', keywords: 'home start learn practice simulate grow' },
  { title: 'About', text: 'Brand story, mission and learning philosophy', href: '/about', keywords: 'about story mission vision philosophy nikhil team' },
  { title: 'AI Lab', text: 'AI experiments, tools, demonstrations and case studies', href: '/lab', keywords: 'lab projects experiments tools demos case studies agents build' },
  { title: 'Academy', text: 'Tutorials, practical exercises and workshops', href: '/academy', keywords: 'academy learn courses tutorials exercises workshops claude chatgpt gemini sql' },
  { title: 'Career Readiness', text: 'Resume, interview and job-hunt practice', href: '/academy#career', keywords: 'career resume interview job hunter readiness placement' },
  { title: 'Insights', text: 'Articles, tutorials, AI news and explainers', href: '/insights', keywords: 'insights blog articles news explainers' },
  { title: 'Media Hub', text: 'YouTube, Instagram and LinkedIn in one place', href: '/media', keywords: 'media youtube instagram linkedin videos reels posts' },
  { title: 'Contact & partnerships', text: 'Partnership, institutional and collaboration enquiries', href: '/contact', keywords: 'contact partner partnership college institution workshop collaboration get started' },
];

type Props = { open: boolean; onClose: () => void };

export function SearchDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQ('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && d.open) d.close();
  }, [open]);

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return INDEX;
    return INDEX.filter((e) => terms.every((t) => `${e.title} ${e.text} ${e.keywords}`.toLowerCase().includes(t)));
  }, [q]);

  const go = (href: string) => {
    onClose();
    navigate(href);
  };

  return (
    <dialog ref={ref} className="dlg dlg--search glass" aria-label="Search the site" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="search">
        <label className="search__field">
          <MagnifyingGlass size={22} aria-hidden="true" />
          <span className="sr-only">Search</span>
          <input
            ref={inputRef}
            type="search"
            value={q}
            placeholder="Search pages, programmes and topics"
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter' && results[active]) {
                e.preventDefault();
                go(results[active].href);
              }
            }}
            aria-controls="search-results"
            aria-activedescendant={results[active] ? `sr-${active}` : undefined}
          />
          <kbd>Esc</kbd>
        </label>
        <ul id="search-results" className="search__results" role="listbox" aria-label="Results">
          {results.map((r, i) => (
            <li key={r.href} id={`sr-${i}`} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'is-active' : ''} onMouseEnter={() => setActive(i)} onClick={() => go(r.href)}>
                <span className="search__title">{r.title}</span>
                <span className="search__text">{r.text}</span>
              </button>
            </li>
          ))}
          {!results.length && <li className="search__empty">No matches for “{q}”. Try “SQL”, “workshop” or “career”.</li>}
        </ul>
      </div>
    </dialog>
  );
}
