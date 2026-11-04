import { useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { SearchDialog } from './components/SearchDialog';
import { VideoModal } from './components/VideoModal';
import { Assistant } from './components/Assistant';
import { IntroSplash } from './components/IntroSplash';
import { Home } from './pages/Home';
import { NotFound } from './pages/SimplePage';
import { About } from './pages/About';
import { Academy } from './pages/Academy';
import { Lab } from './pages/Lab';
import { Media } from './pages/Media';
import { Insights } from './pages/Insights';
import { Contact } from './pages/Contact';
import { Dev } from './pages/Dev';

const ROUTES: Record<string, { title: string; render: () => JSX.Element }> = {
  '/about': { title: 'About', render: () => <About /> },
  '/lab': { title: 'AI Lab', render: () => <Lab /> },
  '/academy': { title: 'Academy', render: () => <Academy /> },
  '/insights': { title: 'Insights', render: () => <Insights /> },
  '/media': { title: 'Media Hub', render: () => <Media /> },
  '/contact': { title: 'Get started', render: () => <Contact /> },
  '/dev': { title: 'Dev Mode', render: () => <Dev /> },
};
import { SITE } from './config';
import { navigate, usePath } from './lib/router';
import { useTheme } from './lib/theme';
import { loadYouTube } from './lib/youtube';

export function App() {
  const path = usePath();
  const { theme, toggle } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  // Ctrl/Cmd + K or "/" opens search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        navigate('/dev');
        return;
      }
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const page = ROUTES[path];
    document.title = path === '/' ? `${SITE.name} | ${SITE.positioning}` : `${page?.title ?? 'Page not found'} | ${SITE.name}`;
    const hash = window.location.hash.slice(1);
    if (hash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView());
  }, [path]);

  // Intro video: a fixed ID from config, otherwise the channel's latest upload (fetched by the Worker).
  const [introId, setIntroId] = useState<string>(SITE.introVideoId);
  useEffect(() => {
    if (SITE.introVideoId) return;
    let alive = true;
    loadYouTube().then((d) => {
      const v = d?.videos[0];
      if (alive && v) setIntroId(v.id);
    });
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
        {path === '/' ? <Home onWatchIntro={watchIntro} /> : ROUTES[path] ? ROUTES[path].render() : <NotFound />}
      </main>
      <Footer />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      {path !== '/dev' && <Assistant kind="disha" />}
      <IntroSplash />
      {introId && <VideoModal videoId={introId} open={videoOpen} onClose={() => setVideoOpen(false)} />}
    </>
  );
}
