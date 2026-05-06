// /api/ydp-submit — dedicated endpoint for youth-development-programme forms.
// All form metadata (name, recipient, ref prefix, allowed/required fields,
// age rules) is server-derived from the registry. The browser only sends
// `formId` and `formData`.
//
// Hardening:
//   - unknown formId         → 400
//   - oversized payload      → 413
//   - unknown fields         → 400
//   - missing required       → 400
//   - DOB invalid / age out  → 400
//   - non-string field value → 400
//   - email/phone shape      → 400 (loose check)
//   - honeypot field set     → 200 silent drop, no email
//   - per-IP rate limit      → 429

import { esc, EMAIL_FROM } from './_shared.mjs';
import { REGISTRY, fieldAllowed, resolveRecipient } from './_ydp-registry.mjs';

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_FIELD_LEN = 8 * 1024;
const HONEYPOT = '_hp';

// In-memory rate limiter — per-instance only. Survives soft starts within a
// warm Netlify function instance; new instances reset. This is "basic" rate
// limiting as called for in the plan; durable rate limiting is post-launch.
const RATE = { window: 60_000, max: 6, hits: new Map() };
function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const arr = (RATE.hits.get(ip) || []).filter(t => now - t < RATE.window);
  arr.push(now);
  RATE.hits.set(ip, arr);
  return arr.length > RATE.max;
}

function ageFromDob(d, m, y) {
  const day = parseInt(d, 10), month = parseInt(m, 10), year = parseInt(y, 10);
  if (!day || !month || !year) return null;
  const dob = new Date(year, month - 1, day);
  if (isNaN(dob.getTime())) return null;
  if (dob.getFullYear() !== year || dob.getMonth() !== month - 1 || dob.getDate() !== day) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const diffM = today.getMonth() - dob.getMonth();
  if (diffM < 0 || (diffM === 0 && today.getDate() < dob.getDate())) age--;
  return age < 0 ? null : age;
}

function bad(message, status = 400) {
  return Response.json({ error: { message } }, { status });
}

function isLooseEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
function isLoosePhone(s) {
  return typeof s === 'string' && /^[\d\s\-+()]{6,}$/.test(s);
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || '';
  if (rateLimited(ip)) return bad('Too many submissions. Please try again in a minute.', 429);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return bad('Request body too large.', 413);

  let body;
  try { body = JSON.parse(raw); } catch { return bad('Invalid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('Request body must be an object.');

  const { formId, formData } = body;
  if (typeof formId !== 'string' || !formId) return bad('formId is required.');
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) return bad('formData must be an object.');

  const entry = REGISTRY[formId];
  if (!entry) return bad('Unknown formId.');

  // Honeypot: if a bot fills the hidden field we silently 200 with a
  // fake-looking ref. No email is sent.
  if (typeof formData[HONEYPOT] === 'string' && formData[HONEYPOT].trim() !== '') {
    return Response.json({ referenceNumber: `${entry.refPrefix}-DROPPED` });
  }

  // Validate field shape and allow-list. Drop honeypot from later processing.
  const cleaned = {};
  for (const [k, v] of Object.entries(formData)) {
    if (k === HONEYPOT) continue;
    if (k === 'age') continue; // server-computed
    if (!fieldAllowed(k, entry.allowedFields)) return bad(`Field not allowed: ${k}`);
    if (Array.isArray(v)) {
      if (v.some(x => typeof x !== 'string' && typeof x !== 'number' && typeof x !== 'boolean')) {
        return bad(`Invalid value for ${k}.`);
      }
    } else if (v !== null && v !== undefined) {
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
        return bad(`Invalid value for ${k}.`);
      }
      // CV base64 has its own size cap (5 MB raw ≈ 6.7 MB base64).
      const cap = (k === 'cv-file-base64') ? 7 * 1024 * 1024 : MAX_FIELD_LEN;
      if (typeof v === 'string' && v.length > cap) return bad(`Value too long for ${k}.`);
    }
    cleaned[k] = v;
  }

  // Required fields.
  for (const r of entry.requiredFields) {
    const v = cleaned[r];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      return bad(`Missing required field: ${r}`);
    }
  }

  // Loose email / phone validation where present.
  const userEmail = cleaned.email || cleaned['contact-email'] || '';
  if (userEmail && !isLooseEmail(userEmail)) return bad('Invalid email address.');
  for (const k of ['phone', 'phone-mobile', 'phone-home', 'business-phone', 'ec-phone', 'ec-phone-mobile', 'ec-phone-home']) {
    if (cleaned[k] && !isLoosePhone(cleaned[k])) return bad(`Invalid value for ${k}.`);
  }

  // DOB / age gate.
  const computedAge = ageFromDob(cleaned['dob-day'], cleaned['dob-month'], cleaned['dob-year']);
  if (cleaned['dob-day'] || cleaned['dob-month'] || cleaned['dob-year']) {
    if (computedAge === null) return bad('Invalid date of birth.');
  }
  if (entry.ageMin !== null && entry.ageMin !== undefined) {
    if (computedAge === null || computedAge < entry.ageMin) return bad(`Applicants must be at least ${entry.ageMin} years old.`);
  }
  if (entry.ageMax !== null && entry.ageMax !== undefined) {
    if (computedAge === null || computedAge > entry.ageMax) return bad(`Applicants must be ${entry.ageMax} years old or younger.`);
  }
  if (computedAge !== null) cleaned.age = computedAge;

  // Derive full-name back-compat.
  if (!cleaned['full-name'] && (cleaned['first-name'] || cleaned['last-name'])) {
    cleaned['full-name'] = [cleaned['first-name'], cleaned['last-name']].filter(Boolean).join(' ');
  }

  // Resolve recipient.
  const env = process.env;
  if (!env.RESEND_API_KEY) return bad('RESEND_API_KEY not configured on the server.', 500);
  const recipient = resolveRecipient(entry, env);
  if (!recipient) return bad('No recipient configured for this form.', 500);

  const overrideTo = (env.EMAIL_OVERRIDE_TO || '').trim();
  const subjectPrefix = overrideTo ? '[OVERRIDE] ' : '';
  const referenceNumber = `${entry.refPrefix}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const contactEmail = recipient;
  const contactPhone = entry.contactPhone || env.DEPT_CONTACT_PHONE || '';

  // Strip CV attachment fields from summary; surface as email attachment.
  let cvBase64 = cleaned['cv-file-base64'];
  let cvType = cleaned['cv-file-type'];
  let cvFilename = cleaned['cv-filename'];
  delete cleaned['cv-file-base64'];
  delete cleaned['cv-file-type'];
  if (typeof cvBase64 !== 'string' || !cvBase64) cvBase64 = undefined;
  if (typeof cvType !== 'string' || !cvType) cvType = undefined;
  if (typeof cvFilename !== 'string' || !cvFilename) cvFilename = undefined;

  // Build the dept summary table (full data — recipient is registry-approved).
  const summaryRows = Object.entries(cleaned)
    .filter(([, v]) => v !== null && v !== '' && v !== undefined && !(Array.isArray(v) && v.length === 0))
    .map(([key, val]) => {
      const label = key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const display = Array.isArray(val) ? val.join(', ') : val;
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e0e4e9;font-weight:600;vertical-align:top;white-space:nowrap">${esc(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #e0e4e9">${esc(display)}</td></tr>`;
    })
    .join('');

  const summaryTable = `<table style="width:100%;border-collapse:collapse;font-family:Figtree,sans-serif;font-size:15px">${summaryRows}</table>`;

  // Applicant confirmation: reference only, no PII or form summary.
  const applicantHtml = `
    <div style="font-family:Figtree,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#0e5f64;color:#fff;padding:24px;border-radius:6px 6px 0 0">
        <h1 style="margin:0;font-size:22px">We received your ${esc(entry.formName)}</h1>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e0e4e9;border-top:none;border-radius:0 0 6px 6px">
        <p style="margin:0 0 8px">Your reference number is:</p>
        <p style="font-size:24px;font-weight:700;margin:0 0 20px;color:#0e5f64">${esc(referenceNumber)}</p>
        <p>Keep this number safe. You may need it if you contact us about your application.</p>
        <h2 style="font-size:17px;margin:24px 0 12px;border-bottom:2px solid #e0e4e9;padding-bottom:8px">If you have questions</h2>
        <p style="margin:0 0 6px">Email: <a href="mailto:${esc(contactEmail)}" style="color:#0e5f64">${esc(contactEmail)}</a></p>
        <p style="margin:0">Phone: ${esc(contactPhone)}</p>
        <hr style="border:none;border-top:1px solid #e0e4e9;margin:24px 0">
        <p style="font-size:13px;color:#595959">Prototype — alpha.gov.bb. This is not yet an official Government of Barbados service.</p>
      </div>
    </div>`;

  const deptHtml = `
    <div style="font-family:Figtree,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#00267f;color:#fff;padding:24px;border-radius:6px 6px 0 0">
        <h1 style="margin:0;font-size:22px">New submission: ${esc(entry.formName)}</h1>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e0e4e9;border-top:none;border-radius:0 0 6px 6px">
        <p><strong>Reference:</strong> ${esc(referenceNumber)}</p>
        <p><strong>Form ID:</strong> ${esc(formId)}</p>
        <p><strong>Applicant email:</strong> ${esc(userEmail || 'Not provided')}</p>
        <h2 style="font-size:17px;margin:24px 0 12px;border-bottom:2px solid #e0e4e9;padding-bottom:8px">Form data</h2>
        ${summaryTable}
      </div>
    </div>`;

  const errors = [];
  const sendEmail = async ({ to, subject, html, attachments }) => {
    const payload = { from: EMAIL_FROM, to, subject, html };
    if (attachments && attachments.length) payload.attachments = attachments;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Resend ${res.status}`);
    }
  };

  if (userEmail) {
    try {
      await sendEmail({
        to: overrideTo || userEmail,
        subject: `${subjectPrefix}We received your ${entry.formName} — ref ${referenceNumber}`,
        html: applicantHtml
      });
    } catch (e) {
      errors.push(`Applicant email failed: ${e.message}`);
    }
  }

  try {
    const internalTo = overrideTo || recipient;
    const attachments = (cvBase64 && cvType && cvFilename)
      ? [{ filename: cvFilename, content: cvBase64, content_type: cvType }]
      : undefined;
    await sendEmail({
      to: internalTo,
      subject: `${subjectPrefix}New submission: ${entry.formName} — ${referenceNumber}`,
      html: deptHtml,
      attachments
    });
  } catch (e) {
    errors.push(`Department email failed: ${e.message}`);
  }

  return Response.json({
    referenceNumber,
    emailsSent: errors.length === 0,
    errors: errors.length ? errors : undefined
  });
}

export const config = { path: '/api/ydp-submit' };
