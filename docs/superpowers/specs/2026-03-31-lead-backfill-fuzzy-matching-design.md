# Lead Backfill Fuzzy Matching with Confirmation UI

**Date:** 2026-03-31
**Status:** Approved

## Problem

The current lead backfill uses exact matching only (normalized name, email, phone). This fails when:
- Phone numbers use bare international prefix (e.g. `41793990917` instead of `+41793990917`) — parser doesn't recognize them as phones, shifts all columns
- Names have slight variations (casing, spacing, accents)
- Data is present but doesn't exactly match

Additionally, the backfill happens instantly with no preview — the user can't verify which Excel rows matched which patients before committing.

## Solution

Replace the instant backfill with a **fuzzy matching + confirmation flow**:

1. New server endpoint performs fuzzy matching and returns candidates with confidence scores
2. New UI step shows side-by-side comparison (Excel data vs patient data) with match % and approve/decline per match
3. Only approved matches get backfilled
4. Approved matches also fill missing patient data (phone, email) from Excel

## Architecture

### New Endpoint: `POST /api/business/:hospitalId/lead-conversion/fuzzy-match`

**Input:** Same `leads` array as current backfill endpoint.

**Processing:**
1. Fetch all non-archived patients for hospital (id, firstName, surname, email, phone, dateOfBirth)
2. For each lead with `adSource`:
   - Compute name similarity using existing `calculateNameSimilarity()` from `patientDeduplication.ts` (Jaccard 60% + Levenshtein 40%)
   - Compare normalized phones (reuse `normalizePhoneForMatching`)
   - Compare lowercase emails
   - Compute overall confidence:
     - Base: name similarity score (0-1)
     - Phone match: +0.15 boost
     - Email match: +0.15 boost
     - Exact name: confidence = 1.0
     - Name swap (first/last reversed): confidence = 0.95
   - Minimum threshold: 0.50 to appear as candidate
3. For each matched patient, fetch their appointment info (next/most recent non-cancelled appointment date)
4. Return candidates grouped by lead, sorted by confidence desc

**Output:**
```typescript
interface FuzzyMatchResult {
  leadIndex: number;           // Index in original leads array
  lead: {                      // Excel data
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    adSource: string;
    leadDate?: string;
    metaLeadId?: string;
    metaFormId?: string;
  };
  candidates: Array<{
    patientId: string;
    firstName: string;
    surname: string;
    phone?: string;
    email?: string;
    dateOfBirth?: string;
    nextAppointmentDate?: string;
    confidence: number;         // 0-1
    reasons: string[];          // e.g. ["Name similarity 87%", "Phone match"]
    missingFields: string[];    // Fields patient is missing that Excel has, e.g. ["email", "phone"]
  }>;
}
```

### Modified Endpoint: `POST /api/business/:hospitalId/lead-conversion/backfill-referrals`

**Input changes:** Accept explicit approved pairs instead of re-matching:
```typescript
interface ApprovedMatch {
  leadIndex: number;
  patientId: string;
  lead: { /* same lead fields */ };
  fillMissingData: boolean;    // Whether to update patient record
}
```

**Processing changes:**
- Skip the matching step entirely — use the provided patientId directly
- If `fillMissingData` is true and lead has phone/email that patient lacks, update patient record
- Rest of referral creation logic stays the same

### UI Changes in LeadConversion.tsx

**New state:** After analysis, if there are fuzzy match results, show a "Review Matches" step before backfill.

**Match card layout:**
```
┌──────────────────────────────────────────────────────────┐
│  [87%]  Name similarity · Phone match          [1 of 3]  │
│                                                           │
│  From Excel               │  Patient in App               │
│  ─────────                │  ──────────────               │
│  Raquel Andrade da costa  │  Raquel Andrade da Costa      │
│  41793990917              │  +41 79 399 09 17             │
│  raquel@email.com         │  —                            │
│  Lead: 12.01.2026 · fb    │  Appt: 15.01.2026             │
│  Lead ID: 123456789...    │                               │
│                                                           │
│  ⓘ Missing in app: email → will be added from Excel      │
│                                                           │
│       [✓ Approve]  [✗ Decline]                           │
└──────────────────────────────────────────────────────────┘
```

**Multiple candidates:** When a lead has >1 candidate, show radio-style selection — user picks one or declines all. Candidates sorted by confidence, highest first.

**Bulk actions:** "Approve All High Confidence (≥90%)" button at top for convenience.

**Confidence badge colors:**
- ≥90%: Green (high confidence)
- 70-89%: Blue (medium)
- 50-69%: Yellow/amber (low)

**Flow:**
1. User pastes data, clicks Analyze (existing)
2. Server returns analysis + fuzzy matches
3. "Review Matches" section appears with match cards
4. User approves/declines each
5. "Backfill Approved (N)" button sends only approved pairs
6. Server creates referrals + fills patient data
7. Success toast with counts

### Similarity Reuse

Import from `server/services/patientDeduplication.ts`:
- `calculateNameSimilarity(name1, name2)` — returns 0-1
- `levenshtein(a, b)` — raw distance (if needed)
- `normalizeNameForMatching(name)` — strips accents, lowercases

Import from `server/utils/normalizePhone.ts`:
- `normalizePhoneForMatching(phone)` — handles Swiss/German prefixes

### Phone Parser Fix

Also fix the `parseLeads()` regex in `LeadConversion.tsx` to recognize bare international numbers:
```typescript
// Before: only matches numbers starting with + or 0
/^[\+0][\d\s\-\(\)\.]{6,}$/

// After: also matches bare Swiss (41...) and German (49...) prefixes
/^[\+0][\d\s\-\(\)\.]{6,}$/.test(part) || /^4[19]\d{8,11}$/.test(part)
```
(Already applied.)

## Files to Modify

| File | Change |
|------|--------|
| `server/routes/business.ts` | New `/fuzzy-match` endpoint; modify `/backfill-referrals` to accept approved pairs |
| `client/src/pages/business/LeadConversion.tsx` | New Review Matches UI step, phone regex fix (done) |
| `server/services/patientDeduplication.ts` | Export `calculateNameSimilarity`, `normalizeNameForMatching` if not already exported |

## Out of Scope

- Manual patient search/linking for unmatched leads (too noisy, most old leads have no match)
- Automatic backfill without confirmation
- Changes to the analysis/conversion funnel display
