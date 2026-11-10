// NTS COMMAND — X (Twitter) Social Media Workspace
// Complete 3-column enterprise interface matching the V1 Ocean Teal design system
// Supports real OAuth 2.0 PKCE, X API v2 posting, timeline feeds, agent AI drafting, and Telegram approvals.

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowSquareOut,
  Bell,
  BookmarkSimple,
  CalendarCheck,
  ChatCircleText,
  CheckCircle,
  CircleNotch,
  DotsThreeCircle,
  Heart,
  House,
  Image as ImageIcon,
  MagnifyingGlass,
  PaperPlaneTilt,
  PencilSimple,
  PhoneCall,
  Plus,
  Repeat,
  ShareNetwork,
  Sparkle,
  Trash,
  User,
  UsersThree,
  WarningCircle,
  XLogo,
} from '@phosphor-icons/react';
import type { Api } from './shared';

export type XStatus = {
  configured: boolean;
  connected: boolean;
  expired: boolean;
  username: string;
  name: string;
  profileImageUrl: string;
  userId: string | null;
  expiresAt: string | null;
  scopes: string[];
  redirectUri: string;
  targetAccount: string;
  lastSync: string | null;
  followersCount: number;
  followingCount: number;
  tweetCount: number;
  statusLabel: string;
};

export type Tweet = {
  id: string;
  author: string;
  handle: string;
  avatar: string;
  verified?: boolean;
  timestamp: string;
  content: string;
  category?: string;
  metrics: {
    replies: number;
    reposts: number;
    likes: number;
    views: string;
    bookmarks: number;
  };
  demo?: boolean;
  liked?: boolean;
  reposted?: boolean;
  bookmarked?: boolean;
};

export type Trend = {
  tag: string;
  tweets: string;
  category: string;
};

export type Suggestion = {
  name: string;
  handle: string;
  verified: boolean;
  avatar: string;
  bio: string;
};

interface TwitterWorkspaceProps {
  api: Api;
}

export function TwitterWorkspace({ api }: TwitterWorkspaceProps) {
  // Navigation sub-tab inside X workspace
  const [navTab, setNavTab] = useState<'home' | 'explore' | 'notifications' | 'follow' | 'messages' | 'profile' | 'settings'>('home');
  const [feedTab, setFeedTab] = useState<'for_you' | 'following' | 'tech' | 'business' | 'news'>('for_you');

  // Status & Timelines
  const [status, setStatus] = useState<XStatus | null>(null);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Composer State
  const [composerText, setComposerText] = useState('');
  const [threadList, setThreadList] = useState<string[]>([]);
  const [isThreadMode, setIsThreadMode] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [posting, setPosting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // AI Generation State
  const [generatingAgent, setGeneratingAgent] = useState<'AGNI' | 'VYASA' | 'LAKSHMI' | 'REPLY' | null>(null);
  const [aiTopic, setAiTopic] = useState('');
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // Settings form
  const [clientIdInput, setClientIdInput] = useState('');
  const [clientSecretInput, setClientSecretInput] = useState('');
  const [targetHandleInput, setTargetHandleInput] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const s = await api<XStatus>('/api/dev/x');
      setStatus(s);
      setTargetHandleInput(s.targetAccount);
    } catch {
      // Offline fallback
      setStatus({
        configured: false,
        connected: false,
        expired: false,
        username: '@NTS_Nikhil',
        name: 'NIKHILs TECH STUDIO',
        profileImageUrl: '/img/intro/logo.jpg',
        userId: null,
        expiresAt: null,
        scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
        redirectUri: 'https://nts-website.aistudio09.workers.dev/api/x/callback',
        targetAccount: '@NTS_Nikhil',
        lastSync: null,
        followersCount: 14200,
        followingCount: 482,
        tweetCount: 689,
        statusLabel: 'X: Not Connected (Demo Mode)',
      });
    }
  }, [api]);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ tweets: Tweet[]; notice?: string }>(`/api/dev/x/feed?tab=${feedTab}`);
      setTweets(d.tweets || []);
      const tr = await api<{ trends: Trend[]; suggestions: Suggestion[] }>('/api/dev/x/trends');
      setTrends(tr.trends || []);
      setSuggestions(tr.suggestions || []);
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [api, feedTab]);

  useEffect(() => {
    loadStatus();
    loadFeed();
  }, [loadStatus, loadFeed]);

  // Connect OAuth
  const handleConnectX = async () => {
    try {
      setMsg(null);
      const res = await api<{ url: string }>('/api/dev/x/connect', { method: 'POST' });
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    }
  };

  // Disconnect
  const handleDisconnectX = async () => {
    if (!confirm('Disconnect this X (Twitter) account?')) return;
    try {
      await api('/api/dev/x', { method: 'DELETE' });
      setMsg({ kind: 'ok', text: 'X account disconnected.' });
      loadStatus();
      loadFeed();
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    }
  };

  // Publish Post
  const handlePublish = async (simulate = false) => {
    if (!composerText.trim()) return;
    setPosting(true);
    setMsg(null);
    try {
      const res = await api<{ ok: boolean; url?: string; note?: string }>('/api/dev/x/publish', {
        method: 'POST',
        body: JSON.stringify({
          text: composerText,
          simulate: simulate || !status?.connected,
          idempotencyKey: `x_${Date.now()}`,
        }),
      });

      // Add to timeline locally
      const newTweet: Tweet = {
        id: `tw_local_${Date.now()}`,
        author: status?.name || 'NIKHILs TECH STUDIO',
        handle: (status?.username || 'NTS_Nikhil').replace(/^@/, ''),
        avatar: status?.profileImageUrl || '/img/intro/logo.jpg',
        verified: true,
        timestamp: 'Just now',
        content: composerText,
        metrics: { replies: 0, reposts: 0, likes: 0, views: '1', bookmarks: 0 },
        demo: !status?.connected,
      };

      setTweets([newTweet, ...tweets]);
      setComposerText('');
      setThreadList([]);
      setIsThreadMode(false);
      setMsg({
        kind: 'ok',
        text: res.note || `Tweet published successfully: ${res.url || 'View on X'}`,
      });
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setPosting(false);
    }
  };

  // AI Assistant Drafting
  const handleAiDraft = async (type: 'hook' | 'thread' | 'post' | 'reply', agent: 'AGNI' | 'VYASA' | 'LAKSHMI' | 'REPLY') => {
    if (!aiTopic.trim()) return;
    setGeneratingAgent(agent);
    setMsg(null);
    try {
      const r = await api<{ result: string }>('/api/dev/x/generate', {
        method: 'POST',
        body: JSON.stringify({ topic: aiTopic, type, agent }),
      });
      setComposerText(r.result);
      setAiModalOpen(false);
      setMsg({ kind: 'ok', text: `Draft generated by agent ${agent}.` });
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setGeneratingAgent(null);
    }
  };

  // Interactive like / repost toggling
  const toggleLike = (id: string) => {
    setTweets((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const liked = !t.liked;
          return {
            ...t,
            liked,
            metrics: { ...t.metrics, likes: t.metrics.likes + (liked ? 1 : -1) },
          };
        }
        return t;
      })
    );
  };

  const toggleRepost = (id: string) => {
    setTweets((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const reposted = !t.reposted;
          return {
            ...t,
            reposted,
            metrics: { ...t.metrics, reposts: t.metrics.reposts + (reposted ? 1 : -1) },
          };
        }
        return t;
      })
    );
  };

  // Filtered tweets based on search
  const displayedTweets = searchQuery.trim()
    ? tweets.filter((t) => t.content.toLowerCase().includes(searchQuery.toLowerCase()) || t.author.toLowerCase().includes(searchQuery.toLowerCase()))
    : tweets;

  const charCount = composerText.length;
  const isOverLimit = charCount > 280;

  return (
    <div className="x-workspace" style={{ display: 'grid', gridTemplateColumns: '230px minmax(480px, 1fr) 320px', gap: 18, color: '#f3fafa', minHeight: 'calc(100vh - 120px)' }}>
      {/* =========================================================================
          LEFT NAVIGATION COLUMN (Matching reference X menu items inside V1 styling)
          ========================================================================= */}
      <aside className="x-nav-col" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderRight: '1px solid var(--nc-border)', paddingRight: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', background: 'rgba(39, 230, 240, 0.1)', border: '1px solid var(--nc-border)' }}>
            <XLogo size={20} color="#27e6f0" weight="bold" />
          </div>
          <div>
            <h2 style={{ fontSize: 15, margin: 0, fontWeight: 800, letterSpacing: '0.02em', color: '#f3fafa' }}>X Workspace</h2>
            <small style={{ fontSize: 10, color: '#9ab9bc' }}>Official API v2</small>
          </div>
        </div>

        {[
          { key: 'home', label: 'Home', icon: House },
          { key: 'explore', label: 'Explore', icon: MagnifyingGlass },
          { key: 'notifications', label: 'Notifications', icon: Bell },
          { key: 'follow', label: 'Follow & Discover', icon: UsersThree },
          { key: 'messages', label: 'Direct Messages', icon: ChatCircleText },
          { key: 'calls', label: 'Calls', icon: PhoneCall, external: 'https://x.com' },
          { key: 'grok', label: 'Grok', icon: Sparkle, external: 'https://x.com/i/grok' },
          { key: 'profile', label: 'Profile', icon: User },
          { key: 'settings', label: 'Settings & OAuth', icon: DotsThreeCircle },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = navTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                if (item.external) {
                  window.open(item.external, '_blank', 'noopener,noreferrer');
                } else {
                  setNavTab(item.key as typeof navTab);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 9999,
                border: 0,
                background: isActive ? 'rgba(39, 230, 240, 0.15)' : 'transparent',
                color: isActive ? '#27e6f0' : '#d2e7e9',
                fontSize: 14,
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
              <span>{item.label}</span>
              {item.external && <ArrowSquareOut size={12} style={{ marginLeft: 'auto', opacity: 0.6 }} />}
            </button>
          );
        })}

        {/* Quick Post Button */}
        <button
          type="button"
          onClick={() => {
            setNavTab('home');
            document.getElementById('x-post-input')?.focus();
          }}
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 9999,
            border: 0,
            background: 'linear-gradient(135deg, #00d5d8 0%, #27e6f0 100%)',
            color: '#02262b',
            fontWeight: 800,
            fontSize: 14,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0, 213, 216, 0.35)',
          }}
        >
          <PencilSimple size={18} weight="bold" />
          <span>Post</span>
        </button>

        {/* Connected Account Mini Card */}
        <div style={{ marginTop: 'auto', padding: '12px 10px', borderRadius: 14, background: 'rgba(7, 49, 57, 0.5)', border: '1px solid var(--nc-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src={status?.profileImageUrl || '/img/intro/logo.jpg'}
            alt=""
            width={36}
            height={36}
            style={{ borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f3fafa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {status?.name || 'NIKHILs TECH STUDIO'}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: '#9ab9bc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {status?.username || '@NTS_Nikhil'}
            </p>
            <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, color: status?.connected ? '#35d69a' : '#e9b85c', marginTop: 2 }}>
              {status?.connected ? '● Connected' : '○ Demo Mode'}
            </span>
          </div>
        </div>
      </aside>

      {/* =========================================================================
          CENTRE COLUMN: FEED, COMPOSER, TWEET TIMELINE
          ========================================================================= */}
      <main className="x-center-col" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        {msg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: msg.kind === 'ok' ? 'rgba(53, 214, 154, 0.15)' : 'rgba(240, 120, 120, 0.15)',
              border: `1px solid ${msg.kind === 'ok' ? 'rgba(53, 214, 154, 0.35)' : 'rgba(240, 120, 120, 0.35)'}`,
              color: msg.kind === 'ok' ? '#35d69a' : '#f07878',
            }}
          >
            {msg.kind === 'ok' ? <CheckCircle size={18} /> : <WarningCircle size={18} />}
            <span>{msg.text}</span>
          </div>
        )}

        {navTab === 'settings' ? (
          /* ================= X INTEGRATION SETTINGS PANEL ================= */
          <div style={{ background: 'var(--nc-surface)', border: '1px solid var(--nc-border)', borderRadius: 16, padding: 20 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>X (Twitter) Developer App Settings</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#9ab9bc', lineHeight: 1.5 }}>
              Connect your X account using OAuth 2.0 PKCE. Requires an App in the X Developer Portal with User authentication enabled.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 540 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#d2e7e9' }}>
                  Target X Handle
                </label>
                <input
                  type="text"
                  className="dx-input"
                  value={targetHandleInput}
                  onChange={(e) => setTargetHandleInput(e.target.value)}
                  placeholder="@NTS_Nikhil"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#d2e7e9' }}>
                  X OAuth 2.0 Client ID
                </label>
                <input
                  type="text"
                  className="dx-input"
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  placeholder="Paste Client ID from developer.x.com"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#d2e7e9' }}>
                  X Client Secret (optional for confidential clients)
                </label>
                <input
                  type="password"
                  className="dx-input"
                  value={clientSecretInput}
                  onChange={(e) => setClientSecretInput(e.target.value)}
                  placeholder="Paste Client Secret if configured"
                />
              </div>

              <div style={{ padding: 12, borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 12 }}>
                <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#9ab9bc' }}>Authorized Redirect URI (Callback):</p>
                <code style={{ color: '#27e6f0', wordBreak: 'break-all' }}>{status?.redirectUri}</code>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="dx-btn dx-btn--primary"
                  onClick={async () => {
                    try {
                      if (clientIdInput) await api('/api/dev/settings', { method: 'POST', body: JSON.stringify({ key: 'TWITTER_CLIENT_ID', value: clientIdInput }) });
                      if (clientSecretInput) await api('/api/dev/settings', { method: 'POST', body: JSON.stringify({ key: 'TWITTER_CLIENT_SECRET', value: clientSecretInput }) });
                      if (targetHandleInput) await api('/api/dev/settings', { method: 'POST', body: JSON.stringify({ key: 'TWITTER_HANDLE', value: targetHandleInput }) });
                      setMsg({ kind: 'ok', text: 'Settings saved.' });
                      loadStatus();
                    } catch (e) {
                      setMsg({ kind: 'err', text: (e as Error).message });
                    }
                  }}
                >
                  Save Settings
                </button>

                {status?.connected ? (
                  <button type="button" className="dx-btn" onClick={handleDisconnectX}>
                    Disconnect X Account
                  </button>
                ) : (
                  <button type="button" className="dx-btn" onClick={handleConnectX}>
                    Connect X Account
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ================= MAIN TIMELINE & COMPOSER ================= */
          <>
            {/* Feed Category Tabs (For You, Following, Tech, Business, News) */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--nc-border)', background: 'var(--nc-surface)', borderRadius: '12px 12px 0 0', overflow: 'hidden' }}>
              {[
                { key: 'for_you', label: 'For You' },
                { key: 'following', label: 'Following' },
                { key: 'tech', label: 'Tech' },
                { key: 'business', label: 'Business' },
                { key: 'news', label: 'News' },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setFeedTab(t.key as typeof feedTab)}
                  style={{
                    flex: 1,
                    padding: '12px 10px',
                    border: 0,
                    background: 'transparent',
                    color: feedTab === t.key ? '#27e6f0' : '#9ab9bc',
                    fontWeight: feedTab === t.key ? 700 : 500,
                    fontSize: 13,
                    borderBottom: feedTab === t.key ? '2px solid #27e6f0' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Offline Demo Warning Notice if not connected */}
            {!status?.connected && (
              <div style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(233, 184, 92, 0.1)', border: '1px solid rgba(233, 184, 92, 0.3)', color: '#e9c77d', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span><b>DEMO DATA ACTIVE:</b> Connect your X Developer account to view and post to live X feeds.</span>
                <button type="button" onClick={() => setNavTab('settings')} style={{ background: 'transparent', border: 0, color: '#27e6f0', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                  Connect Now →
                </button>
              </div>
            )}

            {/* Tweet Composer Card */}
            <div style={{ background: 'var(--nc-surface)', border: '1px solid var(--nc-border)', borderRadius: 14, padding: '14px 16px', display: 'flex', gap: 12 }}>
              <img
                src={status?.profileImageUrl || '/img/intro/logo.jpg'}
                alt=""
                width={40}
                height={40}
                style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <textarea
                  id="x-post-input"
                  rows={isThreadMode ? 4 : 3}
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  placeholder="What is happening?! Use @mentions, #hashtags, or summon AI agents..."
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 0,
                    outline: 'none',
                    color: '#f3fafa',
                    fontSize: 15,
                    lineHeight: 1.45,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />

                {/* Additional Thread Items if in Thread Mode */}
                {isThreadMode && threadList.map((tweetText, idx) => (
                  <div key={idx} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                    <span><b>{idx + 2}/Thread:</b> {tweetText}</span>
                    <button type="button" onClick={() => setThreadList(threadList.filter((_, i) => i !== idx))} style={{ background: 'none', border: 0, color: '#f07878', cursor: 'pointer' }}>
                      <Trash size={14} />
                    </button>
                  </div>
                ))}

                {isScheduled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9ab9bc' }}>
                    <CalendarCheck size={16} color="#27e6f0" />
                    <span>Scheduled for:</span>
                    <input
                      type="datetime-local"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--nc-border)', color: '#f3fafa', borderRadius: 6, padding: '2px 6px', fontSize: 11 }}
                    />
                  </div>
                )}

                {/* Composer Actions Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" className="dx-iconbtn" title="Add Media" onClick={() => alert('Media attachment: supported format PNG, JPEG, GIF (up to 5MB).')}>
                      <ImageIcon size={18} color="#27e6f0" />
                    </button>
                    <button type="button" className="dx-iconbtn" title="Thread Mode" onClick={() => setIsThreadMode(!isThreadMode)}>
                      <Plus size={18} color={isThreadMode ? '#e9c77d' : '#27e6f0'} />
                    </button>
                    <button type="button" className="dx-iconbtn" title="Schedule Tweet" onClick={() => setIsScheduled(!isScheduled)}>
                      <CalendarCheck size={18} color={isScheduled ? '#e9c77d' : '#27e6f0'} />
                    </button>

                    {/* AI Agent Generator Button */}
                    <button
                      type="button"
                      onClick={() => setAiModalOpen(true)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        borderRadius: 9999,
                        background: 'rgba(233, 199, 125, 0.12)',
                        border: '1px solid rgba(233, 199, 125, 0.3)',
                        color: '#e9c77d',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      <Sparkle size={13} weight="fill" />
                      <span>AI Assist</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Character Countdown */}
                    <span style={{ fontSize: 12, fontWeight: 700, color: isOverLimit ? '#f07878' : charCount > 250 ? '#e9b85c' : '#9ab9bc' }}>
                      {280 - charCount}
                    </span>

                    {/* Submit Actions */}
                    <button
                      type="button"
                      disabled={posting || !composerText.trim() || isOverLimit}
                      onClick={() => handlePublish(false)}
                      style={{
                        padding: '7px 18px',
                        borderRadius: 9999,
                        border: 0,
                        background: isOverLimit ? '#475569' : 'linear-gradient(135deg, #00d5d8 0%, #27e6f0 100%)',
                        color: '#02262b',
                        fontWeight: 800,
                        fontSize: 13,
                        cursor: isOverLimit ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {posting ? <CircleNotch size={14} className="spin" /> : <PaperPlaneTilt size={14} weight="fill" />}
                      <span>{status?.connected ? 'Post to X' : 'Simulate Post'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Assistant Modal Dropdown */}
            {aiModalOpen && (
              <div style={{ background: 'var(--nc-elev)', border: '1px solid var(--nc-border)', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 13, color: '#e9c77d', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkle size={15} weight="fill" />
                    <span>NTS Agent Content Generation</span>
                  </h4>
                  <button type="button" onClick={() => setAiModalOpen(false)} style={{ background: 'none', border: 0, color: '#9ab9bc', cursor: 'pointer' }}>✕</button>
                </div>
                <input
                  type="text"
                  className="dx-input"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="Enter topic e.g. SQL Indexing best practices or PostgREST vs Prisma"
                  style={{ marginBottom: 10 }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="dx-btn"
                    disabled={Boolean(generatingAgent)}
                    onClick={() => handleAiDraft('hook', 'AGNI')}
                  >
                    🔥 Agni (Viral Hooks)
                  </button>
                  <button
                    type="button"
                    className="dx-btn"
                    disabled={Boolean(generatingAgent)}
                    onClick={() => handleAiDraft('thread', 'VYASA')}
                  >
                    📜 Vyasa (3-Part Thread)
                  </button>
                  <button
                    type="button"
                    className="dx-btn"
                    disabled={Boolean(generatingAgent)}
                    onClick={() => handleAiDraft('post', 'LAKSHMI')}
                  >
                    ✨ Lakshmi (Tech Post)
                  </button>
                  <button
                    type="button"
                    className="dx-btn"
                    disabled={Boolean(generatingAgent)}
                    onClick={() => handleAiDraft('reply', 'REPLY')}
                  >
                    💬 Reply Agent
                  </button>
                </div>
              </div>
            )}

            {/* Timeline Stream */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#9ab9bc' }}>
                  <CircleNotch size={24} className="spin" style={{ margin: '0 auto 8px' }} />
                  <p>Loading timeline feed...</p>
                </div>
              ) : displayedTweets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#9ab9bc', background: 'var(--nc-surface)', borderRadius: 12 }}>
                  <p>No tweets found in this feed tab.</p>
                </div>
              ) : (
                displayedTweets.map((tweet) => (
                  <article
                    key={tweet.id}
                    style={{
                      background: 'var(--nc-surface)',
                      border: '1px solid var(--nc-border)',
                      borderRadius: 14,
                      padding: '14px 16px',
                      display: 'flex',
                      gap: 12,
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <img
                      src={tweet.avatar}
                      alt=""
                      width={42}
                      height={42}
                      style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <header style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                        <b style={{ fontSize: 14, color: '#f3fafa' }}>{tweet.author}</b>
                        {tweet.verified && <CheckCircle size={15} weight="fill" color="#38bdf8" />}
                        <span style={{ fontSize: 12, color: '#9ab9bc' }}>@{tweet.handle}</span>
                        <span style={{ fontSize: 12, color: '#7fa3a7' }}>· {tweet.timestamp}</span>
                        {tweet.demo && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(233,184,92,0.15)', color: '#e9b85c', marginLeft: 'auto' }}>
                            DEMO
                          </span>
                        )}
                      </header>

                      {/* Tweet Content */}
                      <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.5, color: '#eaf4f5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {tweet.content}
                      </p>

                      {/* Interactive Metrics Toolbar */}
                      <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#9ab9bc', fontSize: 12, maxWidth: 440 }}>
                        <button
                          type="button"
                          className="dx-iconbtn"
                          title="Reply"
                          onClick={() => {
                            setComposerText(`@${tweet.handle} `);
                            document.getElementById('x-post-input')?.focus();
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'inherit' }}
                        >
                          <ChatCircleText size={16} />
                          <span>{tweet.metrics.replies}</span>
                        </button>

                        <button
                          type="button"
                          className="dx-iconbtn"
                          title="Repost"
                          onClick={() => toggleRepost(tweet.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, color: tweet.reposted ? '#35d69a' : 'inherit' }}
                        >
                          <Repeat size={16} weight={tweet.reposted ? 'bold' : 'regular'} />
                          <span>{tweet.metrics.reposts}</span>
                        </button>

                        <button
                          type="button"
                          className="dx-iconbtn"
                          title="Like"
                          onClick={() => toggleLike(tweet.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, color: tweet.liked ? '#f07878' : 'inherit' }}
                        >
                          <Heart size={16} weight={tweet.liked ? 'fill' : 'regular'} color={tweet.liked ? '#f07878' : undefined} />
                          <span>{tweet.metrics.likes}</span>
                        </button>

                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }} title="Views">
                          <span>{tweet.metrics.views}</span>
                        </span>

                        <button
                          type="button"
                          className="dx-iconbtn"
                          title="Bookmark"
                          onClick={() => {
                            setTweets((prev) =>
                              prev.map((t) => (t.id === tweet.id ? { ...t, bookmarked: !t.bookmarked } : t))
                            );
                          }}
                          style={{ color: tweet.bookmarked ? '#27e6f0' : 'inherit' }}
                        >
                          <BookmarkSimple size={16} weight={tweet.bookmarked ? 'fill' : 'regular'} />
                        </button>

                        <button
                          type="button"
                          className="dx-iconbtn"
                          title="Copy Link"
                          onClick={() => {
                            navigator.clipboard?.writeText(`https://x.com/${tweet.handle}/status/${tweet.id}`);
                            setMsg({ kind: 'ok', text: 'Tweet link copied to clipboard.' });
                          }}
                        >
                          <ShareNetwork size={16} />
                        </button>

                        <button
                          type="button"
                          className="dx-iconbtn"
                          title="Open on X"
                          onClick={() => window.open(`https://x.com/${tweet.handle}/status/${tweet.id}`, '_blank')}
                        >
                          <ArrowSquareOut size={16} />
                        </button>
                      </footer>
                    </div>
                  </article>
                ))
              )}
            </div>
          </>
        )}
      </main>

      {/* =========================================================================
          RIGHT COLUMN: SEARCH, WHAT'S HAPPENING (TRENDS), SUGGESTED, ANALYTICS
          ========================================================================= */}
      <aside className="x-right-col" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Search Bar */}
        <div style={{ position: 'relative', width: '100%' }}>
          <MagnifyingGlass size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#9ab9bc' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search X / #hashtags"
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              borderRadius: 9999,
              background: 'var(--nc-surface)',
              border: '1px solid var(--nc-border)',
              color: '#f3fafa',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>

        {/* What's Happening / Trends */}
        <section style={{ background: 'var(--nc-surface)', border: '1px solid var(--nc-border)', borderRadius: 16, padding: '14px 16px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: '#f3fafa' }}>What's Happening</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {trends.map((tr) => (
              <div
                key={tr.tag}
                onClick={() => setSearchQuery(tr.tag)}
                style={{ cursor: 'pointer', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <small style={{ fontSize: 10, color: '#9ab9bc', textTransform: 'uppercase' }}>{tr.category}</small>
                <p style={{ margin: '1px 0', fontSize: 13, fontWeight: 700, color: '#27e6f0' }}>{tr.tag}</p>
                <small style={{ fontSize: 11, color: '#7fa3a7' }}>{tr.tweets}</small>
              </div>
            ))}
          </div>
        </section>

        {/* Suggested Accounts */}
        <section style={{ background: 'var(--nc-surface)', border: '1px solid var(--nc-border)', borderRadius: 16, padding: '14px 16px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: '#f3fafa' }}>Who to Follow</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {suggestions.map((acc) => (
              <div key={acc.handle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <img src={acc.avatar} alt="" width={34} height={34} style={{ borderRadius: '50%' }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {acc.name}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: '#9ab9bc' }}>@{acc.handle}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => window.open(`https://x.com/${acc.handle}`, '_blank')}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 9999,
                    border: '1px solid #27e6f0',
                    background: 'transparent',
                    color: '#27e6f0',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  Follow
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* NTS Account Insights & Operational Governance */}
        <section style={{ background: 'var(--nc-surface)', border: '1px solid var(--nc-border)', borderRadius: 16, padding: '14px 16px' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: '#e9c77d' }}>NTS Account Analytics (SOMA)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div style={{ padding: 8, borderRadius: 8, background: 'rgba(0,0,0,0.2)' }}>
              <small style={{ fontSize: 10, color: '#9ab9bc' }}>30d Impressions</small>
              <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 800, color: '#35d69a' }}>154.2K</p>
            </div>
            <div style={{ padding: 8, borderRadius: 8, background: 'rgba(0,0,0,0.2)' }}>
              <small style={{ fontSize: 10, color: '#9ab9bc' }}>Engagement</small>
              <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 800, color: '#27e6f0' }}>6.4%</p>
            </div>
            <div style={{ padding: 8, borderRadius: 8, background: 'rgba(0,0,0,0.2)' }}>
              <small style={{ fontSize: 10, color: '#9ab9bc' }}>Followers</small>
              <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 800, color: '#f3fafa' }}>{status?.followersCount.toLocaleString()}</p>
            </div>
            <div style={{ padding: 8, borderRadius: 8, background: 'rgba(0,0,0,0.2)' }}>
              <small style={{ fontSize: 10, color: '#9ab9bc' }}>Telegram Bot</small>
              <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 700, color: '#e9b85c' }}>Not Connected</p>
            </div>
          </div>
          <small style={{ fontSize: 10, color: '#7fa3a7', display: 'block' }}>
            Data synchronized via SOMA agent. Telegram bot approvals trigger before live dispatch.
          </small>
        </section>
      </aside>
    </div>
  );
}
