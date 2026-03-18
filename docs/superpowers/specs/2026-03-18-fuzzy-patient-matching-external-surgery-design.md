# Fuzzy Patient Matching at External Surgery Scheduling

**Date:** 2026-03-18
**Status:** Draft

## Problem

When scheduling an external surgery request, the system uses exact (case-insensitive) name + birthday matching to find existing patients (`findPatientByNameAndBirthday` in `server/storage/anesthesia.ts:281`). This fails when:

- First/last name are accidentally swapped (e.g., surgeon writes "Rossi Mario" instead of "Mario Rossi")
- Patient filled a questionnaire with a double name (e.g., "Maria Luisa" vs "Maria" in the surgery request)
- Minor typos or accent differences

Result: duplicate patient records, redundant questionnaire requests, and confusion for clinic staff.

## Solution

Reuse the existing fuzzy matching logic from `server/services/patientDeduplication.ts` to find potential patient matches before creating a new patient. Present matches to staff in a compact dialog for manual selection.

## Architecture

### New Backend Endpoint

**`GET /api/external-surgery-requests/:id/patient-matches`**

Located in `server/routes/externalSurgery.ts`, next to the existing surgeon-match endpoint.

Logic:
1. Load the external surgery request to get `patientFirstName`, `patientLastName`, `patientBirthday`
2. If any of these are missing, `isReservationOnly`, or `request.patientId` is already set, return empty array
3. Query all non-archived, non-deleted patients for the hospital with the same birthday (index on `(hospital_id, birthday)` expected)
4. Cap results at 10 matches maximum
4. For each candidate, run the existing `matchPatients`-style logic:
   - Tier 1: Exact normalized name → confidence 1.0
   - Tier 2: Swapped first/last → confidence 0.95
   - Tier 3: Fuzzy (Jaccard + Levenshtein ≥ 0.6) → confidence 0.7–0.85
   - Boost: matching email +0.05, matching phone +0.05
5. Return matches with confidence ≥ 0.6, sorted descending

Response shape:
```typescript
interface PatientMatchCandidate {
  id: string;
  firstName: string;
  surname: string;
  birthday: string | null;
  patientNumber: string | null;
  email: string | null;
  phone: string | null;
  confidence: number;       // 0.6–1.0
  reasons: string[];        // e.g. ["First/last name swapped", "Same birthday"]
}
```

Implementation: Extract a new `findFuzzyPatientMatches(hospitalId, firstName, lastName, birthday, email?, phone?)` function in `patientDeduplication.ts` that reuses `normalizeName`, `calculateNameSimilarity`, and the tier/boost logic from `matchPatients`. This avoids duplicating the algorithm.

### Modified Scheduling Endpoint

**`POST /api/external-surgery-requests/:id/schedule`**

Add optional field to request body and Zod validation schema:
- `existingPatientId: z.string().uuid().optional()` — if provided, skip patient creation and use this patient

When `existingPatientId` is provided:
1. Verify the patient exists, belongs to the same hospital, and is not deleted/archived — return 400 if validation fails
2. Backfill missing fields from request data: street, postalCode, city (same as current exact-match behavior), plus email and phone as new additions
3. Use this patient for the surgery

When `existingPatientId` is NOT provided:
- Current behavior unchanged (exact match → backfill, or create new)

Note: The existing `findPatientByNameAndBirthday` does not filter archived patients. Both the new fuzzy endpoint and the exact-match fallback should exclude archived patients for consistency.

### Frontend Changes

**File:** `client/src/components/surgery/ExternalReservationsPanel.tsx` — `ScheduleDialog` component

#### New query (alongside existing surgeon-match query):
```typescript
const { data: patientMatches } = useQuery<PatientMatchCandidate[]>({
  queryKey: [`/api/external-surgery-requests/${request.id}/patient-matches`],
  enabled: open && !request.isReservationOnly && !request.patientId,
});
```

#### New state:
```typescript
const [selectedPatientId, setSelectedPatientId] = useState<string | "new">("new");
```

#### UI — Patient match section (shown only when `patientMatches?.length > 0`):

Placed above the date/time fields in the dialog. Compact list:

```
┌─────────────────────────────────────────────┐
│ ⚠ Possible existing patients found          │
│                                             │
│ ○ Mario Rossi · 15.03.1985 · #P-1234  High │
│   First/last name swapped, Same birthday    │
│                                             │
│ ○ Maria L. Rossi · 15.03.1985 · #P-5678 Medium │
│   Fuzzy name match (72%), Same birthday     │
│                                             │
│ ● Create new patient                        │
└─────────────────────────────────────────────┘
```

- Radio buttons for selection
- "Create new patient" is pre-selected by default
- Each match shows: name, birthday, patient number, confidence badge (High ≥0.9 red, Medium ≥0.7 default, Low <0.7 secondary)
- Reasons shown as small text below each match
- If exactly one match with confidence ≥ 0.9, pre-select it instead of "Create new"

#### Schedule mutation change:

Pass `existingPatientId` when a match is selected:
```typescript
...(selectedPatientId !== "new" ? { existingPatientId: selectedPatientId } : {}),
```

#### When no matches found:

No UI change — dialog behaves exactly as today.

## What We Reuse

- `normalizeName()` — already exported from `patientDeduplication.ts`
- `calculateNameSimilarity()` — already exported
- `levenshtein()` — private, used internally by `calculateNameSimilarity`
- Tier logic and boost signals from `matchPatients()` — extracted into new shared function
- Confidence badge styling from `PatientDuplicatesDialog.tsx`

## What We Don't Change

- `findPatientByNameAndBirthday()` exact-match function — stays as fallback in the schedule endpoint
- Merge patients feature — untouched
- `findPatientDuplicates()` — untouched (scans all patients for admin view)

## Edge Cases

- **Reservation-only requests:** No patient matching needed — skip entirely
- **Request already has `patientId`:** Patient was already linked — skip matching
- **No birthday on request:** Can't meaningfully match — skip, create new as today
- **Multiple high-confidence matches:** Show all, let staff decide
- **Selected patient was deleted/archived between query and schedule:** Backend returns 400 with descriptive message; frontend shows toast error and user can retry
- **`existingPatientId` from different hospital or non-existent:** Backend returns 400

## Files to Modify

| File | Change |
|------|--------|
| `server/services/patientDeduplication.ts` | Add `findFuzzyPatientMatches()` function |
| `server/routes/externalSurgery.ts` | Add patient-matches endpoint; accept `existingPatientId` in schedule |
| `client/src/components/surgery/ExternalReservationsPanel.tsx` | Add patient match query, selection UI, pass to mutation |

## Testing

- Unit tests for `findFuzzyPatientMatches()` — swapped names, double names, exact match, no match, boost signals
- Integration test for the new endpoint
- Integration test for schedule with `existingPatientId`
- Integration test for schedule with `existingPatientId` from wrong hospital (should fail)
- Integration test for schedule with non-existent `existingPatientId` (should fail)
