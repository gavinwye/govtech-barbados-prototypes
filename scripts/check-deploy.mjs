#!/usr/bin/env node
// Pre-deploy gate. Fails fast when the YDP submission path is missing
// configuration that production needs:
//   - YDP_FALLBACK_EMAIL set, OR every registry recipientEnv set.
//   - Policy links overridden away from the placeholder gov.bb defaults
//     baked into assets/ydp-multipage.js.
//
// Skipped on PR previews (only runs when DEPLOY_GATE=production).

import { readFile } from 'node:fs/promises';
import { REGISTRY } from '../netlify/functions/_ydp-registry.mjs';

const errs = [];

const env = process.env;
const gateMode = env.DEPLOY_GATE || 'preview';

const hasFallback = !!env.YDP_FALLBACK_EMAIL;
const missingRecipients = Object.entries(REGISTRY)
  .filter(([, e]) => !env[e.recipientEnv])
  .map(([id]) => id);

if (gateMode === 'production') {
  if (!hasFallback && missingRecipients.length) {
    errs.push(
      'No recipient configured for YDP forms. Set YDP_FALLBACK_EMAIL ' +
      `or per-form recipients (missing: ${missingRecipients.join(', ')})`
    );
  }
  for (const k of ['YDP_LINK_PRIVACY', 'YDP_LINK_TERMS', 'YDP_LINK_ACCESSIBILITY']) {
    if (!env[k]) errs.push(`${k} not set — production must inject real policy URLs.`);
  }
}

// Sanity-check that the registry hasn't lost its hardcoded recipientEnv hooks.
for (const [id, e] of Object.entries(REGISTRY)) {
  if (!e.recipientEnv) errs.push(`${id} registry entry missing recipientEnv`);
  if (!e.refPrefix) errs.push(`${id} registry entry missing refPrefix`);
}

// Confirm the placeholder URLs in the framework still exist with the
// "gov.bb" hostname — if someone accidentally broke the override mechanism
// by hardcoding real URLs into the file, that's its own problem.
const fw = await readFile(new URL('../assets/ydp-multipage.js', import.meta.url), 'utf8');
if (!/window\.YDP_LINKS/.test(fw)) {
  errs.push('assets/ydp-multipage.js no longer reads window.YDP_LINKS');
}

if (errs.length) {
  console.error('Deploy gate failed:');
  for (const e of errs) console.error('  -', e);
  process.exit(1);
}
console.log(`Deploy gate (${gateMode}) passed.`);
