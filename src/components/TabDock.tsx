// Bottom navigation (mobile bar, centred dock on desktop): a glass bar whose top edge dips into a smooth notch under a floating
// button. On tab change the notch and the button glide together on a spring (rAF), so the bar
// "flows" to the new tab like the reference. Honours prefers-reduced-motion.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { BookOpen, Flask, House, Info, PlayCircle } from '@phosphor-icons/react';
import { navigate } from '../lib/router';
import './TabDock.css';

const TABS = [
  { href: '/', label: 'Home', Icon: House },
  { href: '/academy', label: 'Academy', Icon: BookOpen },
  { href: '/lab', label: 'AI Lab', Icon: Flask },
  { href: '/media', label: 'Media', Icon: PlayCircle },
  { href: '/about', label: 'About', Icon: Info },
];
const H = 74; // bar height
const R = 28; // corner radius
const D = 36; // notch depth
const W2 = 46; // notch half width
const P = 30; // side inset of the tab row (keeps the notch off the corners)

/** Centre x of tab k for a bar of width w. */
const centre = (w: number, k: number) => P + ((k + 0.5) * (w - 2 * P)) / TABS.length;

/** Rounded bar with a smooth valley centred at cx (all px). Top corners shrink if the valley reaches them. */
function barPath(w: number, cx: number, notch: boolean) {
  const rl = notch ? Math.max(4, Math.min(R, cx - W2)) : R;
  const rr = notch ? Math.max(4, Math.min(R, w - cx - W2)) : R;
  const top = notch ? `L${cx - W2},0 C${cx - W2 + 20},0 ${cx - 32},${D} ${cx},${D} C${cx + 32},${D} ${cx + W2 - 20},0 ${cx + W2},0 ` : '';
  return `M${rl},0 ${top}L${w - rr},0 A${rr},${rr} 0 0 1 ${w},${rr} L${w},${H - R} A${R},${R} 0 0 1 ${w - R},${H} L${R},${H} A${R},${R} 0 0 1 0,${H - R} L0,${rl} A${rl},${rl} 0 0 1 ${rl},0 Z`;
}

export function TabDock({ path }: { path: string }) {
  const i = Math.max(0, TABS.findIndex((t) => t.href === path));
  const known = TABS.some((t) => t.href === path);
  const { Icon: Active, label } = TABS[i];
  const root = useRef<HTMLElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const edge = useRef<SVGPathElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const lab = useRef<HTMLSpanElement>(null);
  const st = useRef({ w: 0, x: -1, v: 0, target: 0, raf: 0, known });
  st.current.known = known;

  const paint = (x: number) => {
    const { w } = st.current;
    if (!w) return;
    const d = barPath(w, x, st.current.known);
    if (bar.current) bar.current.style.clipPath = `path('${d}')`;
    if (edge.current) edge.current.setAttribute('d', d);
    if (svg.current) svg.current.setAttribute('viewBox', `0 0 ${w} ${H}`);
    if (bubble.current) bubble.current.style.transform = `translateX(${x - 29}px)`;
    if (lab.current) lab.current.style.transform = `translateX(${x}px) translateX(-50%)`;
  };

  const animate = () => {
    const s = st.current;
    cancelAnimationFrame(s.raf);
    s.raf = 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || s.x < 0) {
      s.x = s.target;
      s.v = 0;
      paint(s.x);
      return;
    }
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      // slightly under-damped spring: a small overshoot, like the reference
      s.v += (170 * (s.target - s.x) - 18 * s.v) * dt;
      s.x += s.v * dt;
      paint(s.x);
      if (Math.abs(s.target - s.x) > 0.3 || Math.abs(s.v) > 0.3) s.raf = requestAnimationFrame(step);
      else {
        s.x = s.target;
        s.raf = 0;
        paint(s.x);
      }
    };
    s.raf = requestAnimationFrame(step);
  };

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const s = st.current;
      s.w = el.clientWidth;
      s.target = centre(s.w, Math.max(0, TABS.findIndex((t) => t.href === window.location.pathname)));
      if (!s.raf) s.x = s.target;
      paint(s.x);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = st.current;
    s.target = centre(s.w || 1, i);
    animate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, known]);

  useEffect(() => () => cancelAnimationFrame(st.current.raf), []);

  return (
    <nav ref={root} className="tdock" aria-label="Main">
      <div ref={bar} className="tdock__bar" aria-hidden="true" />
      <svg ref={svg} className="tdock__edge" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <linearGradient id="tdockEdge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.08" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <path ref={edge} fill="none" stroke="url(#tdockEdge)" strokeWidth="1.2" />
      </svg>
      <span ref={bubble} className="tdock__bubble" aria-hidden="true" hidden={!known}>
        <span key={i} className="tdock__icon">
          <Active size={24} weight="bold" />
        </span>
      </span>
      <span ref={lab} className="tdock__label" aria-hidden="true" hidden={!known}>
        {label}
      </span>
      <ul>
        {TABS.map((t, k) => (
          <li key={t.href}>
            <a
              href={t.href}
              aria-label={t.label}
              title={t.label}
              aria-current={k === i && known ? 'page' : undefined}
              className={k === i && known ? 'on' : ''}
              onClick={(e) => {
                e.preventDefault();
                navigate(t.href);
              }}
            >
              <t.Icon size={24} />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
