# Plan: Save user details across forms with Supabase

## Context

After submitting a Telegram bot form, users currently have to re-enter all their personal details (name, DOB, NIS number, address, etc.) every time they fill in a new form. These ~12 fields appear in 10-30+ of the 40+ forms. 

This plan adds a "save your details" feature backed by Supabase so returning users can skip questions the bot already knows the answers to. It also creates an audit trail of all submissions.

## Supabase schema

Three tables:

**`profiles`** — one row per user, keyed by Telegram chat ID
```sql
CREATE TABLE profiles (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id     BIGINT UNIQUE NOT NULL,
  email           TEXT NOT NULL,
  first_name      TEXT,
  middle_name     TEXT,
  last_name       TEXT,
  dob             TEXT,            -- "DD MM YYYY"
  nrn             TEXT,            -- YYMMDD-XXXX
  nis_number      TEXT,            -- 6 digits
  mobile          TEXT,
  telephone       TEXT,
  street_address  TEXT,
  district        TEXT,
  parish          TEXT,
  postal_code     TEXT,
  gender          TEXT,
  marital_status  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

**`submissions`** — audit trail of every form submission
```sql
CREATE TABLE submissions (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id       BIGINT NOT NULL,
  form_id           TEXT NOT NULL,
  form_name         TEXT NOT NULL,
  reference_number  TEXT NOT NULL,
  form_data         JSONB NOT NULL,
  submitted_at      TIMESTAMPTZ DEFAULT now()
);
```

**`otp_codes`** — for future re-authentication (not used in this phase)
```sql
CREATE TABLE otp_codes (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id   BIGINT NOT NULL,
  email         TEXT NOT NULL,
  code          TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used          BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

## Field name aliasing

Forms use inconsistent keys for the same data (e.g. `email` vs `contact-email` vs `app-email`). A constant `FIELD_ALIASES` maps canonical profile column names to all known form-key variants:

```js
const FIELD_ALIASES = {
  email:          ['email', 'contact-email', 'app-email', 'email-address'],
  mobile:         ['mobile', 'cellular', 'contact-cell', 'contact-phone'],
  telephone:      ['telephone', 'contact-telephone', 'home-tel'],
  street_address: ['street-address', 'street', 'address', 'app-street'],
  district:       ['district'],
  parish:         ['parish', 'app-parish'],
  postal_code:    ['postal-code', 'postal', 'postcode'],
  first_name:     ['first-name'],
  middle_name:    ['middle-name'],
  last_name:      ['last-name'],
  full_name:      ['full-name', 'fullName', 'fullname', 'app-name', 'ap-full-name'],
  dob:            ['dob'],
  nrn:            ['nrn'],
  nis_number:     ['nis-number'],
  gender:         ['gender'],
  marital_status: ['marital-status'],
};
```

`full_name` is a virtual field — it has no column in the `profiles` table. Instead:
- **Profile -> form**: if the form uses a full-name key, `mapProfileToFormKeys` concatenates `first_name`, `middle_name`, `last_name` from the profile
- **Form -> profile**: if the form only has a full-name field (no first-name/last-name), `extractProfileFields` stores it as `first_name` as a best-effort fallback, since names can't be reliably split

Three helper functions use this map:
- `extractProfileFields(formData)` — after submission, extracts saveable fields from form data (form keys -> profile columns). Handles full-name -> first_name fallback.
- `mapProfileToFormKeys(profile, systemPrompt)` — before form chat, maps saved profile data to the specific keys the form expects by parsing `keys: ...` patterns in the system prompt. Handles first/middle/last -> full-name concatenation.
- `buildFullName(profile)` — concatenates non-null name parts into a single string

## Flow changes in telegram.mjs

### 1. Supabase client

Add `@supabase/supabase-js` to package.json. Add a `getSupabase()` helper that returns `null` if env vars are missing (graceful degradation — bot works without Supabase).

### 2. Profile loading at email collection

In `handleEmailCollection()`, after accepting the email:
- Query `profiles` where `telegram_id` matches the chat ID
- If a profile exists, store it in `session.profileLoaded`
- Modify the Claude opener to list all pre-populated fields:

```
Start. The user has saved personal details from a previous form.
The following fields are already known — use these values and DO NOT ask for them again:
- first-name: John
- last-name: Smith
- dob: 15 03 1987
- nrn: 870315-1234
...
Skip these fields entirely. Greet the user briefly, confirm you have their details on file, and ask your first question for information you still need.
```

This reuses the same pattern that already works for the email field — no changes to system prompts needed.

### 3. Post-submission save offer

After `submitForm()` succeeds, instead of going straight to `submitted`:

1. Log submission to Supabase `submissions` table (fire-and-forget)
2. Check if user already has a profile
3. If no profile -> set `phase = 'offer-save'`, ask: "Would you like me to save your personal details so you don't have to enter them again next time? Reply *yes* or *no*."
4. If profile exists -> set `phase = 'offer-save'`, ask: "Would you like to update your saved details with any changes? Reply *yes* or *no*."
5. If yes -> `extractProfileFields(formData)`, upsert to `profiles`
6. If no -> transition to `submitted`

New `handleOfferSave()` function handles the yes/no response.

### 4. New session fields

```js
{
  phase: 'routing', // + 'offer-save'
  profileLoaded: null,     // profile data from Supabase
  pendingRefNumber: null,  // ref number while asking about save
}
```

### 5. Phase dispatch update

Add to the `if/else` chain in the main handler:
```js
} else if (session.phase === 'offer-save') {
  await handleOfferSave(token, chatId, text, session);
}
```

## Files to change

| File | Change |
|------|--------|
| netlify/functions/telegram.mjs | Supabase client, FIELD_ALIASES, profile load/save, offer-save flow, submission logging, modified opener |
| package.json | Add `@supabase/supabase-js` |

Environment variables to add: `SUPABASE_URL`, `SUPABASE_ANON_KEY`

## Implementation order

1. **Infrastructure** — create Supabase project, run SQL, add env vars, add dependency
2. **Submission audit trail** — log to `submissions` table after `submitForm()` (low risk, immediately useful)
3. **Save offer flow** — `offer-save` phase, `handleOfferSave()`, `extractProfileFields()`, upsert
4. **Profile loading** — check for profile in `handleEmailCollection()`, `mapProfileToFormKeys()`, modified opener

## Verification

1. Submit a form -> should be logged in `submissions` table
2. Say "yes" to save -> profile should appear in `profiles` table with correct fields
3. Start a new form -> after email, Claude should skip saved fields and only ask for form-specific ones
4. Submit without Supabase env vars -> bot works exactly as before (graceful degradation)
5. Say "no" to save -> no profile created, proceeds to submitted normally
