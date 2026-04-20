#!/usr/bin/env node
'use strict';

/**
 * build-telegram-data.js
 *
 * Reads the browser-side form data files (which set window.* globals)
 * and the inline prompts from index.html, then outputs a single
 * ESM module at netlify/functions/telegram-data.mjs that the Telegram
 * webhook function can import.
 *
 * NOTE: The chat runtime was moved from Prototypes/chat-interface.html
 * into index.html at the root. /Prototypes/chat-interface.html is now a
 * redirect shell; it no longer contains BASE_RULES / FORMS / SYSTEM_PROMPTS
 * / FORM_DESCRIPTIONS.
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
  'assets/bla-new-forms-data.js',
  'assets/caipo-forms-data.js',
  'assets/immd-forms-data.js',
  'assets/other-forms-data.js',
  'assets/govt-forms-data.js',
  'assets/police-forms-data.js',
];

for (const rel of dataFiles) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(code, context);
}

// ── 2. Extract inline data from index.html ──

const html = fs.readFileSync(
  path.join(ROOT, 'index.html'),
  'utf8'
);

// Extract the BASE_RULES string
const baseRulesMatch = html.match(/var BASE_RULES\s*=\s*`([\s\S]*?)`;/);
if (!baseRulesMatch) throw new Error('Could not find BASE_RULES in index.html');
const BASE_RULES = baseRulesMatch[1];

// Extract inline FORMS array (the 9 core forms)
const formsMatch = html.match(/var FORMS\s*=\s*\[([\s\S]*?)\]\.concat/);
if (!formsMatch) throw new Error('Could not find FORMS in index.html');
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
  ...(window.BLA_NEW_FORMS || []),
  ...(window.CAIPO_FORMS || []),
  ...(window.IMMD_FORMS || []),
  ...(window.OTHER_FORMS || []),
  ...(window.GOVT_FORMS || []),
  ...(window.POLICE_FORMS || []),
];

// Extract inline SYSTEM_PROMPTS
const promptsMatch = html.match(/var SYSTEM_PROMPTS\s*=\s*\{([\s\S]*?)\n\};/);
if (!promptsMatch) throw new Error('Could not find SYSTEM_PROMPTS in index.html');

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
  window.BLA_NEW_SYSTEM_PROMPTS,
  window.CAIPO_SYSTEM_PROMPTS,
  window.IMMD_SYSTEM_PROMPTS,
  window.OTHER_SYSTEM_PROMPTS,
  window.GOVT_SYSTEM_PROMPTS,
  window.POLICE_SYSTEM_PROMPTS,
];
for (const set of externalSets) {
  if (!set) continue;
  for (const [id, prompt] of Object.entries(set)) {
    allPrompts[id] = prompt.replace('<<BASE_RULES>>', BASE_RULES);
  }
}

// Extract FORM_DESCRIPTIONS
const descMatch = html.match(/var FORM_DESCRIPTIONS\s*=\s*\{([\s\S]*?)\n\};/);
if (!descMatch) throw new Error('Could not find FORM_DESCRIPTIONS in index.html');
const descriptions = vm.runInContext('({' + descMatch[1] + '})', vm.createContext({}));

// Build the routing prompt (same logic as index.html)
const routingLines = allForms.map(f => {
  const desc = descriptions[f.id] || f.name;
  return `${f.id} — ${f.name}: ${desc}`;
});
const ROUTING_PROMPT =
  'You help citizens of Barbados find the right government service for what they need to do, in plain conversation.\n\n' +
  'HOW YOU WORK:\n' +
  'You have a short conversation to figure out which ONE service the user needs. Then you hand off.\n\n' +
  '- Ask questions to narrow down. One question at a time. Plain language, no filler ("Of course!", "Absolutely!", "Great!").\n' +
  '- Every question should move toward a specific service. Don\'t ask the same thing twice in different words.\n' +
  '- GREEN LIGHT: the user\'s latest message clearly identifies ONE specific service — either because they named it, or because they said yes to a question of yours that was specific enough to pin it down. That\'s the go signal.\n' +
  '- Once you have the green light, your NEXT message is the handoff (format below) — sentinel + JSON, NOTHING ELSE.\n' +
  '- Do NOT follow a user\'s "yes" to a narrowing question with another "Shall I start?" — that\'s the same check twice. One green light is enough. If the narrowing question already pinned down the service, the yes IS the green light.\n\n' +
  'Every message you send is EITHER a single question OR the handoff — never both in the same message.\n\n' +
  'HANDOFF FORMAT — when, and ONLY when, the user has confirmed:\n' +
  '- Output ##ROUTED## on its own line.\n' +
  '- On the very next line, output a single valid JSON object: {"serviceId": "<id>"} — where <id> is one of the IDs in the list below, exactly as written.\n' +
  '- Nothing else after the JSON.\n\n' +
  'Be warm and brief. Use contractions. Always say "service", never "form". Don\'t offer anything outside the services below.\n\n' +
  'Services:\n' +
  routingLines.join('\n');

// ── Load alpha.gov.bb service content from markdown files ──

const ALPHA_CONTENT_DIR = path.join(ROOT, 'data', 'alpha-gov-bb');
let SERVICES_KNOWLEDGE = '';

try {
  const mdFiles = fs.readdirSync(ALPHA_CONTENT_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();

  const sections = mdFiles.map(f => {
    const content = fs.readFileSync(path.join(ALPHA_CONTENT_DIR, f), 'utf8');
    const slug = f.replace('.md', '');
    return `--- ${slug} (https://alpha.gov.bb/${slug}) ---\n${content}`;
  });

  SERVICES_KNOWLEDGE = `
DETAILED GOVERNMENT SERVICES KNOWLEDGE FROM alpha.gov.bb
=========================================================
Use this information to answer questions about government services.
When users ask about requirements, fees, documents, eligibility, processing times, etc.,
answer from this knowledge base. Be specific — cite fees, documents needed, timelines.
Always include the alpha.gov.bb URL so the user can visit for the latest information.

${sections.join('\n\n')}`;

  const charCount = SERVICES_KNOWLEDGE.length;
  const tokenEstimate = Math.round(charCount / 4);
  console.log(`Loaded ${mdFiles.length} service pages from data/alpha-gov-bb/ (${charCount} chars, ~${tokenEstimate} tokens)`);
} catch (err) {
  console.warn('Warning: Could not load alpha.gov.bb content:', err.message);
  SERVICES_KNOWLEDGE = '\nNo detailed service information available. Suggest users visit alpha.gov.bb.\n';
}

// Build the concierge prompt
const formList = allForms.map(f => {
  const desc = descriptions[f.id] || f.name;
  return `  ${f.id} — ${f.name}: ${desc}`;
}).join('\n');

// Build the completable forms summary grouped by agency
const formsByAgency = {};
for (const f of allForms) {
  const agency = f.agency || 'Other';
  if (!formsByAgency[agency]) formsByAgency[agency] = [];
  formsByAgency[agency].push(f.name);
}
const completableFormsList = Object.entries(formsByAgency)
  .map(([agency, names]) => `${agency}:\n${names.map(n => `  - ${n}`).join('\n')}`)
  .join('\n\n');

const CONCIERGE_PROMPT = `You are a friendly, helpful assistant for the Government of Barbados. You help people find and access government services.

You can help people in three ways:
1. FILL IN GOVERNMENT FORMS — you can walk people through completing ${allForms.length} government forms conversationally
2. ANSWER QUESTIONS ABOUT SERVICES — you have detailed knowledge about government services from alpha.gov.bb, including requirements, fees, documents needed, eligibility, and processing times
3. POINT PEOPLE TO SERVICES — for things you can't help with directly, you can explain what's available and where to go

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
- If they're asking about a service (requirements, fees, documents, eligibility, processing times), answer from the detailed service knowledge below. Be specific — cite actual fees, documents needed, and timelines. Always include the alpha.gov.bb URL.
- If the service has an associated form you can fill in, proactively tell the user: "I can help you complete this form right now if you'd like."
- If it could match multiple things, ask a clarifying question to narrow it down.
- If you're not sure, ask them to tell you more. Suggest some possibilities based on what they said.

IMPORTANT RULES:
- Only output ##ROUTE:<formid>## when you are confident which form the user needs AND they want to proceed with it. Never route on a vague query.
- If the user is just asking questions or browsing, keep chatting — don't try to force them into a form.
- You can answer detailed questions about government services using the knowledge base below.
- If someone asks about something you don't know about, say so honestly and suggest they visit alpha.gov.bb or contact the relevant department.

FORMS YOU CAN HELP FILL IN (${allForms.length} forms):
${formList}

FORMS YOU CAN COMPLETE VIA CHAT (grouped by agency):
${completableFormsList}
When a user asks about one of these services, tell them you can help them fill in the form right now.

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
