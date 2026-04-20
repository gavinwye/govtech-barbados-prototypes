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
 *   ANTHROPIC_API_KEY   — Anthropic API key (or use GROQ_API_KEY as fallback)
 *   GROQ_API_KEY        — (optional) Groq API key, used when ANTHROPIC_API_KEY is absent
 *   RESEND_API_KEY      — (optional) for email on form submission
 *   SUPABASE_URL        — (optional) Supabase project URL
 *   SUPABASE_ANON_KEY   — (optional) Supabase publishable key
 */

import { FORMS, SYSTEM_PROMPTS, ROUTING_PROMPT, CONCIERGE_PROMPT, FORM_DESCRIPTIONS } from './telegram-data.mjs';
import { esc, EMAIL_FROM } from './_shared.mjs';
let createClient;
try {
  createClient = (await import('@supabase/supabase-js')).createClient;
} catch {
  createClient = null;
}

// ── Supabase client ────────────────────────────────────────────────

function getSupabase() {
  if (!createClient) return null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ── Field alias map (profile columns → form-specific keys) ─────────

const FIELD_ALIASES = {
  email:          ['email', 'contact-email', 'app-email', 'email-address'],
  mobile:         ['mobile', 'cellular', 'contact-cell', 'contact-phone'],
  telephone:      ['telephone', 'contact-telephone', 'home-tel'],
  street_address: ['street-address', 'street', 'address', 'app-street'],
  district:       ['district'],
  parish:         ['parish', 'app-parish'],
  postal_code:    ['postal-code', 'postal', 'postcode'],
  first_name:     ['first-name'],
  middle_name:    ['middle-name'],
  last_name:      ['last-name'],
  full_name:      ['full-name', 'fullName', 'fullname', 'app-name', 'ap-full-name'],
  dob:            ['dob'],
  nrn:            ['nrn'],
  nis_number:     ['nis-number'],
  gender:         ['gender'],
  marital_status: ['marital-status'],
};

/** Extract saveable profile fields from form data (form keys → profile columns) */
function extractProfileFields(formData) {
  const profile = {};
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    if (canonical === 'full_name') continue; // virtual field, handled below
    for (const alias of aliases) {
      if (formData[alias] && formData[alias] !== 'null') {
        profile[canonical] = formData[alias];
        break;
      }
    }
  }
  // If no first_name but a full-name variant exists, use it as first_name
  if (!profile.first_name) {
    for (const alias of FIELD_ALIASES.full_name) {
      if (formData[alias] && formData[alias] !== 'null') {
        profile.first_name = formData[alias];
        break;
      }
    }
  }
  return profile;
}

/** Build a full name string from profile parts */
function buildFullName(profile) {
  return [profile.first_name, profile.middle_name, profile.last_name]
    .filter(Boolean)
    .join(' ');
}

/** Map saved profile data to the form-specific keys found in the system prompt */
function mapProfileToFormKeys(profile, systemPrompt) {
  const mapped = {};
  // Extract all "keys: ..." declarations from the system prompt
  const keysMatches = systemPrompt.matchAll(/keys?:\s*([a-zA-Z0-9_, -]+)/g);
  const formKeys = new Set();
  for (const match of keysMatches) {
    match[1].split(',').forEach(k => formKeys.add(k.trim()));
  }

  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    if (canonical === 'full_name') {
      // Check if the form uses a full-name variant
      const fullName = buildFullName(profile);
      if (fullName) {
        for (const alias of aliases) {
          if (formKeys.has(alias)) {
            mapped[alias] = fullName;
            break;
          }
        }
      }
      continue;
    }

    const value = profile[canonical];
    if (!value) continue;

    for (const alias of aliases) {
      if (formKeys.has(alias)) {
        mapped[alias] = value;
        break;
      }
    }
  }
  return mapped;
}

// ── Config ──────────────────────────────────────────────────────────

const USE_GROQ = !process.env.ANTHROPIC_API_KEY && !!process.env.GROQ_API_KEY;

const CHAT_MODEL = USE_GROQ ? 'llama-3.3-70b-versatile' : 'claude-sonnet-4-20250514';
const FAST_MODEL = USE_GROQ ? 'llama-3.3-70b-versatile' : 'claude-haiku-4-5-20251001';
const MAX_HISTORY = 40;          // max messages kept per session
const SESSION_TTL_MS = 3600000;  // 1 hour inactivity → session expires

// ── Telegram helpers ────────────────────────────────────────────────

const TG_API = (token) => `https://api.telegram.org/bot${token}`;

async function sendTelegram(token, chatId, text, opts = {}) {
  // Telegram max message length is 4096
  const chunks = splitMessage(text, 4096);
  for (const chunk of chunks) {
    // Try Markdown first, fall back to plain text if Telegram rejects it
    const res = await fetch(`${TG_API(token)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'Markdown',
        ...opts,
      }),
    });
    if (!res.ok) {
      // Markdown parse failed — retry without parse_mode
      await fetch(`${TG_API(token)}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          ...opts,
        }),
      });
    }
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

// ── LLM API (Anthropic with Groq fallback) ─────────────────────────

async function callLLM(apiKey, messages, model, systemPrompt) {
  if (USE_GROQ) {
    return callGroq(messages, model, systemPrompt);
  }
  return callAnthropic(apiKey, messages, model, systemPrompt);
}

async function callAnthropic(apiKey, messages, model, systemPrompt) {
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

async function callGroq(messages, model, systemPrompt) {
  const groqMessages = [];
  if (systemPrompt) {
    groqMessages.push({ role: 'system', content: systemPrompt });
  }
  groqMessages.push(...messages);

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: model || CHAT_MODEL,
      max_tokens: 2048,
      messages: groqMessages,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
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
    phase: 'routing',     // routing | collecting-email | chat | extracting | offer-save | submitted
    verifiedEmail: null,   // confirmed email for confirmation delivery
    profileLoaded: null,   // profile data from Supabase (if found)
    pendingRefNumber: null, // ref number while asking about save
    pendingFormData: null,  // form data while asking about save
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
  const demoRecipient = process.env.DEMO_RECIPIENT;
  const prefix = formRef || 'REF';
  const referenceNumber = prefix + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  // Skip mail silently if either piece of config is missing. The form
  // conversation still completes and the ref number is returned.
  if (!resendKey || !demoRecipient) return { referenceNumber, emailsSent: false };

  const userEmail = formData['submitter-email'] || formData['contact-email'] || formData['email'] || formData['app-email'] || formData['email-address'] || '';
  const deptEmail = demoRecipient;
  const applicantRecipient = demoRecipient;
  const fromAddress = EMAIL_FROM;

  const summaryRows = Object.entries(formData)
    .filter(([key, v]) => key !== 'submitter-email' && v !== null && v !== '' && v !== undefined)
    .map(([key, val]) => {
      const label = key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e0e4e9;font-weight:600;vertical-align:top">${esc(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #e0e4e9">${esc(val)}</td></tr>`;
    })
    .join('');

  const summaryTable = `<table style="width:100%;border-collapse:collapse;font-family:Figtree,sans-serif;font-size:15px">${summaryRows}</table>`;

  const errors = [];

  // Applicant confirmation — routed to the fixed demo inbox, never the
  // user-supplied address. Gate on userEmail only so we preserve the
  // "a confirmation was intended" signal in logs.
  if (userEmail) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: fromAddress,
          to: applicantRecipient,
          subject: `We received your ${formName} — ref ${referenceNumber}`,
          html: `<div style="font-family:Figtree,sans-serif;max-width:600px;margin:0 auto"><div style="background:#0e5f64;color:#fff;padding:24px;border-radius:6px 6px 0 0"><h1 style="margin:0;font-size:22px">We received your ${esc(formName)}</h1></div><div style="padding:24px;background:#fff;border:1px solid #e0e4e9;border-top:none;border-radius:0 0 6px 6px"><p>Your reference number is:</p><p style="font-size:24px;font-weight:700;color:#0e5f64">${esc(referenceNumber)}</p><h2 style="font-size:17px;border-bottom:2px solid #e0e4e9;padding-bottom:8px">What you told us</h2>${summaryTable}<h2 style="font-size:17px;margin-top:24px;border-bottom:2px solid #e0e4e9;padding-bottom:8px">What happens next</h2><p>We will review your submission and contact you if we need anything else. This usually takes up to 5 working days.</p><hr style="border:none;border-top:1px solid #e0e4e9;margin:24px 0"><p style="font-size:13px;color:#595959">Prototype — alpha.gov.bb. This is not an official Government of Barbados service.</p></div></div>`,
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
        html: `<div style="font-family:Figtree,sans-serif;max-width:600px;margin:0 auto"><div style="background:#00267f;color:#fff;padding:24px;border-radius:6px 6px 0 0"><h1 style="margin:0;font-size:22px">New submission: ${esc(formName)}</h1></div><div style="padding:24px;background:#fff;border:1px solid #e0e4e9;border-top:none;border-radius:0 0 6px 6px"><p><strong>Reference:</strong> ${esc(referenceNumber)}</p><p><strong>Source:</strong> Telegram</p><p><strong>Applicant email:</strong> ${esc(userEmail || 'Not provided')}</p><h2 style="font-size:17px;border-bottom:2px solid #e0e4e9;padding-bottom:8px">Form data</h2>${summaryTable}</div></div>`,
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

  // Verify the request actually came from Telegram. The secret_token is set
  // when registering the webhook via setWebhook and echoed back in this
  // header on every delivery. Without it, anyone who guesses the URL can
  // spoof "Telegram messages" and drive the bot.
  const expectedWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedWebhookSecret) {
    const provided = req.headers.get('x-telegram-bot-api-secret-token');
    if (provided !== expectedWebhookSecret) {
      return new Response('OK', { status: 200 });
    }
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY;

  if (!token || !apiKey) {
    console.error('Missing TELEGRAM_BOT_TOKEN and ANTHROPIC_API_KEY/GROQ_API_KEY');
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

  // chatId is used as a filesystem path component for session state. Reject
  // anything that isn't a Telegram integer id to prevent path traversal.
  const chatId = message.chat?.id;
  if (!Number.isInteger(chatId)) {
    return new Response('OK', { status: 200 });
  }

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
    } else if (session.phase === 'offer-save') {
      await handleOfferSave(token, chatId, text, session);
    } else if (session.phase === 'submitted') {
      // After submission, reset and route again
      const fresh = newSession();
      Object.assign(session, fresh);
      await handleRouting(token, apiKey, chatId, text, session);
    }
  } catch (err) {
    console.error('Error handling message:', err.message, err.stack);
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

  // Try Groq for concierge routing first (cheaper), fall back to Anthropic
  let reply;
  if (process.env.GROQ_API_KEY) {
    try {
      reply = await callGroq(session.routingMessages, 'llama-3.3-70b-versatile', CONCIERGE_PROMPT);
    } catch {
      // Groq failed (rate limit etc.) — fall back to Anthropic
      reply = await callLLM(apiKey, session.routingMessages, CHAT_MODEL, CONCIERGE_PROMPT);
    }
  } else {
    reply = await callLLM(apiKey, session.routingMessages, CHAT_MODEL, CONCIERGE_PROMPT);
  }

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

  // Check Supabase for a saved profile
  const supabase = getSupabase();
  let profile = null;
  if (supabase) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('telegram_id', chatId)
        .maybeSingle();
      if (data) profile = data;
    } catch {}
  }
  session.profileLoaded = profile;

  // Build the opener — include pre-populated fields if profile exists
  await sendAction(token, chatId, 'typing');
  let opener;
  if (profile) {
    const mapped = mapProfileToFormKeys(profile, session.systemPrompt);
    // Always include email
    mapped[Object.keys(mapped).find(k => FIELD_ALIASES.email.includes(k)) || 'email'] = email;
    const fieldLines = Object.entries(mapped)
      .filter(([, v]) => v)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');
    opener = `Start. The user has saved personal details from a previous form.\nThe following fields are already known — use these values and DO NOT ask for them again:\n${fieldLines}\nSkip these fields entirely. Greet the user briefly, confirm you have their details on file, and ask your first question for information you still need.`;
  } else {
    opener = `Start. The user's email is ${email}. Use this for any personal email or contact email field and do not ask for it again. Greet the user briefly and ask your first question.`;
  }

  const openReply = await callLLM(
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

  const reply = await callLLM(
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
      await handlePostSubmission(token, chatId, session, formData);
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

  const extractReply = await callLLM(
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
    await handlePostSubmission(token, chatId, session, formData);
  } else {
    await sendTelegram(
      token, chatId,
      'Sorry, I had trouble extracting your data. Please type /reset and try again.'
    );
    session.phase = 'submitted';
  }
}

// ── Post-submission: log, offer save ───────────────────────────────

async function handlePostSubmission(token, chatId, session, formData) {
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

  // Log submission to Supabase (fire-and-forget)
  const supabase = getSupabase();
  if (supabase) {
    supabase.from('submissions').insert({
      telegram_id: chatId,
      form_id: session.formId,
      form_name: session.formName,
      reference_number: result.referenceNumber,
      form_data: formData,
    }).then(() => {}).catch(() => {});
  }

  // Check if user already has a saved profile
  let hasProfile = false;
  if (supabase) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('telegram_id', chatId)
        .maybeSingle();
      hasProfile = !!data;
    } catch {}
  }

  // If Supabase is available, offer to save details
  if (supabase) {
    session.pendingRefNumber = result.referenceNumber;
    session.pendingFormData = formData;
    session.phase = 'offer-save';

    const saveMsg = hasProfile
      ? `✅ *Form submitted!*\n\nYour reference number is:\n*${result.referenceNumber}*\n\nWould you like to update your saved details with any changes from this form? Reply *yes* or *no*.`
      : `✅ *Form submitted!*\n\nYour reference number is:\n*${result.referenceNumber}*\n\nWould you like me to save your personal details so you don't have to enter them again next time? Reply *yes* or *no*.`;

    await sendTelegram(token, chatId, saveMsg);
  } else {
    session.phase = 'submitted';
    await sendTelegram(
      token, chatId,
      `✅ *Form submitted!*\n\nYour reference number is:\n*${result.referenceNumber}*\n\nKeep this number safe. We'll be in touch if we need anything else.\n\nType /reset to complete another form.`
    );
  }
}

// ── Offer-save phase ───────────────────────────────────────────────

async function handleOfferSave(token, chatId, text, session) {
  const answer = text.trim().toLowerCase();

  if (answer === 'yes' || answer === 'y') {
    const supabase = getSupabase();
    if (supabase && session.pendingFormData) {
      const profileFields = extractProfileFields(session.pendingFormData);
      profileFields.email = session.verifiedEmail;

      try {
        await supabase.from('profiles').upsert({
          telegram_id: chatId,
          ...profileFields,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'telegram_id' });

        await sendTelegram(
          token, chatId,
          `Saved! Next time you fill in a form, I'll remember your details.\n\nKeep your reference number safe: *${session.pendingRefNumber}*\n\nType /reset to complete another form.`
        );
      } catch {
        await sendTelegram(
          token, chatId,
          `Sorry, I couldn't save your details this time. Your form was still submitted successfully.\n\nReference: *${session.pendingRefNumber}*\n\nType /reset to complete another form.`
        );
      }
    }
  } else if (answer === 'no' || answer === 'n') {
    await sendTelegram(
      token, chatId,
      `No problem. Keep your reference number safe: *${session.pendingRefNumber}*\n\nType /reset to complete another form.`
    );
  } else {
    await sendTelegram(
      token, chatId,
      'Reply *yes* to save your details for next time, or *no* to skip.'
    );
    return; // Stay in offer-save phase
  }

  session.pendingFormData = null;
  session.pendingRefNumber = null;
  session.phase = 'submitted';
}

export const config = {
  path: '/api/telegram',
};
