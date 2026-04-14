#!/usr/bin/env node
'use strict';
/**
 * Extract system prompts from chat-interface.html and write to server/data/prompts.js
 *
 * Run:    node scripts/extract-prompts.js
 * Re-run: whenever Prototypes/chat-interface.html changes.
 */

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

const HTML_FILE   = path.resolve(__dirname, '../Prototypes/chat-interface.html');
const OUTPUT_FILE = path.resolve(__dirname, '../server/data/prompts.js');
const OUTPUT_DIR  = path.dirname(OUTPUT_FILE);

// ── Read HTML ─────────────────────────────────────────────────────────────────
const html = fs.readFileSync(HTML_FILE, 'utf8');

// Extract the main <script> block (the one that contains 'use strict' and FORMS)
const scriptMatch = html.match(/<script>\s*'use strict';[\s\S]*?<\/script>/);
if (!scriptMatch) {
  console.error('ERROR: Could not find the main <script> block in chat-interface.html');
  process.exit(1);
}

let scriptContent = scriptMatch[0]
  .replace(/^<script>/, '')
  .replace(/<\/script>$/, '');

// Remove the init() call at the end so DOM manipulation doesn't execute
scriptContent = scriptContent.replace(/^\s*init\(\);?\s*$/m, '');

// ── VM context with browser API stubs ─────────────────────────────────────────
// Returns a proxy that silently absorbs any property access or method call
function makeStub() {
  return new Proxy(function () { return makeStub(); }, {
    get: (t, p) => {
      if (p === Symbol.toPrimitive || p === 'toString') return () => '';
      if (p === 'then') return undefined; // not a thenable
      return makeStub();
    },
    set: () => true,
    apply: () => makeStub(),
  });
}

const ctx = vm.createContext({
  window:       { BLA_FORMS: [], BLA_SYSTEM_PROMPTS: {} },
  document:     { getElementById: makeStub, createElement: makeStub },
  localStorage: { getItem: () => null, setItem: () => {} },
  location:     { hash: '' },
  navigator:    { mediaDevices: null },
  speechSynthesis: null,
  setTimeout:   () => {},
  setInterval:  () => {},
  clearInterval:() => {},
  console,
  fetch: async () => ({ ok: false, json: async () => ({}) }),
});

// ── Evaluate ──────────────────────────────────────────────────────────────────
try {
  vm.runInContext(scriptContent, ctx);
} catch (e) {
  console.error('ERROR: VM evaluation failed:', e.message);
  console.error(e.stack);
  process.exit(1);
}

const { FORMS, BASE_RULES, SYSTEM_PROMPTS, FORM_DESCRIPTIONS, ROUTING_PROMPT } = ctx;

// Validate
if (!FORMS || !Array.isArray(FORMS) || FORMS.length === 0) {
  console.error('ERROR: FORMS not found or empty');
  process.exit(1);
}
if (!SYSTEM_PROMPTS || typeof SYSTEM_PROMPTS !== 'object') {
  console.error('ERROR: SYSTEM_PROMPTS not found');
  process.exit(1);
}
if (!ROUTING_PROMPT) {
  console.error('ERROR: ROUTING_PROMPT not found');
  process.exit(1);
}

// ── Write output ──────────────────────────────────────────────────────────────
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const output =
`// server/data/prompts.js
// GENERATED — do not edit by hand.
// Re-run:  node scripts/extract-prompts.js
// Source:  Prototypes/chat-interface.html
'use strict';

module.exports = {
  FORMS: ${JSON.stringify(FORMS, null, 2)},

  SYSTEM_PROMPTS: ${JSON.stringify(SYSTEM_PROMPTS, null, 2)},

  ROUTING_PROMPT: ${JSON.stringify(ROUTING_PROMPT)},
};
`;

fs.writeFileSync(OUTPUT_FILE, output, 'utf8');

console.log(`✓ Extracted ${FORMS.length} forms, ${Object.keys(SYSTEM_PROMPTS).length} prompts`);
console.log(`✓ Written to ${OUTPUT_FILE}`);
