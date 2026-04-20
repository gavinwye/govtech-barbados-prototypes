// HTTP-level smoke canary for the Netlify functions.
// Run against a local `netlify dev` (default http://localhost:8888), or override:
//   BASE_URL=https://your-preview.netlify.app node --test tests/smoke.mjs
//
// Keeps to observable behaviour (status codes, response shape) so it survives
// internal refactors. Happy-path tests skip themselves gracefully when the
// relevant upstream API key is missing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8888';

async function post(path, body, { json = true } = {}) {
  const res = await fetch(new URL(path, BASE_URL), {
    method: 'POST',
    headers: json ? { 'Content-Type': 'application/json' } : {},
    body: json ? JSON.stringify(body) : body
  });
  let parsed = null;
  try { parsed = await res.json(); } catch {}
  return { status: res.status, body: parsed };
}

async function request(path, method = 'GET') {
  const res = await fetch(new URL(path, BASE_URL), { method });
  return { status: res.status };
}

// ── /api/submit ────────────────────────────────────────────

test('/api/submit rejects GET with 405', async () => {
  const r = await request('/api/submit');
  assert.equal(r.status, 405);
});

test('/api/submit rejects invalid JSON with 400', async () => {
  const r = await post('/api/submit', 'not-json', { json: false });
  assert.equal(r.status, 400);
});

test('/api/submit rejects non-object body with 400', async () => {
  const r = await post('/api/submit', ['array', 'not', 'object']);
  assert.equal(r.status, 400);
});

test('/api/submit rejects oversized body with 413', async () => {
  const huge = { blob: 'x'.repeat(40 * 1024) };
  const r = await post('/api/submit', huge);
  assert.equal(r.status, 413);
});

test('/api/submit rejects non-string formName with 400', async () => {
  const r = await post('/api/submit', { formName: 42, formData: {} });
  assert.equal(r.status, 400);
});

test('/api/submit rejects non-object formData with 400', async () => {
  const r = await post('/api/submit', { formData: 'string not object' });
  assert.equal(r.status, 400);
});

test('/api/submit returns a referenceNumber on valid payload', async (t) => {
  const r = await post('/api/submit', {
    formName: 'Smoke Test',
    formId: 'smoke',
    formRef: 'SMK',
    formData: { test: 'yes' }
  });
  const errMsg = r.body?.error?.message || '';
  if (r.status === 500 && /RESEND_API_KEY|DEMO_RECIPIENT/.test(errMsg)) {
    t.skip(`Config missing (${errMsg}) — skipping happy-path assertion`);
    return;
  }
  assert.equal(r.status, 200);
  assert.match(r.body?.referenceNumber ?? '', /^SMK-[A-Z0-9]{6}$/);
});

// ── /api/chat ──────────────────────────────────────────────

test('/api/chat rejects GET with 405', async () => {
  const r = await request('/api/chat');
  assert.equal(r.status, 405);
});

test('/api/chat rejects invalid JSON with 400', async () => {
  const r = await post('/api/chat', 'not-json', { json: false });
  assert.equal(r.status, 400);
});

test('/api/chat rejects empty messages array with 400', async () => {
  const r = await post('/api/chat', { messages: [] });
  assert.equal(r.status, 400);
});

test('/api/chat rejects non-array messages with 400', async () => {
  const r = await post('/api/chat', { messages: 'nope' });
  assert.equal(r.status, 400);
});

test('/api/chat rejects malformed message entries with 400', async () => {
  const r = await post('/api/chat', { messages: [{ bogus: 'no role/content' }] });
  assert.equal(r.status, 400);
});

test('/api/chat rejects oversized body with 413', async () => {
  const huge = { messages: [{ role: 'user', content: 'x'.repeat(40 * 1024) }] };
  const r = await post('/api/chat', huge);
  assert.equal(r.status, 413);
});

test('/api/chat returns an assistant message on valid payload', async (t) => {
  const r = await post('/api/chat', {
    messages: [{ role: 'user', content: 'ping' }]
  });
  if (r.status === 500 && /OPENROUTER_API_KEY/.test(r.body?.error?.message || '')) {
    t.skip('OPENROUTER_API_KEY not configured — skipping happy-path assertion');
    return;
  }
  assert.equal(r.status, 200);
  assert.equal(r.body?.role, 'assistant');
  assert.equal(Array.isArray(r.body?.content), true);
  assert.equal(r.body.content[0]?.type, 'text');
  assert.equal(typeof r.body.content[0]?.text, 'string');
});
