'use strict';
/**
 * Identifies which government form a caller needs based on natural language.
 * Uses the fast Groq model — same routing logic as the web chat interface.
 */

const { callGroq, FAST_MODEL } = require('./groq');
const { FORMS, ROUTING_PROMPT } = require('../data/prompts');

async function routeToForm(userText) {
  const reply = await callGroq([
    { role: 'system', content: ROUTING_PROMPT },
    { role: 'user',   content: userText },
  ], FAST_MODEL);

  const formId = reply.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  return FORMS.find(f => f.id === formId) || null;
}

module.exports = { routeToForm };
