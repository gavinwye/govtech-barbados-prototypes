'use strict';
/**
 * POST /voice/respond
 * Main conversation loop — called once per caller turn throughout the form.
 * Detects ##COMPLETE## and redirects to /voice/confirm when the form is done.
 */

const sessions = require('../lib/sessions');
const { callGroq, CHAT_MODEL } = require('../lib/groq');
const { gatherResponse, sayAndHangup, redirect, stripMarkdown } = require('../lib/twiml');

const MAX_TURNS = 40;

module.exports = async function respond(req, res) {
  const callSid    = req.body.CallSid;
  const speechText = req.body.SpeechResult;
  const session    = sessions.get(callSid);

  res.type('text/xml');

  if (!session) {
    res.send(sayAndHangup('Sorry, your session has expired. Please call back.'));
    return;
  }

  if (!speechText) {
    res.send(gatherResponse("Sorry, I didn't catch that. Could you say that again?", '/voice/respond'));
    return;
  }

  session.turnCount++;

  if (session.turnCount > MAX_TURNS) {
    res.send(sayAndHangup(
      "We've been talking for a while and I need to end this session. " +
      "Please call back to continue, or visit alpha dot gov dot b b. Goodbye."
    ));
    return;
  }

  session.messages.push({ role: 'user', content: speechText });

  try {
    const reply = await callGroq(session.messages, CHAT_MODEL);
    session.messages.push({ role: 'assistant', content: reply });

    // Check for the form completion signal
    if (reply.indexOf('##COMPLETE##') !== -1) {
      const afterMarker = reply.substring(reply.indexOf('##COMPLETE##') + '##COMPLETE##'.length).trim();
      const jsonData = tryParseJson(afterMarker);

      if (jsonData) {
        session.formData = jsonData;
        session.phase    = 'complete';
        // Twilio re-POSTs CallSid when following a <Redirect>, so no need to pass it
        res.send(redirect('/voice/confirm'));
        return;
      }
      // JSON parse failed — keep going, the LLM will ask again
    }

    const spoken = stripMarkdown(reply);
    if (!spoken) {
      res.send(gatherResponse("Could you repeat that?", '/voice/respond'));
      return;
    }

    res.send(gatherResponse(spoken, '/voice/respond'));
  } catch (err) {
    console.error('[respond] Groq error:', err.message);
    // Remove the failed user turn to keep context clean
    session.messages.pop();
    res.send(gatherResponse(
      "I'm having trouble connecting. Please say your answer again.",
      '/voice/respond'
    ));
  }
};

function tryParseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(cleaned.substring(start, end + 1)); } catch (_) { return null; }
}
