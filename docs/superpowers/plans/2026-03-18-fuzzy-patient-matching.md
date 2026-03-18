# Fuzzy Patient Matching at External Surgery Scheduling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent duplicate patient creation when scheduling external surgery requests by using fuzzy name matching to surface existing patients for manual selection.

**Architecture:** New `findFuzzyPatientMatches()` function in the existing deduplication service, exposed via a new GET endpoint. The ScheduleDialog gains a patient-match query and radio-button selection UI. The schedule POST endpoint accepts an optional `existingPatientId` to skip auto-creation.

**Tech Stack:** TypeScript, Drizzle ORM, Express, React, TanStack Query, Vitest

**Spec:** `docs/superpowers/specs/2026-03-18-fuzzy-patient-matching-external-surgery-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `server/services/patientDeduplication.ts` | Modify | Add `findFuzzyPatientMatches()` — queries patients by birthday, runs tier/boost matching |
| `server/routes/externalSurgery.ts` | Modify | Add `GET .../patient-matches` endpoint; add `existingPatientId` to schedule POST |
| `server/storage/anesthesia.ts` | Modify | Add `isArchived` filter to `findPatientByNameAndBirthday()` |
| `client/src/components/surgery/ExternalReservationsPanel.tsx` | Modify | Add patient match query, selection UI, pass `existingPatientId` to mutation |
| `client/src/i18n/locales/en.json` | Modify | Add translation keys for patient match UI |
| `client/src/i18n/locales/de.json` | Modify | Add German translation keys |
| `tests/patient-merge/patientDeduplication.test.ts` | Modify | Add unit tests for `findFuzzyPatientMatches()` |

---

### Task 1: Add `findFuzzyPatientMatches()` to deduplication service

**Files:**
- Modify: `server/services/patientDeduplication.ts` (after line 195, before the "Duplicate Detection" section)
- Test: `tests/patient-merge/patientDeduplication.test.ts`

- [ ] **Step 1: Write failing tests for `findFuzzyPatientMatches`**

Add to `tests/patient-merge/patientDeduplication.test.ts`:

```typescript
import {
  normalizeName,
  calculateNameSimilarity,
  matchPatientCandidate,
} from "../../server/services/patientDeduplication";

describe("matchPatientCandidate", () => {
  const baseInput = {
    firstName: "Mario",
    lastName: "Rossi",
    birthday: "1985-03-15",
  };

  const makeCandidate = (overrides: Partial<{
    firstName: string;
    surname: string;
    birthday: string | null;
    email: string | null;
    phone: string | null;
  }>) => ({
    id: "test-id",
    firstName: overrides.firstName ?? "Mario",
    surname: overrides.surname ?? "Rossi",
    birthday: overrides.birthday ?? "1985-03-15",
    patientNumber: "P-001",
    email: overrides.email ?? null,
    phone: overrides.phone ?? null,
  });

  it("returns confidence 1.0 for exact name match with same birthday", () => {
    const result = matchPatientCandidate(baseInput, makeCandidate({}));
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(1.0);
    expect(result!.reasons).toContain("Exact name match");
    expect(result!.reasons).toContain("Same birthday");
  });

  it("returns confidence 0.95 for swapped first/last name", () => {
    const result = matchPatientCandidate(baseInput, makeCandidate({
      firstName: "Rossi",
      surname: "Mario",
    }));
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.95);
    expect(result!.reasons).toContain("First/last name swapped");
  });

  it("returns fuzzy match for double name (e.g. 'Maria Luisa' vs 'Maria')", () => {
    const input = { firstName: "Maria", lastName: "Bianchi", birthday: "1990-01-01" };
    const result = matchPatientCandidate(input, makeCandidate({
      firstName: "Maria Luisa",
      surname: "Bianchi",
      birthday: "1990-01-01",
    }));
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result!.confidence).toBeLessThan(0.95);
  });

  it("returns null for completely different names", () => {
    const result = matchPatientCandidate(baseInput, makeCandidate({
      firstName: "Anna",
      surname: "Bianchi",
    }));
    expect(result).toBeNull();
  });

  it("boosts confidence for matching email", () => {
    const input = { ...baseInput, email: "mario@test.com" };
    const candidate = makeCandidate({
      firstName: "Rossi",
      surname: "Mario",
      email: "mario@test.com",
    });
    const result = matchPatientCandidate(input, candidate);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(1.0); // 0.95 + 0.05, capped at 1.0
    expect(result!.reasons).toContain("Matching email");
  });

  it("boosts confidence for matching phone", () => {
    const input = { ...baseInput, phone: "+41 79 123 4567" };
    const candidate = makeCandidate({
      firstName: "Rossi",
      surname: "Mario",
      phone: "+4179 123 4567",
    });
    const result = matchPatientCandidate(input, candidate);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(1.0); // 0.95 + 0.05, capped
    expect(result!.reasons).toContain("Matching phone number");
  });

  it("returns null when candidate has no name", () => {
    const result = matchPatientCandidate(baseInput, makeCandidate({
      firstName: "",
      surname: "",
    }));
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/patient-merge/patientDeduplication.test.ts`
Expected: FAIL — `matchPatientCandidate` is not exported

- [ ] **Step 3: Export `PatientMatchCandidate` type and implement `matchPatientCandidate`**

Add to `server/services/patientDeduplication.ts` after the `PatientSummary` interface (around line 38):

```typescript
export interface PatientMatchCandidate {
  id: string;
  firstName: string;
  surname: string;
  birthday: string | null;
  patientNumber: string | null;
  email: string | null;
  phone: string | null;
  confidence: number;
  reasons: string[];
}
```

Add after the `matchPatients` function (after line 195), before the "Duplicate Detection" section:

```typescript
// ============================================================
// Single-patient fuzzy matching (for external surgery scheduling)
// ============================================================

/**
 * Match a single input (from external surgery request) against an existing patient candidate.
 * Returns null if confidence < 0.6. Pure function — no DB access.
 */
export function matchPatientCandidate(
  input: { firstName: string; lastName: string; birthday?: string; email?: string; phone?: string },
  candidate: { id: string; firstName: string; surname: string; birthday: string | null; patientNumber: string | null; email: string | null; phone: string | null },
): PatientMatchCandidate | null {
  const fullNameInput = `${input.firstName} ${input.lastName}`.trim();
  const fullNameCandidate = `${candidate.firstName} ${candidate.surname}`.trim();

  if (!fullNameInput || !fullNameCandidate) return null;

  const reasons: string[] = [];
  let confidence = 0;

  const normInput = normalizeName(fullNameInput);
  const normCandidate = normalizeName(fullNameCandidate);

  // Tier 1: Exact normalized full name match
  if (normInput === normCandidate) {
    confidence = 1.0;
    reasons.push("Exact name match");
  } else {
    // Tier 2: First/Last name swapped
    const normFirstIn = normalizeName(input.firstName);
    const normLastIn = normalizeName(input.lastName);
    const normFirstCand = normalizeName(candidate.firstName);
    const normLastCand = normalizeName(candidate.surname);

    if (normFirstIn && normLastIn && normFirstCand && normLastCand &&
        normFirstIn === normLastCand && normLastIn === normFirstCand) {
      confidence = 0.95;
      reasons.push("First/last name swapped");
    } else {
      // Tier 3: Fuzzy match
      const sim = calculateNameSimilarity(fullNameInput, fullNameCandidate);
      if (sim >= 0.6) {
        confidence = 0.7 + (sim - 0.6) * 0.375;
        reasons.push(`Fuzzy name match (${Math.round(sim * 100)}% similarity)`);
      }
    }
  }

  if (confidence === 0) return null;

  // Check birthday match explicitly (caller pre-filters by birthday, but be correct)
  if (input.birthday && candidate.birthday && input.birthday === candidate.birthday) {
    reasons.push("Same birthday");
  }

  // Boost signals
  if (input.phone && candidate.phone &&
      input.phone.replace(/\s+/g, "") === candidate.phone.replace(/\s+/g, "")) {
    confidence = Math.min(1.0, confidence + 0.05);
    reasons.push("Matching phone number");
  }

  if (input.email && candidate.email &&
      input.email.toLowerCase() === candidate.email.toLowerCase()) {
    confidence = Math.min(1.0, confidence + 0.05);
    reasons.push("Matching email");
  }

  return {
    ...candidate,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/patient-merge/patientDeduplication.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Add `findFuzzyPatientMatches` DB function**

Add after `matchPatientCandidate` in `server/services/patientDeduplication.ts`:

```typescript
/**
 * Find existing patients that fuzzy-match the given name+birthday.
 * Used by the external surgery scheduling flow to prevent duplicates.
 */
export async function findFuzzyPatientMatches(
  hospitalId: string,
  firstName: string,
  lastName: string,
  birthday: string,
  email?: string,
  phone?: string,
): Promise<PatientMatchCandidate[]> {
  // Query candidates with same birthday (strong pre-filter)
  const candidates = await db
    .select()
    .from(patients)
    .where(
      and(
        eq(patients.hospitalId, hospitalId),
        eq(patients.birthday, birthday),
        eq(patients.isArchived, false),
        isNull(patients.deletedAt),
      )
    );

  const input = { firstName, lastName, birthday, email, phone };
  const matches: PatientMatchCandidate[] = [];

  for (const candidate of candidates) {
    const match = matchPatientCandidate(input, {
      id: candidate.id,
      firstName: candidate.firstName,
      surname: candidate.surname,
      birthday: candidate.birthday ?? null,
      patientNumber: candidate.patientNumber ?? null,
      email: candidate.email ?? null,
      phone: candidate.phone ?? null,
    });
    if (match) {
      matches.push(match);
    }
  }

  // Sort by confidence descending, cap at 10
  matches.sort((a, b) => b.confidence - a.confidence);
  return matches.slice(0, 10);
}
```

- [ ] **Step 6: Commit**

```bash
git add server/services/patientDeduplication.ts tests/patient-merge/patientDeduplication.test.ts
git commit -m "feat: add fuzzy patient matching function for external surgery scheduling"
```

---

### Task 2: Fix `findPatientByNameAndBirthday` to exclude archived patients

**Files:**
- Modify: `server/storage/anesthesia.ts:281-294`

- [ ] **Step 1: Add `isArchived` filter**

In `server/storage/anesthesia.ts`, modify `findPatientByNameAndBirthday` (line 281-294). Add `eq(patients.isArchived, false)` to the where clause:

```typescript
export async function findPatientByNameAndBirthday(hospitalId: string, surname: string, firstName: string, birthday: string): Promise<Patient | undefined> {
  const [patient] = await db
    .select()
    .from(patients)
    .where(and(
      eq(patients.hospitalId, hospitalId),
      ilike(patients.surname, surname),
      ilike(patients.firstName, firstName),
      eq(patients.birthday, birthday),
      eq(patients.isArchived, false),
      isNull(patients.deletedAt)
    ))
    .limit(1);
  return patient;
}
```

Note: `isArchived` import — check if `patients` schema already has this column. The existing `findPatientDuplicates` already uses `eq(patients.isArchived, false)`, so the import pattern is established.

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: PASS — no type errors

- [ ] **Step 3: Commit**

```bash
git add server/storage/anesthesia.ts
git commit -m "fix: exclude archived patients from exact-match dedup in external surgery"
```

---

### Task 3: Add patient-matches endpoint and `existingPatientId` to schedule

**Files:**
- Modify: `server/routes/externalSurgery.ts`

- [ ] **Step 1: Add import for `findFuzzyPatientMatches`**

At the top of `server/routes/externalSurgery.ts`, add:

```typescript
import { findFuzzyPatientMatches } from "../services/patientDeduplication";
```

- [ ] **Step 2: Add GET patient-matches endpoint**

Add after the surgeon-match endpoint (after line 608), before the schedule POST route:

```typescript
router.get('/api/external-surgery-requests/:id/patient-matches', isAuthenticated, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const request = await storage.getExternalSurgeryRequest(id);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    const unitId = await getUserUnitForHospital(userId, request.hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Skip matching if patient already linked, reservation-only, or missing required fields
    if (request.patientId || request.isReservationOnly ||
        !request.patientFirstName || !request.patientLastName || !request.patientBirthday) {
      return res.json([]);
    }

    const matches = await findFuzzyPatientMatches(
      request.hospitalId,
      request.patientFirstName,
      request.patientLastName,
      request.patientBirthday,
      request.patientEmail || undefined,
      request.patientPhone || undefined,
    );

    res.json(matches);
  } catch (error) {
    logger.error("Error finding patient matches:", error);
    res.status(500).json({ message: "Failed to find patient matches" });
  }
});
```

- [ ] **Step 3: Add `existingPatientId` to schedule endpoint with UUID validation**

In the schedule POST route (line 610), modify the destructuring at line 613:

```typescript
const { plannedDate, surgeryRoomId, admissionTime, sendConfirmation, surgeonId: overrideSurgeonId, createNewSurgeon, surgeryDurationMinutes, existingPatientId } = req.body;
```

Add UUID validation right after the destructuring (before the `getExternalSurgeryRequest` call):

```typescript
    // Validate existingPatientId format if provided
    if (existingPatientId && !z.string().uuid().safeParse(existingPatientId).success) {
      return res.status(400).json({ message: "Invalid patient ID format" });
    }
```

- [ ] **Step 4: Add `existingPatientId` handling before the existing patient logic**

Replace the patient creation block (lines 631-669) with:

```typescript
    // Create or find patient (skip for reservation-only requests)
    let patientId = request.patientId;
    if (!patientId && !request.isReservationOnly && request.patientFirstName && request.patientLastName && request.patientBirthday) {
      if (existingPatientId) {
        // User explicitly selected an existing patient from fuzzy matches
        const selectedPatient = await storage.getPatient(existingPatientId);
        if (!selectedPatient || selectedPatient.hospitalId !== request.hospitalId || selectedPatient.deletedAt || selectedPatient.isArchived) {
          return res.status(400).json({ message: "Selected patient not found or not available" });
        }
        patientId = selectedPatient.id;
        // Backfill missing fields
        const patch: Partial<{ street: string; postalCode: string; city: string; email: string; phone: string }> = {};
        if (!selectedPatient.street && request.patientStreet) patch.street = request.patientStreet;
        if (!selectedPatient.postalCode && request.patientPostalCode) patch.postalCode = request.patientPostalCode;
        if (!selectedPatient.city && request.patientCity) patch.city = request.patientCity;
        if (!selectedPatient.email && request.patientEmail) patch.email = request.patientEmail;
        if (!selectedPatient.phone && request.patientPhone) patch.phone = request.patientPhone;
        if (Object.keys(patch).length > 0) {
          await storage.updatePatient(selectedPatient.id, patch);
        }
      } else {
        // Dedup: reuse existing patient if name+birthday matches (existing fallback)
        const existing = await storage.findPatientByNameAndBirthday(
          request.hospitalId,
          request.patientLastName,
          request.patientFirstName,
          request.patientBirthday,
        );

        if (existing) {
          patientId = existing.id;
          const addressPatch: Partial<{ street: string; postalCode: string; city: string }> = {};
          if (!existing.street && request.patientStreet) addressPatch.street = request.patientStreet;
          if (!existing.postalCode && request.patientPostalCode) addressPatch.postalCode = request.patientPostalCode;
          if (!existing.city && request.patientCity) addressPatch.city = request.patientCity;
          if (Object.keys(addressPatch).length > 0) {
            await storage.updatePatient(existing.id, addressPatch);
          }
        } else {
          const patientNumber = await storage.generatePatientNumber(request.hospitalId);
          const patient = await storage.createPatient({
            hospitalId: request.hospitalId,
            firstName: request.patientFirstName,
            surname: request.patientLastName,
            birthday: request.patientBirthday,
            patientNumber,
            sex: 'O',
            email: request.patientEmail || undefined,
            phone: request.patientPhone || undefined,
            street: request.patientStreet || undefined,
            postalCode: request.patientPostalCode || undefined,
            city: request.patientCity || undefined,
          });
          patientId = patient.id;
        }
      }
    }
```

- [ ] **Step 5: Run typecheck**

Run: `npm run check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/routes/externalSurgery.ts
git commit -m "feat: add patient-matches endpoint and existingPatientId support for scheduling"
```

---

### Task 4: Add translation keys

**Files:**
- Modify: `client/src/i18n/locales/en.json`
- Modify: `client/src/i18n/locales/de.json`

- [ ] **Step 1: Add English keys**

Inside the `surgery.externalRequests` object in `client/src/i18n/locales/en.json` (around line 4777, before the closing `}`), add:

```json
"possibleExistingPatients": "Possible existing patients found",
"createNewPatient": "Create new patient",
"matchHigh": "High",
"matchMedium": "Medium",
"matchLow": "Low"
```

- [ ] **Step 2: Add German keys**

Inside the corresponding `surgery.externalRequests` object in `client/src/i18n/locales/de.json`, add:

```json
"possibleExistingPatients": "Mögliche bestehende Patienten gefunden",
"createNewPatient": "Neuen Patienten erstellen",
"matchHigh": "Hoch",
"matchMedium": "Mittel",
"matchLow": "Niedrig"
```

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat: add i18n keys for patient match UI in external surgery scheduling"
```

---

### Task 5: Add patient match UI to ScheduleDialog

**Files:**
- Modify: `client/src/components/surgery/ExternalReservationsPanel.tsx` (ScheduleDialog component, lines 84-432)

- [ ] **Step 1: Add patient-matches query**

After the `surgeonMatch` query (around line 116), add:

```typescript
  // Find fuzzy patient matches to prevent duplicates
  const { data: patientMatches } = useQuery<Array<{
    id: string;
    firstName: string;
    surname: string;
    birthday: string | null;
    patientNumber: string | null;
    email: string | null;
    phone: string | null;
    confidence: number;
    reasons: string[];
  }>>({
    queryKey: [`/api/external-surgery-requests/${request.id}/patient-matches`],
    enabled: open && !request.isReservationOnly && !request.patientId,
  });
```

- [ ] **Step 2: Add selection state**

After the existing `surgeonChoice` state (line 98), add:

```typescript
  // Patient match selection: "new" = create new patient, or an existing patient ID
  const [selectedPatientId, setSelectedPatientId] = useState<string | "new">("new");
```

- [ ] **Step 3: Add effect to pre-select high-confidence match**

After the existing surgeon choice effect (around line 139), add:

```typescript
  // Pre-select the existing patient if there's exactly one high-confidence match
  useEffect(() => {
    if (patientMatches && patientMatches.length === 1 && patientMatches[0].confidence >= 0.9) {
      setSelectedPatientId(patientMatches[0].id);
    } else {
      setSelectedPatientId("new");
    }
  }, [patientMatches]);
```

- [ ] **Step 4: Pass `existingPatientId` in schedule mutation**

In the `scheduleMutation` mutationFn (around line 157), add to the request body:

```typescript
      return apiRequest('POST', `/api/external-surgery-requests/${request.id}/schedule`, {
        plannedDate: dateTime.toISOString(),
        surgeryRoomId: surgeryRoomId || null,
        surgeryDurationMinutes: request.surgeryDurationMinutes || null,
        sendConfirmation,
        ...(surgeonId ? { surgeonId } : {}),
        ...(createNew ? { createNewSurgeon: true } : {}),
        ...(selectedPatientId !== "new" ? { existingPatientId: selectedPatientId } : {}),
      });
```

- [ ] **Step 5: Add patient match UI section**

After the patient info / slot reservation banner (after line 227, before the Surgery Info section), add:

```tsx
          {/* Fuzzy patient matches */}
          {patientMatches && patientMatches.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 rounded-lg space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {t('surgery.externalRequests.possibleExistingPatients')}
                </p>
              </div>
              <div className="space-y-1.5 pl-6">
                {patientMatches.map((match) => {
                  const badgeVariant = match.confidence >= 0.9 ? "destructive" : match.confidence >= 0.7 ? "default" : "secondary";
                  const badgeText = match.confidence >= 0.9
                    ? t('surgery.externalRequests.matchHigh')
                    : match.confidence >= 0.7
                      ? t('surgery.externalRequests.matchMedium')
                      : t('surgery.externalRequests.matchLow');
                  return (
                    <label key={match.id} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="patient-match"
                        checked={selectedPatientId === match.id}
                        onChange={() => setSelectedPatientId(match.id)}
                        className="accent-amber-600 mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {match.surname}, {match.firstName}
                          </span>
                          {match.birthday && (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(match.birthday)}
                            </span>
                          )}
                          {match.patientNumber && (
                            <span className="text-xs text-muted-foreground">
                              #{match.patientNumber}
                            </span>
                          )}
                          <Badge variant={badgeVariant} className="text-[10px] px-1.5 py-0">
                            {badgeText}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {match.reasons.join(", ")}
                        </p>
                      </div>
                    </label>
                  );
                })}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="patient-match"
                    checked={selectedPatientId === "new"}
                    onChange={() => setSelectedPatientId("new")}
                    className="accent-amber-600"
                  />
                  <span className="text-sm">
                    {t('surgery.externalRequests.createNewPatient')}
                  </span>
                </label>
              </div>
            </div>
          )}
```

- [ ] **Step 6: Run typecheck**

Run: `npm run check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add client/src/components/surgery/ExternalReservationsPanel.tsx
git commit -m "feat: add patient match selection UI to external surgery schedule dialog"
```

---

### Task 6: Integration tests for endpoints

**Files:**
- Create: `tests/external-surgery/patientMatches.test.ts`

Note: These tests need a running database. Follow the same pattern as existing integration tests in the `tests/` directory. If the project does not have integration test infrastructure for API routes, these tests can be written as manual verification steps in Task 7 instead.

- [ ] **Step 1: Write integration tests**

Create `tests/external-surgery/patientMatches.test.ts`. The exact test setup depends on the project's integration test infrastructure. At minimum, the tests should cover:

1. **GET patient-matches returns fuzzy matches** — create a patient "Mario Rossi" with birthday "1985-03-15", create an external surgery request with "Rossi Mario" (swapped) and same birthday. Call the endpoint, verify it returns the existing patient with confidence 0.95.

2. **GET patient-matches returns empty for reservation-only** — create a reservation-only request, call endpoint, verify empty array.

3. **GET patient-matches returns empty when patientId already set** — create a request with `patientId` already linked, verify empty array.

4. **POST schedule with existingPatientId links to existing patient** — create a patient, create an external request, schedule with `existingPatientId` set to the patient's ID. Verify the surgery is created with the correct `patientId` and no new patient is created.

5. **POST schedule with existingPatientId from wrong hospital returns 400** — create a patient in hospital A, create a request in hospital B, try to schedule with that patient ID. Verify 400 response.

6. **POST schedule with non-existent existingPatientId returns 400** — pass a random UUID, verify 400 response.

7. **POST schedule with invalid existingPatientId format returns 400** — pass "not-a-uuid", verify 400 response.

8. **POST schedule with existingPatientId backfills missing fields** — create a patient without email/phone, schedule with `existingPatientId`, verify the patient record now has the email/phone from the request.

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run tests/external-surgery/patientMatches.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/external-surgery/patientMatches.test.ts
git commit -m "test: add integration tests for patient-matches endpoint and existingPatientId"
```

---

### Task 7: Manual smoke test & lint

- [ ] **Step 1: Run linter and typecheck**

Run: `npm run check`
Expected: PASS — no type errors

- [ ] **Step 2: Run all deduplication tests**

Run: `npx vitest run tests/patient-merge/`
Expected: All tests PASS

- [ ] **Step 3: Visual verification checklist**

Start dev server (`npm run dev`) and verify:
1. Open an external surgery request in the scheduling dialog
2. If the request has a patient name similar to an existing patient → match list appears
3. Radio buttons work (select match / create new)
4. Scheduling with a selected existing patient works (no duplicate created)
5. Scheduling with "Create new patient" works as before
6. Reservation-only requests show no match UI
7. Requests with no similar patients show no match UI (dialog unchanged)

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues from smoke testing"
```
