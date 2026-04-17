# Plan: Add alpha.gov.bb service content to Telegram bot knowledge base

## Context

The Telegram bot can walk users through 62 government forms, but it can't answer informational questions like "What documents do I need for a passport?" or "How much does it cost to register a business?" The concierge prompt has a hardcoded list of 47 services with one-liner descriptions, but no actual page content.

The alpha.gov.bb source content already exists as ~50 markdown files in the `govtech-bb/frontend-alpha` repo at `src/content/`. No scraping needed — just copy and integrate.

## Approach: Copy markdown from source repo, embed in system prompt

The content from ~50 pages should fit under 40,000 tokens total in the system prompt — no RAG needed, all content goes directly in the concierge prompt.

## Steps

### 1. Copy content from source repo

Copy `src/content/` from `govtech-bb/frontend-alpha` into `data/alpha-gov-bb/` in this repo. Some entries are `.md` files, others are directories containing `index.md` — flatten these so every service is a single `.md` file.

Exclude non-service pages: `terms-conditions.md`, `what-we-mean-by-alpha.md`, `whats-changing.md`.

### 2. Add 55 missing forms to the Telegram bot

The system prompts for these forms already exist in three data files that the build script doesn't load yet:
- `assets/bla-new-forms-data.js` — 29 additional BLA forms (window.BLA_NEW_FORMS, window.BLA_NEW_SYSTEM_PROMPTS)
- `assets/govt-forms-data.js` — government forms: land tax, firearms permits, etc. (window.GOVT_FORMS, window.GOVT_SYSTEM_PROMPTS)
- `assets/police-forms-data.js` — police forms: firearms, accident reports (window.POLICE_FORMS, window.POLICE_SYSTEM_PROMPTS)

Update `scripts/build-telegram-data.cjs` to:
- Add these 3 files to the `dataFiles` array so they're loaded alongside the existing form data
- Merge their FORMS and SYSTEM_PROMPTS into the combined arrays
- This brings the total from 62 to ~117 forms the bot can complete

### 3. Update build-telegram-data.cjs — replace SERVICES_KNOWLEDGE

Replace the hardcoded `SERVICES_KNOWLEDGE` (lines 129-190) with dynamic loading:
- Read all `.md` files from `data/alpha-gov-bb/`
- Concatenate into a structured knowledge block
- Log total character/token count as a sanity check

### 3. Update concierge prompt instructions

Add to the "WHEN SOMEONE DESCRIBES A NEED" section in `build-telegram-data.cjs`:
- When someone asks about requirements, fees, documents, eligibility, or processing times, answer from the detailed knowledge below — be specific
- Always include the alpha.gov.bb URL so the user can visit for the latest info
- If the service has an associated form the bot can fill in, proactively tell the user "I can help you complete this form right now"

### 4. Add "completable forms" list to the concierge prompt

The build script already generates the full form list for routing. Add a clearly labelled section to the concierge prompt listing all 62 forms that can be completed via chat, so the concierge knows which services it can actively help with vs which ones it can only provide information about. The build script already has this data in the `FORMS` array — generate a summary like:

```
FORMS YOU CAN COMPLETE VIA CHAT:
- Self-Employment Registration (NIS)
- Change of Vehicle Colour (BLA)
- ...
When a user asks about one of these services, tell them you can help them fill in the form right now.
```

### 4. Rebuild and test

- `node scripts/build-telegram-data.cjs`
- Test: "What documents do I need to register a birth?", "How much does a passport cost?"

## Files to create/modify

| File | Action |
|------|--------|
| `data/alpha-gov-bb/*.md` | Create — copied from govtech-bb/frontend-alpha src/content |
| `scripts/build-telegram-data.cjs` | Modify — replace hardcoded SERVICES_KNOWLEDGE with dynamic loading |

No new dependencies. No changes to `telegram.mjs`.

## 62 forms the Telegram bot can complete

**National Insurance Scheme (NIS):**
Self-Employment Registration, NIS Online Service Registration, Direct Deposit Form, NIS Contributions Certificate (D.P. 10), Self-Employed Contributions Certificate, Termination Certificate, Claim for Unemployment Benefit, Claim for Old Age Contributory Pension, NIS Educational Status Form, NIS Life Certificate, Register as an Employer for NIS Online Services

**Central Bank of Barbados:**
Pensioner Declaration

**Barbados Licensing Authority (BLA):**
Permit to Remove / Relocate Structure, Change of Engine, Change of Use of Vehicle, Request to Change the Colour of Vehicle, Declaration Form – Company Vehicle, Declaration Form – Partnership Vehicle, Declaration Form – Sole Trader Vehicle, Request for Duty Free Concession (Business), Request for Duty Free Concession (Individual), Request for Graphics and/or Lettering on Vehicle, Application for the Importation of Vehicles, Apply for a Motor Vehicle Inspection, Odometer Reading Validation, Register or Renew Your Motor Vehicle Licence, Register Your Vehicle for a Temporary Stay in Barbados, Retain Your Vehicle Registration Number, Sale of Vehicle (Individual Owner), Sale of Vehicle (Joint Owners), Scrap or Sell Vehicle in Parts, Transfer of Vehicle (Individual Owner), Transfer of Vehicle (Joint Owners), Application for Vehicle Investigation, Application for an Approved Vanity Plate

**Corporate Affairs and IP (CAIPO):**
Registration of a Business Name (Form I), Company Name Search and Reservation (Form 33), SRL Name Search and Reservation, Declaration of Compliance (Companies Act Cap. 308), Declaration of Compliance (Non-Profit Company), Articles of Reincorporation, Financial Statements Exemption, Registered Agent Authorisation, Geographical Indications Agent Authorisation, Declaration of URL / Domain Name Ownership, International Business Company Licence Application, CARICOM Complaints Form

**Immigration and Citizenship (IMMD):**
Certificate of Citizenship by Descent, Registration as a Citizen (Adult), Registration as a Citizen (Under 18), Registration as a Citizen by Marriage, Commonwealth Citizenship Registration, Citizenship Affidavit, Immigrant Status and Non-National Registration, Permanent Resident Registration, CARICOM Indefinite Stay Application, Certificate of Eligibility for Student Status, Certificate by Non-Immigrant Student, Short Term Work Permit or Training Attachment, Work Permit / Extension / Job Offer

**National Assistance Board (NAB):**
Application for Home Care Services, Seniors' Recreational Activities Programme

## Delta: Web prototypes vs Telegram/Chat bot forms

**Summary:** 87 web prototypes, 62 Telegram/chat forms. Only 32 overlap — the rest are exclusive to one channel.

### Web prototype only (55 forms — no Telegram/chat bot support)

| Form | Category |
|------|----------|
| Agribusiness Farm Registration | Government |
| Approved Vehicle Garage | BLA |
| Building Development Application | Government |
| Change Driving Test Date | BLA |
| Change of Address | BLA |
| Change Regulation Test Date | BLA |
| Chattel House Permission | Government |
| Conductors Licence | BLA |
| Disabled Parking Permit | BLA |
| Drivers Licence | BLA |
| Driving Exam Date Change | BLA |
| Driving Record | BLA |
| Duplicate PSV Licence | BLA |
| Duty Free Vehicle | BLA |
| F-Class Driving Licence | BLA |
| Firearm Licence | Police |
| Firearms Dealer Licence | Police |
| Import/Export Firearms | Police |
| International Driving Permit | BLA |
| International Driving Permit Process | BLA |
| Land Tax Advance Assessment | Government |
| Land Tax Change of Ownership | Government |
| Land Tax Demand Notice | Government |
| Lost Learner Permit | BLA |
| Loud Music Permit | Government |
| MO Plate Renewal | BLA |
| Motorcade Application | BLA |
| New Learner Permit | BLA |
| New Permit Application | BLA |
| NIS Educational Status | NIS |
| NIS Employer Registration | NIS |
| NIS Life Certificate | NIS |
| Number Plate Manufacturer | BLA |
| Old Age Pension | NIS |
| Permission to Construct Building | Government |
| Police Accident Report | Police |
| PSV Driving Licence Info | BLA |
| Register Bicycle/Motorcycle | BLA |
| Regulation Test Appointment | BLA |
| Regulation Test Process | BLA |
| Regulation Test Times | BLA |
| Reinstatement Driving Licence | BLA |
| Sample Financial Declaration | Government |
| Sell Goods Beach/Park | Government |
| Shooting Club Licence | Police |
| Stolen Vehicle | BLA |
| Taxi Driver Licence | BLA |
| Taxi Oral Test | BLA |
| Tint Vehicle | BLA |
| Tinted Window Exemption (Business) | BLA |
| Transfer International Licence | BLA |
| Transfer of Permit | BLA |
| Transfer Vehicle (Death) | BLA |
| Vehicle Registration (Private) | BLA |
| Wills | Government |

### Telegram/chat only (30 forms — no web prototype)

| Form | Category |
|------|----------|
| Registration of a Business Name (Form I) | CAIPO |
| CARICOM Complaints Form | CAIPO |
| Company Name Search (Form 33) | CAIPO |
| Declaration of Compliance (Cap. 308) | CAIPO |
| Declaration of Compliance (Non-Profit) | CAIPO |
| Financial Statements Exemption | CAIPO |
| Geographical Indications Agent Auth | CAIPO |
| IBC Licence Application | CAIPO |
| Registered Agent Authorisation | CAIPO |
| Articles of Reincorporation | CAIPO |
| SRL Name Search | CAIPO |
| Declaration of URL/Domain | CAIPO |
| Citizenship Affidavit | IMMD |
| CARICOM Indefinite Stay | IMMD |
| Registration as Citizen (Adult) | IMMD |
| Registration as Citizen by Marriage | IMMD |
| Registration as Citizen (Under 18) | IMMD |
| Commonwealth Citizenship | IMMD |
| Certificate of Citizenship by Descent | IMMD |
| Immigrant Status Registration | IMMD |
| Permanent Resident Registration | IMMD |
| Short Term Work Permit | IMMD |
| Student Status Certificate (H-1) | IMMD |
| Non-Immigrant Student Certificate (H-2) | IMMD |
| Work Permit / Extension | IMMD |
| Home Care Services | NAB |
| Seniors' Recreational Activities | NAB |
| NIS Old Age Pension | NIS |
| NIS Employer Registration | NIS |
| NIS Life Certificate | NIS |

### Both channels (32 forms)

Direct Deposit, NIS Contributions Certificate, Self-Employment Registration, NIS Online Service Registration, Pensioner Declaration, Unemployment Benefit, Self-Employed Contributions Certificate, Termination Certificate, Permit to Remove/Relocate Structure, Change of Engine, Change of Use, Change of Vehicle Colour, Declaration (Company/Partnership/Sole Trader Vehicle), Duty Free Concession (Business/Individual), Request for Graphics, Importation of Vehicles, Motor Vehicle Inspection, Odometer Reading Validation, Vehicle Registration Renewal, Registration Temporary Stay, Retention of Registration Number, Sale of Vehicle (Individual/Joint), Scrapping of Vehicle, Transfer of Vehicle (Individual/Joint), Vehicle Investigation, Vanity Plate Application, NIS Educational Status, NIS Employer Registration, NIS Life Certificate, Old Age Pension

## Verification

1. `data/alpha-gov-bb/` contains ~47 service markdown files
2. Build script generates `telegram-data.mjs` with full service content in CONCIERGE_PROMPT
3. Total system prompt under 40,000 tokens
4. Bot answers "What documents do I need to register a birth?" with specific details
5. Bot still routes to forms correctly when users want to fill one in
6. Bot includes alpha.gov.bb URLs in informational responses
