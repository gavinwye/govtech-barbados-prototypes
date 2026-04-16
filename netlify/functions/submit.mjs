export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return Response.json(
      { error: 'RESEND_API_KEY not configured on the server.' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const { formName, formId, formRef, formData, userEmail } = body;
  const prefix = formRef || 'REF';
  const referenceNumber = prefix + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  // Build a readable summary of the form data
  const summaryRows = Object.entries(formData || {})
    .filter(([, v]) => v !== null && v !== '' && v !== undefined)
    .map(([key, val]) => {
      const label = key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e0e4e9;font-weight:600;vertical-align:top;white-space:nowrap">${label}</td><td style="padding:8px 12px;border-bottom:1px solid #e0e4e9">${String(val)}</td></tr>`;
    })
    .join('');

  const summaryTable = `<table style="width:100%;border-collapse:collapse;font-family:Figtree,sans-serif;font-size:15px">${summaryRows}</table>`;

  // Derive the department email: form-id@govtech.bb
  const deptEmail = `${(formId || 'general').replace(/[^a-z0-9-]/g, '')}@govtech.bb`;

  const fromAddress = 'Government of Barbados <onboarding@resend.dev>';

  // --- Email 1: Confirmation to the applicant ---
  const applicantHtml = `
    <div style="font-family:Figtree,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#0e5f64;color:#fff;padding:24px;border-radius:6px 6px 0 0">
        <h1 style="margin:0;font-size:22px">We received your ${formName || 'form'}</h1>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e0e4e9;border-top:none;border-radius:0 0 6px 6px">
        <p style="margin:0 0 8px">Your reference number is:</p>
        <p style="font-size:24px;font-weight:700;margin:0 0 20px;color:#0e5f64">${referenceNumber}</p>
        <p>Keep this number safe. You may need it if you contact us about your application.</p>
        <h2 style="font-size:17px;margin:24px 0 12px;border-bottom:2px solid #e0e4e9;padding-bottom:8px">What you told us</h2>
        ${summaryTable}
        <h2 style="font-size:17px;margin:24px 0 12px;border-bottom:2px solid #e0e4e9;padding-bottom:8px">What happens next</h2>
        <p>We will review your submission and contact you if we need anything else. This usually takes up to 5 working days.</p>
        <hr style="border:none;border-top:1px solid #e0e4e9;margin:24px 0">
        <p style="font-size:13px;color:#595959">This is an automated message from the Government of Barbados. Please do not reply to this email.</p>
      </div>
    </div>`;

  // --- Email 2: Notification to the department ---
  const deptHtml = `
    <div style="font-family:Figtree,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#00267f;color:#fff;padding:24px;border-radius:6px 6px 0 0">
        <h1 style="margin:0;font-size:22px">New submission: ${formName || 'Unknown form'}</h1>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e0e4e9;border-top:none;border-radius:0 0 6px 6px">
        <p><strong>Reference:</strong> ${referenceNumber}</p>
        <p><strong>Applicant email:</strong> ${userEmail || 'Not provided'}</p>
        <h2 style="font-size:17px;margin:24px 0 12px;border-bottom:2px solid #e0e4e9;padding-bottom:8px">Form data</h2>
        ${summaryTable}
        <hr style="border:none;border-top:1px solid #e0e4e9;margin:24px 0">
        <p style="font-size:13px;color:#595959">Submitted via the GovTech Barbados chat assistant.</p>
      </div>
    </div>`;

  const errors = [];

  // Send confirmation to applicant (if we have their email)
  if (userEmail) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`
        },
        body: JSON.stringify({
          from: fromAddress,
          to: userEmail,
          subject: `We received your ${formName || 'form'} — ref ${referenceNumber}`,
          html: applicantHtml
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        errors.push(`Applicant email failed: ${err.message || res.status}`);
      }
    } catch (e) {
      errors.push(`Applicant email failed: ${e.message}`);
    }
  }

  // Send notification to department
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`
      },
      body: JSON.stringify({
        from: fromAddress,
        to: deptEmail,
        subject: `New submission: ${formName || 'Unknown'} — ${referenceNumber}`,
        html: deptHtml
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      errors.push(`Department email failed: ${err.message || res.status}`);
    }
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
