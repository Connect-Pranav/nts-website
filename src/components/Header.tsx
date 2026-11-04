import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Code, List, MagnifyingGlass, Moon, Sun, X } from '@phosphor-icons/react';
import { NAV, SITE } from '../config';
import { onLinkClick } from '../lib/router';
import { GlassButton } from './GlassButton';
import type { Theme } from '../lib/theme';
import './Header.css';

type Props = { path: string; theme: Theme; onToggleTheme: () => void; onOpenSearch: () => void };

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));

export function Header({ path, theme, onToggleTheme, onOpenSearch }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);

  // Sliding active indicator: measure the active link.
  useLayoutEffect(() => {
    const measure = () => {
      const el = navRef.current?.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
      if (!el || !navRef.current) return setBar(null);
      const l = navRef.current.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setBar({ x: r.left - l.left + r.width * 0.15, w: r.width * 0.7 });
    };
    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => window.removeEventListener('resize', measure);
  }, [path]);

  useEffect(() => setMenuOpen(false), [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header className="hdr">
      <div className="hdr__bar glass">
        <a className="hdr__brand" href="/" onClick={onLinkClick} aria-label={`${SITE.name} home`}>
          <img src="/logo.jpg" alt="" width={56} height={56} className="hdr__logo" />
          <span className="hdr__word" aria-hidden="true">
            <span className="hdr__word-top">
              NIKHILs <span className="hdr__word-accent">TECH</span>
            </span>
            <span className="hdr__word-bottom">STUDIO</span>
          </span>
        </a>
        <span className="hdr__divider" aria-hidden="true" />

        <nav className="hdr__nav" aria-label="Main" ref={navRef}>
          <ul>
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} onClick={onLinkClick} aria-current={isActive(path, n.href) ? 'page' : undefined}>
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
          {bar && <span className="hdr__indicator" style={{ transform: `translateX(${bar.x}px)`, width: bar.w }} aria-hidden="true" />}
        </nav>

        <div className="hdr__actions">
          <button className="hdr__icon" type="button" onClick={onOpenSearch} aria-label="Search the site">
            <MagnifyingGlass size={22} weight="regular" />
          </button>
          <a className={`hdr__icon hdr__dev ${path === '/dev' ? 'is-on' : ''}`} href="/dev" onClick={onLinkClick} aria-label="Dev Mode" title="Dev Mode">
            <Code size={22} />
          </a>
          <button className="hdr__icon" type="button" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <Sun size={22} /> : <Moon size={22} />}
          </button>
          <GlassButton href="/contact" size="sm" arrow className="hdr__cta">
            Get Started
          </GlassButton>
          <button className="hdr__icon hdr__menu" type="button" aria-expanded={menuOpen} aria-controls="mobile-nav" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen((o) => !o)}>
            {menuOpen ? <X size={22} /> : <List size={22} />}
          </button>
        </div>
      </div>

      <div id="mobile-nav" className={`hdr__sheet glass ${menuOpen ? 'is-open' : ''}`} hidden={!menuOpen}>
        <nav aria-label="Mobile">
          <ul>
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} onClick={onLinkClick} aria-current={isActive(path, n.href) ? 'page' : undefined}>
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
          <GlassButton href="/contact" arrow>
            Get Started
          </GlassButton>
          <a className="hdr__sheetdev" href="/dev" onClick={onLinkClick}>
            <Code size={18} aria-hidden="true" /> Dev Mode
          </a>
        </nav>
      </div>
    </header>
  );
}
