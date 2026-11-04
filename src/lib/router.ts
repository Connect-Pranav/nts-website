// Minimal client-side router (history API). The Worker serves index.html for unknown paths (SPA fallback).
import { useEffect, useState } from 'react';

const EVT = 'nts:navigate';

export function navigate(to: string) {
  if (to === window.location.pathname + window.location.hash) return;
  window.history.pushState({}, '', to);
  window.dispatchEvent(new Event(EVT));
  const hash = to.split('#')[1];
  if (hash) document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
  else window.scrollTo({ top: 0 });
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    window.addEventListener(EVT, on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener(EVT, on);
    };
  }, []);
  return path;
}

/** Intercept same-origin link clicks so navigation stays client-side. */
export function onLinkClick(e: React.MouseEvent<HTMLAnchorElement>) {
  const a = e.currentTarget;
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank') return;
  const url = new URL(a.href);
  if (url.origin !== window.location.origin) return;
  e.preventDefault();
  navigate(url.pathname + url.hash);
}
