/* NAB (National Assistance Board) + additional NIS forms data
   for chat-interface.html — 6 forms */
(function () {
  'use strict';

  window.OTHER_FORMS = [
    { id: 'nab-home-care', name: 'Application for Home Care Services', ref: 'HC', agency: 'National Assistance Board (NAB)' },
    { id: 'nab-seniors-rec', name: "Seniors' Recreational Activities Programme", ref: 'SRA', agency: 'National Assistance Board (NAB)' },
    { id: 'nisss-edu-status', name: 'NIS Educational Status Form', ref: 'ESF', agency: 'National Insurance Scheme (NIS)' },
    { id: 'nisss-employer-reg', name: 'Register as an Employer for NIS Online Services', ref: 'ER', agency: 'National Insurance Scheme (NIS)' },
    { id: 'nisss-life-cert', name: 'NIS Life Certificate', ref: 'LC', agency: 'National Insurance Scheme (NIS)' },
    { id: 'nisss-old-age', name: 'Claim for Old Age Contributory Pension', ref: 'OAP', agency: 'National Insurance Scheme (NIS)' }
  ];

  window.OTHER_SYSTEM_PROMPTS = {

'nab-home-care': `Application for Home Care Services (HC) — National Assistance Board (NAB). Apply for home care services for an elderly or disabled person.
This service provides help to elderly or disabled people who need support at home.

FIELDS:

Recipient's name (keys: first-name, initial, last-name):
- first-name, initial (optional), last-name

Recipient's address (keys: address, location-of-house):
- address — Home address (street, village or district)
- location-of-house — optional: describe how to find the house if needed

Personal details (keys: dob-day, dob-month, dob-year, gender, nrn, place-of-birth, religion, church-social-group):
- dob — date of birth (DD MM YYYY)
- gender — Male or Female
- nrn — optional: National Registration Number (format YYMMDD-XXXX)
- place-of-birth — optional
- religion — optional
- church-social-group — optional

Contact person (keys: contact-name, contact-address):
- contact-name — name of contact person
- contact-address — optional: their address (only if different from recipient's)

Contact details (keys: home-tel, office-tel, mobile-tel, contact-email, marital-status):
- home-tel — optional: home telephone
- office-tel — optional: office telephone
- mobile-tel — optional: mobile
- contact-email — optional: email for confirmation
- marital-status — optional: Single, Married, Divorced, Widowed, or Separated

Income (keys: income-welfare, income-nis, income-oap, income-overseas, income-other, former-occupation, social-interests, referred-by, application-date-day, application-date-month, application-date-year):
- income-welfare — optional: welfare grant amount
- income-nis — optional: National Insurance amount
- income-oap — optional: Old Age Pension amount
- income-overseas — optional: overseas pension amount
- income-other — optional: other sources of income (source and amount)
- former-occupation — optional
- social-interests — optional
- referred-by — optional: who referred them
- application-date — date of application (DD MM YYYY)

Household (keys: household-members):
- household-members — optional: who else lives in the household (name, date of birth, age, relationship for each person)

Physical condition (keys: sight, hearing, physical-description):
- sight — Normal, Visual impairment, Blind, or Uses spectacles (can select multiple)
- hearing — Normal, Hearing impairment, Deaf, or Speech impairment (can select multiple)
- physical-description — optional: describe any other physical conditions

Mental status (keys: behaviour, behaviour-description, memory, memory-description):
- behaviour — Normal, Abnormal, or Other
- behaviour-description — optional
- memory — Normal, Fair, or Poor
- memory-description — optional

Physical attributes (keys: height, size, mobility, illnesses, disability-details):
- height — Short, Medium, or Tall
- size — Slim, Medium, or Obese
- mobility — Normal, Cane, Zimmer Frame, or Wheel Chair
- illnesses — Hypertension, Diabetes, Arthritis, Heart condition, Visual impairment, Healthy, or Other (can select multiple)
- disability-details — optional: details of any disabilities

Assistance needed (keys: assistance, assist-other-spec, care-plan):
- assistance — What help is needed: Cooking, Grooming, Cleaning, De-bedding, or Other (can select multiple)
  → If Other: assist-other-spec (describe the other assistance needed)
- care-plan — optional: any care plan notes
<<BASE_RULES>>`,

'nab-seniors-rec': `Seniors' Recreational Activities Programme (SRA) — National Assistance Board (NAB). Apply for the seniors recreational activities programme.

FIELDS:

Programme location (keys: programme-location):
- programme-location — Choose a location. Options include: St. Matthias Church (Tuesday), St. Bartholomew Church (Wednesday), Bayville Centre (Wednesday), St. Stephen's Church (Thursday), St. Martin's Mangrove (Friday), Ellerston Community Centre (Monday), St. Silas Church (Tuesday), St. Christopher's Church (Wednesday), CMF Building Cane Garden (Thursday), Eden Lodge Community Centre (Friday), Seventh-Day Adventist Church Checker Hall (Monday), Boscobel Community Centre (Tuesday), Church of the Nazarene Maynards (Wednesday), Gall Hill Community Centre (Thursday), YMCA Pinfold Street (Monday), First Baptist Church (Tuesday), Breath of Life Centre (Wednesday), St. Paul's Church (Thursday)

Name (keys: surname, first-name, middle-name):
- surname, first-name, middle-name (optional)

Personal details (keys: nrn, nationality, age, gender):
- nrn — Barbados National Registration Number (format YYMMDD-XXXX)
- nationality
- age
- gender — Male or Female

Address and contact (keys: contact-number, street-address, district, parish):
- contact-number — phone number
- street-address, district, parish

Health conditions (keys: health-conditions, disability-type):
- health-conditions — select all that apply: Good Health, Diabetes, Hypertension, Disability, Arthritis, Asthma, Heart Disease, Mental Illness, or Other
  → If Disability: disability-type (describe the disability)

Emergency contact (keys: emergency-name, emergency-number, emergency-address):
- emergency-name — full name
- emergency-number — phone number
- emergency-address

Application info (keys: completing-name, application-date-day, application-date-month, application-date-year):
- completing-name — optional: name of the person completing this on someone else's behalf (only if applicable)
- application-date — date of application (DD MM YYYY)
<<BASE_RULES>>`,

'nisss-edu-status': `NIS Educational Status Form (ESF) — National Insurance Scheme (NIS). Confirm student enrolment status with NIS.
This service confirms a student's enrolment status with NIS.

FIELDS:

Student details (keys: nis-number, nrn, last-name, first-name, middle-name, address, district, parish, postal-code, email, tel, cell, dob-day, dob-month, dob-year):
- nis-number — 6-digit National Insurance number
- nrn — National Registration Number (format YYMMDD-XXXX)
- last-name, first-name, middle-name (optional)
- address, district (optional), parish, postal-code (BB + 5 digits)
- email
- tel and/or cell — at least one phone number required
- dob — date of birth (DD MM YYYY)

Institution details (keys: institution-name, institution-address, institution-country, education-level, enrolled-fulltime, enrolment-date-day, enrolment-date-month, enrolment-date-year, term-from-day, term-from-month, term-from-year, term-to-day, term-to-month, term-to-year):
- institution-name — name of educational institution
- institution-address
- institution-country (e.g. Barbados)
- education-level — Secondary (High School), Tertiary (University, College, Technical Institute), or Other
- enrolled-fulltime — Is the student currently enrolled and attending full-time? Yes or No
- enrolment-date — date of enrolment (DD MM YYYY)
- term-from — current term start date (DD MM YYYY)
- term-to — current term end date (DD MM YYYY)
<<BASE_RULES>>`,

'nisss-employer-reg': `Register as an Employer for NIS Online Services (ER) — National Insurance Scheme (NIS). Register as an employer for NIS online services.

FIELDS:

Business details (keys: employer-reg-number, business-name, business-address-1, business-address-2, business-district, business-parish):
- employer-reg-number — NIS Employer Registration Number (found on NIS employer registration certificate)
- business-name
- business-address-1, business-address-2 (optional)
- business-district — optional
- business-parish — one of the 11 Barbados parishes

Contact details (keys: contact-name, contact-phone, contact-email, confirm-email):
- contact-name — contact person's name
- contact-phone — phone number
- contact-email — email address (login credentials will be sent here)
- confirm-email — confirm the email address (must match contact-email)
<<BASE_RULES>>`,

'nisss-life-cert': `NIS Life Certificate (LC) — National Insurance Scheme (NIS). Complete NIS life certificate to confirm you are alive and eligible for benefits.
This service confirms the beneficiary is alive and still eligible for their benefit.

FIELDS:

Personal details (keys: nis-number, nrn, last-name, first-name, middle-name, address, district, parish, postal-code, email, tel, cell, dob-day, dob-month, dob-year):
- nis-number — 6-digit National Insurance number
- nrn — National Registration Number (format YYMMDD-XXXX)
- last-name, first-name, middle-name (optional)
- address, district (optional), parish, postal-code (BB + 5 digits)
- email
- tel and/or cell — at least one phone number required
- dob — date of birth (DD MM YYYY)

Benefit type (keys: benefit-type):
- benefit-type — Which benefit do you receive? Old Age Contributory Pension, Survivors' or Death Benefit, or Disablement Benefit

Survivors' question — only if benefit-type is "Survivors' or Death Benefit" (keys: remarried, remarried-date-day, remarried-date-month, remarried-date-year):
- remarried — Have you remarried or cohabitated during this period? Yes or No
  → If Yes: remarried-date — date of marriage or cohabitation (DD MM YYYY)

Witness declaration (keys: alive-date-day, alive-date-month, alive-date-year, witness-name, witness-profession, witness-date-day, witness-date-month, witness-date-year):
- alive-date — date the claimant was confirmed alive (DD MM YYYY)
- witness-name — full name of the witness
- witness-profession — witness profession or title (e.g. Justice of the Peace)
- witness-date — date the witness signed (DD MM YYYY)

Note: mention this needs to be witnessed by a Justice of the Peace, Notary Public, or similar authority.
<<BASE_RULES>>`,

'nisss-old-age': `Claim for Old Age Contributory Pension (OAP) — National Insurance Scheme (NIS). Claim old age contributory pension from NIS.

FIELDS:

Eligibility type (keys: eligibility-type):
- eligibility-type — Which type of pension? Standard pension, Early retirement, or Deferred pension

Personal details (keys: nis-number, nrn, last-name, first-name, middle-name, dob-day, dob-month, dob-year, street-address, district, parish, postal-code, telephone, cell, contact-email):
- nis-number — 6-digit National Insurance number
- nrn — National Registration Number (format YYMMDD-XXXX)
- last-name, first-name, middle-name (optional)
- dob — date of birth (DD MM YYYY)
- street-address, district (optional), parish, postal-code (optional, BB + 5 digits)
- telephone and/or cell — at least one required
- contact-email

Retirement type — depends on eligibility-type (keys: early-retirement-date-day, early-retirement-date-month, early-retirement-date-year, deferred-pension-date-day, deferred-pension-date-month, deferred-pension-date-year):
- If Early retirement: early-retirement-date (DD MM YYYY)
- If Deferred pension: deferred-pension-date (DD MM YYYY)
- If Standard: no extra date needed

Employment details (keys: employer-name, retirement-date-day, retirement-date-month, retirement-date-year, director):
- employer-name — name of current or last employer
- retirement-date — date of retirement (DD MM YYYY)
- director — Are you or were you a director of a company? Yes or No

Employment history (keys: first-nis-year, worked-overseas, overseas-country-1, overseas-from-1, overseas-to-1, overseas-ssn-1, etc.):
- first-nis-year — year you first paid NIS contributions (4-digit year)
- worked-overseas — Have you ever worked outside Barbados? Yes or No
  → If Yes: for each country — country name, from date, to date, social security number (optional). Ask if there are more countries.

Alternate payee — optional (keys: alternate-payee, ap-nrn, ap-nis, ap-last-name, ap-first-name, ap-middle-name, ap-dob-day, ap-dob-month, ap-dob-year, ap-address, ap-district, ap-parish, ap-postal-code, ap-telephone, ap-cell, ap-email):
- alternate-payee — Do you want someone else to receive payments on your behalf? Yes or No
  → If Yes: collect their NRN, NIS number, name, dob, address, parish, postal-code, phone (at least one), email

Banking details — optional (keys: provide-banking, account-name, account-number, bank-branch, overseas-banking-codes):
- provide-banking — Would you like to provide your bank details for direct deposit? Yes or No
  → If Yes: account-name (as it appears on the bank statement), account-number, bank-branch (bank name and branch)
  → overseas-banking-codes — optional: SWIFT/IBAN codes (only for overseas pensioners)
<<BASE_RULES>>`

  };
})();
