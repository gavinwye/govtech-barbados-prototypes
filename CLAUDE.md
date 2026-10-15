# CLAUDE.md

**What this is:** A catalog of 164+ clickable HTML prototypes of Barbados government forms, built on the alpha.gov.bb design system. Each prototype is one HTML file; shared framework lives in `assets/govbb-framework.js`. See [AGENTS.md](AGENTS.md) for the full prototype-builder spec (design tokens, component patterns, writing style).

## Orientation (avoid re-reading AGENTS.md for these)

- **Tailwind colour namespace:** always use the `bb-` prefix (`bg-bb-yellow-100`, `text-bb-blue-100`). Bare `bg-yellow-100` resolves to Tailwind's default pale yellow, not the design system gold. This is the #1 easy-to-miss gotcha.
- **Font:** Figtree (Google Fonts). Base size 20px.
- **Framework entry:** `GovBB.init({ formName, flow, pages, validate })`. Template helpers return HTML strings. Form data lives on `GovBB.D`. Parishes constant: `GovBB.PARISHES` (11 values).
- **Barbados conventions:** dates are three inputs D/M/Y ("For example, 27 03 2007"); postcodes `BB` + 5 digits; NRN `YYMMDD-XXXX`; NIN 6 digits; currency BBD.
- **Submission:** the framework auto-POSTs to `/.netlify/functions/submit` on the confirmation page. Individual prototypes don't implement submission.

## Local dev

```bash
npm install
npx netlify dev   # http://localhost:8888
```

Secrets go in `.env` at the repo root (gitignored). Functions read: `RESEND_API_KEY`, `ANTHROPIC_API_KEY` or `GROQ_API_KEY` (fallback), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TELEGRAM_BOT_TOKEN`.

Start new features on a new working branch. 

## Smoketest

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8888/
```

Expect `200`, and startup log should load all four functions: `submit`, `chat`, `telegram`, `telegram-data`.

## Deploy

Push your working branch, make a PR, prompt user to merge on Github.

## Demo freeze (active until 2026-04-21 late afternoon)

Live demo tomorrow afternoon. Ship each change as its own PR against a preview URL, smoke-test, then merge to main. Resend sender stays `onboarding@resend.dev` for demo week (domain not yet verified).

**In scope pre-demo:**
- Chat interface as front page (chat runtime now lives inline in root `index.html`; the service catalog is demoted to `/services.html`; `Prototypes/chat-interface.html` is a redirect shell).
- Security: HTML-escape interpolated values in `submit.mjs`; hardcode applicant email recipient for demo week; rename sender display.
- Tiny HTTP-level smoke script at `tests/smoke.mjs` as a regression canary.
- Chat UX polish — suggestion chips on the opening screen.

**Out of scope pre-demo** (treat as blocked unless explicitly unblocked):
- Unifying prompt sources (`index.html` inline vs `server/data/prompts.js` generated).
- JSON Schema / Ajv validation on `/api/submit`.
- Renaming/restructuring `assets/*-forms-data.js`.
- Rate limiting functions.
- Playwright/unit tests for the framework.
- Any change touching prompts, field keys, or the GovBB framework.

**Why:** 24h window, no existing test coverage, LLM-load-bearing prompts — regression risk dominates. Proper schema-driven rebuild is post-demo. Remove this section after 2026-04-21.

# Estimates and velocity

Estimates against reality, and cycle time, are measured daily across every repo gavinwye owns. The result is `velocity.json` in the private repo `gavinwye/the-colonel` (on the VPS: `~/the-colonel/velocity.json`; elsewhere: `gh api repos/gavinwye/the-colonel/contents/velocity.json -H 'Accept: application/vnd.github.raw'`), and is shown at https://the-colonel.netlify.app/velocity.html. It can only measure what is linked and estimated, so always do the following.

- **Link every PR to its issue.** Put `Closes #N` (or `Closes owner/repo#N`) in every PR description for work done from an issue. One issue per branch where practical, so the commits on the PR show the time spent on that issue. If the work has no issue, create one first.
- **Every issue gets an estimate.** When opening, planning or breaking down an issue, add a line `Estimate: 2h` to the issue body (units `m`, `h`, `d`; 1 d = 6 focused hours). Give each phase of a plan its own issue with its own line, not an estimate in prose, so it can be measured. If scope changes, add a new `Estimate:` line; the last one wins. In `gavinwye/the-colonel` use that repo's `Estimate` labels instead (`15m`, `30m`, `1h`, `2h`, `half day`).
- **Quote calibrated estimates.** Before giving an estimate, read `.calibration` in `velocity.json` (`overall`, `byRepo[<repo>]`, `byLabel[<label>]`, each with `n`, `medianRatio` = actual ÷ estimate, and `trusted`, true at 3 or more issues). Use the most specific entry that is trusted and show both: "raw 2h, calibrated about 3h (work has run 1.5x the estimate here)". If none is trusted, or the file cannot be read, say so and give the raw estimate only. Write the raw estimate on the issue, never the calibrated one, so the ratio stays honest.
- **Report at the end of a job.** When finishing work on an issue, say what the estimate was and how long it actually took.
