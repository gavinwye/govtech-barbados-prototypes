// Chat routing test runner.
// Reconstructs the browser's ROUTING_PROMPT from live source, fires each opener at /api/chat,
// and writes results to results.md for interactive scoring.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICES, INFO_PAGES, DIALECT, AMBIGUOUS } from './plan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
const API = 'http://localhost:8888/api/chat';
const CONCURRENCY = 4;
const TIMEOUT_MS = 60_000;
const RETRIES = 1;

// ─── Rebuild ROUTING_PROMPT from the same sources the browser uses ─────────────
function evalInFauxWindow(code) {
  const win = {};
  new Function('window', code)(win);
  return win;
}

async function buildRoutingPrompt() {
  const CORE_FORMS = [
    { id:'se',   name:'Self-Employment Registration',                     ref:'SE',   agency:'National Insurance Scheme (NIS)' },
    { id:'oss',  name:'NIS Online Service Registration',                  ref:'OSS',  agency:'National Insurance Scheme (NIS)' },
    { id:'dd',   name:'Direct Deposit Form',                              ref:'DD',   agency:'National Insurance Scheme (NIS)' },
    { id:'dp10', name:'NIS Contributions Certificate (D.P. 10)',          ref:'DP10', agency:'National Insurance Scheme (NIS)' },
    { id:'pd',   name:'Pensioner Declaration',                            ref:'PD',   agency:'Central Bank of Barbados' },
    { id:'ub',   name:'Claim for Unemployment Benefit',                   ref:'UB',   agency:'National Insurance Scheme (NIS)' },
    { id:'secp', name:'Self-Employed Contributions Certificate',          ref:'SECP', agency:'National Insurance Scheme (NIS)' },
    { id:'tc',   name:'Termination Certificate',                          ref:'TC',   agency:'National Insurance Scheme (NIS)' },
    { id:'vep',  name:'Permit to Remove / Relocate Structure',            ref:'VEP',  agency:'Barbados Licensing Authority (BLA)' },
  ];

  const extraFiles = [
    'bla-forms-data.js', 'bla-new-forms-data.js', 'caipo-forms-data.js',
    'govt-forms-data.js', 'immd-forms-data.js', 'other-forms-data.js',
    'police-forms-data.js',
  ];
  const win = { INFO_PAGES_TEXT: '' };
  for (const f of extraFiles) {
    const code = await readFile(join(REPO, 'assets', f), 'utf8');
    Object.assign(win, evalInFauxWindow(code));
  }
  const ipCode = await readFile(join(REPO, 'assets', 'info-pages.js'), 'utf8');
  Object.assign(win, evalInFauxWindow(ipCode));

  const FORMS = CORE_FORMS
    .concat(win.BLA_FORMS || [])
    .concat(win.BLA_NEW_FORMS || [])
    .concat(win.CAIPO_FORMS || [])
    .concat(win.IMMD_FORMS || [])
    .concat(win.OTHER_FORMS || [])
    .concat(win.POLICE_FORMS || [])
    .concat(win.GOVT_FORMS || []);

  const indexSrc = await readFile(join(REPO, 'index.html'), 'utf8');
  const descMatch = indexSrc.match(/var FORM_DESCRIPTIONS = (\{[\s\S]*?\n\});/);
  if (!descMatch) throw new Error('Could not locate FORM_DESCRIPTIONS in index.html');
  const FORM_DESCRIPTIONS = new Function(`return ${descMatch[1]}`)();

  // Extract the RHS of `var ROUTING_PROMPT = ... ;` and eval it in a sandbox.
  const rpMatch = indexSrc.match(/var ROUTING_PROMPT =([\s\S]*?);\s*\n\s*async function handleRouting/);
  if (!rpMatch) throw new Error('Could not locate ROUTING_PROMPT in index.html');
  const ROUTING_PROMPT = new Function('FORMS', 'FORM_DESCRIPTIONS', 'window', `return (${rpMatch[1]});`)
    (FORMS, FORM_DESCRIPTIONS, { INFO_PAGES_TEXT: win.INFO_PAGES_TEXT });

  return { ROUTING_PROMPT, formsCount: FORMS.length };
}

// ─── Flatten plan into test list ───────────────────────────────────────────────
function buildTests() {
  const tests = [];
  for (const s of SERVICES) {
    for (const opener of s.openers) {
      tests.push({ category: 'service', expectedId: s.id, expectedName: s.name, opener });
    }
  }
  for (const p of INFO_PAGES) {
    for (const opener of p.openers) {
      tests.push({ category: 'info', expectedSlug: p.slug, expectedTitle: p.title, opener });
    }
  }
  for (const d of DIALECT) {
    tests.push({ category: 'dialect', targetType: d.targetType, target: d.target, opener: d.opener });
  }
  for (const a of AMBIGUOUS) {
    tests.push({ category: 'ambiguous', couldBe: a.couldBe, opener: a.opener });
  }
  return tests;
}

// ─── Run one test with retry ───────────────────────────────────────────────────
async function runOne(system, test, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system,
        messages: [{ role: 'user', content: test.opener }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const txt = await res.text().catch(() => '<unreadable>');
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';
    return { ok: true, text };
  } catch (e) {
    clearTimeout(timer);
    if (attempt < RETRIES) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      return runOne(system, test, attempt + 1);
    }
    return { ok: false, error: e.message };
  }
}

// ─── Worker pool ───────────────────────────────────────────────────────────────
async function runAll(system, tests) {
  const results = new Array(tests.length);
  let cursor = 0;
  let done = 0;
  const startTime = Date.now();
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= tests.length) return;
      results[i] = await runOne(system, tests[i]);
      done++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stderr.write(`[${done}/${tests.length}] ${elapsed}s — ${tests[i].category}: ${tests[i].opener.slice(0, 70)}\n`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

// ─── Markdown writer ───────────────────────────────────────────────────────────
function blockquote(s) {
  return s.split('\n').map(l => '> ' + l).join('\n');
}

function renderResponse(r) {
  if (r.ok) return blockquote(r.text || '_(empty)_');
  return `> _ERROR: ${r.error}_`;
}

function buildMarkdown(tests, results, routingPromptLen) {
  const out = [];
  out.push('# Chat routing test results');
  out.push('');
  out.push(`**Run at:** ${new Date().toISOString()}`);
  out.push(`**Tests:** ${tests.length}`);
  out.push(`**Concurrency:** ${CONCURRENCY}`);
  out.push(`**Routing prompt length:** ${routingPromptLen} chars`);
  out.push('');
  out.push('## Scoring rubric');
  out.push('');
  out.push('- **PASS** — bot names the expected service (hand-off), asks a sensible clarifying question that moves toward a specific service, or (for info pages) redirects with the correct markdown link.');
  out.push('- **FAIL** — bot names the wrong service, asks an off-topic clarifying question, or (for ambiguous openers) jumps to routing instead of clarifying.');
  out.push('');
  out.push('---');
  out.push('');

  const svcByExp = new Map();
  const infoByExp = new Map();
  const dialectTests = [];
  const ambigTests = [];
  tests.forEach((t, i) => {
    const entry = { t, r: results[i] };
    if (t.category === 'service') {
      if (!svcByExp.has(t.expectedId)) svcByExp.set(t.expectedId, []);
      svcByExp.get(t.expectedId).push(entry);
    } else if (t.category === 'info') {
      if (!infoByExp.has(t.expectedSlug)) infoByExp.set(t.expectedSlug, []);
      infoByExp.get(t.expectedSlug).push(entry);
    } else if (t.category === 'dialect') dialectTests.push(entry);
    else if (t.category === 'ambiguous') ambigTests.push(entry);
  });

  out.push('## Services');
  out.push('');
  for (const [id, entries] of svcByExp) {
    out.push(`### \`${id}\` — ${entries[0].t.expectedName}`);
    out.push('');
    for (const { t, r } of entries) {
      out.push(`**Opener:** ${t.opener}`);
      out.push('');
      out.push('**Response:**');
      out.push('');
      out.push(renderResponse(r));
      out.push('');
      out.push('**Score:** PENDING');
      out.push('');
      out.push('---');
      out.push('');
    }
  }

  out.push('## Info pages');
  out.push('');
  for (const [slug, entries] of infoByExp) {
    out.push(`### \`${slug}\` — ${entries[0].t.expectedTitle}`);
    out.push('');
    for (const { t, r } of entries) {
      out.push(`**Opener:** ${t.opener}`);
      out.push('');
      out.push('**Response:**');
      out.push('');
      out.push(renderResponse(r));
      out.push('');
      out.push('**Score:** PENDING');
      out.push('');
      out.push('---');
      out.push('');
    }
  }

  out.push('## Dialect (Bajan)');
  out.push('');
  for (const { t, r } of dialectTests) {
    out.push(`**Opener:** ${t.opener}`);
    out.push('');
    out.push(`**Expected:** \`${t.target}\` (${t.targetType})`);
    out.push('');
    out.push('**Response:**');
    out.push('');
    out.push(renderResponse(r));
    out.push('');
    out.push('**Score:** PENDING');
    out.push('');
    out.push('---');
    out.push('');
  }

  out.push('## Ambiguous');
  out.push('');
  for (const { t, r } of ambigTests) {
    out.push(`**Opener:** ${t.opener}`);
    out.push('');
    out.push(`**Could reasonably be:** ${t.couldBe.map(x => `\`${x}\``).join(', ')}`);
    out.push('');
    out.push('**Response:**');
    out.push('');
    out.push(renderResponse(r));
    out.push('');
    out.push('**Score:** PENDING');
    out.push('');
    out.push('---');
    out.push('');
  }

  return out.join('\n');
}

// ─── Main ──────────────────────────────────────────────────────────────────────
const { ROUTING_PROMPT, formsCount } = await buildRoutingPrompt();
process.stderr.write(`Routing prompt built: ${ROUTING_PROMPT.length} chars, ${formsCount} forms in catalog.\n`);

const tests = buildTests();
process.stderr.write(`${tests.length} tests queued. Concurrency ${CONCURRENCY}.\n\n`);

const results = await runAll(ROUTING_PROMPT, tests);

const md = buildMarkdown(tests, results, ROUTING_PROMPT.length);
const outPath = join(__dirname, 'results.md');
await writeFile(outPath, md, 'utf8');

const ok = results.filter(r => r.ok).length;
const failed = results.length - ok;
process.stderr.write(`\nDone. ${ok} ok, ${failed} errored. Wrote ${outPath}\n`);
