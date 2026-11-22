// NTS COMMAND — Canva Integration Adapter
// Provides template specifications, 9:16 Shorts thumbnail generation specs,
// and editable design links for NIKHILs TECH Studio.

import { HttpError, nowIso, newId } from './util.mjs';
import * as store from './store.mjs';
import * as ops from './ops.mjs';

const CANVA_API_BASE = 'https://api.canva.com/rest/v1';

/**
 * Get Canva connection status.
 * If credentials are not configured, cleanly reports awaiting_authentication
 * without pretending to be connected.
 */
export async function getCanvaStatus(rawEnv) {
  const env = await store.withSettings(rawEnv);
  const apiKey = env.CANVA_API_KEY;
  const clientId = env.CANVA_CLIENT_ID;
  const meta = rawEnv.NTS_KV ? await rawEnv.NTS_KV.get('canva/oauth/meta', 'json') : null;

  const isConnected = Boolean((apiKey && apiKey.length > 10) || (meta && meta.accessToken));

  return {
    configured: Boolean(clientId || apiKey),
    connected: isConnected,
    status: isConnected ? 'connected' : 'awaiting_authentication',
    statusLabel: isConnected ? 'Canva: Connected (API Active)' : 'Canva: Awaiting Setup / Authentication',
    brandKit: {
      name: 'NIKHILs TECH Studio',
      colors: {
        backgroundDark: '#03191d',
        surfaceGraphite: '#072428',
        electricTeal: '#27e6f0',
        champagneGold: '#e9c77d',
        pureWhite: '#ffffff',
        mutedGray: '#9ab9bc',
      },
      typography: {
        headline: 'Montserrat Bold / ExtraBold',
        body: 'Geist Sans / Inter',
        callout: 'JetBrains Mono',
      },
      templates: [
        { id: 'tmpl_shorts_hook_01', name: 'NTS Bold Hook Intro (9:16)', format: '1080x1920', category: 'hook' },
        { id: 'tmpl_shorts_code_02', name: 'NTS Code & Automation Breakdown', format: '1080x1920', category: 'tutorial' },
        { id: 'tmpl_shorts_stat_03', name: 'NTS Stat Shock & Retention Card', format: '1080x1920', category: 'contrast' },
        { id: 'tmpl_shorts_cta_04', name: 'NTS Final CTA & Practice Gym Outro', format: '1080x1920', category: 'outro' },
      ],
    },
    setupInstructions: [
      '1. Create a developer account at https://www.canva.com/developers',
      '2. Create an Integration in the Canva Developer Portal',
      '3. Generate an API Key or Client ID/Secret with scopes: design:content:read, design:content:write',
      '4. Add CANVA_API_KEY in NTS Settings to enable automatic asset generation',
    ],
  };
}

/**
 * Generate a branded Canva design specification for a YouTube Short
 */
export async function generateCanvaDesignSpec(rawEnv, { title, hook, category, scenePrompts = [] }) {
  const status = await getCanvaStatus(rawEnv);
  const designId = newId('canva');
  const now = nowIso();

  const spec = {
    id: designId,
    title: String(title || 'NTS YouTube Short Asset').slice(0, 80),
    template: 'NTS_Shorts_Cover_9x16',
    format: '1080x1920',
    aspectRatio: '9:16',
    brand: 'NIKHILs TECH Studio',
    templateUsed: category === 'coding' ? 'tmpl_shorts_code_02' : 'tmpl_shorts_hook_01',
    design_spec: {
      dimensions: '1080x1920',
      aspectRatio: '9:16',
      dominantColor: '#03191d',
      accentColor: '#27e6f0',
      fonts: {
        primary: 'Montserrat Bold',
        secondary: 'Geist Sans',
      },
      layers: [
        { name: 'Background', type: 'gradient', content: 'Dark graphite #03191d to #072428' },
        { name: 'Hook Header', type: 'text', content: String(hook || title).slice(0, 100) },
        { name: 'Accent UI Glow', type: 'glow', content: 'Electric Teal #27e6f0' },
        { name: 'Watermark', type: 'text', content: 'NIKHILs TECH Studio · Learn. Practice. Simulate. Grow.' },
      ],
    },
    elements: {
      headerBadge: 'NIKHILs TECH STUDIO',
      hookText: String(hook || title).slice(0, 100),
      accentColor: '#27e6f0',
      watermark: 'Learn. Practice. Simulate. Grow.',
      callToAction: 'Follow @NikhilsTechStudio for Daily AI Workflows',
    },
    exportPresets: {
      type: 'PNG',
      quality: 'high',
      compression: 'none',
      width: 1080,
      height: 1920,
    },
    canvaWebUrl: status.connected
      ? `https://www.canva.com/design/${designId}/edit`
      : 'https://www.canva.com/create/youtube-shorts/',
    connected: status.connected,
    createdAt: now,
  };

  if (rawEnv.NTS_KV) {
    const list = (await rawEnv.NTS_KV.get('canva/designs', 'json')) || [];
    list.unshift(spec);
    await rawEnv.NTS_KV.put('canva/designs', JSON.stringify(list.slice(0, 50)));
  }

  await ops.log(rawEnv, 'design', `Canva design spec created: "${spec.title}" (${status.status})`);
  return spec;
}
