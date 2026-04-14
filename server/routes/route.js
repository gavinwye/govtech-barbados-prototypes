'use strict';
/**
 * POST /voice/route
 * Receives the caller's first utterance and identifies which form they need.
 * Kicks off the form conversation once a match is found.
 */

const sessions          = require('../lib/sessions');
const { routeToForm }   = require('../lib/routing');
const { callGroq, CHAT_MODEL } = require('../lib/groq');
const { SYSTEM_PROMPTS }= require('../data/prompts');
const { gatherResponse, sayAndHangup, stripMarkdown } = require('../lib/twiml');

// Appended to every system prompt for phone calls — overrides markdown behaviour
const PHONE_ADDENDUM =
  '\n\nIMPORTANT: The user is speaking to you on a phone call. ' +
  'Use plain spoken language only — no markdown, no asterisks, no bullet points, ' +
  'no numbered lists. Keep every response to one or two short sentences.';

module.exports = async function route(req, res) {
  const callSid    = req.body.CallSid;
  const speechText = req.body.SpeechResult;
  const session    = sessions.get(callSid);

  res.type('text/xml');

  if (!session) {
    res.send(sayAndHangup('Sorry, your session has expired. Please call back.'));
    return;
  }

  // Caller said nothing — reprompt up to 3 times then give up
  if (!speechText) {
    session.routingAttempts++;
    if (session.routingAttempts >= 3) {
      res.send(sayAndHangup(
        'I was not able to understand what you need. ' +
        'Please visit alpha dot gov dot b b or call the main NIS helpline. Goodbye.'
      ));
      return;
    }
    res.send(gatherResponse(
      "I didn't catch that. Could you tell me what you'd like to do? " +
      "For example: claim unemployment benefit, or register as self-employed.",
      '/voice/route'
    ));
    return;
  }

  try {
    const form = await routeToForm(speechText);

    if (!form) {
      session.routingAttempts++;
      if (session.routingAttempts >= 3) {
        res.send(sayAndHangup(
          'I was not able to identify the form you need. ' +
          'Please visit alpha dot gov dot b b. Goodbye.'
        ));
        return;
      }
      res.send(gatherResponse(
        "I'm not sure which form that is. Could you describe what you'd like to do in a bit more detail?",
        '/voice/route'
      ));
      return;
    }

    const systemPrompt = SYSTEM_PROMPTS[form.id];
    if (!systemPrompt) {
      res.send(sayAndHangup("I'm sorry, I don't have that form set up yet. Please call back later."));
      return;
    }

    // Set up conversation state for this form
    session.form     = form;
    session.phase    = 'chat';
    session.messages = [{ role: 'system', content: systemPrompt + PHONE_ADDENDUM }];

    // Ask the LLM for an opening greeting
    const opener = 'Start. Greet the user in one short sentence, then ask your first question. Plain spoken language only — no markdown.';
    session.messages.push({ role: 'user', content: opener });

    const reply = await callGroq(session.messages, CHAT_MODEL);

    // Remove the internal opener — it's not part of the real conversation
    session.messages.splice(1, 1);
    session.messages.push({ role: 'assistant', content: reply });

    res.send(gatherResponse(stripMarkdown(reply), '/voice/respond'));
  } catch (err) {
    console.error('[route] Groq error:', err.message);
    res.send(gatherResponse(
      "I'm having a little trouble right now. What form do you need help with?",
      '/voice/route'
    ));
  }
};
