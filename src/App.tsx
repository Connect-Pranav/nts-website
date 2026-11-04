import { useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { SearchDialog } from './components/SearchDialog';
import { VideoModal } from './components/VideoModal';
import { Home } from './pages/Home';
import { PAGES, SimplePage } from './pages/SimplePage';
import { SITE } from './config';
import { usePath } from './lib/router';
import { useTheme } from './lib/theme';

export function App() {
  const path = usePath();
  const { theme, toggle } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  // Ctrl/Cmd + K or "/" opens search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const page = PAGES[path];
    document.title = path === '/' ? `${SITE.name} | ${SITE.positioning}` : `${page?.title ?? 'Page not found'} | ${SITE.name}`;
    const hash = window.location.hash.slice(1);
    if (hash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView());
  }, [path]);

  // Intro video: a fixed ID from config, otherwise the channel's latest upload (fetched by the Worker).
  const [introId, setIntroId] = useState<string>(SITE.introVideoId);
  useEffect(() => {
    if (SITE.introVideoId) return;
    let alive = true;
    fetch('/api/public/intro')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { videoId?: string | null } | null) => {
        if (alive && d?.videoId && /^[A-Za-z0-9_-]{11}$/.test(d.videoId)) setIntroId(d.videoId);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const watchIntro = useCallback(() => {
    if (introId) setVideoOpen(true);
    else window.open(SITE.social.youtube, '_blank', 'noopener,noreferrer');
  }, [introId]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="ambient" aria-hidden="true">
        <svg viewBox="0 0 1440 700" preserveAspectRatio="none">
          <defs>
            <linearGradient id="rib" x1="0" x2="1">
              <stop offset="0" style={{ stopColor: "var(--ribbon)" }} stopOpacity="0" />
              <stop offset="0.55" style={{ stopColor: "var(--ribbon)" }} stopOpacity="0.9" />
              <stop offset="1" style={{ stopColor: "var(--ribbon)" }} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 520 C 320 420, 520 640, 820 470 S 1240 260, 1440 330" fill="none" stroke="url(#rib)" strokeWidth="1.5" />
          <path d="M0 560 C 340 470, 560 690, 860 520 S 1260 320, 1440 380" fill="none" stroke="url(#rib)" strokeWidth="1" opacity="0.6" />
        </svg>
      </div>
      <Header path={path} theme={theme} onToggleTheme={toggle} onOpenSearch={() => setSearchOpen(true)} />
      <main id="main" tabIndex={-1}>
        {path === '/' ? <Home onWatchIntro={watchIntro} /> : <SimplePage path={path} />}
      </main>
      <Footer />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      {introId && <VideoModal videoId={introId} open={videoOpen} onClose={() => setVideoOpen(false)} />}
    </>
  );
}
