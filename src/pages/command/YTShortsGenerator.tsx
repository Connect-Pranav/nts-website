// NTS COMMAND Dev Mode — YT Shorts Generator
// Module Identity: nts-yt-shorts-generator
// Brand: NIKHILs TECH Studio ("Learn. Practice. Simulate. Grow.")

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  VideoCamera,
  Sparkle,
  FilmStrip,
  PencilSimple,
  Rocket,
  CheckCircle,
  Clock,
  Play,
  Pause,
  ArrowRight,
  ArrowLeft,
  Trash,
  CalendarCheck,
  GearSix,
  FolderOpen,
  Palette,
  ShieldCheck,
  WarningCircle,
  ThumbsUp,
  ChatCircle,
  ShareNetwork,
} from '@phosphor-icons/react';
import type { Api } from './shared';
import './YTShortsGenerator.css';

export type ShortScene = {
  scene_number: number;
  time_range: string;
  visual_description: string;
  camera_direction: string;
  on_screen_text: string;
  voiceover_line: string;
  pacing_note?: string;
  image_prompt?: string;
};

export type ShortItem = {
  id: string;
  title: string;
  topic: string;
  category: string;
  hook: string;
  status: 'draft' | 'scripted' | 'storyboarded' | 'packaged' | 'approved' | 'scheduled' | 'published';
  approvalState: 'pending' | 'approved' | 'rejected';
  scheduledAt?: string;
  publishedAt?: string;
  youtubeUrl?: string;
  createdAt: string;
  idea?: {
    topic: string;
    hook: string;
    target_audience: string;
    learning_outcome: string;
    estimated_duration: number;
    angle: string;
  };
  script?: {
    title: string;
    hook: string;
    estimated_duration_seconds: number;
    scenes: ShortScene[];
    voiceover: string;
    call_to_action: string;
  };
  storyboard?: {
    visual_style: string;
    aspect_ratio: string;
    color_palette: string[];
    scenes: Array<{
      scene_number: number;
      time_range: string;
      visual_layout_9_16: string;
      camera_move: string;
      lighting: string;
      generative_image_prompt: string;
    }>;
  };
  productionPackage?: {
    metadata: {
      youtube_title: string;
      youtube_description: string;
      tags: string[];
      category_id: string;
      pinned_comment: string;
    };
    technical_specs: {
      resolution: string;
      aspect_ratio: string;
      fps: number;
      audio_loudness: string;
      video_bitrate: string;
    };
    caption_cues: Array<{
      start_ms: number;
      end_ms: number;
      text: string;
    }>;
  };
  canvaSpec?: {
    template: string;
    design_spec: {
      dimensions: string;
      aspectRatio: string;
      dominantColor: string;
      accentColor: string;
      fonts: { primary: string; secondary: string };
      layers: Array<{ name: string; type: string; content: string }>;
    };
  };
  videoDelivery?: {
    status: 'pending' | 'rendering' | 'ready' | 'uploaded';
    mp4Filename?: string;
    mp4FileSize?: string;
    durationSec?: number;
    format?: string;
    voiceover?: string;
    driveFolderUrl?: string;
    driveFileUrl?: string;
    driveFileId?: string;
    verified?: boolean;
    deliveredAt?: string;
  };
};

export type CalendarEntry = {
  id: string;
  date: string;
  dayNumber: number;
  topic: string;
  category: string;
  hook: string;
  status: 'planned' | 'scripted' | 'approved' | 'published';
  shortId?: string;
};

const CURATED_TOPICS = [
  {
    topic: "You're Using Claude Code Wrong",
    category: 'Work Automation',
    hook: "If you're using Claude Code just to ask questions, you're using a Ferrari to go grocery shopping.",
    angle: 'Stop chatting with code models. Let them build full file systems, execute tests, and refactor whole repos in terminal.',
  },
  {
    topic: 'Stop Asking ChatGPT to Write Emails (Do This Instead)',
    category: 'Productivity',
    hook: 'If your ChatGPT prompts start with "Write an email to...", you are wasting 90% of its power.',
    angle: 'How to give ChatGPT your actual meeting transcripts or CRM notes to extract decisions and auto-draft action items.',
  },
  {
    topic: 'How Sales Teams Automate Lead Research in 60 Seconds',
    category: 'Sales & Growth',
    hook: 'Sales reps spend 15 hours a week digging through LinkedIn profiles. Here is the 60-second automated fix.',
    angle: 'Using automated web scraping + AI synthesis to create hyper-personalized outreach summaries before every call.',
  },
  {
    topic: 'The 3 AI Prompts Every Operations Manager Needs',
    category: 'Operations',
    hook: 'Operations managers: stop drowning in daily status reports. These 3 prompts do your weekly review in 4 minutes.',
    angle: 'Extracting SLA bottlenecks, missed milestones, and vendor delays straight from unformatted team updates.',
  },
  {
    topic: 'Turn Any Messy Spreadsheet into an Executive Summary with Gemini',
    category: 'Finance & Analytics',
    hook: 'Your boss does not want to read 40 columns in Excel. Here is how Gemini in Google Workspace summarizes it in 3 bullets.',
    angle: 'Data structuring, anomaly detection, and visual narrative generation directly from raw CSVs.',
  },
  {
    topic: 'Why Prompt Engineering is Dead (And Context Engineering Won)',
    category: 'AI Strategy',
    hook: 'Forget 500-word magical prompts. If your AI gives bad answers, your context is broken.',
    angle: 'Why providing real system files, examples, and rules beats fancy prompt phrasing every single time.',
  },
  {
    topic: 'Build Your First Business Agent in 15 Minutes without Coding',
    category: 'Agentic AI',
    hook: 'You do not need to be a Python engineer to build an AI agent that works for your business while you sleep.',
    angle: 'Creating a specialized customer screening or HR resume triaging agent with clear instructions and tools.',
  },
];

export function YTShortsGenerator({ api }: { api: Api }) {
  const [activeTab, setActiveTab] = useState<'studio' | 'library' | 'calendar' | 'integrations'>('studio');
  const [studioStep, setStudioStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  // Studio Creation State
  const [currentShort, setCurrentShort] = useState<ShortItem | null>(null);
  const [topicInput, setTopicInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('Work Automation');
  const [durationInput, setDurationInput] = useState<15 | 30 | 45 | 60>(45);
  const [audienceInput, setAudienceInput] = useState('Non-technical professionals, managers, business owners');
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; tone: 'ok' | 'bad' | 'warn' } | null>(null);

  // Phone Mockup Playback
  const [previewSceneIdx, setPreviewSceneIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const playbackRef = useRef<number | null>(null);

  // Library & Calendar State
  const [libraryItems, setLibraryItems] = useState<ShortItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [calendarItems, setCalendarItems] = useState<CalendarEntry[]>([]);

  // Canva & Integration Status
  const [canvaStatus, setCanvaStatus] = useState<any>(null);
  const [publishAuthorized, setPublishAuthorized] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');

  // Initial Data Load
  const loadData = useCallback(async () => {
    try {
      const [itemsRes, calRes, canvaRes] = await Promise.all([
        api<{ items: ShortItem[] }>('/api/dev/shorts/items').catch(() => ({ items: [] })),
        api<{ calendar: CalendarEntry[] }>('/api/dev/shorts/calendar').catch(() => ({ calendar: [] })),
        api<any>('/api/dev/shorts/canva/status').catch(() => null),
      ]);
      setLibraryItems(itemsRes.items || []);
      setCalendarItems(calRes.calendar || []);
      setCanvaStatus(canvaRes);
    } catch (e) {
      console.error('Failed to load shorts data', e);
    }
  }, [api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Phone Mockup Playback Loop
  useEffect(() => {
    if (!isPlaying) {
      if (playbackRef.current) clearInterval(playbackRef.current);
      return;
    }

    const scenes = currentShort?.script?.scenes || [];
    if (!scenes.length) {
      setIsPlaying(false);
      return;
    }

    playbackRef.current = window.setInterval(() => {
      setPlaybackProgress((prev) => {
        if (prev >= 100) {
          setPreviewSceneIdx((sIdx) => (sIdx + 1) % scenes.length);
          return 0;
        }
        return prev + 5;
      });
    }, 150);

    return () => {
      if (playbackRef.current) clearInterval(playbackRef.current);
    };
  }, [isPlaying, currentShort]);

  // Handle Curated Topic Selection
  const selectCuratedTopic = (t: (typeof CURATED_TOPICS)[0]) => {
    setTopicInput(t.topic);
    setCategoryInput(t.category);
  };

  // STEP 1: Generate Idea
  const handleGenerateIdea = async () => {
    if (!topicInput.trim()) {
      setActionMessage({ text: 'Please enter or select a topic.', tone: 'bad' });
      return;
    }
    setLoading(true);
    setActionMessage(null);
    try {
      const idea = await api<any>('/api/dev/shorts/idea', {
        method: 'POST',
        body: JSON.stringify({
          topic: topicInput,
          niche: categoryInput,
          tone: 'authoritative, punchy, pragmatic, high retention',
        }),
      });

      const updatedShort: ShortItem = {
        id: currentShort?.id || `short_${Date.now()}`,
        title: idea.topic || topicInput,
        topic: idea.topic || topicInput,
        category: categoryInput,
        hook: idea.hook || '',
        status: 'draft',
        approvalState: 'pending',
        createdAt: currentShort?.createdAt || new Date().toISOString(),
        idea,
      };

      setCurrentShort(updatedShort);
      setStudioStep(2);
      setActionMessage({ text: 'Idea and hook generated successfully!', tone: 'ok' });
      await api('/api/dev/shorts/save', { method: 'POST', body: JSON.stringify(updatedShort) });
      loadData();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to generate idea.', tone: 'bad' });
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Generate Script
  const handleGenerateScript = async () => {
    if (!currentShort) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const script = await api<any>('/api/dev/shorts/script', {
        method: 'POST',
        body: JSON.stringify({
          topic: currentShort.topic,
          audience: audienceInput,
          duration: durationInput,
          language: 'English',
        }),
      });

      const updated: ShortItem = {
        ...currentShort,
        title: script.title || currentShort.title,
        hook: script.hook || currentShort.hook,
        script,
        status: 'scripted',
      };

      setCurrentShort(updated);
      setStudioStep(3);
      setActionMessage({ text: `Script created with ${script.scenes?.length || 0} scenes!`, tone: 'ok' });
      await api('/api/dev/shorts/save', { method: 'POST', body: JSON.stringify(updated) });
      loadData();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to generate script.', tone: 'bad' });
    } finally {
      setLoading(false);
    }
  };

  // STEP 3: Generate Storyboard
  const handleGenerateStoryboard = async () => {
    if (!currentShort?.script) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const storyboard = await api<any>('/api/dev/shorts/storyboard', {
        method: 'POST',
        body: JSON.stringify({
          script: currentShort.script,
          visual_style: 'Cinematic dark tech, high-contrast graphite surfaces with glowing cyan accents, 3D typography, premium documentary',
        }),
      });

      const updated: ShortItem = {
        ...currentShort,
        storyboard,
        status: 'storyboarded',
      };

      setCurrentShort(updated);
      setStudioStep(4);
      setActionMessage({ text: '9:16 vertical visual storyboard generated!', tone: 'ok' });
      await api('/api/dev/shorts/save', { method: 'POST', body: JSON.stringify(updated) });
      loadData();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to generate storyboard.', tone: 'bad' });
    } finally {
      setLoading(false);
    }
  };

  // STEP 4: Generate Production Package
  const handleGeneratePackage = async () => {
    if (!currentShort?.script || !currentShort?.storyboard) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const productionPackage = await api<any>('/api/dev/shorts/package', {
        method: 'POST',
        body: JSON.stringify({
          script: currentShort.script,
          storyboard: currentShort.storyboard,
        }),
      });

      const updated: ShortItem = {
        ...currentShort,
        productionPackage,
        status: 'packaged',
      };

      setCurrentShort(updated);
      setStudioStep(5);
      setActionMessage({ text: 'YouTube production metadata and caption cues packaged!', tone: 'ok' });
      await api('/api/dev/shorts/save', { method: 'POST', body: JSON.stringify(updated) });
      loadData();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to generate production package.', tone: 'bad' });
    } finally {
      setLoading(false);
    }
  };

  // STEP 5: Generate Canva Design Spec
  const handleGenerateCanva = async () => {
    if (!currentShort) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const canvaSpec = await api<any>('/api/dev/shorts/canva/generate', {
        method: 'POST',
        body: JSON.stringify({
          title: currentShort.title,
          hook: currentShort.hook,
          category: currentShort.category,
          scenePrompts: currentShort.storyboard?.scenes || [],
        }),
      });

      const updated: ShortItem = {
        ...currentShort,
        canvaSpec,
      };

      setCurrentShort(updated);
      setStudioStep(6);
      setActionMessage({ text: 'Canva 9:16 design template specifications created!', tone: 'ok' });
      await api('/api/dev/shorts/save', { method: 'POST', body: JSON.stringify(updated) });
      loadData();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to generate Canva spec.', tone: 'bad' });
    } finally {
      setLoading(false);
    }
  };

  // STEP 6: Publish / Authorize Short
  const handlePublish = async () => {
    if (!currentShort) return;
    if (!publishAuthorized) {
      setActionMessage({ text: 'User authorization checkbox is strictly required before dispatching.', tone: 'warn' });
      return;
    }

    setLoading(true);
    setActionMessage(null);
    try {
      const res = await api<any>(`/api/dev/shorts/publish/${currentShort.id}`, {
        method: 'POST',
        body: JSON.stringify({
          approved: true,
          scheduled_at: scheduleDate ? new Date(scheduleDate).toISOString() : undefined,
        }),
      });

      const updated: ShortItem = {
        ...currentShort,
        status: res.status || 'approved',
        approvalState: 'approved',
        scheduledAt: res.scheduled_at,
        youtubeUrl: res.youtube_url,
      };

      setCurrentShort(updated);
      setActionMessage({ text: res.note || 'YouTube Short successfully authorized and processed!', tone: 'ok' });
      loadData();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Publishing failed.', tone: 'bad' });
    } finally {
      setLoading(false);
    }
  };

  // GENERATE & UPLOAD FINAL SHORT (MP4) to Google Drive
  const handleGenerateAndUploadFinalShort = async () => {
    if (!currentShort) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await api<any>(`/api/dev/shorts/deliver/${currentShort.id}`, { method: 'POST' });
      const updated: ShortItem = {
        ...currentShort,
        status: 'approved',
        approvalState: 'approved',
        videoDelivery: res.videoDelivery,
      };
      setCurrentShort(updated);
      setActionMessage({ text: res.note || 'Finished MP4 video rendered and uploaded to Google Drive FINAL_VIDEOS!', tone: 'ok' });
      loadData();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Video delivery failed.', tone: 'bad' });
    } finally {
      setLoading(false);
    }
  };

  // Run Full Automated Daily Cycle
  const handleRunDailyCycle = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await api<any>('/api/dev/shorts/daily-cycle', { method: 'POST' });
      if (res.short) {
        setCurrentShort(res.short);
        setActiveTab('studio');
        setStudioStep(4);
        setActionMessage({ text: `Automated daily short "${res.short.title}" created and held for review!`, tone: 'ok' });
      }
      loadData();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Daily cycle execution failed.', tone: 'bad' });
    } finally {
      setLoading(false);
    }
  };

  // Delete Short Item
  const handleDeleteShort = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Short draft?')) return;
    try {
      await api(`/api/dev/shorts/item/${id}`, { method: 'DELETE' });
      if (currentShort?.id === id) setCurrentShort(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    }
  };

  // Active scene for phone preview
  const scenes = currentShort?.script?.scenes || [];
  const currentScene = scenes[previewSceneIdx] || scenes[0] || null;

  // Filtered library items
  const filteredLibrary = libraryItems.filter((item) => {
    const matchesSearch =
      (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.hook || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.topic || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="shorts-root">
      {/* Header Banner */}
      <header className="shorts-header">
        <div className="shorts-header__info">
          <h1>
            <VideoCamera size={26} color="var(--nc-bright)" weight="duotone" />
            YT Shorts Generator
            <span className="badge">MCP: nts-yt-shorts-generator</span>
          </h1>
          <p>AI-powered daily YouTube Shorts research, scripting, 9:16 production, and publishing for NIKHILs TECH Studio.</p>
        </div>
        <div className="shorts-header__actions">
          <button type="button" className="btn-shorts-secondary btn-shorts-gold" onClick={handleRunDailyCycle} disabled={loading}>
            <Sparkle size={18} weight="fill" />
            Run Daily Automation Cycle
          </button>
          <button
            type="button"
            className="btn-shorts-primary"
            onClick={() => {
              setCurrentShort(null);
              setStudioStep(1);
              setActiveTab('studio');
            }}
          >
            <PencilSimple size={18} />
            New Short
          </button>
        </div>
      </header>

      {/* Global Action Message */}
      {actionMessage && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '8px',
            background: actionMessage.tone === 'ok' ? 'rgba(53, 214, 154, 0.15)' : actionMessage.tone === 'warn' ? 'rgba(233, 199, 125, 0.15)' : 'rgba(240, 120, 120, 0.15)',
            border: `1px solid ${actionMessage.tone === 'ok' ? 'var(--nc-ok)' : actionMessage.tone === 'warn' ? 'var(--nc-gold)' : 'var(--nc-bad)'}`,
            color: actionMessage.tone === 'ok' ? 'var(--nc-ok)' : actionMessage.tone === 'warn' ? 'var(--nc-gold)' : 'var(--nc-bad)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          {actionMessage.tone === 'ok' ? <CheckCircle size={18} /> : <WarningCircle size={18} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <nav className="shorts-tabs">
        <button type="button" className={`shorts-tab-btn ${activeTab === 'studio' ? 'active' : ''}`} onClick={() => setActiveTab('studio')}>
          <PencilSimple size={18} />
          Studio & Preview
        </button>
        <button type="button" className={`shorts-tab-btn ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}>
          <FolderOpen size={18} />
          Content Library ({libraryItems.length})
        </button>
        <button type="button" className={`shorts-tab-btn ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
          <CalendarCheck size={18} />
          Daily Curriculum Calendar
        </button>
        <button type="button" className={`shorts-tab-btn ${activeTab === 'integrations' ? 'active' : ''}`} onClick={() => setActiveTab('integrations')}>
          <GearSix size={18} />
          Automation & Integrations
        </button>
      </nav>

      {/* TAB 1: STUDIO & PREVIEW */}
      {activeTab === 'studio' && (
        <div className="shorts-studio-layout">
          {/* Left Column: Multi-Step Editor */}
          <div className="shorts-editor-column">
            {/* Stepper Navigation */}
            <div className="shorts-stepper">
              <button type="button" className={`shorts-step-pill ${studioStep === 1 ? 'active' : ''} ${currentShort?.idea ? 'completed' : ''}`} onClick={() => setStudioStep(1)}>
                <span className="step-num">1</span> Idea & Hook
              </button>
              <button type="button" className={`shorts-step-pill ${studioStep === 2 ? 'active' : ''} ${currentShort?.script ? 'completed' : ''}`} onClick={() => setStudioStep(2)} disabled={!currentShort?.idea}>
                <span className="step-num">2</span> Script
              </button>
              <button type="button" className={`shorts-step-pill ${studioStep === 3 ? 'active' : ''} ${currentShort?.storyboard ? 'completed' : ''}`} onClick={() => setStudioStep(3)} disabled={!currentShort?.script}>
                <span className="step-num">3</span> Storyboard
              </button>
              <button type="button" className={`shorts-step-pill ${studioStep === 4 ? 'active' : ''} ${currentShort?.productionPackage ? 'completed' : ''}`} onClick={() => setStudioStep(4)} disabled={!currentShort?.storyboard}>
                <span className="step-num">4</span> Package
              </button>
              <button type="button" className={`shorts-step-pill ${studioStep === 5 ? 'active' : ''} ${currentShort?.canvaSpec ? 'completed' : ''}`} onClick={() => setStudioStep(5)} disabled={!currentShort?.productionPackage}>
                <span className="step-num">5</span> Canva
              </button>
              <button type="button" className={`shorts-step-pill ${studioStep === 6 ? 'active' : ''} ${currentShort?.approvalState === 'approved' ? 'completed' : ''}`} onClick={() => setStudioStep(6)} disabled={!currentShort}>
                <span className="step-num">6</span> Publish
              </button>
            </div>

            {/* STEP 1: IDEA & TOPIC */}
            {studioStep === 1 && (
              <div className="shorts-card">
                <h2>
                  <span>Step 1: Topic Research & Hook Engineering</span>
                  <span style={{ fontSize: '12px', color: 'var(--nc-text-2)' }}>Brand: NTS AI Education</span>
                </h2>

                <div className="shorts-form-group">
                  <label>Curated NTS Daily Curriculum Topics (Click to populate)</label>
                  <div className="shorts-topic-chips">
                    {CURATED_TOPICS.map((t) => (
                      <button key={t.topic} type="button" className={`shorts-topic-chip ${topicInput === t.topic ? 'selected' : ''}`} onClick={() => selectCuratedTopic(t)}>
                        <span className="chip-cat">{t.category}</span>
                        <span className="chip-title">{t.topic}</span>
                        <span className="chip-hook">"{t.hook}"</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="shorts-form-group">
                  <label htmlFor="topic-input">Topic or Premise</label>
                  <input id="topic-input" className="shorts-input" placeholder="e.g. Stop Asking ChatGPT to Write Emails (Do This Instead)" value={topicInput} onChange={(e) => setTopicInput(e.target.value)} />
                </div>

                <div className="shorts-row-2">
                  <div className="shorts-form-group">
                    <label htmlFor="cat-select">Niche Category</label>
                    <select id="cat-select" className="shorts-select" value={categoryInput} onChange={(e) => setCategoryInput(e.target.value)}>
                      <option value="Work Automation">Work Automation</option>
                      <option value="Productivity">Productivity</option>
                      <option value="Sales & Growth">Sales & Growth</option>
                      <option value="Operations">Operations</option>
                      <option value="Finance & Analytics">Finance & Analytics</option>
                      <option value="AI Strategy">AI Strategy</option>
                      <option value="Agentic AI">Agentic AI</option>
                    </select>
                  </div>
                  <div className="shorts-form-group">
                    <label htmlFor="dur-select">Target Duration</label>
                    <select id="dur-select" className="shorts-select" value={durationInput} onChange={(e) => setDurationInput(Number(e.target.value) as any)}>
                      <option value="15">15 Seconds (Rapid Tip)</option>
                      <option value="30">30 Seconds (Fast Breakdown)</option>
                      <option value="45">45 Seconds (Recommended Standard)</option>
                      <option value="60">60 Seconds (Deep Dive)</option>
                    </select>
                  </div>
                </div>

                <div className="shorts-form-group">
                  <label htmlFor="aud-input">Target Audience</label>
                  <input id="aud-input" className="shorts-input" value={audienceInput} onChange={(e) => setAudienceInput(e.target.value)} />
                </div>

                {currentShort?.idea && (
                  <div style={{ marginTop: '16px', padding: '14px', background: 'rgba(39, 230, 240, 0.08)', borderRadius: '8px', borderLeft: '3px solid var(--nc-bright)' }}>
                    <p style={{ margin: '0 0 6px 0', fontSize: '13px', fontWeight: '700', color: 'var(--nc-bright)' }}>Generated Hook:</p>
                    <p style={{ margin: 0, fontSize: '14px', color: '#fff', fontStyle: 'italic' }}>"{currentShort.idea.hook}"</p>
                  </div>
                )}

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button type="button" className="btn-shorts-primary" onClick={handleGenerateIdea} disabled={loading}>
                    <Sparkle size={18} weight="fill" />
                    {loading ? 'Synthesizing...' : 'Generate Idea & Hook'}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: SCRIPT */}
            {studioStep === 2 && (
              <div className="shorts-card">
                <h2>
                  <span>Step 2: Scene-by-Scene Script & Voiceover</span>
                  <span style={{ fontSize: '12px', color: 'var(--nc-gold)' }}>Duration: {durationInput}s</span>
                </h2>

                <div style={{ marginBottom: '16px' }}>
                  <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: 'var(--nc-text-2)' }}>VOICEOVER SPECIFICATION:</p>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--nc-text)' }}>
                    Male, Natural Indian English, calm, intelligent, authoritative, documentary pacing. Zero fluff.
                  </p>
                </div>

                {currentShort?.script ? (
                  <>
                    <div className="shorts-form-group">
                      <label>Opening Hook</label>
                      <input className="shorts-input" value={currentShort.script.hook} readOnly />
                    </div>

                    <div className="shorts-form-group">
                      <label>Complete Voiceover Script</label>
                      <textarea className="shorts-textarea" rows={4} value={currentShort.script.voiceover} readOnly />
                    </div>

                    <div className="shorts-form-group">
                      <label>Call to Action (CTA)</label>
                      <input className="shorts-input" value={currentShort.script.call_to_action} readOnly />
                    </div>

                    <div className="shorts-form-group">
                      <label>Scenes Breakdown ({currentShort.script.scenes?.length || 0} Scenes)</label>
                      <div className="shorts-scenes-list">
                        {currentShort.script.scenes?.map((sc) => (
                          <div key={sc.scene_number} className="shorts-scene-item">
                            <div className="shorts-scene-item__header">
                              <span className="shorts-scene-badge">Scene {sc.scene_number}</span>
                              <span className="shorts-scene-time">{sc.time_range}</span>
                            </div>
                            <div className="shorts-scene-text">
                              <b>Voiceover:</b> {sc.voiceover_line}
                            </div>
                            <div className="shorts-scene-overlay">
                              <b>On-Screen Text:</b> "{sc.on_screen_text}"
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p style={{ color: 'var(--nc-text-2)', fontSize: '13px' }}>Click below to generate the script with scenes, timing, on-screen text, and voiceover cues.</p>
                )}

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <button type="button" className="btn-shorts-secondary" onClick={() => setStudioStep(1)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button type="button" className="btn-shorts-primary" onClick={handleGenerateScript} disabled={loading}>
                    <Sparkle size={18} weight="fill" />
                    {loading ? 'Drafting Script...' : 'Generate Full Script'}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: STORYBOARD */}
            {studioStep === 3 && (
              <div className="shorts-card">
                <h2>
                  <span>Step 3: 9:16 Vertical Visual Storyboard</span>
                  <span style={{ fontSize: '12px', color: 'var(--nc-bright)' }}>Format: 1080x1920</span>
                </h2>

                {currentShort?.storyboard ? (
                  <>
                    <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(10, 60, 67, 0.4)', borderRadius: '8px' }}>
                      <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: 'var(--nc-gold)' }}>VISUAL STYLE & PALETTE:</p>
                      <p style={{ margin: 0, fontSize: '13px' }}>{currentShort.storyboard.visual_style}</p>
                    </div>

                    <div className="shorts-scenes-list">
                      {currentShort.storyboard.scenes?.map((sb) => (
                        <div key={sb.scene_number} className="shorts-scene-item">
                          <div className="shorts-scene-item__header">
                            <span className="shorts-scene-badge">Visual Scene {sb.scene_number}</span>
                            <span className="shorts-scene-time">{sb.time_range}</span>
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--nc-text)' }}>
                            <b>Layout & Camera:</b> {sb.visual_layout_9_16} · <span style={{ color: 'var(--nc-gold)' }}>{sb.camera_move}</span>
                          </div>
                          <div style={{ fontSize: '12px', background: 'rgba(0, 0, 0, 0.4)', padding: '8px 10px', borderRadius: '6px', fontFamily: 'monospace', color: '#9ab9bc' }}>
                            <b>Generative Prompt:</b> {sb.generative_image_prompt}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p style={{ color: 'var(--nc-text-2)', fontSize: '13px' }}>Click below to create visual scene layouts, camera motions, and generative visual prompts.</p>
                )}

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <button type="button" className="btn-shorts-secondary" onClick={() => setStudioStep(2)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button type="button" className="btn-shorts-primary" onClick={handleGenerateStoryboard} disabled={loading}>
                    <FilmStrip size={18} />
                    {loading ? 'Creating Storyboard...' : 'Generate 9:16 Storyboard'}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: PRODUCTION PACKAGE */}
            {studioStep === 4 && (
              <div className="shorts-card">
                <h2>
                  <span>Step 4: Production Package & YouTube Metadata</span>
                  <span style={{ fontSize: '12px', color: 'var(--nc-ok)' }}>Ready for Export</span>
                </h2>

                {currentShort?.productionPackage ? (
                  <>
                    <div className="shorts-form-group">
                      <label>YouTube Short Title (&lt;60 chars with #Shorts)</label>
                      <input className="shorts-input" value={currentShort.productionPackage.metadata.youtube_title} readOnly />
                    </div>

                    <div className="shorts-form-group">
                      <label>YouTube Description & Hashtags</label>
                      <textarea className="shorts-textarea" rows={4} value={currentShort.productionPackage.metadata.youtube_description} readOnly />
                    </div>

                    <div className="shorts-form-group">
                      <label>Pinned Engagement Comment</label>
                      <input className="shorts-input" value={currentShort.productionPackage.metadata.pinned_comment} readOnly />
                    </div>

                    <div className="shorts-row-2">
                      <div className="shorts-form-group">
                        <label>Tags</label>
                        <input className="shorts-input" value={currentShort.productionPackage.metadata.tags?.join(', ')} readOnly />
                      </div>
                      <div className="shorts-form-group">
                        <label>Export Specs</label>
                        <input className="shorts-input" value={`${currentShort.productionPackage.technical_specs.resolution} · ${currentShort.productionPackage.technical_specs.fps} FPS · ${currentShort.productionPackage.technical_specs.audio_loudness}`} readOnly />
                      </div>
                    </div>
                  </>
                ) : (
                  <p style={{ color: 'var(--nc-text-2)', fontSize: '13px' }}>Click below to synthesize the complete YouTube title, description, tags, pinned comment, and technical specs.</p>
                )}

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <button type="button" className="btn-shorts-secondary" onClick={() => setStudioStep(3)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button type="button" className="btn-shorts-primary" onClick={handleGeneratePackage} disabled={loading}>
                    <Rocket size={18} />
                    {loading ? 'Building Package...' : 'Generate Production Package'}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: CANVA DESIGN SPEC */}
            {studioStep === 5 && (
              <div className="shorts-card">
                <h2>
                  <span>Step 5: Canva Design Spec (Cover & Thumbnail)</span>
                  <span style={{ fontSize: '12px', color: 'var(--nc-gold)' }}>Adapter: worker/canva.mjs</span>
                </h2>

                <div style={{ marginBottom: '16px', padding: '14px', background: 'rgba(39, 230, 240, 0.06)', borderRadius: '8px', border: '1px solid var(--nc-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--nc-bright)' }}>Canva API Status</span>
                    <span className={`badge-status ${canvaStatus?.connected ? 'approved' : 'draft'}`}>
                      {canvaStatus?.connected ? 'Connected' : 'Awaiting Authentication'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--nc-text-2)' }}>
                    {canvaStatus?.note || '9:16 vertical cover and thumbnail specs are generated for automatic sync or manual Canva editing.'}
                  </p>
                </div>

                {currentShort?.canvaSpec ? (
                  <div className="shorts-scenes-list">
                    <div className="shorts-scene-item">
                      <div className="shorts-scene-item__header">
                        <span className="shorts-scene-badge">Design Template: {currentShort.canvaSpec.template}</span>
                        <span className="shorts-scene-time">{currentShort.canvaSpec.design_spec.dimensions}</span>
                      </div>
                      <div style={{ fontSize: '13px' }}>
                        <b>Dominant Color:</b> <span style={{ color: currentShort.canvaSpec.design_spec.dominantColor }}>{currentShort.canvaSpec.design_spec.dominantColor}</span> · <b>Accent:</b> <span style={{ color: currentShort.canvaSpec.design_spec.accentColor }}>{currentShort.canvaSpec.design_spec.accentColor}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--nc-text-2)' }}>
                        <b>Layers:</b>
                        <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                          {currentShort.canvaSpec.design_spec.layers.map((l: any, i: number) => (
                            <li key={i}>{l.name} ({l.type}): "{l.content}"</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p style={{ color: 'var(--nc-text-2)', fontSize: '13px' }}>Click below to generate Canva design layers, font styles, and brand assets.</p>
                )}

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <button type="button" className="btn-shorts-secondary" onClick={() => setStudioStep(4)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button type="button" className="btn-shorts-primary" onClick={handleGenerateCanva} disabled={loading}>
                    <Palette size={18} />
                    {loading ? 'Generating Spec...' : 'Generate Canva Spec'}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 6: PUBLISH & AUTHORIZE */}
            {studioStep === 6 && (
              <div className="shorts-card">
                <h2>
                  <span>Step 6: Authorization & Publishing Guard</span>
                  <span style={{ fontSize: '12px', color: 'var(--nc-bright)' }}>Owner Gate</span>
                </h2>

                <div style={{ padding: '16px', background: 'rgba(233, 199, 125, 0.1)', border: '1px solid var(--nc-gold)', borderRadius: '10px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--nc-gold)', fontWeight: '700', fontSize: '14px', marginBottom: '8px' }}>
                    <ShieldCheck size={20} />
                    Mandatory Owner Authorization
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--nc-text)' }}>
                    In accordance with NTS safety protocols, AI agents can never publish directly to YouTube Shorts without explicit human authorization.
                  </p>
                </div>

                <div className="shorts-form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#fff', fontSize: '14px' }}>
                    <input type="checkbox" checked={publishAuthorized} onChange={(e) => setPublishAuthorized(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--nc-bright)' }} />
                    <b>I authorize publishing or scheduling this YouTube Short to NIKHILs TECH Studio.</b>
                  </label>
                </div>

                <div className="shorts-form-group" style={{ marginTop: '16px' }}>
                  <label htmlFor="sched-input">Schedule for Later (Optional — leave blank for immediate publish/approval)</label>
                  <input id="sched-input" type="datetime-local" className="shorts-input" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
                </div>

                {currentShort?.youtubeUrl && (
                  <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(53, 214, 154, 0.15)', borderRadius: '8px', border: '1px solid var(--nc-ok)' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--nc-ok)' }}>
                      Published on YouTube: <a href={currentShort.youtubeUrl} target="_blank" rel="noreferrer" style={{ color: '#fff', textDecoration: 'underline' }}>{currentShort.youtubeUrl}</a>
                    </p>
                  </div>
                )}

                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <button type="button" className="btn-shorts-secondary" onClick={() => setStudioStep(5)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button type="button" className="btn-shorts-primary" onClick={handlePublish} disabled={loading || !publishAuthorized}>
                    <Rocket size={18} />
                    {loading ? 'Processing...' : scheduleDate ? 'Schedule Short' : 'Authorize & Dispatch Short'}
                  </button>
                </div>

                {/* FINAL VIDEO PRODUCTION & GOOGLE DRIVE DELIVERY */}
                <div style={{ marginTop: '28px', padding: '18px', background: 'rgba(39, 230, 240, 0.05)', border: '1px solid var(--nc-border)', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--nc-bright)' }}>
                      Final Video Production & Google Drive Delivery
                    </div>
                    <span className="badge-status approved">9:16 Vertical · 1080x1920 MP4</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                    <div style={{ padding: '8px 10px', background: 'var(--nc-surface)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--nc-text-2)' }}>Topic</div>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentShort?.topic || 'NTS Practical AI Short'}</div>
                    </div>
                    <div style={{ padding: '8px 10px', background: 'var(--nc-surface)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--nc-text-2)' }}>Script Status</div>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--nc-ok)' }}>✓ Script Ready</div>
                    </div>
                    <div style={{ padding: '8px 10px', background: 'var(--nc-surface)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--nc-text-2)' }}>Canva Design</div>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: currentShort?.canvaSpec ? 'var(--nc-ok)' : 'var(--nc-gold)' }}>
                        {currentShort?.canvaSpec ? '✓ Spec Ready' : 'Pending'}
                      </div>
                    </div>
                    <div style={{ padding: '8px 10px', background: 'var(--nc-surface)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--nc-text-2)' }}>Video Render</div>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: currentShort?.videoDelivery ? 'var(--nc-ok)' : 'var(--nc-gold)' }}>
                        {currentShort?.videoDelivery ? '✓ MP4 Ready' : 'Ready to Render'}
                      </div>
                    </div>
                    <div style={{ padding: '8px 10px', background: 'var(--nc-surface)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--nc-text-2)' }}>Google Drive</div>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: currentShort?.videoDelivery?.driveFileUrl ? 'var(--nc-ok)' : 'var(--nc-gold)' }}>
                        {currentShort?.videoDelivery?.driveFileUrl ? '✓ FINAL_VIDEOS' : 'Pending'}
                      </div>
                    </div>
                  </div>

                  {currentShort?.videoDelivery?.driveFileUrl && (
                    <div style={{ padding: '14px', background: 'rgba(53, 214, 154, 0.12)', border: '1px solid var(--nc-ok)', borderRadius: '8px', marginBottom: '16px' }}>
                      <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--nc-ok)', marginBottom: '4px' }}>
                        ✓ Final Playable MP4 Video in Google Drive!
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--nc-text-2)', marginBottom: '10px' }}>
                        File: <b>{currentShort.videoDelivery.mp4Filename}</b> ({currentShort.videoDelivery.mp4FileSize} · {currentShort.videoDelivery.durationSec}s · Male Natural Indian English Voice)
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <a
                          href={currentShort.videoDelivery.driveFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'var(--nc-ok)',
                            color: '#03191d',
                            fontWeight: '700',
                            padding: '8px 14px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            textDecoration: 'none',
                          }}
                        >
                          ▶ Open Video in Google Drive
                        </a>
                        <a
                          href="https://drive.google.com/drive/folders/1iPltnBqBuVtjViP7ONSmf_q8l0_Bgv7J"
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(255,255,255,0.08)',
                            color: '#fff',
                            fontWeight: '600',
                            padding: '8px 14px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            textDecoration: 'none',
                          }}
                        >
                          📁 Open FINAL_VIDEOS Folder
                        </a>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleGenerateAndUploadFinalShort}
                    disabled={loading}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #27e6f0 0%, #17a2b8 100%)',
                      color: '#03191d',
                      fontWeight: '800',
                      fontSize: '14px',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 14px rgba(39, 230, 240, 0.3)',
                    }}
                  >
                    <Rocket size={18} weight="bold" />
                    {loading ? 'RENDERING & UPLOADING MP4...' : 'GENERATE & UPLOAD FINAL SHORT'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: 9:16 Interactive Phone Mockup Preview */}
          <div className="shorts-preview-column">
            <div className="shorts-phone-mockup">
              {/* Phone Camera Notch */}
              <div className="mockup-camera-notch">
                <div className="mockup-camera-lens" />
              </div>

              {/* Mockup Screen Content */}
              <div className="mockup-screen">
                {/* Background Visual Scene Simulation */}
                <div
                  className="mockup-visual-scene"
                  style={{
                    backgroundImage: 'radial-gradient(circle at 50% 40%, rgba(39, 230, 240, 0.25) 0%, rgba(7, 49, 57, 0.8) 100%)',
                  }}
                />

                {/* Top Bar */}
                <div className="mockup-top-bar">
                  <span>9:41</span>
                  <span>Shorts</span>
                  <span style={{ fontSize: '10px' }}>5G</span>
                </div>

                {/* Center Content: Hook & Captions */}
                <div className="mockup-center-content">
                  {currentShort?.hook && (
                    <div className="mockup-hook-banner">
                      {currentShort.category}
                    </div>
                  )}

                  <div className="mockup-caption-text">
                    {currentScene ? (
                      <>
                        "{currentScene.on_screen_text}"
                        <div style={{ fontSize: '11px', marginTop: '6px', color: 'var(--nc-bright)', fontWeight: '600' }}>
                          Scene {currentScene.scene_number} ({currentScene.time_range})
                        </div>
                      </>
                    ) : (
                      <span>Draft or select a short to preview live captions.</span>
                    )}
                  </div>
                </div>

                {/* Bottom UI & Engagement Rail */}
                <div className="mockup-bottom-ui">
                  <div className="mockup-creator-info">
                    <div className="mockup-creator-handle">
                      <span>@NikhilsTechStudio</span>
                      <span className="mockup-sub-btn">Subscribe</span>
                    </div>
                    <div className="mockup-title-preview">
                      {currentShort?.title || 'YouTube Short Preview'}
                    </div>
                  </div>

                  {/* YouTube Engagement Rail */}
                  <div className="mockup-engagement-rail">
                    <div className="mockup-action-btn">
                      <ThumbsUp size={20} weight="fill" />
                      <span>24K</span>
                    </div>
                    <div className="mockup-action-btn">
                      <ChatCircle size={20} weight="fill" />
                      <span>428</span>
                    </div>
                    <div className="mockup-action-btn">
                      <ShareNetwork size={20} weight="fill" />
                      <span>Share</span>
                    </div>
                  </div>
                </div>

                {/* Animated Bottom Progress Bar */}
                <div className="mockup-progress-bar">
                  <div className="mockup-progress-fill" style={{ width: `${playbackProgress}%` }} />
                </div>
              </div>
            </div>

            {/* Playback & Scene Controls */}
            <div className="mockup-controls">
              <button
                type="button"
                className="btn-shorts-secondary"
                onClick={() => setPreviewSceneIdx((i) => Math.max(0, i - 1))}
                disabled={previewSceneIdx === 0 || !scenes.length}
                title="Previous Scene"
              >
                <ArrowLeft size={16} />
              </button>
              <button
                type="button"
                className="btn-shorts-primary"
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={!scenes.length}
                style={{ padding: '8px 16px' }}
              >
                {isPlaying ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
                {isPlaying ? 'Pause' : 'Play Preview'}
              </button>
              <button
                type="button"
                className="btn-shorts-secondary"
                onClick={() => setPreviewSceneIdx((i) => Math.min(scenes.length - 1, i + 1))}
                disabled={previewSceneIdx >= scenes.length - 1 || !scenes.length}
                title="Next Scene"
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CONTENT LIBRARY */}
      {activeTab === 'library' && (
        <div className="shorts-card">
          <h2>
            <span>YouTube Shorts Content Library</span>
            <span style={{ fontSize: '13px', color: 'var(--nc-text-2)' }}>{filteredLibrary.length} items</span>
          </h2>

          <div style={{ display: 'flex', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <input
              className="shorts-input"
              style={{ maxWidth: '320px' }}
              placeholder="Search by title, topic or hook..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="shorts-select"
              style={{ maxWidth: '200px' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="scripted">Scripted</option>
              <option value="storyboarded">Storyboarded</option>
              <option value="packaged">Packaged</option>
              <option value="approved">Approved</option>
              <option value="published">Published</option>
            </select>
          </div>

          {filteredLibrary.length > 0 ? (
            <table className="shorts-table">
              <thead>
                <tr>
                  <th>Title & Hook</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLibrary.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <b style={{ color: '#fff', fontSize: '14px' }}>{item.title}</b>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--nc-text-2)', fontStyle: 'italic' }}>
                        "{item.hook}"
                      </p>
                    </td>
                    <td>
                      <span style={{ color: 'var(--nc-gold)', fontSize: '12px' }}>{item.category}</span>
                    </td>
                    <td>
                      <span className={`badge-status ${item.status}`}>{item.status}</span>
                    </td>
                    <td style={{ color: 'var(--nc-text-2)', fontSize: '12px' }}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn-shorts-secondary"
                          style={{ padding: '6px 10px', fontSize: '11px' }}
                          onClick={() => {
                            setCurrentShort(item);
                            setActiveTab('studio');
                            setStudioStep(item.status === 'draft' ? 1 : item.status === 'scripted' ? 2 : item.status === 'storyboarded' ? 3 : 4);
                          }}
                        >
                          Open in Studio
                        </button>
                        <button
                          type="button"
                          className="btn-shorts-secondary"
                          style={{ padding: '6px 8px', color: 'var(--nc-bad)' }}
                          onClick={() => handleDeleteShort(item.id)}
                          title="Delete Draft"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--nc-text-2)', padding: '40px 0' }}>
              No Shorts found matching the criteria. Click "New Short" to start.
            </p>
          )}
        </div>
      )}

      {/* TAB 3: DAILY CURRICULUM CALENDAR */}
      {activeTab === 'calendar' && (
        <div className="shorts-card">
          <h2>
            <span>7-Day Rolling Curriculum Calendar</span>
            <span style={{ fontSize: '12px', color: 'var(--nc-bright)' }}>NTS AI Education Matrix</span>
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--nc-text-2)', margin: '0 0 16px 0' }}>
            Structured daily curriculum designed to systematically move professionals from passive chat prompts to proactive automation and agents.
          </p>

          <div className="shorts-cal-grid">
            {calendarItems.map((cal) => (
              <div key={cal.id} className="shorts-cal-card">
                <div className="shorts-cal-card__top">
                  <span className="shorts-cal-day">Day {cal.dayNumber}</span>
                  <span className="shorts-cal-date">{cal.date}</span>
                </div>
                <div>
                  <span className="chip-cat" style={{ fontSize: '11px', color: 'var(--nc-gold)' }}>{cal.category}</span>
                  <h3 className="shorts-cal-topic">{cal.topic}</h3>
                  <p className="shorts-cal-hook">"{cal.hook}"</p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`badge-status ${cal.status}`}>{cal.status}</span>
                  <button
                    type="button"
                    className="btn-shorts-secondary"
                    style={{ padding: '6px 10px', fontSize: '11px' }}
                    onClick={() => {
                      setTopicInput(cal.topic);
                      setCategoryInput(cal.category);
                      setActiveTab('studio');
                      setStudioStep(1);
                    }}
                  >
                    Load into Studio
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: AUTOMATION & INTEGRATIONS */}
      {activeTab === 'integrations' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {/* Cron Runner Card */}
          <div className="shorts-card">
            <h2>
              <span>Cloudflare Cron Automation</span>
              <Clock size={20} color="var(--nc-bright)" />
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--nc-text-2)', lineHeight: 1.5 }}>
              Executes the daily Short synthesis cycle via Cloudflare Worker scheduled triggers. Picks today's curriculum topic, generates the hook, script, storyboard, and production package, and alerts via Telegram bot for owner approval.
            </p>
            <div style={{ margin: '16px 0', padding: '12px', background: 'rgba(3, 25, 29, 0.6)', borderRadius: '8px', border: '1px solid var(--nc-border)' }}>
              <div style={{ fontSize: '12px', color: 'var(--nc-text-2)' }}>Schedule: <b>5 * * * * (Hourly Check)</b></div>
              <div style={{ fontSize: '12px', color: 'var(--nc-text-2)', marginTop: '4px' }}>Target Publish Window: <b>13:30 UTC / 19:00 IST</b></div>
            </div>
            <button type="button" className="btn-shorts-primary" onClick={handleRunDailyCycle} disabled={loading} style={{ width: '100%' }}>
              <Sparkle size={18} weight="fill" />
              Trigger Automated Cycle Now
            </button>
          </div>

          {/* Canva Adapter Card */}
          <div className="shorts-card">
            <h2>
              <span>Canva Adapter (`worker/canva.mjs`)</span>
              <Palette size={20} color="var(--nc-gold)" />
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--nc-text-2)', lineHeight: 1.5 }}>
              Generates 1080x1920 vertical cover layers and design specifications with NTS brand kit colors (`#03191d`, `#27e6f0`, `#e9c77d`).
            </p>
            <div style={{ margin: '16px 0', padding: '12px', background: 'rgba(3, 25, 29, 0.6)', borderRadius: '8px', border: '1px solid var(--nc-border)' }}>
              <div style={{ fontSize: '12px' }}>
                Status: <span style={{ color: canvaStatus?.connected ? 'var(--nc-ok)' : 'var(--nc-gold)', fontWeight: '700' }}>{canvaStatus?.connected ? 'Active API' : 'Awaiting CANVA_API_KEY'}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--nc-text-2)', marginTop: '6px' }}>
                Set `CANVA_API_KEY` in Cloudflare Worker secrets to enable direct Canva export sync.
              </div>
            </div>
          </div>

          {/* YouTube Channel OAuth */}
          <div className="shorts-card">
            <h2>
              <span>YouTube Channel Publishing</span>
              <VideoCamera size={20} color="#ff0000" />
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--nc-text-2)', lineHeight: 1.5 }}>
              Publishes to official channel: <b>@NikhilsTechStudio</b>.
              OAuth tokens are stored securely in Cloudflare KV (`yt/oauth/meta`).
            </p>
            <div style={{ margin: '16px 0', padding: '12px', background: 'rgba(3, 25, 29, 0.6)', borderRadius: '8px', border: '1px solid var(--nc-border)' }}>
              <div style={{ fontSize: '12px' }}>Channel: <b>NIKHILs TECH Studio</b></div>
              <div style={{ fontSize: '12px', color: 'var(--nc-ok)', marginTop: '4px' }}>Approval Required: <b>Yes (Enforced by publish_short MCP Tool)</b></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
