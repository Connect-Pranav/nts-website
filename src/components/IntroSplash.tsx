// Opening animation: the official NTS logo assembles piece by piece, then the site appears.
// Pieces are cut from the supplied logo (no redrawing): ring sweeps in, bars rise one by one,
// "NIKHILs" and "TECH" slide together, STUDIO opens, the tagline writes on, then a glow and exit.
// Plays once per browser session; Skip / click / any key skips; reduced motion skips it entirely.
import { useEffect, useState } from 'react';
import './IntroSplash.css';

const KEY = 'nts-intro-seen';
const P = '/img/intro/';
// position of each piece in % of the 1254 px logo square: [left, top, width, height]
const PIECES: [string, number, number, number, number][] = [
  ['bar1', 27.911, 33.094, 13.716, 20.654],
  ['bar2', 42.903, 22.727, 14.035, 31.021],
  ['bar3', 58.054, 13.397, 12.759, 40.351],
  ['nikhils', 10.207, 55.183, 43.062, 11.643],
  ['tech', 53.27, 55.183, 37.799, 11.643],
  ['studio', 9.171, 67.145, 81.738, 6.858],
  ['tagline', 16.906, 74.801, 66.667, 5.104],
];

function shouldPlay() {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (window.location.pathname === '/dev') return false;
    return !sessionStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function IntroSplash() {
  const [stage, setStage] = useState<'off' | 'play' | 'exit'>(() => (shouldPlay() ? 'play' : 'off'));

  useEffect(() => {
    if (stage === 'off') return;
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const toExit = stage === 'play' ? setTimeout(() => setStage('exit'), 3300) : undefined;
    const toOff = stage === 'exit' ? setTimeout(() => setStage('off'), 650) : undefined;
    const skip = () => setStage((s) => (s === 'play' ? 'exit' : s));
    window.addEventListener('keydown', skip);
    return () => {
      document.documentElement.style.overflow = prev;
      clearTimeout(toExit);
      clearTimeout(toOff);
      window.removeEventListener('keydown', skip);
    };
  }, [stage]);

  if (stage === 'off') return null;

  return (
    <div className={`intro intro--${stage}`} role="presentation" onClick={() => setStage('exit')}>
      <div className="intro__logo" aria-hidden="true">
        <img className="intro__plate" src={`${P}plate.jpg`} alt="" />
        <img className="intro__ring" src={`${P}ring.webp`} alt="" />
        {PIECES.map(([k, l, t, w, h]) => (
          <span key={k} className={`intro__p intro__p--${k}`} style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%` }}>
            <img src={`${P}${k}.webp`} alt="" />
          </span>
        ))}
        <img className="intro__final" src={`${P}logo.jpg`} alt="" />
        <span className="intro__shine" />
      </div>
      <span className="sr-only">NIKHILs TECH STUDIO</span>
      <button
        type="button"
        className="intro__skip"
        onClick={(e) => {
          e.stopPropagation();
          setStage('exit');
        }}
      >
        Skip
      </button>
    </div>
  );
}
