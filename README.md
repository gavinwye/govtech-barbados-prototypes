# GovTech Barbados – Form Prototypes

A catalog of 164+ clickable HTML prototypes of government forms for Barbados, built on the [alpha.gov.bb](https://alpha.gov.bb) design system. Each prototype simulates a real multi-step government form — with navigation, validation, conditional logic, and a confirmation page.

Live at: **[alpha.gov.bb](https://alpha.gov.bb)**

---

## What this is

Government agencies in Barbados use paper and legacy digital forms to process services for citizens. This project produces **research-quality, high-fidelity HTML prototypes** of those forms so that agencies can:

- Test form flows with real users before building production systems
- Identify pain points in the current paper process
- Agree on field names, data formats, and validation rules
- Demonstrate what a digital service could look and feel like

Each prototype is a single HTML file. It runs in a browser with no server dependency — navigation, validation, and conditional logic all happen client-side via the shared GovBB framework.

---

## Agencies covered

| Agency | Forms |
|---|---|
| Barbados Licensing Authority (BLA) | ~40 forms — vehicle registration, licences, duty-free, permits |
| National Insurance Scheme (NIS) | ~15 forms — registration, benefits, pension, life certificates |
| CAIPO (Corporate Affairs & IP) | ~10 forms — business registration, incorporation, trademarks |
| Immigration (IMMD) | ~10 forms — work permits, citizenship, student status |
| Royal Barbados Police Force | ~8 forms — firearm licences, accident reports, permits |
| Land Tax, Town Planning, Healthcare, Education | ~6 forms |

---

## Project structure

```
.
├── index.html                  # Homepage — conversational assistant (chat + routing)
├── services.html               # Full service catalog — secondary browse path
├── Prototypes/                 # 164 individual form HTML files
├── assets/
│   ├── govbb-tailwind-config.js  # Tailwind config with bb- colour namespace
│   ├── govbb-base.css            # CSS custom properties, body grid, utilities
│   ├── govbb-framework.js        # Form nav, validation, submission, helpers
│   └── *-forms-data.js           # Form metadata per agency (for catalog)
├── netlify/functions/
│   ├── submit.mjs              # Serverless form submission + email via Resend
│   ├── chat.mjs                # Chat interface backend
│   └── telegram.mjs            # Telegram bot integration
├── lib/
│   └── reference.js            # Form name → reference number prefix map
├── server/                     # Node.js utilities and data
├── scripts/                    # Build and data extraction scripts
├── data/                       # Form specs, manifests, and checkpoints
├── claude-plans/               # Implementation plans (created by AI agents)
├── netlify.toml                # Netlify deployment config
└── CLAUDE.md                   # Design system + prototype builder instructions
```

---

## How prototypes work

Every prototype is a **single HTML file** that references three shared assets:

```html
<script src="https://cdn.tailwindcss.com"></script>
<script src="/assets/govbb-tailwind-config.js"></script>
<link rel="stylesheet" href="/assets/govbb-base.css">
<!-- ... -->
<script src="/assets/govbb-framework.js"></script>
```

Inside the file, a small script defines the form flow, page templates, and validation:

```javascript
const FORM_NAME = 'Apply for a Driver\'s Licence';

const FLOW = ['start', 'personal-details', 'contact', 'declaration', 'check', 'confirmation'];

const PAGES = {
  'start': () => `...`,
  'personal-details': () => `
    <form novalidate>
      ${GovBB.backLink()}
      ${GovBB.caption()}
      <h1 class="font-bold text-[3.5rem] leading-[1.15] mb-8">Your personal details</h1>
      <div class="space-y-8">
        ${GovBB.textField('first-name', 'First name')}
        ${GovBB.textField('last-name', 'Last name')}
        ${GovBB.continueBtn()}
      </div>
    </form>`,
  // ...
};

GovBB.init({ formName: FORM_NAME, flow: FLOW, pages: PAGES, validate });
```

The `GovBB` global handles all navigation, stores form data in `GovBB.D`, and POSTs to `/api/submit` before showing the confirmation page.

---

## Design system

Prototypes use the **alpha.gov.bb design system** — Tailwind CSS with custom design tokens namespaced under `bb-`:

| Token | Class | Hex | Used for |
|---|---|---|---|
| Yellow | `bg-bb-yellow-100` | `#ffc726` | Header background |
| Blue | `bg-bb-blue-100` | `#00267f` | Top bar, footer |
| Teal | `text-bb-teal-00` | `#0e5f64` | Links, primary buttons |
| Red | `text-bb-red-00` | `#a42c2c` | Error states |
| Mid grey | `text-bb-mid-grey-00` | `#595959` | Hint text |

Font: **Figtree** (Google Fonts). Base size: 20px.

See [CLAUDE.md](CLAUDE.md) for the full design system reference including all colour tokens, typography scale, spacing scale, and component patterns.

---

## Form submission

When a user reaches the confirmation page, the framework automatically POSTs to `/.netlify/functions/submit`:

- Generates a unique reference number (e.g. `DL-A4B2C9`)
- Sends a confirmation email to the applicant via [Resend](https://resend.com)
- Sends a notification to the relevant department
- Returns the reference number to the prototype

No submission code is needed in individual prototype files — the framework handles it.

---

## Running locally

You need the [Netlify CLI](https://docs.netlify.com/cli/get-started/) to run serverless functions locally.

```bash
# Use Node 22
nvm use 22

# Install dependencies
npm install

# Start local dev server (serves functions + static files)
npx netlify dev
```

The site will be available at `http://localhost:8888`.

**Environment variables** (set in `.env` or Netlify UI):

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Email delivery via Resend |
| `OPENROUTER_API_KEY` | Chat LLM calls via OpenRouter (Sonnet 4.6) |
| `SUPABASE_URL` | Supabase project URL (if used) |
| `SUPABASE_ANON_KEY` | Supabase anon key (if used) |

---

## Deployment

The project deploys automatically via GitHub Actions to Netlify:

- **Push to `main`** → production deploy to [alpha.gov.bb](https://alpha.gov.bb)
- **Pull request** → preview deploy with a unique URL, posted as a PR comment

Manual deploy:

```bash
npx netlify deploy --prod
```

---

## Running tests

A small HTTP-level smoke canary lives at `tests/smoke.mjs`. It hits `/api/chat` and `/api/submit` and asserts status codes and response shape — no deps beyond Node's built-in test runner. Happy-path tests skip gracefully if the matching upstream key is not configured.

With a local dev server up:

```bash
npx netlify dev              # in one terminal
node --test tests/smoke.mjs  # in another
```

To run against a preview URL:

```bash
BASE_URL=https://your-preview.netlify.app node --test tests/smoke.mjs
```

The happy-path test for `/api/submit` sends one real email via Resend per run (routed to the demo-week hardcoded recipient).

---

## Adding a new prototype

1. **Create the HTML file** in `Prototypes/` following the skeleton in [CLAUDE.md](CLAUDE.md).
2. **Add the form name → prefix mapping** in `lib/reference.js`:
   ```javascript
   'My New Form': 'MNF',
   ```
3. **Add the service to the catalog** in the relevant `assets/*-forms-data.js` file so it appears on the `/services.html` catalog and is discoverable by the chat assistant.

See [CLAUDE.md](CLAUDE.md) for the full prototype builder reference — design system, component patterns, writing style, form structure rules, validation patterns, and the GovBB framework API.

---

## GovBB Framework API reference

The framework is loaded via `/assets/govbb-framework.js` and exposes a `GovBB` global.

**Template helpers** (return HTML strings):

| Helper | Description |
|---|---|
| `GovBB.textField(id, label, opts?)` | Text input with label and optional hint |
| `GovBB.emailField(id, label, opts?)` | Email input |
| `GovBB.telField(id, label, opts?)` | Telephone input |
| `GovBB.dateField(prefix, label, hint?)` | Day / Month / Year triple input |
| `GovBB.selectField(id, label, options, opts?)` | Dropdown select |
| `GovBB.radioGroup(name, label, options, opts?)` | Radio button group |
| `GovBB.checkboxItem(name, label)` | Single checkbox |
| `GovBB.textareaField(id, label, opts?)` | Textarea |
| `GovBB.summaryRow(label, value, changeTo)` | Check Your Answers row |
| `GovBB.backLink()` | Back link with arrow |
| `GovBB.caption(text?)` | Left-bordered section label above H1 |
| `GovBB.continueBtn(label?)` | Primary action button |
| `GovBB.startBtn(label?)` | Start page teal link-button |

**Navigation:**

| Method | Description |
|---|---|
| `GovBB.init(config)` | Initialise the framework |
| `GovBB.next()` | Validate and advance to next page |
| `GovBB.back()` | Go to previous page |
| `GovBB.nav(pageId)` | Jump to a specific page |

**Data:** `GovBB.D` — plain object storing all field values, persisted across pages.

**Constants:** `GovBB.PARISHES` — the 11 Barbados parishes.

---

## Barbados conventions

| Field | Format |
|---|---|
| Date | Three separate inputs: Day / Month / Year. Hint: "For example, 27 03 2007" |
| Parish | One of 11 values: Christ Church, St. Andrew, St. George, St. James, St. John, St. Joseph, St. Lucy, St. Michael, St. Peter, St. Philip, St. Thomas |
| Postal code | `BB` followed by 5 digits — e.g. `BB11000` |
| National Registration Number | `YYMMDD-XXXX` |
| National Insurance Number | 6 digits, numeric only |
| Phone | Any valid format — 7-digit local, area code, or international |
| Currency | Barbadian Dollar (BBD / BDS$) |

---

## Contributing

This project uses Claude Code (AI) to generate and maintain prototypes. The [CLAUDE.md](CLAUDE.md) file is the canonical instruction set for the prototype builder — covering the design system, component patterns, writing style, and technical requirements.

When writing new prototypes:
- Write in **plain language a 9-year-old could understand** — no jargon or bureaucratic phrasing
- Follow the **one thing per page** principle from the GOV.UK Service Manual
- Use the GovBB framework helpers — do not inline the design system or framework JS
- Include client-side validation with an error summary at the top of each page
- Test all conditional logic branches before delivering
