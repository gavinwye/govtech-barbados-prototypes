'use strict';
/**
 * TwiML response builders and speech helpers.
 * Twilio expects XML responses — we build them as template strings (no SDK needed).
 */

const VOICE    = 'Polly.Amy';   // Amazon Polly via Twilio — clear British English
const LANGUAGE = 'en-US';       // Speech recognition language for <Gather>

/**
 * Strips markdown so text sounds natural when read aloud.
 */
function stripMarkdown(text) {
  return text
    .replace(/##COMPLETE##[\s\S]*/g, '')   // remove completion marker + JSON
    .replace(/\*\*(.+?)\*\*/g, '$1')       // **bold** → bold
    .replace(/\*(.+?)\*/g, '$1')           // *italic* → italic
    .replace(/^[-•]\s+(.+)$/gm, '$1.')     // bullet points → plain sentences
    .replace(/^#{1,6}\s+/gm, '')           // headings
    .replace(/\s+/g, ' ')                  // collapse whitespace
    .trim();
}

/**
 * Spells out a reference number so Polly reads it correctly.
 * e.g. "UB-A3K7F2" → "U. B. minus A. 3. K. 7. F. 2."
 */
function spellOut(refNumber) {
  return refNumber
    .replace(/-/g, ' minus ')
    .split('')
    .filter(c => c !== ' ')
    .join('. ') + '.';
}

/**
 * Speak a message, then listen for the caller's reply.
 * On silence, Twilio falls through to the <Say> below <Gather> and redirects.
 */
function gatherResponse(sayText, actionPath) {
  const escaped = xmlEscape(sayText);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${actionPath}" method="POST" speechTimeout="auto" timeout="5" language="${LANGUAGE}">
    <Say voice="${VOICE}">${escaped}</Say>
  </Gather>
  <Say voice="${VOICE}">Sorry, I didn't catch that. Please try again.</Say>
  <Redirect method="POST">${actionPath}</Redirect>
</Response>`;
}

/**
 * Speak a final message and hang up.
 */
function sayAndHangup(text) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}">${xmlEscape(text)}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Redirect to another webhook endpoint (Twilio re-POSTs with original call params).
 */
function redirect(path) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${path}</Redirect>
</Response>`;
}

function xmlEscape(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

module.exports = { gatherResponse, sayAndHangup, redirect, stripMarkdown, spellOut };
