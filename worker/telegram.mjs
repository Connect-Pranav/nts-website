// Telegram Approvals & Notifications Module — NTS COMMAND V2.0
// Manages real Telegram bot connectivity, webhook dispatch, and admin callbacks.
// State strictly defaults to "Not Connected" until valid bot credentials are provided.

import { HttpError, json, nowIso, safeEqual } from './util.mjs';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

/** Retrieve live Telegram connection status from KV settings or Cloudflare Worker secrets */
export async function getTelegramStatus(env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  const adminIds = env.TELEGRAM_ADMIN_IDS;

  if (!token || token.length < 15) {
    return {
      connected: false,
      configured: false,
      botUsername: null,
      chatId: chatId || null,
      adminCount: adminIds ? adminIds.split(',').length : 0,
      webhookActive: false,
      statusLabel: 'Telegram: Not Connected',
    };
  }

  // Verify token with Telegram getMe
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}${token}/getMe`);
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return {
        connected: false,
        configured: true,
        error: data.description || 'Invalid Telegram bot token',
        botUsername: null,
        chatId: chatId || null,
        adminCount: adminIds ? adminIds.split(',').length : 0,
        webhookActive: false,
        statusLabel: 'Telegram: Auth Failed',
      };
    }

    return {
      connected: true,
      configured: true,
      botUsername: data.result?.username || null,
      botName: data.result?.first_name || null,
      chatId: chatId || null,
      adminCount: adminIds ? adminIds.split(',').length : 0,
      webhookActive: Boolean(env.TELEGRAM_WEBHOOK_SECRET),
      statusLabel: `Connected (@${data.result?.username})`,
    };
  } catch (err) {
    return {
      connected: false,
      configured: true,
      error: err.message,
      botUsername: null,
      chatId: chatId || null,
      adminCount: adminIds ? adminIds.split(',').length : 0,
      webhookActive: false,
      statusLabel: 'Telegram: Connection Error',
    };
  }
}

/** Test Telegram connection and send a test ping to the configured chat ID */
export async function testTelegram(env, customChatId) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const targetChatId = customChatId || env.TELEGRAM_CHAT_ID;

  if (!token) throw new HttpError(400, 'Telegram bot token is not configured.');
  if (!targetChatId) throw new HttpError(400, 'Telegram Chat ID is required for test message.');

  const text = `*NIKHILs TECH Studio — NTS COMMAND V2.0*\n\nTelegram Approval Bot is operational!\nTime: \`${new Date().toISOString()}\`\nEnvironment: Cloudflare Workers\n\n_Learn. Practice. Simulate. Grow._`;

  const res = await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: targetChatId,
      text,
      parse_mode: 'Markdown',
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new HttpError(res.status || 502, data.description || 'Failed to send Telegram message.');
  }

  return { ok: true, messageId: data.result?.message_id };
}

/** Dispatch an approval request message with inline action buttons to Telegram */
export async function sendApprovalRequest(env, item) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { skipped: true, reason: 'Telegram bot not configured.' };

  const messageText = `*PENDING APPROVAL — NTS COMMAND V2.0*\n\n*Title:* ${item.title || 'Untitled'}\n*Platform:* ${item.channel || 'All'}\n*Agent:* ${item.agentName || item.agent || 'Orchestrator'}\n*Scheduled:* \`${item.scheduledFor || 'Immediate'}\`\n*Quality Score:* ${item.qualityScore || 95}/100\n\n*Preview:* \n\`\`\`\n${(item.body || '').slice(0, 400)}${(item.body || '').length > 400 ? '...' : ''}\n\`\`\``;

  const inlineKeyboard = [
    [
      { text: 'Approve', callback_data: `approve:${item.id}` },
      { text: 'Reject', callback_data: `reject:${item.id}` },
    ],
    [
      { text: 'Edit in Studio', url: `https://nts-website.aistudio09.workers.dev/dev` },
      { text: 'Regenerate', callback_data: `regen:${item.id}` },
    ],
  ];

  const res = await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: messageText,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard },
    }),
  });

  const d = await res.json();
  return { ok: res.ok, messageId: d.result?.message_id };
}

/** Webhook callback query handler when admin clicks an inline button in Telegram */
export async function handleTelegramWebhook(env, request) {
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    throw new HttpError(403, 'Invalid Telegram webhook secret.');
  }

  const update = await request.json().catch(() => null);
  if (!update || !update.callback_query) return json({ ok: true, ignored: true });

  const cb = update.callback_query;
  const fromId = String(cb.from?.id);
  const data = cb.data || '';
  const [action, itemId] = data.split(':');

  // Verify admin authorization
  const allowedAdmins = (env.TELEGRAM_ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowedAdmins.length > 0 && !allowedAdmins.includes(fromId)) {
    await answerCallback(env, cb.id, 'Unauthorized: You are not a registered NTS administrator.');
    return json({ ok: true, unauthorized: true });
  }

  // Process real backend approval / rejection
  if (action === 'approve' || action === 'reject') {
    const isApprove = action === 'approve';
    // Update KV work item
    if (env.NTS_KV) {
      const w = (await env.NTS_KV.get('work', 'json')) || { items: [] };
      const it = w.items.find((i) => i.id === itemId);
      if (it) {
        it.status = isApprove ? 'ready' : 'rejected';
        it.approvedBy = `telegram:${fromId}`;
        it.updatedAt = nowIso();
        await env.NTS_KV.put('work', JSON.stringify(w));
      }
    }

    // Update D1 quiz post if applicable
    if (env.DB) {
      await env.DB.prepare(
        "UPDATE linkedin_quiz_posts SET approval_status = ?, updated_at = ? WHERE work_item_id = ? OR id = ?"
      )
        .bind(isApprove ? 'approved' : 'rejected', nowIso(), itemId, itemId)
        .run();
    }

    // Persist to audit log
    await logTelegramAction(env, {
      action,
      itemId,
      userId: fromId,
      username: cb.from?.username || 'admin',
      at: nowIso(),
    });

    await answerCallback(env, cb.id, `Item ${isApprove ? 'APPROVED' : 'REJECTED'} successfully.`);
    return json({ ok: true, action, itemId });
  }

  return json({ ok: true });
}

async function answerCallback(env, callbackQueryId, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`${TELEGRAM_API_BASE}${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  }).catch(() => {});
}

async function logTelegramAction(env, logEntry) {
  if (!env.NTS_KV) return;
  const logs = (await env.NTS_KV.get('telegram/audit_logs', 'json')) || [];
  logs.unshift(logEntry);
  if (logs.length > 100) logs.length = 100;
  await env.NTS_KV.put('telegram/audit_logs', JSON.stringify(logs));
}

/** Dev-mode simulated approval test helper */
export async function simulateApprovalTest(env, { title, channel = 'LinkedIn' }) {
  const mockId = `w_sim_${Date.now().toString(36)}`;
  const simItem = {
    id: mockId,
    title: `[SIMULATED] ${title || 'High-Performance SQL Optimization'}`,
    channel,
    agentName: 'LinkedIn Content Writer',
    scheduledFor: '2026-11-12T08:00:00.000Z',
    qualityScore: 96,
    body: 'How PostgreSQL executes hash joins in memory under memory pressure.\n\nOption A) Spills to disk work_mem...',
  };

  const status = await getTelegramStatus(env);
  let liveSent = false;
  if (status.connected) {
    const res = await sendApprovalRequest(env, simItem);
    liveSent = res.ok;
  }

  // Also log to simulation audit log
  await logTelegramAction(env, {
    action: 'simulated_request',
    itemId: mockId,
    title: simItem.title,
    channel,
    liveTelegramSent: liveSent,
    at: nowIso(),
  });

  return {
    ok: true,
    item: simItem,
    liveTelegramSent: liveSent,
    note: liveSent ? 'Real Telegram notification dispatched to admin chat!' : 'Simulated locally. Connect Telegram BotFather token to send live pings.',
  };
}
