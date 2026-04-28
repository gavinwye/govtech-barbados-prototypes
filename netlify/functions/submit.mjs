import { esc, EMAIL_FROM } from './_shared.mjs';

const MAX_BODY_BYTES = 32 * 1024;

function ageFromDob(d, m, y) {
  const day = parseInt(d, 10);
  const month = parseInt(m, 10);
  const year = parseInt(y, 10);
  if (!day || !month || !year) return null;
  const dob = new Date(year, month - 1, day);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const diffM = today.getMonth() - dob.getMonth();
  if (diffM < 0 || (diffM === 0 && today.getDate() < dob.getDate())) age--;
  return age < 0 ? null : age;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json(
      { error: { message: 'Request body too large.' } },
      { status: 413 }
    );
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: { message: 'Invalid JSON.' } },
      { status: 400 }
    );
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json(
      { error: { message: 'Request body must be an object.' } },
      { status: 400 }
    );
  }

  const { formName, formId, formRef, formData, userEmail, deptContactEmail, deptContactPhone } = body;

  if (formData !== undefined && (typeof formData !== 'object' || formData === null || Array.isArray(formData))) {
    return Response.json(
      { error: { message: 'formData must be an object when provided.' } },
      { status: 400 }
    );
  }
  for (const [key, val] of [['formName', formName], ['formId', formId], ['formRef', formRef], ['userEmail', userEmail], ['deptContactEmail', deptContactEmail], ['deptContactPhone', deptContactPhone]]) {
    if (val !== undefined && typeof val !== 'string') {
      return Response.json(
        { error: { message: `${key} must be a string when provided.` } },
        { status: 400 }
      );
    }
  }

  const {
    RESEND_API_KEY,
    DEMO_RECIPIENT,
    DEPT_CONTACT_EMAIL,
    DEPT_CONTACT_PHONE,
    EMAIL_OVERRIDE_TO
  } = process.env;

  for (const [name, val] of Object.entries({
    RESEND_API_KEY,
    DEMO_RECIPIENT,
    DEPT_CONTACT_EMAIL,
    DEPT_CONTACT_PHONE
  })) {
    if (!val) {
      return Response.json(
        { error: { message: `${name} not configured on the server.` } },
        { status: 500 }
      );
    }
  }

  const overrideTo = EMAIL_OVERRIDE_TO && EMAIL_OVERRIDE_TO.trim();
  const subjectPrefix = overrideTo ? '[OVERRIDE] ' : '';

  const contactEmail = deptContactEmail || DEPT_CONTACT_EMAIL;
  const contactPhone = deptContactPhone || DEPT_CONTACT_PHONE;

  const prefix = formRef || 'REF';
  const referenceNumber = prefix + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  const enrichedFormData = { ...(formData || {}) };
  // Drop any client-supplied age — authoritative age is computed server-side.
  delete enrichedFormData.age;

  const computedAge = ageFromDob(
    enrichedFormData['dob-day'],
    enrichedFormData['dob-month'],
    enrichedFormData['dob-year']
  );
  if (computedAge !== null) enrichedFormData.age = computedAge;

  // Derive `full-name` from `first-name` + `last-name` for back-compat with
  // any email/template that reads the old key.
  if (!enrichedFormData['full-name'] && (enrichedFormData['first-name'] || enrichedFormData['last-name'])) {
    enrichedFormData['full-name'] = [enrichedFormData['first-name'], enrichedFormData['last-name']]
      .filter(Boolean).join(' ');
  }

  const summaryRows = Object.entries(enrichedFormData)
    .filter(([, v]) => v !== null && v !== '' && v !== undefined)
    .map(([key, val]) => {
      const label = key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e0e4e9;font-weight:600;vertical-align:top;white-space:nowrap">${esc(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #e0e4e9">${esc(val)}</td></tr>`;
    })
    .join('');

  const summaryTable = `<table style="width:100%;border-collapse:collapse;font-family:Figtree,sans-serif;font-size:15px">${summaryRows}</table>`;

  // --- Email 1: Confirmation to the applicant (slim, no PII, no form summary) ---
  const applicantHtml = `
    <div style="font-family:Figtree,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#0e5f64;color:#fff;padding:24px;border-radius:6px 6px 0 0">
        <h1 style="margin:0;font-size:22px">We received your ${esc(formName || 'form')}</h1>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e0e4e9;border-top:none;border-radius:0 0 6px 6px">
        <p style="margin:0 0 8px">Your reference number is:</p>
        <p style="font-size:24px;font-weight:700;margin:0 0 20px;color:#0e5f64">${esc(referenceNumber)}</p>
        <p>Keep this number safe. You may need it if you contact us about your application.</p>
        <h2 style="font-size:17px;margin:24px 0 12px;border-bottom:2px solid #e0e4e9;padding-bottom:8px">What happens next</h2>
        <p>We will review your submission and contact you if we need anything else. This usually takes up to 5 working days.</p>
        <h2 style="font-size:17px;margin:24px 0 12px;border-bottom:2px solid #e0e4e9;padding-bottom:8px">If you have questions</h2>
        <p style="margin:0 0 6px">Email: <a href="mailto:${esc(contactEmail)}" style="color:#0e5f64">${esc(contactEmail)}</a></p>
        <p style="margin:0">Phone: ${esc(contactPhone)}</p>
        <hr style="border:none;border-top:1px solid #e0e4e9;margin:24px 0">
        <p style="font-size:13px;color:#595959">Prototype — alpha.gov.bb. This is not an official Government of Barbados service.</p>
      </div>
    </div>`;

  // --- Email 2: Internal notification with full form data ---
  const deptHtml = `
    <div style="font-family:Figtree,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#00267f;color:#fff;padding:24px;border-radius:6px 6px 0 0">
        <h1 style="margin:0;font-size:22px">New submission: ${esc(formName || 'Unknown form')}</h1>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e0e4e9;border-top:none;border-radius:0 0 6px 6px">
        <p><strong>Reference:</strong> ${esc(referenceNumber)}</p>
        <p><strong>Applicant email:</strong> ${esc(userEmail || 'Not provided')}</p>
        <h2 style="font-size:17px;margin:24px 0 12px;border-bottom:2px solid #e0e4e9;padding-bottom:8px">Form data</h2>
        ${summaryTable}
        <hr style="border:none;border-top:1px solid #e0e4e9;margin:24px 0">
        <p style="font-size:13px;color:#595959">Submitted via <a href="https://alpha.gov.bb" style="color:#00267f">alpha.gov.bb</a>.</p>
      </div>
    </div>`;

  const errors = [];

  const sendEmail = async ({ to, cc, subject, html }) => {
    const payload = { from: EMAIL_FROM, to, subject, html };
    if (cc) payload.cc = cc;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`
      },
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
        subject: `${subjectPrefix}We received your ${formName || 'form'} — ref ${referenceNumber}`,
        html: applicantHtml
      });
    } catch (e) {
      errors.push(`Applicant email failed: ${e.message}`);
    }
  }

  try {
    const internalTo = overrideTo || (deptContactEmail || DEMO_RECIPIENT);
    const internalCc = !overrideTo && deptContactEmail && deptContactEmail !== DEMO_RECIPIENT ? [DEMO_RECIPIENT] : undefined;
    await sendEmail({
      to: internalTo,
      cc: internalCc,
      subject: `${subjectPrefix}New submission: ${formName || 'Unknown'} — ${referenceNumber}`,
      html: deptHtml
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

export const config = {
  path: '/api/submit'
};
