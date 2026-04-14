'use strict';
/**
 * Groq API client — mirrors callGroq() from chat-interface.html but server-side.
 * Uses Node 18+ native fetch. API key comes from GROQ_API_KEY env var.
 */

const CHAT_MODEL = 'llama-3.3-70b-versatile';
const FAST_MODEL = 'llama-3.1-8b-instant';
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 15000;

async function callGroq(messages, model) {
  const m   = model || CHAT_MODEL;
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens:  1024,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let errBody = {};
      try { errBody = await res.json(); } catch (_) {}
      const msg = (errBody.error && errBody.error.message) || 'HTTP ' + res.status;
      throw new Error('Groq API error: ' + msg);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { callGroq, CHAT_MODEL, FAST_MODEL };
