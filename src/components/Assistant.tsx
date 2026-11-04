// WhatsApp-style chat + voice assistant. Two separate instances:
//   Disha: public website (public knowledge, page navigation, channel links, free device voice)
//   Marg:  Dev Mode only (owner token): Brain, agents, Save to Brain, Dev tabs, Sarvam voice
// Features (from VANI): mic input, spoken replies, conversation mode, wake word, stop, full screen,
// opening brief, quick replies, local rule brain when the AI is unavailable.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowsIn, ArrowsOut, Brain, Checks, Copy, DotsThreeVertical, FileText, Microphone, Paperclip, PaperPlaneRight, SpeakerHigh, SpeakerSlash, Smiley, Stop, X } from '@phosphor-icons/react';
import { navigate } from '../lib/router';
import { SITE } from '../config';
import { EMOJI, stripEmoji } from './emoji';
import './Assistant.css';

type Role = 'user' | 'assistant' | 'sys' | 'agent' | 'link';
type FileTag = { name: string; thumb?: string };
type Msg = { id: number; role: Role; text: string; ts: number; read?: boolean; title?: string; href?: string; file?: FileTag };
type Attach = { name: string; mime: string; data?: string; text?: string; thumb?: string };
const TEXT_EXT = /\.(txt|md|csv|tsv|json|sql|html?|css|js|ts|tsx|py|xml|ya?ml|log)$/i;
const BIN_MIME = /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/;
const MAX_BIN = 5 * 1024 * 1024;

function readAttachment(f: File): Promise<Attach> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('File padh nahi paaye.'));
    if (TEXT_EXT.test(f.name) || f.type.startsWith('text/')) {
      if (f.size > 400_000) return reject(new Error('Text file 400 KB se chhoti honi chahiye.'));
      r.onload = () => resolve({ name: f.name, mime: 'text/plain', text: String(r.result) });
      r.readAsText(f);
      return;
    }
    if (!BIN_MIME.test(f.type)) return reject(new Error('Image (PNG/JPG/WebP), PDF ya text file bhejiye.'));
    if (f.size > MAX_BIN) return reject(new Error('File 5 MB se chhoti honi chahiye.'));
    r.onload = () => {
      const url = String(r.result);
      const data = url.slice(url.indexOf(',') + 1);
      if (!f.type.startsWith('image/')) return resolve({ name: f.name, mime: f.type, data });
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 240 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k);
        cv.height = Math.round(img.height * k);
        cv.getContext('2d')?.drawImage(img, 0, 0, cv.width, cv.height);
        resolve({ name: f.name, mime: f.type, data, thumb: cv.toDataURL('image/jpeg', 0.7) });
      };
      img.onerror = () => resolve({ name: f.name, mime: f.type, data });
      img.src = url;
    };
    r.readAsDataURL(f);
  });
}
type Opts = { speak: boolean; convo: boolean; wake: boolean; engine: 'auto' | 'device'; speaker: string };
type Mode = '' | 'listen' | 'think' | 'speak';
type Action = { type: string; id?: string; value?: string };
type VoiceCfg = { enabled: boolean; speaker: string; speakers: string[]; usedToday: number; dailyChars: number };

type Props = { kind: 'disha' | 'marg'; token?: string };

const LINKS: Record<string, { label: string; href: string }> = {
  youtube: { label: 'YouTube · @NikhilsTechStudio', href: SITE.social.youtube },
  instagram: { label: 'Instagram · @nikhil_techstudio', href: SITE.social.instagram },
  linkedin: { label: 'LinkedIn · Nikhil Kumar', href: SITE.social.linkedin },
};
const PUBLIC_PAGE_WORDS: [RegExp, string][] = [
  [/\b(home|homepage)\b/i, '/'],
  [/\babout|story|founder\b/i, '/about'],
  [/\b(ai )?lab\b|custom agent|business agent/i, '/lab'],
  [/\bacademy|course|sql sprint|interview sim|tracks?\b/i, '/academy'],
  [/\binsights?|articles?|blog/i, '/insights'],
  [/\bmedia|channels?\b/i, '/media'],
  [/\bcontact|partner|workshop|college|get started/i, '/contact'],
];
const AGENT_NAMES: Record<string, string> = { ops_maya_docs: 'LinkedIn Content Writer', ops_lakshmi_growth: 'Social Media Manager', ops_soma_analytics: 'Growth & Analytics' };

type SR = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; abort: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; onstart: (() => void) | null };
const SRClass: (new () => SR) | undefined =
  typeof window !== 'undefined' ? (((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => SR) | undefined) : undefined;

const CFG = {
  disha: {
    name: 'Disha',
    avatar: '/img/disha-160.webp',
    bigAvatar: '/img/disha-512.webp',
    chatUrl: '/api/disha/chat',
    wake: /(?:^|\s)(?:hi|hii|hey|hello|ok|okay|oye|हाय|हे)\s*,?\s*(?:disha|deesha|disa|दिशा)\b/i,
    wakeLabel: 'Hi Disha',
    store: 'nts-disha',
    chips: ['SQL Sprint kya hai? 🤔', 'Workshop ke liye contact 🎓', 'YouTube channel kholo ▶️'],
    brief: 'Namaste! 🙏 Main Disha hoon, NIKHILs TECH STUDIO ki assistant. SQL, AI tools, career ya workshops ke baare mein kuch bhi poochiye, bolkar ya likhkar.',
  },
  marg: {
    name: 'Marg',
    avatar: '/img/marg-160.webp',
    bigAvatar: '/img/marg-512.webp',
    chatUrl: '/api/marg/chat',
    wake: /(?:^|\s)(?:hi|hii|hey|hello|ok|okay|oye|हाय|हे)\s*,?\s*(?:marg|maarg|mark|मार्ग)\b/i,
    wakeLabel: 'Hi Marg',
    store: 'nts-marg',
    chips: ['LinkedIn post likho: SQL JOIN trap ✍️', 'Is hafte ka Insta + YouTube plan 📅', 'Brain kholo 🧠'],
    brief: '',
  },
};

const time = (ts: number) => new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

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

function Avatar({ kind, big = false }: { kind: 'disha' | 'marg'; big?: boolean }) {
  const c = CFG[kind];
  if (c.avatar) return <img className={`wa-av ${big ? 'wa-av--big' : ''}`} src={big ? c.bigAvatar : c.avatar} alt="" width={big ? 140 : 40} height={big ? 140 : 40} />;
  return (
    <span className={`wa-av wa-av--mono ${big ? 'wa-av--big' : ''}`} aria-hidden="true">
      M
    </span>
  );
}

export function Assistant({ kind, token = '' }: Props) {
  const c = CFG[kind];
  const owner = kind === 'marg';
  const load = <T,>(k: string, d: T, s: Storage | null): T => {
    try {
      return { ...d, ...JSON.parse(s?.getItem(k) || 'null') } as T;
    } catch {
      return d;
    }
  };
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`${c.store}-log`) || '[]');
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('');
  const [err, setErr] = useState(false);
  const [opts, setOpts] = useState<Opts>(() => load(`${c.store}-opts`, { speak: true, convo: false, wake: false, engine: 'auto', speaker: '' }, typeof localStorage !== 'undefined' ? localStorage : null));
  const [voice, setVoice] = useState<VoiceCfg | null>(null);
  const [caption, setCaption] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const [menu, setMenu] = useState(false);
  const [unread, setUnread] = useState(0);
  const [briefTick, setBriefTick] = useState(0);
  const [att, setAtt] = useState<Attach | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const idRef = useRef(Date.now());
  const logRef = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<SR | null>(null);
  const wakeRef = useRef<SR | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const genRef = useRef(0);
  const sarvamFails = useRef(0);
  const voiceErrShown = useRef(false);
  const briefed = useRef(false);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    try {
      sessionStorage.setItem(`${c.store}-log`, JSON.stringify(msgs.slice(-60)));
    } catch {
      /* ignore */
    }
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, c.store]);
  useEffect(() => {
    try {
      localStorage.setItem(`${c.store}-opts`, JSON.stringify(opts));
    } catch {
      /* ignore */
    }
  }, [opts, c.store]);
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  useEffect(() => {
    if (!owner || !token) return;
    fetch('/api/marg/voice', { headers: { authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setVoice)
      .catch(() => setVoice(null));
  }, [owner, token]);

  const push = useCallback((m: Omit<Msg, 'id' | 'ts'>) => {
    setMsgs((l) => [...l, { ...m, id: ++idRef.current, ts: Date.now() }].slice(-80));
    if (!openRef.current && m.role !== 'user') setUnread((u) => u + 1);
  }, []);
  const sys = useCallback((text: string) => push({ role: 'sys', text }), [push]);
  const markRead = () => setMsgs((l) => l.map((m) => (m.role === 'user' && !m.read ? { ...m, read: true } : m)));
  const flashErr = () => {
    setErr(true);
    setTimeout(() => setErr(false), 2200);
  };
  const authHeaders = (): Record<string, string> => (owner && token ? { authorization: `Bearer ${token}` } : {});

  // ---------------- voice out ----------------
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

  const listenRef = useRef<() => void>(() => undefined);
  const resumeWakeRef = useRef<() => void>(() => undefined);

  const afterSpeech = useCallback(() => {
    setMode('');
    setCaption('');
    if (optsRef.current.convo && openRef.current) setTimeout(() => listenRef.current(), 300);
    else resumeWakeRef.current();
  }, []);

  const deviceSpeak = useCallback(
    (raw: string) => {
      const text = stripEmoji(raw);
      const synth = window.speechSynthesis;
      if (!synth || !text) return afterSpeech();
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      const hindi = /[ऀ-ॿ]/.test(text) || /\b(hai|hoon|aap|kya|nahi|main|karo|kijiye|boliye)\b/i.test(text);
      const female = (v: SpeechSynthesisVoice) => /female|heera|swara|kalpana|neerja|veena|lekha|google हिन्दी/i.test(v.name);
      const male = (v: SpeechSynthesisVoice) => /male|ravi|hemant|madhur|prabhat/i.test(v.name) && !/female/i.test(v.name);
      const prefer = owner ? male : female;
      const inLang = (re: RegExp) => voices.filter((v) => re.test(v.lang));
      const pool = hindi ? [...inLang(/hi-IN/i), ...inLang(/en-IN/i)] : [...inLang(/en-IN/i), ...inLang(/hi-IN/i)];
      const pick = pool.find(prefer) || pool[0] || null;
      if (pick) {
        u.voice = pick;
        u.lang = pick.lang;
      } else u.lang = hindi ? 'hi-IN' : 'en-IN';
      u.rate = 1;
      u.pitch = owner ? 0.95 : 1.05;
      u.onstart = () => {
        setMode('speak');
        setCaption(raw);
      };
      u.onend = afterSpeech;
      u.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled' && !voiceErrShown.current) {
          voiceErrShown.current = true;
          sys('Awaaz nahi chali 🔇 Page par ek baar tap karein, ya speaker icon se voice band kar dein.');
        }
        afterSpeech();
      };
      synth.speak(u);
    },
    [afterSpeech, sys, owner],
  );

  const speak = useCallback(
    (text: string, sayText?: string, force = false) => {
      if (!optsRef.current.speak && !force) return;
      stopSpeaking();
      const useSarvam = owner && voice?.enabled && optsRef.current.engine !== 'device' && sarvamFails.current < 3;
      if (!useSarvam) return deviceSpeak(text);
      const gen = genRef.current;
      const parts = chunks(stripEmoji(sayText || text));
      let i = 0;
      const get = (t: string) =>
        fetch('/api/marg/tts', { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify({ text: t, speaker: optsRef.current.speaker || undefined }) }).then(async (r) => {
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
        sys(`Sarvam voice nahi chali (${e.message}). Free device voice se bol raha hoon.`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [owner, voice, token, stopSpeaking, deviceSpeak, afterSpeech, sys],
  );

  const reply = useCallback(
    (text: string, sayText?: string) => {
      markRead();
      push({ role: 'assistant', text });
      speak(text, sayText);
    },
    [push, speak],
  );

  // ---------------- actions ----------------
  const runAgent = useCallback(
    async (id: string, task: string) => {
      sys(`${AGENT_NAMES[id] || 'Agent'} kaam kar raha hai… ⏳`);
      try {
        const r = await fetch(`/api/dev/agents/${id}/run`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify({ task }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        push({ role: 'agent', title: AGENT_NAMES[id] || id, text: d.text });
        speak('Ho gaya Sir. Result chat mein hai.');
      } catch (e) {
        flashErr();
        sys(`Agent nahi chala: ${(e as Error).message}`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, push, speak, sys],
  );

  const saveNote = useCallback(
    async (text: string, title?: string) => {
      try {
        const r = await fetch('/api/dev/brain/notes', { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify({ text: text.slice(0, 4000), title, source: 'Marg' }) });
        if (!r.ok) throw new Error((await r.json()).error);
        sys('Brain mein save ho gaya ✅');
      } catch (e) {
        sys(`Save nahi hua: ${(e as Error).message}`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, sys],
  );

  const doActions = useCallback(
    (acts: Action[]) => {
      for (const a of acts.slice(0, 5)) {
        if (a.type === 'navigate' && a.value && (owner || a.value !== '/dev')) navigate(a.value);
        else if (a.type === 'open_link' && a.value && LINKS[a.value]) push({ role: 'link', text: LINKS[a.value].label, href: LINKS[a.value].href });
        else if (!owner) continue;
        else if (a.type === 'run_agent' && a.id && a.value) runAgent(a.id, a.value);
        else if (a.type === 'save_note' && a.value) {
          const last = [...msgsRef.current].reverse().find((m) => m.role === 'agent');
          const useLast = /^(last|this|ye|yeh|isko|it)$/i.test(a.value.trim()) && last;
          saveNote(useLast ? last!.text : a.value, useLast ? last!.title : undefined);
        } else if (a.type === 'open_tab' && a.value) window.dispatchEvent(new CustomEvent('nts:devtab', { detail: a.value }));
      }
    },
    [owner, push, runAgent, saveNote],
  );

  const ruleBrain = useCallback(
    (text: string): { reply: string; actions: Action[] } => {
      const t = text.toLowerCase();
      for (const k of Object.keys(LINKS)) if (t.includes(k)) return { reply: `Yeh raha ${k === 'youtube' ? 'YouTube' : k === 'instagram' ? 'Instagram' : 'LinkedIn'} ka link 👇`, actions: [{ type: 'open_link', value: k }] };
      if (owner) {
        if (/(brain|setting|agents?)\b/.test(t)) {
          const tab = /brain/.test(t) ? 'brain' : /setting/.test(t) ? 'settings' : 'agents';
          return { reply: `${tab} khol raha hoon 👍`, actions: [{ type: 'open_tab', value: tab }] };
        }
        return { reply: 'AI engine abhi connect nahi hai. Settings mein Gemini key daal dijiye, phir main agents chala dunga.', actions: [{ type: 'open_tab', value: 'settings' }] };
      }
      if (/\b(open|kholo|le chalo|jao|go to|show)\b/.test(t)) for (const [re, page] of PUBLIC_PAGE_WORDS) if (re.test(t)) return { reply: 'Chaliye, wahan le chalti hoon 👉', actions: [{ type: 'navigate', value: page }] };
      if (/\b(hi|hello|namaste|hey)\b/.test(t)) return { reply: 'Namaste! 😊 Aap SQL Sprint, AI tracks, workshops ya hamare channels ke baare mein pooch sakte hain.', actions: [] };
      return { reply: 'Main aapko sahi page tak le ja sakti hoon 🙂 Academy, AI Lab, Media Hub ya Contact boliye.', actions: [] };
    },
    [owner],
  );

  const ask = useCallback(
    async (text: string, file?: Attach | null) => {
      const clean = text.trim() || (file ? 'Is file ko dekh ke bataiye.' : '');
      if (!clean) return;
      stopSpeaking();
      setEmojiOpen(false);
      push({ role: 'user', text: text.trim(), ...(file ? { file: { name: file.name, thumb: file.thumb } } : {}) });
      setMode('think');
      const history = [...msgsRef.current, { role: 'user', text: file ? `${clean} [file: ${file.name}]` : clean } as Msg]
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text)
        .slice(-10)
        .map((m) => ({ role: m.role, text: m.text }));
      try {
        const r = await fetch(c.chatUrl, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify({ messages: history, page: window.location.pathname, ...(file ? { attachment: { name: file.name, mime: file.mime, data: file.data, text: file.text } } : {}) }) });
        const d = await r.json().catch(() => ({}));
        setMode('');
        if (r.ok && d.offline && owner && d.error) sys(`AI nahi chala: ${d.error}`);
        if (!r.ok) {
          if (r.status === 429) return reply(d.error || 'Thoda ruk jaiye, ek minute baad poochiye 🙏');
          if (file) return sys(d.error || `File nahi bheji ja saki (HTTP ${r.status}).`);
          const local = ruleBrain(clean);
          if (owner) sys(`AI nahi chala (${d.error || `HTTP ${r.status}`}).`);
          reply(local.reply);
          return doActions(local.actions);
        }
        reply(d.reply, d.say);
        doActions(d.actions || []);
      } catch {
        setMode('');
        const local = ruleBrain(clean);
        reply(local.reply);
        doActions(local.actions);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, owner, push, reply, sys, doActions, ruleBrain, stopSpeaking, c.chatUrl],
  );

  // ---------------- voice in ----------------
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
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') sys('Mic ki permission nahi mili. Address bar mein mic allow karein 🎙️');
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
      } else resumeWakeRef.current();
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
    }
  }, [ask, stopSpeaking, stopWake, sys]);
  listenRef.current = listen;

  const resumeWake = useCallback(() => {
    if (!optsRef.current.wake || !SRClass || wakeRef.current || recRef.current || document.hidden) return;
    const w = new SRClass();
    w.lang = 'hi-IN';
    w.continuous = true;
    w.interimResults = true;
    w.onresult = (e) => {
      for (let i = 0; i < e.results.length; i++) {
        if (c.wake.test(e.results[i][0].transcript)) {
          stopWake();
          setOpen(true);
          const g = owner ? 'Haan Sir, boliye.' : 'Haan ji, boliye 😊';
          push({ role: 'assistant', text: g });
          if (optsRef.current.speak) {
            speak(g);
            setTimeout(() => listenRef.current(), 1400);
          } else listenRef.current();
          return;
        }
      }
    };
    w.onerror = () => undefined;
    w.onend = () => {
      if (wakeRef.current === w) {
        wakeRef.current = null;
        setTimeout(() => resumeWakeRef.current(), 600);
      }
    };
    wakeRef.current = w;
    try {
      w.start();
    } catch {
      wakeRef.current = null;
    }
  }, [stopWake, push, speak, owner, c.wake]);
  resumeWakeRef.current = resumeWake;

  useEffect(() => {
    if (opts.wake) resumeWake();
    else stopWake();
    const vis = () => (document.hidden ? stopWake() : resumeWakeRef.current());
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      stopWake();
    };
  }, [opts.wake, resumeWake, stopWake]);

  // ---------------- opening brief ----------------
  useEffect(() => {
    if (!open || briefed.current) return;
    briefed.current = true;
    if (msgsRef.current.length) return;
    if (!owner) return void push({ role: 'assistant', text: c.brief });
    Promise.all([
      fetch('/api/dev/agents', { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/dev/brain', { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([a, b]) => {
        const eng = a?.engines ? Object.entries(a.engines as Record<string, { configured: boolean }>).filter(([, e]) => e.configured).map(([k]) => k) : [];
        reply(
          `Namaste Sir! 🙏 ${a?.agents?.length ?? 3} agents ready hain${eng.length ? `, engine ${eng.join(' aur ')} chal raha hai` : ', par abhi koi AI key nahi lagi, Settings mein Gemini key daal dijiye'}. Brain mein ${b?.notes?.length ?? 0} notes hain. Aaj kya karna hai?`,
        );
      })
      .catch(() => reply('Namaste Sir! 🙏 Boliye, kya karna hai?'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, briefTick]);

  useEffect(() => () => stopSpeaking(), [stopSpeaking]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (emojiOpen) setEmojiOpen(false);
      else if (menu) setMenu(false);
      else if (full) setFull(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, full, emojiOpen, menu]);

  // auto-grow textarea
  useEffect(() => {
    const t = inRef.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
  }, [input]);

  const insertEmoji = (e: string) => {
    const t = inRef.current;
    if (!t) return setInput((v) => v + e);
    const s = t.selectionStart ?? input.length;
    const en = t.selectionEnd ?? input.length;
    const v = input.slice(0, s) + e + input.slice(en);
    setInput(v);
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(s + e.length, s + e.length);
    });
  };

  const status = mode === 'listen' ? 'sun rahi hai…' : mode === 'think' ? 'typing…' : mode === 'speak' ? (owner ? 'bol raha hai…' : 'bol rahi hai…') : 'online';
  const statusText = owner ? status.replace('sun rahi hai', 'sun raha hai') : status;
  const cls = `wa wa--${kind} ${open ? 'is-open' : ''} ${full ? 'is-full' : ''} m-${mode || 'idle'} ${err ? 'is-err' : ''}`;

  const send = () => {
    const t = input;
    const f = att;
    if (!t.trim() && !f) return;
    setInput('');
    setAtt(null);
    ask(t, f);
  };
  const pickFile = async (f?: File) => {
    if (!f) return;
    try {
      setAtt(await readAttachment(f));
      inRef.current?.focus();
    } catch (e) {
      sys((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <aside className={cls} aria-label={`${c.name} assistant`}>
      {!open ? (
        <button type="button" className="wa-fab" onClick={() => setOpen(true)} aria-label={`Chat with ${c.name}`}>
          <Avatar kind={kind} />
          <span className="wa-fab__text">
            <b>{c.name}</b>
            <small>{opts.wake ? `say "${c.wakeLabel}"` : owner ? 'Dev assistant' : 'Chat with us'}</small>
          </span>
          {unread > 0 && <span className="wa-badge">{unread}</span>}
        </button>
      ) : (
        <div className="wa-win" role="dialog" aria-label={`Chat with ${c.name}`}>
          <header className="wa-head">
            <button type="button" className="wa-icon" onClick={() => (setOpen(false), setFull(false))} aria-label="Close chat">
              <ArrowLeft size={20} />
            </button>
            <div className="wa-head__av">
              <Avatar kind={kind} />
              <span className="wa-online" aria-hidden="true" />
            </div>
            <div className="wa-head__who">
              <b>{c.name}</b>
              <small className={mode ? 'is-live' : ''}>{statusText}</small>
            </div>
            {mode === 'speak' && (
              <button type="button" className="wa-icon" onClick={stopSpeaking} aria-label="Stop speaking" title="Stop speaking">
                <Stop size={18} weight="fill" />
              </button>
            )}
            <button type="button" className="wa-icon" onClick={() => setOpts({ ...opts, speak: !opts.speak })} aria-label={opts.speak ? 'Mute voice replies' : 'Turn on voice replies'} title={opts.speak ? 'Voice on' : 'Voice off'}>
              {opts.speak ? <SpeakerHigh size={19} /> : <SpeakerSlash size={19} />}
            </button>
            <button type="button" className="wa-icon" onClick={() => setFull((f) => !f)} aria-label={full ? 'Exit full screen' : 'Full screen'}>
              {full ? <ArrowsIn size={19} /> : <ArrowsOut size={19} />}
            </button>
            <div className="wa-menuwrap">
              <button type="button" className="wa-icon" onClick={() => setMenu((m) => !m)} aria-label="More options" aria-expanded={menu}>
                <DotsThreeVertical size={20} weight="bold" />
              </button>
              {menu && (
                <div className="wa-menu" role="menu">
                  <label role="menuitemcheckbox" aria-checked={opts.convo}>
                    <input type="checkbox" checked={opts.convo} disabled={!SRClass} onChange={(e) => setOpts({ ...opts, convo: e.target.checked })} /> Conversation mode
                  </label>
                  <label role="menuitemcheckbox" aria-checked={opts.wake}>
                    <input type="checkbox" checked={opts.wake} disabled={!SRClass} onChange={(e) => setOpts({ ...opts, wake: e.target.checked })} /> “{c.wakeLabel}” wake word
                  </label>
                  {owner && (
                    <label className="wa-menu__voice">
                      Voice
                      <select value={opts.engine === 'device' ? 'device' : opts.speaker || ''} onChange={(e) => setOpts(e.target.value === 'device' ? { ...opts, engine: 'device' } : { ...opts, engine: 'auto', speaker: e.target.value })}>
                        {voice?.enabled ? (
                          <>
                            <option value="">Sarvam: {voice.speaker}</option>
                            {voice.speakers.filter((s) => s !== voice.speaker).map((s) => (
                              <option key={s} value={s}>
                                Sarvam: {s}
                              </option>
                            ))}
                          </>
                        ) : (
                          <option value="">Sarvam not set (Settings)</option>
                        )}
                        <option value="device">Free device voice</option>
                      </select>
                    </label>
                  )}
                  {owner && voice?.enabled && (
                    <p className="wa-menu__note">
                      Sarvam today: {voice.usedToday.toLocaleString('en-IN')} / {voice.dailyChars.toLocaleString('en-IN')} chars
                    </p>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      stopSpeaking();
                      msgsRef.current = [];
                      setMsgs([]);
                      briefed.current = false;
                      setMenu(false);
                      setBriefTick((t) => t + 1);
                    }}
                  >
                    Clear chat
                  </button>
                </div>
              )}
            </div>
          </header>

          {full && (
            <div className="wa-stage" aria-hidden="true">
              <div className="wa-stage__av">
                <Avatar kind={kind} big />
              </div>
              <p className="wa-stage__cap">{caption || (mode === 'listen' ? input || 'Boliye…' : mode === 'think' ? 'typing…' : `Mic dabaiye ya “${c.wakeLabel}” boliye`)}</p>
            </div>
          )}

          <div className="wa-body" ref={logRef} aria-live="polite" onClick={() => (setMenu(false), undefined)}>
            <p className="wa-day">
              <span>Today</span>
            </p>
            {!owner && (
              <p className="wa-e2e">
                <span>🔒 Chats stay in this browser tab. Please don’t share passwords or payment details.</span>
              </p>
            )}
            {msgs.map((m, i) => {
              const prev = msgs[i - 1];
              const first = !prev || prev.role !== m.role;
              if (m.role === 'sys')
                return (
                  <p key={m.id} className="wa-sys">
                    <span>{m.text}</span>
                  </p>
                );
              if (m.role === 'link')
                return (
                  <div key={m.id} className={`wa-row in ${first ? 'first' : ''}`}>
                    <a className="wa-bub wa-bub--link" href={m.href} target="_blank" rel="noopener noreferrer">
                      <span className="wa-link__t">{m.text}</span>
                      <span className="wa-link__u">{m.href?.replace(/^https:\/\/(www\.)?/, '')}</span>
                      <span className="wa-meta">{time(m.ts)}</span>
                    </a>
                  </div>
                );
              if (m.role === 'agent')
                return (
                  <div key={m.id} className={`wa-row in ${first ? 'first' : ''}`}>
                    <div className="wa-bub wa-bub--agent">
                      <p className="wa-agent__t">📄 {m.title}</p>
                      <pre>{m.text}</pre>
                      <div className="wa-agent__acts">
                        <button type="button" onClick={() => navigator.clipboard?.writeText(m.text)}>
                          <Copy size={14} /> Copy
                        </button>
                        <button type="button" onClick={() => saveNote(m.text, m.title)}>
                          <Brain size={14} /> Save to Brain
                        </button>
                      </div>
                      <span className="wa-meta">{time(m.ts)}</span>
                    </div>
                  </div>
                );
              const mine = m.role === 'user';
              return (
                <div key={m.id} className={`wa-row ${mine ? 'out' : 'in'} ${first ? 'first' : ''}`}>
                  <div className={`wa-bub ${mine ? 'wa-bub--out' : 'wa-bub--in'}`}>
                    {m.file && (
                      <span className="wa-file">
                        {m.file.thumb ? <img src={m.file.thumb} alt="" /> : <FileText size={22} />}
                        <small>{m.file.name}</small>
                      </span>
                    )}
                    {m.text && <span className="wa-text">{m.text}</span>}
                    <span className="wa-meta">
                      {!mine && (
                        <button type="button" className="wa-play" onClick={() => speak(m.text, undefined, true)} aria-label="Play this message">
                          <SpeakerHigh size={12} />
                        </button>
                      )}
                      {time(m.ts)}
                      {mine && <Checks size={15} weight="bold" className={`wa-ticks ${m.read ? 'read' : ''}`} aria-label={m.read ? 'Read' : 'Sent'} />}
                    </span>
                  </div>
                </div>
              );
            })}
            {mode === 'think' && (
              <div className="wa-row in">
                <div className="wa-bub wa-bub--in wa-typing" aria-label={`${c.name} is typing`}>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
          </div>

          {msgs.filter((m) => m.role === 'user').length === 0 && (
            <div className="wa-chips">
              {c.chips.map((t) => (
                <button key={t} type="button" onClick={() => ask(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {emojiOpen && (
            <div className="wa-emoji" role="dialog" aria-label="Emoji picker">
              <div className="wa-emoji__tabs" role="tablist">
                {EMOJI.map((g, i) => (
                  <button key={g.name} type="button" role="tab" aria-selected={emojiTab === i} aria-label={g.name} className={emojiTab === i ? 'on' : ''} onClick={() => setEmojiTab(i)}>
                    {g.icon}
                  </button>
                ))}
              </div>
              <div className="wa-emoji__grid">
                {EMOJI[emojiTab].list.map((e) => (
                  <button key={e} type="button" onClick={() => insertEmoji(e)} aria-label={`Insert ${e}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {att && (
            <div className="wa-att">
              {att.thumb ? <img src={att.thumb} alt="" /> : <FileText size={22} />}
              <span>{att.name}</span>
              <button type="button" className="wa-icon wa-icon--flat" onClick={() => setAtt(null)} aria-label="Remove file">
                <X size={16} />
              </button>
            </div>
          )}
          <form
            className="wa-foot"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="wa-field">
              <button type="button" className="wa-icon wa-icon--flat" onClick={() => setEmojiOpen((o) => !o)} aria-label={emojiOpen ? 'Close emojis' : 'Emojis'} aria-expanded={emojiOpen}>
                {emojiOpen ? <X size={22} /> : <Smiley size={22} />}
              </button>
              <label className="sr-only" htmlFor={`${kind}-in`}>
                Message {c.name}
              </label>
              <textarea
                id={`${kind}-in`}
                ref={inRef}
                rows={1}
                value={input}
                maxLength={1500}
                placeholder="Message"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              {owner && (
                <>
                  <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.txt,.md,.csv,.tsv,.json,.sql,.html,.xml,.yaml,.yml,.log" onChange={(e) => pickFile(e.target.files?.[0])} />
                  <button type="button" className="wa-icon wa-icon--flat" onClick={() => fileRef.current?.click()} aria-label="Attach file" title="Image, PDF ya text file">
                    <Paperclip size={21} />
                  </button>
                </>
              )}
            </div>
            {input.trim() || att ? (
              <button type="submit" className="wa-send" aria-label="Send">
                <PaperPlaneRight size={20} weight="fill" />
              </button>
            ) : (
              <button type="button" className={`wa-send ${mode === 'listen' ? 'is-rec' : ''}`} onClick={listen} aria-label={mode === 'listen' ? 'Stop listening' : 'Voice message'} disabled={!SRClass} title={SRClass ? 'Speak' : 'Voice input needs Chrome or Edge'}>
                <Microphone size={22} weight="fill" />
              </button>
            )}
          </form>
        </div>
      )}
    </aside>
  );
}
