# Plan: Add CAIPO, IMMD, NAB and NIS forms to chat interface

## Context

The chat interface at `Prototypes/chat-interface.html` originally supported 31 forms (9 NIS/BLA inline + 22 BLA vehicle forms via `bla-forms-data.js`). An external repo at `https://github.com/Kruck95/govbb-prototypes.git` contains 40 HTML form prototypes across additional agencies. After filtering out duplicates already in the chat, 31 new forms needed to be added.

## New forms by agency

| Agency | Count | Data file |
|--------|-------|-----------|
| CAIPO (Corporate Affairs and Intellectual Property Office) | 12 | `assets/caipo-forms-data.js` |
| IMMD (Citizenship, Immigration and Passports) | 13 | `assets/immd-forms-data.js` |
| NAB (National Assistance Board) | 2 | `assets/other-forms-data.js` |
| NIS (additional forms not already in chat) | 4 | `assets/other-forms-data.js` |

### CAIPO forms
- Articles of Reincorporation
- Registration of a Business Name (Form I)
- CARICOM Complaints Form
- Company Name Search and Reservation (Form 33)
- Declaration of Compliance (Companies Act Cap. 308)
- Declaration of Compliance (Non-Profit Company)
- Financial Statements Exemption
- Geographical Indications Agent Authorisation
- International Business Company Licence Application
- Registered Agent Authorisation
- SRL Name Search and Reservation
- Declaration of URL / Domain Name Ownership

### IMMD forms
- CARICOM Indefinite Stay Application
- Registration as a Citizen (Adult)
- Registration as a Citizen by Marriage (Form R.1)
- Registration as a Citizen (Under 18)
- Citizenship Affidavit
- Certificate of Citizenship by Descent
- Commonwealth Citizenship Registration
- Immigrant Status and Non-National Registration (Form A)
- Permanent Resident Registration (Form A1)
- Short Term Work Permit or Training Attachment
- Certificate by Non-Immigrant Student (Form H-2)
- Certificate of Eligibility for Student Status (Form H-1)
- Work Permit / Extension / Job Offer

### NAB forms
- Application for Home Care Services
- Seniors' Recreational Activities Programme

### NIS (additional)
- NIS Educational Status Form
- Register as an Employer for NIS Online Services
- NIS Life Certificate
- Claim for Old Age Contributory Pension

## Architecture

Each data file follows the same pattern as `bla-forms-data.js`:

```js
(function () {
  'use strict';
  window.AGENCY_FORMS = [ /* catalog entries: id, name, ref, agency */ ];
  window.AGENCY_SYSTEM_PROMPTS = { /* id: system prompt with <<BASE_RULES>> placeholder */ };
})();
```

The chat interface loads all data files via `<script>` tags, concatenates the catalog arrays into `FORMS`, and merges system prompts by replacing `<<BASE_RULES>>` with the shared rules string.

## How system prompts were created

1. Cloned the external repo to `/tmp/govbb-prototypes/`
2. Read each HTML prototype to extract fields from `GovBB.textField()`, `GovBB.radioGroup()`, etc. calls and from the `validate()` function
3. Wrote system prompts listing all field keys, conditional logic, and validation rules
4. Added routing descriptions in `FORM_DESCRIPTIONS` for natural language form selection

## Changes made

| File | Change |
|------|--------|
| `assets/caipo-forms-data.js` | New — 12 CAIPO form entries + system prompts |
| `assets/immd-forms-data.js` | New — 13 IMMD form entries + system prompts |
| `assets/other-forms-data.js` | New — 2 NAB + 4 NIS form entries + system prompts |
| `Prototypes/chat-interface.html` | Load new data files, concat into FORMS, merge prompts, add routing descriptions, dynamic service count |
| `lib/reference.js` | Add reference number prefixes for all 31 new forms |

## Dynamic service count

The subtitle now uses `FORMS.length` at init time instead of a hardcoded number, and uses "services" instead of "forms":

```js
countEl.textContent = 'Have a conversation to complete any of the ' + FORMS.length + ' government services. Powered by AI.';
```

## Status

- [x] Extract field data from all 31 new forms
- [x] Create CAIPO data file (12 forms)
- [x] Create IMMD data file (13 forms)
- [x] Create other data file (2 NAB + 4 NIS)
- [x] Update chat interface to load and merge
- [x] Add routing descriptions
- [x] Add reference number prefixes
- [x] Dynamic service count
- [x] Merged to main (PR #5 + PR #6)
