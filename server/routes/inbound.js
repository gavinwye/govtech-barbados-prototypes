'use strict';
/**
 * POST /voice/inbound
 * Called by Twilio when someone dials the phone number.
 * Creates a session and plays the opening greeting.
 */

const sessions = require('../lib/sessions');
const { gatherResponse } = require('../lib/twiml');

module.exports = function inbound(req, res) {
  const callSid = req.body.CallSid;
  if (!callSid) {
    res.status(400).send('Missing CallSid');
    return;
  }

  sessions.create(callSid);

  const greeting =
    'Welcome to the Government of Barbados forms assistant. ' +
    'I can help you fill in any government form by voice. ' +
    'Please tell me what you would like to do today. ' +
    'For example, say: claim unemployment benefit, or register as self-employed.';

  res.type('text/xml');
  res.send(gatherResponse(greeting, '/voice/route'));
};
