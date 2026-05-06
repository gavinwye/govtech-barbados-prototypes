// YDP form registry. Drives /api/ydp-submit validation and email routing.
//
// Each entry defines what a YDP form is allowed to submit. Field allow-lists
// support exact names and trailing-`*` prefix globs (e.g. `ec-*` matches
// `ec-name`, `ec-phone`). Unknown fields are rejected.
//
// Recipient resolution at request time:
//   1. If `recipientEnv` is set and that env var has a value, use it.
//   2. Otherwise fall back to YDP_FALLBACK_EMAIL.
// `YDP_FALLBACK_EMAIL` must be an approved monitored Youth Development mailbox
// in production — not a personal or demo inbox.

const COMMON_FIELDS = [
  'first-name', 'middle-initial', 'last-name', 'full-name',
  'dob-day', 'dob-month', 'dob-year', 'age',
  'parish', 'address', 'address-line1', 'address-line2', 'mailing-address',
  'country-of-birth', 'nationality', 'nationality-other', 'nationality-other-detail',
  'gender', 'gender-other', 'gender-other-detail', 'sex', 'union-status', 'marital-status',
  'email', 'contact-email', 'phone', 'phone-home', 'phone-mobile',
  'religion',
  'nrn', 'nin', 'national-id', 'tamis', 'has-nrn', 'has-nis', 'has-tamis', 'has-bank',
  'ec-*',
  'employment-status', 'employment-status-other',
  'qualification', 'institution', 'institution-name', 'qual-*',
  'agree-declaration', 'declaration-date-day', 'declaration-date-month', 'declaration-date-year',
  'data-protection-confirm', 'publicity-consent',
  'how-heard', 'how-heard-other', 'how-heard-other-detail',
  'med-*', 'med__*', 'medications', 'medication-allergies', 'allergies',
  'asthma', 'diabetes', 'epilepsy', 'disability', 'special-diet', 'diet-detail', 'blood-type',
  'conditions',
  'num-children', 'guardian1-*', 'guardian2-*'
];

export const REGISTRY = {
  'ydp-byac': {
    formName: 'BYAC Recruitment Form',
    refPrefix: 'BYAC',
    contactPhone: '(246) 535-0180',
    recipientEnv: 'YDP_RECIPIENT_BYAC',
    allowedFields: [
      ...COMMON_FIELDS,
      'career-goal', 'alt-choice-1', 'alt-choice-2', 'alt-choice-3',
      'can-swim', 'shirt-size', 'pants-size', 'shoe-size', 'employed'
    ],
    requiredFields: [
      'nrn', 'nin', 'first-name', 'last-name', 'address-line1', 'parish',
      'dob-day', 'dob-month', 'dob-year', 'country-of-birth', 'sex', 'union-status'
    ],
    ageMin: null,
    ageMax: null,
    sensitiveFields: ['nrn', 'nin', 'medication-allergies', 'allergies', 'blood-type', 'conditions'],
    hasCv: false
  },

  'ydp-dmp': {
    formName: 'Digital Media Programme 2026',
    refPrefix: 'DMP',
    contactPhone: '(246) 535-3863',
    recipientEnv: 'YDP_RECIPIENT_DMP',
    allowedFields: [
      ...COMMON_FIELDS,
      'community-group', 'group-name', 'group-address', 'group-contact-name', 'group-contact-phone'
    ],
    requiredFields: [
      'contact-email', 'first-name', 'last-name', 'national-id',
      'dob-day', 'dob-month', 'dob-year', 'gender', 'parish', 'phone',
      'employment-status', 'agree-declaration'
    ],
    ageMin: null,
    ageMax: null,
    sensitiveFields: ['national-id', 'nrn', 'nin', 'medications', 'conditions'],
    hasCv: false
  },

  'ydp-get-hired': {
    formName: 'Get Hired Programme 2026',
    refPrefix: 'GHP',
    contactPhone: '(246) 535-3863',
    recipientEnv: 'YDP_RECIPIENT_GET_HIRED',
    allowedFields: [
      ...COMMON_FIELDS,
      'right-to-work', 'current-status', 'education', 'interests',
      'cv-filename', 'cv-file-base64', 'cv-file-type'
    ],
    requiredFields: [
      'first-name', 'last-name', 'nrn', 'dob-day', 'dob-month', 'dob-year',
      'parish', 'country-of-birth', 'gender', 'email', 'phone',
      'right-to-work', 'education', 'cv-filename'
    ],
    ageMin: null,
    ageMax: null,
    sensitiveFields: ['nrn', 'national-id', 'nin', 'medications', 'conditions'],
    hasCv: true
  },

  'ydp-ncct': {
    formName: 'National Community Cultural Training Programme 2025',
    refPrefix: 'NCCTP',
    contactPhone: '(246) 535-3863',
    recipientEnv: 'YDP_RECIPIENT_NCCT',
    allowedFields: [
      ...COMMON_FIELDS,
      'experience-level', 'experience-level-other', 'experience-years',
      'experience-location', 'has-experience',
      'disciplines', 'disciplines__*',
      'in-clubs', 'clubs-list'
    ],
    requiredFields: [
      'nrn', 'first-name', 'last-name',
      'dob-day', 'dob-month', 'dob-year',
      'parish', 'country-of-birth', 'gender', 'email', 'phone',
      'employment-status', 'experience-level', 'how-heard'
    ],
    ageMin: 9,
    ageMax: 21,
    sensitiveFields: ['nrn', 'national-id', 'conditions'],
    hasCv: false
  },

  'ydp-pep': {
    formName: 'Pathways Employability Programme 2026',
    refPrefix: 'PEP',
    contactPhone: '(246) 535-3863',
    recipientEnv: 'YDP_RECIPIENT_PEP',
    allowedFields: [
      ...COMMON_FIELDS,
      'job-interests', 'emp__*', 'emp-other-detail',
      'bank-account', 'nis'
    ],
    requiredFields: [
      'first-name', 'last-name',
      'dob-day', 'dob-month', 'dob-year',
      'nationality', 'address', 'parish', 'contact-email', 'phone',
      'gender', 'how-heard', 'employment-status', 'marital-status',
      'data-protection-confirm'
    ],
    ageMin: 18,
    ageMax: 24,
    sensitiveFields: ['nis', 'bank-account', 'conditions'],
    hasCv: false
  },

  'ydp-yar-pa': {
    formName: 'Youth Achieving Results (Performing Arts)',
    refPrefix: 'YARPA',
    contactPhone: '(246) 535-3863',
    recipientEnv: 'YDP_RECIPIENT_YAR_PA',
    allowedFields: [
      ...COMMON_FIELDS,
      'has-experience', 'experience-years', 'experience-location',
      'disciplines', 'disciplines__*',
      'join-ensemble', 'plans-after'
    ],
    requiredFields: [
      'nrn', 'first-name', 'last-name',
      'dob-day', 'dob-month', 'dob-year',
      'parish', 'country-of-birth', 'email', 'phone',
      'employment-status', 'has-experience'
    ],
    ageMin: 17,
    ageMax: 30,
    sensitiveFields: ['nrn', 'national-id', 'conditions'],
    hasCv: false
  },

  'ydp-yar-va': {
    formName: 'Youth Achieving Results (Visual Arts)',
    refPrefix: 'YARVA',
    contactPhone: '(246) 535-3863',
    recipientEnv: 'YDP_RECIPIENT_YAR_VA',
    allowedFields: [
      ...COMMON_FIELDS,
      'has-experience', 'experience-years', 'training-location',
      'programmes', 'programmes__*',
      'join-club', 'plans-after'
    ],
    requiredFields: [
      'nrn', 'first-name', 'last-name',
      'dob-day', 'dob-month', 'dob-year',
      'parish', 'country-of-birth', 'email', 'phone',
      'employment-status', 'has-experience'
    ],
    ageMin: 17,
    ageMax: 30,
    sensitiveFields: ['nrn', 'national-id', 'conditions'],
    hasCv: false
  },

  'ydp-yes': {
    formName: 'YES First Contact',
    refPrefix: 'YES',
    contactPhone: '(246) 535-3863',
    recipientEnv: 'YDP_RECIPIENT_YES',
    allowedFields: [
      ...COMMON_FIELDS,
      'business-name', 'business-location', 'business-email', 'business-phone',
      'business-website', 'business-facebook', 'business-instagram',
      'business-description', 'business-structure',
      'active-status', 'biz-*',
      'num-employees', 'period-in-business',
      'heard-*', 'btype-*'
    ],
    requiredFields: [
      'first-name', 'last-name', 'national-id',
      'dob-day', 'dob-month', 'dob-year',
      'parish', 'address', 'contact-email',
      'business-name', 'business-description'
    ],
    ageMin: null,
    ageMax: null,
    sensitiveFields: ['national-id', 'nrn', 'nin', 'conditions'],
    hasCv: false
  },

  'ydp-yes-officer': {
    formName: 'YES First Contact (Officer)',
    refPrefix: 'YESO',
    contactPhone: '(246) 535-3863',
    recipientEnv: 'YDP_RECIPIENT_YES_OFFICER',
    allowedFields: [
      ...COMMON_FIELDS,
      'general',
      'client-file-number', 'contact-date-day', 'contact-date-month', 'contact-date-year',
      'eligible-training', 'assessment-comments', 'assessment',
      'business-name', 'business-location', 'business-email', 'business-phone',
      'business-website', 'business-facebook', 'business-instagram',
      'business-description', 'business-structure',
      'active-status', 'biz-*',
      'num-employees', 'period-in-business',
      'heard-*', 'btype-*',
      'long', 'long__*'
    ],
    requiredFields: [
      'client-file-number',
      'contact-date-day', 'contact-date-month', 'contact-date-year',
      'contact-email',
      'first-name', 'last-name', 'national-id',
      'dob-day', 'dob-month', 'dob-year',
      'parish', 'address', 'business-name', 'business-description'
    ],
    ageMin: null,
    ageMax: null,
    sensitiveFields: ['national-id', 'nrn', 'nin', 'assessment', 'assessment-comments', 'conditions'],
    hasCv: false
  }
};

/** Match a field name against an allow-list entry that may end in `*`. */
export function fieldAllowed(name, allowed) {
  for (const pat of allowed) {
    if (pat === name) return true;
    if (pat.endsWith('*') && name.startsWith(pat.slice(0, -1))) return true;
  }
  return false;
}

/** Resolve the recipient email for a form, or null if neither env is set. */
export function resolveRecipient(entry, env) {
  if (entry.recipientEnv && env[entry.recipientEnv]) return env[entry.recipientEnv];
  if (env.YDP_FALLBACK_EMAIL) return env.YDP_FALLBACK_EMAIL;
  return null;
}
