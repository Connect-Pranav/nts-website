// DISHA: chat + voice assistant on every page (all VANI features, rebuilt for NTS).
// Visitors: answers about NTS, navigates pages, opens channels. Free device voice.
// Owner (Dev token in this tab): runs the 3 NTS agents, saves to Brain, opens Dev tabs, Sarvam voice.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowsIn, ArrowsOut, Brain, CaretDown, Copy, Microphone, PaperPlaneRight, Stop, Trash, X } from '@phosphor-icons/react';
import { navigate } from '../lib/router';
import { SITE } from '../config';
import './Disha.css';

type Msg = { id: number; role: 'user' | 'disha' | 'sys' | 'agent'; text: string; title?: string; link?: { label: string; href: string } };
type Opts = { speak: boolean; convo: boolean; wake: boolean; engine: 'auto' | 'device'; speaker: string };
type Mode = '' | 'listen' | 'think' | 'speak';
type Action = { type: string; id?: string; value?: string };
type VoiceCfg = { enabled: boolean; speaker: string; speakers: string[]; usedToday: number; dailyChars: number; model: string };

const TOKEN_KEY = 'nts-dev-token';
const LINKS: Record<string, { label: string; href: string }> = {
  youtube: { label: 'YouTube @NikhilsTechStudio', href: SITE.social.youtube },
  instagram: { label: 'Instagram @nikhil_techstudio', href: SITE.social.instagram },
  linkedin: { label: 'LinkedIn: Nikhil Kumar', href: SITE.social.linkedin },
};
const PAGE_WORDS: [RegExp, string][] = [
  [/\b(home|homepage|ghar)\b/i, '/'],
  [/\babout|story|kaun ho|founder\b/i, '/about'],
  [/\b(ai )?lab|agent(s)? for business|custom agent/i, '/lab'],
  [/\bacademy|course|sql sprint|interview sim|track/i, '/academy'],
  [/\binsight|article|blog/i, '/insights'],
  [/\bmedia|channels?|video(s)?\b/i, '/media'],
  [/\bcontact|partner|workshop|college|get started/i, '/contact'],
];
const WAKE = /(?:^|\s)(?:hi|hii|hey|hello|ok|okay|oye|हाय|हे)\s*,?\s*(?:disha|deesha|disa|दिशा)\b/i;

type SR = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; abort: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; onstart: (() => void) | null };
const SRClass: (new () => SR) | undefined = typeof window !== 'undefined' ? ((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => SR) | undefined : undefined;

const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};
const loadOpts = (): Opts => {
  try {
    return { speak: true, convo: false, wake: false, engine: 'auto', speaker: '', ...JSON.parse(localStorage.getItem('nts-disha-opts') || '{}') };
  } catch {
    return { speak: true, convo: false, wake: false, engine: 'auto', speaker: '' };
  }
};
const loadMsgs = (): Msg[] => {
  try {
    return JSON.parse(sessionStorage.getItem('nts-disha-log') || '[]');
  } catch {
    return [];
  }
};

function chunks(s: string) {
  const parts = s.replace(/\s+/g, ' ').trim().match(/[^.!?।॥]+[.!?।॥]*\s*/g) || [];
  const out: string[] = [];
  let cur = '';
  for (let p of parts) {
    if (cur && (cur + p).length > (out.length ? 260 : 140)) {
      out.push(cur.trim());
      cur = '';
    }
    while (p.length > 700) {
      out.push(p.slice(0, 700));
      p = p.slice(700);
    }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function Disha() {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(loadMsgs);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('');
  const [err, setErr] = useState(false);
  const [opts, setOpts] = useState<Opts>(loadOpts);
  const [token, setToken] = useState(readToken);
  const [voice, setVoice] = useState<VoiceCfg | null>(null);
  const [caption, setCaption] = useState('');
  const owner = Boolean(token);

  const idRef = useRef(Date.now());
  const logRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SR | null>(null);
  const wakeRef = useRef<SR | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const genRef = useRef(0);
  const sarvamFails = useRef(0);
  const briefed = useRef(false);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const openRef = useRef(open);
  openRef.current = open;

  // persistence
  useEffect(() => {
    try {
      sessionStorage.setItem('nts-disha-log', JSON.stringify(msgs.slice(-40)));
    } catch {
      /* ignore */
    }
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [msgs]);
  useEffect(() => {
    try {
      localStorage.setItem('nts-disha-opts', JSON.stringify(opts));
    } catch {
      /* ignore */
    }
  }, [opts]);

  // owner token changes (Dev Mode unlock / lock)
  useEffect(() => {
    const sync = () => setToken(readToken());
    window.addEventListener('nts:devtoken', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('nts:devtoken', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);
  useEffect(() => {
    if (!owner) return setVoice(null);
    fetch('/api/disha/voice', { headers: { authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => setVoice(v))
      .catch(() => setVoice(null));
  }, [owner, token]);

  const push = useCallback((m: Omit<Msg, 'id'>) => setMsgs((l) => [...l, { ...m, id: ++idRef.current }].slice(-60)), []);
  const sys = useCallback((text: string) => push({ role: 'sys', text }), [push]);
  const flashErr = () => {
    setErr(true);
    setTimeout(() => setErr(false), 2200);
  };

  // ---------------- speaking ----------------
  const stopSpeaking = useCallback(() => {
    genRef.current++;
    if (audioRef.current) {
      audioRef.current.onended = audioRef.current.onerror = null;
      audioRef.current.pause();
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    setMode((m) => (m === 'speak' ? '' : m));
    setCaption('');
  }, []);

  const afterSpeech = useCallback(() => {
    setMode('');
    setCaption('');
    if (optsRef.current.convo && openRef.current) setTimeout(() => listenRef.current?.(), 300);
    else resumeWakeRef.current?.();
  }, []);

  const deviceSpeak = useCallback(
    (text: string) => {
      const synth = window.speechSynthesis;
      if (!synth) return afterSpeech();
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      const hindi = /[ऀ-ॿ]/.test(text) || /\b(hai|hoon|aap|kya|nahi|main|karo|kijiye)\b/i.test(text);
      const pick = voices.find((v) => /hi-IN/i.test(v.lang) && hindi) || voices.find((v) => /en-IN/i.test(v.lang)) || voices.find((v) => /hi-IN/i.test(v.lang)) || null;
      if (pick) {
        u.voice = pick;
        u.lang = pick.lang;
      } else u.lang = hindi ? 'hi-IN' : 'en-IN';
      u.rate = 1;
      u.pitch = 1.05;
      u.onstart = () => {
        setMode('speak');
        setCaption(text);
      };
      u.onend = afterSpeech;
      u.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled') sys('Awaaz nahi chali. Page par ek baar tap karke dobara try karein.');
        afterSpeech();
      };
      synth.speak(u);
    },
    [afterSpeech, sys],
  );

  const speak = useCallback(
    (text: string, say?: string) => {
      if (!optsRef.current.speak) return;
      stopSpeaking();
      const useSarvam = owner && voice?.enabled && optsRef.current.engine !== 'device' && sarvamFails.current < 3;
      if (!useSarvam) return deviceSpeak(text);
      const gen = genRef.current;
      const parts = chunks(say || text);
      let i = 0;
      const get = (t: string) =>
        fetch('/api/disha/tts', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ text: t, speaker: optsRef.current.speaker || undefined }) }).then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
          return r.blob();
        });
      let next: Promise<Blob> | null = parts.length ? get(parts[0]) : null;
      if (!next) return;
      setMode('think');
      const fail = (e: Error) => {
        if (gen !== genRef.current) return;
        sarvamFails.current++;
        flashErr();
        sys(`Sarvam voice nahi chali (${e.message}). Free device voice se bol rahi hoon.`);
        deviceSpeak(text);
      };
      const play = () => {
        next!
          .then((blob) => {
            if (gen !== genRef.current) return;
            const url = URL.createObjectURL(blob);
            const a = audioRef.current || (audioRef.current = new Audio());
            next = i + 1 < parts.length ? get(parts[i + 1]) : null;
            next?.catch(() => undefined);
            a.onplaying = () => {
              setMode('speak');
              setCaption(text);
            };
            a.onended = () => {
              URL.revokeObjectURL(url);
              if (gen !== genRef.current) return;
              i++;
              if (next) play();
              else afterSpeech();
            };
            a.onerror = () => fail(new Error('audio could not play'));
            a.src = url;
            a.play().catch((e: Error) => fail(new Error(e.name === 'NotAllowedError' ? 'browser blocked autoplay, tap once on the page' : e.message)));
          })
          .catch(fail);
      };
      play();
    },
    [owner, voice, token, stopSpeaking, deviceSpeak, afterSpeech, sys],
  );

  const say = useCallback(
    (text: string, voiceText?: string) => {
      push({ role: 'disha', text });
      if (full && !optsRef.current.speak) setCaption(text);
      speak(text, voiceText);
    },
    [push, speak, full],
  );

  // ---------------- actions ----------------
  const runAgent = useCallback(
    async (id: string, task: string) => {
      push({ role: 'sys', text: 'Agent kaam kar raha hai…' });
      try {
        const r = await fetch(`/api/dev/agents/${id}/run`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ task }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        const names: Record<string, string> = { ops_maya_docs: 'LinkedIn Content Writer', ops_lakshmi_growth: 'Social Media Manager', ops_soma_analytics: 'Growth & Analytics' };
        push({ role: 'agent', title: names[id] || id, text: d.text });
        if (optsRef.current.speak) speak('Ho gaya. Result screen par hai.');
      } catch (e) {
        flashErr();
        sys(`Agent nahi chala: ${(e as Error).message}`);
      }
    },
    [token, push, speak, sys],
  );

  const saveNote = useCallback(
    async (text: string, title?: string, source = 'Disha') => {
      try {
        const r = await fetch('/api/dev/brain/notes', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ text: text.slice(0, 4000), title, source }) });
        if (!r.ok) throw new Error((await r.json()).error);
        sys('Brain mein save ho gaya.');
      } catch (e) {
        sys(`Save nahi hua: ${(e as Error).message}`);
      }
    },
    [token, sys],
  );

  const doActions = useCallback(
    (acts: Action[]) => {
      for (const a of acts.slice(0, 5)) {
        if (a.type === 'navigate' && a.value) navigate(a.value);
        else if (a.type === 'open_link' && a.value && LINKS[a.value]) push({ role: 'disha', text: '', link: LINKS[a.value] });
        else if (a.type === 'run_agent' && a.id && a.value && owner) runAgent(a.id, a.value);
        else if (a.type === 'save_note' && a.value && owner) {
          const last = [...msgsRef.current].reverse().find((m) => m.role === 'agent');
          const useLast = /^(last|this|ye|yeh|isko|it)$/i.test(a.value.trim()) && last;
          saveNote(useLast ? last!.text : a.value, useLast ? last!.title : undefined);
        } else if (a.type === 'open_tab' && a.value && owner) {
          navigate('/dev');
          setTimeout(() => window.dispatchEvent(new CustomEvent('nts:devtab', { detail: a.value })), 50);
        }
      }
    },
    [owner, push, runAgent, saveNote],
  );

  // Local rule brain: works with no AI key / offline
  const ruleBrain = useCallback(
    (text: string): { reply: string; actions: Action[] } => {
      const t = text.toLowerCase();
      for (const k of Object.keys(LINKS)) if (t.includes(k) && /(khol|open|dikha|show|link|channel)/.test(t)) return { reply: `${LINKS[k].label} ka link yeh raha.`, actions: [{ type: 'open_link', value: k }] };
      if (owner && /(brain|setting|agents?)\b/.test(t) && /(khol|open|dikha|show|jao)/.test(t)) {
        const tab = /brain/.test(t) ? 'brain' : /setting/.test(t) ? 'settings' : 'agents';
        return { reply: `${tab} khol rahi hoon.`, actions: [{ type: 'open_tab', value: tab }] };
      }
      for (const [re, page] of PAGE_WORDS) if (re.test(t)) return { reply: 'Chaliye, wahan le chalti hoon.', actions: [{ type: 'navigate', value: page }] };
      if (/(hi|hello|namaste|hey)\b/.test(t)) return { reply: 'Namaste! Aap SQL Sprint, AI tracks, workshops ya hamare channels ke baare mein pooch sakte hain.', actions: [] };
      return { reply: 'Abhi mera AI brain connect nahi hai, par main aapko sahi page tak le ja sakti hoon. Academy, AI Lab, Media Hub ya Contact boliye.', actions: [] };
    },
    [owner],
  );

  const ask = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      stopSpeaking();
      push({ role: 'user', text: clean });
      setMode('think');
      const history = [...msgsRef.current, { role: 'user', text: clean } as Msg]
        .filter((m) => m.role === 'user' || m.role === 'disha')
        .filter((m) => m.text)
        .slice(-10)
        .map((m) => ({ role: m.role, text: m.text }));
      try {
        const r = await fetch('/api/disha/chat', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ messages: history, page: window.location.pathname }) });
        const d = await r.json().catch(() => ({}));
        setMode('');
        if (!r.ok) {
          if (r.status === 429) return say(d.error || 'Thoda ruk jaiye, ek minute baad poochiye.');
          const local = ruleBrain(clean);
          if (owner) sys(`AI brain nahi chala (${d.error || `HTTP ${r.status}`}). Simple commands main khud sambhal rahi hoon.`);
          say(local.reply);
          return doActions(local.actions);
        }
        say(d.reply, d.say);
        doActions(d.actions || []);
      } catch {
        setMode('');
        const local = ruleBrain(clean);
        say(local.reply);
        doActions(local.actions);
      }
    },
    [token, owner, push, say, sys, doActions, ruleBrain, stopSpeaking],
  );

  // ---------------- listening ----------------
  const stopWake = useCallback(() => {
    const w = wakeRef.current;
    wakeRef.current = null;
    if (w) {
      w.onend = null;
      try {
        w.abort();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const listen = useCallback(() => {
    if (!SRClass) return sys('Is browser mein voice input nahi hai. Chrome ya Edge use karein, tab tak type karein.');
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    stopWake();
    stopSpeaking();
    const rec = new SRClass();
    rec.lang = 'hi-IN';
    rec.interimResults = true;
    rec.continuous = false;
    let final = '';
    rec.onresult = (e) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) {
        t += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = t;
      }
      setInput(t);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') sys('Mic ki permission nahi mili. Browser ke address bar mein mic allow karein.');
      else if (e.error === 'no-speech') sys('Kuch sunai nahi diya. Dobara mic dabaiye.');
      else if (e.error === 'audio-capture') sys('Mic nahi mila. System mein mic on hai?');
      else if (e.error === 'network') sys('Voice ke liye internet chahiye.');
    };
    rec.onstart = () => setMode('listen');
    rec.onend = () => {
      recRef.current = null;
      setMode((m) => (m === 'listen' ? '' : m));
      if (final.trim()) {
        setInput('');
        ask(final.trim());
      } else resumeWakeRef.current?.();
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
    }
  }, [ask, stopSpeaking, stopWake, sys]);
  const listenRef = useRef(listen);
  listenRef.current = listen;

  const wakeHeard = useCallback(() => {
    setOpen(true);
    const g = owner ? 'Haan Sir, boliye.' : 'Haan ji, boliye.';
    push({ role: 'disha', text: g });
    if (optsRef.current.speak) {
      speak(g);
      setTimeout(() => listenRef.current?.(), 1400);
    } else listenRef.current?.();
  }, [owner, push, speak]);

  const resumeWake = useCallback(() => {
    if (!optsRef.current.wake || !SRClass || wakeRef.current || recRef.current || document.hidden) return;
    const w = new SRClass();
    w.lang = 'hi-IN';
    w.continuous = true;
    w.interimResults = true;
    w.onresult = (e) => {
      for (let i = 0; i < e.results.length; i++) {
        if (WAKE.test(e.results[i][0].transcript)) {
          stopWake();
          wakeHeard();
          return;
        }
      }
    };
    w.onerror = () => undefined;
    w.onend = () => {
      if (wakeRef.current === w) {
        wakeRef.current = null;
        setTimeout(() => resumeWakeRef.current?.(), 600);
      }
    };
    wakeRef.current = w;
    try {
      w.start();
    } catch {
      wakeRef.current = null;
    }
  }, [stopWake, wakeHeard]);
  const resumeWakeRef = useRef(resumeWake);
  resumeWakeRef.current = resumeWake;

  useEffect(() => {
    if (opts.wake) resumeWake();
    else stopWake();
    const vis = () => (document.hidden ? stopWake() : resumeWakeRef.current?.());
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [opts.wake, resumeWake, stopWake]);

  // ---------------- opening brief ----------------
  useEffect(() => {
    if (!open || briefed.current) return;
    briefed.current = true;
    if (msgsRef.current.length) return;
    if (!owner) {
      push({ role: 'disha', text: 'Namaste! Main Disha hoon, NIKHILs TECH STUDIO ki assistant. SQL, AI tools, career ya workshops ke baare mein kuch bhi poochiye, bolkar ya likhkar.' });
      return;
    }
    Promise.all([
      fetch('/api/dev/agents', { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/dev/brain', { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([a, b]) => {
        const eng = a?.engines ? Object.entries(a.engines as Record<string, { configured: boolean }>).filter(([, e]) => e.configured).map(([k]) => k) : [];
        say(
          `Namaste Sir! ${a?.agents?.length ?? 3} agents ready hain${eng.length ? `, engine ${eng.join(' aur ')} chal raha hai` : ', par abhi koi AI key nahi lagi, Settings mein Gemini key daal dijiye'}. Brain mein ${b?.notes?.length ?? 0} notes hain. Boliye, aaj LinkedIn ke liye kya likhwana hai?`,
        );
      })
      .catch(() => say('Namaste Sir! Boliye, kya karna hai?'));
  }, [open, owner, token, push, say]);

  useEffect(() => () => stopSpeaking(), [stopSpeaking]);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [full]);

  const chips = owner
    ? ['LinkedIn post likho: SQL JOIN trap', 'Is hafte ka Instagram + YouTube plan', 'Brain kholo']
    : ['SQL Sprint kya hai?', 'Workshop ke liye kaise contact karein?', 'YouTube channel kholo'];
  const stateText = mode === 'listen' ? 'sun rahi hoon… boliye' : mode === 'think' ? 'soch rahi hoon…' : mode === 'speak' ? 'bol rahi hoon…' : opts.wake ? 'boliye "Hi Disha"' : owner ? 'owner mode' : SRClass ? 'bolkar ya likhkar poochiye' : 'likhkar poochiye';
  const cls = `disha ${open ? 'is-open' : ''} ${full ? 'is-full' : ''} m-${mode || 'idle'} ${err ? 'is-err' : ''} ${opts.wake ? 'is-wake' : ''}`;

  return (
    <aside className={cls} aria-label="Disha assistant">
      {!open ? (
        <button type="button" className="disha__fab" onClick={() => setOpen(true)} aria-label="Open Disha assistant">
          <span className="disha__orb" aria-hidden="true" />
          <span className="disha__fabtext">
            <b>Disha</b>
            <small>{opts.wake ? 'say "Hi Disha"' : 'Ask me'}</small>
          </span>
        </button>
      ) : (
        <div className="disha__panel" role="dialog" aria-label="Chat with Disha">
          <header className="disha__head">
            <span className="disha__orb" aria-hidden="true" />
            <div className="disha__title">
              <b>Disha</b>
              <small>
                {stateText}
                <span className="disha__wave" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </small>
            </div>
            {mode === 'speak' && (
              <button type="button" className="disha__ib" onClick={stopSpeaking} aria-label="Stop speaking" title="Stop speaking">
                <Stop size={18} weight="fill" />
              </button>
            )}
            <button type="button" className="disha__ib" onClick={() => setFull((f) => !f)} aria-label={full ? 'Exit full screen' : 'Full screen'} title={full ? 'Exit full screen' : 'Full screen'}>
              {full ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}
            </button>
            <button
              type="button"
              className="disha__ib"
              onClick={() => {
                setOpen(false);
                setFull(false);
              }}
              aria-label="Minimise Disha"
              title="Minimise"
            >
              {full ? <X size={18} /> : <CaretDown size={18} />}
            </button>
          </header>

          {full && (
            <div className="disha__stage" aria-hidden="true">
              <span className="disha__bigorb" />
              <p className="disha__caption">{caption || (mode === 'listen' ? input || 'Boliye…' : mode === 'think' ? 'Soch rahi hoon…' : 'Mic dabaiye ya "Hi Disha" boliye')}</p>
            </div>
          )}

          <div className="disha__log" ref={logRef} aria-live="polite">
            {msgs.map((m) =>
              m.role === 'agent' ? (
                <div key={m.id} className="dm dm--agent">
                  <p className="dm__agent">{m.title}</p>
                  <pre>{m.text}</pre>
                  <div className="dm__acts">
                    <button type="button" onClick={() => navigator.clipboard?.writeText(m.text)}>
                      <Copy size={14} /> Copy
                    </button>
                    <button type="button" onClick={() => saveNote(m.text, m.title, 'Disha')}>
                      <Brain size={14} /> Save to Brain
                    </button>
                  </div>
                </div>
              ) : m.link ? (
                <a key={m.id} className="dm dm--link" href={m.link.href} target="_blank" rel="noopener noreferrer">
                  {m.link.label} ↗
                </a>
              ) : (
                <p key={m.id} className={`dm dm--${m.role}`}>
                  {m.text}
                </p>
              ),
            )}
            {mode === 'think' && <p className="dm dm--typing" aria-label="Disha is typing"><i /><i /><i /></p>}
          </div>

          {msgs.length < 3 && (
            <div className="disha__chips">
              {chips.map((c) => (
                <button key={c} type="button" onClick={() => ask(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}

          <form
            className="disha__in"
            onSubmit={(e) => {
              e.preventDefault();
              const t = input;
              setInput('');
              ask(t);
            }}
          >
            <button type="button" className={`disha__mic ${mode === 'listen' ? 'on' : ''}`} onClick={listen} aria-label={mode === 'listen' ? 'Stop listening' : 'Speak to Disha'} disabled={!SRClass} title={SRClass ? 'Speak' : 'Voice input needs Chrome or Edge'}>
              <Microphone size={20} weight={mode === 'listen' ? 'fill' : 'regular'} />
            </button>
            <label className="sr-only" htmlFor="disha-in">
              Message Disha
            </label>
            <input id="disha-in" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Boliye ya type kariye…" autoComplete="off" maxLength={1500} />
            <button type="submit" className="disha__send" aria-label="Send" disabled={!input.trim()}>
              <PaperPlaneRight size={18} weight="fill" />
            </button>
          </form>

          <div className="disha__opts">
            <label>
              <input type="checkbox" checked={opts.speak} onChange={(e) => setOpts({ ...opts, speak: e.target.checked })} /> Bolkar jawab de
            </label>
            <label>
              <input type="checkbox" checked={opts.convo} onChange={(e) => setOpts({ ...opts, convo: e.target.checked })} disabled={!SRClass} /> Conversation mode
            </label>
            <label>
              <input type="checkbox" checked={opts.wake} onChange={(e) => setOpts({ ...opts, wake: e.target.checked })} disabled={!SRClass} /> "Hi Disha" wake word
            </label>
            {owner && (
              <label className="disha__voice">
                Voice
                <select
                  value={opts.engine === 'device' ? 'device' : opts.speaker || ''}
                  onChange={(e) => setOpts(e.target.value === 'device' ? { ...opts, engine: 'device' } : { ...opts, engine: 'auto', speaker: e.target.value })}
                >
                  {voice?.enabled ? (
                    <>
                      <option value="">Sarvam: {voice.speaker} (default)</option>
                      {voice.speakers.filter((s) => s !== voice.speaker).map((s) => (
                        <option key={s} value={s}>
                          Sarvam: {s}
                        </option>
                      ))}
                    </>
                  ) : (
                    <option value="">Sarvam not set (add key in Settings)</option>
                  )}
                  <option value="device">Free device voice</option>
                </select>
              </label>
            )}
            <button
              type="button"
              className="disha__clear"
              onClick={() => {
                stopSpeaking();
                setMsgs([]);
                briefed.current = false;
              }}
            >
              <Trash size={14} /> Clear chat
            </button>
          </div>
          {owner && voice?.enabled && <p className="disha__usage">Sarvam today: {voice.usedToday.toLocaleString('en-IN')} / {voice.dailyChars.toLocaleString('en-IN')} characters</p>}
        </div>
      )}
    </aside>
  );
}
