#!/usr/bin/env node
/**
 * extract-bla-forms.js
 * Parses BLA prototype HTML files and generates assets/bla-forms-data.js
 *
 * Usage:
 *   source ~/.nvm/nvm.sh && nvm use 22
 *   node scripts/extract-bla-forms.js [/path/to/bla-form-prototypes]
 *
 * Default BLA repo path: /tmp/bla-form-prototypes
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const BLA_REPO   = process.argv[2] || '/tmp/bla-form-prototypes';
const OUTPUT_FILE = path.join(__dirname, '..', 'assets', 'bla-forms-data.js');

// Pages to skip when extracting fields
const SKIP_PAGES      = new Set(['check-answers.html', 'confirmation.html', 'declaration.html', 'index.html']);
const SKIP_PAGE_STARTS = ['email-'];

// Prototype directories that are not form entries
const SKIP_DIRS = new Set(['shared', 'motor-vehicle-inspection-journey-variants', 'vehicle-registration-summary']);

function shouldSkipPage(filename) {
  if (!filename.endsWith('.html')) return true;
  if (SKIP_PAGES.has(filename)) return true;
  return SKIP_PAGE_STARTS.some(p => filename.startsWith(p));
}

/**
 * Extract field definitions from a single HTML page.
 * Returns: { title, fields: [{id, label, type, optional, hint}], radioGroups: {name: {question, options[]}} }
 */
function extractPage(html) {
  const result = { title: '', fields: [], radioGroups: {} };

  // Page H1 (used as section title and as implicit label for radio groups)
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (h1Match) {
    result.title = h1Match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  // Radio button groups: data-group="name" data-value="value"
  const radioRe = /data-group="([^"]+)"\s+data-value="([^"]+)"/g;
  let m;
  while ((m = radioRe.exec(html)) !== null) {
    const groupName = m[1], value = m[2];
    if (!result.radioGroups[groupName]) {
      result.radioGroups[groupName] = { question: result.title, options: [] };
    }
    if (!result.radioGroups[groupName].options.includes(value)) {
      result.radioGroups[groupName].options.push(value);
    }
  }

  // Bold labels (= form field labels, not radio/checkbox option labels)
  const labelRe = /<label\s+for="([^"]+)"([^>]*)>([\s\S]*?)<\/label>/g;
  const seenDateBase = new Set();

  while ((m = labelRe.exec(html)) !== null) {
    const id      = m[1];
    const attrs   = m[2];
    const inner   = m[3];
    const rawText = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    // Only process bold labels (form question labels)
    // Non-bold = radio/checkbox option labels — skip those
    if (!attrs.includes('font-bold') && !inner.includes('font-bold')) continue;

    // Date sub-fields (dob-day, dob-month, dob-year) → group as a single date field
    const dateSuffixMatch = id.match(/^(.+)-(day|month|year)$/);
    if (dateSuffixMatch) {
      const base = dateSuffixMatch[1];
      if (!seenDateBase.has(base)) {
        seenDateBase.add(base);
        // Try to find parent question label text from a bold <p> just before these sub-fields
        const before = html.slice(Math.max(0, m.index - 500), m.index);
        const parentMatch = before.match(/<p[^>]*font-bold[^>]*>([^<]+)<\/p>\s*(?:<p[^>]*>[^<]*<\/p>\s*)?$/);
        const dateLabel = parentMatch ? parentMatch[1].trim() : 'Date';
        result.fields.push({ id: base, label: dateLabel, type: 'date', optional: false, hint: 'DD MM YYYY' });
      }
      continue;
    }

    // Detect optional fields
    const isOptional = rawText.toLowerCase().includes('(optional)') ||
                       inner.includes('font-normal') && inner.toLowerCase().includes('optional');
    const cleanLabel = rawText.replace(/\s*\(optional\)\s*/gi, '').trim();

    // Hint text: first <p class="...mid-grey..."> after the label
    const afterLabel = html.slice(m.index + m[0].length, m.index + m[0].length + 500);
    const hintMatch  = afterLabel.match(/<p[^>]*(?:mid-grey|hint)[^>]*>([^<]+)<\/p>/);
    const hint       = hintMatch ? hintMatch[1].trim() : null;

    // Field type: look at the element that follows with matching id
    let type = 'text';
    const ahead = html.slice(m.index, m.index + 800);
    if (/<textarea/.test(ahead))                                                    type = 'textarea';
    else if (/<select/.test(ahead))                                                 type = 'select';
    else if (new RegExp(`id="${id}"[^>]*type="checkbox"`).test(ahead) ||
             new RegExp(`type="checkbox"[^>]*id="${id}"`).test(ahead))              type = 'checkbox';
    else { const tm = ahead.match(/type="(tel|email|number)"/); if (tm) type = tm[1]; }

    result.fields.push({ id, label: cleanLabel, type, optional: !!isOptional, hint });
  }

  return result;
}

/**
 * Build a system prompt string for the given form.
 * Uses <<BASE_RULES>> as a placeholder; chat-interface.html replaces it at runtime.
 */
function buildPrompt(formMeta, pages) {
  const { title, refPrefix } = formMeta;

  const lines = [
    `You are a concise assistant helping a Barbados citizen complete the ${title} (${refPrefix} form) for the Barbados Licensing Authority. Ask one question at a time. Short responses only.`,
    '',
    'COLLECT THE FOLLOWING INFORMATION:'
  ];

  for (const { title: sectionTitle, fields, radioGroups } of pages) {
    const keys = [...fields.map(f => f.id), ...Object.keys(radioGroups)];
    if (!keys.length) continue;

    lines.push('');
    lines.push(`${sectionTitle} (keys: ${keys.join(', ')}):`);

    for (const f of fields) {
      let line = `- ${f.id}`;
      if (f.optional) line += ' (optional)';
      line += ` — ${f.label}`;
      if (f.hint) line += `. Hint: ${f.hint}`;
      lines.push(line);
    }

    for (const [groupName, group] of Object.entries(radioGroups)) {
      lines.push(`- ${groupName}: ${group.options.join(', ')}`);
    }
  }

  lines.push(
    '',
    'VEHICLE-SPECIFIC VALIDATION:',
    '- Registration number: letters followed by digits (e.g. B1234 or BA1234)',
    '- Chassis, engine, motor numbers: alphanumeric, exactly as printed on the vehicle',
    '- NRN format: YYMMDD-XXXX (e.g. 870315-1234) — found on the national ID card',
    '- If a vehicle number is optional and the owner is unsure, accept null',
    '<<BASE_RULES>>'
  );

  return lines.join('\n');
}

// ─── Main ───────────────────────────────────────────────────────────────────

const emailConfig = JSON.parse(
  fs.readFileSync(path.join(BLA_REPO, 'prototypes', 'shared', 'email-config.json'), 'utf8')
);

const prototypesDir = path.join(BLA_REPO, 'prototypes');
const formIds = fs.readdirSync(prototypesDir)
  .filter(d =>
    !SKIP_DIRS.has(d) &&
    !!emailConfig.forms[d] &&
    fs.statSync(path.join(prototypesDir, d)).isDirectory()
  )
  .sort();

const blaForms   = [];
const blaPrompts = {};

console.log(`Processing ${formIds.length} BLA forms from ${BLA_REPO}\n`);

for (const formId of formIds) {
  const meta    = emailConfig.forms[formId];
  const formDir = path.join(prototypesDir, formId);

  const pages = fs.readdirSync(formDir)
    .filter(f => !shouldSkipPage(f))
    .sort()
    .map(filename => extractPage(fs.readFileSync(path.join(formDir, filename), 'utf8')))
    .filter(p => p.fields.length > 0 || Object.keys(p.radioGroups).length > 0);

  const totalFields = pages.reduce(
    (n, p) => n + p.fields.length + Object.keys(p.radioGroups).length, 0
  );

  console.log(`  ${meta.refPrefix.padEnd(6)} ${formId.padEnd(40)} ${totalFields} fields`);

  blaForms.push({
    id:     formId,
    name:   meta.title,
    ref:    meta.refPrefix,
    agency: 'Barbados Licensing Authority (BLA)'
  });

  blaPrompts[formId] = buildPrompt(meta, pages);
}

// Serialise: each prompt as a template-literal string with escaped backticks/dollars
const promptEntries = Object.entries(blaPrompts).map(([id, prompt]) => {
  const safe = prompt
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
  return `  '${id}': \`${safe}\``;
}).join(',\n\n');

const output = `/* AUTO-GENERATED by scripts/extract-bla-forms.js — do not edit by hand.
   Re-run: source ~/.nvm/nvm.sh && nvm use 22 && node scripts/extract-bla-forms.js [/path/to/bla-repo]
*/
(function () {
  'use strict';

  window.BLA_FORMS = ${JSON.stringify(blaForms, null, 2)};

  // Each prompt contains <<BASE_RULES>> — replaced at runtime by chat-interface.html
  window.BLA_SYSTEM_PROMPTS = {
${promptEntries}
  };
}());
`;

fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
console.log(`\n✓ Wrote ${blaForms.length} BLA forms → ${OUTPUT_FILE}`);
