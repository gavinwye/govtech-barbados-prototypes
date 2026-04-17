# Conversational Telegram Bot

## Problem

The Telegram bot was too rigid in its routing phase. It used Claude as a one-shot classifier that output a form ID or "unknown". If the user said something conversational like "what can you help with?", the bot responded with a dead-end: "I'm not sure which form you need. Could you say a bit more about what you're trying to do?"

The bot could only help with forms — it had no knowledge of broader government services.

## Solution

Replace the rigid routing classifier with a conversational "concierge" that:

1. **Knows about all government services** from alpha.gov.bb (not just fillable forms)
2. **Maintains multi-turn conversation** in the routing phase so users can chat before committing to a form
3. **Routes to forms naturally** using a `##ROUTE:<formid>##` marker only when confident the user wants to proceed

## Changes Made

### 1. `scripts/build-telegram-data.cjs` (renamed from `.js` for ESM compat)

- Added `SERVICES_KNOWLEDGE` — structured catalogue of all alpha.gov.bb services across 6 categories:
  - Family, Birth and Relationships
  - Work and Employment
  - Money and Financial Support
  - Travel, ID and Citizenship
  - Business and Trade
  - Public Safety
- Added `CONCIERGE_PROMPT` generation — a conversational system prompt combining service knowledge with the 62 fillable forms
- Exports `CONCIERGE_PROMPT` alongside existing `ROUTING_PROMPT`

### 2. `netlify/functions/telegram.mjs`

- **Import**: Added `CONCIERGE_PROMPT` to imports
- **Session**: Added `routingMessages` array to track concierge conversation history
- **`/start` message**: Updated to explain the bot can help with services and questions, not just forms, with example prompts
- **`handleRouting`**: Completely rewritten:
  - Maintains multi-turn conversation history (`routingMessages`)
  - Uses Sonnet (not Haiku) for intelligent conversational responses
  - Parses `##ROUTE:<formid>##` markers to transition to form-filling
  - Handles edge cases: form without chat prompt, unknown form ID, backwards compat for old sessions without `routingMessages`

### 3. `netlify/functions/telegram-data.mjs` (auto-generated)

- Now exports `CONCIERGE_PROMPT` with full service knowledge and form list

## Concierge Prompt Design

The concierge prompt instructs Claude to:

- Be warm and conversational (like a friendly civil servant)
- Use plain language a 9-year-old could understand
- Keep responses short (2-4 sentences)
- When someone asks what it can help with: give examples from different categories
- When someone describes a need:
  - If it matches a fillable form → explain and offer to help, then output `##ROUTE:<formid>##`
  - If it matches an alpha.gov.bb service → explain and give the URL
  - If ambiguous → ask a clarifying question
  - If unknown → say so honestly, suggest alpha.gov.bb
- Never route on vague queries — only when confident and the user wants to proceed

## Behaviour Changes

| Before | After |
|---|---|
| "What can you help with?" → "I'm not sure which form you need..." | Lists service categories with examples, asks what they need |
| "How do I get a birth certificate?" → "I'm not sure which form you need..." | Explains the service and points to alpha.gov.bb URL |
| "I lost my job" → Routes to unemployment form immediately | Explains the unemployment benefit and asks if they'd like to fill it in |
| Any non-form query → dead end | Can answer questions about government services generally |

## Additional Changes (made separately)

After the concierge was implemented, the following was also added:

- **Email collection phase**: Before starting a form, the bot asks for the user's email address upfront so confirmations always get sent
- **`collecting-email` phase**: New session phase between routing and chat
- **`verifiedEmail`**: Stored on session, injected as `submitter-email` on form submission
- **`isValidEmail` helper**: Basic validation for the collected email

## Rebuilding

```bash
source ~/.nvm/nvm.sh && nvm use 22 && node scripts/build-telegram-data.cjs
```
