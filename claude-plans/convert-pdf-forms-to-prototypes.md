# Plan: Convert PDF Government Forms to HTML Prototypes

## Context

There are approximately **70+ PDF forms** from various Barbados government agencies hosted on Notion. The goal is to convert them into clickable, multi-page HTML prototypes using the GovBB design system and framework. Currently, **9 form prototypes** exist in `Prototypes/`, and `lib/reference.js` already has **75 prefix mappings** (many added ahead of prototypes being built).

This is a large-scale effort that needs a systematic approach to be practical.

---

## Inventory: Forms by Agency

### Already prototyped (9 forms) — skip these
| Form | File |
|---|---|
| Application to Remove a Building/House/Boat | `permit-to-remove.html` |
| Claim for Unemployment Benefit | `unemployment-benefit.html` |
| NIS Online Social Security Registration | `nis-online-registration.html` |
| Declaration by Pensioners 60+ | `pensioner-declaration.html` |
| NIS Contributions Certificate (DP-10) | `dp10-contributions.html` |
| Direct Deposit Form | `direct-deposit.html` |
| Self-Employment Registration | `self-employment-registration.html` |
| Self-employed Contributions Certificate | `self-employed-contributions.html` |
| Termination of Services / Layoff Certificate | `termination-certificate.html` |

### Forms to convert (~68 forms across 7 agencies)

**Barbados Licensing Authority (BLA) — ~38 forms**
Largest group. Mostly vehicle/driving related. Many are short, simple forms.

1. Driver's Licence Application
2. Conductor's Licence
3. Disabled Parking Permit
4. Duty Free Vehicle
5. Vehicle Registration (Private Vehicle) *(2 PDF variants)*
6. Vehicle Inspection Application
7. Registration of Vehicle for Temporary Stay *(appears twice)*
8. Application for Limited Trade Plates
9. Tinted Window Exemption (Businesses)
10. Approved Vehicle Garage
11. Oral Test for Taxi Licence
12. Registration Number Plate Manufacturer Approval
13. Authorization for Importation of Vehicles
14. Change of Address
15. Change of Engine
16. Change of Use of Vehicle
17. Declaration for Partnership Vehicle Registration
18. Driving Exam Date Change
19. Duplicate PSV Driving Licence
20. F-Class Driving Licences
21. International Driving Permit *(2 PDFs)*
22. Lost Learner Permit
23. MO Plate Renewal
24. New Learner Permit
25. PSV Driving Licence
26. Taxi Driver Licence
27. Online Appointment for Regulation Test
28. Register a Bicycle/Motorcycle
29. Reinstatement of Driving Licence
30. Change of Driving Test Date
31. Change of Regulation Test Date *(3 PDFs)*
32. Request for Driving Record
33. Investigation into Duplicate Licence Plate Numbers
34. Change Colour of Vehicle
35. Retention of Vehicle Registration Number
36. Sale of Vehicle (Single Owner)
37. Sale of Vehicle (Joint Owners)
38. Scrapping of Vehicle / Selling in Parts
39. Stolen Vehicle Form
40. Tint Vehicle Application
41. Transfer of International Driving Licence
42. Transfer of Vehicle Due to Death
43. Vehicle Transfer (Single Owner)
44. Vehicle Transfer (Joint Owner)

**Royal Barbados Police Force — 7 forms**
1. Application for Police Accident Report
2. Application for Motorcade
3. Application for Loud Music Permit
4. Import/Export Firearms Application
5. Firearm Licence Application
6. Firearms Dealer/Gunsmith Licence
7. Shooting Club Licence

**NIS (National Insurance) — 4 new forms**
1. NIS Educational Status Form
2. Employer Online Social Security Registration
3. NIS Life Certificate
4. Claim for Old Age Contributory Pension

**CAIPO (Corporate Affairs) — 9 forms**
1. Articles of Reincorporation
2. Company Declaration Form
3. Declaration Form (Domestic Company)
4. Declaration Form (International Business Company)
5. Declaration Form (Non-Profit Company)
6. IBC Licence Application
7. Registered Agent Form
8. Financial Declaration (Sample)
9. URL/Domain Name Declaration

**Land Tax / Revenue — 3 forms**
1. Land Tax Demand Notice Request
2. Advance Land Tax Assessment Request
3. Notice of Change of Ownership

**Town Planning & Development — 4 forms**
1. Building Development New Application / Permission to Construct
2. Sell Goods or Services on a Beach or Park
3. Permission to Erect a Chattel House
4. Duty Free Concession (Business) + Duty Free Concession (Individual)

**Immigration (IMMD) — 2 forms**
1. Form A (Immigrant Status)
2. Form B (related)

**Other — 3 forms**
1. Agribusiness Farm Registration
2. Unemployment Form (NIS — may overlap with existing)
3. Wills
4. New Permit Application + Transfer of Permit

---

## Phase 0: Reconcile external URL inventory with repo state

Before any conversion work, produce a **manifest** (saved as a file in the repo, e.g. `docs/form-manifest.md` or `.csv`) by fetching and reviewing every PDF URL from the Notion page. Each row in the manifest contains:

| Column | Description |
|---|---|
| `source_url` | The Notion signed URL for the PDF |
| `source_title` | File name / title extracted from the PDF |
| `agency` | Government agency (BLA, NIS, Police, CAIPO, etc.) |
| `canonical_form_id` | A short slug ID for the form (e.g. `change-of-engine`, `disabled-parking-permit`) |
| `duplicate_of` | If this PDF is a duplicate or variant of another form, reference the canonical ID here. Otherwise blank. |
| `doc_type` | `form` (fillable form to convert) or `info` (process/info document to convert as an informational page) |
| `existing_prototype` | Path to existing HTML prototype in `Prototypes/` if one exists, otherwise blank |
| `existing_chat_data` | Data file and key if a chat script already exists (e.g. `bla-forms-data.js:change-of-engine`), otherwise blank |
| `reference_js_mapping` | Existing prefix from `lib/reference.js` if present (e.g. `COE`), otherwise blank |

**How to build the manifest:**
1. Fetch each PDF URL and read it to get the form title and agency
2. Cross-reference against existing `Prototypes/*.html` files (9 prototypes)
3. Cross-reference against chat data files (`assets/*-forms-data.js`) — 74 form definitions
4. Cross-reference against `lib/reference.js` — 75 prefix mappings
5. Identify duplicates (same form appearing under different file names or URLs)
6. Classify each as `form` or `info`

**The manifest is the single source of truth** for all subsequent conversion work. It tells us exactly what needs building, what already exists, and what to skip.

---

## Phase 1: Agency Batches

Work through all forms for one agency at a time. Use the manifest to determine which forms need conversion. For each batch session:

1. **Filter the manifest** for this agency. Skip any rows where `existing_prototype` is already filled in or `duplicate_of` points to another form. Only work on rows that need new prototypes or chat scripts.
2. **Fetch and read the PDFs** for forms/info docs that need conversion, to extract fields, labels, hints, validation rules, and conditional logic
3. **For fillable forms (`doc_type: form`):** map to pages (one-thing-per-page), write the HTML prototype using GovBB framework API, add `reference.js` mapping if missing
5. **For info/process PDFs:** convert into informational pages using the same design system (no form fields, just structured content)
6. **Create the chat script for each form.** Add to the appropriate data file (`assets/bla-forms-data.js`, `assets/caipo-forms-data.js`, `assets/immd-forms-data.js`, `assets/other-forms-data.js`, or a new file for new agencies like Police). Each entry needs:
   - A metadata object: `{ id, name, ref, agency }` in the forms array
   - A system prompt string with these sections in order:
     1. **Start page introduction** — the chat must open by telling the user what the form is for, who is eligible, and what documents/information they will need to have ready (mirroring the HTML start page content). This ensures users know what to prepare before answering questions.
     2. **Field collection instructions** — all fields to collect, with field keys matching the HTML prototype's `GovBB.D` keys
     3. **Conditional logic** — branching rules matching the prototype
     4. **`<<BASE_RULES>>` tag** at the end (or the inline STYLE/VALIDATION/FINISHING block for `server/data/prompts.js` forms)
   - The chat script fields must use the same `id`/`name` keys as the HTML prototype so data is consistent across both interfaces
7. **Add all new pages to `index.html`** landing page
8. **Test** each prototype by running the dev server and clicking through

### Batch order

| Batch | Agency | Forms | Why this order |
|---|---|---|---|
| 1 | NIS (National Insurance) | ~4 new | Familiar patterns, builds on 9 existing prototypes |
| 2 | BLA — simple forms | ~20 | Short forms (date changes, lost permits, address changes). Fast to produce. |
| 3 | BLA — complex forms | ~18 | Vehicle registration, licensing apps. Similar patterns to each other. |
| 4 | Police | 7 | Mid-complexity, standalone group |
| 5 | CAIPO (Corporate) | 9 | Corporate forms, likely more complex |
| 6 | Land Tax / Revenue | 3 | Small batch |
| 7 | Town Planning | 4 | Small batch |
| 8 | Immigration (IMMD) | 2 | Small batch |
| 9 | Other (Agribusiness, Wills, Permits) | 3-4 | Remaining miscellaneous |

### After each batch
- Update `index.html` with new agency sections/cards
- Update or create chat data files — existing files cover BLA, CAIPO, IMMD, and Other (NIS/NAB). New agencies (Police, Land Tax, Town Planning) will need new data files (e.g. `assets/police-forms-data.js`, `assets/land-tax-forms-data.js`)
- Register any new data files in `chat-interface.html` script tags
- Commit the batch

---

## Practical notes

- **Many BLA forms are very similar** (vehicle transfers, sales, changes) — once the first few are done, the rest follow the same pattern and can be produced quickly
- **Duplicate PDFs** exist (some forms appear twice with slightly different names) — deduplicate during PDF review
- **Info/process documents** (e.g. "Regulation_test_process.pdf", "Regulation_test_times.pdf") will be converted into informational pages rather than skipped
- **Reference.js already has 75 mappings** — most forms just need the HTML prototype built

---

## Test strategy

### Pre-conversion check (before building each form)

**0. Deduplication gate**
- Check the manifest: if `existing_prototype` is filled in or `duplicate_of` is set, skip this form
- Do not convert any form that is not in the manifest or that the manifest marks as already done

### Per-form testing (after each prototype is built)

**1. Page loads without errors**
- Open the prototype in a browser via dev server
- Check the browser console for JavaScript errors
- Confirm all shared assets load (`govbb-tailwind-config.js`, `govbb-base.css`, `govbb-framework.js`)

**2. Full happy-path walkthrough**
- Click "Complete the online form" on the start page
- Fill in every field with valid data on each question page
- Click "Continue" through every page in the flow
- Confirm the Check Your Answers page shows all entered data correctly
- Confirm every "Change" link navigates back to the correct question page
- Click "Submit application" and verify the confirmation page renders with a reference number

**3. Validation testing**
- On each question page, click "Continue" without entering anything
- Confirm an error summary appears at the top of the page with links to each invalid field
- Confirm inline error messages appear next to each required field
- Confirm error styling applies (red border, `aria-invalid="true"`)
- For fields with pattern validation (e.g. NRN, postal code, email), enter invalid values and confirm specific error messages
- Fix each error and confirm the error clears on resubmission

**4. Navigation testing**
- Confirm "Back" link on every question page goes to the previous page
- Confirm back link on the first question page goes to the start page
- Confirm navigating back preserves previously entered data (GovBB.D persistence)

**5. Conditional logic testing** (where applicable)
- For each conditional rule in the form: trigger the condition and confirm the dependent field/page appears
- Un-trigger the condition and confirm the dependent content hides/skips

**6. Responsive check**
- Resize browser to mobile width (~375px) and confirm layout doesn't break
- Confirm inputs are usable at mobile size

### Chat script testing (after each form's chat data is added)

**7. Static validation of chat script (no API needed)**
- Confirm the form's metadata entry (`{ id, name, ref, agency }`) is in the correct data file's array
- Confirm the system prompt string exists in the `*_SYSTEM_PROMPTS` object with a matching key
- Confirm the prompt opens with start page content: what the form is for, who can use it, and what documents/info to have ready
- Confirm every field key in the HTML prototype's `GovBB.D` usage has a matching key listed in the chat prompt
- Confirm conditional logic in the chat prompt matches the HTML prototype's branching (same conditions, same dependent fields)
- Confirm the prompt ends with `<<BASE_RULES>>` (for data-file prompts) or the inline STYLE/VALIDATION/FINISHING block (for `server/data/prompts.js`)
- Open the chat interface in a browser, confirm the form appears in the dropdown list

**8. Live chat walkthrough (requires running Netlify dev with API key)**
- Run `netlify dev` to start the local server with the `/api/chat` function
- Select the form in the chat interface
- Confirm the bot's first message presents the start page information (purpose, eligibility, what you'll need)
- Complete a full conversation providing valid data for all fields
- Confirm the bot asks for every required field and respects conditional branches
- Confirm the bot produces a `##COMPLETE##` marker followed by valid JSON
- Confirm the JSON keys match the HTML prototype's field IDs
- Confirm the confirmation panel renders with a reference number

**If Netlify dev / API key is not available:** rely on the static validation (step 7) and flag live testing as a manual step for the user to run later.

### Per-batch testing (after each agency batch)

**7. Index page integration**
- Confirm all new forms appear on `index.html` with correct agency tag and audience label
- Confirm clicking each card navigates to the correct prototype
- Confirm agency filter shows/hides the correct cards

**8. Cross-form consistency**
- Spot-check 2-3 forms from the batch against each other for consistent styling, button labels, and caption text
- Confirm all forms in the batch use the same component patterns (not hand-rolled HTML where framework helpers exist)

**9. Reference.js completeness**
- Confirm every new form has an entry in `lib/reference.js`
- Confirm no duplicate prefixes

### End-of-project testing

**10. Full smoke test**
- Open every prototype (all ~77 forms) and confirm it loads
- Run a quick click-through on a random sample of 10 forms across agencies
- Confirm the landing page displays all forms and filters work
