#!/usr/bin/env node
'use strict';

/**
 * build-telegram-data.js
 *
 * Reads the browser-side form data files (which set window.* globals)
 * and the inline prompts from chat-interface.html, then outputs a single
 * ESM module at netlify/functions/telegram-data.mjs that the Telegram
 * webhook function can import.
 *
 * Usage:  source ~/.nvm/nvm.sh && nvm use 22 && node scripts/build-telegram-data.cjs
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'netlify', 'functions', 'telegram-data.mjs');

// ── 1. Load browser-side form data files in a fake window context ──

const window = {};
const context = vm.createContext({ window, console });

const dataFiles = [
  'assets/bla-forms-data.js',
  'assets/caipo-forms-data.js',
  'assets/immd-forms-data.js',
  'assets/other-forms-data.js',
];

for (const rel of dataFiles) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(code, context);
}

// ── 2. Extract inline data from chat-interface.html ──

const html = fs.readFileSync(
  path.join(ROOT, 'Prototypes', 'chat-interface.html'),
  'utf8'
);

// Extract the BASE_RULES string
const baseRulesMatch = html.match(/var BASE_RULES\s*=\s*`([\s\S]*?)`;/);
if (!baseRulesMatch) throw new Error('Could not find BASE_RULES in chat-interface.html');
const BASE_RULES = baseRulesMatch[1];

// Extract inline FORMS array (the 9 core forms)
const formsMatch = html.match(/var FORMS\s*=\s*\[([\s\S]*?)\]\.concat/);
if (!formsMatch) throw new Error('Could not find FORMS in chat-interface.html');
const coreForms = JSON.parse('[' + formsMatch[1].replace(/'/g, '"').replace(/(\w+):/g, '"$1":').replace(/,\s*\]/g, ']') + ']');

// Actually, let's just eval the FORMS properly using a simpler approach
// Re-extract with a function-based approach
const formsCode = html.match(/var FORMS\s*=\s*(\[[\s\S]*?\])\.concat/);
let inlineForms;
try {
  inlineForms = vm.runInContext(
    '(' + formsCode[1].replace(/'/g, '"') + ')',
    vm.createContext({})
  );
} catch {
  // Fallback: manual extraction
  inlineForms = [];
  const re = /\{\s*id:'([^']+)',\s*name:'([^']+)',\s*ref:'([^']+)',\s*agency:'([^']+)'\s*\}/g;
  let m;
  while ((m = re.exec(formsCode[1])) !== null) {
    inlineForms.push({ id: m[1], name: m[2], ref: m[3], agency: m[4] });
  }
}

// Combine all forms
const allForms = [
  ...inlineForms,
  ...(window.BLA_FORMS || []),
  ...(window.CAIPO_FORMS || []),
  ...(window.IMMD_FORMS || []),
  ...(window.OTHER_FORMS || []),
];

// Extract inline SYSTEM_PROMPTS
const promptsMatch = html.match(/var SYSTEM_PROMPTS\s*=\s*\{([\s\S]*?)\n\};/);
if (!promptsMatch) throw new Error('Could not find SYSTEM_PROMPTS in chat-interface.html');

// Use a sandboxed eval to parse the prompts object
const promptsSandbox = vm.createContext({ BASE_RULES });
const inlinePrompts = vm.runInContext(
  '(function(){ var BASE_RULES = `' + BASE_RULES + '`; return {' + promptsMatch[1] + '}; })()',
  promptsSandbox
);

// Merge external prompts, replacing <<BASE_RULES>> placeholder
const allPrompts = { ...inlinePrompts };
const externalSets = [
  window.BLA_SYSTEM_PROMPTS,
  window.CAIPO_SYSTEM_PROMPTS,
  window.IMMD_SYSTEM_PROMPTS,
  window.OTHER_SYSTEM_PROMPTS,
];
for (const set of externalSets) {
  if (!set) continue;
  for (const [id, prompt] of Object.entries(set)) {
    allPrompts[id] = prompt.replace('<<BASE_RULES>>', BASE_RULES);
  }
}

// Extract FORM_DESCRIPTIONS
const descMatch = html.match(/var FORM_DESCRIPTIONS\s*=\s*\{([\s\S]*?)\n\};/);
if (!descMatch) throw new Error('Could not find FORM_DESCRIPTIONS in chat-interface.html');
const descriptions = vm.runInContext('({' + descMatch[1] + '})', vm.createContext({}));

// Build the routing prompt (same logic as chat-interface.html)
const routingLines = allForms.map(f => {
  const desc = descriptions[f.id] || f.name;
  return `${f.id} — ${f.name}: ${desc}`;
});
const ROUTING_PROMPT =
  'You are a routing assistant for the Government of Barbados. ' +
  'Based on what the user says they want to do, identify which form they need. ' +
  'Reply with ONLY the form ID — nothing else.\n\n' +
  'Forms:\n' +
  routingLines.join('\n') +
  '\n\nIf you can identify the form reply with its ID exactly as listed above. If you cannot, reply with "unknown".';

// Alpha.gov.bb service knowledge for the conversational concierge
const SERVICES_KNOWLEDGE = `
GOVERNMENT SERVICES ON alpha.gov.bb
====================================

Family, Birth and Relationships (alpha.gov.bb/family-birth-relationships)
- Register a birth
- Get a copy of a birth certificate
- Get a copy of a death certificate
- Get a copy of a marriage certificate
- Register a death
- Register a marriage
- Marriage licences
- Apply for a place at a day nursery

Work and Employment (alpha.gov.bb/work-employment)
- Jobseekers — help finding employment
- Apply to be a Project Protégé mentor
- Apply to the Barbados YouthADVANCE Corps (BYAC) — youth development programme
- Register for Community Sports Training Programme (Youth Development Programme)
- Register for a summer camp
- Apply to volunteer at a sports camp
- Apply for a position as a temporary teacher
- Apply to the Job Start Plus programme — employment support
- Apply for a conductor licence — transport licensing

Money and Financial Support (alpha.gov.bb/money-financial-support)
- Apply for financial assistance
- EZPay — online government payments
- Tax Online — digital tax filing
- Get disaster relief assistance
- Get a Primary School Textbook Grant

Travel, ID and Citizenship (alpha.gov.bb/travel-id-citizenship)
- Apply for a passport
- Visa information
- Visitor permit application
- Medical requirements for travel
- Apply for a driver's licence
- National registration
- Getting around Barbados — transport information
- Local information
- Ports of entry
- Get a document notarised
- Redirect personal mail (Post Office)
- Tell the Post Office someone has died
- Redirect business mail (Post Office)

Business and Trade (alpha.gov.bb/business-trade)
- Start a business — guidance for new businesses
- Registering a business name
- Business policies and law
- Financial services for businesses
- Government requirements for businesses
- Information about business tax
- Get a permit to play loud music — event/venue noise permits
- Apply for a licence to sell goods or services at a beach or park

Public Safety (alpha.gov.bb/public-safety)
- Report a concern about a child
- Report elderly abuse
- Get support for a victim of domestic abuse
`;

// Build the concierge prompt
const formList = allForms.map(f => {
  const desc = descriptions[f.id] || f.name;
  return `  ${f.id} — ${f.name}: ${desc}`;
}).join('\n');

const CONCIERGE_PROMPT = `You are a friendly, helpful assistant for the Government of Barbados. You help people find and access government services.

You can help people in two ways:
1. FILL IN GOVERNMENT FORMS — you can walk people through completing forms conversationally
2. POINT PEOPLE TO SERVICES — you know about services available on alpha.gov.bb and can explain what's available and how to access them

TONE AND STYLE:
- Be warm, conversational, and helpful — like a friendly civil servant
- Use plain, simple language a 9-year-old could understand
- Keep responses short — 2-4 sentences usually. Don't write essays
- Use Barbadian context (parishes, local references) when relevant
- Don't use filler phrases like "Of course!", "Absolutely!", "Great question!"
- Be direct and practical

WHEN SOMEONE ASKS WHAT YOU CAN HELP WITH:
Briefly explain you can help with government forms and services. Give a few examples from different categories (don't list everything). Ask what they need help with.

WHEN SOMEONE DESCRIBES A NEED:
- If it matches one of the forms you can fill in, tell them briefly what the form is for and that you can help them complete it right now. Then output the marker ##ROUTE:<formid>## on its own line at the END of your message.
- If it matches a service on alpha.gov.bb that isn't a form you can fill in, tell them about it and give them the alpha.gov.bb URL to visit.
- If it could match multiple things, ask a clarifying question to narrow it down.
- If you're not sure, ask them to tell you more. Suggest some possibilities based on what they said.

IMPORTANT RULES:
- Only output ##ROUTE:<formid>## when you are confident which form the user needs AND they want to proceed with it. Never route on a vague query.
- If the user is just asking questions or browsing, keep chatting — don't try to force them into a form.
- You can answer general questions about government services, processes, and requirements.
- If someone asks about something you don't know about, say so honestly and suggest they visit alpha.gov.bb or contact the relevant department.

FORMS YOU CAN HELP FILL IN:
${formList}

${SERVICES_KNOWLEDGE}`;


// ── 3. Write the ESM output ──

const output = `// AUTO-GENERATED by scripts/build-telegram-data.cjs — do not edit by hand.
// Re-run: source ~/.nvm/nvm.sh && nvm use 22 && node scripts/build-telegram-data.cjs
// Generated: ${new Date().toISOString()}

export const FORMS = ${JSON.stringify(allForms, null, 2)};

export const SYSTEM_PROMPTS = ${JSON.stringify(allPrompts, null, 2)};

export const ROUTING_PROMPT = ${JSON.stringify(ROUTING_PROMPT)};

export const CONCIERGE_PROMPT = ${JSON.stringify(CONCIERGE_PROMPT)};

export const FORM_DESCRIPTIONS = ${JSON.stringify(descriptions, null, 2)};
`;

fs.writeFileSync(OUT, output, 'utf8');

console.log(`Wrote ${allForms.length} forms and ${Object.keys(allPrompts).length} prompts to ${path.relative(ROOT, OUT)}`);
