# Questionnaire: QR Codes, URL Aliases, and Submission Error Handling

**Date:** 2026-03-23

## Problem

1. Patients scanning QR codes for the open questionnaire sometimes get a black screen — likely the long token URL is misread by QR scanners
2. No way to give patients a short, memorable fallback URL to type manually
3. When questionnaire submission fails, patients see a black/blank screen with no feedback and errors are not reported to Sentry

## Features

### 1. Simple QR Code Downloads for Admin Links

Add a "Download QR Code" button next to the External Surgery and Kiosk links in Admin → Settings → Links. The questionnaire link already has a full poster PDF; the other two just need a simple PNG download.

**Implementation:**
- Client-side only — use the existing `qrcode` npm package
- Generate a PNG data URL from the link URL
- Trigger a browser download of the PNG file
- Button placed alongside existing Copy/Regenerate/Disable buttons

**Files changed:**
- `client/src/pages/admin/Settings.tsx` — add download QR button to external surgery and kiosk link sections

### 2. URL Alias for Open Questionnaire (`/q/{alias}`)

Allow hospitals to set a short, memorable alias for their open questionnaire URL, e.g., `viali.app/q/praxis-mueller`.

#### Schema

Add `questionnaireAlias` column to `hospitals` table:
- Type: `varchar`, nullable, unique
- Validation: lowercase alphanumeric + hyphens, 3-50 characters, must start/end with alphanumeric

#### Backend Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| PUT | `/api/admin/:hospitalId/questionnaire-alias` | Set or update alias |
| DELETE | `/api/admin/:hospitalId/questionnaire-alias` | Remove alias |
| GET | `/api/admin/:hospitalId/questionnaire-alias/check?alias=x` | Check if alias is available |

**Alias resolution:** Add a public endpoint `GET /api/public/questionnaire/by-alias/:alias` that returns the hospital's questionnaire token. The frontend `/q/:alias` route calls this, then renders the same `PatientQuestionnaire` component.

**Validation rules:**
- 3-50 characters
- Lowercase letters, numbers, hyphens only
- Must start and end with a letter or number
- Must be unique across all hospitals (case-insensitive)
- Check endpoint returns `{ available: boolean }` for real-time validation

#### Frontend

**New route:** `/q/:alias` in `App.tsx` — resolves alias via API, then renders `PatientQuestionnaire` with the resolved token.

**Admin UI (Settings → Links):**
- Below the questionnaire URL, add an alias input field
- Real-time availability check as user types (debounced)
- Show green check / red X for availability
- Save button to set the alias
- When alias is set, show both URLs (full token URL + short alias URL) with copy buttons
- Delete button to remove the alias

**Files changed:**
- `shared/schema.ts` — add `questionnaireAlias` column to `hospitals`
- `server/routes/admin.ts` — add alias CRUD endpoints
- `server/storage/hospitals.ts` — add alias query functions
- `client/src/App.tsx` — add `/q/:alias` route
- `client/src/pages/admin/Settings.tsx` — add alias management UI
- `client/src/pages/PatientQuestionnaire.tsx` — support alias-based loading
- New migration file for the schema change

### 3. Questionnaire Submission Error Handling

**Current state:** The `submitMutation` has no `onError` callback. A failed submission silently fails or causes an unhandled state.

**Changes:**

Add `onError` to `submitMutation`:
- Set a `submitError` state variable to `true`
- Display an `Alert` component (destructive variant) on the submit step with:
  - Error message: "Submission failed. Please check your connection and try again."
  - Translated into all 5 supported languages (de, en, it, es, fr)
- Capture the error in Sentry: `Sentry.captureException(error, { tags: { component: 'questionnaire-submit' } })`
- Patient stays on the form, can retry — the submit button remains active
- Clear the error state when the patient clicks submit again

**Files changed:**
- `client/src/pages/PatientQuestionnaire.tsx` — add `onError` handler, error state, Alert UI, Sentry capture

## Testing

- Verify QR PNG downloads work for external surgery and kiosk links
- Verify alias validation rejects invalid formats
- Verify alias uniqueness check works
- Verify `/q/{alias}` resolves correctly and loads the questionnaire
- Verify submission error shows Alert and logs to Sentry
- Verify retry after error works
- Migration must be idempotent
