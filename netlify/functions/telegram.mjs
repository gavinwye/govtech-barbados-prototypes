/**
 * Telegram Bot webhook — Netlify Function
 *
 * Receives messages from the Telegram Bot API, maintains per-user
 * conversation state, calls Claude via the Anthropic API, and sends
 * replies back to the user.
 *
 * Session state is stored in Netlify Blobs (built-in, no extra config).
 *
 * Environment variables required:
 *   TELEGRAM_BOT_TOKEN  — from @BotFather
 *   ANTHROPIC_API_KEY   — Anthropic API key
 *   RESEND_API_KEY      — (optional) for email on form submission
 */

import { FORMS, SYSTEM_PROMPTS, ROUTING_PROMPT, CONCIERGE_PROMPT, FORM_DESCRIPTIONS } from './telegram-data.mjs';

// ── Config ──────────────────────────────────────────────────────────

const CHAT_MODEL = 'claude-sonnet-4-20250514';
const FAST_MODEL = 'claude-haiku-4-5-20251001';
const MAX_HISTORY = 40;          // max messages kept per session
const SESSION_TTL_MS = 3600000;  // 1 hour inactivity → session expires

// ── Telegram helpers ────────────────────────────────────────────────

const TG_API = (token) => `https://api.telegram.org/bot${token}`;

async function sendTelegram(token, chatId, text, opts = {}) {
  // Telegram max message length is 4096
  const chunks = splitMessage(text, 4096);
  for (const chunk of chunks) {
    await fetch(`${TG_API(token)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'Markdown',
        ...opts,
      }),
    });
  }
}

async function sendAction(token, chatId, action = 'typing') {
  await fetch(`${TG_API(token)}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}

function splitMessage(text, limit) {
  if (text.length <= limit) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

// ── Anthropic API ───────────────────────────────────────────────────

async function callClaude(apiKey, messages, model, systemPrompt) {
  const payload = {
    model: model || CHAT_MODEL,
    max_tokens: 2048,
    messages,
  };
  if (systemPrompt) payload.system = systemPrompt;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Anthropic HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.content?.map(b => b.text).join('') || '';
}

// ── Session store (/tmp file-based, persists within warm instances) ──

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SESSION_DIR = '/tmp/tg-sessions';
try { mkdirSync(SESSION_DIR, { recursive: true }); } catch {}

function sessionPath(chatId) {
  return join(SESSION_DIR, `${chatId}.json`);
}

async function loadSession(chatId) {
  try {
    const raw = readFileSync(sessionPath(chatId), 'utf8');
    const session = JSON.parse(raw);
    if (Date.now() - (session.lastActivity || 0) > SESSION_TTL_MS) {
      return newSession();
    }
    return session;
  } catch {
    return newSession();
  }
}

async function saveSession(chatId, session) {
  session.lastActivity = Date.now();
  writeFileSync(sessionPath(chatId), JSON.stringify(session));
}

function newSession() {
  return {
    phase: 'routing',     // routing | collecting-email | chat | extracting | submitted
    verifiedEmail: null,   // confirmed email for confirmation delivery
    formId: null,
    formName: null,
    formRef: null,
    systemPrompt: '',
    messages: [],          // [{role, content}] — form chat messages
    routingMessages: [],   // [{role, content}] — concierge conversation
    lastActivity: Date.now(),
  };
}

// ── Form submission (reuses /api/submit logic) ──────────────────────

async function submitForm(formName, formId, formRef, formData, siteUrl) {
  const resendKey = process.env.RESEND_API_KEY;
  const prefix = formRef || 'REF';
  const referenceNumber = prefix + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  if (!resendKey) return { referenceNumber, emailsSent: false };

  const userEmail = formData['submitter-email'] || formData['contact-email'] || formData['email'] || formData['app-email'] || formData['email-address'] || '';
  const deptEmail = `${(formId || 'general').replace(/[^a-z0-9-]/g, '')}@govtech.bb`;
  const fromAddress = 'Government of Barbados <onboarding@resend.dev>';

  const summaryRows = Object.entries(formData)
    .filter(([key, v]) => key !== 'submitter-email' && v !== null && v !== '' && v !== undefined)
    .map(([key, val]) => {
      const label = key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e0e4e9;font-weight:600;vertical-align:top">${label}</td><td style="padding:8px 12px;border-bottom:1px solid #e0e4e9">${String(val)}</td></tr>`;
    })
    .join('');

  const summaryTable = `<table style="width:100%;border-collapse:collapse;font-family:Figtree,sans-serif;font-size:15px">${summaryRows}</table>`;

  const errors = [];

  // Send applicant confirmation
  if (userEmail) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: fromAddress,
          to: userEmail,
          subject: `We received your ${formName} — ref ${referenceNumber}`,
          html: `<div style="font-family:Figtree,sans-serif;max-width:600px;margin:0 auto"><div style="background:#0e5f64;color:#fff;padding:24px;border-radius:6px 6px 0 0"><h1 style="margin:0;font-size:22px">We received your ${formName}</h1></div><div style="padding:24px;background:#fff;border:1px solid #e0e4e9;border-top:none;border-radius:0 0 6px 6px"><p>Your reference number is:</p><p style="font-size:24px;font-weight:700;color:#0e5f64">${referenceNumber}</p><h2 style="font-size:17px;border-bottom:2px solid #e0e4e9;padding-bottom:8px">What you told us</h2>${summaryTable}<h2 style="font-size:17px;margin-top:24px;border-bottom:2px solid #e0e4e9;padding-bottom:8px">What happens next</h2><p>We will review your submission and contact you if we need anything else. This usually takes up to 5 working days.</p></div></div>`,
        }),
      });
      if (!res.ok) errors.push('Applicant email failed');
    } catch { errors.push('Applicant email failed'); }
  }

  // Send department notification
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: fromAddress,
        to: deptEmail,
        subject: `New submission: ${formName} — ${referenceNumber}`,
        html: `<div style="font-family:Figtree,sans-serif;max-width:600px;margin:0 auto"><div style="background:#00267f;color:#fff;padding:24px;border-radius:6px 6px 0 0"><h1 style="margin:0;font-size:22px">New submission: ${formName}</h1></div><div style="padding:24px;background:#fff;border:1px solid #e0e4e9;border-top:none;border-radius:0 0 6px 6px"><p><strong>Reference:</strong> ${referenceNumber}</p><p><strong>Source:</strong> Telegram</p><h2 style="font-size:17px;border-bottom:2px solid #e0e4e9;padding-bottom:8px">Form data</h2>${summaryTable}</div></div>`,
      }),
    });
    if (!res.ok) errors.push('Department email failed');
  } catch { errors.push('Department email failed'); }

  return { referenceNumber, emailsSent: errors.length === 0, errors };
}

// ── JSON extraction from Claude's ##COMPLETE## response ─────────────

function tryParseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.substring(start, end + 1));
  } catch {
    return null;
  }
}

// ── Strip markdown formatting that doesn't work well in Telegram ────

function cleanForTelegram(text) {
  // Remove the ##COMPLETE## marker and everything after
  const idx = text.indexOf('##COMPLETE##');
  if (idx !== -1) text = text.substring(0, idx).trim();
  return text;
}

// ── Email helpers ──────────────────────────────────────────────────

function isValidEmail(str) {
  const at = str.indexOf('@');
  return at > 0 && str.indexOf('.', at) > at + 1 && str.length <= 254;
}

// ── Main handler ────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('OK', { status: 200 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!token || !apiKey) {
    console.error('Missing TELEGRAM_BOT_TOKEN or ANTHROPIC_API_KEY');
    return new Response('OK', { status: 200 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('OK', { status: 200 });
  }

  // Only handle text messages
  const message = body.message;
  if (!message?.text) {
    return new Response('OK', { status: 200 });
  }

  const chatId = message.chat.id;
  const text = message.text.trim();

  // Handle /start and /reset commands
  if (text === '/start' || text === '/reset') {
    const session = newSession();
    await saveSession(chatId, session);
    await sendTelegram(
      token, chatId,
      'Hi! I\'m the Government of Barbados assistant. 🇧🇧\n\nI can help you find government services, answer questions, and fill in forms — just tell me what you need.\n\nFor example, you could say:\n• "I need to register as self-employed"\n• "How do I get a birth certificate?"\n• "What services are available?"\n\nType /reset at any time to start over.'
    );
    return new Response('OK', { status: 200 });
  }

  // Load session
  const session = await loadSession(chatId);

  try {
    await sendAction(token, chatId, 'typing');

    if (session.phase === 'collecting-email') {
      await handleEmailCollection(token, apiKey, chatId, text, session);
    } else if (session.phase === 'routing') {
      await handleRouting(token, apiKey, chatId, text, session);
    } else if (session.phase === 'chat') {
      await handleChat(token, apiKey, chatId, text, session);
    } else if (session.phase === 'submitted') {
      // After submission, reset and route again
      const fresh = newSession();
      Object.assign(session, fresh);
      await handleRouting(token, apiKey, chatId, text, session);
    }
  } catch (err) {
    console.error('Error handling message:', err);
    await sendTelegram(
      token, chatId,
      'Sorry, something went wrong. Please try again or type /reset to start over.'
    );
  }

  await saveSession(chatId, session);
  return new Response('OK', { status: 200 });
}

// ── Routing phase (conversational concierge) ────────────────────────

async function handleRouting(token, apiKey, chatId, text, session) {
  // Ensure routingMessages exists (for sessions created before this update)
  if (!session.routingMessages) session.routingMessages = [];

  // Add the user's message to the routing conversation
  session.routingMessages.push({ role: 'user', content: text });

  // Trim routing history if too long
  if (session.routingMessages.length > MAX_HISTORY) {
    session.routingMessages = session.routingMessages.slice(-MAX_HISTORY);
  }

  const reply = await callClaude(
    apiKey,
    session.routingMessages,
    CHAT_MODEL,
    CONCIERGE_PROMPT
  );

  // Check if the concierge wants to route to a specific form
  const routeMatch = reply.match(/##ROUTE:([a-z0-9-]+)##/);

  if (routeMatch) {
    const formId = routeMatch[1];
    const form = FORMS.find(f => f.id === formId);
    const sysPrompt = form ? SYSTEM_PROMPTS[form.id] : null;

    if (form && sysPrompt) {
      // Send the concierge's message (without the route marker)
      const cleanReply = reply.replace(/##ROUTE:[a-z0-9-]+##/g, '').trim();
      if (cleanReply) {
        session.routingMessages.push({ role: 'assistant', content: cleanReply });
        await sendTelegram(token, chatId, cleanReply);
      }

      // Store form details but transition to email collection first
      session.phase = 'collecting-email';
      session.formId = form.id;
      session.formName = form.name;
      session.formRef = form.ref;
      session.systemPrompt = sysPrompt;
      session.messages = [];
      session.routingMessages = [];

      await sendTelegram(
        token, chatId,
        'Before we begin, what\'s your email address? We\'ll send your confirmation there.'
      );
    } else if (form && !sysPrompt) {
      const cleanReply = reply.replace(/##ROUTE:[a-z0-9-]+##/g, '').trim();
      session.routingMessages.push({ role: 'assistant', content: cleanReply || `I found the *${form.name}* form, but I don't have it set up for chat yet. Sorry about that.` });
      await sendTelegram(
        token, chatId,
        cleanReply || `I found the *${form.name}* form, but I don't have it set up for chat yet. Sorry about that.`
      );
    } else {
      // Form ID not found — strip marker and send the message
      const cleanReply = reply.replace(/##ROUTE:[a-z0-9-]+##/g, '').trim();
      session.routingMessages.push({ role: 'assistant', content: cleanReply });
      await sendTelegram(token, chatId, cleanReply || 'Sorry, I couldn\'t find that form. Could you tell me more about what you need?');
    }
  } else {
    // No routing — just a conversational response
    session.routingMessages.push({ role: 'assistant', content: reply });
    await sendTelegram(token, chatId, reply);
  }
}

// ── Email collection phase ─────────────────────────────────────────

async function handleEmailCollection(token, apiKey, chatId, text, session) {
  const email = text.trim().toLowerCase();

  if (!isValidEmail(email)) {
    await sendTelegram(
      token, chatId,
      'That doesn\'t look like a valid email address. Could you try again?'
    );
    return;
  }

  // Accept the email and start the form conversation
  session.verifiedEmail = email;
  session.phase = 'chat';

  // Start form chat with Claude, telling it the user's email so it doesn't ask again
  await sendAction(token, chatId, 'typing');
  const opener = `Start. The user's email is ${email}. Use this for any personal email or contact email field and do not ask for it again. Greet the user briefly and ask your first question.`;
  const openReply = await callClaude(
    apiKey,
    [{ role: 'user', content: opener }],
    CHAT_MODEL,
    session.systemPrompt
  );

  session.messages.push({ role: 'assistant', content: openReply });
  await sendTelegram(token, chatId, cleanForTelegram(openReply));
}

// ── Chat phase ──────────────────────────────────────────────────────

async function handleChat(token, apiKey, chatId, text, session) {
  // Add user message
  session.messages.push({ role: 'user', content: text });

  // Trim history if too long
  if (session.messages.length > MAX_HISTORY) {
    session.messages = session.messages.slice(-MAX_HISTORY);
  }

  const reply = await callClaude(
    apiKey,
    session.messages,
    CHAT_MODEL,
    session.systemPrompt
  );

  session.messages.push({ role: 'assistant', content: reply });

  // Check for completion
  if (reply.includes('##COMPLETE##')) {
    const afterMarker = reply.substring(reply.indexOf('##COMPLETE##') + '##COMPLETE##'.length).trim();
    const formData = tryParseJson(afterMarker);

    // Send the summary part (before ##COMPLETE##) to the user
    const summary = cleanForTelegram(reply);
    if (summary) {
      await sendTelegram(token, chatId, summary);
    }

    if (formData) {
      // Inject verified email so confirmation is always sent
      if (session.verifiedEmail) {
        formData['submitter-email'] = session.verifiedEmail;
      }

      // Submit the form
      session.phase = 'extracting';
      await sendAction(token, chatId, 'typing');

      const result = await submitForm(
        session.formName,
        session.formId,
        session.formRef,
        formData,
        ''
      );

      session.phase = 'submitted';

      await sendTelegram(
        token, chatId,
        `✅ *Form submitted!*\n\nYour reference number is:\n*${result.referenceNumber}*\n\nKeep this number safe. We'll be in touch if we need anything else.\n\nType /reset to complete another form.`
      );
    } else {
      // Fallback extraction
      await handleFallbackExtraction(token, apiKey, chatId, session);
    }
    return;
  }

  await sendTelegram(token, chatId, cleanForTelegram(reply));
}

// ── Fallback extraction ─────────────────────────────────────────────

async function handleFallbackExtraction(token, apiKey, chatId, session) {
  await sendTelegram(token, chatId, 'Let me pull that together for you...');
  await sendAction(token, chatId, 'typing');

  const convText = session.messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const extractReply = await callClaude(
    apiKey,
    [{
      role: 'user',
      content: `Extract all collected form data from this conversation as a JSON object. Use null for any field not provided.\n\nConversation:\n${convText}`,
    }],
    FAST_MODEL,
    'You are a data extraction assistant. Extract form data from conversations and output ONLY a valid JSON object. No explanation, no markdown, just raw JSON.'
  );

  const formData = tryParseJson(extractReply);

  if (formData) {
    // Inject verified email so confirmation is always sent
    if (session.verifiedEmail) {
      formData['submitter-email'] = session.verifiedEmail;
    }

    const result = await submitForm(
      session.formName,
      session.formId,
      session.formRef,
      formData,
      ''
    );
    session.phase = 'submitted';

    await sendTelegram(
      token, chatId,
      `✅ *Form submitted!*\n\nYour reference number is:\n*${result.referenceNumber}*\n\nKeep this number safe. We'll be in touch if we need anything else.\n\nType /reset to complete another form.`
    );
  } else {
    await sendTelegram(
      token, chatId,
      'Sorry, I had trouble extracting your data. Please type /reset and try again.'
    );
    session.phase = 'submitted';
  }
}

export const config = {
  path: '/api/telegram',
};
