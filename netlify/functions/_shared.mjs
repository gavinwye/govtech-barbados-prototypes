// Shared helpers imported by the email-sending functions. Netlify still
// deploys this file as a function (same as telegram-data.mjs) but without a
// default export it just 500s if hit directly — harmless, no state change.

// HTML-escape any interpolated value. Outbound emails are rendered as HTML
// and include attacker-controlled form data, so every interpolation must be
// escaped to prevent HTML/CSS injection.
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const EMAIL_FROM = process.env.EMAIL_FROM || 'alpha.gov.bb prototype <onboarding@resend.dev>';
