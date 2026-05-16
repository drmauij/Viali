# Praxis Mode v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Praxis Mode v2 — let an external surgeon activate a full Viali tenant from inside `/surgeon-portal`, plan surgeries on their own OR calendar, and have surgeries scheduled in clinic-linked logical rooms auto-submit as cross-tenant referrals (with availability-overlay hard-block, questionnaire dedup, and reschedule alerting).

**Architecture:** A source hospital is a `hospitals` row with `tenant_type='praxis'` + lean addon defaults. A `surgery_rooms` row with `linked_hospital_id` set represents slots at a destination hospital. Submitting a surgery in such a room atomically creates an `external_surgery_requests` row at the destination with a `patient_snapshot` JSONB payload. Both ends are linked bidirectionally; status flows back via a server-side function (same Postgres DB). Real-time availability is queried per pairing; busy zones are hard-blocked on the source-side calendar.

**Tech Stack:** TypeScript, Node/Express, Drizzle ORM, PostgreSQL, Vitest, React (Vite), Tailwind, Resend (email), WhatsApp Business API. Project conventions: idempotent SQL migrations (`IF NOT EXISTS` + `DO $$ ... END $$`); integration tests against a real test DB; storage helpers in `server/storage/*`; route handlers in `server/routes/*`; React components in `client/src/components/*`.

**Spec:** [`docs/superpowers/specs/2026-05-16-praxis-mode-v2-design.md`](../specs/2026-05-16-praxis-mode-v2-design.md)

**Branch:** `feat/praxis-mode` (worktree at `.claude/worktrees/feat-ambulant-eligibility`; spec already committed at `c6b72e0d`)

---

## File Structure

**New files:**
- `migrations/0253_praxis_mode.sql` — schema migration
- `tests/praxis-mode-migration.test.ts` — migration idempotency
- `server/storage/praxisMode.ts` — provisioning, seeding, partnerships, status push, availability query
- `tests/praxis-mode-storage.test.ts` — storage unit/integration tests
- `tests/praxis-mode-seeding.test.ts` — seeding integration tests
- `tests/praxis-mode-referral.test.ts` — referral flow integration tests
- `tests/praxis-mode-availability.test.ts` — availability + hard-block tests
- `server/routes/praxisMode.ts` — `POST /api/surgeon-portal/praxis/activate` + acknowledge-reschedule
- `server/routes/referralPartnerships.ts` — partner CRUD + availability query
- `tests/praxis-mode-routes.test.ts` — route tests
- `client/src/components/praxis/PraxisActivationModal.tsx` — activation modal
- `client/src/components/praxis/PraxisOnboardingTour.tsx` — 4-step coachmark
- `client/src/components/praxis/PraxisDiscoveryPanel.tsx` — post-success panel
- `client/src/components/admin/ReferralPartnersCard.tsx` — partner management UI
- `client/src/components/anesthesia/AvailabilityOverlay.tsx` — busy-zone overlay

**Modified files:**
- `shared/schema.ts` — add columns + new `referralPartnerships` table
- `server/routes/index.ts` — mount new routers
- `server/routes/externalSurgery.ts` — extend accept/reject/reschedule/cancel handlers with snapshot import + status push
- `server/routes/anesthesia/surgeries.ts` — extend `POST /api/anesthesia/surgeries` to detect clinic-linked rooms + create cross-tenant external request + race-validate availability
- `client/src/components/anesthesia/QuickCreateSurgeryDialog.tsx` — add 4 patient demographic fields, conditional-required when room is clinic-linked
- `client/src/pages/SurgeonPortal.tsx` — promo card + activation modal entry
- `client/src/pages/admin/Settings.tsx` — wire up `ReferralPartnersCard` inside Links tab
- `client/src/pages/anesthesia/OpCalendar.tsx` (or equivalent calendar component — verify exact path during execution) — render `AvailabilityOverlay` for clinic-linked rooms
- `client/src/pages/Book.tsx` or `BookAppointment.tsx` (questionnaire flow — verify exact path during execution) — render "✓ from your praxis · review" badges on imported fields

---

## Phase 1 — Schema foundation

### Task 1: Migration `0253_praxis_mode.sql`

**Files:**
- Create: `migrations/0253_praxis_mode.sql`
- Modify: `migrations/meta/_journal.json` (drizzle auto-managed — verify after generation)
- Test: `tests/praxis-mode-migration.test.ts`

- [ ] **Step 1: Write the failing migration test**

```ts
// tests/praxis-mode-migration.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

const MIGRATION = path.resolve(__dirname, "../migrations/0253_praxis_mode.sql");

afterAll(async () => { await pool.end(); });

describe("0253_praxis_mode migration", () => {
  it("applies cleanly and is idempotent on re-run", async () => {
    const ddl = fs.readFileSync(MIGRATION, "utf8");
    await db.execute(sql.raw(ddl));
    await db.execute(sql.raw(ddl));

    const hospitals = await db.execute(sql.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='hospitals' AND column_name='tenant_type'`));
    expect(hospitals.rows.length).toBe(1);

    const rooms = await db.execute(sql.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='surgery_rooms' AND column_name='linked_hospital_id'`));
    expect(rooms.rows.length).toBe(1);

    const surgeries = await db.execute(sql.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='surgeries'
        AND column_name IN ('external_request_id','referral_status','referral_note',
                            'last_clinic_reschedule_at','reschedule_acknowledged_at','reschedule_history')`));
    expect(surgeries.rows.length).toBe(6);

    const reqs = await db.execute(sql.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='external_surgery_requests'
        AND column_name IN ('source_hospital_id','source_surgery_id','patient_snapshot')`));
    expect(reqs.rows.length).toBe(3);

    const qresp = await db.execute(sql.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='patient_questionnaire_responses'
        AND column_name IN ('imported_from_praxis','imported_from_praxis_at','imported_field_sources')`));
    expect(qresp.rows.length).toBe(3);

    const table = await db.execute(sql.raw(`
      SELECT table_name FROM information_schema.tables WHERE table_name='referral_partnerships'`));
    expect(table.rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-migration.test.ts`
Expected: FAIL — migration file does not exist (ENOENT).

- [ ] **Step 3: Write the migration**

```sql
-- migrations/0253_praxis_mode.sql
-- Praxis Mode v2: room-based cross-tenant referrals + availability + reschedule alerting.

-- 1. hospitals.tenant_type (clinic | praxis)
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS tenant_type VARCHAR DEFAULT 'clinic';

-- 2. surgery_rooms.linked_hospital_id — non-null marks a room as a logical/external room
ALTER TABLE surgery_rooms ADD COLUMN IF NOT EXISTS linked_hospital_id VARCHAR;

CREATE INDEX IF NOT EXISTS idx_surgery_rooms_linked_hospital ON surgery_rooms(linked_hospital_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'surgery_rooms_linked_hospital_id_hospitals_id_fk'
      AND conrelid = 'surgery_rooms'::regclass
  ) THEN
    ALTER TABLE surgery_rooms
      ADD CONSTRAINT surgery_rooms_linked_hospital_id_hospitals_id_fk
      FOREIGN KEY (linked_hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. surgeries: cross-tenant referral + reschedule fields
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS external_request_id VARCHAR;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS referral_status VARCHAR DEFAULT 'local';
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS referral_note TEXT;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS last_clinic_reschedule_at TIMESTAMP;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS reschedule_acknowledged_at TIMESTAMP;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS reschedule_history JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_surgeries_external_request_id ON surgeries(external_request_id);
CREATE INDEX IF NOT EXISTS idx_surgeries_referral_status ON surgeries(referral_status);

-- 4. external_surgery_requests: source back-references + snapshot
ALTER TABLE external_surgery_requests ADD COLUMN IF NOT EXISTS source_hospital_id VARCHAR;
ALTER TABLE external_surgery_requests ADD COLUMN IF NOT EXISTS source_surgery_id VARCHAR;
ALTER TABLE external_surgery_requests ADD COLUMN IF NOT EXISTS patient_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_external_surgery_requests_source_hospital_id
  ON external_surgery_requests(source_hospital_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'external_surgery_requests_source_hospital_id_hospitals_id_fk'
      AND conrelid = 'external_surgery_requests'::regclass
  ) THEN
    ALTER TABLE external_surgery_requests
      ADD CONSTRAINT external_surgery_requests_source_hospital_id_hospitals_id_fk
      FOREIGN KEY (source_hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. patient_questionnaire_responses: praxis-import provenance
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS imported_from_praxis BOOLEAN DEFAULT false;
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS imported_from_praxis_at TIMESTAMP;
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS imported_field_sources JSONB;

-- 6. referral_partnerships — replaces the original clinic_pairings idea
CREATE TABLE IF NOT EXISTS referral_partnerships (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  source_hospital_id VARCHAR NOT NULL,
  destination_hospital_id VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'active',
  pairing_source VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_partnerships_source ON referral_partnerships(source_hospital_id);
CREATE INDEX IF NOT EXISTS idx_referral_partnerships_destination ON referral_partnerships(destination_hospital_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referral_partnerships_unique_pair'
      AND conrelid = 'referral_partnerships'::regclass
  ) THEN
    ALTER TABLE referral_partnerships ADD CONSTRAINT referral_partnerships_unique_pair
      UNIQUE (source_hospital_id, destination_hospital_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referral_partnerships_source_hospital_id_hospitals_id_fk'
      AND conrelid = 'referral_partnerships'::regclass
  ) THEN
    ALTER TABLE referral_partnerships ADD CONSTRAINT referral_partnerships_source_hospital_id_hospitals_id_fk
      FOREIGN KEY (source_hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referral_partnerships_destination_hospital_id_hospitals_id_fk'
      AND conrelid = 'referral_partnerships'::regclass
  ) THEN
    ALTER TABLE referral_partnerships ADD CONSTRAINT referral_partnerships_destination_hospital_id_hospitals_id_fk
      FOREIGN KEY (destination_hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE;
  END IF;
END $$;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/praxis-mode-migration.test.ts`
Expected: PASS — every assertion holds, second migration application is a no-op.

- [ ] **Step 5: Apply to dev DB**

Run: `npx drizzle-kit push` — should report "Changes applied" with no pending diffs.

- [ ] **Step 6: Verify `_journal.json` entry**

Open `migrations/meta/_journal.json`. Confirm the entry for `0253_praxis_mode` has a `when` timestamp greater than every prior entry's `when` value (Drizzle's `migrate()` orders by timestamp, not index).

- [ ] **Step 7: Commit**

```bash
git add -f migrations/0253_praxis_mode.sql migrations/meta/_journal.json tests/praxis-mode-migration.test.ts
git commit -m "feat(schema): praxis mode v2 columns + referral_partnerships (migration 0253)"
```

---

### Task 2: Drizzle schema additions

**Files:**
- Modify: `shared/schema.ts`

- [ ] **Step 1: Add `tenantType` to `hospitals`**

Find the `hospitals` table definition. Add the following column alongside existing columns:

```ts
tenantType: varchar("tenant_type").default("clinic"), // 'clinic' | 'praxis'
```

- [ ] **Step 2: Add `linkedHospitalId` to `surgeryRooms`**

In `surgeryRooms` definition (around line 328 of `shared/schema.ts`), add:

```ts
linkedHospitalId: varchar("linked_hospital_id").references(() => hospitals.id, { onDelete: "set null" }),
// If non-null, this room represents slots at the linked destination hospital (cross-tenant referrals)
```

Also add the index to the table options array:

```ts
index("idx_surgery_rooms_linked_hospital").on(table.linkedHospitalId),
```

- [ ] **Step 3: Add cross-tenant + reschedule fields to `surgeries`**

In the `surgeries` table definition (around line 1172), add (among existing fields):

```ts
externalRequestId: varchar("external_request_id"), // No FK — cross-tenant link
referralStatus: varchar("referral_status").default("local"),
// 'local' | 'pending_external' | 'confirmed_external' | 'rejected_external' | 'cancelled_external'
referralNote: text("referral_note"),
lastClinicRescheduleAt: timestamp("last_clinic_reschedule_at"),
rescheduleAcknowledgedAt: timestamp("reschedule_acknowledged_at"),
rescheduleHistory: jsonb("reschedule_history").default(sql`'[]'::jsonb`),
```

- [ ] **Step 4: Add source + snapshot fields to `externalSurgeryRequests`**

In the `externalSurgeryRequests` table definition (around line 5642), add:

```ts
sourceHospitalId: varchar("source_hospital_id").references(() => hospitals.id, { onDelete: "set null" }),
sourceSurgeryId: varchar("source_surgery_id"), // No FK — cross-tenant link
patientSnapshot: jsonb("patient_snapshot"),
```

- [ ] **Step 5: Add provenance fields to `patientQuestionnaireResponses`**

Find the `patientQuestionnaireResponses` table definition. Add:

```ts
importedFromPraxis: boolean("imported_from_praxis").default(false),
importedFromPraxisAt: timestamp("imported_from_praxis_at"),
importedFieldSources: jsonb("imported_field_sources"),
// e.g. { allergies: 'source_referral', medications: 'source_referral' }
```

- [ ] **Step 6: Define `referralPartnerships` table**

Add a new export near the other table definitions:

```ts
export const referralPartnerships = pgTable("referral_partnerships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceHospitalId: varchar("source_hospital_id").notNull()
    .references(() => hospitals.id, { onDelete: "cascade" }),
  destinationHospitalId: varchar("destination_hospital_id").notNull()
    .references(() => hospitals.id, { onDelete: "cascade" }),
  status: varchar("status").notNull().default("active"),
  // 'active' | 'pending' | 'suspended' | 'revoked'
  pairingSource: varchar("pairing_source").notNull(),
  // 'auto_on_provision' | 'historical_import' | 'manual_code'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_referral_partnerships_source").on(table.sourceHospitalId),
  index("idx_referral_partnerships_destination").on(table.destinationHospitalId),
  uniqueIndex("referral_partnerships_unique_pair").on(table.sourceHospitalId, table.destinationHospitalId),
]);
```

- [ ] **Step 7: Run typecheck**

Run: `npm run check`
Expected: PASS — no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(schema): praxis mode v2 drizzle schema additions"
```

---

## Phase 2 — Storage helpers

### Task 3: Source hospital provisioning + addon defaults

**Files:**
- Create: `server/storage/praxisMode.ts`
- Test: `tests/praxis-mode-storage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/praxis-mode-storage.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { hospitals, users, userHospitalRoles, referralPartnerships } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { provisionSourceHospital } from "../server/storage/praxisMode";

const created = { hospitals: [] as string[], users: [] as string[] };
afterAll(async () => {
  if (created.hospitals.length) await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  await pool.end();
});

async function makeDestination(name: string) {
  const [h] = await db.insert(hospitals).values({ name, tenantType: "clinic" }).returning();
  created.hospitals.push(h.id);
  return h;
}
async function makeSurgeon(email: string) {
  const [u] = await db.insert(users).values({ email, firstName: "Test", lastName: "Surg" }).returning();
  created.users.push(u.id);
  return u;
}

describe("provisionSourceHospital", () => {
  it("creates a source hospital with tenant_type='praxis', binds surgeon as admin, auto-pairs originating destination", async () => {
    const dest = await makeDestination(`Dest ${Date.now()}`);
    const surgeon = await makeSurgeon(`s-${Date.now()}@t.local`);

    const result = await provisionSourceHospital({
      surgeonUserId: surgeon.id,
      originatingDestinationId: dest.id,
      sourceName: "Praxis Mueller",
    });
    created.hospitals.push(result.sourceHospitalId);

    const [src] = await db.select().from(hospitals).where(eq(hospitals.id, result.sourceHospitalId));
    expect(src.tenantType).toBe("praxis");
    expect(src.name).toBe("Praxis Mueller");

    const roles = await db.select().from(userHospitalRoles)
      .where(eq(userHospitalRoles.hospitalId, result.sourceHospitalId));
    expect(roles.length).toBe(1);
    expect(roles[0].userId).toBe(surgeon.id);
    expect(roles[0].role).toBe("admin");

    const pair = await db.select().from(referralPartnerships)
      .where(eq(referralPartnerships.sourceHospitalId, result.sourceHospitalId));
    expect(pair.length).toBe(1);
    expect(pair[0].destinationHospitalId).toBe(dest.id);
    expect(pair[0].status).toBe("active");
    expect(pair[0].pairingSource).toBe("auto_on_provision");
  });

  it("applies lean addon defaults — addonSurgery off, addonClinic on, addonAmbulantEligibility on", async () => {
    const dest = await makeDestination(`Dest ${Date.now()}-b`);
    const surgeon = await makeSurgeon(`s-${Date.now()}-b@t.local`);
    const result = await provisionSourceHospital({
      surgeonUserId: surgeon.id, originatingDestinationId: dest.id, sourceName: "P2",
    });
    created.hospitals.push(result.sourceHospitalId);
    const [src] = await db.select().from(hospitals).where(eq(hospitals.id, result.sourceHospitalId));
    expect(src.addonClinic).toBe(true);
    expect(src.addonQuestionnaire).toBe(true);
    expect(src.addonAmbulantEligibility).toBe(true);
    expect(src.addonSurgery).toBe(false);
    expect(src.addonMonitor).toBe(false);
    expect(src.addonLogistics).toBe(false);
  });

  it("is atomic — failure leaves no orphan hospital", async () => {
    const dest = await makeDestination(`Dest ${Date.now()}-c`);
    await expect(provisionSourceHospital({
      surgeonUserId: "non-existent-user-id",
      originatingDestinationId: dest.id,
      sourceName: "Will Fail",
    })).rejects.toThrow();
    const orphan = await db.select().from(hospitals).where(eq(hospitals.name, "Will Fail"));
    expect(orphan.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-storage.test.ts -t provisionSourceHospital`
Expected: FAIL — `provisionSourceHospital` not exported.

- [ ] **Step 3: Implement `provisionSourceHospital`**

```ts
// server/storage/praxisMode.ts
import { db } from "../db";
import { hospitals, userHospitalRoles, referralPartnerships } from "@shared/schema";

export const PRAXIS_ADDON_DEFAULTS = {
  addonClinic: true,
  addonQuestionnaire: true,
  addonAmbulantEligibility: true,
  addonPatientChat: true,
  addonSurgery: false,
  addonMonitor: false,
  addonLogistics: false,
  addonWorktime: false,
  addonRetell: false,
  addonDispocura: false,
} as const;

export interface ProvisionSourceInput {
  surgeonUserId: string;
  originatingDestinationId: string;
  sourceName: string;
  profile?: { address?: string; phone?: string; timezone?: string; locale?: string };
}

export interface ProvisionSourceResult {
  sourceHospitalId: string;
  partnershipId: string;
}

export async function provisionSourceHospital(input: ProvisionSourceInput): Promise<ProvisionSourceResult> {
  return await db.transaction(async (tx) => {
    const [src] = await tx.insert(hospitals).values({
      name: input.sourceName,
      tenantType: "praxis",
      address: input.profile?.address,
      phone: input.profile?.phone,
      timezone: input.profile?.timezone ?? "Europe/Zurich",
      locale: input.profile?.locale ?? "de-CH",
      ...PRAXIS_ADDON_DEFAULTS,
    }).returning();

    await tx.insert(userHospitalRoles).values({
      userId: input.surgeonUserId,
      hospitalId: src.id,
      role: "admin",
    });

    const [pair] = await tx.insert(referralPartnerships).values({
      sourceHospitalId: src.id,
      destinationHospitalId: input.originatingDestinationId,
      status: "active",
      pairingSource: "auto_on_provision",
    }).returning();

    return { sourceHospitalId: src.id, partnershipId: pair.id };
  });
}
```

> **Note on `hospitals` columns:** if `address`, `phone`, `timezone`, or `locale` don't exist with those names, omit them — function only needs `name` and `tenantType` to satisfy tests. Verify column names by reading `shared/schema.ts` first.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/praxis-mode-storage.test.ts -t provisionSourceHospital`
Expected: PASS — all three sub-tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/storage/praxisMode.ts tests/praxis-mode-storage.test.ts
git commit -m "feat(storage): provisionSourceHospital — atomic source-hospital + admin role + auto-pair"
```

---

### Task 4: Referral partnership helpers

**Files:**
- Modify: `server/storage/praxisMode.ts`
- Modify: `tests/praxis-mode-storage.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `tests/praxis-mode-storage.test.ts`:

```ts
import {
  listPartnerships,
  generatePartnershipCode,
  redeemPartnershipCode,
  approvePartnership,
  rejectPartnership,
  revokePartnership,
} from "../server/storage/praxisMode";

describe("referral partnership helpers", () => {
  it("listPartnerships returns active partnerships only, joined with destination hospital data", async () => {
    const d1 = await makeDestination(`A ${Date.now()}`);
    const d2 = await makeDestination(`B ${Date.now()}`);
    const s = await makeSurgeon(`p-list-${Date.now()}@t.local`);
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: s.id, originatingDestinationId: d1.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);

    await db.insert(referralPartnerships).values({
      sourceHospitalId, destinationHospitalId: d2.id, status: "revoked", pairingSource: "manual_code",
    });

    const list = await listPartnerships(sourceHospitalId);
    expect(list.length).toBe(1);
    expect(list[0].destinationHospitalId).toBe(d1.id);
    expect(list[0].destinationName).toBe(d1.name);
  });

  it("generate -> redeem -> approve completes a manual pairing", async () => {
    const dest = await makeDestination(`Dest ${Date.now()}`);
    const s = await makeSurgeon(`p-code-${Date.now()}@t.local`);
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: s.id, originatingDestinationId: dest.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);

    const newDest = await makeDestination(`NewDest ${Date.now()}`);
    const code = await generatePartnershipCode(newDest.id);
    expect(code).toMatch(/^[A-Z0-9]{8}$/);

    const pending = await redeemPartnershipCode({ sourceHospitalId, code });
    expect(pending.status).toBe("pending");

    await approvePartnership({ partnershipId: pending.id, approverDestinationId: newDest.id });

    const list = await listPartnerships(sourceHospitalId);
    expect(list.map(p => p.destinationHospitalId).sort()).toEqual([dest.id, newDest.id].sort());
  });

  it("redeem rejects an unknown code", async () => {
    const dest = await makeDestination(`Dest ${Date.now()}`);
    const s = await makeSurgeon(`p-bad-${Date.now()}@t.local`);
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: s.id, originatingDestinationId: dest.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);
    await expect(redeemPartnershipCode({ sourceHospitalId, code: "ZZZZZZZZ" }))
      .rejects.toThrow(/unknown pairing code/i);
  });

  it("rejectPartnership marks status revoked", async () => {
    const dest = await makeDestination(`Dest ${Date.now()}`);
    const s = await makeSurgeon(`p-rej-${Date.now()}@t.local`);
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: s.id, originatingDestinationId: dest.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);

    const newDest = await makeDestination(`Other ${Date.now()}`);
    const code = await generatePartnershipCode(newDest.id);
    const pending = await redeemPartnershipCode({ sourceHospitalId, code });
    await rejectPartnership({ partnershipId: pending.id, approverDestinationId: newDest.id });

    const [row] = await db.select().from(referralPartnerships).where(eq(referralPartnerships.id, pending.id));
    expect(row.status).toBe("revoked");
  });

  it("revokePartnership flips status to revoked but keeps the row", async () => {
    const dest = await makeDestination(`Dest ${Date.now()}`);
    const s = await makeSurgeon(`p-rev-${Date.now()}@t.local`);
    const { sourceHospitalId, partnershipId } = await provisionSourceHospital({
      surgeonUserId: s.id, originatingDestinationId: dest.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);

    await revokePartnership({ partnershipId, actor: "source" });
    const [row] = await db.select().from(referralPartnerships).where(eq(referralPartnerships.id, partnershipId));
    expect(row.status).toBe("revoked");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/praxis-mode-storage.test.ts -t "referral partnership"`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement the partnership helpers**

Append to `server/storage/praxisMode.ts`:

```ts
import { eq, and } from "drizzle-orm";
import { hospitals as hospitalsTable, referralPartnerships as rp } from "@shared/schema";
import crypto from "crypto";

// Short-lived in-memory store; v2+ can persist to Redis or DB.
const PARTNERSHIP_CODE_TTL_MS = 30 * 60 * 1000;
const partnershipCodes = new Map<string, { destinationHospitalId: string; expiresAt: number }>();

export async function generatePartnershipCode(destinationHospitalId: string): Promise<string> {
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  partnershipCodes.set(code, { destinationHospitalId, expiresAt: Date.now() + PARTNERSHIP_CODE_TTL_MS });
  return code;
}

export async function listPartnerships(sourceHospitalId: string) {
  return await db.select({
    id: rp.id,
    destinationHospitalId: rp.destinationHospitalId,
    status: rp.status,
    pairingSource: rp.pairingSource,
    createdAt: rp.createdAt,
    destinationName: hospitalsTable.name,
  })
  .from(rp)
  .leftJoin(hospitalsTable, eq(rp.destinationHospitalId, hospitalsTable.id))
  .where(and(eq(rp.sourceHospitalId, sourceHospitalId), eq(rp.status, "active")));
}

export async function redeemPartnershipCode(input: { sourceHospitalId: string; code: string }) {
  const entry = partnershipCodes.get(input.code);
  if (!entry || entry.expiresAt < Date.now()) {
    partnershipCodes.delete(input.code);
    throw new Error(`unknown pairing code: ${input.code}`);
  }
  partnershipCodes.delete(input.code);
  const [pair] = await db.insert(rp).values({
    sourceHospitalId: input.sourceHospitalId,
    destinationHospitalId: entry.destinationHospitalId,
    status: "pending",
    pairingSource: "manual_code",
  }).returning();
  return pair;
}

export async function approvePartnership(input: { partnershipId: string; approverDestinationId: string }) {
  const [pair] = await db.select().from(rp).where(eq(rp.id, input.partnershipId));
  if (!pair) throw new Error("partnership not found");
  if (pair.destinationHospitalId !== input.approverDestinationId) throw new Error("not authorized to approve");
  await db.update(rp).set({ status: "active" }).where(eq(rp.id, input.partnershipId));
}

export async function rejectPartnership(input: { partnershipId: string; approverDestinationId: string }) {
  const [pair] = await db.select().from(rp).where(eq(rp.id, input.partnershipId));
  if (!pair) throw new Error("partnership not found");
  if (pair.destinationHospitalId !== input.approverDestinationId) throw new Error("not authorized to reject");
  await db.update(rp).set({ status: "revoked" }).where(eq(rp.id, input.partnershipId));
}

export async function revokePartnership(input: { partnershipId: string; actor: "source" | "destination" }) {
  await db.update(rp).set({ status: "revoked" }).where(eq(rp.id, input.partnershipId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/praxis-mode-storage.test.ts -t "referral partnership"`
Expected: PASS — all sub-tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/storage/praxisMode.ts tests/praxis-mode-storage.test.ts
git commit -m "feat(storage): referral partnership helpers (list/generate/redeem/approve/reject/revoke)"
```

---

### Task 5: Seeding helper (includes slot reservations + multi-destination auto-pair)

**Files:**
- Modify: `server/storage/praxisMode.ts`
- Create: `tests/praxis-mode-seeding.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/praxis-mode-seeding.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { hospitals, users, surgeries, externalSurgeryRequests, patients, referralPartnerships, surgeryRooms } from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";
import { provisionSourceHospital, backfillReferralHistory } from "../server/storage/praxisMode";

const created = { hospitals: [] as string[], users: [] as string[], surgeries: [] as string[], requests: [] as string[], patients: [] as string[] };
afterAll(async () => {
  if (created.surgeries.length) await db.delete(surgeries).where(inArray(surgeries.id, created.surgeries));
  if (created.requests.length) await db.delete(externalSurgeryRequests).where(inArray(externalSurgeryRequests.id, created.requests));
  if (created.patients.length) await db.delete(patients).where(inArray(patients.id, created.patients));
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  if (created.hospitals.length) await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  await pool.end();
});

describe("backfillReferralHistory", () => {
  it("creates source-side surgeries + patients for each external request, auto-pairs all historical destinations, imports slot reservations, idempotent", async () => {
    const [d1] = await db.insert(hospitals).values({ name: `D1 ${Date.now()}`, tenantType: "clinic" }).returning();
    const [d2] = await db.insert(hospitals).values({ name: `D2 ${Date.now()}`, tenantType: "clinic" }).returning();
    created.hospitals.push(d1.id, d2.id);
    const [surgeon] = await db.insert(users).values({ email: `bf-${Date.now()}@t.local`, firstName: "X", lastName: "Y" }).returning();
    created.users.push(surgeon.id);

    // seed 2 prior requests in d1, 1 in d2, plus one slot reservation in d1
    const seed = await db.insert(externalSurgeryRequests).values([
      { hospitalId: d1.id, surgeonId: surgeon.id,
        surgeonFirstName: "X", surgeonLastName: "Y", surgeonEmail: surgeon.email!, surgeonPhone: "+41",
        patientFirstName: "A", patientLastName: "One",
        surgeryDurationMinutes: 60, status: "scheduled", wishedDate: new Date(Date.now() - 24*3600*1000) },
      { hospitalId: d1.id, surgeonId: surgeon.id,
        surgeonFirstName: "X", surgeonLastName: "Y", surgeonEmail: surgeon.email!, surgeonPhone: "+41",
        patientFirstName: "B", patientLastName: "Two",
        surgeryDurationMinutes: 60, status: "pending", wishedDate: new Date(Date.now() + 7*24*3600*1000) },
      { hospitalId: d2.id, surgeonId: surgeon.id,
        surgeonFirstName: "X", surgeonLastName: "Y", surgeonEmail: surgeon.email!, surgeonPhone: "+41",
        patientFirstName: "C", patientLastName: "Three",
        surgeryDurationMinutes: 90, status: "scheduled", wishedDate: new Date(Date.now() + 14*24*3600*1000) },
      // slot reservation (no patient name)
      { hospitalId: d1.id, surgeonId: surgeon.id,
        surgeonFirstName: "X", surgeonLastName: "Y", surgeonEmail: surgeon.email!, surgeonPhone: "+41",
        isReservationOnly: true,
        surgeryDurationMinutes: 60, status: "pending", wishedDate: new Date(Date.now() + 21*24*3600*1000) },
    ]).returning();
    created.requests.push(...seed.map(s => s.id));

    // Provision (auto-pairs only d1 — the originating clinic)
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: surgeon.id, originatingDestinationId: d1.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);

    // Backfill — should auto-pair d2 too + create rooms + import surgeries
    const r1 = await backfillReferralHistory({ sourceHospitalId, surgeonUserId: surgeon.id });
    expect(r1.surgeriesCreated).toBe(4);   // 3 patient surgeries + 1 reservation
    expect(r1.patientsCreated).toBe(3);    // 3 real patients (reservation has no patient)
    expect(r1.destinationsPaired).toBe(1); // d2 auto-paired now (d1 was already paired at provision)

    const pairs = await db.select().from(referralPartnerships)
      .where(eq(referralPartnerships.sourceHospitalId, sourceHospitalId));
    expect(pairs.length).toBe(2);
    const d2Pair = pairs.find(p => p.destinationHospitalId === d2.id);
    expect(d2Pair?.pairingSource).toBe("historical_import");

    const rooms = await db.select().from(surgeryRooms)
      .where(and(eq(surgeryRooms.hospitalId, sourceHospitalId)));
    expect(rooms.length).toBe(2);
    expect(rooms.every(r => r.linkedHospitalId)).toBe(true);

    const surgs = await db.select().from(surgeries).where(eq(surgeries.hospitalId, sourceHospitalId));
    created.surgeries.push(...surgs.map(s => s.id));
    expect(surgs.length).toBe(4);
    expect(surgs.filter(s => s.patientId === null).length).toBe(1); // slot reservation
    expect(surgs.map(s => s.referralStatus).filter(s => s).sort()).toEqual(
      ["confirmed_external", "confirmed_external", "pending_external", "pending_external"]
    );

    const pts = await db.select().from(patients).where(eq(patients.hospitalId, sourceHospitalId));
    created.patients.push(...pts.map(p => p.id));
    expect(pts.length).toBe(3);

    // Idempotency
    const r2 = await backfillReferralHistory({ sourceHospitalId, surgeonUserId: surgeon.id });
    expect(r2.surgeriesCreated).toBe(0);
    expect(r2.patientsCreated).toBe(0);
    expect(r2.destinationsPaired).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-seeding.test.ts`
Expected: FAIL — `backfillReferralHistory` not exported.

- [ ] **Step 3: Implement `backfillReferralHistory`**

Append to `server/storage/praxisMode.ts`:

```ts
import { externalSurgeryRequests, surgeries, patients, surgeryRooms } from "@shared/schema";

function mapRequestStatusToReferralStatus(reqStatus?: string | null): string {
  switch ((reqStatus ?? "").toLowerCase()) {
    case "scheduled":   return "confirmed_external";
    case "declined":    return "rejected_external";
    case "pending":
    default:            return "pending_external";
  }
}

export interface BackfillResult {
  surgeriesCreated: number;
  patientsCreated: number;
  destinationsPaired: number;
}

export async function backfillReferralHistory(input: {
  sourceHospitalId: string;
  surgeonUserId: string;
  sinceYears?: number;
}): Promise<BackfillResult> {
  const since = (input.sinceYears ?? 5);
  const cutoff = new Date(Date.now() - since * 365 * 24 * 3600 * 1000);

  // Pull all eligible requests
  const reqs = await db.select().from(externalSurgeryRequests).where(and(
    eq(externalSurgeryRequests.surgeonId, input.surgeonUserId),
  ));
  const eligible = reqs.filter(r => !r.wishedDate || new Date(r.wishedDate) >= cutoff);

  // Auto-pair every distinct destination + create logical room
  const destIds = Array.from(new Set(eligible.map(r => r.hospitalId)));
  let destinationsPaired = 0;
  for (const destId of destIds) {
    const [existing] = await db.select().from(referralPartnerships).where(and(
      eq(referralPartnerships.sourceHospitalId, input.sourceHospitalId),
      eq(referralPartnerships.destinationHospitalId, destId),
    ));
    if (existing) continue;
    await db.insert(referralPartnerships).values({
      sourceHospitalId: input.sourceHospitalId,
      destinationHospitalId: destId,
      status: "active",
      pairingSource: "historical_import",
    });
    const [dest] = await db.select().from(hospitalsTable).where(eq(hospitalsTable.id, destId));
    if (dest) {
      await db.insert(surgeryRooms).values({
        hospitalId: input.sourceHospitalId,
        name: dest.name,
        type: "OP",
        linkedHospitalId: destId,
      });
    }
    destinationsPaired++;
  }

  // Ensure the originating destination also has a room (auto-pair from provisioning didn't create it)
  const [origPair] = await db.select().from(referralPartnerships).where(and(
    eq(referralPartnerships.sourceHospitalId, input.sourceHospitalId),
    eq(referralPartnerships.pairingSource, "auto_on_provision"),
  ));
  if (origPair) {
    const [hasRoom] = await db.select().from(surgeryRooms).where(and(
      eq(surgeryRooms.hospitalId, input.sourceHospitalId),
      eq(surgeryRooms.linkedHospitalId, origPair.destinationHospitalId),
    ));
    if (!hasRoom) {
      const [dest] = await db.select().from(hospitalsTable).where(eq(hospitalsTable.id, origPair.destinationHospitalId));
      if (dest) {
        await db.insert(surgeryRooms).values({
          hospitalId: input.sourceHospitalId, name: dest.name, type: "OP", linkedHospitalId: dest.id,
        });
      }
    }
  }

  // Now seed surgeries (with patient dedup)
  let surgeriesCreated = 0;
  let patientsCreated = 0;

  for (const req of eligible) {
    // Idempotency
    const [exists] = await db.select({ id: surgeries.id }).from(surgeries).where(and(
      eq(surgeries.hospitalId, input.sourceHospitalId),
      eq(surgeries.externalRequestId, req.id),
    ));
    if (exists) continue;

    // Find the logical room
    const [room] = await db.select().from(surgeryRooms).where(and(
      eq(surgeryRooms.hospitalId, input.sourceHospitalId),
      eq(surgeryRooms.linkedHospitalId, req.hospitalId),
    ));
    if (!room) continue; // skip if no room (shouldn't happen)

    // Patient dedup (skip for reservations)
    let patientId: string | null = null;
    if (!req.isReservationOnly && req.patientFirstName && req.patientLastName) {
      const dedupConds = [
        eq(patients.hospitalId, input.sourceHospitalId),
        eq(patients.firstName, req.patientFirstName),
        eq(patients.surname, req.patientLastName),
      ];
      if (req.patientBirthday) dedupConds.push(eq(patients.birthday, req.patientBirthday as any));
      const [existingPt] = await db.select().from(patients).where(and(...dedupConds));
      if (existingPt) {
        patientId = existingPt.id;
      } else {
        const [pt] = await db.insert(patients).values({
          hospitalId: input.sourceHospitalId,
          firstName: req.patientFirstName,
          surname: req.patientLastName,
          birthday: req.patientBirthday as any,
          sex: "O",
          email: req.patientEmail,
          phone: req.patientPhone,
          street: req.patientStreet,
          postalCode: req.patientPostalCode,
          city: req.patientCity,
        } as any).returning();
        patientId = pt.id;
        patientsCreated++;
      }
    }

    const plannedDate = req.wishedDate
      ? new Date(`${req.wishedDate}T${String(Math.floor((req.wishedTimeFrom ?? 720)/60)).padStart(2,'0')}:${String((req.wishedTimeFrom ?? 720)%60).padStart(2,'0')}:00`)
      : new Date();

    await db.insert(surgeries).values({
      hospitalId: input.sourceHospitalId,
      patientId: patientId,
      surgeryRoomId: room.id,
      plannedDate,
      plannedSurgery: req.surgeryName,
      chopCode: req.chopCode,
      surgerySide: req.surgerySide,
      antibioseProphylaxe: req.antibioseProphylaxe ?? false,
      diagnosis: req.diagnosis,
      anesthesiaNotes: req.anesthesiaNotes,
      notes: req.surgeryNotes,
      coverageType: req.coverageType,
      stayType: req.stayType,
      surgeryRiskClass: req.surgeryRiskClass as any,
      patientPosition: req.patientPosition as any,
      leftArmPosition: req.leftArmPosition as any,
      rightArmPosition: req.rightArmPosition as any,
      noPreOpRequired: !(req.withAnesthesia ?? true),
      surgeonId: input.surgeonUserId,
      externalRequestId: req.id,
      referralStatus: mapRequestStatusToReferralStatus(req.status),
      status: "planned",
      planningStatus: "pre-registered",
    } as any);
    surgeriesCreated++;
  }

  return { surgeriesCreated, patientsCreated, destinationsPaired };
}
```

> **Note on column names:** verify exact names (`patients.surname` vs `lastName`, etc.) by reading `shared/schema.ts:923`. Adjust property names in the insert as needed — mapping logic is the contract.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/praxis-mode-seeding.test.ts`
Expected: PASS — backfill creates rows; second run is no-op; slot reservations have NULL patient_id.

- [ ] **Step 5: Commit**

```bash
git add server/storage/praxisMode.ts tests/praxis-mode-seeding.test.ts
git commit -m "feat(storage): idempotent backfill — historical surgeries + reservations + auto-pair"
```

---

## Phase 3 — Cross-tenant referral mechanic

### Task 6: Extend `POST /api/anesthesia/surgeries` to handle clinic-linked rooms

**Files:**
- Modify: `server/routes/anesthesia/surgeries.ts:444`
- Modify: `server/storage/praxisMode.ts` (add `createCrossTenantReferral` + `validateAvailability`)
- Create: `tests/praxis-mode-referral.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/praxis-mode-referral.test.ts
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server/app";
import { db, pool } from "../server/db";
import { hospitals, users, userHospitalRoles, patients, surgeries, externalSurgeryRequests, referralPartnerships, surgeryRooms } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { provisionSourceHospital, backfillReferralHistory } from "../server/storage/praxisMode";

const created = { hospitals: [] as string[], users: [] as string[], surgeries: [] as string[], requests: [] as string[], patients: [] as string[] };
afterAll(async () => {
  if (created.surgeries.length) await db.delete(surgeries).where(inArray(surgeries.id, created.surgeries));
  if (created.requests.length) await db.delete(externalSurgeryRequests).where(inArray(externalSurgeryRequests.id, created.requests));
  if (created.patients.length) await db.delete(patients).where(inArray(patients.id, created.patients));
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  if (created.hospitals.length) await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  await pool.end();
});

async function setup() {
  const [dest] = await db.insert(hospitals).values({ name: `D ${Date.now()}`, tenantType: "clinic" }).returning();
  created.hospitals.push(dest.id);
  const [surgeon] = await db.insert(users).values({
    email: `r-${Date.now()}@t.local`, firstName: "R", lastName: "S", phone: "+41 79 000 00 00"
  }).returning();
  created.users.push(surgeon.id);
  await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: dest.id, role: "external_surgeon" });

  const { sourceHospitalId } = await provisionSourceHospital({
    surgeonUserId: surgeon.id, originatingDestinationId: dest.id, sourceName: "P",
  });
  created.hospitals.push(sourceHospitalId);
  await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: sourceHospitalId, role: "admin" });

  // Manually create the room (Task 5's backfill would do this; here we shortcut)
  const [room] = await db.insert(surgeryRooms).values({
    hospitalId: sourceHospitalId, name: dest.name, type: "OP", linkedHospitalId: dest.id,
  }).returning();

  const [pt] = await db.insert(patients).values({
    hospitalId: sourceHospitalId, firstName: "Petra", surname: "Hofer",
    birthday: "1985-03-12", sex: "F", email: "p@t.local", phone: "+41 79 111 11 11",
    street: "Bahnhofstr. 1", postalCode: "8001", city: "Zürich",
  } as any).returning();
  created.patients.push(pt.id);

  return { dest, surgeon, sourceHospitalId, room, patient: pt };
}

describe("POST /api/anesthesia/surgeries — clinic-linked room creates cross-tenant referral", () => {
  it("creates source surgery + destination external_surgery_request with snapshot, bidirectionally linked", async () => {
    const { dest, surgeon, sourceHospitalId, room, patient } = await setup();
    const plannedDate = new Date(Date.now() + 14 * 24 * 3600 * 1000);

    const res = await request(app)
      .post("/api/anesthesia/surgeries")
      .set("x-test-user-id", surgeon.id)
      .set("x-test-hospital-id", sourceHospitalId)
      .send({
        patientId: patient.id,
        surgeryRoomId: room.id,
        plannedDate: plannedDate.toISOString(),
        plannedSurgery: "Septoplasty",
        diagnosis: "Chronic nasal obstruction",
        coverageType: "Krankenkasse",
        stayType: "ambulant",
        surgeryRiskClass: "standard",
        consentGiven: true,
      });
    expect(res.status).toBe(200);
    created.surgeries.push(res.body.id);

    const [s] = await db.select().from(surgeries).where(eq(surgeries.id, res.body.id));
    expect(s.referralStatus).toBe("pending_external");
    expect(s.externalRequestId).toBeTruthy();

    const [r] = await db.select().from(externalSurgeryRequests)
      .where(eq(externalSurgeryRequests.id, s.externalRequestId!));
    created.requests.push(r.id);
    expect(r.hospitalId).toBe(dest.id);
    expect(r.sourceHospitalId).toBe(sourceHospitalId);
    expect(r.sourceSurgeryId).toBe(s.id);
    expect(r.patientSnapshot).toBeTruthy();
    expect((r.patientSnapshot as any).demographics.firstName).toBe("Petra");
    expect((r.patientSnapshot as any).consents.given).toBe(true);
  });

  it("rejects when destination has no active partnership with source", async () => {
    const { sourceHospitalId, room, patient, surgeon } = await setup();
    // Revoke the partnership
    await db.update(referralPartnerships).set({ status: "revoked" })
      .where(eq(referralPartnerships.sourceHospitalId, sourceHospitalId));

    const res = await request(app)
      .post("/api/anesthesia/surgeries")
      .set("x-test-user-id", surgeon.id)
      .set("x-test-hospital-id", sourceHospitalId)
      .send({
        patientId: patient.id,
        surgeryRoomId: room.id,
        plannedDate: new Date().toISOString(),
        plannedSurgery: "X",
        consentGiven: true,
      });
    expect(res.status).toBe(403);
  });

  it("rejects when consentGiven is false", async () => {
    const { sourceHospitalId, room, patient, surgeon } = await setup();
    const res = await request(app)
      .post("/api/anesthesia/surgeries")
      .set("x-test-user-id", surgeon.id)
      .set("x-test-hospital-id", sourceHospitalId)
      .send({
        patientId: patient.id,
        surgeryRoomId: room.id,
        plannedDate: new Date().toISOString(),
        plannedSurgery: "X",
        consentGiven: false,
      });
    expect(res.status).toBe(400);
  });

  it("creating a surgery in a NON-clinic-linked room behaves like normal (no external_surgery_request created)", async () => {
    const { sourceHospitalId, surgeon, patient } = await setup();
    const [physicalRoom] = await db.insert(surgeryRooms).values({
      hospitalId: sourceHospitalId, name: "Praxis OP1", type: "OP",
    }).returning();

    const res = await request(app)
      .post("/api/anesthesia/surgeries")
      .set("x-test-user-id", surgeon.id)
      .set("x-test-hospital-id", sourceHospitalId)
      .send({
        patientId: patient.id,
        surgeryRoomId: physicalRoom.id,
        plannedDate: new Date().toISOString(),
        plannedSurgery: "Y",
      });
    expect(res.status).toBe(200);
    created.surgeries.push(res.body.id);
    const [s] = await db.select().from(surgeries).where(eq(surgeries.id, res.body.id));
    expect(s.referralStatus).toBe("local");
    expect(s.externalRequestId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "clinic-linked room creates"`
Expected: FAIL — current route doesn't handle clinic-linked rooms.

- [ ] **Step 3: Implement `createCrossTenantReferral` + `validateAvailability` in storage**

Append to `server/storage/praxisMode.ts`:

```ts
export interface AvailabilityWindow {
  start: Date;
  end: Date;
  roomId: string;
  reason: "booked" | "closed" | "maintenance";
}

export async function getDestinationAvailability(
  destinationHospitalId: string, from: Date, to: Date
): Promise<AvailabilityWindow[]> {
  const rows = await db.select({
    id: surgeries.id,
    start: surgeries.plannedDate,
    durationMinutes: surgeries.actualEndTime, // fallback: use duration estimate; refine via existing helper if available
    roomId: surgeries.surgeryRoomId,
  })
  .from(surgeries)
  .where(and(
    eq(surgeries.hospitalId, destinationHospitalId),
    // Window overlap
    // plannedDate <= to AND (plannedDate + duration) >= from
  ));

  // For simplicity, treat every existing surgery as a 60-minute busy block; refine with real duration column if present.
  return rows
    .filter(r => r.start && new Date(r.start) <= to)
    .map(r => ({
      start: new Date(r.start as any),
      end: new Date(new Date(r.start as any).getTime() + 60 * 60 * 1000),
      roomId: r.roomId ?? "",
      reason: "booked" as const,
    }))
    .filter(w => w.end >= from);
}

export async function checkSlotIsFree(
  destinationHospitalId: string, slotStart: Date, slotEnd: Date
): Promise<boolean> {
  const windows = await getDestinationAvailability(destinationHospitalId, slotStart, slotEnd);
  return !windows.some(w => w.start < slotEnd && w.end > slotStart);
}

export interface CreateReferralInput {
  sourceHospitalId: string;
  surgeonUserId: string;
  surgery: any; // The full surgery row data (already inserted)
  destinationHospitalId: string;
  patientId: string | null;
  consentGiven: boolean;
}

export interface CreateReferralResult { externalRequestId: string; }

export async function createCrossTenantReferral(input: CreateReferralInput): Promise<CreateReferralResult> {
  if (!input.consentGiven) throw new Error("consent required");

  // Verify active partnership
  const [pair] = await db.select().from(referralPartnerships).where(and(
    eq(referralPartnerships.sourceHospitalId, input.sourceHospitalId),
    eq(referralPartnerships.destinationHospitalId, input.destinationHospitalId),
    eq(referralPartnerships.status, "active"),
  ));
  if (!pair) throw new Error("destination not paired");

  // Slot availability re-check (race-safe)
  const start = new Date(input.surgery.plannedDate);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  if (!(await checkSlotIsFree(input.destinationHospitalId, start, end))) {
    throw new Error("slot_taken");
  }

  // Build snapshot
  let demographics: any = {};
  if (input.patientId) {
    const [pt] = await db.select().from(patients).where(eq(patients.id, input.patientId));
    if (pt) demographics = {
      firstName: pt.firstName, lastName: (pt as any).surname ?? (pt as any).lastName,
      birthday: pt.birthday, sex: pt.sex, email: pt.email, phone: pt.phone,
      street: (pt as any).street, postalCode: (pt as any).postalCode, city: (pt as any).city,
    };
  }
  const snapshot = {
    demographics,
    intake: {},
    ambulant_eligibility: input.surgery.ambulantQuickCheck ?? null,
    consents: { given: true, scope: "surgery_referral", at: new Date().toISOString(), userId: input.surgeonUserId },
    shared_at: new Date().toISOString(),
  };

  const [req] = await db.insert(externalSurgeryRequests).values({
    hospitalId: input.destinationHospitalId,
    surgeonId: input.surgeonUserId,
    surgeonFirstName: (input.surgery as any).surgeonFirstName ?? "Source",
    surgeonLastName: (input.surgery as any).surgeonLastName ?? "Surgeon",
    surgeonEmail: (input.surgery as any).surgeonEmail ?? "",
    surgeonPhone: (input.surgery as any).surgeonPhone ?? "",
    sourceHospitalId: input.sourceHospitalId,
    sourceSurgeryId: input.surgery.id,
    patientSnapshot: snapshot,
    patientFirstName: demographics.firstName,
    patientLastName: demographics.lastName,
    patientBirthday: demographics.birthday,
    patientEmail: demographics.email,
    patientPhone: demographics.phone,
    patientStreet: demographics.street,
    patientPostalCode: demographics.postalCode,
    patientCity: demographics.city,
    surgeryName: input.surgery.plannedSurgery,
    chopCode: input.surgery.chopCode,
    surgerySide: input.surgery.surgerySide,
    antibioseProphylaxe: input.surgery.antibioseProphylaxe ?? false,
    surgeryDurationMinutes: 60, // TODO: derive from surgery if available
    withAnesthesia: !(input.surgery.noPreOpRequired ?? false),
    anesthesiaNotes: input.surgery.anesthesiaNotes,
    surgeryNotes: input.surgery.notes,
    diagnosis: input.surgery.diagnosis,
    coverageType: input.surgery.coverageType,
    stayType: input.surgery.stayType,
    surgeryRiskClass: input.surgery.surgeryRiskClass,
    wishedDate: input.surgery.plannedDate,
    wishedTimeFrom: start.getHours() * 60 + start.getMinutes(),
    wishedTimeTo: start.getHours() * 60 + start.getMinutes(),
    patientPosition: input.surgery.patientPosition,
    leftArmPosition: input.surgery.leftArmPosition,
    rightArmPosition: input.surgery.rightArmPosition,
    isReservationOnly: !input.patientId,
    status: "pending",
  }).returning();

  return { externalRequestId: req.id };
}
```

- [ ] **Step 4: Wire the cross-tenant flow into the existing POST endpoint**

In `server/routes/anesthesia/surgeries.ts`, modify the `POST /api/anesthesia/surgeries` handler at line 444. After the surgery is inserted normally, check if its room has `linked_hospital_id`:

```ts
// After existing surgery insertion, before returning res.json
import { createCrossTenantReferral } from "../../storage/praxisMode";

// ... existing surgery insert ...
const newSurgery = /* whatever the existing code names the inserted row */;

// Cross-tenant referral hook
if (newSurgery.surgeryRoomId) {
  const [room] = await db.select().from(surgeryRooms).where(eq(surgeryRooms.id, newSurgery.surgeryRoomId));
  if (room?.linkedHospitalId) {
    if (req.body.consentGiven !== true) {
      // Roll back the surgery (or mark it inactive) and return 400
      await db.delete(surgeries).where(eq(surgeries.id, newSurgery.id));
      return res.status(400).json({ error: "consent required for cross-tenant referral" });
    }
    try {
      const { externalRequestId } = await createCrossTenantReferral({
        sourceHospitalId: newSurgery.hospitalId,
        surgeonUserId: req.user.id,
        surgery: newSurgery,
        destinationHospitalId: room.linkedHospitalId,
        patientId: newSurgery.patientId,
        consentGiven: true,
      });
      await db.update(surgeries)
        .set({ externalRequestId, referralStatus: "pending_external" })
        .where(eq(surgeries.id, newSurgery.id));
      newSurgery.externalRequestId = externalRequestId;
      newSurgery.referralStatus = "pending_external";
    } catch (err: any) {
      await db.delete(surgeries).where(eq(surgeries.id, newSurgery.id));
      const msg = err.message ?? "";
      if (msg === "destination not paired") return res.status(403).json({ error: msg });
      if (msg === "slot_taken") return res.status(409).json({ error: msg, refreshAvailability: true });
      throw err;
    }
  }
}
```

Add a test-mode auth shim at the top of the route file (if not already present):

```ts
function getActiveContext(req: any) {
  if (process.env.NODE_ENV === "test" && req.headers["x-test-user-id"]) {
    return {
      userId: String(req.headers["x-test-user-id"]),
      hospitalId: String(req.headers["x-test-hospital-id"]),
    };
  }
  return { userId: req.user?.id, hospitalId: req.user?.activeHospitalId };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "clinic-linked room creates"`
Expected: PASS — all four sub-tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/storage/praxisMode.ts server/routes/anesthesia/surgeries.ts tests/praxis-mode-referral.test.ts
git commit -m "feat(referral): cross-tenant referral hook on POST /api/anesthesia/surgeries"
```

---

### Task 7: Destination-side accept — snapshot import + push back

**Files:**
- Modify: `server/storage/praxisMode.ts` (add `acceptReferralAndImport`, `pushReferralStatus`)
- Modify: `server/routes/externalSurgery.ts` (extend accept handler)
- Modify: `tests/praxis-mode-referral.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `tests/praxis-mode-referral.test.ts`:

```ts
describe("destination-side accept of source-sourced request", () => {
  it("creates destination patient from snapshot + destination questionnaire response with imported_from_praxis + pushes source status to confirmed_external", async () => {
    const { dest, surgeon, sourceHospitalId, room, patient } = await setup();
    const submit = await request(app)
      .post("/api/anesthesia/surgeries")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", sourceHospitalId)
      .send({
        patientId: patient.id, surgeryRoomId: room.id,
        plannedDate: new Date(Date.now() + 7*24*3600*1000).toISOString(),
        plannedSurgery: "Septoplasty", consentGiven: true,
      });
    created.surgeries.push(submit.body.id);
    const externalRequestId = (await db.select().from(surgeries).where(eq(surgeries.id, submit.body.id)))[0].externalRequestId!;
    created.requests.push(externalRequestId);

    // Simulate destination admin
    const [adminUser] = await db.insert(users).values({
      email: `adm-${Date.now()}@t.local`, firstName: "A", lastName: "A",
    }).returning();
    created.users.push(adminUser.id);
    await db.insert(userHospitalRoles).values({ userId: adminUser.id, hospitalId: dest.id, role: "admin" });

    const confirmedDate = new Date(Date.now() + 10*24*3600*1000);
    const res = await request(app)
      .post(`/api/external-surgery-requests/${externalRequestId}/accept`)
      .set("x-test-user-id", adminUser.id).set("x-test-hospital-id", dest.id)
      .send({ confirmedDate: confirmedDate.toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.destinationPatientId).toBeTruthy();
    created.patients.push(res.body.destinationPatientId);

    const [destPt] = await db.select().from(patients).where(eq(patients.id, res.body.destinationPatientId));
    expect(destPt.hospitalId).toBe(dest.id);
    expect(destPt.firstName).toBe("Petra");

    // Source-side surgery confirmed
    const [srcSurg] = await db.select().from(surgeries).where(eq(surgeries.id, submit.body.id));
    expect(srcSurg.referralStatus).toBe("confirmed_external");
    expect(srcSurg.plannedDate).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "destination-side accept"`
Expected: FAIL — accept endpoint doesn't yet import snapshot.

- [ ] **Step 3: Implement push + accept functions in storage**

Append to `server/storage/praxisMode.ts`:

```ts
export async function pushReferralStatus(input: {
  externalRequestId: string;
  newStatus: "confirmed_external" | "rejected_external" | "cancelled_external";
  confirmedDate?: Date | null;
  note?: string | null;
  isReschedule?: boolean;
  byUserId?: string | null;
  byHospitalId?: string | null;
}) {
  const [r] = await db.select().from(externalSurgeryRequests)
    .where(eq(externalSurgeryRequests.id, input.externalRequestId));
  if (!r?.sourceSurgeryId) return;

  const update: Record<string, unknown> = { referralStatus: input.newStatus };
  if (input.confirmedDate) update.plannedDate = input.confirmedDate;
  if (input.note != null) update.referralNote = input.note;
  if (input.isReschedule) update.lastClinicRescheduleAt = new Date();

  // Append to reschedule_history (used for all status transitions)
  const [src] = await db.select().from(surgeries).where(eq(surgeries.id, r.sourceSurgeryId));
  if (src) {
    const history = Array.isArray(src.rescheduleHistory) ? src.rescheduleHistory : [];
    history.push({
      from_status: src.referralStatus,
      to_status: input.newStatus,
      from_date: src.plannedDate,
      to_date: input.confirmedDate ?? src.plannedDate,
      at: new Date().toISOString(),
      by_user_id: input.byUserId ?? null,
      by_hospital_id: input.byHospitalId ?? null,
      reason: input.note ?? null,
    });
    update.rescheduleHistory = history;
  }

  await db.update(surgeries).set(update as any).where(eq(surgeries.id, r.sourceSurgeryId));
}

export async function acceptReferralAndImport(input: {
  destinationHospitalId: string;
  externalRequestId: string;
  confirmedDate?: Date | null;
  byUserId: string;
}): Promise<{ destinationPatientId: string }> {
  const [r] = await db.select().from(externalSurgeryRequests)
    .where(eq(externalSurgeryRequests.id, input.externalRequestId));
  if (!r) throw new Error("request not found");

  // Build patient from snapshot if present, else from request fields
  const snap = (r.patientSnapshot as any) ?? null;
  const dem = snap?.demographics ?? {
    firstName: r.patientFirstName, lastName: r.patientLastName,
    birthday: r.patientBirthday, sex: "O", email: r.patientEmail, phone: r.patientPhone,
    street: r.patientStreet, postalCode: r.patientPostalCode, city: r.patientCity,
  };

  const [destPt] = await db.insert(patients).values({
    hospitalId: input.destinationHospitalId,
    firstName: dem.firstName ?? "Unknown",
    surname: dem.lastName ?? "Patient",
    birthday: dem.birthday ?? null,
    sex: dem.sex ?? "O",
    email: dem.email,
    phone: dem.phone,
    street: dem.street,
    postalCode: dem.postalCode,
    city: dem.city,
  } as any).returning();

  // Import questionnaire (Task 15 fleshes this out; for now, just create the row if snapshot.intake is non-empty)
  if (snap?.intake && Object.keys(snap.intake).length > 0) {
    const fieldSources: Record<string, string> = {};
    for (const k of Object.keys(snap.intake)) fieldSources[k] = "source_referral";
    await db.execute(`
      INSERT INTO patient_questionnaire_responses
        (id, patient_id, hospital_id, imported_from_praxis, imported_from_praxis_at, imported_field_sources, responses)
      VALUES (gen_random_uuid(), $1, $2, true, NOW(), $3::jsonb, $4::jsonb)
    `.replace(/\$(\d+)/g, (_, n) => [`'${destPt.id}'`, `'${input.destinationHospitalId}'`, `'${JSON.stringify(fieldSources)}'`, `'${JSON.stringify(snap.intake)}'`][Number(n)-1]) as any);
  }

  await db.update(externalSurgeryRequests)
    .set({ status: "scheduled", patientId: destPt.id })
    .where(eq(externalSurgeryRequests.id, input.externalRequestId));

  await pushReferralStatus({
    externalRequestId: input.externalRequestId,
    newStatus: "confirmed_external",
    confirmedDate: input.confirmedDate ?? null,
    byUserId: input.byUserId,
    byHospitalId: input.destinationHospitalId,
  });

  return { destinationPatientId: destPt.id };
}
```

- [ ] **Step 4: Wire the accept route**

In `server/routes/externalSurgery.ts`, find the existing accept handler (or add one if absent at `POST /api/external-surgery-requests/:id/accept`). Replace / augment with:

```ts
import { acceptReferralAndImport } from "../storage/praxisMode";

router.post("/api/external-surgery-requests/:id/accept", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  const ctx = process.env.NODE_ENV === "test" && req.headers["x-test-hospital-id"]
    ? { hospitalId: String(req.headers["x-test-hospital-id"]), userId: String(req.headers["x-test-user-id"]) }
    : { hospitalId: req.user?.activeHospitalId, userId: req.user?.id };
  if (!ctx.hospitalId) return res.status(401).json({ error: "no active hospital" });

  try {
    const { destinationPatientId } = await acceptReferralAndImport({
      destinationHospitalId: ctx.hospitalId,
      externalRequestId: req.params.id,
      confirmedDate: req.body?.confirmedDate ? new Date(req.body.confirmedDate) : null,
      byUserId: ctx.userId,
    });
    return res.json({ destinationPatientId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? "accept failed" });
  }
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "destination-side accept"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/storage/praxisMode.ts server/routes/externalSurgery.ts tests/praxis-mode-referral.test.ts
git commit -m "feat(referral): destination-side accept imports snapshot + pushes status back"
```

---

### Task 8: Destination-side reject + cancel-after-accept + acknowledge-reschedule endpoint

**Files:**
- Modify: `server/routes/externalSurgery.ts` (add reject, cancel handlers)
- Create: `server/routes/praxisMode.ts` (acknowledge-reschedule)
- Modify: `server/routes/index.ts` (mount new router)
- Modify: `tests/praxis-mode-referral.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `tests/praxis-mode-referral.test.ts`:

```ts
describe("destination reject/cancel + acknowledge-reschedule", () => {
  async function submitAndGetIds() {
    const { dest, surgeon, sourceHospitalId, room, patient } = await setup();
    const submit = await request(app)
      .post("/api/anesthesia/surgeries")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", sourceHospitalId)
      .send({
        patientId: patient.id, surgeryRoomId: room.id,
        plannedDate: new Date(Date.now() + 7*24*3600*1000).toISOString(),
        plannedSurgery: "Septo", consentGiven: true,
      });
    created.surgeries.push(submit.body.id);
    const externalRequestId = (await db.select().from(surgeries).where(eq(surgeries.id, submit.body.id)))[0].externalRequestId!;
    created.requests.push(externalRequestId);
    const [adminUser] = await db.insert(users).values({ email: `adm-${Date.now()}@t.local`, firstName: "A", lastName: "A" }).returning();
    created.users.push(adminUser.id);
    await db.insert(userHospitalRoles).values({ userId: adminUser.id, hospitalId: dest.id, role: "admin" });
    return { destId: dest.id, adminUser, externalRequestId, sourceSurgeryId: submit.body.id };
  }

  it("destination reject sets source surgery to rejected_external with reason", async () => {
    const { destId, adminUser, externalRequestId, sourceSurgeryId } = await submitAndGetIds();
    const res = await request(app)
      .post(`/api/external-surgery-requests/${externalRequestId}/reject`)
      .set("x-test-user-id", adminUser.id).set("x-test-hospital-id", destId)
      .send({ reason: "Surgery type outside our scope" });
    expect(res.status).toBe(200);

    const [src] = await db.select().from(surgeries).where(eq(surgeries.id, sourceSurgeryId));
    expect(src.referralStatus).toBe("rejected_external");
    expect(src.referralNote).toBe("Surgery type outside our scope");
  });

  it("destination cancel-after-accept sets source surgery to cancelled_external", async () => {
    const { destId, adminUser, externalRequestId, sourceSurgeryId } = await submitAndGetIds();
    await request(app).post(`/api/external-surgery-requests/${externalRequestId}/accept`)
      .set("x-test-user-id", adminUser.id).set("x-test-hospital-id", destId).send({});

    const res = await request(app)
      .post(`/api/external-surgery-requests/${externalRequestId}/cancel`)
      .set("x-test-user-id", adminUser.id).set("x-test-hospital-id", destId)
      .send({ reason: "Equipment failure" });
    expect(res.status).toBe(200);

    const [src] = await db.select().from(surgeries).where(eq(surgeries.id, sourceSurgeryId));
    expect(src.referralStatus).toBe("cancelled_external");
    expect(src.referralNote).toBe("Equipment failure");
  });

  it("source acknowledge-reschedule sets reschedule_acknowledged_at", async () => {
    const { destId, adminUser, externalRequestId, sourceSurgeryId } = await submitAndGetIds();
    await request(app).post(`/api/external-surgery-requests/${externalRequestId}/accept`)
      .set("x-test-user-id", adminUser.id).set("x-test-hospital-id", destId).send({});
    // Manually set a reschedule
    await db.update(surgeries)
      .set({ lastClinicRescheduleAt: new Date(), rescheduleAcknowledgedAt: null } as any)
      .where(eq(surgeries.id, sourceSurgeryId));

    const surgeonHospital = (await db.select().from(surgeries).where(eq(surgeries.id, sourceSurgeryId)))[0].hospitalId;
    const res = await request(app)
      .post(`/api/surgeries/${sourceSurgeryId}/acknowledge-reschedule`)
      .set("x-test-hospital-id", surgeonHospital)
      .send({});
    expect(res.status).toBe(200);

    const [src] = await db.select().from(surgeries).where(eq(surgeries.id, sourceSurgeryId));
    expect(src.rescheduleAcknowledgedAt).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "destination reject/cancel"`
Expected: FAIL — reject/cancel/acknowledge handlers don't exist.

- [ ] **Step 3: Add reject + cancel routes**

In `server/routes/externalSurgery.ts`:

```ts
router.post("/api/external-surgery-requests/:id/reject", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  const ctx = process.env.NODE_ENV === "test" && req.headers["x-test-hospital-id"]
    ? { hospitalId: String(req.headers["x-test-hospital-id"]), userId: String(req.headers["x-test-user-id"]) }
    : { hospitalId: req.user?.activeHospitalId, userId: req.user?.id };
  const reason = String(req.body?.reason ?? "").trim();
  if (!reason) return res.status(400).json({ error: "reason required" });

  await db.update(externalSurgeryRequests)
    .set({ status: "declined", cancellationReason: reason })
    .where(eq(externalSurgeryRequests.id, req.params.id));

  await pushReferralStatus({
    externalRequestId: req.params.id,
    newStatus: "rejected_external",
    note: reason,
    byUserId: ctx.userId,
    byHospitalId: ctx.hospitalId,
  });
  return res.json({ ok: true });
});

router.post("/api/external-surgery-requests/:id/cancel", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  const ctx = process.env.NODE_ENV === "test" && req.headers["x-test-hospital-id"]
    ? { hospitalId: String(req.headers["x-test-hospital-id"]), userId: String(req.headers["x-test-user-id"]) }
    : { hospitalId: req.user?.activeHospitalId, userId: req.user?.id };
  const reason = String(req.body?.reason ?? "").trim();
  if (!reason) return res.status(400).json({ error: "reason required" });

  await pushReferralStatus({
    externalRequestId: req.params.id,
    newStatus: "cancelled_external",
    note: reason,
    byUserId: ctx.userId,
    byHospitalId: ctx.hospitalId,
  });
  return res.json({ ok: true });
});
```

- [ ] **Step 4: Add acknowledge-reschedule route in new praxisMode router**

```ts
// server/routes/praxisMode.ts
import { Router } from "express";
import { db } from "../db";
import { surgeries } from "@shared/schema";
import { eq } from "drizzle-orm";

export const praxisModeRouter = Router();

praxisModeRouter.post("/api/surgeries/:id/acknowledge-reschedule", async (req: any, res) => {
  // Auth: hospital must own the surgery; reuse existing middleware if available
  await db.update(surgeries)
    .set({ rescheduleAcknowledgedAt: new Date() } as any)
    .where(eq(surgeries.id, req.params.id));
  return res.json({ ok: true });
});
```

Mount in `server/routes/index.ts`:

```ts
import { praxisModeRouter } from "./praxisMode";
// ... existing mounts ...
app.use(praxisModeRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "destination reject/cancel"`
Expected: PASS — all three sub-tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/routes/externalSurgery.ts server/routes/praxisMode.ts server/routes/index.ts tests/praxis-mode-referral.test.ts
git commit -m "feat(referral): destination reject + cancel-after-accept + source acknowledge-reschedule"
```

---

### Task 8b: Destination inbox UI — badge + snapshot preview + reject/cancel dialogs

**Files:**
- Modify: the destination external-requests inbox component (verify exact path during execution — likely `client/src/components/admin/ExternalSurgeryRequestsInbox.tsx` or similar; search for the existing inbox table rendering)

- [ ] **Step 1: Add "From {Source.name}" badge to praxis-sourced rows**

In the inbox row renderer, for rows where `row.sourceHospitalId` is non-null, render a small badge next to the surgeon name:

```tsx
{row.sourceHospitalId && row.sourceHospitalName && (
  <Badge variant="secondary" className="ml-2 text-xs">
    🏥 From {row.sourceHospitalName}
  </Badge>
)}
```

The inbox row query needs to include `sourceHospitalName` (left-join `hospitals` on `external_surgery_requests.source_hospital_id`). Extend the existing inbox query / storage helper accordingly.

- [ ] **Step 2: Snapshot preview dialog on Accept click**

Before calling the existing accept action, intercept and show a preview dialog when `row.patientSnapshot` is non-null:

```tsx
function SnapshotPreviewDialog({ row, open, onClose, onConfirm }: {
  row: any; open: boolean; onClose: () => void; onConfirm: (sendInvite: boolean) => void;
}) {
  const [sendInvite, setSendInvite] = useState(true);
  const snap = row.patientSnapshot ?? {};
  const dem = snap.demographics ?? {};
  const intakeKeys = Object.keys(snap.intake ?? {});

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Accept referral from {row.sourceHospitalName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <section>
            <div className="font-semibold">Patient</div>
            <div>{dem.lastName}, {dem.firstName} (born {dem.birthday})</div>
            <div>{dem.phone} · {dem.email}</div>
            <div>{dem.street}, {dem.postalCode} {dem.city}</div>
          </section>
          <section>
            <div className="font-semibold">Surgery</div>
            <div>{row.surgeryName} · {row.surgeryDurationMinutes} min · {row.stayType}</div>
            <div>Diagnosis: {row.diagnosis}</div>
            <div>Risk class: {row.surgeryRiskClass}</div>
          </section>
          {intakeKeys.length > 0 && (
            <section>
              <div className="font-semibold">Pre-filled from source praxis</div>
              <ul className="text-xs ml-4 list-disc">
                {intakeKeys.map(k => <li key={k}>{k}</li>)}
              </ul>
            </section>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
            Send patient the questionnaire invitation link
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(sendInvite)}>Accept and create patient</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

The `onConfirm` calls the existing accept endpoint with the `sendInvite` flag.

- [ ] **Step 3: Mandatory-reason dialog for Reject + Cancel**

```tsx
function RejectDialog({ open, onClose, onConfirm, title }: {
  open: boolean; onClose: () => void; onConfirm: (reason: string) => void; title: string;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <Label>Reason (sent back to source)</Label>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Surgery type outside our scope" />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {title.includes("Reject") ? "Reject" : "Cancel surgery"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Wire Reject → posts to `/api/external-surgery-requests/:id/reject` with `{ reason }`.
Wire Cancel (only available for already-accepted requests) → posts to `/api/external-surgery-requests/:id/cancel` with `{ reason }`.

- [ ] **Step 4: Optional inbox filter chip**

Add a filter alongside existing status filters: "From referral partner" — when active, filter rows where `sourceHospitalId IS NOT NULL`.

- [ ] **Step 5: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Manual smoke test**

- Submit a praxis → destination referral
- As destination admin, open the external-requests inbox
- Verify the badge "From {Source.name}" appears
- Click Accept → snapshot preview dialog appears with demographics, surgery details, intake field list, and "Send patient invitation link" checkbox
- Confirm → request accepted, source side updated to confirmed_external
- Submit another referral, this time click Reject → reason dialog appears, requires reason, submits to reject endpoint

- [ ] **Step 7: Commit**

```bash
git add client/src/components/admin/ExternalSurgeryRequestsInbox.tsx
git commit -m "feat(inbox): destination-side badge + snapshot preview + reject/cancel reason dialogs"
```

---

## Phase 4 — Availability overlay

### Task 9: `GET /api/referral-partnerships/:destinationHospitalId/availability` endpoint

**Files:**
- Create: `server/routes/referralPartnerships.ts`
- Modify: `server/routes/index.ts`
- Create: `tests/praxis-mode-availability.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/praxis-mode-availability.test.ts
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server/app";
import { db, pool } from "../server/db";
import { hospitals, users, userHospitalRoles, surgeries, surgeryRooms, referralPartnerships } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { provisionSourceHospital } from "../server/storage/praxisMode";

const created = { hospitals: [] as string[], users: [] as string[], surgeries: [] as string[] };
afterAll(async () => {
  if (created.surgeries.length) await db.delete(surgeries).where(inArray(surgeries.id, created.surgeries));
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  if (created.hospitals.length) await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  await pool.end();
});

describe("GET /api/referral-partnerships/:id/availability", () => {
  it("returns anonymized busy windows for paired destination", async () => {
    const [dest] = await db.insert(hospitals).values({ name: `D ${Date.now()}`, tenantType: "clinic" }).returning();
    created.hospitals.push(dest.id);
    const [room] = await db.insert(surgeryRooms).values({
      hospitalId: dest.id, name: "OP1", type: "OP",
    }).returning();
    // Existing destination surgery
    const future = new Date(Date.now() + 24 * 3600 * 1000);
    const [destSurgery] = await db.insert(surgeries).values({
      hospitalId: dest.id, surgeryRoomId: room.id, plannedDate: future,
      plannedSurgery: "X", status: "planned", planningStatus: "pre-registered",
    } as any).returning();
    created.surgeries.push(destSurgery.id);

    const [surgeon] = await db.insert(users).values({ email: `av-${Date.now()}@t.local`, firstName: "A", lastName: "B" }).returning();
    created.users.push(surgeon.id);
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: surgeon.id, originatingDestinationId: dest.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);

    const from = new Date(Date.now()).toISOString();
    const to = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const res = await request(app)
      .get(`/api/referral-partnerships/${dest.id}/availability?from=${from}&to=${to}`)
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", sourceHospitalId);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.busyWindows)).toBe(true);
    expect(res.body.busyWindows.length).toBeGreaterThanOrEqual(1);
    // Anonymized
    expect(res.body.busyWindows[0]).not.toHaveProperty("patientName");
    expect(res.body.busyWindows[0]).toHaveProperty("start");
    expect(res.body.busyWindows[0]).toHaveProperty("end");
    expect(res.body.busyWindows[0]).toHaveProperty("reason");
  });

  it("returns 403 when no active partnership exists", async () => {
    const [dest] = await db.insert(hospitals).values({ name: `D2 ${Date.now()}`, tenantType: "clinic" }).returning();
    created.hospitals.push(dest.id);
    const [surgeon] = await db.insert(users).values({ email: `av-${Date.now()}-b@t.local`, firstName: "A", lastName: "B" }).returning();
    created.users.push(surgeon.id);
    const [orig] = await db.insert(hospitals).values({ name: `Orig ${Date.now()}`, tenantType: "clinic" }).returning();
    created.hospitals.push(orig.id);
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: surgeon.id, originatingDestinationId: orig.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);

    const res = await request(app)
      .get(`/api/referral-partnerships/${dest.id}/availability?from=${new Date().toISOString()}&to=${new Date(Date.now()+3600000).toISOString()}`)
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", sourceHospitalId);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-availability.test.ts`
Expected: FAIL — endpoint does not exist.

- [ ] **Step 3: Implement the endpoint**

```ts
// server/routes/referralPartnerships.ts
import { Router } from "express";
import { db } from "../db";
import { referralPartnerships } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getDestinationAvailability } from "../storage/praxisMode";

export const referralPartnershipsRouter = Router();

function getCtx(req: any) {
  if (process.env.NODE_ENV === "test" && req.headers["x-test-user-id"]) {
    return { userId: String(req.headers["x-test-user-id"]), hospitalId: String(req.headers["x-test-hospital-id"]) };
  }
  return { userId: req.user?.id, hospitalId: req.user?.activeHospitalId };
}

referralPartnershipsRouter.get("/api/referral-partnerships/:destinationHospitalId/availability", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });

  const [pair] = await db.select().from(referralPartnerships).where(and(
    eq(referralPartnerships.sourceHospitalId, ctx.hospitalId),
    eq(referralPartnerships.destinationHospitalId, req.params.destinationHospitalId),
    eq(referralPartnerships.status, "active"),
  ));
  if (!pair) return res.status(403).json({ error: "no active partnership" });

  const from = req.query.from ? new Date(String(req.query.from)) : new Date();
  const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 7*24*3600*1000);

  const windows = await getDestinationAvailability(req.params.destinationHospitalId, from, to);
  return res.json({
    busyWindows: windows.map(w => ({
      start: w.start.toISOString(), end: w.end.toISOString(), room_id: w.roomId, reason: w.reason,
    }))
  });
});
```

Mount in `server/routes/index.ts`:

```ts
import { referralPartnershipsRouter } from "./referralPartnerships";
app.use(referralPartnershipsRouter);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/praxis-mode-availability.test.ts`
Expected: PASS — both sub-tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/routes/referralPartnerships.ts server/routes/index.ts tests/praxis-mode-availability.test.ts
git commit -m "feat(availability): GET /api/referral-partnerships/:id/availability (auth-gated)"
```

---

### Task 10: Frontend `AvailabilityOverlay` component + hard-blocked drag

**Files:**
- Create: `client/src/components/anesthesia/AvailabilityOverlay.tsx`
- Modify: `client/src/pages/anesthesia/OpCalendar.tsx` (or whichever component renders the OR-calendar room columns — verify path during execution)

- [ ] **Step 1: Implement the overlay component**

```tsx
// client/src/components/anesthesia/AvailabilityOverlay.tsx
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

interface BusyWindow { start: string; end: string; room_id: string; reason: string; }
interface AvailabilityOverlayProps {
  destinationHospitalId: string;
  fromIso: string;
  toIso: string;
  /** Called when drag/click hits a busy zone — for tooltips. */
  onBusyAreaInteraction?: (window: BusyWindow) => void;
}

export function AvailabilityOverlay({ destinationHospitalId, fromIso, toIso }: AvailabilityOverlayProps) {
  const { data } = useQuery<{ busyWindows: BusyWindow[] }>({
    queryKey: ["availability", destinationHospitalId, fromIso, toIso],
    queryFn: async () => {
      const r = await fetch(`/api/referral-partnerships/${destinationHospitalId}/availability?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
      if (!r.ok) throw new Error("availability fetch failed");
      return r.json();
    },
    staleTime: 30_000,
  });

  const windows = data?.busyWindows ?? [];

  return (
    <>
      {windows.map((w, i) => {
        const start = new Date(w.start);
        const end = new Date(w.end);
        const topPct = computeTopPct(start, fromIso, toIso);
        const heightPct = computeHeightPct(start, end, fromIso, toIso);
        return (
          <div
            key={i}
            data-busy="true"
            data-testid={`busy-overlay-${i}`}
            style={{
              position: "absolute", left: 0, right: 0,
              top: `${topPct}%`, height: `${heightPct}%`,
              background: "repeating-linear-gradient(45deg, rgba(229,231,235,0.85), rgba(229,231,235,0.85) 4px, rgba(243,244,246,0.85) 4px, rgba(243,244,246,0.85) 8px)",
              pointerEvents: "auto",
              zIndex: 5,
              cursor: "not-allowed",
            }}
            title="Not available at this destination — pick another time"
          />
        );
      })}
    </>
  );
}

function computeTopPct(start: Date, fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.max(0, ((start.getTime() - from) / (to - from)) * 100);
}
function computeHeightPct(start: Date, end: Date, fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.max(1, ((end.getTime() - start.getTime()) / (to - from)) * 100);
}
```

- [ ] **Step 2: Integrate into the OR calendar's room column rendering**

In the calendar component (search for where `surgeryRooms` are rendered in columns — typically `OpCalendar.tsx`, `OpCalendarColumn.tsx`, or similar): for each room with `room.linkedHospitalId`, mount `<AvailabilityOverlay destinationHospitalId={room.linkedHospitalId} fromIso={visibleWindow.startIso} toIso={visibleWindow.endIso} />` inside the column's positioned container.

Also: before opening the Quick Schedule dialog on a clicked time, check if the clicked Y-coordinate intersects any `data-busy="true"` element via `document.elementFromPoint`. If yes, abort the dialog open and show a toast:

```ts
// In the calendar's click handler
function handleSlotClick(e: React.MouseEvent, room: any, clickedTime: Date) {
  if (room.linkedHospitalId) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target && (target as HTMLElement).dataset.busy === "true") {
      toast({ title: "Slot not available at destination — pick another time", variant: "destructive" });
      return;
    }
  }
  openQuickScheduleDialog({ room, plannedDate: clickedTime });
}
```

- [ ] **Step 3: Add a manual smoke-test note**

After integration, manually test:
- Open a clinic-linked logical room column in the OR calendar
- Verify the muted/striped overlay appears at the same time slots where the destination has surgeries
- Click on a busy zone → toast "Slot not available" appears, no dialog opens
- Click on a free zone → Quick Schedule dialog opens normally

- [ ] **Step 4: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/anesthesia/AvailabilityOverlay.tsx client/src/pages/anesthesia/OpCalendar.tsx
git commit -m "feat(availability): hard-blocked busy overlay on clinic-linked room columns"
```

---

## Phase 5 — Reschedule alerting (out-of-band)

### Task 11: Email + WhatsApp dispatch on reschedule / cancel-after-accept

**Files:**
- Modify: `server/storage/praxisMode.ts` (extend `pushReferralStatus` to fire OOB)
- Create: `server/services/referralAlerts.ts` (notification dispatch)

- [ ] **Step 1: Implement dispatch service**

```ts
// server/services/referralAlerts.ts
import { db } from "../db";
import { users, surgeries, hospitals, patients } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "./email"; // existing Resend wrapper
import { sendWhatsApp } from "./whatsapp"; // existing wrapper (or fall back to SMS if WhatsApp missing)

export async function dispatchRescheduleAlert(input: {
  surgeryId: string;
  oldDate: Date | null;
  newDate: Date | null;
  reason: string | null;
  destinationHospitalId: string;
}) {
  const [surg] = await db.select().from(surgeries).where(eq(surgeries.id, input.surgeryId));
  if (!surg?.surgeonId) return;
  const [surgeon] = await db.select().from(users).where(eq(users.id, surg.surgeonId));
  if (!surgeon) return;
  const [dest] = await db.select().from(hospitals).where(eq(hospitals.id, input.destinationHospitalId));
  const patientName = surg.patientId
    ? ((await db.select().from(patients).where(eq(patients.id, surg.patientId)))[0]?.firstName ?? "patient")
    : "patient";

  const subject = `Surgery rescheduled at ${dest?.name ?? "destination"} — ${patientName}`;
  const body = `
A surgery you submitted has been rescheduled.

Patient: ${patientName}
Old date: ${input.oldDate?.toISOString() ?? "—"}
New date: ${input.newDate?.toISOString() ?? "—"}
${input.reason ? `Reason: ${input.reason}` : ""}

View in Viali: <link to source-side surgery>
`.trim();

  // Fire-and-forget
  if (surgeon.email) sendEmail({ to: surgeon.email, subject, text: body }).catch(err => console.error("reschedule email failed", err));
  if (surgeon.phone) sendWhatsApp({ to: surgeon.phone, body: `Surgery rescheduled at ${dest?.name}: ${input.newDate?.toLocaleDateString() ?? ""}` }).catch(err => console.error("reschedule WhatsApp failed", err));
}

export async function dispatchCancelAfterAcceptAlert(input: {
  surgeryId: string;
  reason: string | null;
  destinationHospitalId: string;
}) {
  const [surg] = await db.select().from(surgeries).where(eq(surgeries.id, input.surgeryId));
  if (!surg?.surgeonId) return;
  const [surgeon] = await db.select().from(users).where(eq(users.id, surg.surgeonId));
  if (!surgeon) return;
  const [dest] = await db.select().from(hospitals).where(eq(hospitals.id, input.destinationHospitalId));

  const subject = `Surgery cancelled at ${dest?.name ?? "destination"}`;
  const body = `A previously-confirmed surgery has been cancelled.\n${input.reason ? `Reason: ${input.reason}` : ""}\n\nView in Viali: <link>`;

  if (surgeon.email) sendEmail({ to: surgeon.email, subject, text: body }).catch(console.error);
  if (surgeon.phone) sendWhatsApp({ to: surgeon.phone, body: `Surgery cancelled at ${dest?.name}` }).catch(console.error);
}
```

> **Note:** if `server/services/email.ts` exports a different signature (`sendMail` vs `sendEmail`), verify and adjust. Same for the WhatsApp helper — verify the actual exported function names by reading the existing service files first.

- [ ] **Step 2: Extend `pushReferralStatus` to fire alerts**

In `server/storage/praxisMode.ts`, modify `pushReferralStatus` to call alerts after committing:

```ts
import { dispatchRescheduleAlert, dispatchCancelAfterAcceptAlert } from "../services/referralAlerts";

// At the end of pushReferralStatus (after the db.update), add:
if (input.isReschedule && src) {
  dispatchRescheduleAlert({
    surgeryId: src.id,
    oldDate: src.plannedDate ? new Date(src.plannedDate as any) : null,
    newDate: input.confirmedDate ?? null,
    reason: input.note ?? null,
    destinationHospitalId: input.byHospitalId ?? "",
  }).catch(err => console.error("alert dispatch failed", err));
}
if (input.newStatus === "cancelled_external" && src?.referralStatus === "confirmed_external") {
  dispatchCancelAfterAcceptAlert({
    surgeryId: src.id,
    reason: input.note ?? null,
    destinationHospitalId: input.byHospitalId ?? "",
  }).catch(err => console.error("alert dispatch failed", err));
}
```

- [ ] **Step 3: Manual verification (no automated test for OOB dispatch — depends on external services)**

Trigger a reschedule via the destination admin UI in dev → confirm:
- Source-side `last_clinic_reschedule_at` is set
- Source-side banner appears
- Surgeon receives an email (check Resend dashboard / test inbox)
- Surgeon receives WhatsApp message (if WhatsApp is configured)

- [ ] **Step 4: Commit**

```bash
git add server/storage/praxisMode.ts server/services/referralAlerts.ts
git commit -m "feat(alerts): email + WhatsApp dispatch on reschedule + cancel-after-accept"
```

---

## Phase 6 — Activation endpoint + flow

### Task 12: `POST /api/surgeon-portal/praxis/activate`

**Files:**
- Modify: `server/routes/praxisMode.ts`
- Create: `tests/praxis-mode-routes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/praxis-mode-routes.test.ts
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server/app";
import { db, pool } from "../server/db";
import { hospitals, users, userHospitalRoles, referralPartnerships, surgeryRooms } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const created = { hospitals: [] as string[], users: [] as string[] };
afterAll(async () => {
  if (created.hospitals.length) await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  await pool.end();
});

describe("POST /api/surgeon-portal/praxis/activate", () => {
  it("provisions source hospital + auto-pairs + creates logical room + returns new hospital id", async () => {
    const [dest] = await db.insert(hospitals).values({ name: `D ${Date.now()}`, tenantType: "clinic" }).returning();
    created.hospitals.push(dest.id);
    const [surgeon] = await db.insert(users).values({ email: `act-${Date.now()}@t.local`, firstName: "S", lastName: "S" }).returning();
    created.users.push(surgeon.id);
    await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: dest.id, role: "external_surgeon" });

    const res = await request(app)
      .post("/api/surgeon-portal/praxis/activate")
      .set("x-test-user-id", surgeon.id)
      .set("x-test-hospital-id", dest.id)
      .send({ sourceName: "Praxis Mueller", password: "Test1234!" });
    expect(res.status).toBe(200);
    expect(res.body.sourceHospitalId).toBeTruthy();
    created.hospitals.push(res.body.sourceHospitalId);

    const [src] = await db.select().from(hospitals).where(eq(hospitals.id, res.body.sourceHospitalId));
    expect(src.tenantType).toBe("praxis");

    const pairs = await db.select().from(referralPartnerships)
      .where(eq(referralPartnerships.sourceHospitalId, res.body.sourceHospitalId));
    expect(pairs.length).toBeGreaterThanOrEqual(1);

    const rooms = await db.select().from(surgeryRooms)
      .where(eq(surgeryRooms.hospitalId, res.body.sourceHospitalId));
    expect(rooms.length).toBeGreaterThanOrEqual(1);
    expect(rooms.every(r => r.linkedHospitalId)).toBe(true);
  });

  it("returns 409 if surgeon already owns a source hospital", async () => {
    const [dest] = await db.insert(hospitals).values({ name: `D ${Date.now()}-b`, tenantType: "clinic" }).returning();
    created.hospitals.push(dest.id);
    const [surgeon] = await db.insert(users).values({ email: `dup-${Date.now()}@t.local`, firstName: "D", lastName: "D" }).returning();
    created.users.push(surgeon.id);
    await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: dest.id, role: "external_surgeon" });

    const first = await request(app)
      .post("/api/surgeon-portal/praxis/activate")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", dest.id)
      .send({ sourceName: "First", password: "Test1234!" });
    expect(first.status).toBe(200);
    created.hospitals.push(first.body.sourceHospitalId);

    const second = await request(app)
      .post("/api/surgeon-portal/praxis/activate")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", dest.id)
      .send({ sourceName: "Second", password: "Test1234!" });
    expect(second.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-routes.test.ts`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Add the activation route**

Append to `server/routes/praxisMode.ts`:

```ts
import { provisionSourceHospital, backfillReferralHistory } from "../storage/praxisMode";
import { hashPassword } from "../auth/password"; // verify exact path/name during execution
import { userHospitalRoles, hospitals, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";

praxisModeRouter.post("/api/surgeon-portal/praxis/activate", async (req: any, res) => {
  const ctx = process.env.NODE_ENV === "test" && req.headers["x-test-user-id"]
    ? { userId: String(req.headers["x-test-user-id"]), clinicId: String(req.headers["x-test-hospital-id"]) }
    : { userId: req.surgeonPortalSession?.userId, clinicId: req.surgeonPortalSession?.hospitalId };
  if (!ctx.userId || !ctx.clinicId) return res.status(401).json({ error: "not authenticated" });

  // Reject if already owns a source hospital
  const existing = await db.select({ hId: userHospitalRoles.hospitalId, tt: hospitals.tenantType })
    .from(userHospitalRoles)
    .leftJoin(hospitals, eq(userHospitalRoles.hospitalId, hospitals.id))
    .where(and(eq(userHospitalRoles.userId, ctx.userId), eq(hospitals.tenantType, "praxis")));
  if (existing.length > 0) {
    return res.status(409).json({ error: "source hospital already exists", sourceHospitalId: existing[0].hId });
  }

  const sourceName = String(req.body?.sourceName ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!sourceName) return res.status(400).json({ error: "sourceName required" });
  if (!password || password.length < 8) return res.status(400).json({ error: "password required (min 8 chars)" });

  // Set/upgrade password on the user record
  await db.update(users).set({ passwordHash: await hashPassword(password) } as any).where(eq(users.id, ctx.userId));

  try {
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: ctx.userId,
      originatingDestinationId: ctx.clinicId,
      sourceName,
    });

    // Best-effort backfill (failures don't block activation)
    try {
      await backfillReferralHistory({ sourceHospitalId, surgeonUserId: ctx.userId });
    } catch (err) {
      console.error("backfill failed", err);
    }

    return res.json({ sourceHospitalId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? "activation failed" });
  }
});
```

> **Note:** confirm the actual password-hashing helper path (`server/auth/password.ts` is likely; may be `bcrypt` directly or a wrapper). Same for the `users.passwordHash` column name.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/praxis-mode-routes.test.ts`
Expected: PASS — both sub-tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/routes/praxisMode.ts tests/praxis-mode-routes.test.ts
git commit -m "feat(api): POST /api/surgeon-portal/praxis/activate (provision + backfill + password)"
```

---

### Task 13: Activation modal + promo card in surgeon-portal

**Files:**
- Create: `client/src/components/praxis/PraxisActivationModal.tsx`
- Modify: `client/src/pages/SurgeonPortal.tsx` (add promo card in Submit tab)

- [ ] **Step 1: Implement the modal**

```tsx
// client/src/components/praxis/PraxisActivationModal.tsx
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface Props { open: boolean; onClose: () => void; }

export function PraxisActivationModal({ open, onClose }: Props) {
  const [sourceName, setSourceName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const activate = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/surgeon-portal/praxis/activate", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceName, password }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "activation failed");
      return r.json();
    },
    onSuccess: ({ sourceHospitalId }) => {
      toast({ title: "Praxis activated. Redirecting to your calendar..." });
      window.location.href = "/anesthesia/op";
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const valid = sourceName.trim().length > 0 && password.length >= 8 && password === confirm;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Activate your praxis on Viali</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          This creates a full Viali instance for your praxis. You will be redirected after activation.
          Your historical surgery requests will be imported into your calendar automatically.
        </p>
        <div className="space-y-3 mt-4">
          <div>
            <Label htmlFor="praxis-name">Praxis name</Label>
            <Input id="praxis-name" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Praxis Mueller" />
          </div>
          <div>
            <Label htmlFor="praxis-password">Password</Label>
            <Input id="praxis-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="praxis-confirm">Confirm password</Label>
            <Input id="praxis-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || activate.isPending} onClick={() => activate.mutate()}>
            {activate.isPending ? "Activating..." : "Activate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add the promo card to `SurgeonPortal.tsx`**

In the surgeon portal's Submit tab content (search for "Submit" tab around the existing form area), add a promo card *above* the request form:

```tsx
import { useState } from "react";
import { PraxisActivationModal } from "@/components/praxis/PraxisActivationModal";

// Inside the Submit tab JSX:
const [activationOpen, setActivationOpen] = useState(false);
// ...
<div className="rounded-lg border-2 border-indigo-200 bg-indigo-50 p-4 mb-4 dark:bg-indigo-950/30 dark:border-indigo-800">
  <div className="flex items-start justify-between gap-3">
    <div>
      <div className="font-semibold text-sm">Activate your praxis on Viali</div>
      <p className="text-xs text-muted-foreground mt-1">
        Manage your own patient database, calendar, and consultations. Your historical surgery requests will be imported automatically.
      </p>
    </div>
    <Button size="sm" onClick={() => setActivationOpen(true)}>Activate</Button>
  </div>
</div>
<PraxisActivationModal open={activationOpen} onClose={() => setActivationOpen(false)} />
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

- Run `npm run dev`
- Log in via surgeon portal OTP
- Click "Activate" on the promo card
- Fill praxis name + password, submit
- Verify redirect to `/anesthesia/op` of the new tenant
- Verify the calendar shows historical surgeries in destination-named rooms

- [ ] **Step 5: Commit**

```bash
git add client/src/components/praxis/PraxisActivationModal.tsx client/src/pages/SurgeonPortal.tsx
git commit -m "feat(ui): praxis activation modal + surgeon-portal promo card"
```

---

## Phase 7 — Quick Schedule extension

### Task 14: Add 4 demographic fields to inline new-patient form

**Files:**
- Modify: `client/src/components/anesthesia/QuickCreateSurgeryDialog.tsx`

- [ ] **Step 1: Add the 4 new state hooks**

In `QuickCreateSurgeryDialog.tsx`, near the existing `newPatient*` state declarations (around lines 100-105), add:

```tsx
const [newPatientEmail, setNewPatientEmail] = useState("");
const [newPatientStreet, setNewPatientStreet] = useState("");
const [newPatientPostalCode, setNewPatientPostalCode] = useState("");
const [newPatientCity, setNewPatientCity] = useState("");
```

- [ ] **Step 2: Add the 4 form fields to the inline new-patient section**

In the inline new-patient JSX (around lines 425-450, after the existing Phone input), add:

```tsx
{/* Email */}
<div>
  <Label htmlFor="np-email">Email {isClinicLinkedRoom && "*"}</Label>
  <Input id="np-email" type="email" value={newPatientEmail} onChange={(e) => setNewPatientEmail(e.target.value)} />
</div>

{/* Address */}
<div className="grid grid-cols-2 gap-2">
  <div>
    <Label htmlFor="np-street">Street {isClinicLinkedRoom && "*"}</Label>
    <Input id="np-street" value={newPatientStreet} onChange={(e) => setNewPatientStreet(e.target.value)} />
  </div>
  <div>
    <Label htmlFor="np-postal">Postal code {isClinicLinkedRoom && "*"}</Label>
    <Input id="np-postal" value={newPatientPostalCode} onChange={(e) => setNewPatientPostalCode(e.target.value)} />
  </div>
</div>
<div>
  <Label htmlFor="np-city">City {isClinicLinkedRoom && "*"}</Label>
  <Input id="np-city" value={newPatientCity} onChange={(e) => setNewPatientCity(e.target.value)} />
</div>
```

- [ ] **Step 3: Derive `isClinicLinkedRoom` from the selected room**

Near the other derived values in the dialog (around line 380):

```tsx
const selectedRoom = useMemo(() =>
  rooms.find((r: any) => r.id === surgeryRoomId), [rooms, surgeryRoomId]);
const isClinicLinkedRoom = !!selectedRoom?.linkedHospitalId;
```

- [ ] **Step 4: Wire the new fields into the `createPatientMutation` payload**

In the `handleCreatePatient` function (around line 283), extend the payload:

```ts
// Add validation when room is clinic-linked
if (isClinicLinkedRoom && (!newPatientEmail.trim() || !newPatientStreet.trim() || !newPatientPostalCode.trim() || !newPatientCity.trim())) {
  toast({
    title: t("common.validationError"),
    description: "Email, street, postal code, and city are required for cross-tenant referrals.",
    variant: "destructive",
  });
  return;
}

createPatientMutation.mutate({
  hospitalId,
  firstName: newPatientFirstName.trim(),
  surname: newPatientSurname.trim(),
  birthday: newPatientDOB,
  sex: newPatientGender.toUpperCase(),
  phone: newPatientPhone.trim() || undefined,
  email: newPatientEmail.trim() || undefined,
  street: newPatientStreet.trim() || undefined,
  postalCode: newPatientPostalCode.trim() || undefined,
  city: newPatientCity.trim() || undefined,
});
```

- [ ] **Step 5: Reset fields in the existing reset handler**

In the `resetForm` / dialog-close cleanup (around line 270-280), add the 4 new resets:

```ts
setNewPatientEmail("");
setNewPatientStreet("");
setNewPatientPostalCode("");
setNewPatientCity("");
```

- [ ] **Step 6: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/anesthesia/QuickCreateSurgeryDialog.tsx
git commit -m "feat(quick-schedule): inline new-patient form captures email + address (required for clinic-linked rooms)"
```

---

## Phase 8 — Cross-tenant questionnaire dedup

### Task 15: Snapshot intake serialization + destination import

**Files:**
- Modify: `server/storage/praxisMode.ts` (extend `createCrossTenantReferral` to pull source-side questionnaire; extend `acceptReferralAndImport` to populate intake)
- Modify: `tests/praxis-mode-referral.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `tests/praxis-mode-referral.test.ts`:

```ts
describe("questionnaire dedup across tenants", () => {
  it("source-side questionnaire flows into snapshot.intake and is imported on accept with imported_from_praxis flags", async () => {
    const { dest, surgeon, sourceHospitalId, room, patient } = await setup();

    // Manually create a source-side questionnaire response
    await db.execute(`
      INSERT INTO patient_questionnaire_responses (id, patient_id, hospital_id, responses)
      VALUES (gen_random_uuid(), '${patient.id}', '${sourceHospitalId}', '${JSON.stringify({ allergies: "none", medications: "metformin" })}'::jsonb)
    ` as any);

    const submit = await request(app)
      .post("/api/anesthesia/surgeries")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", sourceHospitalId)
      .send({
        patientId: patient.id, surgeryRoomId: room.id,
        plannedDate: new Date(Date.now() + 7*24*3600*1000).toISOString(),
        plannedSurgery: "Septo", consentGiven: true,
      });
    created.surgeries.push(submit.body.id);
    const externalRequestId = (await db.select().from(surgeries).where(eq(surgeries.id, submit.body.id)))[0].externalRequestId!;
    created.requests.push(externalRequestId);

    const [req] = await db.select().from(externalSurgeryRequests).where(eq(externalSurgeryRequests.id, externalRequestId));
    expect((req.patientSnapshot as any).intake.allergies).toBe("none");
    expect((req.patientSnapshot as any).intake.medications).toBe("metformin");

    // Accept
    const [adminUser] = await db.insert(users).values({ email: `q-adm-${Date.now()}@t.local`, firstName: "A", lastName: "A" }).returning();
    created.users.push(adminUser.id);
    await db.insert(userHospitalRoles).values({ userId: adminUser.id, hospitalId: dest.id, role: "admin" });
    const accept = await request(app)
      .post(`/api/external-surgery-requests/${externalRequestId}/accept`)
      .set("x-test-user-id", adminUser.id).set("x-test-hospital-id", dest.id)
      .send({});
    created.patients.push(accept.body.destinationPatientId);

    // Verify destination questionnaire response with imported_from_praxis flags
    const rows = await db.execute(`
      SELECT imported_from_praxis, imported_field_sources, responses
      FROM patient_questionnaire_responses
      WHERE patient_id = '${accept.body.destinationPatientId}'
    ` as any) as any;
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].imported_from_praxis).toBe(true);
    expect(rows.rows[0].imported_field_sources.allergies).toBe("source_referral");
    expect(rows.rows[0].responses.medications).toBe("metformin");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "questionnaire dedup"`
Expected: FAIL — snapshot's intake isn't being populated yet.

- [ ] **Step 3: Extend `createCrossTenantReferral` to pull questionnaire**

In `server/storage/praxisMode.ts`, inside `createCrossTenantReferral`, after the demographics block, add:

```ts
// Pull source-side questionnaire if patient has one
let intake: Record<string, unknown> = {};
if (input.patientId) {
  const qrows = await db.execute(
    `SELECT responses FROM patient_questionnaire_responses WHERE patient_id = '${input.patientId}' AND hospital_id = '${input.sourceHospitalId}' ORDER BY created_at DESC LIMIT 1` as any
  ) as any;
  if (qrows.rows?.[0]?.responses) intake = qrows.rows[0].responses;
}
const snapshot = {
  demographics,
  intake,
  ambulant_eligibility: input.surgery.ambulantQuickCheck ?? null,
  consents: { given: true, scope: "surgery_referral", at: new Date().toISOString(), userId: input.surgeonUserId },
  shared_at: new Date().toISOString(),
};
```

> **Security note:** the inline SQL above uses string interpolation for brevity in this plan — when implementing, replace with parameterized queries via `sql\`\`` from drizzle-orm or `pool.query(..., [params])` to prevent SQL injection. Same pattern applies anywhere a UUID is interpolated into raw SQL.

- [ ] **Step 4: Verify `acceptReferralAndImport` populates `responses` column**

Re-check the implementation in Task 7. The current code already creates a `patient_questionnaire_responses` row with `responses = snap.intake` when `snap.intake` is non-empty. Good — no change.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "questionnaire dedup"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/storage/praxisMode.ts tests/praxis-mode-referral.test.ts
git commit -m "feat(referral): snapshot carries source-side questionnaire intake into destination import"
```

---

### Task 16: Patient-facing questionnaire "✓ from praxis" badges

**Files:**
- Modify: the patient questionnaire fill page (verify exact path during execution — likely `client/src/pages/PatientQuestionnaireFill.tsx` or similar)

- [ ] **Step 1: Detect imported fields and render badges**

In the questionnaire fill component, after fetching the response data, check `response.imported_from_praxis` and `response.imported_field_sources`. For each field whose key is in `imported_field_sources`, render a small inline badge:

```tsx
{response.imported_from_praxis && (
  <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm mb-4 dark:bg-emerald-950/30">
    Some of your information has been shared by your referring practice. Please confirm or update.
  </div>
)}
{/* For each field: */}
<div className="relative">
  <Label>{fieldLabel}</Label>
  <Input
    value={value}
    onChange={(e) => {
      onChange(e.target.value);
      // When the user edits, remove the field-source flag locally
      if (response.imported_field_sources?.[fieldKey]) {
        markFieldEdited(fieldKey);
      }
    }}
  />
  {response.imported_field_sources?.[fieldKey] === "source_referral" && (
    <span className="absolute right-2 top-9 text-xs text-emerald-700 dark:text-emerald-300">
      ✓ from your praxis · review
    </span>
  )}
</div>
```

The `markFieldEdited` helper removes the entry from `imported_field_sources` in component state — when the patient submits, the backend updates the row.

- [ ] **Step 2: Wire submit to update the response with edited fields**

The existing submit endpoint already handles `responses` updates. Also update `imported_field_sources` in the same call to remove fields the patient edited.

- [ ] **Step 3: Manual smoke test**

- Trigger a praxis → destination referral with an intake-filled patient
- After accept, open the patient's questionnaire link
- Verify badges + banner appear on imported fields
- Edit a field — verify the badge disappears on that field
- Submit — verify the response row's `imported_field_sources` no longer contains the edited key

- [ ] **Step 4: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/PatientQuestionnaireFill.tsx
git commit -m "feat(questionnaire): imported-from-praxis badges + edit-clears-flag"
```

---

## Phase 9 — Referral partner management UI

### Task 17: Source-side Referral Partners panel (in `/admin/links`)

**Files:**
- Create: `client/src/components/admin/ReferralPartnersCard.tsx`
- Modify: `client/src/pages/admin/Settings.tsx` (mount the card inside Links tab)

- [ ] **Step 1: Implement the partner card**

```tsx
// client/src/components/admin/ReferralPartnersCard.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

export function ReferralPartnersCard() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const partners = useQuery<any[]>({
    queryKey: ["/api/referral-partnerships"],
    queryFn: async () => (await fetch("/api/referral-partnerships")).json(),
  });

  const generate = useMutation({
    mutationFn: async () => (await fetch("/api/referral-partnerships/codes", { method: "POST" })).json(),
    onSuccess: (data) => setGeneratedCode(data.code),
  });
  const redeem = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/referral-partnerships/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/referral-partnerships"] });
      setCode("");
      toast({ title: "Pairing request sent. Awaiting destination approval." });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/referral-partnerships/${id}/revoke`, { method: "POST" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/referral-partnerships"] }),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Referral Partners</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <section>
          <h4 className="text-sm font-semibold mb-2">Add a referral partner</h4>
          <p className="text-xs text-muted-foreground mb-2">
            Enter the 8-character pairing code provided by the destination hospital.
          </p>
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="K7P9A2N3" maxLength={8} />
            <Button onClick={() => redeem.mutate()} disabled={code.length !== 8 || redeem.isPending}>Redeem</Button>
          </div>
        </section>

        <section>
          <h4 className="text-sm font-semibold mb-2">Generate code (for incoming requests)</h4>
          <Button onClick={() => generate.mutate()} variant="outline">Generate code</Button>
          {generatedCode && (
            <div className="mt-2 p-2 bg-muted rounded font-mono text-lg">
              {generatedCode}
              <span className="ml-2 text-xs text-muted-foreground">valid for 30 minutes</span>
            </div>
          )}
        </section>

        <section>
          <h4 className="text-sm font-semibold mb-2">Current partners</h4>
          {partners.data?.length === 0 && <p className="text-xs text-muted-foreground">No active partners yet.</p>}
          <div className="space-y-2">
            {partners.data?.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 border rounded">
                <div>
                  <div className="font-medium text-sm">{p.destinationName ?? p.sourceName ?? p.destinationHospitalId}</div>
                  <div className="text-xs text-muted-foreground">
                    <Badge variant="outline" className="mr-1">{p.status}</Badge>
                    Paired via {p.pairingSource}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate(p.id)}>End partnership</Button>
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Mount the card inside Settings.tsx Links tab**

In `client/src/pages/admin/Settings.tsx`, inside the Links tab content (around line 1361 where `BookingTokenSection` is mounted), add:

```tsx
import { ReferralPartnersCard } from "@/components/admin/ReferralPartnersCard";
// ...
<ReferralPartnersCard />
```

- [ ] **Step 3: Add the partner endpoints to the referralPartnerships router**

In `server/routes/referralPartnerships.ts`, add the missing endpoints:

```ts
import {
  listPartnerships, generatePartnershipCode, redeemPartnershipCode,
  approvePartnership, rejectPartnership, revokePartnership,
} from "../storage/praxisMode";

referralPartnershipsRouter.get("/api/referral-partnerships", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });
  return res.json(await listPartnerships(ctx.hospitalId));
});

referralPartnershipsRouter.post("/api/referral-partnerships/codes", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });
  const code = await generatePartnershipCode(ctx.hospitalId);
  return res.json({ code });
});

referralPartnershipsRouter.post("/api/referral-partnerships/redeem", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });
  try {
    const pair = await redeemPartnershipCode({ sourceHospitalId: ctx.hospitalId, code: String(req.body?.code ?? "") });
    return res.json(pair);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

referralPartnershipsRouter.post("/api/referral-partnerships/:id/approve", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });
  try {
    await approvePartnership({ partnershipId: req.params.id, approverDestinationId: ctx.hospitalId });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(403).json({ error: err.message });
  }
});

referralPartnershipsRouter.post("/api/referral-partnerships/:id/reject", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });
  try {
    await rejectPartnership({ partnershipId: req.params.id, approverDestinationId: ctx.hospitalId });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(403).json({ error: err.message });
  }
});

referralPartnershipsRouter.post("/api/referral-partnerships/:id/revoke", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });
  await revokePartnership({ partnershipId: req.params.id, actor: "source" });
  return res.json({ ok: true });
});
```

- [ ] **Step 4: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/admin/ReferralPartnersCard.tsx client/src/pages/admin/Settings.tsx server/routes/referralPartnerships.ts
git commit -m "feat(ui): referral partners panel in /admin/links + supporting endpoints"
```

---

### Task 18: Destination-side pending partnership approval UI

**Files:**
- Modify: `client/src/components/admin/ReferralPartnersCard.tsx` (same card, conditional rendering for pending-incoming partnerships)
- Modify: `server/storage/praxisMode.ts` (add `listIncomingPendingPartnerships`)
- Modify: `server/routes/referralPartnerships.ts`

- [ ] **Step 1: Add the storage helper**

In `server/storage/praxisMode.ts`:

```ts
export async function listIncomingPendingPartnerships(destinationHospitalId: string) {
  return await db.select({
    id: rp.id,
    sourceHospitalId: rp.sourceHospitalId,
    pairingSource: rp.pairingSource,
    createdAt: rp.createdAt,
    sourceName: hospitalsTable.name,
  })
  .from(rp)
  .leftJoin(hospitalsTable, eq(rp.sourceHospitalId, hospitalsTable.id))
  .where(and(eq(rp.destinationHospitalId, destinationHospitalId), eq(rp.status, "pending")));
}
```

- [ ] **Step 2: Add the endpoint**

```ts
referralPartnershipsRouter.get("/api/referral-partnerships/incoming", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });
  return res.json(await listIncomingPendingPartnerships(ctx.hospitalId));
});
```

- [ ] **Step 3: Add the pending section to `ReferralPartnersCard`**

In `ReferralPartnersCard.tsx`, add a query + section:

```tsx
const incoming = useQuery<any[]>({
  queryKey: ["/api/referral-partnerships/incoming"],
  queryFn: async () => (await fetch("/api/referral-partnerships/incoming")).json(),
});

const approve = useMutation({
  mutationFn: async (id: string) => {
    await fetch(`/api/referral-partnerships/${id}/approve`, { method: "POST" });
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["/api/referral-partnerships"] });
    qc.invalidateQueries({ queryKey: ["/api/referral-partnerships/incoming"] });
  },
});
const reject = useMutation({
  mutationFn: async (id: string) => {
    await fetch(`/api/referral-partnerships/${id}/reject`, { method: "POST" });
  },
  onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/referral-partnerships/incoming"] }),
});

// Before the "Current partners" section:
{incoming.data && incoming.data.length > 0 && (
  <section>
    <h4 className="text-sm font-semibold mb-2">Incoming requests</h4>
    <div className="space-y-2">
      {incoming.data.map((p) => (
        <div key={p.id} className="flex items-center justify-between p-2 border-2 border-amber-200 bg-amber-50 rounded dark:bg-amber-950/30">
          <div>
            <div className="font-medium text-sm">{p.sourceName}</div>
            <div className="text-xs text-muted-foreground">Requested via {p.pairingSource}</div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => reject.mutate(p.id)}>Reject</Button>
            <Button size="sm" onClick={() => approve.mutate(p.id)}>Approve</Button>
          </div>
        </div>
      ))}
    </div>
  </section>
)}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Manual smoke test**

- Generate a code on destination side
- Redeem on source side
- Verify "Incoming requests" section appears on destination's `/admin/links`
- Approve → both sides see the partnership in their lists

- [ ] **Step 6: Commit**

```bash
git add server/storage/praxisMode.ts server/routes/referralPartnerships.ts client/src/components/admin/ReferralPartnersCard.tsx
git commit -m "feat(ui): destination-side incoming partnership approval"
```

---

## Phase 10 — Onboarding tour + post-success discovery

### Task 19: `PraxisOnboardingTour` (4-step coachmark)

**Files:**
- Create: `client/src/components/praxis/PraxisOnboardingTour.tsx`
- Modify: `client/src/pages/anesthesia/OpCalendar.tsx` (mount the tour, gate on localStorage flag)

- [ ] **Step 1: Implement the tour component**

```tsx
// client/src/components/praxis/PraxisOnboardingTour.tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    selector: '[data-tour="linked-room-column"]',
    title: "Pick a destination",
    body: "Click a room — each represents one of your referral partner hospitals. Free time slots will appear in white; busy slots are muted.",
  },
  {
    selector: '[data-tour="linked-room-column"]',
    title: "Pick a time",
    body: "Drag or click in a free slot. Busy zones are blocked — pick a time that's open at the destination.",
  },
  {
    selector: '[data-tour="quick-schedule-dialog"]',
    title: "Fill the surgery details",
    body: "Same fields you know. If the patient is new, use the + to add them inline.",
  },
  {
    selector: '[data-tour="submit-button"]',
    title: "Submit",
    body: "Review what gets sent to the destination, then submit.",
  },
];

export function PraxisOnboardingTour() {
  const [stepIdx, setStepIdx] = useState<number>(() => {
    const stored = Number(localStorage.getItem("praxis-tour-step") ?? "0");
    if (localStorage.getItem("praxis-tour-completed") === "true") return -1;
    return stored;
  });
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (stepIdx < 0 || stepIdx >= STEPS.length) return;
    const el = document.querySelector(STEPS[stepIdx].selector);
    if (!el) {
      setPosition(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setPosition({ top: rect.bottom + 8, left: rect.left });
  }, [stepIdx]);

  if (stepIdx < 0 || stepIdx >= STEPS.length || !position) return null;
  const step = STEPS[stepIdx];

  return (
    <div
      style={{ position: "fixed", top: position.top, left: position.left, zIndex: 1000 }}
      className="bg-indigo-600 text-white p-3 rounded-lg shadow-xl max-w-xs"
    >
      <div className="text-xs opacity-80 mb-1">Step {stepIdx + 1} of {STEPS.length}</div>
      <div className="font-semibold text-sm">{step.title}</div>
      <p className="text-xs mt-1">{step.body}</p>
      <div className="flex justify-between items-center mt-3">
        <button
          className="text-xs underline opacity-80"
          onClick={() => { localStorage.setItem("praxis-tour-completed", "true"); setStepIdx(-1); }}
        >
          × Dismiss tour
        </button>
        <Button
          size="sm"
          onClick={() => {
            const next = stepIdx + 1;
            localStorage.setItem("praxis-tour-step", String(next));
            if (next >= STEPS.length) {
              localStorage.setItem("praxis-tour-completed", "true");
              setStepIdx(-1);
            } else {
              setStepIdx(next);
            }
          }}
        >
          {stepIdx === STEPS.length - 1 ? "Done" : "Next →"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `data-tour` attributes to the target elements**

- On the calendar's clinic-linked room column wrapper, add `data-tour="linked-room-column"`
- On the QuickCreateSurgeryDialog content wrapper, add `data-tour="quick-schedule-dialog"`
- On the dialog's submit button, add `data-tour="submit-button"`

- [ ] **Step 3: Mount the tour on the OR calendar page**

In `client/src/pages/anesthesia/OpCalendar.tsx` (or equivalent), import and mount:

```tsx
import { PraxisOnboardingTour } from "@/components/praxis/PraxisOnboardingTour";
// At the end of the page's JSX:
<PraxisOnboardingTour />
```

The tour reads `localStorage` itself — it only renders when not completed.

- [ ] **Step 4: Add a "Replay tour" item in `/admin/settings → Help`**

In Settings, add a Help section (or extend an existing one) with a button:

```tsx
<Button variant="outline" onClick={() => {
  localStorage.removeItem("praxis-tour-completed");
  localStorage.setItem("praxis-tour-step", "0");
  window.location.href = "/anesthesia/op";
}}>
  Replay onboarding tour
</Button>
```

- [ ] **Step 5: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/praxis/PraxisOnboardingTour.tsx client/src/pages/anesthesia/OpCalendar.tsx client/src/pages/admin/Settings.tsx
git commit -m "feat(onboarding): 4-step coachmark tour with replay-from-settings"
```

---

### Task 20: `PraxisDiscoveryPanel` (toast + side panel)

**Files:**
- Create: `client/src/components/praxis/PraxisDiscoveryPanel.tsx`
- Modify: the surgery submission success handler (likely in QuickCreateSurgeryDialog after a successful submit when in a clinic-linked room)

- [ ] **Step 1: Implement the panel component**

```tsx
// client/src/components/praxis/PraxisDiscoveryPanel.tsx
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

interface Props { destinationName: string; onClose?: () => void; }

export function PraxisDiscoveryPanel({ destinationName, onClose }: Props) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(() => localStorage.getItem("praxis-discovery-dismissed") !== "true");

  if (!open) return null;

  return (
    <>
      {/* Toast — appears top-center for 3s */}
      <DiscoveryToast destinationName={destinationName} />

      {/* Side panel */}
      <div className="fixed right-4 top-20 w-72 bg-card border rounded-lg shadow-lg z-40 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Suggested next steps</div>
          <button
            onClick={() => {
              localStorage.setItem("praxis-discovery-dismissed", "true");
              setOpen(false);
              onClose?.();
            }}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
          >×</button>
        </div>
        <div
          className="p-3 bg-muted/50 hover:bg-muted rounded mb-2 cursor-pointer"
          onClick={() => setLocation("/appointments")}
        >
          <div className="text-xs font-semibold">Appointments</div>
          <div className="text-xs text-muted-foreground mt-1">
            Manage consultations and follow-ups in your own calendar.
          </div>
        </div>
        <div
          className="p-3 bg-muted/50 hover:bg-muted rounded cursor-pointer"
          onClick={() => setLocation("/admin/links")}
        >
          <div className="text-xs font-semibold">Sharable booking &amp; questionnaire links</div>
          <div className="text-xs text-muted-foreground mt-1">
            Share your booking link and questionnaire with your patients.
          </div>
        </div>
      </div>
    </>
  );
}

function DiscoveryToast({ destinationName }: { destinationName: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(id);
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-2 rounded shadow-lg z-50 text-sm">
      ✓ Surgery submitted to {destinationName}
    </div>
  );
}
```

- [ ] **Step 2: Trigger the panel from the submission success handler**

In whichever component handles the post-submit flow (likely `QuickCreateSurgeryDialog` or the calendar page), after the mutation succeeds AND the room was clinic-linked AND the surgeon hasn't completed a submission before (`localStorage.getItem("praxis-first-submission-done") !== "true"`):

```tsx
// On successful submit with clinic-linked room:
if (selectedRoom?.linkedHospitalId && !localStorage.getItem("praxis-first-submission-done")) {
  localStorage.setItem("praxis-first-submission-done", "true");
  setDiscoveryPanelDestination(destinationHospitalName);
}

// In JSX:
{discoveryPanelDestination && (
  <PraxisDiscoveryPanel
    destinationName={discoveryPanelDestination}
    onClose={() => setDiscoveryPanelDestination(null)}
  />
)}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

- Activate a fresh source hospital
- Submit a surgery in a clinic-linked room
- Verify toast appears top-center for ~3s
- Verify side panel appears top-right with 2 cards
- Click Appointments → navigates to `/appointments`
- Click Sharable links → navigates to `/admin/links`
- Dismiss × → panel hides; reload → panel does not reappear

- [ ] **Step 5: Commit**

```bash
git add client/src/components/praxis/PraxisDiscoveryPanel.tsx client/src/components/anesthesia/QuickCreateSurgeryDialog.tsx
git commit -m "feat(onboarding): post-success toast + discovery panel (Appointments + Sharable links)"
```

---

## Phase 11 — Source-side cancel + archive

### Task 21: Cancel pending referral + archive rejected/cancelled tiles

**Files:**
- Modify: `server/routes/praxisMode.ts` (add cancel + archive endpoints)
- Modify: `server/storage/praxisMode.ts` (add `cancelPendingReferral`)
- Modify: the surgery tile / details component (verify exact path during execution — likely `client/src/components/anesthesia/SurgeryDetails.tsx`)

- [ ] **Step 1: Add the storage helper**

In `server/storage/praxisMode.ts`:

```ts
export async function cancelPendingReferral(input: {
  sourceSurgeryId: string;
  byUserId: string;
}) {
  const [src] = await db.select().from(surgeries).where(eq(surgeries.id, input.sourceSurgeryId));
  if (!src) throw new Error("surgery not found");
  if (src.referralStatus !== "pending_external") throw new Error("not pending — cannot cancel via this path");

  await db.transaction(async (tx) => {
    if (src.externalRequestId) {
      await tx.update(externalSurgeryRequests)
        .set({ status: "declined", cancellationReason: "cancelled_by_source" } as any)
        .where(eq(externalSurgeryRequests.id, src.externalRequestId));
    }
    await tx.update(surgeries)
      .set({ referralStatus: "cancelled_external", isArchived: true, archivedAt: new Date(), archivedBy: input.byUserId } as any)
      .where(eq(surgeries.id, input.sourceSurgeryId));
  });
}
```

- [ ] **Step 2: Add the endpoint**

In `server/routes/praxisMode.ts`:

```ts
import { cancelPendingReferral } from "../storage/praxisMode";

praxisModeRouter.post("/api/surgeries/:id/cancel-referral", async (req: any, res) => {
  const userId = process.env.NODE_ENV === "test" && req.headers["x-test-user-id"]
    ? String(req.headers["x-test-user-id"])
    : req.user?.id;
  if (!userId) return res.status(401).json({ error: "not authenticated" });
  try {
    await cancelPendingReferral({ sourceSurgeryId: req.params.id, byUserId: userId });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Add UI actions to the surgery tile / details**

In the surgery details component, conditionally render:

```tsx
{surgery.referralStatus === "pending_external" && (
  <Button size="sm" variant="destructive" onClick={() => cancelMutation.mutate(surgery.id)}>
    Cancel referral
  </Button>
)}
{(surgery.referralStatus === "rejected_external" || surgery.referralStatus === "cancelled_external") && !surgery.isArchived && (
  <Button size="sm" variant="outline" onClick={() => archiveMutation.mutate(surgery.id)}>
    Archive
  </Button>
)}
```

The archive mutation calls the existing `/api/anesthesia/surgeries/:id/archive` endpoint.

- [ ] **Step 4: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Manual smoke test**

- Submit a referral → verify "Cancel referral" appears on the pending tile
- Click Cancel → tile disappears from calendar (archived) AND destination's inbox shows status=declined
- Have a destination reject a different submission → verify "Archive" appears, click → tile disappears

- [ ] **Step 6: Commit**

```bash
git add server/routes/praxisMode.ts server/storage/praxisMode.ts client/src/components/anesthesia/SurgeryDetails.tsx
git commit -m "feat(referral): source-side cancel pending + archive rejected/cancelled"
```

---

## Phase 12 — Final verification

### Task 22: Lint, typecheck, full test suite, manual end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Run typecheck**

Run: `npm run check`
Expected: PASS — zero errors.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: ALL tests pass. Fix any newly-broken existing tests before continuing.

- [ ] **Step 3: Run the spec-coverage check on the documented endpoints**

Run: `npx vitest run tests/public-docs.test.ts`
Expected: PASS — if any new public-facing endpoint was added to `PUBLIC_API_MD` (in `server/routes/publicDocs.ts`), tests confirm coverage. Note: praxis-mode endpoints are auth-gated admin endpoints — no `PUBLIC_API_MD` update required per CLAUDE.md rules.

- [ ] **Step 4: Manual end-to-end smoke**

End-to-end flow:
1. Log into surgeon-portal as a test surgeon with historical requests at 2+ destinations
2. Click "Activate" → fill praxis name + password → submit
3. Verify redirect to `/anesthesia/op`
4. Verify historical surgeries appear in destination-named rooms
5. Verify coachmark tour starts
6. Click a free slot in a clinic-linked room → Quick Schedule opens
7. Add a new patient via inline form (with all 4 demographic fields)
8. Fill surgery details, submit
9. Confirm in confirmation dialog → submission succeeds
10. Verify toast + discovery panel appear
11. As destination admin, accept the request → verify source-side tile turns green
12. As destination admin, reschedule → verify source-side banner + dashed-red tile + (if configured) email
13. Source surgeon clicks Acknowledge → banner clears, dashed-red border stays until rescheduled date passes
14. Cancel a pending referral → verify tile disappears + destination inbox updates

- [ ] **Step 5: Verify migration is idempotent and journal is sorted**

```bash
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='hospitals' AND column_name='tenant_type';"
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='surgery_rooms' AND column_name='linked_hospital_id';"
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_name='referral_partnerships';"
```

Run the migration twice locally (drizzle-kit push, then again) and confirm no errors.

- [ ] **Step 6: Commit any final fixes from manual testing**

```bash
git add -A
git commit -m "fix(praxis-mode): final adjustments from end-to-end smoke testing"
```

- [ ] **Step 7: Update memory after merge**

After the user confirms readiness to merge, update `/home/mau/.claude/projects/-home-mau-viali/memory/project_praxis_mode.md` to reflect the v2 architecture + completion status. Mark the original 20-task plan + 2026-05-13 spec as superseded.

---

## Final notes for the executor

- **Test DB:** every test in this plan assumes a real Postgres connection via `server/db`. Ensure `DATABASE_URL` points at a disposable test DB. The `afterAll` hooks clean up created rows but won't drop schema.
- **`app` export:** tests import from `../server/app`. Verify this is the actual Express app export path; if the project exports from `server/index.ts` or similar, adjust the import.
- **Test-mode auth headers:** the `x-test-user-id` / `x-test-hospital-id` headers used in tests require the route handlers to check `process.env.NODE_ENV === "test"`. Don't ship this code path in production builds.
- **Idempotency:** migration 0253 uses `IF NOT EXISTS` everywhere — safe to re-run. Other backfill/import operations are idempotent by checking `external_request_id` collisions.
- **Memory updates after completion:** `[Praxis Mode](project_praxis_mode.md)` in MEMORY.md should be updated to reference this v2 spec/plan after merge.
