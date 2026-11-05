// How a draft will look in the LinkedIn feed: author header, text folded at "…more" like LinkedIn
// (about 3 lines / 210 chars on desktop, 140 on mobile), blue hashtags, mentions and links,
// and the reaction/action bar. Purely visual: nothing is sent anywhere.
import { useState } from 'react';
import { ChatCircleText, DesktopTower, DeviceMobile, GlobeHemisphereWest, PaperPlaneRight, Repeat, ThumbsUp } from '@phosphor-icons/react';

const FOLD = { desktop: { chars: 210, lines: 3 }, mobile: { chars: 140, lines: 3 } };

function fold(text: string, view: 'desktop' | 'mobile') {
  const { chars, lines } = FOLD[view];
  let cut = text.split('\n').slice(0, lines).join('\n');
  if (cut.length > chars) cut = cut.slice(0, chars).replace(/\s+\S*$/, '');
  return cut.length < text.trimEnd().length ? cut.trimEnd() : null;
}

/** Hashtags, @mentions and links in LinkedIn blue. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+|#[\p{L}\p{N}_]+|@[\p{L}\p{N}_]+)/u);
  return (
    <>
      {parts.map((p, k) => (k % 2 ? <span key={k} className="lip-tag">{p}</span> : p))}
    </>
  );
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export function LinkedInPreview({ text, name, headline }: { text: string; name: string; headline: string }) {
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop');
  const [open, setOpen] = useState(false);
  const short = fold(text, view);
  return (
    <div className="lip-wrap">
      <div className="lip-switch" role="group" aria-label="Preview size">
        <button type="button" className={view === 'desktop' ? 'on' : ''} aria-pressed={view === 'desktop'} onClick={() => (setView('desktop'), setOpen(false))}>
          <DesktopTower size={14} /> Desktop
        </button>
        <button type="button" className={view === 'mobile' ? 'on' : ''} aria-pressed={view === 'mobile'} onClick={() => (setView('mobile'), setOpen(false))}>
          <DeviceMobile size={14} /> Mobile
        </button>
        {short && <small>Only the text before “…more” shows in the feed: make it the hook</small>}
      </div>
      <article className={`lip lip--${view}`} aria-label="LinkedIn preview">
        <header className="lip-head">
          <span className="lip-av" aria-hidden="true">
            {initials(name) || 'IN'}
          </span>
          <span className="lip-who">
            <b>
              {name} <i>• You</i>
            </b>
            <small>{headline}</small>
            <small>
              Now • <GlobeHemisphereWest size={12} weight="fill" />
            </small>
          </span>
        </header>
        <div className="lip-body">
          {short && !open ? (
            <>
              <span className="lip-fold">
                <Rich text={short} />
              </span>
              …{' '}
              <button type="button" className="lip-more" onClick={() => setOpen(true)}>
                more
              </button>
            </>
          ) : (
            <Rich text={text} />
          )}
        </div>
        <div className="lip-stats">
          <span className="lip-react" aria-hidden="true">
            <i style={{ background: '#378fe9' }}>👍</i>
            <i style={{ background: '#df704d' }}>❤</i>
            <i style={{ background: '#6dae4f' }}>👏</i>
          </span>
          <small>0 · 0 comments</small>
        </div>
        <footer className="lip-actions">
          {[
            [ThumbsUp, 'Like'],
            [ChatCircleText, 'Comment'],
            [Repeat, 'Repost'],
            [PaperPlaneRight, 'Send'],
          ].map(([I, l]) => {
            const Icon = I as typeof ThumbsUp;
            return (
              <span key={l as string}>
                <Icon size={18} /> {view === 'desktop' && (l as string)}
              </span>
            );
          })}
        </footer>
      </article>
    </div>
  );
}
