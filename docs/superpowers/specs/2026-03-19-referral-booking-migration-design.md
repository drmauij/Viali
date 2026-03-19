# Referral Source: Move from Formulaire to Booking Page

**Date:** 2026-03-19
**Status:** Approved

## Problem

The referral source step in the patient formulaire gets zero engagement — by the time patients fill out the questionnaire (days/weeks after booking), they've forgotten or don't care how they found the clinic. This data is critical for marketing funnel analysis (referral → appointment → surgery).

## Solution

Move referral source collection to the public appointment booking page, where patients naturally know how they found the clinic. Support automatic capture via UTM parameters and custom `ref` links. Store in a dedicated `referral_events` table that survives appointment deletion.

## Data Model

### New table: `referral_events`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar PK, default `gen_random_uuid()` | Project convention |
| `hospitalId` | varchar, NOT NULL | FK → hospitals |
| `patientId` | varchar, NOT NULL | FK → patients |
| `appointmentId` | varchar, NULL | FK → clinic_appointments, `SET NULL` on delete |
| `source` | varchar enum, NOT NULL | `social`, `search_engine`, `llm`, `word_of_mouth`, `belegarzt`, `other` |
| `sourceDetail` | varchar, NULL | Sub-source (e.g. "Google", "Facebook") |
| `utmSource` | varchar, NULL | Raw utm_source param |
| `utmMedium` | varchar, NULL | Raw utm_medium param |
| `utmCampaign` | varchar, NULL | Raw utm_campaign param |
| `utmTerm` | varchar, NULL | Raw utm_term param |
| `utmContent` | varchar, NULL | Raw utm_content param |
| `refParam` | varchar, NULL | Custom `ref=` param value |
| `captureMethod` | varchar enum, NOT NULL | `manual`, `utm`, or `ref` |
| `createdAt` | timestamp, NOT NULL | Default now() |

**Indexes:**
- `hospitalId` + `createdAt` (dashboard date-range queries)
- `appointmentId` (SET NULL cascade + lookups)
- `patientId` (referral history per patient)

### Hospital settings addition

- Add `enableReferralOnBooking` boolean to `hospitals` table (default `false`)
- Controls whether the manual referral step is shown on the booking page
- UTM/ref auto-capture always happens regardless of this setting

### Column drops

- Drop `referralSource` and `referralSourceDetail` from `patient_questionnaire_responses`
- Column drops must happen AFTER dashboard endpoints are switched to `referral_events`
- All migrations must be idempotent (`IF NOT EXISTS`, `IF EXISTS`, `DROP COLUMN IF EXISTS`)

## Booking Flow

### Steps

provider → datetime → details → **referral** → done

### Referral step behavior

- **Setting enabled + no URL params:** Show the referral step with the existing icon-grid UI (extracted as shared `ReferralSourcePicker` component). Patient must select a source to proceed. `captureMethod=manual`.
- **Setting disabled + no URL params:** Step is hidden, no referral data collected.
- **UTM params present (regardless of setting):** Auto-map to source category (see mapping below), skip step entirely, save silently. `captureMethod=utm`.
- **`ref` param present (regardless of setting):** Map to `belegarzt` source with ref value as detail, skip step. `captureMethod=ref`.
- **Both UTM and ref present:** UTM takes priority (more granular).

### UTM → source mapping

Uses both `utm_source` and `utm_medium` for granularity:

| utm_source | utm_medium | → source | → sourceDetail |
|------------|-----------|----------|---------------|
| google | maps, local | search_engine | Google Maps |
| google | cpc | search_engine | Google Ads |
| google | organic, *(default)* | search_engine | Google |
| bing | * | search_engine | Bing |
| facebook, fb | * | social | Facebook |
| instagram, ig | * | social | Instagram |
| tiktok | * | social | TikTok |
| chatgpt, openai | * | llm | ChatGPT |
| claude, anthropic | * | llm | Claude |
| perplexity | * | llm | Perplexity |
| *(anything else)* | * | other | (raw utm_source value) |

### Referral source options (fixed set, manual picker)

1. Social Media (sub-options: Facebook, Instagram, TikTok)
2. Search Engine (sub-options: Google, Bing)
3. AI / LLM (no sub-options)
4. Word of Mouth (free text detail)
5. Belegarzt (no sub-options — doctor detail captured via `ref` param when applicable)
6. Other (free text detail)

Same set for all hospitals. No per-hospital customization.

### Multiple bookings

Each booking creates its own `referral_events` row. A patient booking twice from different sources gets two referral events — this is correct behavior.

## Formulaire Changes

- Remove referral step entirely from `PatientQuestionnaire.tsx` (currently step index 1)
- Step count goes from 10 → 9, step indexes shift
- Remove related translations, form state, validation, and summary display

## Shared Component

Extract `ReferralSourcePicker` from the formulaire's `ReferralStep` into `client/src/components/ReferralSourcePicker.tsx` for reuse in the booking page. Same icon-grid UI with conditional sub-options.

## API Changes

### Booking submission (`POST /api/public/booking/:bookingToken/book`)

Add optional fields to schema:
- `referralSource`, `referralSourceDetail`
- `utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent`
- `refParam`

After creating the appointment, insert into `referral_events` with all fields.

Server-side validation: if hospital has `enableReferralOnBooking=true` and no UTM/ref params are present, `referralSource` is required.

### Booking config (`GET /api/public/booking/:bookingToken`)

Include `enableReferralOnBooking` in response so the frontend knows whether to show the step.

## Dashboard Update

### API endpoints (in `server/routes/business.ts`)

- `/api/business/:hospitalId/referral-stats` — switch from querying `patient_questionnaire_responses` to `referral_events`
- `/api/business/:hospitalId/referral-timeseries` — same switch

Response shape: `{ breakdown: [...], totalReferrals: N }`. The `totalQuestionnaires`/`answeredReferral` fields from the old response become a single `totalReferrals` count (every row in `referral_events` is a referral).

### Frontend

- No chart changes needed — same pie, bar drill-down, and timeseries line charts
- Update sample size label from "questionnaire responses" to "booking referrals"
- Date filtering uses `referral_events.createdAt`

### New translation keys

New i18n keys under a `booking.referral.*` namespace (not reusing `questionnaire.*` keys). The shared `ReferralSourcePicker` component accepts labels as props so both contexts can supply their own translations.

## Hospital Settings UI

- Add toggle in the **Booking** settings section: "Ask patients how they found you when booking"
- Controls the `enableReferralOnBooking` boolean

## Deployment Notes

- Update Google Business Profile booking URLs to include UTM params: `?utm_source=google&utm_medium=maps`
- This is a manual configuration per hospital, not a code change
- Column drops must be deployed AFTER the dashboard endpoint switch

## Existing Data

No migration of existing formulaire referral data — confirmed nobody filled it out. Columns are dropped.

## Future Considerations (not in scope)

- Per-hospital custom referral source options
- UTM campaign-level analytics dashboard
- Ad platform click ID tracking (gclid, fbclid)
- LLM sub-options in manual picker
- Belegarzt free-text detail in manual picker
