# Patient Merge / Deduplication Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a patient merge/dedup system that detects duplicate patient records within a hospital and allows admins to merge them — relinking all associated data to the primary patient and archiving the secondary.

**Architecture:** Modeled after the existing staff merge system (`staffDeduplication.ts` + `staffMerge.ts`). Server-side: duplicate detection service, merge service (preview/execute/undo), admin API routes. Client-side: duplicates dialog + 2-step merge dialog on the patient list page, admin-only.

**Tech Stack:** Drizzle ORM, PostgreSQL, Express routes, React + shadcn/ui dialogs, TanStack Query

**Spec:** `docs/superpowers/specs/2026-03-17-patient-merge-design.md`

---

## File Structure

### New Files (Server)
- `server/services/patientDeduplication.ts` — duplicate detection logic (name matching, scoring)
- `server/services/patientMerge.ts` — preview, execute, undo merge operations

### New Files (Client)
- `client/src/components/patients/PatientDuplicatesDialog.tsx` — list duplicate pairs, trigger merge
- `client/src/components/patients/PatientMergeDialog.tsx` — 2-step merge wizard

### New Files (Tests)
- `tests/patient-merge/patientDeduplication.test.ts` — dedup detection tests
- `tests/patient-merge/patientMerge.test.ts` — merge execution tests

### Modified Files
- `shared/schema.ts` — add `patientMergeStatusEnum` + `patientMerges` table
- `server/routes/admin.ts` — add 4 patient merge API routes
- `client/src/pages/anesthesia/Patients.tsx` — add "Find Duplicates" button (admin-only), wire up dialogs

---

## Task 1: Schema — `patient_merges` table

**Files:**
- Modify: `shared/schema.ts` (after `staffMerges` table, ~line 5720)

- [ ] **Step 1: Add the enum and table to schema**

Add after the `staffMerges` table definition:

```typescript
export const patientMergeStatusEnum = pgEnum("patient_merge_status", [
  "completed",
  "undone",
]);

export const patientMerges = pgTable("patient_merges", {
  id: varchar().primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  primaryPatientId: varchar("primary_patient_id").notNull().references(() => patients.id),
  secondaryPatientId: varchar("secondary_patient_id").notNull().references(() => patients.id),
  mergedBy: varchar("merged_by").notNull().references(() => users.id),
  primaryPatientSnapshot: jsonb("primary_patient_snapshot").notNull(),
  secondaryPatientSnapshot: jsonb("secondary_patient_snapshot").notNull(),
  fkUpdates: jsonb("fk_updates").notNull(),
  fieldChoices: jsonb("field_choices").notNull(),
  deletedChatArchives: jsonb("deleted_chat_archives"),
  conversationIdUpdates: jsonb("conversation_id_updates"),
  status: patientMergeStatusEnum().notNull().default("completed"),
  undoneAt: timestamp("undone_at"),
  undoneBy: varchar("undone_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_patient_merges_hospital").on(t.hospitalId),
  index("idx_patient_merges_primary").on(t.primaryPatientId),
  index("idx_patient_merges_secondary").on(t.secondaryPatientId),
  index("idx_patient_merges_status").on(t.status),
]);
```

- [ ] **Step 2: Generate and fix migration**

```bash
npm run db:generate
```

Open the generated migration file. Ensure it uses:
- `CREATE TYPE IF NOT EXISTS` for the enum (wrap in `DO $$ ... END $$` if needed)
- `CREATE TABLE IF NOT EXISTS` for the table
- `CREATE INDEX IF NOT EXISTS` for indexes

- [ ] **Step 3: Run migration**

```bash
npm run db:migrate
```

- [ ] **Step 4: TypeScript check**

```bash
npm run check
```

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat(patient-merge): add patient_merges schema table"
```

---

## Task 2: Patient Deduplication Service

**Files:**
- Create: `server/services/patientDeduplication.ts`
- Reference: `server/services/staffDeduplication.ts` (reuse `normalizeName`, `levenshtein`, `calculateNameSimilarity`)

- [ ] **Step 1: Write deduplication tests**

Create `tests/patient-merge/patientDeduplication.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

// Import the pure functions directly for unit testing
// The main findPatientDuplicates function requires DB so is tested via API integration tests

describe("patientDeduplication", () => {
  describe("name matching tiers", () => {
    it("tier 1: exact normalized name + birthday → confidence 1.0", () => {
      // Two patients: "Mario Rossi" born 1980-01-15 vs "mario rossi" born 1980-01-15
    });

    it("tier 2: swapped first/last + birthday → confidence 0.95", () => {
      // "Mario Rossi" born 1980-01-15 vs "Rossi Mario" born 1980-01-15
    });

    it("tier 3: fuzzy name + birthday → confidence 0.7-0.85", () => {
      // "Mario Alberto Rossi" (extra name in firstName field) vs "Mario Rossi" born 1980-01-15
    });

    it("tier 4: exact insurance number match → confidence 0.9", () => {
      // Different names but same healthInsuranceNumber
    });

    it("boost: matching phone adds +0.05", () => {
      // Tier 3 match with same phone → confidence boosted
    });

    it("boost: matching email adds +0.05", () => {
      // Tier 3 match with same email → confidence boosted
    });

    it("no match: different name and birthday", () => {
      // Completely different patients → not in results
    });

    it("ignores archived patients", () => {
      // One patient is archived → not compared
    });
  });

  describe("primary recommendation scoring", () => {
    it("recommends patient with more associated records as primary", () => {
      // Patient A has 5 surgeries, Patient B has 1 → A recommended
    });

    it("factors field completeness into score", () => {
      // Patient A has 2 surgeries + full profile, Patient B has 3 surgeries + sparse profile
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/patient-merge/patientDeduplication.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement patientDeduplication.ts**

Create `server/services/patientDeduplication.ts`:

```typescript
import { db } from "../storage";
import { eq, and, isNull, sql } from "drizzle-orm";
import { patients } from "@shared/schema";

// ── Name utilities (shared with staffDeduplication) ──────────────

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // strip diacritics
    .replace(/[^a-z\s]/g, "")                           // remove non-letter
    .replace(/\s+/g, " ")                                // collapse whitespace
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

export function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (!n1 || !n2) return 0;

  // Jaccard word-level similarity (60%)
  const words1 = new Set(n1.split(" "));
  const words2 = new Set(n2.split(" "));
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  const jaccard = union > 0 ? intersection / union : 0;

  // Levenshtein character-level similarity (40%)
  const maxLen = Math.max(n1.length, n2.length);
  const lev = maxLen > 0 ? 1 - levenshtein(n1, n2) / maxLen : 1;

  return jaccard * 0.6 + lev * 0.4;
}

// ── Types ────────────────────────────────────────────────────────

export interface PatientDuplicatePair {
  patient1: PatientSummary;
  patient2: PatientSummary;
  confidence: number;
  reasons: string[];
}

interface PatientSummary {
  id: string;
  surname: string;
  firstName: string;
  birthday: string | null;
  patientNumber: string | null;
  email: string | null;
  phone: string | null;
}

// ── Duplicate detection ──────────────────────────────────────────

export async function findPatientDuplicates(hospitalId: string): Promise<PatientDuplicatePair[]> {
  const allPatients = await db
    .select()
    .from(patients)
    .where(
      and(
        eq(patients.hospitalId, hospitalId),
        eq(patients.isArchived, false),
        isNull(patients.deletedAt)
      )
    );

  const pairs: PatientDuplicatePair[] = [];

  // Group by birthday for O(n) grouping, then compare within groups
  const byBirthday = new Map<string, typeof allPatients>();
  const noBirthday: typeof allPatients = [];

  for (const p of allPatients) {
    if (p.birthday) {
      const group = byBirthday.get(p.birthday) || [];
      group.push(p);
      byBirthday.set(p.birthday, group);
    } else {
      noBirthday.push(p);
    }
  }

  // Compare within same-birthday groups (tiers 1-3)
  for (const [_bday, group] of byBirthday) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const pair = matchPatients(group[i], group[j], true);
        if (pair) pairs.push(pair);
      }
    }
  }

  // Tier 4: insurance number match (across all patients)
  const byInsurance = new Map<string, typeof allPatients>();
  for (const p of allPatients) {
    for (const num of [p.healthInsuranceNumber, p.insuranceNumber]) {
      if (num) {
        const group = byInsurance.get(num) || [];
        group.push(p);
        byInsurance.set(num, group);
      }
    }
  }
  for (const [_num, group] of byInsurance) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        // Skip if already found via birthday match
        const exists = pairs.some(
          p => (p.patient1.id === group[i].id && p.patient2.id === group[j].id) ||
               (p.patient1.id === group[j].id && p.patient2.id === group[i].id)
        );
        if (!exists) {
          pairs.push({
            patient1: toSummary(group[i]),
            patient2: toSummary(group[j]),
            confidence: 0.9,
            reasons: ["Same insurance number"],
          });
        }
      }
    }
  }

  // No-birthday patients: compare against all others with fuzzy name only
  // (lower confidence, no birthday confirmation)
  // Skipped for now — birthday is almost always present

  // Deduplicate and sort by confidence
  pairs.sort((a, b) => b.confidence - a.confidence);
  return pairs;
}

function matchPatients(
  p1: typeof patients.$inferSelect,
  p2: typeof patients.$inferSelect,
  sameBirthday: boolean
): PatientDuplicatePair | null {
  const fullName1 = `${p1.firstName} ${p1.surname}`;
  const fullName2 = `${p2.firstName} ${p2.surname}`;
  const reasons: string[] = [];
  let confidence = 0;

  const norm1 = normalizeName(fullName1);
  const norm2 = normalizeName(fullName2);

  // Tier 1: exact normalized name
  if (norm1 === norm2) {
    confidence = 1.0;
    reasons.push("Exact name match");
  }
  // Tier 2: name swap (first↔last)
  else if (
    normalizeName(`${p1.surname} ${p1.firstName}`) === norm2 ||
    norm1 === normalizeName(`${p2.surname} ${p2.firstName}`)
  ) {
    confidence = 0.95;
    reasons.push("Name/surname swapped");
  }
  // Tier 3: fuzzy match
  else {
    const similarity = calculateNameSimilarity(fullName1, fullName2);
    if (similarity >= 0.6) {
      confidence = 0.7 + (similarity - 0.6) * 0.375; // 0.6→0.7, 1.0→0.85
      reasons.push(`Fuzzy name match (${Math.round(similarity * 100)}%)`);
    }
  }

  if (confidence === 0) return null;

  if (sameBirthday) reasons.push("Same birthday");

  // Boost signals
  if (p1.phone && p2.phone && p1.phone === p2.phone) {
    confidence = Math.min(confidence + 0.05, 1.0);
    reasons.push("Same phone");
  }
  if (p1.email && p2.email && p1.email.toLowerCase() === p2.email.toLowerCase()) {
    confidence = Math.min(confidence + 0.05, 1.0);
    reasons.push("Same email");
  }

  return {
    patient1: toSummary(p1),
    patient2: toSummary(p2),
    confidence,
    reasons,
  };
}

function toSummary(p: typeof patients.$inferSelect): PatientSummary {
  return {
    id: p.id,
    surname: p.surname,
    firstName: p.firstName,
    birthday: p.birthday,
    patientNumber: p.patientNumber,
    email: p.email,
    phone: p.phone,
  };
}

// ── Primary recommendation scoring ──────────────────────────────

const DEMOGRAPHIC_FIELDS = [
  "email", "phone", "address", "street", "postalCode", "city",
  "insuranceProvider", "insuranceNumber", "healthInsuranceNumber",
  "emergencyContact",
] as const;

export async function scorePatient(patientId: string, hospitalId: string): Promise<number> {
  // Count associated records across key tables
  const counts = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM surgeries WHERE patient_id = ${patientId} AND hospital_id = ${hospitalId})::int AS surgeries,
      (SELECT COUNT(*) FROM cases WHERE patient_id = ${patientId} AND hospital_id = ${hospitalId})::int AS cases,
      (SELECT COUNT(*) FROM patient_documents WHERE patient_id = ${patientId})::int AS documents,
      (SELECT COUNT(*) FROM patient_notes WHERE patient_id = ${patientId})::int AS notes,
      (SELECT COUNT(*) FROM patient_messages WHERE patient_id = ${patientId})::int AS messages,
      (SELECT COUNT(*) FROM clinic_appointments WHERE patient_id = ${patientId} AND hospital_id = ${hospitalId})::int AS appointments,
      (SELECT COUNT(*) FROM clinic_invoices WHERE patient_id = ${patientId} AND hospital_id = ${hospitalId})::int AS invoices,
      (SELECT COUNT(*) FROM patient_episodes WHERE patient_id = ${patientId} AND hospital_id = ${hospitalId})::int AS episodes,
      (SELECT COUNT(*) FROM patient_questionnaire_links WHERE patient_id = ${patientId} AND hospital_id = ${hospitalId})::int AS questionnaires,
      (SELECT COUNT(*) FROM discharge_briefs WHERE patient_id = ${patientId})::int AS briefs,
      (SELECT COUNT(*) FROM tardoc_invoices WHERE patient_id = ${patientId})::int AS tardoc
  `);

  const row = (counts as any).rows?.[0] || counts[0] || {};
  const fkCount = Object.values(row).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0);

  // Get patient record for field completeness
  const [patient] = await db.select().from(patients).where(eq(patients.id, patientId));
  if (!patient) return 0;

  const filledFields = DEMOGRAPHIC_FIELDS.filter(f => {
    const val = (patient as any)[f];
    return val !== null && val !== undefined && val !== "";
  }).length;

  const fieldCompleteness = filledFields / DEMOGRAPHIC_FIELDS.length;

  // Weight: 70% record count (log scale to avoid huge surgery counts dominating), 30% field completeness
  return Math.log2(fkCount + 1) * 0.7 + fieldCompleteness * 10 * 0.3;
}
```

- [ ] **Step 4: Fill in test implementations with actual assertions**

Update `tests/patient-merge/patientDeduplication.test.ts` to test the pure functions (`normalizeName`, `calculateNameSimilarity`):

```typescript
import { describe, it, expect } from "vitest";
import {
  normalizeName,
  calculateNameSimilarity,
} from "../../server/services/patientDeduplication";

describe("patientDeduplication", () => {
  describe("normalizeName", () => {
    it("lowercases and strips diacritics", () => {
      expect(normalizeName("Müller")).toBe("muller");
      expect(normalizeName("José García")).toBe("jose garcia");
    });

    it("removes special characters", () => {
      expect(normalizeName("O'Brien-Smith")).toBe("obriensmith");
    });

    it("collapses whitespace", () => {
      expect(normalizeName("  Mario   Rossi  ")).toBe("mario rossi");
    });
  });

  describe("calculateNameSimilarity", () => {
    it("returns 1.0 for identical names", () => {
      expect(calculateNameSimilarity("Mario Rossi", "Mario Rossi")).toBe(1);
    });

    it("returns 1.0 for case-insensitive match", () => {
      expect(calculateNameSimilarity("Mario Rossi", "mario rossi")).toBe(1);
    });

    it("high similarity for extra middle name", () => {
      const sim = calculateNameSimilarity("Mario Alberto Rossi", "Mario Rossi");
      expect(sim).toBeGreaterThan(0.6);
      expect(sim).toBeLessThan(1.0);
    });

    it("low similarity for completely different names", () => {
      const sim = calculateNameSimilarity("Mario Rossi", "Anna Bianchi");
      expect(sim).toBeLessThan(0.3);
    });
  });
});
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/patient-merge/patientDeduplication.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/services/patientDeduplication.ts tests/patient-merge/patientDeduplication.test.ts
git commit -m "feat(patient-merge): add patient deduplication detection service"
```

---

## Task 3: Patient Merge Service — Preview + Execute + Undo

**Files:**
- Create: `server/services/patientMerge.ts`
- Reference: `server/services/staffMerge.ts` (same FK_REFS + transaction pattern)

- [ ] **Step 1: Write merge service tests**

Create `tests/patient-merge/patientMerge.test.ts` — test the pure helper functions and types. Integration tests for the full merge flow will rely on the API routes (Task 5).

```typescript
import { describe, it, expect } from "vitest";

describe("patientMerge", () => {
  describe("PATIENT_FK_REFS", () => {
    it("contains all 20 patient-referencing tables", () => {
      // Import and verify the array covers all expected tables
    });
  });

  describe("field conflict resolution", () => {
    it("non-null preferred over null", () => {
      // Test the resolveFieldConflicts helper
    });

    it("primary wins ties", () => {
      // Both non-null and different → recommendation is 'primary'
    });

    it("allergies uses array union", () => {
      // ["Penicillin"] + ["Latex", "Penicillin"] → ["Penicillin", "Latex"]
    });

    it("internalNotes concatenated", () => {
      // "Note A" + "Note B" → merged with separator
    });
  });
});
```

- [ ] **Step 2: Implement patientMerge.ts**

Create `server/services/patientMerge.ts`. Key structure:

```typescript
import { db } from "../storage";
import { eq, and, sql } from "drizzle-orm";
import { patients, patientMerges } from "@shared/schema";

// ── Types ────────────────────────────────────────────────────────

type HospitalFilter =
  | "direct"
  | { via: string; parent: string }
  | { via2: string; mid: string; midVia: string; parent: string }
  | null;

interface FkRef {
  table: string;
  column: string;
  filter: HospitalFilter;
}

const via = (fk: string, parent: string): HospitalFilter => ({ via: fk, parent });
const via2 = (fk: string, mid: string, midFk: string, parent: string): HospitalFilter => ({
  via2: fk, mid, midVia: midFk, parent,
});

// ── FK References ────────────────────────────────────────────────

export const PATIENT_FK_REFS: FkRef[] = [
  // Cascade FK (notNull)
  { table: "patient_documents", column: "patient_id", filter: "direct" },
  { table: "patient_episodes", column: "patient_id", filter: "direct" },
  { table: "patient_document_folders", column: "patient_id", filter: "direct" },
  { table: "patient_notes", column: "patient_id", filter: "direct" },
  { table: "patient_messages", column: "patient_id", filter: "direct" },
  { table: "patient_chat_archives", column: "patient_id", filter: "direct" },
  { table: "patient_discharge_medications", column: "patient_id", filter: "direct" },

  // FK (nullable)
  { table: "chat_conversations", column: "patient_id", filter: "direct" },
  { table: "chat_mentions", column: "mentioned_patient_id", filter: via("conversation_id", "chat_conversations") },
  { table: "chat_attachments", column: "saved_to_patient_id", filter: via("conversation_id", "chat_conversations") },
  { table: "clinic_invoices", column: "patient_id", filter: "direct" },
  { table: "patient_questionnaire_links", column: "patient_id", filter: "direct" },
  { table: "clinic_appointments", column: "patient_id", filter: "direct" },
  { table: "external_surgery_requests", column: "patient_id", filter: "direct" },
  { table: "discharge_briefs", column: "patient_id", filter: "direct" },
  { table: "tardoc_invoices", column: "patient_id", filter: "direct" },

  // No FK constraint (plain column)
  { table: "surgeries", column: "patient_id", filter: "direct" },
  { table: "cases", column: "patient_id", filter: "direct" },
  { table: "activities", column: "patient_id", filter: via("unit_id", "units") },
  { table: "inventory_commits", column: "patient_id", filter: via("unit_id", "units") },
];

// ── Mergeable fields ─────────────────────────────────────────────

const MERGEABLE_FIELDS = [
  "email", "phone", "sex", "address", "street", "postalCode", "city",
  "insuranceProvider", "insuranceNumber", "healthInsuranceNumber", "insurerGln",
  "emergencyContact", "otherAllergies",
  "idCardFrontUrl", "idCardBackUrl", "insuranceCardFrontUrl", "insuranceCardBackUrl",
] as const;

// allergies and internalNotes handled specially (union / concatenate)

// ── Preview ──────────────────────────────────────────────────────

export interface PatientFieldConflict {
  field: string;
  primaryValue: any;
  secondaryValue: any;
  recommendation: "primary" | "secondary" | "merge";
  reason: string;
}

export interface PatientMergePreview {
  primaryScore: number;
  secondaryScore: number;
  fieldConflicts: PatientFieldConflict[];
  fkUpdateCounts: { table: string; column: string; count: number }[];
  totalAffectedRecords: number;
}

export async function previewPatientMerge(
  primaryPatientId: string,
  secondaryPatientId: string,
  hospitalId: string
): Promise<PatientMergePreview> {
  // 1. Fetch both patients, validate they exist and belong to hospital
  // 2. Build field conflicts (MERGEABLE_FIELDS + allergies + internalNotes)
  // 3. Count FK references per table using same hospital-filter SQL as staffMerge
  // 4. Score both patients (import scorePatient from deduplication)
  // 5. Return preview
  // (Full implementation follows staffMerge.ts preview pattern exactly)
}

// ── Execute ──────────────────────────────────────────────────────

export async function executePatientMerge(
  primaryPatientId: string,
  secondaryPatientId: string,
  fieldChoices: Record<string, { chosen: "primary" | "secondary" | "merge"; value: any }>,
  mergedBy: string,
  hospitalId: string
): Promise<{ mergeId: string; fkUpdates: { table: string; column: string; count: number; recordIds: string[] }[] }> {
  return await db.transaction(async (tx) => {
    // Step 1: Snapshot both patients
    // Step 2: Merge fields on primary (apply fieldChoices, union allergies, concat internalNotes)
    // Step 3: Relink all FK refs (PATIENT_FK_REFS loop with hospital filter SQL)
    //         For each ref: UPDATE table SET column = primaryId WHERE column = secondaryId [+ hospital filter] RETURNING id
    // Step 4b: Fix patient_messages.conversationId
    //         UPDATE patient_messages SET conversation_id = REPLACE(...) WHERE patient_id = primaryId AND conversation_id LIKE '%secondaryId%'
    // Step 4c: Deduplicate patient_chat_archives
    //         If both patients have archive entries, snapshot secondary's, delete it
    // Step 5: Archive secondary (isArchived=true, archivedAt=now(), append merge note to internalNotes)
    // Step 6: Write audit record to patient_merges
    // (Full implementation follows staffMerge.ts executeStaffMerge pattern exactly)
  });
}

// ── Undo ─────────────────────────────────────────────────────────

export async function undoPatientMerge(
  mergeId: string,
  undoneBy: string
): Promise<void> {
  return await db.transaction(async (tx) => {
    // 1. Load merge record, validate status === 'completed'
    // 2. Reverse FK updates (per-record using stored recordIds, skip gracefully if deleted)
    // 3. Reverse patient_messages.conversationId updates
    // 4. Restore deleted patient_chat_archives from snapshot
    // 5. Restore secondary patient (isArchived, archivedAt, internalNotes from snapshot)
    // 6. Restore primary patient fields from snapshot (for fields where secondary was chosen)
    // 7. Mark merge as undone (status='undone', undoneAt=now(), undoneBy)
    // (Full implementation follows staffMerge.ts undoStaffMerge pattern exactly)
  });
}
```

The implementation comments above indicate exact steps — each follows the staff merge pattern from `server/services/staffMerge.ts`. The FK update loop, hospital filter SQL generation, and audit record structure are identical patterns with patient-specific field names.

- [ ] **Step 3: Fill in test implementations**

Update tests with real imports once the module compiles.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/patient-merge/patientMerge.test.ts
```

- [ ] **Step 5: TypeScript check**

```bash
npm run check
```

- [ ] **Step 6: Commit**

```bash
git add server/services/patientMerge.ts tests/patient-merge/patientMerge.test.ts
git commit -m "feat(patient-merge): add patient merge service (preview/execute/undo)"
```

---

## Task 4: Admin API Routes

**Files:**
- Modify: `server/routes/admin.ts` (add after staff merge routes, ~line 2012)

- [ ] **Step 1: Add the 4 patient merge routes**

Add after the existing staff merge routes in `server/routes/admin.ts`:

```typescript
// ── Patient Merge ────────────────────────────────────────────────

import { findPatientDuplicates, scorePatient } from "../services/patientDeduplication";
import { previewPatientMerge, executePatientMerge, undoPatientMerge } from "../services/patientMerge";

// GET /api/admin/:hospitalId/patient-duplicates
app.get("/api/admin/:hospitalId/patient-duplicates", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const pairs = await findPatientDuplicates(req.params.hospitalId);
    // Enrich each pair with scores
    for (const pair of pairs) {
      (pair as any).patient1Score = await scorePatient(pair.patient1.id, req.params.hospitalId);
      (pair as any).patient2Score = await scorePatient(pair.patient2.id, req.params.hospitalId);
    }
    res.json(pairs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/admin/:hospitalId/patient-merge/preview
app.post("/api/admin/:hospitalId/patient-merge/preview", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { primaryPatientId, secondaryPatientId } = req.body;
    const preview = await previewPatientMerge(primaryPatientId, secondaryPatientId, req.params.hospitalId);
    res.json(preview);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/admin/:hospitalId/patient-merge/execute
app.post("/api/admin/:hospitalId/patient-merge/execute", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { primaryPatientId, secondaryPatientId, fieldChoices } = req.body;
    const result = await executePatientMerge(
      primaryPatientId,
      secondaryPatientId,
      fieldChoices,
      (req.user as any).id,
      req.params.hospitalId
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/admin/:hospitalId/patient-merge/undo/:mergeId
app.post("/api/admin/:hospitalId/patient-merge/undo/:mergeId", isAuthenticated, isAdmin, async (req, res) => {
  try {
    await undoPatientMerge(req.params.mergeId, (req.user as any).id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});
```

- [ ] **Step 2: TypeScript check**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/admin.ts
git commit -m "feat(patient-merge): add admin API routes for patient merge"
```

---

## Task 5: PatientDuplicatesDialog (UI)

**Files:**
- Create: `client/src/components/patients/PatientDuplicatesDialog.tsx`
- Reference: `client/src/components/admin/StaffDuplicatesDialog.tsx` (same pattern)

- [ ] **Step 1: Create PatientDuplicatesDialog**

```typescript
// Pattern: same as StaffDuplicatesDialog but with patient fields
// Props: { open, onOpenChange, hospitalId, onMerge: (patient1Id, patient2Id) => void }
//
// - useQuery to GET /api/admin/:hospitalId/patient-duplicates
// - dismissedPairs state (Set<string>) to filter visible pairs
// - Confidence badge: ≥0.9 destructive, ≥0.7 default, <0.7 secondary
// - Each pair shows: surname, firstName, birthday, patientNumber, confidence, reasons
// - Score displayed: "Recommended primary" badge on higher-scored patient
// - "Merge" button per pair → calls onMerge(p1.id, p2.id)
// - "Dismiss" button to hide a pair from the list
// - Loading/empty states
```

Key UI elements:
- Dialog with ScrollArea for the list
- Each pair rendered as a card with two patient summaries side by side
- Confidence as a colored Badge
- Reasons shown as small tags
- Patient info: `{surname} {firstName}` (bold), birthday formatted, patientNumber, phone/email if present

- [ ] **Step 2: TypeScript check**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/patients/PatientDuplicatesDialog.tsx
git commit -m "feat(patient-merge): add PatientDuplicatesDialog component"
```

---

## Task 6: PatientMergeDialog (UI)

**Files:**
- Create: `client/src/components/patients/PatientMergeDialog.tsx`
- Reference: `client/src/components/admin/StaffMergeWizard.tsx` (simplified 2-step version)

- [ ] **Step 1: Create PatientMergeDialog**

```typescript
// Props: { open, onOpenChange, hospitalId, initialPatient1Id, initialPatient2Id }
//
// 2-step dialog:
//
// Step 1: "Review & Select"
// - Side-by-side patient comparison (name, birthday, patientNumber, all demographic fields)
// - Primary pre-selected by score, "Recommended" badge
// - "Swap" button to switch primary/secondary
// - useQuery: POST /api/admin/:hospitalId/patient-merge/preview (refetch on swap)
// - Field conflicts displayed as rows:
//   - Field name | Primary value | Secondary value | Radio (primary/secondary/merge where applicable)
//   - Pre-selected per recommendation
// - FK relink counts shown as summary table:
//   "N surgeries, N documents, N notes, etc. will be moved to primary"
// - "Next" button → Step 2
//
// Step 2: "Confirm"
// - Summary card: "Merge {Secondary Name} into {Primary Name}"
// - "The secondary patient will be archived. All associated records ({totalCount}) will be moved."
// - Field choices summary (only fields where secondary was chosen, highlighted)
// - "Confirm Merge" button (destructive variant)
// - useMutation: POST /api/admin/:hospitalId/patient-merge/execute
// - On success: toast with "Undo" action (30s), close dialog, invalidate queries
// - Undo action: POST /api/admin/:hospitalId/patient-merge/undo/:mergeId
```

- [ ] **Step 2: TypeScript check**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/patients/PatientMergeDialog.tsx
git commit -m "feat(patient-merge): add PatientMergeDialog 2-step wizard"
```

---

## Task 7: Wire into Patients Page

**Files:**
- Modify: `client/src/pages/anesthesia/Patients.tsx`

- [ ] **Step 1: Add admin-only "Find Duplicates" button and dialog state**

In `Patients.tsx`:

```typescript
import { PatientDuplicatesDialog } from "@/components/patients/PatientDuplicatesDialog";
import { PatientMergeDialog } from "@/components/patients/PatientMergeDialog";

// Inside the component:
const { activeHospital } = useActiveHospital(); // or however it's accessed
const isAdmin = activeHospital?.role === "admin";

const [showDuplicates, setShowDuplicates] = useState(false);
const [mergePatients, setMergePatients] = useState<{ p1: string; p2: string } | null>(null);
```

- [ ] **Step 2: Add button in the page header area (admin-only)**

Next to the existing action buttons (e.g., "Add Patient"), add:

```tsx
{isAdmin && (
  <Button variant="outline" onClick={() => setShowDuplicates(true)}>
    Find Duplicates
  </Button>
)}
```

- [ ] **Step 3: Add dialogs at the bottom of the component's return**

```tsx
{isAdmin && (
  <>
    <PatientDuplicatesDialog
      open={showDuplicates}
      onOpenChange={setShowDuplicates}
      hospitalId={activeHospital.hospital.id}
      onMerge={(p1Id, p2Id) => {
        setShowDuplicates(false);
        setMergePatients({ p1: p1Id, p2: p2Id });
      }}
    />
    {mergePatients && (
      <PatientMergeDialog
        open={!!mergePatients}
        onOpenChange={(open) => { if (!open) setMergePatients(null); }}
        hospitalId={activeHospital.hospital.id}
        initialPatient1Id={mergePatients.p1}
        initialPatient2Id={mergePatients.p2}
      />
    )}
  </>
)}
```

- [ ] **Step 4: TypeScript check**

```bash
npm run check
```

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
```

1. Log in as admin user
2. Navigate to patient list page
3. Verify "Find Duplicates" button appears (admin only)
4. Click it → verify dialog opens, loads duplicates
5. Click "Merge" on a pair → verify merge dialog opens with preview
6. Walk through both steps, confirm merge
7. Verify toast with Undo appears
8. Verify patient list refreshes (secondary no longer visible)

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/anesthesia/Patients.tsx
git commit -m "feat(patient-merge): wire duplicates/merge dialogs into Patients page"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Full TypeScript check**

```bash
npm run check
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run tests/patient-merge/
```

- [ ] **Step 3: Full lint check**

```bash
npm run check
```

- [ ] **Step 4: End-to-end smoke test**

Test the complete flow:
1. Find duplicates
2. Preview merge (verify counts)
3. Execute merge (verify all data relinked)
4. Undo merge (verify data restored)
5. Verify non-admin users cannot see the button or access the API

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(patient-merge): final adjustments from smoke testing"
```
