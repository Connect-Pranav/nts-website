import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.mjs';
import * as ytShorts from '../yt-shorts.mjs';
import * as canva from '../canva.mjs';
import { parseJson } from '../providers.mjs';

function makeKV() {
  const m = new Map();
  return {
    m,
    get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    put: async (k, v) => void m.set(k, typeof v === 'string' ? v : JSON.stringify(v)),
    delete: async (k) => void m.delete(k),
  };
}

const TOKEN = 'Nts@2026';
const baseEnv = (extra = {}) => ({
  DEV_TOKEN: TOKEN,
  GEMINI_API_KEY: 'AQ.TESTKEY1234567890abcdefghijklmnop',
  NTS_KV: makeKV(),
  ASSETS: { fetch: () => new Response('ok') },
  ...extra,
});

const req = (path, method = 'GET', b) =>
  new Request(`https://nts.test${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'cf-connecting-ip': '1.1.1.1' },
    body: b ? JSON.stringify(b) : undefined,
  });

function withMockFetch(mockHandler, fn) {
  return async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = mockHandler;
    try {
      await fn();
    } finally {
      globalThis.fetch = orig;
    }
  };
}

test(
  'YT Shorts: generate_short_idea generates high-retention idea & hook',
  withMockFetch(
    async (url, init) => {
      const out = {
        topic: "You're Using Claude Code Wrong",
        hook: "If you're using Claude Code just to ask questions, you're using a Ferrari to go grocery shopping.",
        angle: 'Stop chatting with code models. Let them build full file systems.',
        target_audience: 'Non-technical professionals, managers, business owners',
        learning_outcome: 'Build and run full workflows in terminal with AI',
        estimated_duration: 45,
        visual_concept: 'High-contrast terminal typing commands autonomously',
        category: 'Work Automation',
      };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }), { status: 200 });
    },
    async () => {
      const env = baseEnv();
      const idea = await ytShorts.generateShortIdea(env, {
        topic: "You're Using Claude Code Wrong",
        niche: 'Work Automation',
      });

      assert.ok(idea.topic);
      assert.ok(idea.hook);
      assert.ok(idea.target_audience);
      assert.ok(idea.estimated_duration);
      assert.equal(typeof idea.hook, 'string');
    }
  )
);

test(
  'YT Shorts: generate_short_script generates scene-by-scene script',
  withMockFetch(
    async (url, init) => {
      const out = {
        title: 'Stop Asking ChatGPT to Write Emails (Do This Instead)',
        hook: 'If your ChatGPT prompts start with "Write an email to...", you are wasting 90% of its power.',
        estimated_duration_seconds: 45,
        scenes: [
          {
            scene_number: 1,
            time_range: '0:00 - 0:03',
            visual_description: 'Subject looking at computer',
            camera_direction: 'Push-in',
            on_screen_text: 'Stop Writing Prompts Like This',
            voiceover_line: 'If your ChatGPT prompts start with write an email to, you are wasting 90% of its power.',
          },
          {
            scene_number: 2,
            time_range: '0:03 - 0:15',
            visual_description: 'CRM screenshot paste',
            camera_direction: 'Screen capture zoom',
            on_screen_text: 'Paste Context Instead',
            voiceover_line: 'Give ChatGPT raw CRM notes or meeting transcripts instead.',
          },
          {
            scene_number: 3,
            time_range: '0:15 - 0:45',
            visual_description: 'Auto drafted action items',
            camera_direction: 'Fast cut to action list',
            on_screen_text: 'Instant Action Plan',
            voiceover_line: 'Now it extracts decisions and auto-drafts responses without human babysitting.',
          },
        ],
        voiceover: 'If your ChatGPT prompts start with write an email to, you are wasting 90% of its power. Give ChatGPT raw CRM notes or meeting transcripts instead. Now it extracts decisions and auto-drafts responses without human babysitting.',
        call_to_action: 'Subscribe to NIKHILs TECH Studio to master practical AI automation.',
        hashtags: ['#Shorts', '#AI', '#ChatGPT', '#Productivity'],
      };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }), { status: 200 });
    },
    async () => {
      const env = baseEnv();
      const script = await ytShorts.generateShortScript(env, {
        topic: 'Stop Asking ChatGPT to Write Emails',
        duration: 45,
        language: 'English',
      });

      assert.ok(script.title);
      assert.ok(script.hook);
      assert.ok(Array.isArray(script.scenes));
      assert.ok(script.scenes.length >= 3);
      assert.ok(script.voiceover);
      assert.ok(script.call_to_action);

      const scene1 = script.scenes[0];
      assert.equal(scene1.scene_number, 1);
      assert.ok(scene1.on_screen_text);
      assert.ok(scene1.voiceover_line);
    }
  )
);

test(
  'YT Shorts: generate_storyboard generates 9:16 layout specs and image prompts',
  withMockFetch(
    async (url, init) => {
      const out = {
        visual_style: 'Cinematic dark tech, high-contrast graphite surfaces with glowing cyan accents',
        aspect_ratio: '9:16',
        color_palette: ['#03191d', '#072428', '#27e6f0', '#e9c77d', '#ffffff'],
        scenes: [
          {
            scene_number: 1,
            time_range: '0:00 - 0:03',
            visual_layout_9_16: 'Subject holding phone against dark navy backdrop',
            camera_move: 'Fast cinematic push-in',
            lighting: 'Cyan rim lighting with warm key light',
            generative_image_prompt: 'High resolution 9:16 vertical render, dark enterprise studio, glowing cyan UI overlay',
          },
          {
            scene_number: 2,
            time_range: '0:03 - 0:15',
            visual_layout_9_16: 'Vertical code terminal with automated workflow executing',
            camera_move: 'Macro pan left to right',
            lighting: 'Deep graphite background, electric teal accent glow',
            generative_image_prompt: 'Cinematic 9:16 macro shot of dark terminal executing AI automations',
          },
        ],
      };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }), { status: 200 });
    },
    async () => {
      const env = baseEnv();
      const script = {
        title: 'Test Short',
        hook: 'Test Hook',
        scenes: [
          {
            scene_number: 1,
            time_range: '0:00 - 0:03',
            visual_description: 'Subject holding phone',
            camera_direction: 'Fast push-in',
            on_screen_text: 'Stop Doing This',
            voiceover_line: 'Stop doing this immediately.',
          },
          {
            scene_number: 2,
            time_range: '0:03 - 0:15',
            visual_description: 'Terminal executing commands',
            camera_direction: 'Macro pan',
            on_screen_text: 'Use Context Instead',
            voiceover_line: 'Here is what actually works.',
          },
        ],
      };

      const sb = await ytShorts.generateStoryboard(env, { script });
      assert.equal(sb.aspect_ratio, '9:16');
      assert.ok(Array.isArray(sb.scenes));
      assert.equal(sb.scenes.length, 2);
      assert.ok(sb.scenes[0].generative_image_prompt);
      assert.ok(sb.scenes[0].visual_layout_9_16);
    }
  )
);

test('YT Shorts: generate_production_package creates video metadata and caption cues', async () => {
  const env = baseEnv();
  const script = {
    title: 'How Sales Teams Automate Lead Research',
    hook: 'Sales reps spend 15 hours a week digging.',
    call_to_action: 'Subscribe to NIKHILs TECH Studio',
    scenes: [
      {
        scene_number: 1,
        time_range: '0:00 - 0:05',
        on_screen_text: 'Sales Reps: Stop Digging',
        voiceover_line: 'Sales reps spend 15 hours a week digging.',
      },
    ],
  };
  const storyboard = { scenes: [] };

  const pkg = await ytShorts.generateProductionPackage(env, { script, storyboard });
  assert.ok(pkg.metadata.youtube_title.includes('#Shorts'));
  assert.ok(pkg.metadata.description.includes('NIKHILs TECH Studio'));
  assert.ok(Array.isArray(pkg.metadata.tags));
  assert.equal(pkg.specification.aspect_ratio, '9:16');
  assert.equal(pkg.specification.resolution, '1080x1920');
});

test('YT Shorts: save_content persists item into KV storage', async () => {
  const env = baseEnv();
  const item = {
    title: 'Automate Everything with AI',
    topic: 'Automation',
    category: 'Work Automation',
    hook: 'Stop typing repetitive tasks.',
    status: 'draft',
  };

  const res = await ytShorts.saveContent(env, { item });
  assert.equal(res.saved, true);
  assert.ok(res.id);

  const stored = await ytShorts.getShortItem(env, res.id);
  assert.equal(stored.title, item.title);
  assert.equal(stored.topic, item.topic);
});

test('YT Shorts: publish_short strictly requires user approval', async () => {
  const env = baseEnv();
  const saved = await ytShorts.saveShortItem(env, {
    title: 'Publish Guard Test',
    topic: 'Guard',
    status: 'draft',
  });

  // Attempt publish without approved: true must throw 403
  await assert.rejects(
    async () => {
      await ytShorts.publishShort(env, { id: saved.id, approved: false });
    },
    {
      status: 403,
      message: /Publishing blocked: User approval is strictly required/,
    }
  );

  // With approved: true it passes guard
  const pub = await ytShorts.publishShort(env, { id: saved.id, approved: true });
  assert.equal(pub.approved, true);
  assert.equal(pub.status, 'approved');
});

test('YT Shorts: Canva adapter reports status and generates 9:16 design spec', async () => {
  const env = baseEnv();
  const status = await canva.getCanvaStatus(env);
  assert.equal(status.connected, false);
  assert.equal(status.status, 'awaiting_authentication');
  assert.ok(status.brandKit?.templates?.length > 0);

  const spec = await canva.generateCanvaDesignSpec(env, {
    title: 'Top 3 AI Prompts',
    hook: 'Stop drowning in status updates.',
    category: 'Operations',
    scenePrompts: [],
  });

  assert.equal(spec.template, 'NTS_Shorts_Cover_9x16');
  assert.equal(spec.design_spec.aspectRatio, '9:16');
  assert.equal(spec.design_spec.dominantColor, '#03191d');
  assert.equal(spec.design_spec.accentColor, '#27e6f0');
});

test(
  'YT Shorts: Dev API routes (/api/dev/shorts/*) execute properly',
  withMockFetch(
    async (url, init) => {
      const out = {
        topic: 'Why Prompt Engineering is Dead',
        hook: 'Forget 500-word magical prompts. If your AI gives bad answers, your context is broken.',
        angle: 'Why providing real system files and rules beats prompt phrasing every time.',
        target_audience: 'Engineers and managers',
        estimated_duration: 45,
        category: 'AI Strategy',
      };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }), { status: 200 });
    },
    async () => {
      const env = baseEnv();

      // 1. GET calendar
      const calRes = await (await site.fetch(req('/api/dev/shorts/calendar'), env, {})).json();
      assert.ok(Array.isArray(calRes.calendar));
      assert.ok(calRes.calendar.length >= 7);

      // 2. POST idea
      const ideaRes = await (
        await site.fetch(
          req('/api/dev/shorts/idea', 'POST', {
            topic: 'Why Prompt Engineering is Dead',
            niche: 'AI Strategy',
          }),
          env,
          {}
        )
      ).json();
      assert.ok(ideaRes.hook);

      // 3. POST save
      const saveRes = await (
        await site.fetch(
          req('/api/dev/shorts/save', 'POST', {
            title: 'Prompt Engineering is Dead',
            topic: 'Why Prompt Engineering is Dead',
            category: 'AI Strategy',
            hook: ideaRes.hook,
            status: 'draft',
          }),
          env,
          {}
        )
      ).json();
      assert.equal(saveRes.saved, true);
      assert.ok(saveRes.id);

      // 4. GET items
      const itemsRes = await (await site.fetch(req('/api/dev/shorts/items'), env, {})).json();
      assert.ok(Array.isArray(itemsRes.items));
      assert.equal(itemsRes.items.length, 1);
      assert.equal(itemsRes.items[0].id, saveRes.id);

      // 5. GET single item
      const itemRes = await (await site.fetch(req(`/api/dev/shorts/item/${saveRes.id}`), env, {})).json();
      assert.equal(itemRes.item.id, saveRes.id);

      // 6. DELETE item
      const delRes = await (await site.fetch(req(`/api/dev/shorts/item/${saveRes.id}`, 'DELETE'), env, {})).json();
      assert.equal(delRes.ok, true);
    }
  )
);

test('YT Shorts: scheduled cron runs without throwing', async () => {
  const env = baseEnv();
  await ytShorts.scheduled(env);
  assert.ok(true);
});

test('parseJson: recovers cleanly from bad control characters in string literals', () => {
  // Raw literal newline inside JSON string (bad control character in standard JSON.parse)
  const malformed = '{\n  "title": "Claude Code Workflow",\n  "voiceover": "Line 1 of voiceover\nLine 2 of voiceover",\n  "description": "Bullet 1\nBullet 2",\n}';
  const parsed = parseJson(malformed);
  assert.equal(parsed.title, 'Claude Code Workflow');
  assert.ok(parsed.voiceover.includes('Line 1 of voiceover'));
  assert.ok(parsed.voiceover.includes('Line 2 of voiceover'));
});
