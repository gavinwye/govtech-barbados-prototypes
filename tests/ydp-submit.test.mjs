// Unit tests for the /api/ydp-submit handler.
// Exercises the exported default handler directly with mocked Request and a
// stubbed global fetch (Resend). No network, no Netlify dev required.
//
// Run: node --test tests/ydp-submit.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.RESEND_API_KEY = 'test_key';
process.env.YDP_FALLBACK_EMAIL = 'ydp-fallback@example.com';
delete process.env.EMAIL_OVERRIDE_TO;

const { default: handler } = await import('../netlify/functions/ydp-submit.mjs');
const { REGISTRY } = await import('../netlify/functions/_ydp-registry.mjs');

let resendCalls = [];
globalThis.fetch = async (url, init) => {
  resendCalls.push({ url: String(url), body: JSON.parse(init.body) });
  return new Response(JSON.stringify({ id: 'resend_test_id' }), { status: 200 });
};

function jsonReq(body) {
  return new Request('http://test.local/api/ydp-submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function multipartReq(formId, formData, fileSpec) {
  const fd = new FormData();
  fd.append('formId', formId);
  fd.append('formData', JSON.stringify(formData));
  if (fileSpec) {
    const blob = new Blob([fileSpec.content || 'hello world'], { type: fileSpec.type || 'application/pdf' });
    fd.append('cv', blob, fileSpec.filename || 'cv.pdf');
  }
  return new Request('http://test.local/api/ydp-submit', { method: 'POST', body: fd });
}

// Minimal valid payload for the simplest YDP form (NCCT — fewest required
// fields without a CV). Ages 9–21 → DOB 2010-01-01 ≈ 16 today.
function nctValid() {
  return {
    formId: 'ydp-ncct',
    formData: {
      'nrn': '100101-1234',
      'first-name': 'Test',
      'last-name': 'User',
      'dob-day': '15', 'dob-month': '6', 'dob-year': '2010',
      'parish': 'St. Michael',
      'country-of-birth': 'Barbados',
      'gender': 'Female',
      'email': 'test@example.com',
      'phone': '246-555-1234',
      'employment-status': 'Student',
      'experience-level': 'Beginner',
      'how-heard': 'Friend'
    }
  };
}

function reset() { resendCalls = []; }

test('valid NCCT payload returns a reference and sends both emails', async () => {
  reset();
  const r = await handler(jsonReq(nctValid()));
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.match(body.referenceNumber, /^NCCTP-[A-Z0-9]{6}$/);
  assert.equal(resendCalls.length, 2, 'applicant + dept emails');
  assert.deepEqual(
    resendCalls.map(c => c.body.to).sort(),
    ['test@example.com', 'ydp-fallback@example.com'].sort()
  );
});

test('unknown formId is rejected', async () => {
  reset();
  const r = await handler(jsonReq({ formId: 'nope', formData: {} }));
  assert.equal(r.status, 400);
  assert.match((await r.json()).error.message, /Unknown formId/);
  assert.equal(resendCalls.length, 0);
});

test('missing required field is rejected', async () => {
  reset();
  const p = nctValid();
  delete p.formData['first-name'];
  const r = await handler(jsonReq(p));
  assert.equal(r.status, 400);
  assert.match((await r.json()).error.message, /first-name/);
});

test('unknown field is rejected', async () => {
  reset();
  const p = nctValid();
  p.formData['mystery-field'] = 'oops';
  const r = await handler(jsonReq(p));
  assert.equal(r.status, 400);
  assert.match((await r.json()).error.message, /mystery-field/);
});

test('client-supplied recipient field is rejected as unknown', async () => {
  reset();
  const p = nctValid();
  p.formData['recipientEmail'] = 'attacker@example.com';
  p.formData['deptContactEmail'] = 'attacker@example.com';
  const r = await handler(jsonReq(p));
  assert.equal(r.status, 400);
});

test('age below ageMin is rejected', async () => {
  reset();
  const p = nctValid();
  // NCCT minimum age is 9. Set DOB ~5 years ago.
  const y = new Date().getFullYear() - 5;
  p.formData['dob-year'] = String(y);
  const r = await handler(jsonReq(p));
  assert.equal(r.status, 400);
  assert.match((await r.json()).error.message, /at least/);
});

test('age above ageMax is rejected', async () => {
  reset();
  const p = nctValid();
  // NCCT maximum age is 21. Set DOB ~30 years ago.
  const y = new Date().getFullYear() - 30;
  p.formData['dob-year'] = String(y);
  const r = await handler(jsonReq(p));
  assert.equal(r.status, 400);
  assert.match((await r.json()).error.message, /years old or younger/);
});

test('invalid email is rejected', async () => {
  reset();
  const p = nctValid();
  p.formData['email'] = 'not-an-email';
  const r = await handler(jsonReq(p));
  assert.equal(r.status, 400);
});

test('honeypot field silently drops the submission', async () => {
  reset();
  const p = nctValid();
  p.formData['_hp'] = 'spam-bot';
  const r = await handler(jsonReq(p));
  assert.equal(r.status, 200);
  assert.equal(resendCalls.length, 0, 'no email sent when honeypot trips');
});

test('Get Hired multipart with valid PDF accepts the file', async () => {
  reset();
  const formData = {
    'first-name': 'Test', 'last-name': 'User',
    'nrn': '900101-1234',
    'dob-day': '1', 'dob-month': '1', 'dob-year': '2000',
    'parish': 'St. Michael', 'country-of-birth': 'Barbados',
    'gender': 'Male',
    'email': 'gh@example.com', 'phone': '246-555-9999',
    'right-to-work': 'Yes', 'education': 'Secondary',
    'cv-filename': 'cv.pdf'
  };
  const r = await handler(multipartReq('ydp-get-hired', formData, { filename: 'cv.pdf', type: 'application/pdf' }));
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.match(body.referenceNumber, /^GHP-[A-Z0-9]{6}$/);
  // Dept email should carry an attachment.
  const dept = resendCalls.find(c => c.body.to === 'ydp-fallback@example.com');
  assert.ok(dept.body.attachments?.length === 1, 'CV attached to dept email');
  assert.equal(dept.body.attachments[0].filename, 'cv.pdf');
});

test('Get Hired rejects disallowed CV extension', async () => {
  reset();
  const formData = {
    'first-name': 'Test', 'last-name': 'User',
    'nrn': '900101-1234',
    'dob-day': '1', 'dob-month': '1', 'dob-year': '2000',
    'parish': 'St. Michael', 'country-of-birth': 'Barbados',
    'gender': 'Male',
    'email': 'gh@example.com', 'phone': '246-555-9999',
    'right-to-work': 'Yes', 'education': 'Secondary',
    'cv-filename': 'cv.exe'
  };
  const r = await handler(multipartReq('ydp-get-hired', formData, { filename: 'cv.exe', type: 'application/octet-stream' }));
  assert.equal(r.status, 400);
  assert.match((await r.json()).error.message, /CV file type/);
});

test('Get Hired rejects oversized CV', async () => {
  reset();
  const formData = {
    'first-name': 'Test', 'last-name': 'User',
    'nrn': '900101-1234',
    'dob-day': '1', 'dob-month': '1', 'dob-year': '2000',
    'parish': 'St. Michael', 'country-of-birth': 'Barbados',
    'gender': 'Male',
    'email': 'gh@example.com', 'phone': '246-555-9999',
    'right-to-work': 'Yes', 'education': 'Secondary',
    'cv-filename': 'cv.pdf'
  };
  // 6 MB > 5 MB cap.
  const big = 'a'.repeat(6 * 1024 * 1024);
  const r = await handler(multipartReq('ydp-get-hired', formData, { filename: 'cv.pdf', type: 'application/pdf', content: big }));
  assert.equal(r.status, 413);
});

test('non-Get-Hired form rejects a CV upload', async () => {
  reset();
  const r = await handler(multipartReq('ydp-ncct', nctValid().formData, { filename: 'cv.pdf', type: 'application/pdf' }));
  assert.equal(r.status, 400);
  assert.match((await r.json()).error.message, /does not accept file uploads/);
});

test('every registry entry has a unique refPrefix and recipientEnv', () => {
  const ids = Object.keys(REGISTRY);
  const prefixes = new Set();
  const envs = new Set();
  for (const id of ids) {
    const e = REGISTRY[id];
    assert.ok(e.formName, `${id} formName`);
    assert.ok(e.refPrefix, `${id} refPrefix`);
    assert.ok(!prefixes.has(e.refPrefix), `${id} refPrefix duplicate ${e.refPrefix}`);
    prefixes.add(e.refPrefix);
    assert.ok(e.recipientEnv, `${id} recipientEnv`);
    assert.ok(!envs.has(e.recipientEnv), `${id} recipientEnv duplicate`);
    envs.add(e.recipientEnv);
    assert.ok(Array.isArray(e.allowedFields) && e.allowedFields.length, `${id} allowedFields`);
    assert.ok(Array.isArray(e.requiredFields), `${id} requiredFields`);
  }
});
