'use strict';
/**
 * POST /voice/confirm
 * Form is complete — generates a reference number, reads it to the caller, hangs up.
 */

const sessions     = require('../lib/sessions');
const referenceMap = require('../../lib/reference');
const { sayAndHangup, spellOut } = require('../lib/twiml');

module.exports = function confirm(req, res) {
  const callSid = req.body.CallSid;
  const session = sessions.get(callSid);

  res.type('text/xml');

  if (!session || !session.form) {
    res.send(sayAndHangup('Your form has been received. Thank you for calling. Goodbye.'));
    return;
  }

  const formName  = session.form.name;
  const prefix    = referenceMap[formName] || session.form.ref || 'REF';
  const suffix    = Math.random().toString(36).substring(2, 8).toUpperCase();
  const refNumber = prefix + '-' + suffix;

  sessions.remove(callSid);

  console.log(`[confirm] CallSid=${callSid} form="${formName}" ref=${refNumber}`);

  const message =
    `I have collected all the information needed for your ${formName}. ` +
    `Your reference number is: ${spellOut(refNumber)} ` +
    `Please write that down. ` +
    `We will be in touch if we need anything else from you. ` +
    `Thank you for calling the Government of Barbados. Goodbye.`;

  res.send(sayAndHangup(message));
};
