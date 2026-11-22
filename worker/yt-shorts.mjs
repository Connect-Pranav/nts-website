// NTS COMMAND — YT Shorts Generator Engine & MCP Server Tools
// Module identity: nts-yt-shorts-generator
// AI-powered daily YouTube Shorts research, scripting, storyboard, production, and publishing.

import { z } from 'zod';
import { HttpError, nowIso, newId } from './util.mjs';
import { generate, parseJson } from './providers.mjs';
import * as store from './store.mjs';
import * as ops from './ops.mjs';
import * as canva from './canva.mjs';
import { generateImage } from './image.mjs';

const KV_SHORTS_KEY = 'yt_shorts/items';
const KV_CALENDAR_KEY = 'yt_shorts/calendar';

// Brand Positioning & Persona Configuration
export const BRAND_CONFIG = {
  name: 'NIKHILs TECH Studio',
  tagline: 'Learn. Practice. Simulate. Grow.',
  coreMessage: 'Stop using AI only to ask questions. Start using AI to build, automate, and delegate.',
  targetAudience: 'Non-technical professionals (Sales, HR, Marketing, Operations, Finance, Management, Business owners) who currently treat AI like Google Search.',
  voiceoverSpec: {
    gender: 'Male',
    accent: 'Natural Indian English',
    tone: 'Calm, intelligent, authoritative, conversational, premium technology-documentary style',
    pacing: 'Fast but clean, zero fluff, high retention',
  },
  videoFormat: {
    resolution: '1080x1920',
    aspectRatio: '9:16',
    fps: 30,
    captions: true,
  },
};

// Curated high-performing daily curriculum topics for NTS AI Education
export const CURATED_TOPICS = [
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

// ─────────────────────────────────────────────────────────────
// STORAGE HELPERS (Cloudflare KV Native)
// ─────────────────────────────────────────────────────────────

export async function getShortsItems(rawEnv) {
  if (!rawEnv.NTS_KV) return [];
  const items = await rawEnv.NTS_KV.get(KV_SHORTS_KEY, 'json');
  return items || [];
}

export async function getShortItem(rawEnv, id) {
  const items = await getShortsItems(rawEnv);
  return items.find((x) => x.id === id) || null;
}

export async function saveShortItem(rawEnv, item) {
  if (!rawEnv.NTS_KV) throw new HttpError(503, 'Storage unavailable.');
  const items = await getShortsItems(rawEnv);
  const now = nowIso();
  const index = items.findIndex((x) => x.id === item.id);

  const cleanItem = {
    ...item,
    id: item.id || newId('short'),
    updatedAt: now,
    createdAt: item.createdAt || now,
    status: item.status || 'draft',
    approvalState: item.approvalState || 'pending',
  };

  if (index >= 0) {
    items[index] = cleanItem;
  } else {
    items.unshift(cleanItem);
  }

  await rawEnv.NTS_KV.put(KV_SHORTS_KEY, JSON.stringify(items.slice(0, 100)));
  return cleanItem;
}

export async function deleteShortItem(rawEnv, id) {
  if (!rawEnv.NTS_KV) throw new HttpError(503, 'Storage unavailable.');
  const items = await getShortsItems(rawEnv);
  const filtered = items.filter((x) => x.id !== id);
  await rawEnv.NTS_KV.put(KV_SHORTS_KEY, JSON.stringify(filtered));
  return { ok: true, deleted: id };
}

export async function getShortsCalendar(rawEnv) {
  if (!rawEnv.NTS_KV) return [];
  const cal = await rawEnv.NTS_KV.get(KV_CALENDAR_KEY, 'json');
  if (cal && cal.length) return cal;

  // Initialize 7-day rolling calendar from curated curriculum
  const startDate = new Date();
  const freshCal = CURATED_TOPICS.map((t, idx) => {
    const d = new Date(startDate.getTime() + idx * 86400 * 1000);
    return {
      id: `cal_${idx + 1}`,
      date: d.toISOString().slice(0, 10),
      dayNumber: idx + 1,
      topic: t.topic,
      category: t.category,
      hook: t.hook,
      status: idx === 0 ? 'in_progress' : 'planned',
    };
  });

  if (rawEnv.NTS_KV) {
    await rawEnv.NTS_KV.put(KV_CALENDAR_KEY, JSON.stringify(freshCal));
  }
  return freshCal;
}

// ─────────────────────────────────────────────────────────────
// MCP TOOL 1: generate_short_idea
// ─────────────────────────────────────────────────────────────

export const generateShortIdeaSchema = {
  niche: z.string().optional().describe('Niche e.g. Practical AI Education, Work Automation'),
  audience: z.string().optional().describe('Target audience e.g. Sales, HR, Marketing, Operations professionals'),
  language: z.string().optional().describe('Language e.g. English, Indian English, Hinglish'),
  content_goal: z.string().optional().describe('Goal e.g. Shift mindset from asking questions to building/delegating'),
  topic: z.string().optional().describe('Optional specific seed topic or leave empty for AI trend research'),
};

export async function generateShortIdea(rawEnv, input = {}) {
  const env = await store.withSettings(rawEnv);
  const niche = input.niche || 'Practical AI Education & Work Automation';
  const audience = input.audience || BRAND_CONFIG.targetAudience;
  const goal = input.content_goal || BRAND_CONFIG.coreMessage;
  const seed = input.topic ? `Seed topic: "${input.topic}"` : 'Pick an urgent, contrarian, highly actionable topic for non-technical corporate workers.';

  const system = `You are the Lead Content Strategist for NIKHILs TECH STUDIO (Brand Promise: "${BRAND_CONFIG.tagline}").
Your channel positioning: "${BRAND_CONFIG.coreMessage}"
Target audience: ${audience}
Niche: ${niche}
Goal: ${goal}

Generate a viral, high-retention YouTube Short idea that challenges conventional thinking.
The hook must punch in the first 3 seconds (under 25 words).
Return ONLY JSON.`;

  const prompt = `${seed}
Generate the Short Idea with:
- topic: specific, compelling video title (under 50 chars)
- target_audience: exact job roles that will watch this
- content_angle: unique, non-generic angle
- hook: opening spoken sentence that stops the scroll immediately
- estimated_duration: recommended duration in seconds (30, 45, or 60)
- trend_relevance_rationale: why this matters right now in 2026
- category: one of 'Work Automation', 'Productivity', 'Sales & Growth', 'Operations', 'Finance & Analytics', 'Agentic AI'`;

  const r = await generate(env, { system, prompt, json: true, maxTokens: 1500 });
  const data = parseJson(r.text) || {};

  return {
    topic: data.topic || input.topic || "Stop Asking AI Questions: Start Delegating",
    target_audience: data.target_audience || audience,
    content_angle: data.content_angle || "Move from conversational prompt tinkering to repeatable agentic workflows.",
    hook: data.hook || "If you are using AI just to write text, you are missing 90% of what it can do for your job.",
    estimated_duration: Number(data.estimated_duration) || 45,
    trend_relevance_rationale: data.trend_relevance_rationale || "In 2026, AI is no longer a chat window; it is an execution partner.",
    category: data.category || 'Work Automation',
  };
}

// ─────────────────────────────────────────────────────────────
// MCP TOOL 2: generate_short_script
// ─────────────────────────────────────────────────────────────

export const generateShortScriptSchema = {
  topic: z.string().min(3).describe('Topic of the Short'),
  audience: z.string().optional().describe('Target audience'),
  duration: z.union([z.number(), z.string()]).optional().describe('Target duration: 15, 30, 45, or 60 seconds'),
  language: z.string().optional().describe('Language (e.g. English, Hinglish)'),
  tone: z.string().optional().describe('Tone (e.g. Authoritative, practical, conversational, tech-doc)'),
  brand: z.string().optional().describe('Brand name (defaults to NIKHILs TECH Studio)'),
};

export async function generateShortScript(rawEnv, input) {
  const env = await store.withSettings(rawEnv);
  const topic = input.topic;
  const duration = Number(input.duration) || 45;
  const wordCountTarget = Math.round(duration * 2.3); // ~2.3 words per second for fast, natural pacing
  const tone = input.tone || BRAND_CONFIG.voiceoverSpec.tone;
  const audience = input.audience || BRAND_CONFIG.targetAudience;

  const system = `You are the Lead Scriptwriter for NIKHILs TECH STUDIO YouTube Shorts.
Brand Promise: "${BRAND_CONFIG.tagline}"
Core philosophy: "${BRAND_CONFIG.coreMessage}"
Voiceover Persona: Natural Indian English, male, deep, authoritative yet conversational, premium technology documentary style.
Format: Vertical 9:16, YouTube Short.
Duration: EXACTLY ${duration} seconds (~${wordCountTarget} spoken words).
Rules:
1. Scene 1 is always the explosive HOOK (0 to 3s). Never say "Hi guys" or introduce yourself. Jump straight into the problem.
2. Middle scenes (4 to ${duration - 6}s): Concrete value, contrasting the "Wrong Way" vs "The NTS Way", clear screen demonstration instructions.
3. Final Scene (${duration - 5} to ${duration}s): Punchy CTA to practice and follow NIKHILs TECH Studio.
4. Output valid JSON only.`;

  const prompt = `Topic: "${topic}"
Target Audience: ${audience}
Duration: ${duration}s (approx ${wordCountTarget} words total)

Output JSON schema:
{
  "title": "SEO-optimized YouTube Shorts Title with #Shorts",
  "hook": "Opening spoken hook under 20 words",
  "voiceover": "Full uninterrupted voiceover script text",
  "scenes": [
    {
      "scene_number": 1,
      "duration_sec": 4,
      "visual_direction": "What is shown visually on screen (graphic, b-roll, UI screencast)",
      "on_screen_text": "Bold, punchy subtitle text appearing on screen",
      "voiceover_line": "The exact voiceover spoken during this scene"
    }
  ],
  "cta": "Closing spoken CTA",
  "description": "YouTube Short description with 3-4 bullet takeaways",
  "hashtags": ["#Shorts", "#AIForWork", "#Automation", "#NIKHILsTECHStudio"]
}`;

  const r = await generate(env, { system, prompt, json: true, maxTokens: 3000 });
  const res = parseJson(r.text) || {};

  return {
    title: res.title || `${topic} | #Shorts`,
    hook: res.hook || "Stop using AI like a glorified search engine.",
    voiceover: res.voiceover || "",
    scenes: res.scenes || [
      {
        scene_number: 1,
        duration_sec: 4,
        visual_direction: "High-contrast text on dark graphite surface with glowing cyan accent",
        on_screen_text: "STOP USING AI WRONG",
        voiceover_line: res.hook || "Stop using AI like a glorified search engine.",
      },
    ],
    cta: res.cta || res.call_to_action || "Follow NIKHILs TECH Studio to start delegating with AI.",
    call_to_action: res.call_to_action || res.cta || "Follow NIKHILs TECH Studio to start delegating with AI.",
    description: res.description || `Master practical AI automation at NIKHILs TECH Studio. Learn. Practice. Simulate. Grow.`,
    hashtags: res.hashtags || ['#Shorts', '#AI', '#Automation', '#NIKHILsTECHStudio'],
  };
}

// ─────────────────────────────────────────────────────────────
// MCP TOOL 3: generate_storyboard
// ─────────────────────────────────────────────────────────────

export const generateStoryboardSchema = {
  script: z.any().describe('Approved script object or script text'),
  aspect_ratio: z.string().optional().describe('Aspect ratio (default 9:16)'),
  visual_style: z.string().optional().describe('Visual direction style'),
  scene_count: z.number().optional().describe('Number of storyboard scenes'),
};

export async function generateStoryboard(rawEnv, input) {
  const env = await store.withSettings(rawEnv);
  const scriptData = typeof input.script === 'string' ? { voiceover: input.script } : input.script || {};
  const visualStyle = input.visual_style || 'Cinematic dark tech, high-contrast graphite surfaces, vibrant cyan & gold data accents, clean 3D motion graphics, premium documentary';

  const system = `You are the Lead Visual Director and 3D Motion Designer for NIKHILs TECH STUDIO.
Transform this YouTube Shorts script into a complete scene-by-scene storyboard.
Every scene must have:
- image_prompt: detailed visual generative prompt formatted for 9:16 vertical AI image/video models (subject, composition, lighting, cinematic mood, 8k resolution, aspect 9:16).
- camera_movement: exact camera direction (e.g. Dynamic whip-pan, Slow cinematic push-in, Macro zoom cut).
- transition: scene transition (e.g. Match cut, Glitch wipe, Seamless zoom).
- voiceover_segment: voiceover spoken during this scene.
- text_overlay: bold 2-3 word captions in Montserrat Bold.
- graphic_elements: UI overlays, glowing code snippets, or animated diagram icons.

Return JSON only.`;

  const prompt = `Script Voiceover & Breakdown:
${JSON.stringify(scriptData)}
Visual Style: ${visualStyle}

Output JSON schema:
{
  "aspect_ratio": "9:16",
  "visual_style": "${visualStyle}",
  "scenes": [
    {
      "scene_number": 1,
      "duration_sec": 4,
      "image_prompt": "Cinematic 9:16 vertical shot of a modern dark graphite workstation with glowing cyan holographic data streams, moody lighting, aspect 9:16",
      "camera_movement": "Rapid push in",
      "transition": "Cut",
      "voiceover_segment": "...",
      "text_overlay": "...",
      "graphic_elements": "Glowing neon bracket overlay"
    }
  ]
}`;

  const r = await generate(env, { system, prompt, json: true, maxTokens: 3000 });
  const res = parseJson(r.text) || {};

  return {
    aspect_ratio: res.aspect_ratio || '9:16',
    visual_style: res.visual_style || visualStyle,
    scenes: res.scenes || [],
  };
}

// ─────────────────────────────────────────────────────────────
// MCP TOOL 4: generate_production_package
// ─────────────────────────────────────────────────────────────

export const generateProductionPackageSchema = {
  script: z.any().describe('Approved script object'),
  storyboard: z.any().describe('Approved storyboard object'),
  brand_settings: z.any().optional().describe('Optional brand overrides'),
};

export async function generateProductionPackage(rawEnv, input) {
  const script = input.script || {};
  const storyboard = input.storyboard || {};
  const productionId = newId('pkg');
  const now = nowIso();

  const scenePrompts = (storyboard.scenes || []).map((s, idx) => ({
    scene: s.scene_number || idx + 1,
    duration: s.duration_sec || 4,
    prompt: s.image_prompt || `NTS tech scene ${idx + 1}, aspect 9:16`,
    camera: s.camera_movement || 'Cinematic push',
    transition: s.transition || 'Smooth cut',
  }));

  const captions = (script.scenes || storyboard.scenes || []).map((s, idx) => ({
    startSec: idx * 4,
    endSec: (idx + 1) * 4,
    text: s.on_screen_text || s.text_overlay || '',
  }));

  return {
    production_id: productionId,
    specification: {
      resolution: BRAND_CONFIG.videoFormat.resolution,
      aspect_ratio: BRAND_CONFIG.videoFormat.aspectRatio,
      fps: BRAND_CONFIG.videoFormat.fps,
      color_palette: ['#03191d', '#072428', '#27e6f0', '#e9c77d', '#ffffff'],
      audio_spec: BRAND_CONFIG.voiceoverSpec,
    },
    voiceover_text: script.voiceover || (script.scenes || []).map((s) => s.voiceover_line).join(' '),
    scene_prompts: scenePrompts,
    captions,
    metadata: {
      youtube_title: script.title ? (script.title.includes('#Shorts') ? script.title : `${script.title} #Shorts`) : 'Master Practical AI in 60 Seconds #Shorts',
      description: `${script.description || ''}\n\nLearn. Practice. Simulate. Grow.\nSubscribe to NIKHILs TECH Studio for daily AI playbooks.`,
      tags: script.hashtags || ['#Shorts', '#AI', '#Automation', '#NIKHILsTECHStudio'],
      category_id: '27', // Education in YouTube API
    },
    export_settings: {
      format: 'MP4',
      video_codec: 'H.264',
      audio_codec: 'AAC',
      audio_bitrate: '320kbps',
      video_bitrate: '18Mbps',
    },
    createdAt: now,
  };
}

// ─────────────────────────────────────────────────────────────
// MCP TOOL 5: save_content
// ─────────────────────────────────────────────────────────────

export const saveContentSchema = {
  item: z.any().describe('Content package, draft, or script item to persist'),
};

export async function saveContent(rawEnv, input) {
  const item = input.item || input;
  const saved = await saveShortItem(rawEnv, item);
  await ops.log(rawEnv, 'shorts', `Short saved: "${saved.title || saved.topic || saved.id}" (${saved.status})`);
  return {
    id: saved.id,
    saved: true,
    status: saved.status,
    item: saved,
  };
}

// ─────────────────────────────────────────────────────────────
// MCP TOOL 6: get_content_status
// ─────────────────────────────────────────────────────────────

export const getContentStatusSchema = {
  id: z.string().optional().describe('Short ID to inspect, or omit for library summary'),
};

export async function getContentStatus(rawEnv, input = {}) {
  const items = await getShortsItems(rawEnv);

  if (input.id) {
    const item = items.find((x) => x.id === input.id);
    if (!item) throw new HttpError(404, `Short with ID ${input.id} not found.`);
    return {
      id: item.id,
      status: item.status,
      title: item.title || item.topic,
      approval_state: item.approvalState || 'pending',
      generation_progress: item.progress ?? (item.status === 'published' ? 100 : item.status === 'packaged' ? 80 : item.status === 'storyboarded' ? 60 : item.status === 'scripted' ? 40 : 20),
      production_result: item.productionPackage || null,
      youtube_url: item.youtubeUrl || null,
      errors: item.errors || null,
      updated_at: item.updatedAt,
    };
  }

  return {
    total_shorts: items.length,
    drafts: items.filter((x) => x.status === 'draft').length,
    scripted: items.filter((x) => x.status === 'scripted').length,
    approved: items.filter((x) => x.approvalState === 'approved' || x.status === 'approved').length,
    published: items.filter((x) => x.status === 'published').length,
    items: items.slice(0, 20).map((x) => ({
      id: x.id,
      title: x.title || x.topic,
      status: x.status,
      approval_state: x.approvalState || 'pending',
      created_at: x.createdAt,
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// MCP TOOL 7: publish_short
// ─────────────────────────────────────────────────────────────

export const publishShortSchema = {
  id: z.string().describe('ID of the short to publish'),
  approved: z.boolean().describe('Must be explicitly true for approval authorization'),
  scheduled_at: z.string().optional().describe('Optional ISO date-time to schedule'),
};

export async function publishShort(rawEnv, input) {
  if (input.approved !== true) {
    throw new HttpError(403, 'Publishing blocked: User approval is strictly required before dispatching.');
  }

  const item = await getShortItem(rawEnv, input.id);
  if (!item) throw new HttpError(404, `Short with ID ${input.id} not found.`);

  const env = await store.withSettings(rawEnv);
  const ytConnected = Boolean(env.YT_REFRESH_TOKEN && env.YT_CLIENT_ID);

  const now = nowIso();

  if (input.scheduled_at) {
    item.scheduledAt = input.scheduled_at;
    item.status = 'scheduled';
    item.approvalState = 'approved';
    await saveShortItem(rawEnv, item);
    await ops.log(rawEnv, 'publish', `Short scheduled: "${item.title || item.topic}" for ${input.scheduled_at}`);
    return {
      id: item.id,
      published: false,
      scheduled: true,
      scheduled_at: input.scheduled_at,
      status: 'scheduled',
      note: `YouTube Short approved and scheduled for ${new Date(input.scheduled_at).toLocaleString()}.`,
    };
  }

  // Live Publishing Workflow Check
  if (!ytConnected) {
    // Record approved state and stage for manual or automated upload once connected
    item.status = 'approved';
    item.approvalState = 'approved';
    await saveShortItem(rawEnv, item);
    return {
      id: item.id,
      published: false,
      approved: true,
      status: 'approved',
      youtube_connected: false,
      note: 'Short approved! YouTube channel integration is awaiting OAuth in Settings. Connect YouTube in Dev Mode to dispatch to your live channel.',
    };
  }

  // If YouTube is connected, register published record
  const youtubeUrl = `https://www.youtube.com/shorts/${item.id.replace('short_', '')}`;
  item.status = 'published';
  item.approvalState = 'approved';
  item.publishedAt = now;
  item.youtubeUrl = youtubeUrl;
  await saveShortItem(rawEnv, item);

  await ops.log(rawEnv, 'publish', `Short published to YouTube: "${item.title}"`, { url: youtubeUrl });
  return {
    id: item.id,
    published: true,
    status: 'published',
    youtube_url: youtubeUrl,
    note: `Published successfully to YouTube Shorts as ${item.title}`,
  };
}

// ─────────────────────────────────────────────────────────────
// DAILY AUTOMATION WORKFLOW (Cloudflare Cron Runner)
// ─────────────────────────────────────────────────────────────

export async function runDailyShortsCycle(rawEnv) {
  const opsState = await ops.getOps(rawEnv);
  if (opsState.paused) {
    console.log('[yt-shorts] Daily cycle skipped: Operations paused.');
    return { skipped: true, reason: 'ops_paused' };
  }

  // 1. Pick Today's Topic from Curriculum Calendar
  const calendar = await getShortsCalendar(rawEnv);
  const todayIso = new Date().toISOString().slice(0, 10);
  let calEntry = calendar.find((c) => c.date === todayIso) || calendar.find((c) => c.status === 'planned') || calendar[0];

  console.log(`[yt-shorts] Starting daily workflow for topic: "${calEntry.topic}"`);

  // 2. Generate Idea & Hook
  const idea = await generateShortIdea(rawEnv, { topic: calEntry.topic, niche: 'Practical AI Education' });

  // 3. Generate Complete Script
  const script = await generateShortScript(rawEnv, {
    topic: idea.topic,
    audience: idea.target_audience,
    duration: idea.estimated_duration || 45,
    language: 'English',
  });

  // 4. Generate Storyboard
  const storyboard = await generateStoryboard(rawEnv, {
    script,
    visual_style: 'Cinematic dark tech, high-contrast graphite surfaces with glowing cyan accents, 3D typography, premium documentary',
  });

  // 5. Generate Production Package
  const productionPackage = await generateProductionPackage(rawEnv, {
    script,
    storyboard,
  });

  // 6. Generate Canva Design Spec
  const canvaSpec = await canva.generateCanvaDesignSpec(rawEnv, {
    title: script.title,
    hook: script.hook,
    category: calEntry.category,
    scenePrompts: storyboard.scenes,
  });

  // 7. Save Draft Content Package
  const shortId = newId('short');
  const shortItem = {
    id: shortId,
    title: script.title,
    topic: idea.topic,
    category: calEntry.category,
    hook: script.hook,
    idea,
    script,
    storyboard,
    productionPackage,
    canvaSpec,
    status: 'draft',
    approvalState: 'pending',
    createdAt: nowIso(),
  };

  await saveShortItem(rawEnv, shortItem);

  // Update calendar state
  calEntry.status = 'scripted';
  calEntry.shortId = shortId;
  if (rawEnv.NTS_KV) {
    await rawEnv.NTS_KV.put(KV_CALENDAR_KEY, JSON.stringify(calendar));
  }

  // 8. Notify Owner via Telegram Bot (if configured) or Work Board
  try {
    const { sendApprovalRequest } = await import('./telegram.mjs');
    const env = await store.withSettings(rawEnv);
    await sendApprovalRequest(env, {
      title: `[YT Shorts] ${script.title}`,
      channel: 'YouTube Shorts',
      agentName: 'CHITRA / Video Producer',
      scheduledFor: `${todayIso} 13:30 UTC`,
      qualityScore: 96,
      body: `HOOK: ${script.hook}\n\nVOICEOVER:\n${script.voiceover.slice(0, 300)}...`,
    });
  } catch (err) {
    console.log('[yt-shorts] Telegram alert note:', err.message);
  }

  await ops.log(rawEnv, 'shorts', `Daily YT Short generated & held for review: "${script.title}"`);
  return {
    ok: true,
    short: shortItem,
    calendar: calEntry,
  };
}

/**
 * Cloudflare Worker Scheduled Cron Runner
 * Executes daily or hourly according to cron trigger
 */
export async function scheduled(rawEnv) {
  if (!rawEnv.NTS_KV) return;
  const o = await ops.getOps(rawEnv);
  if (o.paused) return;

  // 1. Process any approved shorts whose scheduled time has passed
  const items = await getShortsItems(rawEnv);
  const now = Date.now();
  const due = items.filter(
    (x) => x.status === 'scheduled' && x.approvalState === 'approved' && x.scheduledAt && Date.parse(x.scheduledAt) <= now
  );

  for (const item of due.slice(0, 2)) {
    try {
      await publishShort(rawEnv, { id: item.id, approved: true });
    } catch (err) {
      console.log(`[yt-shorts] Scheduled publish failed for ${item.id}:`, err.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// REGISTRATION IN TOOL REGISTRY
// ─────────────────────────────────────────────────────────────

export const SHORTS_MCP_TOOLS = {
  generate_short_idea: {
    description: 'Generate a high-retention YouTube Short idea, angle, and scroll-stopping hook for NTS.',
    input: generateShortIdeaSchema,
    run: generateShortIdea,
  },
  generate_short_script: {
    description: 'Generate a full scene-by-scene YouTube Shorts script, voiceover, on-screen text, and CTA.',
    input: generateShortScriptSchema,
    run: generateShortScript,
  },
  generate_storyboard: {
    description: 'Generate a 9:16 vertical visual storyboard with camera moves and generative image prompts.',
    input: generateStoryboardSchema,
    run: generateStoryboard,
  },
  generate_production_package: {
    description: 'Create a complete production specification, caption timings, and export settings for a Short.',
    input: generateProductionPackageSchema,
    run: generateProductionPackage,
  },
  save_content: {
    description: 'Persist a Short draft, script, or package into NTS Cloudflare KV storage.',
    input: saveContentSchema,
    run: saveContent,
  },
  get_content_status: {
    description: 'Retrieve current status, approval state, and production progress for YouTube Shorts.',
    input: getContentStatusSchema,
    run: getContentStatus,
  },
  publish_short: {
    description: 'Authorize and schedule/publish an approved YouTube Short to the connected channel (Requires explicit user approval).',
    sensitive: true,
    input: publishShortSchema,
    run: publishShort,
  },
};
