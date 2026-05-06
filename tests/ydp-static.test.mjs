// Static tests over the youth-development-programme tree.
// These guard against regressions that route YDP submissions through the
// old endpoint, persist the CV as base64, or reintroduce placeholder hrefs.
//
// Run: node --test tests/ydp-static.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const YDP_DIR = join(ROOT, 'youth-development-programme');

async function listYdpHtml() {
  const out = [];
  const dirs = await readdir(YDP_DIR);
  for (const d of dirs) {
    const dirPath = join(YDP_DIR, d);
    let entries;
    try { entries = await readdir(dirPath); } catch { continue; }
    for (const f of entries) {
      if (f.endsWith('.html')) out.push(join(dirPath, f));
    }
  }
  return out;
}

const FILES = await listYdpHtml();
const FILES_TEXT = await Promise.all(FILES.map(async f => [f, await readFile(f, 'utf8')]));

test('no YDP page posts to /api/submit', () => {
  for (const [f, text] of FILES_TEXT) {
    assert.ok(!/['"`]\/api\/submit['"`]/.test(text), `${f} still references /api/submit`);
  }
});

test('no YDP page assigns cv-file-base64', () => {
  // Deletion of a legacy key is fine; assigning a value back is not.
  for (const [f, text] of FILES_TEXT) {
    assert.ok(
      !/\[['"`]cv-file-base64['"`]\]\s*=/.test(text),
      `${f} assigns to cv-file-base64`
    );
  }
});

test('no YDP page uses the placeholder href="#" footer policy links', () => {
  // The dynamic footer is injected from ydp-multipage.js, but check that
  // no individual page has hand-rolled a placeholder Privacy/Terms link.
  for (const [f, text] of FILES_TEXT) {
    if (/href="#"[^>]*>(Privacy|Terms|Accessibility)</.test(text)) {
      assert.fail(`${f} has a placeholder href="#" policy link`);
    }
  }
});

test('every YDP form index.html declares a formId', async () => {
  const indexes = FILES.filter(f => f.endsWith('/index.html'));
  assert.ok(indexes.length >= 9, 'expected at least 9 YDP form indexes');
  for (const f of indexes) {
    const text = await readFile(f, 'utf8');
    assert.match(text, /formId:\s*['"]ydp-/, `${f} missing formId in initPage`);
  }
});
