# Patient Merge / Deduplication — Design Spec

**Date:** 2026-03-17
**Status:** Approved

## Problem

Duplicate patient records appear when:
- Name/surname entered in wrong order (first↔last swap)
- Patient enters a second name in the name field, creating a new record
- Manual re-entry without checking for existing patient

These duplicates fragment clinical data across records.

## Solution

A patient merge system modeled after the existing staff merge, scoped per hospital, accessible only to admin users from the patient list page.

---

## 1. Duplicate Detection (`patientDeduplication.ts`)

### Algorithm

Compare all non-archived patients within a hospital. **Performance optimization:** group patients by birthday first, then compare within each birthday group (O(n) groups, small n² within each). Patients without birthdays are compared against all others as a fallback. Insurance-number matching (tier 4) runs as a separate pass with index lookup.

**Matching tiers:**

| Tier | Condition | Confidence |
|------|-----------|------------|
| 1 | Exact normalized name + exact birthday | 1.0 |
| 2 | Name swap (first↔last) + exact birthday | 0.95 |
| 3 | Fuzzy name (Jaccard 60% + Levenshtein 40%) ≥ 0.6 + exact birthday | 0.7–0.85 (scaled by name similarity) |
| 4 | Exact `healthInsuranceNumber` or `insuranceNumber` match | 0.9 |

**Boost signals** (applied on top of tier confidence):
- Matching phone: +0.05
- Matching email: +0.05

**Name normalization:** lowercase, strip diacritics, remove special characters, collapse whitespace. Same approach as `staffDeduplication.ts`.

**Output:** `PatientDuplicatePair[]` sorted by confidence descending.

```typescript
interface PatientDuplicatePair {
  patient1: { id: string; surname: string; firstName: string; birthday: string | null; patientNumber: string | null };
  patient2: { id: string; surname: string; firstName: string; birthday: string | null; patientNumber: string | null };
  confidence: number;
  reasons: string[];  // e.g. ["Exact name match", "Same birthday", "Same phone"]
}
```

### Primary Recommendation Scoring

When a pair is selected for merge, score each patient to recommend which to keep as primary:

**Score = FK record count (weighted) + field completeness**

- FK record count: sum of associated records across all related tables (surgeries, documents, notes, messages, appointments, invoices, episodes, etc.)
- Field completeness: percentage of non-null demographic fields (email, phone, address, street, postalCode, city, insuranceProvider, insuranceNumber, healthInsuranceNumber, emergencyContact, allergies)
- Higher score = recommended as primary (fewer relinks needed, more complete profile)

---

## 2. Merge Preview (`patientMerge.ts` → `previewPatientMerge()`)

Dry-run analysis returning:

### Field Conflicts

For each mergeable patient field, compare primary vs secondary values:

**Mergeable fields:** `email`, `phone`, `sex`, `address`, `street`, `postalCode`, `city`, `insuranceProvider`, `insuranceNumber`, `healthInsuranceNumber`, `insurerGln`, `emergencyContact`, `allergies`, `otherAllergies`, `internalNotes`, `idCardFrontUrl`, `idCardBackUrl`, `insuranceCardFrontUrl`, `insuranceCardBackUrl`

**Auto-resolution logic:**
- Non-null preferred over null
- Primary wins ties (both non-null with different values → flag as conflict for user override)
- `internalNotes`: concatenate both (no conflict, append secondary's notes)
- `allergies` (array): union of both arrays (no conflict)
- `patientNumber`: always keep primary's (secondary's noted in merge audit)

### FK Relink Counts

Count of records per table that will be relinked from secondary → primary. Hospital-scoped where applicable.

### Output

```typescript
interface PatientMergePreview {
  primaryScore: number;
  secondaryScore: number;
  fieldConflicts: PatientFieldConflict[];
  fkUpdateCounts: { table: string; column: string; count: number }[];
  totalAffectedRecords: number;
}

interface PatientFieldConflict {
  field: string;
  primaryValue: any;
  secondaryValue: any;
  recommendation: 'primary' | 'secondary' | 'merge';
  reason: string;
}
```

---

## 3. Merge Execution (`executePatientMerge()`)

Single database transaction with 6 steps:

### Step 1: Snapshot

Capture full patient records for both primary and secondary (for undo).

### Step 2: Merge Fields

Apply field choices to primary patient:
- For each field where secondary was chosen or merge was selected, update primary
- `internalNotes`: append secondary's notes with separator `\n---\n[Merged from {secondary surname} {secondary firstName} ({secondaryId}) on {date}]\n{secondary notes}`
- `allergies`: array union
- Preserve primary's `patientNumber`, `hospitalId`, `createdBy`, `createdAt`

### Step 3: Relink FK References (with formal FK constraints)

Update all tables referencing secondary patient → primary patient.

**Tables with cascade FK (notNull):**

| Table | Column | Hospital Filter |
|-------|--------|-----------------|
| `patient_documents` | `patient_id` | direct |
| `patient_episodes` | `patient_id` | direct |
| `patient_document_folders` | `patient_id` | direct |
| `patient_notes` | `patient_id` | direct |
| `patient_messages` | `patient_id` | direct |
| `patient_chat_archives` | `patient_id` | direct |
| `patient_discharge_medications` | `patient_id` | direct |

**Tables with FK (nullable):**

| Table | Column | Hospital Filter |
|-------|--------|-----------------|
| `chat_conversations` | `patient_id` | direct |
| `chat_mentions` | `mentioned_patient_id` | via(`conversation_id`, `chat_conversations`) |
| `chat_attachments` | `saved_to_patient_id` | via(`conversation_id`, `chat_conversations`) |
| `clinic_invoices` | `patient_id` | direct |
| `patient_questionnaire_links` | `patient_id` | direct |
| `clinic_appointments` | `patient_id` | direct |
| `external_surgery_requests` | `patient_id` | direct |
| `discharge_briefs` | `patient_id` | direct |
| `tardoc_invoices` | `patient_id` | direct |

### Step 4: Relink Non-FK References

Tables with plain `patientId` column (no formal FK constraint):

| Table | Column | Hospital Filter |
|-------|--------|-----------------|
| `surgeries` | `patient_id` | direct |
| `cases` | `patient_id` | direct |
| `activities` | `patient_id` | via(`unit_id`, `units`) |
| `inventory_commits` | `patient_id` | via(`unit_id`, `units`) |

Same UPDATE pattern as FK tables but these lack database-level constraint enforcement.

### Step 4b: Fix `patient_messages.conversationId`

The `conversationId` column on `patient_messages` is a deterministic string `{hospitalId}:{patientId}`. After relinking `patient_id`, also update `conversationId` to replace the secondary patient ID with the primary patient ID. This ensures messages appear in the correct conversation thread.

```sql
UPDATE patient_messages
SET conversation_id = REPLACE(conversation_id, :secondaryPatientId, :primaryPatientId)
WHERE patient_id = :primaryPatientId
  AND conversation_id LIKE '%' || :secondaryPatientId || '%'
```

Store affected record IDs in the audit trail for undo.

### Step 4c: Deduplicate `patient_chat_archives`

If both patients have archive entries for the same hospital, keep the primary's entry and delete the secondary's duplicate. Record deleted entries in audit for undo (with full row snapshot).

### Step 5: Archive Secondary

- Set `isArchived = true`, `archivedAt = now()`
- Append to `internalNotes`: `[Merged into {Primary Name} ({primaryId}) on {ISO date}]`
- Keep secondary's `patientNumber` intact (for historical reference in external systems)

### Step 6: Write Audit Record

Insert into `patient_merges` table with:
- Primary/secondary patient IDs and full snapshots
- All FK updates with record IDs (for undo)
- Field choices made
- Status: `completed`
- `mergedBy`: current admin user ID

---

## 4. Undo (`undoPatientMerge()`)

Transactional reversal using audit record:

1. **Reverse FK updates** — for each recorded FK update, use stored `recordIds` to revert specific records back to secondary patient ID. If a record was deleted between merge and undo, skip gracefully (log warning).
2. **Reverse `patient_messages.conversationId`** — restore original `conversationId` values using stored record IDs, replacing primary patient ID back to secondary.
3. **Restore deleted `patient_chat_archives`** — re-insert archived rows from snapshot stored in audit.
4. **Restore secondary patient** — restore `isArchived`, `archivedAt`, `internalNotes` from snapshot.
5. **Restore primary patient fields** — for each field where secondary was chosen, restore from primary snapshot.
6. **Mark merge as undone** — set status `undone`, record `undoneAt` and `undoneBy`.

---

## 5. Schema Addition

### `patient_merges` table

```
patientMergeStatusEnum: 'completed' | 'undone'

patient_merges:
  id                    varchar PK (randomUUID, consistent with staff_merges)
  hospitalId            varchar FK → hospitals.id NOT NULL
  primaryPatientId      varchar FK → patients.id NOT NULL
  secondaryPatientId    varchar FK → patients.id NOT NULL
  mergedBy              varchar FK → users.id NOT NULL
  primaryPatientSnapshot   jsonb NOT NULL
  secondaryPatientSnapshot jsonb NOT NULL
  fkUpdates             jsonb NOT NULL   // [{table, column, count, recordIds}]
  fieldChoices          jsonb NOT NULL   // {field: {chosen: 'primary'|'secondary'|'merge', value}}
  status                patientMergeStatusEnum NOT NULL DEFAULT 'completed'
  undoneAt              timestamp
  undoneBy              varchar FK → users.id
  createdAt             timestamp NOT NULL DEFAULT now()
```

---

## 6. API Routes

All under admin guard (`isAuthenticated`, `isAdmin`):

| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/admin/:hospitalId/patient-duplicates` | `findPatientDuplicates(hospitalId)` |
| POST | `/api/admin/:hospitalId/patient-merge/preview` | `previewPatientMerge(primaryId, secondaryId, hospitalId)` |
| POST | `/api/admin/:hospitalId/patient-merge/execute` | `executePatientMerge(primaryId, secondaryId, fieldChoices, mergedBy, hospitalId)` |
| POST | `/api/admin/:hospitalId/patient-merge/undo/:mergeId` | `undoPatientMerge(mergeId, undoneBy)` |

---

## 7. UI Components

### PatientDuplicatesDialog

- Triggered by "Find Duplicates" button on patient list page (admin-only)
- Lists duplicate pairs sorted by confidence
- Confidence badge per pair (color-coded)
- Shows patient name, birthday, patientNumber for each side
- "Merge" button per pair → opens PatientMergeDialog

### PatientMergeDialog (2-step)

**Step 1: Review & Select**
- Side-by-side comparison of both patients
- Primary pre-selected by score (with recommendation label)
- Swap button to change primary/secondary
- Field conflicts shown with auto-resolution applied
- Radio buttons to override any field choice
- FK relink counts shown per table (e.g., "5 surgeries, 12 documents, 3 invoices will be moved")

**Step 2: Confirm**
- Summary: primary patient, secondary patient (will be archived)
- Total affected records count
- Field choices summary
- "Confirm Merge" button
- Toast with "Undo" action after successful merge (30s window)

---

## 8. Special Handling

### Episode Numbers
`patient_episodes` has a unique constraint on `(hospitalId, episodeNumber)`. Episodes from different patients should have different numbers, so no conflict expected. If a conflict somehow occurs (same episodeNumber for both patients), the merge should fail with a clear error rather than silently dropping data.

### Allergies
Array union — combine both patients' allergy arrays, deduplicated.

### Internal Notes
Concatenated with merge separator — no data loss.

### Patient Number
Secondary's `patientNumber` is preserved in the audit record. The primary keeps its number. If staff search for the secondary's old number, they won't find it — but the archived secondary record still exists with that number for historical lookups.

### Chat Conversations
A chat conversation can only have one `patientId`. If both patients have conversations, all secondary's conversations get relinked to primary. No unique constraint conflict since `patientId` is not part of any unique index on `chat_conversations`.

### TARDOC Invoices
These contain a `patientSnapshot` (frozen demographics at invoice time). The snapshot is NOT updated during merge — it represents the patient's data at the time of invoicing. Only the `patientId` FK is relinked.
