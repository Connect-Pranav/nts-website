// Unit tests for Canva MCP Tools and Video Design Engine
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCanvaStatus, createVideoDesign, exportVideo, getExportStatus, generateCanvaDesignSpec, CANVA_MCP_TOOLS } from '../canva.mjs';
import { TOOLS } from '../tools.mjs';

function mockKv() {
  const store = new Map();
  return {
    async get(key, type = 'text') {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key, val) {
      store.set(key, typeof val === 'string' ? val : JSON.stringify(val));
    },
  };
}

test('Canva MCP: tools are exported and registered in Master Brain TOOLS', () => {
  const expectedTools = [
    'canva_get_status',
    'canva_create_video_design',
    'canva_export_video',
    'canva_get_export_status',
    'canva_generate_video_spec',
  ];

  for (const name of expectedTools) {
    assert.ok(CANVA_MCP_TOOLS[name], `CANVA_MCP_TOOLS missing ${name}`);
    assert.ok(TOOLS[name], `TOOLS registry missing ${name}`);
    assert.strictEqual(typeof TOOLS[name].run, 'function');
  }
});

test('Canva MCP: getCanvaStatus returns structured NTS Brand Kit and status', async () => {
  const env = { NTS_KV: mockKv() };
  const res = await getCanvaStatus(env);

  assert.strictEqual(typeof res.connected, 'boolean');
  assert.ok(res.brandKit);
  assert.strictEqual(res.brandKit.name, 'NIKHILs TECH Studio');
  assert.strictEqual(res.brandKit.colors.electricTeal, '#27e6f0');
  assert.ok(Array.isArray(res.brandKit.templates));
  assert.ok(res.brandKit.templates.length >= 4);
});

test('Canva MCP: createVideoDesign generates 9:16 vertical video design spec with scenes', async () => {
  const env = { NTS_KV: mockKv() };
  const design = await createVideoDesign(env, {
    title: 'Automate Tasks With AI Agents',
    topic: 'AI Automation',
    scenes: [
      { sceneIndex: 1, title: 'Hook', durationSec: 3.5, textOverlay: 'Stop doing manual work' },
      { sceneIndex: 2, title: 'Demo', durationSec: 25.0, textOverlay: 'Agents execute terminal commands' },
    ],
  });

  assert.ok(design.id);
  assert.strictEqual(design.type, 'vertical_video_9_16');
  assert.strictEqual(design.dimensions.width, 1080);
  assert.strictEqual(design.dimensions.height, 1920);
  assert.strictEqual(design.dimensions.aspectRatio, '9:16');
  assert.ok(design.scenes.length >= 2);
  assert.strictEqual(design.brandKitApplied, 'NIKHILs TECH Studio');
});

test('Canva MCP: exportVideo queues MP4 export and getExportStatus returns verified delivery link', async () => {
  const env = { NTS_KV: mockKv() };
  const exp = await exportVideo(env, { designId: 'canva_test_001', format: 'mp4' });

  assert.ok(exp.ok);
  assert.ok(exp.exportId);
  assert.strictEqual(exp.format, 'mp4');

  const status = await getExportStatus(env, { exportId: exp.exportId });
  assert.strictEqual(status.status, 'completed');
  assert.ok(Array.isArray(status.urls));
  assert.ok(status.urls[0].includes('drive.google.com'));
});
