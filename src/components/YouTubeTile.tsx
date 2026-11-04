import { useEffect, useRef, useState } from 'react';
import { YoutubeLogo } from '@phosphor-icons/react';
import { SITE } from '../config';
import { useYouTube } from '../lib/youtube';
import { GlassButton } from './GlassButton';
import './YouTubeTile.css';

/**
 * Always-on YouTube tile: plays the channel's uploads as a looping playlist.
 * Muted autoplay (browsers only allow autoplay when muted); viewers can unmute in the player.
 * The iframe loads only when the tile scrolls into view. Reduced motion: no autoplay.
 */
export function YouTubeTile() {
  const yt = useYouTube();
  const box = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [index, setIndex] = useState(0);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const el = box.current;
    if (!el || inView) return;
    if (!('IntersectionObserver' in window)) return setInView(true);
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setInView(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  const list = yt?.channel?.uploadsPlaylistId;
  const src = list
    ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&index=${index}&autoplay=${reduce ? 0 : 1}&mute=1&loop=1&playsinline=1&rel=0&modestbranding=1`
    : null;

  return (
    <section className="sec yt" aria-labelledby="yt-title">
      <div className="wrap">
        <div className="yt__head">
          <h2 id="yt-title" className="sec__title">
            Now playing on <em>YouTube</em>
          </h2>
          <GlassButton href={SITE.social.youtube} external variant="secondary" size="sm" icon={<YoutubeLogo size={18} />}>
            Subscribe
          </GlassButton>
        </div>
        <div className="yt__tile glass" ref={box}>
          <div className="yt__player">
            {src && inView ? (
              <iframe key={index} src={src} title="NIKHILs TECH STUDIO videos, playing on repeat" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
            ) : yt === null ? (
              <a className="yt__fallback" href={SITE.social.youtube} target="_blank" rel="noopener noreferrer">
                <YoutubeLogo size={56} weight="fill" aria-hidden="true" />
                <span>Watch our latest lessons on YouTube</span>
              </a>
            ) : (
              <div className="yt__skeleton" aria-hidden="true" />
            )}
          </div>
          {yt && yt.videos.length > 0 && (
            <ol className="yt__list" aria-label="Channel videos">
              {yt.videos.map((v, i) => (
                <li key={v.id}>
                  <button type="button" className={i === index ? 'is-on' : ''} aria-current={i === index ? 'true' : undefined} onClick={() => setIndex(i)}>
                    {v.thumbnail && <img src={v.thumbnail} alt="" width={160} height={90} loading="lazy" />}
                    <span>{v.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
