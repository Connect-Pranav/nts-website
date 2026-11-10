// LinkedIn Quiz Studio — NTS COMMAND V2.0
// 30 Days of Practical SQL & Business Analytics Challenges
// Integrates with KV work board, Cloudflare D1, and hourly cron.
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowSquareOut,
  CalendarBlank,
  CheckCircle,
  CircleNotch,
  Copy,
  LinkedinLogo,
  PencilSimpleLine,
  ShieldCheck,
  Sparkle,
  XCircle,
} from '@phosphor-icons/react';
import { ago, Card, Empty, Pill, toneOf, when, type Api } from './shared';

export type QuizPost = {
  id: string;
  campaign_id: string;
  day_number: number;
  scheduled_at: string;
  topic: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  hook: string;
  scenario: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  post_content: string;
  answer_comment: string;
  hashtags: string;
  quality_score: number;
  approval_status: 'pending' | 'approved' | 'rejected';
  publishing_status: 'scheduled' | 'published' | 'failed' | 'skipped';
  linkedin_post_id: string | null;
  linkedin_post_url: string | null;
  work_item_id: string | null;
  created_at: string;
  updated_at: string;
};

export type QuizComment = {
  id: string;
  post_id: string;
  comment_content: string;
  scheduled_at: string;
  status: 'pending' | 'action_required' | 'published' | 'skipped';
  linkedin_comment_id: string | null;
  published_at: string | null;
  error_message: string | null;
};

export type CampaignStats = {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  published: number;
  failed: number;
  scheduled: number;
  pendingComments: number;
};

export type CampaignData = {
  campaign: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    timezone: string;
    publishing_time: string;
    comment_delay_hours: number;
    status: string;
    mode: 'approval' | 'autonomous';
    created_at: string;
  };
  posts: QuizPost[];
  comments: QuizComment[];
  stats: CampaignStats;
};

export function QuizStudio({ api }: { api: Api }) {
  const [data, setData] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string>('');
  const [selectedPost, setSelectedPost] = useState<QuizPost | null>(null);
  const [editPostContent, setEditPostContent] = useState('');
  const [editAnswerComment, setEditAnswerComment] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'published' | 'comments'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr('');
    try {
      // Fetch active campaigns or initialize default
      const res = await api<{ campaign: CampaignData['campaign']; posts: QuizPost[]; comments: QuizComment[]; stats: CampaignStats }>('/api/dev/quiz/campaign/init', { method: 'POST' });
      setData(res);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (postId: string) => {
    setBusy(`app-${postId}`);
    setErr('');
    try {
      await api(`/api/dev/quiz/post/${postId}/approve`, { method: 'POST' });
      await load();
      if (selectedPost?.id === postId) {
        setSelectedPost((prev) => (prev ? { ...prev, approval_status: 'approved' } : null));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const reject = async (postId: string) => {
    setBusy(`rej-${postId}`);
    setErr('');
    try {
      await api(`/api/dev/quiz/post/${postId}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'Rejected from Studio' }) });
      await load();
      if (selectedPost?.id === postId) {
        setSelectedPost((prev) => (prev ? { ...prev, approval_status: 'rejected', publishing_status: 'skipped' } : null));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const approveAll = async () => {
    if (!data?.campaign?.id) return;
    setBusy('approve-all');
    setErr('');
    try {
      await api(`/api/dev/quiz/campaign/${data.campaign.id}/approve-all`, { method: 'POST' });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const syncPublish = async () => {
    setBusy('sync');
    setErr('');
    try {
      await api('/api/dev/quiz/sync', { method: 'POST' });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const savePostEdit = async () => {
    if (!selectedPost) return;
    setBusy(`save-${selectedPost.id}`);
    setErr('');
    try {
      const updated = await api<QuizPost>(`/api/dev/quiz/post/${selectedPost.id}`, {
        method: 'POST',
        body: JSON.stringify({
          post_content: editPostContent,
          answer_comment: editAnswerComment,
        }),
      });
      setSelectedPost(updated);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const markCommentDone = async (commentId: string) => {
    setBusy(`cmt-${commentId}`);
    setErr('');
    try {
      await api(`/api/dev/quiz/comment/${commentId}/posted`, { method: 'POST' });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const openEditor = (p: QuizPost) => {
    setSelectedPost(p);
    setEditPostContent(p.post_content);
    setEditAnswerComment(p.answer_comment);
  };

  const posts = data?.posts || [];
  const comments = data?.comments || [];
  const stats = data?.stats;

  const filteredPosts = posts.filter((p) => {
    if (filter === 'pending') return p.approval_status === 'pending';
    if (filter === 'approved') return p.approval_status === 'approved' && p.publishing_status !== 'published';
    if (filter === 'published') return p.publishing_status === 'published';
    return true;
  });

  const actionRequiredComments = comments.filter((c) => c.status === 'action_required' || (c.status === 'pending' && Date.parse(c.scheduled_at) <= Date.now()));

  return (
    <div className="pg">
      {/* ─── Campaign Header & V2.0 Status ─── */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>30 Days of Practical SQL & Business Analytics</span>
            <Pill tone="live">V2.0 COMMAND</Pill>
          </div>
        }
        icon={<LinkedinLogo size={22} />}
        action={
          <div className="dx-row" style={{ gap: 8 }}>
            <button type="button" className="dx-btn" onClick={syncPublish} disabled={busy === 'sync'}>
              {busy === 'sync' ? <CircleNotch className="spin" size={14} /> : <Sparkle size={14} />}
              Sync Cron
            </button>
            <button
              type="button"
              className="dx-btn dx-btn--primary"
              onClick={approveAll}
              disabled={busy === 'approve-all' || !stats?.pending}
            >
              {busy === 'approve-all' ? <CircleNotch className="spin" size={14} /> : <ShieldCheck size={14} />}
              Approve All Validated ({stats?.pending ?? 0})
            </button>
          </div>
        }
      >
        <p className="ov-muted" style={{ marginBottom: 16 }}>
          Automated educational campaign publishing daily at <strong>01:30 PM IST (08:00 UTC)</strong>, replacing the AI-news slot. Each quiz tests real-world business scenarios extracted from the NTS curriculum. Quality scores pre-validated at ≥90/100.
        </p>

        {/* ─── KPI Metric Cards ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="dx-mono dx-dim" style={{ fontSize: 11 }}>TOTAL CAMPAIGN</span>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{stats?.total ?? 30} Days</div>
            <span className="ov-muted" style={{ fontSize: 12 }}>Nov 11 – Dec 10</span>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="dx-mono dx-dim" style={{ fontSize: 11 }}>PENDING REVIEW</span>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: stats?.pending ? 'var(--warn, #f59e0b)' : 'inherit' }}>
              {stats?.pending ?? 0}
            </div>
            <span className="ov-muted" style={{ fontSize: 12 }}>Approval required</span>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="dx-mono dx-dim" style={{ fontSize: 11 }}>APPROVED READY</span>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: 'var(--ok, #10b981)' }}>
              {stats?.approved ?? 0}
            </div>
            <span className="ov-muted" style={{ fontSize: 12 }}>KV cron active</span>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="dx-mono dx-dim" style={{ fontSize: 11 }}>PUBLISHED</span>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#38bdf8' }}>
              {stats?.published ?? 0}
            </div>
            <span className="ov-muted" style={{ fontSize: 12 }}>Live on LinkedIn</span>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="dx-mono dx-dim" style={{ fontSize: 11 }}>AVG QUALITY</span>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>95/100</div>
            <span className="ov-muted" style={{ fontSize: 12 }}>Min threshold 90</span>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="dx-mono dx-dim" style={{ fontSize: 11 }}>COMMENTS DUE</span>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: actionRequiredComments.length ? 'var(--warn, #f59e0b)' : 'inherit' }}>
              {actionRequiredComments.length}
            </div>
            <span className="ov-muted" style={{ fontSize: 12 }}>Manual reveal queue</span>
          </div>
        </div>

        {err && (
          <p className="dx-err" style={{ marginTop: 14 }}>
            {err}
          </p>
        )}
      </Card>

      {/* ─── Navigation Tabs ─── */}
      <div className="dx-row" style={{ gap: 8, margin: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
        <button
          type="button"
          className={`dx-btn ${filter === 'all' ? 'dx-btn--primary' : ''}`}
          onClick={() => setFilter('all')}
        >
          All 30 Days ({posts.length})
        </button>
        <button
          type="button"
          className={`dx-btn ${filter === 'pending' ? 'dx-btn--primary' : ''}`}
          onClick={() => setFilter('pending')}
        >
          Pending Review ({stats?.pending ?? 0})
        </button>
        <button
          type="button"
          className={`dx-btn ${filter === 'approved' ? 'dx-btn--primary' : ''}`}
          onClick={() => setFilter('approved')}
        >
          Approved / Scheduled ({stats?.approved ?? 0})
        </button>
        <button
          type="button"
          className={`dx-btn ${filter === 'published' ? 'dx-btn--primary' : ''}`}
          onClick={() => setFilter('published')}
        >
          Published ({stats?.published ?? 0})
        </button>
        <button
          type="button"
          className={`dx-btn ${filter === 'comments' ? 'dx-btn--primary' : ''}`}
          onClick={() => setFilter('comments')}
        >
          Answer Comments Queue ({comments.length})
          {actionRequiredComments.length > 0 && (
            <span style={{ marginLeft: 6, background: '#f59e0b', color: '#000', borderRadius: '50%', padding: '2px 6px', fontSize: 11, fontWeight: 700 }}>
              {actionRequiredComments.length}
            </span>
          )}
        </button>
      </div>

      {loading && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 }}>
            <CircleNotch className="spin" size={24} />
            <span>Loading 30-Day LinkedIn Campaign...</span>
          </div>
        </Card>
      )}

      {/* ─── Answer Comments Manual Queue ─── */}
      {filter === 'comments' && (
        <Card
          title="Answer Reveal Comments (Manual Queue)"
          icon={<CalendarBlank size={20} />}
          action={<Pill tone="warn">ACTION REQUIRED</Pill>}
        >
          <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '12px 16px', borderRadius: 6, marginBottom: 16 }}>
            <strong style={{ color: '#fbbf24' }}>Notice on LinkedIn API Constraints:</strong>
            <p className="ov-muted" style={{ margin: '4px 0 0 0', fontSize: 13 }}>
              LinkedIn self-serve API permissions (<code>w_member_social</code>) support automated post creation, but <strong>do not allow automated comment publishing</strong> (restricted to approved enterprise partners). To maintain audience trust, answer reveals are scheduled 24 hours after each post. Copy the solution below and paste it as the first comment on the live post.
            </p>
          </div>

          {comments.length === 0 ? (
            <Empty>No comments registered yet.</Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {comments.map((c) => {
                const parentPost = posts.find((p) => p.id === c.post_id);
                const isDue = Date.parse(c.scheduled_at) <= Date.now() && c.status !== 'published';
                return (
                  <div
                    key={c.id}
                    style={{
                      background: isDue ? 'rgba(245, 158, 11, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                      border: isDue ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: 8,
                      padding: 14,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="dx-mono" style={{ fontWeight: 700, color: 'var(--brand, #38bdf8)' }}>
                          Day {parentPost?.day_number ?? '?'}: {parentPost?.topic ?? 'SQL Challenge'}
                        </span>
                        <Pill tone={c.status === 'published' ? 'ok' : isDue ? 'warn' : 'idle'}>
                          {c.status === 'published' ? 'Published' : isDue ? 'ACTION REQUIRED' : 'Scheduled'}
                        </Pill>
                      </div>
                      <span className="ov-muted" style={{ fontSize: 12 }}>
                        Reveal due: {when(c.scheduled_at)} ({ago(c.scheduled_at)})
                      </span>
                    </div>

                    <pre
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        padding: 10,
                        borderRadius: 6,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        fontSize: 12,
                        maxHeight: 140,
                        overflowY: 'auto',
                      }}
                    >
                      {c.comment_content}
                    </pre>

                    <div className="dx-row" style={{ marginTop: 10, justifyContent: 'flex-end', gap: 8 }}>
                      <button
                        type="button"
                        className="dx-btn"
                        onClick={() => copyToClipboard(c.comment_content, c.id)}
                      >
                        <Copy size={14} />
                        {copiedId === c.id ? 'Copied to Clipboard!' : 'Copy Answer Comment'}
                      </button>

                      {parentPost?.linkedin_post_url && (
                        <a
                          href={parentPost.linkedin_post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="dx-btn"
                          style={{ textDecoration: 'none' }}
                        >
                          <ArrowSquareOut size={14} /> Open Live Post
                        </a>
                      )}

                      {c.status !== 'published' && (
                        <button
                          type="button"
                          className="dx-btn dx-btn--primary"
                          onClick={() => markCommentDone(c.id)}
                          disabled={busy === `cmt-${c.id}`}
                        >
                          <CheckCircle size={14} /> Mark as Posted
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ─── 30-Day Posts Table ─── */}
      {filter !== 'comments' && (
        <Card title={`Campaign Calendar (${filteredPosts.length} posts)`} icon={<CalendarBlank size={20} />}>
          {filteredPosts.length === 0 ? (
            <Empty>No posts match the selected filter.</Empty>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                    <th style={{ padding: '10px 8px' }}>Day</th>
                    <th style={{ padding: '10px 8px' }}>Publish Time (IST)</th>
                    <th style={{ padding: '10px 8px' }}>Topic & Concept</th>
                    <th style={{ padding: '10px 8px' }}>Difficulty</th>
                    <th style={{ padding: '10px 8px' }}>Quality</th>
                    <th style={{ padding: '10px 8px' }}>Approval</th>
                    <th style={{ padding: '10px 8px' }}>Status</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.map((p) => {
                    const isPending = p.approval_status === 'pending';
                    const isPublished = p.publishing_status === 'published';
                    return (
                      <tr
                        key={p.id}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          background: selectedPost?.id === p.id ? 'rgba(56, 189, 248, 0.05)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '10px 8px', fontWeight: 700 }}>
                          Day {p.day_number}
                        </td>
                        <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }} className="ov-muted">
                          {p.scheduled_at.slice(0, 10)} · 01:30 PM
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ fontWeight: 600 }}>{p.topic}</div>
                          <div className="ov-muted" style={{ fontSize: 11, marginTop: 2, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.hook}
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <Pill tone={p.difficulty === 'Beginner' ? 'idle' : p.difficulty === 'Intermediate' ? 'warn' : 'live'}>
                            {p.difficulty}
                          </Pill>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <Pill tone="ok">{p.quality_score}/100</Pill>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <Pill tone={toneOf(p.approval_status)}>{p.approval_status}</Pill>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <Pill tone={toneOf(p.publishing_status)}>{p.publishing_status}</Pill>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              type="button"
                              className="dx-btn"
                              style={{ padding: '4px 8px', fontSize: 12 }}
                              onClick={() => openEditor(p)}
                            >
                              <PencilSimpleLine size={13} /> Review
                            </button>

                            {isPending && (
                              <button
                                type="button"
                                className="dx-btn dx-btn--primary"
                                style={{ padding: '4px 8px', fontSize: 12 }}
                                onClick={() => approve(p.id)}
                                disabled={busy === `app-${p.id}`}
                              >
                                {busy === `app-${p.id}` ? <CircleNotch className="spin" size={13} /> : <CheckCircle size={13} />} Approve
                              </button>
                            )}

                            {isPending && (
                              <button
                                type="button"
                                className="dx-btn"
                                style={{ padding: '4px 8px', fontSize: 12, color: 'var(--bad, #ef4444)' }}
                                onClick={() => reject(p.id)}
                                disabled={busy === `rej-${p.id}`}
                              >
                                <XCircle size={13} />
                              </button>
                            )}

                            {isPublished && p.linkedin_post_url && (
                              <a
                                href={p.linkedin_post_url}
                                target="_blank"
                                rel="noreferrer"
                                className="dx-btn"
                                style={{ padding: '4px 8px', fontSize: 12, textDecoration: 'none' }}
                              >
                                <ArrowSquareOut size={13} />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ─── Post Review & Editor Drawer / Modal ─── */}
      {selectedPost && (
        <div
          className="dx-drawer"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setSelectedPost(null)}
        >
          <div className="dx-drawer__panel" style={{ maxWidth: 640 }}>
            <header className="dx-drawer__head">
              <div>
                <p className="dx-mono dx-dim">
                  Day {selectedPost.day_number} of 30 · {selectedPost.difficulty} · Quality: {selectedPost.quality_score}/100
                </p>
                <h2>{selectedPost.topic}</h2>
              </div>
              <button type="button" className="dx-iconbtn" onClick={() => setSelectedPost(null)} aria-label="Close">
                ✕
              </button>
            </header>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Pill tone={toneOf(selectedPost.approval_status)}>Approval: {selectedPost.approval_status}</Pill>
              <Pill tone={toneOf(selectedPost.publishing_status)}>Publishing: {selectedPost.publishing_status}</Pill>
              <span className="ov-muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                Slot: {selectedPost.scheduled_at.slice(0, 10)} @ 01:30 PM IST
              </span>
            </div>

            <label className="dx-label">LinkedIn Post Text (Includes Question & 4 Options)</label>
            <textarea
              className="dx-input"
              rows={12}
              value={editPostContent}
              onChange={(e) => setEditPostContent(e.target.value)}
              style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5 }}
            />

            <label className="dx-label" style={{ marginTop: 12 }}>
              Answer Reveal Comment (Posted 24h later)
            </label>
            <textarea
              className="dx-input"
              rows={8}
              value={editAnswerComment}
              onChange={(e) => setEditAnswerComment(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.4 }}
            />

            <div className="dx-row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
              <button
                type="button"
                className="dx-btn"
                onClick={savePostEdit}
                disabled={busy === `save-${selectedPost.id}`}
              >
                {busy === `save-${selectedPost.id}` ? <CircleNotch className="spin" size={14} /> : 'Save Changes'}
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                {selectedPost.approval_status === 'pending' && (
                  <button
                    type="button"
                    className="dx-btn dx-btn--primary"
                    onClick={() => approve(selectedPost.id)}
                    disabled={busy === `app-${selectedPost.id}`}
                  >
                    <CheckCircle size={14} /> Approve Post
                  </button>
                )}
                {selectedPost.approval_status === 'pending' && (
                  <button
                    type="button"
                    className="dx-btn"
                    onClick={() => reject(selectedPost.id)}
                    disabled={busy === `rej-${selectedPost.id}`}
                  >
                    <XCircle size={14} /> Reject
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
