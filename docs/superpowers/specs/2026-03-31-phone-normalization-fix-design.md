# Phone Normalization Fix for Lead Import Matching

## Overview

Replace the Swiss-only `normalizePhone` function in `server/routes/business.ts` with a smarter normalizer that handles bare international prefixes (without `+`), short Swiss mobile numbers, and German numbers. No schema changes, no frontend changes — only the server-side matching normalizer.

## Problem

The current `normalizePhone` function only handles `+41`/`0041` → `0` conversion. Excel exports from lead tracking tools produce phone numbers in inconsistent formats that fail to match:

- `4179921939` — bare Swiss international prefix (no `+`)
- `79921939` — short Swiss mobile (missing leading `0`)
- `49234324...` — bare German international prefix (no `+`)
- `+49 234 324` — German number (not handled at all)

## Design

### Single function replacement

Replace the `normalizePhone` function at `server/routes/business.ts:1987-1992` with an improved version. The function is used in two places in the same file: lead conversion patient matching and referral backfill matching.

### Normalization rules (applied in order)

1. **Strip formatting** — remove spaces, dashes, parentheses, periods
2. **Handle `+41`/`0041`** → replace with `0` (existing behavior)
3. **Handle `+49`/`0049`** → keep as `+49` (new: German support)
4. **Handle bare `41...`** — if starts with `41` and is 11+ digits, treat as `+41`, convert to `0` + remaining digits
5. **Handle bare `49...`** — if starts with `49` and is 11+ digits, treat as `+49`, keep as `+49` + remaining digits
6. **Handle short Swiss mobile** — if 8-9 digits starting with `7`, prepend `0`
7. **Pass-through** — anything else stays as-is (matching will skip if < 8 chars)

### Normalization examples

| Input | After strip | Rule applied | Output |
|-------|-------------|-------------|--------|
| `+41 79 921 939` | `+4179921939` | Rule 2: `+41` → `0` | `079921939` |
| `0041 79 921 939` | `004179921939` | Rule 2: `0041` → `0` | `079921939` |
| `079 921 939` | `079921939` | None needed | `079921939` |
| `4179921939` | `4179921939` | Rule 4: bare `41`, 10 digits → `0` + rest | `079921939` |
| `79921939` | `79921939` | Rule 6: 8 digits, starts with `7` → prepend `0` | `079921939` |
| `+49 170 1234567` | `+491701234567` | Rule 3: keep `+49` | `+491701234567` |
| `491701234567` | `491701234567` | Rule 5: bare `49`, 12 digits → `+49` + rest | `+491701234567` |
| `0347474` | `0347474` | None (7 digits, no pattern) | `0347474` (skipped: < 8 chars) |

### Key principle: both sides normalize the same way

The function is applied to both the patient phone index and the incoming lead phone. So as long as both sides produce the same normalized form, matching works. Swiss numbers always normalize to `0XX...` local format. German numbers normalize to `+49XX...` E.164 format.

## Scope

### In scope

- Replace `normalizePhone` function in `server/routes/business.ts`
- Both call sites (lead conversion + referral backfill) use the same function — no additional wiring needed

### Out of scope

- Phone storage format (stays as-is in DB)
- SMS normalizer (`server/sms.ts`) — already works correctly for sending
- Frontend phone detection regex — works fine for extracting phones from paste
- Phone input component — handles manual entry correctly
- Hospital-level country configuration — not needed for this fix
- Austrian/French/other country support — not needed per user

## Testing

- Unit test the normalizer with all example inputs from the table above
- Verify matching: a patient stored as `+41 79 921 939` should match a lead with phone `4179921939`, `79921939`, `079921939`, or `+41 79 921 939`
- Verify German: a patient stored as `+49 170 1234567` should match a lead with phone `491701234567` or `+49 170 1234567`
- Verify no false positives: `0347474` (7 digits) should not match anything
