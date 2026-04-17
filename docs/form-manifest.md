# Form Manifest

Master inventory of all government forms sourced from PDF documents, cross-referenced against existing prototypes, chat data entries, and reference.js prefix mappings.

Generated: 2026-04-16

---

## Legend

- **agency**: BLA = Barbados Licensing Authority, NIS = National Insurance Scheme, CAIPO = Corporate Affairs and Intellectual Property Office, IMMD = Citizenship Immigration and Passports, Police = Royal Barbados Police Force, Land Tax = Land Tax Department, Town Planning = Town and Country Development Planning Office, Agriculture = Ministry of Agriculture
- **doc_type**: `form` = fillable application form, `info` = process/guidance document
- **duplicate_of**: references the canonical_form_id of the primary entry when this row is a duplicate or variant
- **existing_prototype**: path to clickable HTML prototype if one exists
- **existing_chat_data**: `filename:id` reference to chat bot data entry
- **reference_js**: prefix code in lib/reference.js

---

| # | source_title | agency | canonical_form_id | duplicate_of | doc_type | existing_prototype | existing_chat_data | reference_js |
|---|---|---|---|---|---|---|---|---|
| 1 | Agribusiness Farm Registration Form | Agriculture | agribusiness-farm-registration | | form | | | |
| 2 | Duty Free Vehicle | BLA | duty-free-vehicle | | form | | | |
| 3 | Driver's Licence | BLA | drivers-licence | | form | | | |
| 4 | Application to Remove a Building/House or a Boat | BLA | permit-to-remove | | form | Prototypes/permit-to-remove.html | | VEP |
| 5 | Application for Disabled Parking Permit | BLA | disabled-parking-permit | | form | | | |
| 6 | Registration of Vehicle for Temporary Stay in Barbados | BLA | registration-temporary-stay | | form | | bla-forms-data.js:registration-temporary-stay | RTS |
| 7 | Application for Limited Trade Plates | BLA | limited-trade-plates | | form | | | |
| 8a | Vehicle Registration (Private Vehicle) | BLA | vehicle-registration-private | | form | | | |
| 8b | Vehicle Registration Form | BLA | vehicle-registration | vehicle-registration-private | form | | | |
| 9 | Application for Tinted Window Exemption (Businesses) | BLA | tinted-window-exemption-business | | form | | | |
| 10 | Application to Be an Approved Vehicle Garage | BLA | approved-vehicle-garage | | form | | | |
| 11 | Conductor's Licence | BLA | conductors-licence | | form | | | |
| 12 | Application for Oral Test for a Taxi Licence | BLA | taxi-oral-test | | form | | | |
| 13 | Application for Approval of a Registration Number Plate Manufacturer | BLA | number-plate-manufacturer | | form | | | |
| 14 | Authorization for the Importation of Vehicles | BLA | importation-of-vehicles | | form | | bla-forms-data.js:importation-of-vehicles | IOV |
| 15 | Change of Address | BLA | change-of-address | | form | | | |
| 16 | Change of Engine Form | BLA | change-of-engine | | form | | bla-forms-data.js:change-of-engine | COE |
| 17 | Change of Use of Vehicle Form | BLA | change-of-use | | form | | bla-forms-data.js:change-of-use | COU |
| 18 | Declaration to Establish Usage for Vehicle Registration for a Partnership | BLA | declaration-partnership-vehicle | | form | | bla-forms-data.js:declaration-partnership-vehicle | DP |
| 19 | Driving Exam Date Change | BLA | driving-exam-date-change | | form | | | |
| 20 | Request for Duplicate PSV Driving Licence | BLA | duplicate-psv-licence | | form | | | |
| 21 | F-Class Driving Licences | BLA | f-class-driving-licence | | form | | | |
| 22a | International Driving Permit | BLA | international-driving-permit | | form | | | |
| 22b | International Driving Permit Process | BLA | international-driving-permit-process | | info | | | |
| 23 | Lost Learner Permit | BLA | lost-learner-permit | | form | | | |
| 24 | MO Plate Renewal Form | BLA | mo-plate-renewal | | form | | | |
| 25 | New Learner Permit | BLA | new-learner-permit | | form | | | |
| 26 | Obtaining a PSV Driving Licence in Barbados | BLA | psv-driving-licence | | info | | | |
| 27 | Taxi Driver Licence | BLA | taxi-driver-licence | | form | | | |
| 28 | Online Appointment for Regulation Test | BLA | regulation-test-appointment | | form | | | |
| 29 | Register a Bicycle/Motorcycle | BLA | register-bicycle-motorcycle | | form | | | |
| 30 | Registration of Vehicle for Temporary Stay in Barbados | BLA | registration-temporary-stay-dup | registration-temporary-stay | form | | bla-forms-data.js:registration-temporary-stay | RTS |
| 31 | Request for Reinstatement of Driving Licence | BLA | reinstatement-driving-licence | | form | | | |
| 32 | Request for a Change of Driving Test Date | BLA | change-driving-test-date | | form | | | |
| 33a | Request for a Change of Regulation Test Date | BLA | change-regulation-test-date | | form | | | |
| 33b | Regulation Test Process | BLA | regulation-test-process | | info | | | |
| 33c | Regulation Test Times | BLA | regulation-test-times | | info | | | |
| 34 | Request for a Driving Record | BLA | driving-record | | form | | | |
| 35 | Request for Investigation into Duplicate Vehicle Licence Plate Numbers | BLA | duplicate-plate-investigation | | form | | bla-forms-data.js:vehicle-investigation | VI |
| 36 | Request to Change the Colour of Vehicle | BLA | change-of-vehicle-colour | | form | | bla-forms-data.js:change-of-vehicle-colour | CVC |
| 37 | Retention of Vehicle Registration Number | BLA | retention-of-registration-number | | form | | bla-forms-data.js:retention-of-registration-number | RON |
| 38 | Sale of Vehicle - Joint Owners | BLA | sale-of-vehicle-joint | | form | | bla-forms-data.js:sale-of-vehicle-joint | SVJ |
| 39 | Sale of Vehicle - Single Owner | BLA | sale-of-vehicle-individual | | form | | bla-forms-data.js:sale-of-vehicle-individual | SVI |
| 40 | Scrapping of Vehicle / Selling Vehicle in Parts | BLA | scrapping-of-vehicle | | form | | bla-forms-data.js:scrapping-of-vehicle | SOV |
| 41 | Stolen Vehicle Form | BLA | stolen-vehicle | | form | | | |
| 42 | Tint Vehicle | BLA | tint-vehicle | | form | | | |
| 43 | Request for a Transfer of an International Driving Licence | BLA | transfer-international-licence | | form | | | |
| 44 | Transfer of Vehicle Due to Death of Owner | BLA | transfer-vehicle-death | | form | | | |
| 45 | Vehicle Inspection Application | BLA | motor-vehicle-inspection | | form | | bla-forms-data.js:motor-vehicle-inspection | LA |
| 46 | Vehicle Transfer - Joint Owner | BLA | transfer-of-vehicle-joint | | form | | bla-forms-data.js:transfer-of-vehicle-joint | TVJ |
| 47 | Vehicle Transfer - Single Owner | BLA | transfer-of-vehicle-individual | | form | | bla-forms-data.js:transfer-of-vehicle-individual | TVI |
| 48 | Wills | Other | wills | | form | | | |
| 49 | Application for Police Accident Report | Police | police-accident-report | | form | | | |
| 50 | Application for Motorcade | Police | motorcade-application | | form | | | |
| 51 | Application for Police Loud Music Permit | Police | loud-music-permit | | form | | | |
| 52 | Application to Import/Export Firearms | Police | import-export-firearms | | form | | | |
| 53 | Application for Firearm Licence | Police | firearm-licence | | form | | | |
| 54 | Application for Firearms Dealer/Gunsmith Licence | Police | firearms-dealer-licence | | form | | | |
| 55 | Application for Shooting Club Licence | Police | shooting-club-licence | | form | | | |
| 56a | Application to Request a Land Tax Demand Notice | Land Tax | land-tax-demand-notice | | form | | | |
| 56b | Application to Request Advance Land Tax Assessment | Land Tax | land-tax-advance-assessment | | form | | | |
| 57 | Notice of Change of Ownership (Land Tax) | Land Tax | land-tax-change-of-ownership | | form | | | |
| 58 | Request for Duty Free Concession for Business | BLA | duty-free-concession-business | | form | | bla-forms-data.js:duty-free-concession-business | DFB |
| 59 | Application for Duty Free Concession for Individuals | BLA | duty-free-concession-individual | | form | | bla-forms-data.js:duty-free-concession-individual | DFI |
| 60 | Articles of Reincorporation | CAIPO | caipo-reincorporation | | form | | caipo-forms-data.js:caipo-reincorporation | ARI |
| 61 | Company Declaration Form | CAIPO | caipo-company-declaration | | form | | | |
| 62 | Declaration Form - Domestic Company | CAIPO | caipo-declaration-domestic | | form | | caipo-forms-data.js:caipo-declaration-cap308 | DC308 |
| 63 | Declaration Form - International Business Company | CAIPO | caipo-declaration-ibc | | form | | | |
| 64 | Declaration Form - Non-Profit Company | CAIPO | caipo-declaration-nonprofit | | form | | caipo-forms-data.js:caipo-declaration-nonprofit | DCNP |
| 65 | IBC Licence Application | CAIPO | caipo-ibc-licence | | form | | caipo-forms-data.js:caipo-ibc-licence | IBC |
| 66 | Registered Agent Authorisation Form | CAIPO | caipo-registered-agent | | form | | caipo-forms-data.js:caipo-registered-agent | RA |
| 67 | Sample Financial Declaration | CAIPO | caipo-financial-declaration | | info | | caipo-forms-data.js:caipo-financial-exemption | FSE |
| 68 | Declaration of URL/Domain Name Ownership | CAIPO | caipo-url-domain | | form | | caipo-forms-data.js:caipo-url-domain | URL |
| 69a | Immigration Form A | IMMD | immd-form-a | | form | | immd-forms-data.js:immd-immigrant-status | ISA |
| 69b | Immigration Form B | IMMD | immd-form-b | | form | | | |
| 70a | Building Development New Application Form | Town Planning | building-development-application | | form | | | |
| 70b | Permission to Construct/Alter a Building | Town Planning | permission-construct-building | | form | | | |
| 71 | Sell Goods or Services on a Beach or Park | Other | sell-goods-beach-park | | form | | | |
| 72 | Unemployment Benefit Form | NIS | unemployment-benefit | | form | Prototypes/unemployment-benefit.html | | UB |
| 73 | DP-10 Contributions Certificate | NIS | dp10-contributions | | form | Prototypes/dp10-contributions.html | | DP10 |
| 74 | NIS Educational Status Form | NIS | nis-educational-status | | form | | other-forms-data.js:nisss-edu-status | ESF |
| 75 | Employee Online Social Security Registration | NIS | nis-online-registration | | form | Prototypes/nis-online-registration.html | | OSS |
| 76 | Employer Online Social Security Registration | NIS | nis-employer-registration | | form | | other-forms-data.js:nisss-employer-reg | ER |
| 77 | NIS Life Certificate | NIS | nis-life-certificate | | form | | other-forms-data.js:nisss-life-cert | LC |
| 78 | NIS Direct Deposit Form | NIS | direct-deposit | | form | Prototypes/direct-deposit.html | | DD |
| 79 | Contributory Old Age Pension | NIS | old-age-pension | | form | | other-forms-data.js:nisss-old-age | OAP |
| 80 | Pensioner Declaration Form (Central Bank) | Central Bank | pensioner-declaration | | form | Prototypes/pensioner-declaration.html | | PD |
| 81 | NIS Contributions Payment Certificate (Self-employed) | NIS | self-employed-contributions | | form | Prototypes/self-employed-contributions.html | | SECP |
| 82 | Unemployment Benefit Form (duplicate) | NIS | unemployment-benefit-dup | unemployment-benefit | form | Prototypes/unemployment-benefit.html | | UB |
| 83 | Permission to Erect a Chattel House | Town Planning | chattel-house-permission | | form | | | |
| 84 | New Permit Application Form and Requirements | Other | new-permit-application | | form | | | |
| 85 | Transfer of Permit Application Form | Other | transfer-of-permit | | form | | | |

---

## Work needed per form

Forms fall into these categories based on what already exists:

| Status | Meaning | Count |
|---|---|---|
| **SKIP** | Has existing HTML prototype (rows #4, #72, #73, #75, #78, #80, #81, #82) or is a duplicate | 11 |
| **PROTOTYPE + CHAT** | No prototype exists, no chat data — needs both HTML prototype and chat script | ~45 |
| **PROTOTYPE ONLY** | Has chat data but no HTML prototype — needs prototype, chat script already exists | ~22 |
| **INFO PAGE** | Process/guidance doc — needs informational page only (#22b, #26, #33b, #33c, #67) | 5 |

---

## Summary

| Category | Count |
|---|---|
| Total entries | 85 (plus sub-entries for multi-PDF blocks) |
| Unique forms (excluding duplicates and info docs) | ~74 |
| Info/process documents | 5 (#22b, #26, #33b, #33c, #67) |
| Identified duplicates | 3 (#30 = #6, #82 = #72, #8b = #8a) |
| With existing HTML prototype | 8 (#4, #72, #73, #75, #78, #80, #81, #82) |
| With existing chat data entry | 22 |
| With reference.js mapping | 28 |
| New forms (no prototype, no chat data, no reference) | ~45 |

### Agency breakdown

| Agency | Form count |
|---|---|
| BLA | 42 |
| NIS | 8 |
| CAIPO | 9 |
| IMMD | 2 |
| Police | 7 |
| Land Tax | 3 |
| Town Planning | 3 |
| Agriculture | 1 |
| Central Bank | 1 |
| Other | 4 |

---

## Discovery pipeline

Use the local crawler to refresh likely form candidates before updating this manifest:

```bash
python3 scripts/discover_forms.py \
  --domains data/domains.txt \
  --output data/manifests/barbados_forms.csv \
  --checkpoint data/checkpoints/barbados_forms.json \
  --resume
```

Notes:

- The crawler prefers `robots.txt` and sitemap discovery, then falls back to bounded HTML crawling.
- It keeps only likely fillable forms and possible forms, not every document.
- Long PDFs are down-ranked and PDFs with `16+` pages are excluded by default as likely publications.
- Resume state is stored in `data/checkpoints/barbados_forms.json`.
- Add `--use-playwright-fallback` only for domains that appear JavaScript-heavy and are not yielding links via normal crawling.
