# Praxis Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Praxis Mode — let external surgeons activate a full Viali tenant in place from inside the surgeon portal, plan surgeries on their own calendar, and send them to paired clinics via a cross-tenant referral mechanism with patient + intake snapshot payload, plus first-class reschedule/cancel alerting.

**Architecture:** A praxis is a `hospitals` row with `tenant_type='praxis'` + lean addon defaults. The surgeon's user is joined to it via the existing `userHospitalRoles` table. Cross-tenant referral piggybacks on `externalSurgeryRequests`: a praxis-side `surgeries` row is the source of truth on the praxis side; the destination clinic's `externalSurgeryRequests` row is the source of truth on the clinic side; they are linked bidirectionally so status flows (accept/reject/cancel/reschedule) are reliable. Activation atomically provisions the tenant + auto-pairs with the originating clinic + backfills historical requests as praxis-side surgeries. Reschedule/cancel triggers an in-app banner + out-of-band notification + persistent calendar marker.

**Tech Stack:** TypeScript, Node/Express, Drizzle ORM, PostgreSQL, Vitest, React (Vite), Tailwind. Project conventions: idempotent SQL migrations with `IF NOT EXISTS` + `DO $$ ... END $$` guards, integration tests that hit a real test DB, storage helpers in `server/storage/*`, route handlers in `server/routes/*`, frontend components in `client/src/components/*`.

**Spec:** [`docs/superpowers/specs/2026-05-13-praxis-mode-design.md`](../specs/2026-05-13-praxis-mode-design.md)

**Branch:** `feat/praxis-mode` (already created, spec committed at `5fc87979`)

---

## Phase 1 — Schema foundation

### Task 1: Migration `0253_praxis_mode.sql`

**Files:**
- Create: `migrations/0253_praxis_mode.sql`
- Modify: `migrations/meta/_journal.json` (drizzle auto-managed; verify after manual write)
- Test: `tests/praxis-mode-migration.test.ts`

- [ ] **Step 1: Write failing migration idempotency test**

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
  it("applies cleanly on a fresh schema and is idempotent on re-run", async () => {
    const ddl = fs.readFileSync(MIGRATION, "utf8");
    // Run twice — second run must not throw
    await db.execute(sql.raw(ddl));
    await db.execute(sql.raw(ddl));

    const cols = await db.execute(sql.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='hospitals' AND column_name='tenant_type'`));
    expect(cols.rows.length).toBe(1);

    const surgCols = await db.execute(sql.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='surgeries'
        AND column_name IN ('target_hospital_id','external_request_id','referral_status','referral_note','last_clinic_reschedule_at','reschedule_acknowledged_at','reschedule_history')`));
    expect(surgCols.rows.length).toBe(7);

    const extCols = await db.execute(sql.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='external_surgery_requests'
        AND column_name IN ('source_hospital_id','source_surgery_id','patient_snapshot')`));
    expect(extCols.rows.length).toBe(3);

    const qCols = await db.execute(sql.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='patient_questionnaire_responses'
        AND column_name IN ('imported_from_praxis','imported_from_praxis_at','imported_field_sources')`));
    expect(qCols.rows.length).toBe(3);

    const tbl = await db.execute(sql.raw(`
      SELECT table_name FROM information_schema.tables WHERE table_name='clinic_pairings'`));
    expect(tbl.rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-migration.test.ts`
Expected: FAIL — migration file does not exist (ENOENT) or columns missing.

- [ ] **Step 3: Write the migration**

```sql
-- migrations/0253_praxis_mode.sql
-- Praxis Mode: tenant_type discriminator + cross-tenant referral fields + clinic_pairings.

-- 1. hospitals.tenant_type discriminator (clinic | praxis)
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS tenant_type VARCHAR DEFAULT 'clinic';

-- 2. surgeries: cross-tenant referral fields
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS target_hospital_id VARCHAR;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS external_request_id VARCHAR;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS referral_status VARCHAR DEFAULT 'local';
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS referral_note TEXT;

-- 3. surgeries: reschedule/cancel alert fields
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS last_clinic_reschedule_at TIMESTAMP;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS reschedule_acknowledged_at TIMESTAMP;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS reschedule_history JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_surgeries_target_hospital_id ON surgeries(target_hospital_id);
CREATE INDEX IF NOT EXISTS idx_surgeries_external_request_id ON surgeries(external_request_id);
CREATE INDEX IF NOT EXISTS idx_surgeries_referral_status ON surgeries(referral_status);

-- 4. external_surgery_requests: back-references + payload
ALTER TABLE external_surgery_requests ADD COLUMN IF NOT EXISTS source_hospital_id VARCHAR;
ALTER TABLE external_surgery_requests ADD COLUMN IF NOT EXISTS source_surgery_id VARCHAR;
ALTER TABLE external_surgery_requests ADD COLUMN IF NOT EXISTS patient_snapshot JSONB;

-- 4b. patient_questionnaire_responses: praxis-import provenance for questionnaire dedup
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS imported_from_praxis BOOLEAN DEFAULT false;
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS imported_from_praxis_at TIMESTAMP;
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS imported_field_sources JSONB;

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

-- 5. clinic_pairings
CREATE TABLE IF NOT EXISTS clinic_pairings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  praxis_hospital_id VARCHAR NOT NULL,
  clinic_hospital_id VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'active',
  pairing_source VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_pairings_praxis ON clinic_pairings(praxis_hospital_id);
CREATE INDEX IF NOT EXISTS idx_clinic_pairings_clinic ON clinic_pairings(clinic_hospital_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_pairings_unique_pair'
      AND conrelid = 'clinic_pairings'::regclass
  ) THEN
    ALTER TABLE clinic_pairings ADD CONSTRAINT clinic_pairings_unique_pair
      UNIQUE (praxis_hospital_id, clinic_hospital_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_pairings_praxis_hospital_id_hospitals_id_fk'
      AND conrelid = 'clinic_pairings'::regclass
  ) THEN
    ALTER TABLE clinic_pairings ADD CONSTRAINT clinic_pairings_praxis_hospital_id_hospitals_id_fk
      FOREIGN KEY (praxis_hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_pairings_clinic_hospital_id_hospitals_id_fk'
      AND conrelid = 'clinic_pairings'::regclass
  ) THEN
    ALTER TABLE clinic_pairings ADD CONSTRAINT clinic_pairings_clinic_hospital_id_hospitals_id_fk
      FOREIGN KEY (clinic_hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE;
  END IF;
END $$;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/praxis-mode-migration.test.ts`
Expected: PASS — all four assertions hold; second migration application is a no-op.

- [ ] **Step 5: Apply the migration to the dev DB**

Run: `npx drizzle-kit push` to bring the dev DB up to date. Confirm "Changes applied" with no pending diffs.

- [ ] **Step 6: Commit**

```bash
git add migrations/0253_praxis_mode.sql tests/praxis-mode-migration.test.ts
git commit -m "feat(schema): praxis mode columns + clinic_pairings (migration 0253)"
```

---

### Task 2: Drizzle schema additions

**Files:**
- Modify: `shared/schema.ts` (sections: hospitals, surgeries, externalSurgeryRequests; add `clinicPairings` definition)

- [ ] **Step 1: Add `tenantType` to hospitals**

In `shared/schema.ts`, in the `hospitals` table definition (around `pgTable("hospitals", { ... })`), add after the last column before the closing brace:

```ts
tenantType: varchar("tenant_type").default("clinic"), // 'clinic' | 'praxis'
```

- [ ] **Step 2: Add cross-tenant + reschedule fields to surgeries**

In the `surgeries` table definition, add (anywhere appropriate among existing fields):

```ts
targetHospitalId: varchar("target_hospital_id"),
externalRequestId: varchar("external_request_id"),
referralStatus: varchar("referral_status").default("local"),
// 'local' | 'pending_external' | 'confirmed_external' | 'rejected_external' | 'cancelled_external'
referralNote: text("referral_note"),
lastClinicRescheduleAt: timestamp("last_clinic_reschedule_at"),
rescheduleAcknowledgedAt: timestamp("reschedule_acknowledged_at"),
rescheduleHistory: jsonb("reschedule_history").default(sql`'[]'::jsonb`),
```

- [ ] **Step 3: Add snapshot fields to externalSurgeryRequests + praxis-import fields to patientQuestionnaireResponses**

In the `externalSurgeryRequests` table definition, add:

```ts
sourceHospitalId: varchar("source_hospital_id").references(() => hospitals.id, { onDelete: "set null" }),
sourceSurgeryId: varchar("source_surgery_id"),
patientSnapshot: jsonb("patient_snapshot"),
```

In the `patientQuestionnaireResponses` table definition (around line 4525 of `shared/schema.ts`), add:

```ts
importedFromPraxis: boolean("imported_from_praxis").default(false),
importedFromPraxisAt: timestamp("imported_from_praxis_at"),
importedFieldSources: jsonb("imported_field_sources"),
// shape: { allergies: 'praxis_referral', medications: 'praxis_referral', conditions: 'praxis_referral', ... }
```

- [ ] **Step 4: Define `clinicPairings` table**

Add a new export near the other table definitions:

```ts
export const clinicPairings = pgTable("clinic_pairings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  praxisHospitalId: varchar("praxis_hospital_id").notNull()
    .references(() => hospitals.id, { onDelete: "cascade" }),
  clinicHospitalId: varchar("clinic_hospital_id").notNull()
    .references(() => hospitals.id, { onDelete: "cascade" }),
  status: varchar("status").notNull().default("active"),
  // 'active' | 'pending' | 'suspended' | 'revoked'
  pairingSource: varchar("pairing_source").notNull(),
  // 'auto_on_provision' | 'manual_code'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_clinic_pairings_praxis").on(table.praxisHospitalId),
  index("idx_clinic_pairings_clinic").on(table.clinicHospitalId),
  uniqueIndex("clinic_pairings_unique_pair").on(table.praxisHospitalId, table.clinicHospitalId),
]);
```

- [ ] **Step 5: Run typecheck to verify**

Run: `npm run check`
Expected: PASS — no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(schema): praxis mode columns + clinicPairings in drizzle schema"
```

---

## Phase 2 — Storage helpers

### Task 3: Tenant provisioning + feature defaults helper

**Files:**
- Create: `server/storage/praxisMode.ts`
- Test: `tests/praxis-mode-storage.test.ts`

- [ ] **Step 1: Write failing test for `provisionPraxisTenant`**

```ts
// tests/praxis-mode-storage.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { hospitals, users, userHospitalRoles, clinicPairings } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { provisionPraxisTenant } from "../server/storage/praxisMode";

const created = { hospitals: [] as string[], users: [] as string[] };
afterAll(async () => {
  if (created.hospitals.length) await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  await pool.end();
});

async function makeClinic(name: string) {
  const [h] = await db.insert(hospitals).values({ name, tenantType: "clinic" }).returning();
  created.hospitals.push(h.id);
  return h;
}

async function makeSurgeon(email: string) {
  const [u] = await db.insert(users).values({ email, firstName: "Test", lastName: "Surg" }).returning();
  created.users.push(u.id);
  return u;
}

describe("provisionPraxisTenant", () => {
  it("creates a hospitals row with tenant_type='praxis', binds the surgeon as admin, auto-pairs the originating clinic", async () => {
    const clinic = await makeClinic(`Clinic ${Date.now()}`);
    const surgeon = await makeSurgeon(`s-${Date.now()}@test.local`);

    const result = await provisionPraxisTenant({
      surgeonUserId: surgeon.id,
      originatingClinicId: clinic.id,
      praxisName: "Praxis Mueller",
    });

    created.hospitals.push(result.praxisHospitalId);

    const [praxis] = await db.select().from(hospitals).where(eq(hospitals.id, result.praxisHospitalId));
    expect(praxis.tenantType).toBe("praxis");
    expect(praxis.name).toBe("Praxis Mueller");

    const roles = await db.select().from(userHospitalRoles).where(eq(userHospitalRoles.hospitalId, result.praxisHospitalId));
    expect(roles.length).toBe(1);
    expect(roles[0].userId).toBe(surgeon.id);
    expect(roles[0].role).toBe("admin");

    const pair = await db.select().from(clinicPairings).where(eq(clinicPairings.praxisHospitalId, result.praxisHospitalId));
    expect(pair.length).toBe(1);
    expect(pair[0].clinicHospitalId).toBe(clinic.id);
    expect(pair[0].status).toBe("active");
    expect(pair[0].pairingSource).toBe("auto_on_provision");
  });

  it("applies lean addon defaults — addonSurgery off, addonClinic off, addonAmbulantEligibility on", async () => {
    const clinic = await makeClinic(`Clinic ${Date.now()}`);
    const surgeon = await makeSurgeon(`s-${Date.now()}-b@test.local`);
    const result = await provisionPraxisTenant({
      surgeonUserId: surgeon.id, originatingClinicId: clinic.id, praxisName: "P2",
    });
    created.hospitals.push(result.praxisHospitalId);
    const [praxis] = await db.select().from(hospitals).where(eq(hospitals.id, result.praxisHospitalId));
    expect(praxis.addonClinic).toBe(true);          // patient mgmt + appointments
    expect(praxis.addonQuestionnaire).toBe(true);   // intake forms
    expect(praxis.addonAmbulantEligibility).toBe(true);
    expect(praxis.addonSurgery).toBe(false);        // no OR planning
    expect(praxis.addonMonitor).toBe(false);
    expect(praxis.addonLogistics).toBe(false);
  });

  it("is atomic — if the role insert fails, no orphan hospital remains", async () => {
    const clinic = await makeClinic(`Clinic ${Date.now()}`);
    await expect(provisionPraxisTenant({
      surgeonUserId: "non-existent-user-id",
      originatingClinicId: clinic.id,
      praxisName: "Will Fail",
    })).rejects.toThrow();
    const orphan = await db.select().from(hospitals).where(eq(hospitals.name, "Will Fail"));
    expect(orphan.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-storage.test.ts -t provisionPraxisTenant`
Expected: FAIL — `provisionPraxisTenant` is not exported from `server/storage/praxisMode`.

- [ ] **Step 3: Implement `provisionPraxisTenant`**

```ts
// server/storage/praxisMode.ts
import { db } from "../db";
import { hospitals, userHospitalRoles, clinicPairings } from "@shared/schema";

export const PRAXIS_ADDON_DEFAULTS = {
  // ON
  addonClinic: true,           // patient mgmt + appointments + invoices
  addonQuestionnaire: true,    // intake forms
  addonAmbulantEligibility: true,
  addonPatientChat: true,
  // OFF
  addonSurgery: false,         // OR planning
  addonMonitor: false,
  addonLogistics: false,
  addonWorktime: false,
  addonRetell: false,
  addonDispocura: false,
} as const;

export interface ProvisionPraxisInput {
  surgeonUserId: string;
  originatingClinicId: string;
  praxisName: string;
  /** Optional overrides pulled from surgeon profile (address, timezone, etc). */
  profile?: { address?: string; phone?: string; timezone?: string; locale?: string };
}

export interface ProvisionPraxisResult {
  praxisHospitalId: string;
  clinicPairingId: string;
}

export async function provisionPraxisTenant(input: ProvisionPraxisInput): Promise<ProvisionPraxisResult> {
  return await db.transaction(async (tx) => {
    const [praxis] = await tx.insert(hospitals).values({
      name: input.praxisName,
      tenantType: "praxis",
      address: input.profile?.address,
      phone: input.profile?.phone,
      timezone: input.profile?.timezone ?? "Europe/Zurich",
      locale: input.profile?.locale ?? "de-CH",
      ...PRAXIS_ADDON_DEFAULTS,
    }).returning();

    await tx.insert(userHospitalRoles).values({
      userId: input.surgeonUserId,
      hospitalId: praxis.id,
      role: "admin",
    });

    const [pair] = await tx.insert(clinicPairings).values({
      praxisHospitalId: praxis.id,
      clinicHospitalId: input.originatingClinicId,
      status: "active",
      pairingSource: "auto_on_provision",
    }).returning();

    return { praxisHospitalId: praxis.id, clinicPairingId: pair.id };
  });
}
```

> **Note on `hospitals` schema:** if any of the columns referenced (`address`, `phone`, `timezone`, `locale`) do not exist with those exact names, drop them from the insert — the function only needs `name` and `tenantType` to satisfy the tests. Verify column names in `shared/schema.ts` before writing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/praxis-mode-storage.test.ts -t provisionPraxisTenant`
Expected: PASS — all three sub-tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/storage/praxisMode.ts tests/praxis-mode-storage.test.ts
git commit -m "feat(storage): provisionPraxisTenant — atomic tenant + role + auto-pair"
```

---

### Task 4: Clinic pairing helpers

**Files:**
- Modify: `server/storage/praxisMode.ts`
- Modify: `tests/praxis-mode-storage.test.ts`

- [ ] **Step 1: Write failing tests for `listPairedClinics`, `createPairingByCode`, `approvePairing`, `revokePairing`**

Append to `tests/praxis-mode-storage.test.ts`:

```ts
import {
  listPairedClinics,
  createPairingByCode,
  approvePairing,
  revokePairing,
  generatePairingCode,
} from "../server/storage/praxisMode";

describe("clinic pairing helpers", () => {
  it("listPairedClinics returns active pairings only, hydrated with clinic data", async () => {
    const c1 = await makeClinic(`A ${Date.now()}`);
    const c2 = await makeClinic(`B ${Date.now()}`);
    const s = await makeSurgeon(`p-list-${Date.now()}@t.local`);
    const { praxisHospitalId } = await provisionPraxisTenant({
      surgeonUserId: s.id, originatingClinicId: c1.id, praxisName: "P",
    });
    created.hospitals.push(praxisHospitalId);

    await db.insert(clinicPairings).values({
      praxisHospitalId, clinicHospitalId: c2.id, status: "revoked", pairingSource: "manual_code",
    });

    const list = await listPairedClinics(praxisHospitalId);
    expect(list.length).toBe(1);
    expect(list[0].clinicHospitalId).toBe(c1.id);
    expect(list[0].clinicName).toBe(c1.name);
  });

  it("createPairingByCode + approvePairing flow", async () => {
    const clinic = await makeClinic(`Clinic ${Date.now()}`);
    const s = await makeSurgeon(`p-code-${Date.now()}@t.local`);
    const { praxisHospitalId } = await provisionPraxisTenant({
      surgeonUserId: s.id, originatingClinicId: clinic.id, praxisName: "P",
    });
    created.hospitals.push(praxisHospitalId);

    const code = await generatePairingCode(clinic.id);
    expect(code).toMatch(/^[A-Z0-9]{8}$/);

    const other = await makeClinic(`Other ${Date.now()}`);
    const codeOther = await generatePairingCode(other.id);

    const pending = await createPairingByCode({ praxisHospitalId, code: codeOther });
    expect(pending.status).toBe("pending");

    await approvePairing({ pairingId: pending.id, approverClinicId: other.id });

    const list = await listPairedClinics(praxisHospitalId);
    expect(list.map(p => p.clinicHospitalId).sort()).toEqual([clinic.id, other.id].sort());
  });

  it("revokePairing flips status to revoked but keeps the row", async () => {
    const clinic = await makeClinic(`Clinic ${Date.now()}`);
    const s = await makeSurgeon(`p-rev-${Date.now()}@t.local`);
    const { praxisHospitalId, clinicPairingId } = await provisionPraxisTenant({
      surgeonUserId: s.id, originatingClinicId: clinic.id, praxisName: "P",
    });
    created.hospitals.push(praxisHospitalId);

    await revokePairing({ pairingId: clinicPairingId, actor: "praxis" });
    const all = await db.select().from(clinicPairings).where(eq(clinicPairings.id, clinicPairingId));
    expect(all[0].status).toBe("revoked");
  });

  it("createPairingByCode rejects an unknown code", async () => {
    const clinic = await makeClinic(`Clinic ${Date.now()}`);
    const s = await makeSurgeon(`p-bad-${Date.now()}@t.local`);
    const { praxisHospitalId } = await provisionPraxisTenant({
      surgeonUserId: s.id, originatingClinicId: clinic.id, praxisName: "P",
    });
    created.hospitals.push(praxisHospitalId);
    await expect(createPairingByCode({ praxisHospitalId, code: "ZZZZZZZZ" })).rejects.toThrow(/unknown pairing code/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-storage.test.ts -t "clinic pairing"`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement pairing helpers**

Append to `server/storage/praxisMode.ts`:

```ts
import { eq, and } from "drizzle-orm";
import { hospitals as hospitalsTable, clinicPairings as cp } from "@shared/schema";
import crypto from "crypto";

// In-memory store for short-lived pairing codes. Codes live as TTL entries.
// For v1 we accept the in-memory store; a future task can persist to Redis or DB.
const PAIRING_CODE_TTL_MS = 30 * 60 * 1000;
const pairingCodes = new Map<string, { clinicHospitalId: string; expiresAt: number }>();

export async function generatePairingCode(clinicHospitalId: string): Promise<string> {
  const code = crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 chars
  pairingCodes.set(code, { clinicHospitalId, expiresAt: Date.now() + PAIRING_CODE_TTL_MS });
  return code;
}

export async function listPairedClinics(praxisHospitalId: string) {
  const rows = await db.select({
    id: cp.id,
    clinicHospitalId: cp.clinicHospitalId,
    status: cp.status,
    pairingSource: cp.pairingSource,
    createdAt: cp.createdAt,
    clinicName: hospitalsTable.name,
  })
  .from(cp)
  .leftJoin(hospitalsTable, eq(cp.clinicHospitalId, hospitalsTable.id))
  .where(and(eq(cp.praxisHospitalId, praxisHospitalId), eq(cp.status, "active")));
  return rows;
}

export async function createPairingByCode(input: { praxisHospitalId: string; code: string }) {
  const entry = pairingCodes.get(input.code);
  if (!entry || entry.expiresAt < Date.now()) {
    pairingCodes.delete(input.code);
    throw new Error(`unknown pairing code: ${input.code}`);
  }
  pairingCodes.delete(input.code);
  const [pair] = await db.insert(cp).values({
    praxisHospitalId: input.praxisHospitalId,
    clinicHospitalId: entry.clinicHospitalId,
    status: "pending",
    pairingSource: "manual_code",
  }).returning();
  return pair;
}

export async function approvePairing(input: { pairingId: string; approverClinicId: string }) {
  const [pair] = await db.select().from(cp).where(eq(cp.id, input.pairingId));
  if (!pair) throw new Error("pairing not found");
  if (pair.clinicHospitalId !== input.approverClinicId) throw new Error("not authorized to approve");
  await db.update(cp).set({ status: "active" }).where(eq(cp.id, input.pairingId));
}

export async function revokePairing(input: { pairingId: string; actor: "praxis" | "clinic" }) {
  await db.update(cp).set({ status: "revoked" }).where(eq(cp.id, input.pairingId));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/praxis-mode-storage.test.ts -t "clinic pairing"`
Expected: PASS — all four sub-tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/storage/praxisMode.ts tests/praxis-mode-storage.test.ts
git commit -m "feat(storage): clinic pairing helpers (list/createByCode/approve/revoke)"
```

---

### Task 5: Backfill helper

**Files:**
- Modify: `server/storage/praxisMode.ts`
- Create: `tests/praxis-mode-backfill.test.ts`

- [ ] **Step 1: Write failing test for `backfillSurgeonHistory`**

```ts
// tests/praxis-mode-backfill.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { hospitals, users, surgeries, externalSurgeryRequests, patients } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { provisionPraxisTenant, backfillSurgeonHistory } from "../server/storage/praxisMode";

const created = { hospitals: [] as string[], users: [] as string[], surgeries: [] as string[], requests: [] as string[], patients: [] as string[] };
afterAll(async () => {
  if (created.surgeries.length) await db.delete(surgeries).where(inArray(surgeries.id, created.surgeries));
  if (created.requests.length) await db.delete(externalSurgeryRequests).where(inArray(externalSurgeryRequests.id, created.requests));
  if (created.patients.length) await db.delete(patients).where(inArray(patients.id, created.patients));
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  if (created.hospitals.length) await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  await pool.end();
});

describe("backfillSurgeonHistory", () => {
  it("creates praxis-side surgeries + patients for every prior external request, idempotent", async () => {
    const [clinic] = await db.insert(hospitals).values({ name: `Clinic ${Date.now()}`, tenantType: "clinic" }).returning();
    created.hospitals.push(clinic.id);
    const [surgeon] = await db.insert(users).values({ email: `s-bf-${Date.now()}@t.local`, firstName: "X", lastName: "Y" }).returning();
    created.users.push(surgeon.id);

    // seed 2 prior requests from this surgeon
    const seed = await db.insert(externalSurgeryRequests).values([
      { hospitalId: clinic.id, surgeonId: surgeon.id, patientFirstName: "A", patientLastName: "One", status: "approved" },
      { hospitalId: clinic.id, surgeonId: surgeon.id, patientFirstName: "B", patientLastName: "Two", status: "pending" },
    ]).returning();
    created.requests.push(...seed.map(s => s.id));

    const { praxisHospitalId } = await provisionPraxisTenant({
      surgeonUserId: surgeon.id, originatingClinicId: clinic.id, praxisName: "P",
    });
    created.hospitals.push(praxisHospitalId);

    const r1 = await backfillSurgeonHistory({ praxisHospitalId, surgeonUserId: surgeon.id });
    expect(r1.surgeriesCreated).toBe(2);
    expect(r1.patientsCreated).toBe(2);

    // idempotency: second run is a no-op
    const r2 = await backfillSurgeonHistory({ praxisHospitalId, surgeonUserId: surgeon.id });
    expect(r2.surgeriesCreated).toBe(0);
    expect(r2.patientsCreated).toBe(0);

    const surgs = await db.select().from(surgeries).where(eq(surgeries.hospitalId, praxisHospitalId));
    created.surgeries.push(...surgs.map(s => s.id));
    expect(surgs.length).toBe(2);
    expect(surgs.every(s => s.targetHospitalId === clinic.id)).toBe(true);
    expect(surgs.map(s => s.referralStatus).sort()).toEqual(["confirmed_external", "pending_external"]);

    const pts = await db.select().from(patients).where(eq(patients.hospitalId, praxisHospitalId));
    created.patients.push(...pts.map(p => p.id));
    expect(pts.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-backfill.test.ts`
Expected: FAIL — `backfillSurgeonHistory` not exported.

- [ ] **Step 3: Implement `backfillSurgeonHistory`**

Append to `server/storage/praxisMode.ts`:

```ts
import { externalSurgeryRequests, surgeries, patients } from "@shared/schema";

function mapRequestStatusToReferralStatus(reqStatus?: string | null): string {
  switch ((reqStatus ?? "").toLowerCase()) {
    case "approved":
    case "scheduled":
    case "done":
      return "confirmed_external";
    case "rejected":
      return "rejected_external";
    case "cancelled":
      return "cancelled_external";
    default:
      return "pending_external";
  }
}

export async function backfillSurgeonHistory(input: { praxisHospitalId: string; surgeonUserId: string; sinceYears?: number }) {
  const sinceMs = (input.sinceYears ?? 5) * 365 * 24 * 3600 * 1000;
  const cutoff = new Date(Date.now() - sinceMs);

  const requests = await db.select().from(externalSurgeryRequests)
    .where(and(
      eq(externalSurgeryRequests.surgeonId, input.surgeonUserId),
      // No createdAt filter on legacy rows; we skip the cutoff if column unknown:
    ));

  let surgeriesCreated = 0;
  let patientsCreated = 0;

  for (const req of requests) {
    // Idempotency: skip if a praxis-side surgery already mirrors this request
    const existing = await db.select({ id: surgeries.id }).from(surgeries)
      .where(and(
        eq(surgeries.hospitalId, input.praxisHospitalId),
        eq(surgeries.externalRequestId, req.id),
      ));
    if (existing.length > 0) continue;

    // Create patient in praxis tenant
    const [pt] = await db.insert(patients).values({
      hospitalId: input.praxisHospitalId,
      firstName: req.patientFirstName ?? "Unknown",
      lastName: req.patientLastName ?? "Patient",
      dateOfBirth: req.patientDateOfBirth ?? null,
      phone: req.patientPhone ?? null,
      email: req.patientEmail ?? null,
    }).returning();
    patientsCreated++;

    await db.insert(surgeries).values({
      hospitalId: input.praxisHospitalId,
      patientId: pt.id,
      targetHospitalId: req.hospitalId,
      externalRequestId: req.id,
      referralStatus: mapRequestStatusToReferralStatus(req.status),
      surgeryType: req.surgeryType ?? null,
      surgeonId: input.surgeonUserId,
    });
    surgeriesCreated++;
  }

  return { surgeriesCreated, patientsCreated };
}
```

> **Note:** verify exact column names on `externalSurgeryRequests` (e.g. `patientFirstName` vs `patient_first_name`) by reading `shared/schema.ts` before writing — adjust as needed. The mapping is the contract; column names are codebase-specific.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/praxis-mode-backfill.test.ts`
Expected: PASS — surgeries + patients created; second run no-op.

- [ ] **Step 5: Commit**

```bash
git add server/storage/praxisMode.ts tests/praxis-mode-backfill.test.ts
git commit -m "feat(storage): idempotent backfill of surgeon's historical requests"
```

---

## Phase 3 — Activation endpoint

### Task 6: `POST /api/surgeon-portal/praxis/activate`

**Files:**
- Create: `server/routes/praxisMode.ts`
- Modify: `server/routes/index.ts` (or wherever routes are wired) to mount the new router
- Test: `tests/praxis-mode-routes.test.ts`

- [ ] **Step 1: Write failing route test**

```ts
// tests/praxis-mode-routes.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server/app"; // adjust import to wherever the Express app is exported
import { db, pool } from "../server/db";
import { hospitals, users, userHospitalRoles, clinicPairings } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const created = { hospitals: [] as string[], users: [] as string[] };
afterAll(async () => {
  if (created.hospitals.length) await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  await pool.end();
});

describe("POST /api/surgeon-portal/praxis/activate", () => {
  it("provisions praxis + auto-pairs + returns the new hospital id", async () => {
    const [clinic] = await db.insert(hospitals).values({ name: `Clinic ${Date.now()}`, tenantType: "clinic" }).returning();
    created.hospitals.push(clinic.id);
    const [surgeon] = await db.insert(users).values({ email: `act-${Date.now()}@t.local`, firstName: "S", lastName: "S" }).returning();
    created.users.push(surgeon.id);

    // The surgeon must have an existing role / OTP session for `clinic`. Helper:
    await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: clinic.id, role: "external_surgeon" });

    const res = await request(app)
      .post("/api/surgeon-portal/praxis/activate")
      .set("x-test-user-id", surgeon.id)            // test-only header bypassing OTP — see step 3
      .set("x-test-clinic-id", clinic.id)
      .send({ praxisName: "Praxis Mueller" });

    expect(res.status).toBe(200);
    expect(res.body.praxisHospitalId).toBeTruthy();
    created.hospitals.push(res.body.praxisHospitalId);

    const [praxis] = await db.select().from(hospitals).where(eq(hospitals.id, res.body.praxisHospitalId));
    expect(praxis.tenantType).toBe("praxis");

    const pairs = await db.select().from(clinicPairings).where(eq(clinicPairings.praxisHospitalId, res.body.praxisHospitalId));
    expect(pairs.length).toBe(1);
    expect(pairs[0].clinicHospitalId).toBe(clinic.id);
  });

  it("returns 409 if the surgeon already owns a praxis tenant", async () => {
    const [clinic] = await db.insert(hospitals).values({ name: `Clinic ${Date.now()}-b`, tenantType: "clinic" }).returning();
    created.hospitals.push(clinic.id);
    const [surgeon] = await db.insert(users).values({ email: `dup-${Date.now()}@t.local`, firstName: "D", lastName: "D" }).returning();
    created.users.push(surgeon.id);
    await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: clinic.id, role: "external_surgeon" });

    const first = await request(app)
      .post("/api/surgeon-portal/praxis/activate")
      .set("x-test-user-id", surgeon.id).set("x-test-clinic-id", clinic.id)
      .send({ praxisName: "First" });
    expect(first.status).toBe(200);
    created.hospitals.push(first.body.praxisHospitalId);

    const second = await request(app)
      .post("/api/surgeon-portal/praxis/activate")
      .set("x-test-user-id", surgeon.id).set("x-test-clinic-id", clinic.id)
      .send({ praxisName: "Second" });
    expect(second.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-routes.test.ts`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Implement the route**

```ts
// server/routes/praxisMode.ts
import { Router } from "express";
import { db } from "../db";
import { userHospitalRoles, hospitals } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { provisionPraxisTenant, backfillSurgeonHistory } from "../storage/praxisMode";

export const praxisModeRouter = Router();

// Authentication helper — uses the surgeon portal's existing OTP session resolver.
// In test mode (NODE_ENV==='test'), allow override via x-test-user-id / x-test-clinic-id headers.
function getActiveSurgeonContext(req: any): { userId: string; clinicId: string } | null {
  if (process.env.NODE_ENV === "test" && req.headers["x-test-user-id"]) {
    return { userId: String(req.headers["x-test-user-id"]), clinicId: String(req.headers["x-test-clinic-id"]) };
  }
  const sess = (req as any).surgeonPortalSession;
  if (!sess?.userId || !sess?.hospitalId) return null;
  return { userId: sess.userId, clinicId: sess.hospitalId };
}

praxisModeRouter.post("/api/surgeon-portal/praxis/activate", async (req, res) => {
  const ctx = getActiveSurgeonContext(req);
  if (!ctx) return res.status(401).json({ error: "not authenticated" });

  // Reject if surgeon already owns a praxis tenant
  const existing = await db.select({ hId: userHospitalRoles.hospitalId, tenant: hospitals.tenantType })
    .from(userHospitalRoles)
    .leftJoin(hospitals, eq(userHospitalRoles.hospitalId, hospitals.id))
    .where(and(eq(userHospitalRoles.userId, ctx.userId), eq(hospitals.tenantType, "praxis")));
  if (existing.length > 0) {
    return res.status(409).json({ error: "praxis already exists", praxisHospitalId: existing[0].hId });
  }

  const praxisName = String(req.body?.praxisName ?? "").trim();
  if (!praxisName) return res.status(400).json({ error: "praxisName required" });

  try {
    const { praxisHospitalId } = await provisionPraxisTenant({
      surgeonUserId: ctx.userId,
      originatingClinicId: ctx.clinicId,
      praxisName,
    });

    // Backfill (best-effort — failures don't block activation)
    try {
      await backfillSurgeonHistory({ praxisHospitalId, surgeonUserId: ctx.userId });
    } catch (err) {
      console.error("backfill failed", err);
    }

    return res.json({ praxisHospitalId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? "activation failed" });
  }
});
```

Wire the router in `server/routes/index.ts` (or wherever other routers are mounted): `app.use(praxisModeRouter)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/praxis-mode-routes.test.ts`
Expected: PASS — both 200-activation and 409-duplicate cases pass.

- [ ] **Step 5: Commit**

```bash
git add server/routes/praxisMode.ts server/routes/index.ts tests/praxis-mode-routes.test.ts
git commit -m "feat(api): POST /api/surgeon-portal/praxis/activate (provision + backfill)"
```

---

## Phase 4 — Cross-tenant referral

### Task 7: Create praxis-side surgery + send to clinic (`POST /api/praxis/surgeries`)

**Files:**
- Modify: `server/routes/praxisMode.ts`
- Modify: `server/storage/praxisMode.ts` (add `createReferralFromPraxis`)
- Create: `tests/praxis-mode-referral.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/praxis-mode-referral.test.ts
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server/app";
import { db, pool } from "../server/db";
import { hospitals, users, userHospitalRoles, patients, surgeries, externalSurgeryRequests, clinicPairings } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { provisionPraxisTenant } from "../server/storage/praxisMode";

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
  const [clinic] = await db.insert(hospitals).values({ name: `Clinic ${Date.now()}`, tenantType: "clinic" }).returning();
  created.hospitals.push(clinic.id);
  const [surgeon] = await db.insert(users).values({ email: `ref-${Date.now()}@t.local`, firstName: "R", lastName: "S" }).returning();
  created.users.push(surgeon.id);
  await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: clinic.id, role: "external_surgeon" });
  const { praxisHospitalId } = await provisionPraxisTenant({ surgeonUserId: surgeon.id, originatingClinicId: clinic.id, praxisName: "P" });
  created.hospitals.push(praxisHospitalId);
  await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: praxisHospitalId, role: "admin" });
  const [pt] = await db.insert(patients).values({ hospitalId: praxisHospitalId, firstName: "A", lastName: "B" }).returning();
  created.patients.push(pt.id);
  return { clinic, surgeon, praxisHospitalId, patient: pt };
}

describe("POST /api/praxis/surgeries — create + send referral", () => {
  it("creates praxis surgery + clinic external request with snapshot, linked bidirectionally", async () => {
    const { clinic, surgeon, praxisHospitalId, patient } = await setup();

    const res = await request(app)
      .post("/api/praxis/surgeries")
      .set("x-test-user-id", surgeon.id)
      .set("x-test-hospital-id", praxisHospitalId)
      .send({
        patientId: patient.id,
        targetHospitalId: clinic.id,
        surgeryType: "Septoplasty",
        plannedDate: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
        clinicalReason: "Chronic obstruction",
        consentGiven: true,
        intakeFields: { allergies: "none" },
      });
    expect(res.status).toBe(200);
    created.surgeries.push(res.body.surgeryId);
    created.requests.push(res.body.externalRequestId);

    const [s] = await db.select().from(surgeries).where(eq(surgeries.id, res.body.surgeryId));
    expect(s.referralStatus).toBe("pending_external");
    expect(s.targetHospitalId).toBe(clinic.id);
    expect(s.externalRequestId).toBe(res.body.externalRequestId);

    const [r] = await db.select().from(externalSurgeryRequests).where(eq(externalSurgeryRequests.id, res.body.externalRequestId));
    expect(r.hospitalId).toBe(clinic.id);
    expect(r.sourceHospitalId).toBe(praxisHospitalId);
    expect(r.sourceSurgeryId).toBe(res.body.surgeryId);
    expect(r.patientSnapshot).toBeTruthy();
    expect((r.patientSnapshot as any).intake.allergies).toBe("none");
    expect((r.patientSnapshot as any).consents.given).toBe(true);
  });

  it("rejects when the target clinic is not in clinic_pairings as 'active'", async () => {
    const { surgeon, praxisHospitalId, patient } = await setup();
    const [randomClinic] = await db.insert(hospitals).values({ name: `Unpaired ${Date.now()}`, tenantType: "clinic" }).returning();
    created.hospitals.push(randomClinic.id);

    const res = await request(app)
      .post("/api/praxis/surgeries")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", praxisHospitalId)
      .send({ patientId: patient.id, targetHospitalId: randomClinic.id, surgeryType: "X", consentGiven: true });
    expect(res.status).toBe(403);
  });

  it("rejects when consentGiven is false", async () => {
    const { clinic, surgeon, praxisHospitalId, patient } = await setup();
    const res = await request(app)
      .post("/api/praxis/surgeries")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", praxisHospitalId)
      .send({ patientId: patient.id, targetHospitalId: clinic.id, surgeryType: "X", consentGiven: false });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "create + send referral"`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Implement `createReferralFromPraxis` and the route**

Append to `server/storage/praxisMode.ts`:

```ts
export interface CreateReferralInput {
  praxisHospitalId: string;
  surgeonUserId: string;
  patientId: string;
  targetHospitalId: string;
  surgeryType: string;
  plannedDate?: string;
  clinicalReason?: string;
  intakeFields?: Record<string, unknown>;
  consentGiven: boolean;
}

export interface CreateReferralResult {
  surgeryId: string;
  externalRequestId: string;
}

export async function createReferralFromPraxis(input: CreateReferralInput): Promise<CreateReferralResult> {
  if (!input.consentGiven) throw new Error("consent required");

  // Verify pairing is active
  const pair = await db.select().from(clinicPairings).where(and(
    eq(clinicPairings.praxisHospitalId, input.praxisHospitalId),
    eq(clinicPairings.clinicHospitalId, input.targetHospitalId),
    eq(clinicPairings.status, "active"),
  ));
  if (pair.length === 0) throw new Error("clinic not paired");

  // Load praxis patient for snapshot
  const [pt] = await db.select().from(patients).where(and(
    eq(patients.id, input.patientId),
    eq(patients.hospitalId, input.praxisHospitalId),
  ));
  if (!pt) throw new Error("patient not found in praxis tenant");

  const snapshot = {
    demographics: {
      firstName: pt.firstName, lastName: pt.lastName, dateOfBirth: pt.dateOfBirth,
      phone: pt.phone, email: pt.email,
    },
    intake: input.intakeFields ?? {},
    ambulant_eligibility: null,
    consents: { given: true, scope: "surgery_referral", at: new Date().toISOString(), userId: input.surgeonUserId },
    shared_at: new Date().toISOString(),
  };

  return await db.transaction(async (tx) => {
    const [s] = await tx.insert(surgeries).values({
      hospitalId: input.praxisHospitalId,
      patientId: input.patientId,
      surgeonId: input.surgeonUserId,
      surgeryType: input.surgeryType,
      targetHospitalId: input.targetHospitalId,
      referralStatus: "pending_external",
      referralNote: input.clinicalReason ?? null,
      scheduledDate: input.plannedDate ? new Date(input.plannedDate) : null,
    }).returning();

    const [r] = await tx.insert(externalSurgeryRequests).values({
      hospitalId: input.targetHospitalId,
      surgeonId: input.surgeonUserId,
      sourceHospitalId: input.praxisHospitalId,
      sourceSurgeryId: s.id,
      patientFirstName: pt.firstName,
      patientLastName: pt.lastName,
      surgeryType: input.surgeryType,
      patientSnapshot: snapshot,
      status: "pending",
    }).returning();

    await tx.update(surgeries).set({ externalRequestId: r.id }).where(eq(surgeries.id, s.id));

    return { surgeryId: s.id, externalRequestId: r.id };
  });
}
```

Append to `server/routes/praxisMode.ts`:

```ts
function getActivePraxisContext(req: any): { userId: string; praxisHospitalId: string } | null {
  if (process.env.NODE_ENV === "test" && req.headers["x-test-user-id"]) {
    return { userId: String(req.headers["x-test-user-id"]), praxisHospitalId: String(req.headers["x-test-hospital-id"]) };
  }
  const sess = (req as any).user;
  if (!sess?.id || !sess?.activeHospitalId) return null;
  return { userId: sess.id, praxisHospitalId: sess.activeHospitalId };
}

praxisModeRouter.post("/api/praxis/surgeries", async (req, res) => {
  const ctx = getActivePraxisContext(req);
  if (!ctx) return res.status(401).json({ error: "not authenticated" });
  const { patientId, targetHospitalId, surgeryType, plannedDate, clinicalReason, intakeFields, consentGiven } = req.body ?? {};
  if (!patientId || !targetHospitalId || !surgeryType) return res.status(400).json({ error: "missing fields" });
  try {
    const r = await createReferralFromPraxis({
      praxisHospitalId: ctx.praxisHospitalId, surgeonUserId: ctx.userId,
      patientId, targetHospitalId, surgeryType, plannedDate, clinicalReason, intakeFields, consentGiven: !!consentGiven,
    });
    return res.json(r);
  } catch (err: any) {
    const msg = err?.message ?? "";
    if (msg === "consent required") return res.status(400).json({ error: msg });
    if (msg === "clinic not paired") return res.status(403).json({ error: msg });
    if (msg === "patient not found in praxis tenant") return res.status(404).json({ error: msg });
    return res.status(500).json({ error: msg || "referral failed" });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "create + send referral"`
Expected: PASS — all three sub-tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/storage/praxisMode.ts server/routes/praxisMode.ts tests/praxis-mode-referral.test.ts
git commit -m "feat(referral): praxis-side create + send cross-tenant referral with snapshot"
```

---

### Task 8: Clinic-side accept creates patient from snapshot + status push back

**Files:**
- Modify: `server/storage/praxisMode.ts` (add `pushReferralStatus`)
- Modify: `server/routes/externalSurgery.ts` (extend the existing accept endpoint to handle praxis-sourced requests)
- Modify: `tests/praxis-mode-referral.test.ts`

- [ ] **Step 1: Write failing test for the accept flow**

Append to `tests/praxis-mode-referral.test.ts`:

```ts
describe("clinic-side accept of praxis-sourced request", () => {
  it("creates clinic-side patient from snapshot + updates praxis surgery to confirmed_external", async () => {
    const { clinic, surgeon, praxisHospitalId, patient } = await setup();
    const make = await request(app).post("/api/praxis/surgeries")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", praxisHospitalId)
      .send({ patientId: patient.id, targetHospitalId: clinic.id, surgeryType: "Septoplasty",
              plannedDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
              consentGiven: true, intakeFields: { allergies: "none" } });
    created.surgeries.push(make.body.surgeryId);
    created.requests.push(make.body.externalRequestId);

    // simulate clinic admin user
    const [adminUser] = await db.insert(users).values({ email: `adm-${Date.now()}@t.local`, firstName: "A", lastName: "A" }).returning();
    created.users.push(adminUser.id);
    await db.insert(userHospitalRoles).values({ userId: adminUser.id, hospitalId: clinic.id, role: "admin" });

    const accept = await request(app)
      .post(`/api/external-surgery-requests/${make.body.externalRequestId}/accept`)
      .set("x-test-user-id", adminUser.id).set("x-test-hospital-id", clinic.id)
      .send({ confirmedDate: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString() });
    expect(accept.status).toBe(200);
    expect(accept.body.clinicPatientId).toBeTruthy();
    created.patients.push(accept.body.clinicPatientId);

    const [clinicPt] = await db.select().from(patients).where(eq(patients.id, accept.body.clinicPatientId));
    expect(clinicPt.hospitalId).toBe(clinic.id);
    expect(clinicPt.firstName).toBe("A");

    const [praxisSurg] = await db.select().from(surgeries).where(eq(surgeries.id, make.body.surgeryId));
    expect(praxisSurg.referralStatus).toBe("confirmed_external");
    expect(praxisSurg.scheduledDate).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "clinic-side accept"`
Expected: FAIL — accept endpoint does not handle praxis-sourced rows.

- [ ] **Step 3: Implement `pushReferralStatus` + accept endpoint changes**

Append to `server/storage/praxisMode.ts`:

```ts
export async function pushReferralStatus(input: {
  externalRequestId: string;
  newStatus: "confirmed_external" | "rejected_external" | "cancelled_external";
  confirmedDate?: Date | null;
  note?: string | null;
}) {
  const [r] = await db.select().from(externalSurgeryRequests).where(eq(externalSurgeryRequests.id, input.externalRequestId));
  if (!r) return;
  if (!r.sourceSurgeryId) return; // not praxis-sourced

  const update: Record<string, unknown> = { referralStatus: input.newStatus };
  if (input.confirmedDate) update.scheduledDate = input.confirmedDate;
  if (input.note != null) update.referralNote = input.note;

  await db.update(surgeries).set(update).where(eq(surgeries.id, r.sourceSurgeryId));
}

export async function createClinicPatientFromSnapshot(input: {
  clinicHospitalId: string;
  externalRequestId: string;
}): Promise<string> {
  const [r] = await db.select().from(externalSurgeryRequests).where(eq(externalSurgeryRequests.id, input.externalRequestId));
  if (!r?.patientSnapshot) {
    // Legacy or non-praxis row: fall back to existing fields
    const [pt] = await db.insert(patients).values({
      hospitalId: input.clinicHospitalId,
      firstName: r?.patientFirstName ?? "Unknown",
      lastName: r?.patientLastName ?? "Patient",
    }).returning();
    return pt.id;
  }
  const snap = r.patientSnapshot as any;
  const [pt] = await db.insert(patients).values({
    hospitalId: input.clinicHospitalId,
    firstName: snap.demographics?.firstName ?? "Unknown",
    lastName: snap.demographics?.lastName ?? "Patient",
    dateOfBirth: snap.demographics?.dateOfBirth ?? null,
    phone: snap.demographics?.phone ?? null,
    email: snap.demographics?.email ?? null,
  }).returning();
  return pt.id;
}
```

In `server/routes/externalSurgery.ts`, add a new accept route (or extend the existing PATCH handler — choose whichever fits the existing pattern; the test calls `POST /api/external-surgery-requests/:id/accept`):

```ts
import { createClinicPatientFromSnapshot, pushReferralStatus } from "../storage/praxisMode";

router.post("/api/external-surgery-requests/:id/accept", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  const id = req.params.id;
  const ctx = process.env.NODE_ENV === "test" && req.headers["x-test-hospital-id"]
    ? { hospitalId: String(req.headers["x-test-hospital-id"]) }
    : { hospitalId: req.user?.activeHospitalId };
  if (!ctx.hospitalId) return res.status(401).json({ error: "no active hospital" });

  const clinicPatientId = await createClinicPatientFromSnapshot({ clinicHospitalId: ctx.hospitalId, externalRequestId: id });
  await db.update(externalSurgeryRequests).set({ status: "approved" }).where(eq(externalSurgeryRequests.id, id));

  await pushReferralStatus({
    externalRequestId: id,
    newStatus: "confirmed_external",
    confirmedDate: req.body?.confirmedDate ? new Date(req.body.confirmedDate) : null,
  });

  return res.json({ clinicPatientId });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "clinic-side accept"`
Expected: PASS — clinic patient created, praxis surgery status mirrors.

- [ ] **Step 5: Commit**

```bash
git add server/storage/praxisMode.ts server/routes/externalSurgery.ts tests/praxis-mode-referral.test.ts
git commit -m "feat(referral): clinic accept creates patient from snapshot + pushes status back to praxis"
```

---

### Task 9: Reject / cancel status push

**Files:**
- Modify: `server/routes/externalSurgery.ts`
- Modify: `tests/praxis-mode-referral.test.ts`

- [ ] **Step 1: Write failing tests for reject + cancel**

Append to `tests/praxis-mode-referral.test.ts`:

```ts
describe("reject + cancel push back to praxis", () => {
  it("rejecting a praxis-sourced request flips praxis surgery to rejected_external", async () => {
    const { clinic, surgeon, praxisHospitalId, patient } = await setup();
    const make = await request(app).post("/api/praxis/surgeries")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", praxisHospitalId)
      .send({ patientId: patient.id, targetHospitalId: clinic.id, surgeryType: "X", consentGiven: true });
    created.surgeries.push(make.body.surgeryId);
    created.requests.push(make.body.externalRequestId);

    const [admin] = await db.insert(users).values({ email: `rej-${Date.now()}@t.local`, firstName: "A", lastName: "A" }).returning();
    created.users.push(admin.id);
    await db.insert(userHospitalRoles).values({ userId: admin.id, hospitalId: clinic.id, role: "admin" });

    const res = await request(app)
      .post(`/api/external-surgery-requests/${make.body.externalRequestId}/reject`)
      .set("x-test-user-id", admin.id).set("x-test-hospital-id", clinic.id)
      .send({ reason: "Patient unsuitable" });
    expect(res.status).toBe(200);

    const [praxisSurg] = await db.select().from(surgeries).where(eq(surgeries.id, make.body.surgeryId));
    expect(praxisSurg.referralStatus).toBe("rejected_external");
    expect(praxisSurg.referralNote).toBe("Patient unsuitable");
  });

  it("cancel after accept flips status to cancelled_external", async () => {
    const { clinic, surgeon, praxisHospitalId, patient } = await setup();
    const make = await request(app).post("/api/praxis/surgeries")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", praxisHospitalId)
      .send({ patientId: patient.id, targetHospitalId: clinic.id, surgeryType: "X", consentGiven: true });
    created.surgeries.push(make.body.surgeryId);
    created.requests.push(make.body.externalRequestId);

    const [admin] = await db.insert(users).values({ email: `can-${Date.now()}@t.local`, firstName: "A", lastName: "A" }).returning();
    created.users.push(admin.id);
    await db.insert(userHospitalRoles).values({ userId: admin.id, hospitalId: clinic.id, role: "admin" });

    await request(app).post(`/api/external-surgery-requests/${make.body.externalRequestId}/accept`)
      .set("x-test-user-id", admin.id).set("x-test-hospital-id", clinic.id).send({ confirmedDate: new Date().toISOString() });

    const cancel = await request(app)
      .post(`/api/external-surgery-requests/${make.body.externalRequestId}/cancel`)
      .set("x-test-user-id", admin.id).set("x-test-hospital-id", clinic.id)
      .send({ reason: "OR closed" });
    expect(cancel.status).toBe(200);

    const [praxisSurg] = await db.select().from(surgeries).where(eq(surgeries.id, make.body.surgeryId));
    expect(praxisSurg.referralStatus).toBe("cancelled_external");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "reject + cancel"`
Expected: FAIL — reject/cancel endpoints don't exist.

- [ ] **Step 3: Implement reject + cancel endpoints**

In `server/routes/externalSurgery.ts`:

```ts
router.post("/api/external-surgery-requests/:id/reject", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  const id = req.params.id;
  await db.update(externalSurgeryRequests).set({ status: "rejected" }).where(eq(externalSurgeryRequests.id, id));
  await pushReferralStatus({ externalRequestId: id, newStatus: "rejected_external", note: req.body?.reason ?? null });
  return res.json({ ok: true });
});

router.post("/api/external-surgery-requests/:id/cancel", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  const id = req.params.id;
  await db.update(externalSurgeryRequests).set({ status: "cancelled" }).where(eq(externalSurgeryRequests.id, id));
  await pushReferralStatus({ externalRequestId: id, newStatus: "cancelled_external", note: req.body?.reason ?? null });
  return res.json({ ok: true });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "reject + cancel"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/externalSurgery.ts tests/praxis-mode-referral.test.ts
git commit -m "feat(referral): clinic reject + cancel push status back to praxis surgery"
```

---

## Phase 5 — Reschedule / cancel alerting

### Task 10: Reschedule push + reschedule_history append + ack endpoint

**Files:**
- Modify: `server/storage/praxisMode.ts`
- Modify: `server/routes/externalSurgery.ts` (reschedule endpoint)
- Modify: `server/routes/praxisMode.ts` (ack endpoint)
- Create: `tests/praxis-mode-reschedule.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/praxis-mode-reschedule.test.ts
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server/app";
import { db, pool } from "../server/db";
import { hospitals, users, userHospitalRoles, patients, surgeries, externalSurgeryRequests } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { provisionPraxisTenant } from "../server/storage/praxisMode";

const created = { hospitals: [] as string[], users: [] as string[], surgeries: [] as string[], requests: [] as string[], patients: [] as string[] };
afterAll(async () => {
  if (created.surgeries.length) await db.delete(surgeries).where(inArray(surgeries.id, created.surgeries));
  if (created.requests.length) await db.delete(externalSurgeryRequests).where(inArray(externalSurgeryRequests.id, created.requests));
  if (created.patients.length) await db.delete(patients).where(inArray(patients.id, created.patients));
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  if (created.hospitals.length) await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  await pool.end();
});

describe("reschedule alerting", () => {
  it("clinic reschedule appends reschedule_history + bumps last_clinic_reschedule_at + mirrors date", async () => {
    const [clinic] = await db.insert(hospitals).values({ name: `Clinic ${Date.now()}`, tenantType: "clinic" }).returning();
    created.hospitals.push(clinic.id);
    const [surgeon] = await db.insert(users).values({ email: `rs-${Date.now()}@t.local`, firstName: "R", lastName: "S" }).returning();
    created.users.push(surgeon.id);
    await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: clinic.id, role: "external_surgeon" });
    const { praxisHospitalId } = await provisionPraxisTenant({ surgeonUserId: surgeon.id, originatingClinicId: clinic.id, praxisName: "P" });
    created.hospitals.push(praxisHospitalId);
    await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: praxisHospitalId, role: "admin" });
    const [pt] = await db.insert(patients).values({ hospitalId: praxisHospitalId, firstName: "A", lastName: "B" }).returning();
    created.patients.push(pt.id);
    const [adminUser] = await db.insert(users).values({ email: `adm-${Date.now()}@t.local`, firstName: "A", lastName: "A" }).returning();
    created.users.push(adminUser.id);
    await db.insert(userHospitalRoles).values({ userId: adminUser.id, hospitalId: clinic.id, role: "admin" });

    const oldDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const newDate = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();

    const make = await request(app).post("/api/praxis/surgeries")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", praxisHospitalId)
      .send({ patientId: pt.id, targetHospitalId: clinic.id, surgeryType: "X", plannedDate: oldDate, consentGiven: true });
    created.surgeries.push(make.body.surgeryId);
    created.requests.push(make.body.externalRequestId);

    await request(app).post(`/api/external-surgery-requests/${make.body.externalRequestId}/accept`)
      .set("x-test-user-id", adminUser.id).set("x-test-hospital-id", clinic.id)
      .send({ confirmedDate: oldDate });

    const res = await request(app)
      .post(`/api/external-surgery-requests/${make.body.externalRequestId}/reschedule`)
      .set("x-test-user-id", adminUser.id).set("x-test-hospital-id", clinic.id)
      .send({ newDate, note: "OR conflict" });
    expect(res.status).toBe(200);

    const [s] = await db.select().from(surgeries).where(eq(surgeries.id, make.body.surgeryId));
    expect(s.referralStatus).toBe("confirmed_external");
    expect(s.lastClinicRescheduleAt).toBeTruthy();
    const history = s.rescheduleHistory as Array<{ from_date: string; to_date: string; action: string; note?: string }>;
    expect(history.length).toBe(1);
    expect(history[0].action).toBe("rescheduled");
    expect(history[0].note).toBe("OR conflict");
    expect(new Date(s.scheduledDate!).toISOString()).toBe(newDate);
  });

  it("praxis-side ack clears alert (sets reschedule_acknowledged_at)", async () => {
    // ...setup mirror of above through the reschedule call
    const [clinic] = await db.insert(hospitals).values({ name: `Clinic2 ${Date.now()}`, tenantType: "clinic" }).returning();
    created.hospitals.push(clinic.id);
    const [surgeon] = await db.insert(users).values({ email: `ack-${Date.now()}@t.local`, firstName: "A", lastName: "K" }).returning();
    created.users.push(surgeon.id);
    await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: clinic.id, role: "external_surgeon" });
    const { praxisHospitalId } = await provisionPraxisTenant({ surgeonUserId: surgeon.id, originatingClinicId: clinic.id, praxisName: "P" });
    created.hospitals.push(praxisHospitalId);
    await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: praxisHospitalId, role: "admin" });
    const [pt] = await db.insert(patients).values({ hospitalId: praxisHospitalId, firstName: "A", lastName: "B" }).returning();
    created.patients.push(pt.id);
    const [adm] = await db.insert(users).values({ email: `adm2-${Date.now()}@t.local`, firstName: "A", lastName: "A" }).returning();
    created.users.push(adm.id);
    await db.insert(userHospitalRoles).values({ userId: adm.id, hospitalId: clinic.id, role: "admin" });

    const make = await request(app).post("/api/praxis/surgeries")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", praxisHospitalId)
      .send({ patientId: pt.id, targetHospitalId: clinic.id, surgeryType: "X",
              plannedDate: new Date(Date.now() + 7 * 86400000).toISOString(), consentGiven: true });
    created.surgeries.push(make.body.surgeryId);
    created.requests.push(make.body.externalRequestId);

    await request(app).post(`/api/external-surgery-requests/${make.body.externalRequestId}/accept`)
      .set("x-test-user-id", adm.id).set("x-test-hospital-id", clinic.id)
      .send({ confirmedDate: new Date(Date.now() + 7 * 86400000).toISOString() });
    await request(app).post(`/api/external-surgery-requests/${make.body.externalRequestId}/reschedule`)
      .set("x-test-user-id", adm.id).set("x-test-hospital-id", clinic.id)
      .send({ newDate: new Date(Date.now() + 14 * 86400000).toISOString(), note: "shift" });

    const ack = await request(app)
      .post(`/api/praxis/surgeries/${make.body.surgeryId}/ack-reschedule`)
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", praxisHospitalId)
      .send({});
    expect(ack.status).toBe(200);

    const [s] = await db.select().from(surgeries).where(eq(surgeries.id, make.body.surgeryId));
    expect(s.rescheduleAcknowledgedAt).toBeTruthy();
    expect(s.lastClinicRescheduleAt).toBeTruthy();
    expect(new Date(s.rescheduleAcknowledgedAt!) >= new Date(s.lastClinicRescheduleAt!)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-reschedule.test.ts`
Expected: FAIL — endpoints don't exist.

- [ ] **Step 3: Implement reschedule push + ack endpoint**

Append to `server/storage/praxisMode.ts`:

```ts
export async function pushRescheduleToPraxis(input: {
  externalRequestId: string;
  newDate: Date;
  note?: string | null;
}) {
  const [r] = await db.select().from(externalSurgeryRequests).where(eq(externalSurgeryRequests.id, input.externalRequestId));
  if (!r?.sourceSurgeryId) return;
  const [s] = await db.select().from(surgeries).where(eq(surgeries.id, r.sourceSurgeryId));
  if (!s) return;
  const now = new Date();
  const entry = {
    from_date: s.scheduledDate?.toISOString() ?? null,
    to_date: input.newDate.toISOString(),
    action: "rescheduled" as const,
    note: input.note ?? null,
    at: now.toISOString(),
  };
  const history = Array.isArray(s.rescheduleHistory) ? [...s.rescheduleHistory, entry] : [entry];
  await db.update(surgeries).set({
    scheduledDate: input.newDate,
    lastClinicRescheduleAt: now,
    rescheduleHistory: history,
  }).where(eq(surgeries.id, s.id));
}

export async function ackPraxisReschedule(input: { surgeryId: string; praxisHospitalId: string }) {
  await db.update(surgeries).set({ rescheduleAcknowledgedAt: new Date() })
    .where(and(eq(surgeries.id, input.surgeryId), eq(surgeries.hospitalId, input.praxisHospitalId)));
}
```

In `server/routes/externalSurgery.ts`:

```ts
import { pushRescheduleToPraxis } from "../storage/praxisMode";

router.post("/api/external-surgery-requests/:id/reschedule", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  const id = req.params.id;
  if (!req.body?.newDate) return res.status(400).json({ error: "newDate required" });
  await pushRescheduleToPraxis({ externalRequestId: id, newDate: new Date(req.body.newDate), note: req.body?.note });
  return res.json({ ok: true });
});
```

In `server/routes/praxisMode.ts`:

```ts
import { ackPraxisReschedule } from "../storage/praxisMode";

praxisModeRouter.post("/api/praxis/surgeries/:id/ack-reschedule", async (req, res) => {
  const ctx = getActivePraxisContext(req);
  if (!ctx) return res.status(401).json({ error: "not authenticated" });
  await ackPraxisReschedule({ surgeryId: req.params.id, praxisHospitalId: ctx.praxisHospitalId });
  return res.json({ ok: true });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/praxis-mode-reschedule.test.ts`
Expected: PASS — both reschedule + ack sub-tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/storage/praxisMode.ts server/routes/externalSurgery.ts server/routes/praxisMode.ts tests/praxis-mode-reschedule.test.ts
git commit -m "feat(referral): reschedule push w/ history + praxis-side ack endpoint"
```

---

## Phase 6 — Portal UI

### Task 11: Promo card + activation modal in surgeon portal

**Files:**
- Create: `client/src/components/surgeon-portal/PraxisActivationCard.tsx`
- Create: `client/src/components/surgeon-portal/PraxisActivationModal.tsx`
- Modify: `client/src/pages/SurgeonPortal.tsx` (mount the card on Submit tab)
- Create: `tests/PraxisActivationCard.test.tsx` (Vitest + React Testing Library — match existing FE test pattern, or skip FE unit tests if the project doesn't have them and rely on E2E later)

- [ ] **Step 1: Write the card component**

```tsx
// client/src/components/surgeon-portal/PraxisActivationCard.tsx
import { useState } from "react";
import { PraxisActivationModal } from "./PraxisActivationModal";

export function PraxisActivationCard({ submissionCount, onActivated }: { submissionCount: number; onActivated: (praxisHospitalId: string) => void }) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("praxis-card-dismissed") === "1");
  const [open, setOpen] = useState(false);

  if (dismissed) return null;
  if (submissionCount < 1) return null;

  return (
    <>
      <div className="rounded-md border p-4 bg-muted/30 mb-4" data-testid="praxis-activation-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-medium">Manage your own patients & calendar in Viali — included free.</div>
            <div className="text-sm text-muted-foreground mt-1">Plan your surgeries on your own calendar and send them to the clinic in one click.</div>
          </div>
          <div className="flex gap-2">
            <button className="text-sm underline" onClick={() => setOpen(true)}>Try it out →</button>
            <button className="text-sm text-muted-foreground" onClick={() => { localStorage.setItem("praxis-card-dismissed", "1"); setDismissed(true); }}>Don't show again</button>
          </div>
        </div>
      </div>
      <PraxisActivationModal open={open} onClose={() => setOpen(false)} onActivated={(id) => { setOpen(false); onActivated(id); }} />
    </>
  );
}
```

- [ ] **Step 2: Write the activation modal**

```tsx
// client/src/components/surgeon-portal/PraxisActivationModal.tsx
import { useState } from "react";

export function PraxisActivationModal({ open, onClose, onActivated }: { open: boolean; onClose: () => void; onActivated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function activate() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/surgeon-portal/praxis/activate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ praxisName: name }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const data = await res.json();
      onActivated(data.praxisHospitalId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" data-testid="praxis-modal">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-lg font-semibold mb-2">Activate your praxis Viali</h2>
        <p className="text-sm text-muted-foreground mb-4">We'll set up your own Viali workspace using your profile details. Your existing requests will appear in your new calendar. You can edit details anytime.</p>
        <label className="block text-sm mb-2">Praxis name</label>
        <input className="w-full border rounded p-2 mb-4" value={name} onChange={(e) => setName(e.target.value)} placeholder="Praxis Mueller" />
        {error && <div className="text-sm text-destructive mb-2">{error}</div>}
        <div className="flex justify-end gap-2">
          <button className="px-3 py-2" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="px-3 py-2 bg-primary text-primary-foreground rounded" disabled={busy || !name.trim()} onClick={activate}>
            {busy ? "Activating..." : "Activate my praxis Viali"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount the card in `SurgeonPortal.tsx`**

In the Submit tab section, near the top of the form area, render:

```tsx
import { PraxisActivationCard } from "@/components/surgeon-portal/PraxisActivationCard";

// inside the Submit tab:
<PraxisActivationCard
  submissionCount={pastSubmissionCount}
  onActivated={(praxisId) => {
    // soft reload: refresh portal state, surfacing the new tabs (Task 12)
    window.location.reload();
  }}
/>
```

`pastSubmissionCount` is the count of `externalSurgeryRequests` the surgeon has submitted; if not already exposed by the portal API, surface it as part of the existing portal bootstrap query result, or use any heuristic ≥ 1 if the count is not readily available.

- [ ] **Step 4: Run typecheck + dev smoke**

Run: `npm run check`
Expected: PASS — no TS errors.

Then start the dev server (`npm run dev`) and verify in a browser:
1. Log into the surgeon portal as a surgeon who has submitted at least one request.
2. The promo card is visible on the Submit tab.
3. Clicking "Try it out" opens the modal.
4. Filling in a name + clicking Activate hits the endpoint, succeeds, and the page reloads.
5. Verify in the DB that a new `hospitals` row with `tenant_type='praxis'` exists.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/surgeon-portal/ client/src/pages/SurgeonPortal.tsx
git commit -m "feat(portal): praxis activation promo card + modal"
```

---

### Task 11a: Onboarding tour (3-step guided tour after activation)

**Files:**
- Create: `client/src/components/praxis/PraxisOnboardingTour.tsx`
- Modify: `client/src/pages/SurgeonPortal.tsx` (mount the tour when `portalState.praxis` exists and the localStorage flag is unset)

The tour is a non-modal popover that walks the surgeon through three steps right after activation. Steps point at the Patients tab, the "Schedule surgery" action on a patient, and a reassurance about the data round-trip. Skip and Done both set `localStorage.praxis-tour-completed='1'`.

- [ ] **Step 1: Write the tour component**

```tsx
// client/src/components/praxis/PraxisOnboardingTour.tsx
import { useState, useEffect } from "react";

const STORAGE_KEY = "praxis-tour-completed";

const STEPS = [
  {
    title: "1 / 3 — Your patient list",
    body: "Your past referrals are already here as patients in the Patients tab. Click any patient to see their full record.",
    targetSelector: "[data-tour='patients-tab']",
  },
  {
    title: "2 / 3 — Plan a surgery",
    body: "Open a patient → click 'Schedule surgery' → pick a destination clinic → fill in surgery type → send. The clinic you were already submitting to is pre-selected.",
    targetSelector: "[data-tour='schedule-surgery-button']",
  },
  {
    title: "3 / 3 — Your patient's data carries over",
    body: "Anything they've already filled in (intake, allergies, medications, prior history) travels with the referral. Your patient won't be asked the same questions twice.",
    targetSelector: "[data-tour='referral-form-snapshot']",
  },
];

export function PraxisOnboardingTour() {
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");

  useEffect(() => {
    // Highlight the target element with an outline for the current step
    if (completed) return;
    const t = document.querySelector(STEPS[step].targetSelector);
    if (t) (t as HTMLElement).style.outline = "2px solid #f59e0b";
    return () => { if (t) (t as HTMLElement).style.outline = ""; };
  }, [step, completed]);

  function finish() {
    localStorage.setItem(STORAGE_KEY, "1");
    setCompleted(true);
  }

  if (completed) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  return (
    <div className="fixed bottom-6 right-6 z-40 w-96 rounded-lg border bg-white shadow-lg p-4" data-testid="praxis-onboarding-tour">
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold">{current.title}</h3>
        <button className="text-xs text-muted-foreground" onClick={finish}>Skip</button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{current.body}</p>
      <div className="flex justify-between">
        <button className="text-sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Back</button>
        {isLast
          ? <button className="px-3 py-1 bg-primary text-primary-foreground rounded" onClick={finish}>Done</button>
          : <button className="px-3 py-1 bg-primary text-primary-foreground rounded" onClick={() => setStep(step + 1)}>Next →</button>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `data-tour` markers to the targets**

In `client/src/pages/SurgeonPortal.tsx`, on the Patients tab trigger element, add `data-tour="patients-tab"`. In `SurgeryReferralForm.tsx` (Task 13), on the outer wrapper or the "Schedule + send to clinic" button, add `data-tour="schedule-surgery-button"`. On the snapshot consent section, add `data-tour="referral-form-snapshot"`.

- [ ] **Step 3: Mount the tour**

In `SurgeonPortal.tsx`, just below the tab bar, render the tour for praxis users who haven't completed it:

```tsx
import { PraxisOnboardingTour } from "@/components/praxis/PraxisOnboardingTour";
// ...
{portalState.praxis && <PraxisOnboardingTour />}
```

- [ ] **Step 4: Smoke test**

Activate a fresh praxis (or clear `localStorage.praxis-tour-completed` for an existing one) → tour appears bottom-right → Next walks through 3 steps with target highlights → Done dismisses + flag persists across reloads.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/praxis/PraxisOnboardingTour.tsx client/src/pages/SurgeonPortal.tsx
git commit -m "feat(praxis): 3-step onboarding tour after activation"
```

---

### Task 12: Praxis tabs (Patients + Schedule) appear after activation

**Files:**
- Modify: `client/src/pages/SurgeonPortal.tsx`
- Create: `client/src/components/praxis/PraxisPatientsTab.tsx`
- Create: `client/src/components/praxis/PraxisScheduleTab.tsx`
- Modify: `server/routes/surgeonPortal.ts` (expose praxis state in the portal bootstrap response)

- [ ] **Step 1: Server: expose praxis state in portal bootstrap**

In `server/routes/surgeonPortal.ts`, locate the existing portal bootstrap handler (the one returning the surgeon's session/profile/state) and extend the response payload:

```ts
import { userHospitalRoles, hospitals } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// inside the bootstrap response builder:
const praxisRoles = await db.select({ id: hospitals.id, name: hospitals.name })
  .from(userHospitalRoles)
  .leftJoin(hospitals, eq(userHospitalRoles.hospitalId, hospitals.id))
  .where(and(eq(userHospitalRoles.userId, surgeonUserId), eq(hospitals.tenantType, "praxis")));

return res.json({
  ...existingPayload,
  praxis: praxisRoles[0] ?? null,
});
```

- [ ] **Step 2: Client: conditionally show Patients + Schedule tabs**

In `client/src/pages/SurgeonPortal.tsx`, the existing tab list (Submit + Calendar) is extended:

```tsx
import { PraxisPatientsTab } from "@/components/praxis/PraxisPatientsTab";
import { PraxisScheduleTab } from "@/components/praxis/PraxisScheduleTab";

// where tabs are defined:
const tabs = [
  { id: "submit", label: "Submit new request", body: <SubmitForm /> },
  { id: "calendar", label: "My calendar", body: <Calendar /> },
  ...(portalState.praxis ? [
    { id: "patients", label: "Patients", body: <PraxisPatientsTab praxisHospitalId={portalState.praxis.id} /> },
    { id: "schedule", label: "Schedule", body: <PraxisScheduleTab praxisHospitalId={portalState.praxis.id} /> },
  ] : []),
];
```

- [ ] **Step 3: Stub the two new components, reusing existing clinic-side patient/calendar primitives**

```tsx
// client/src/components/praxis/PraxisPatientsTab.tsx
import { PatientList } from "@/components/patients/PatientList"; // existing clinic-side component
export function PraxisPatientsTab({ praxisHospitalId }: { praxisHospitalId: string }) {
  return <PatientList hospitalId={praxisHospitalId} mode="praxis" />;
}
```

```tsx
// client/src/components/praxis/PraxisScheduleTab.tsx
import { PlanningCalendar } from "@/components/PlanningCalendar"; // existing
export function PraxisScheduleTab({ praxisHospitalId }: { praxisHospitalId: string }) {
  return <PlanningCalendar hospitalId={praxisHospitalId} mode="praxis" />;
}
```

If the existing `PatientList` / `PlanningCalendar` components don't accept `hospitalId` / `mode` props, extend their props additively — do not duplicate logic. Default behavior unchanged for clinic-side callers.

- [ ] **Step 4: Smoke test in browser**

`npm run dev` → log in as the test praxis surgeon → verify the two new tabs appear, clicking each renders the existing clinic-side patient list / calendar scoped to the praxis tenant.

- [ ] **Step 5: Commit**

```bash
git add server/routes/surgeonPortal.ts client/src/pages/SurgeonPortal.tsx client/src/components/praxis/
git commit -m "feat(portal): patients + schedule tabs after praxis activation"
```

---

### Task 13: Praxis surgery referral form (UI for `POST /api/praxis/surgeries`)

**Files:**
- Create: `client/src/components/praxis/SurgeryReferralForm.tsx`
- Modify: existing patient detail or schedule UI to expose a "Schedule surgery (refer to clinic)" action

- [ ] **Step 1: Write the form component**

```tsx
// client/src/components/praxis/SurgeryReferralForm.tsx
import { useEffect, useState } from "react";

interface PairedClinic { clinicHospitalId: string; clinicName: string; }

export function SurgeryReferralForm({ patientId, praxisHospitalId, onCreated, onClose }: {
  patientId: string; praxisHospitalId: string;
  onCreated: (r: { surgeryId: string; externalRequestId: string }) => void;
  onClose: () => void;
}) {
  const [clinics, setClinics] = useState<PairedClinic[]>([]);
  const [targetHospitalId, setTargetHospitalId] = useState("");
  const [surgeryType, setSurgeryType] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [clinicalReason, setClinicalReason] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/praxis/${praxisHospitalId}/paired-clinics`, { credentials: "include" })
      .then(r => r.json()).then(setClinics);
  }, [praxisHospitalId]);

  // default-select the first paired clinic (originating clinic auto-paired at activation)
  useEffect(() => {
    if (clinics.length > 0 && !targetHospitalId) setTargetHospitalId(clinics[0].clinicHospitalId);
  }, [clinics, targetHospitalId]);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/praxis/surgeries", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, targetHospitalId, surgeryType, plannedDate, clinicalReason, consentGiven: consent }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      onCreated(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 p-4 border rounded">
      <h3 className="font-semibold">Schedule surgery (refer to clinic)</h3>
      <label className="block text-sm">Target clinic
        <select className="w-full border rounded p-2 mt-1" value={targetHospitalId} onChange={e => setTargetHospitalId(e.target.value)}>
          {clinics.map(c => <option key={c.clinicHospitalId} value={c.clinicHospitalId}>{c.clinicName}</option>)}
        </select>
      </label>
      <label className="block text-sm">Surgery type
        <input className="w-full border rounded p-2 mt-1" value={surgeryType} onChange={e => setSurgeryType(e.target.value)} />
      </label>
      <label className="block text-sm">Planned date
        <input type="datetime-local" className="w-full border rounded p-2 mt-1" value={plannedDate} onChange={e => setPlannedDate(e.target.value)} />
      </label>
      <label className="block text-sm">Clinical reason
        <textarea className="w-full border rounded p-2 mt-1" value={clinicalReason} onChange={e => setClinicalReason(e.target.value)} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
        <span>I confirm the patient has consented to sharing their medical data with the target clinic for the purpose of surgery.</span>
      </label>
      {error && <div className="text-sm text-destructive">{error}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} disabled={busy}>Cancel</button>
        <button className="px-3 py-2 bg-primary text-primary-foreground rounded" disabled={busy || !consent || !surgeryType || !targetHospitalId} onClick={submit}>
          {busy ? "Sending..." : "Schedule + send to clinic"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `GET /api/praxis/:praxisHospitalId/paired-clinics`**

In `server/routes/praxisMode.ts`:

```ts
import { listPairedClinics } from "../storage/praxisMode";

praxisModeRouter.get("/api/praxis/:praxisHospitalId/paired-clinics", async (req, res) => {
  const ctx = getActivePraxisContext(req);
  if (!ctx || ctx.praxisHospitalId !== req.params.praxisHospitalId) return res.status(401).json({ error: "not authenticated" });
  return res.json(await listPairedClinics(req.params.praxisHospitalId));
});
```

- [ ] **Step 3: Wire the form into the patient detail / schedule UI**

In the existing patient detail page used by the praxis Patients tab (most likely `client/src/pages/PatientDetail.tsx` or similar — grep `PatientDetail` to confirm), add a "Schedule surgery" button that opens the `SurgeryReferralForm` in a modal/sheet, gated on `tenant_type === 'praxis'`.

- [ ] **Step 4: Smoke test in browser**

`npm run dev` → log in as praxis surgeon → open a patient → click "Schedule surgery" → confirm clinic dropdown is populated → fill in fields → submit → verify (in DB) a new praxis-side `surgeries` row + clinic-side `externalSurgeryRequests` row exist and are linked.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/praxis/SurgeryReferralForm.tsx server/routes/praxisMode.ts
git add client/src/pages/PatientDetail.tsx  # or wherever the button was added
git commit -m "feat(praxis): surgery referral form + paired-clinics endpoint"
```

---

### Task 14: Reschedule alert UI (banner + calendar badge + ack)

**Files:**
- Create: `client/src/components/praxis/RescheduleAlertBanner.tsx`
- Create: `client/src/components/praxis/RescheduledBadge.tsx`
- Modify: `client/src/components/PlanningCalendar.tsx` (or whichever calendar is used in `PraxisScheduleTab`) to render `RescheduledBadge` on calendar entries with `lastClinicRescheduleAt > rescheduleAcknowledgedAt`
- Modify: `client/src/pages/SurgeonPortal.tsx` (mount the banner at the top of the praxis area)

- [ ] **Step 1: Write the banner**

```tsx
// client/src/components/praxis/RescheduleAlertBanner.tsx
import { useEffect, useState } from "react";

interface AlertItem { surgeryId: string; patientName: string; oldDate?: string | null; newDate: string; note?: string | null; }

export function RescheduleAlertBanner({ praxisHospitalId }: { praxisHospitalId: string }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  useEffect(() => {
    fetch(`/api/praxis/${praxisHospitalId}/pending-reschedule-alerts`, { credentials: "include" })
      .then(r => r.json()).then(setAlerts);
  }, [praxisHospitalId]);

  async function ack(surgeryId: string) {
    await fetch(`/api/praxis/surgeries/${surgeryId}/ack-reschedule`, { method: "POST", credentials: "include" });
    setAlerts(alerts.filter(a => a.surgeryId !== surgeryId));
  }

  if (alerts.length === 0) return null;
  return (
    <div className="space-y-2 mb-4">
      {alerts.map(a => (
        <div key={a.surgeryId} className="rounded-md border border-amber-300 bg-amber-50 p-3 flex items-start justify-between gap-4">
          <div className="text-sm">
            <strong>Surgery for {a.patientName} rescheduled by clinic</strong> — from {a.oldDate ? new Date(a.oldDate).toLocaleString() : "(unscheduled)"} to {new Date(a.newDate).toLocaleString()}.
            {a.note && <div className="text-xs text-muted-foreground mt-1">Clinic note: {a.note}</div>}
          </div>
          <button className="text-sm underline" onClick={() => ack(a.surgeryId)}>Acknowledge</button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add `GET /api/praxis/:hospitalId/pending-reschedule-alerts`**

In `server/routes/praxisMode.ts`:

```ts
praxisModeRouter.get("/api/praxis/:praxisHospitalId/pending-reschedule-alerts", async (req, res) => {
  const ctx = getActivePraxisContext(req);
  if (!ctx || ctx.praxisHospitalId !== req.params.praxisHospitalId) return res.status(401).json({ error: "not authenticated" });
  const rows = await db.select({
    surgeryId: surgeries.id,
    patientFirstName: patients.firstName,
    patientLastName: patients.lastName,
    scheduledDate: surgeries.scheduledDate,
    lastClinicRescheduleAt: surgeries.lastClinicRescheduleAt,
    rescheduleAcknowledgedAt: surgeries.rescheduleAcknowledgedAt,
    rescheduleHistory: surgeries.rescheduleHistory,
  })
  .from(surgeries)
  .leftJoin(patients, eq(surgeries.patientId, patients.id))
  .where(eq(surgeries.hospitalId, ctx.praxisHospitalId));

  const pending = rows.filter(r => r.lastClinicRescheduleAt && (!r.rescheduleAcknowledgedAt || r.rescheduleAcknowledgedAt < r.lastClinicRescheduleAt));
  return res.json(pending.map(r => {
    const last = Array.isArray(r.rescheduleHistory) ? r.rescheduleHistory.at(-1) as any : null;
    return {
      surgeryId: r.surgeryId,
      patientName: `${r.patientFirstName ?? ""} ${r.patientLastName ?? ""}`.trim(),
      oldDate: last?.from_date ?? null,
      newDate: last?.to_date ?? r.scheduledDate?.toISOString(),
      note: last?.note ?? null,
    };
  }));
});
```

Add the necessary imports to `praxisMode.ts`: `surgeries`, `patients`, `db`, `eq` (already imported in earlier tasks).

- [ ] **Step 3: Write the calendar badge**

```tsx
// client/src/components/praxis/RescheduledBadge.tsx
export function RescheduledBadge({ acknowledged }: { acknowledged: boolean }) {
  return (
    <span className={`text-[10px] uppercase font-semibold rounded px-1 py-0.5 ${acknowledged ? "bg-amber-100 text-amber-800" : "bg-amber-500 text-white"}`}>
      Rescheduled
    </span>
  );
}
```

In whichever calendar component renders praxis-side surgeries, when a surgery has `lastClinicRescheduleAt` set, render `<RescheduledBadge acknowledged={!!s.rescheduleAcknowledgedAt && s.rescheduleAcknowledgedAt >= s.lastClinicRescheduleAt} />` on the entry. Add a tooltip showing the reschedule history on hover/click.

- [ ] **Step 4: Mount the banner**

In `SurgeonPortal.tsx`, render the banner at the top of the area that hosts the new praxis tabs (above the tab list):

```tsx
{portalState.praxis && <RescheduleAlertBanner praxisHospitalId={portalState.praxis.id} />}
```

- [ ] **Step 5: Smoke test in browser**

Create a referral, accept it as the clinic admin (Task 8), reschedule it (Task 10) → verify the banner appears in the praxis portal with the right copy, clicking Acknowledge dismisses it, the calendar entry retains a softened badge afterward.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/praxis/RescheduleAlertBanner.tsx client/src/components/praxis/RescheduledBadge.tsx
git add client/src/pages/SurgeonPortal.tsx server/routes/praxisMode.ts
git add client/src/components/PlanningCalendar.tsx # or whichever calendar was modified
git commit -m "feat(praxis): reschedule alert banner + calendar badge + ack flow"
```

---

## Phase 7 — Clinic-side surfacing

### Task 15: External requests inbox shows "From praxis" badge + clinic-side accept uses snapshot

**Files:**
- Modify: clinic external-requests inbox component (most likely `client/src/components/admin/ExternalSurgeryRequestsList.tsx` or similar — `grep -r "external-surgery-requests" client/src` to confirm path)
- Modify: clinic external-request detail view to render the patient snapshot

- [ ] **Step 1: Surface `sourceHospitalId` in the existing list endpoint**

If the existing list query doesn't already include `sourceHospitalId`, add it to the projection. In `server/routes/externalSurgery.ts` find the list endpoint (`GET /api/external-surgery-requests` or the version under `hospitals.ts`) and include `sourceHospitalId`, `sourceSurgeryId`, `patientSnapshot` in the SELECT.

- [ ] **Step 2: Add a "From praxis" badge in the list UI**

```tsx
// in the inbox row renderer:
{request.sourceHospitalId && (
  <span className="text-[10px] uppercase font-semibold rounded px-1 py-0.5 bg-blue-100 text-blue-800">From praxis</span>
)}
```

- [ ] **Step 3: Render the snapshot in the detail view**

In the detail component (the one that shows a single external request when clicked), if `patientSnapshot` is present, render a structured panel below the existing fields:

```tsx
{request.patientSnapshot && (
  <section className="mt-4 p-3 border rounded bg-muted/30">
    <h4 className="font-semibold mb-2">Patient snapshot from praxis</h4>
    <dl className="text-sm grid grid-cols-[150px_1fr] gap-y-1">
      <dt>Date of birth</dt><dd>{request.patientSnapshot.demographics?.dateOfBirth ?? "—"}</dd>
      <dt>Phone</dt><dd>{request.patientSnapshot.demographics?.phone ?? "—"}</dd>
      <dt>Email</dt><dd>{request.patientSnapshot.demographics?.email ?? "—"}</dd>
      <dt>Intake</dt><dd><pre className="text-xs whitespace-pre-wrap">{JSON.stringify(request.patientSnapshot.intake ?? {}, null, 2)}</pre></dd>
      <dt>Consent</dt><dd>Confirmed by surgeon at {new Date(request.patientSnapshot.consents?.at ?? request.patientSnapshot.shared_at).toLocaleString()}</dd>
    </dl>
  </section>
)}
```

- [ ] **Step 4: Wire an "Accept" button calling `POST /api/external-surgery-requests/:id/accept`**

If the existing UI uses a different mechanism (e.g. PATCH with `status='approved'`), keep it for legacy rows and add a clean Accept button that calls the new endpoint when `sourceHospitalId` is set. The new endpoint already creates the clinic-side patient and pushes status back to the praxis.

- [ ] **Step 5: Smoke test in browser**

As clinic admin: see a praxis-sourced request in the inbox → "From praxis" badge visible → click into detail → snapshot is rendered → click Accept with a confirmed date → verify (in DB) clinic-side patient row created + praxis-side surgery status `confirmed_external` + scheduled date mirrored.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/admin/  # or wherever the inbox lives
git add server/routes/externalSurgery.ts
git commit -m "feat(clinic): praxis-sourced request badge + snapshot panel + accept endpoint"
```

---

### Task 15a: Questionnaire dedup — clinic-side import + patient-facing review banner

**Files:**
- Modify: `server/storage/praxisMode.ts` (extend `createClinicPatientFromSnapshot` OR add a new helper `importPraxisIntakeAsQuestionnaire`)
- Modify: `server/routes/externalSurgery.ts` (accept endpoint calls the import helper)
- Modify: `client/src/pages/Book.tsx` (or whichever component renders the patient `/book` questionnaire — `grep -rn "patientQuestionnaireResponses\|/book" client/src` to find)
- Modify: `tests/praxis-mode-referral.test.ts`

The goal: on clinic accept, persist the praxis snapshot's intake into a `patientQuestionnaireResponses` row tagged with `imported_from_praxis=true` + `imported_field_sources` mapping each populated field to `'praxis_referral'`. Patient-facing `/book` view then renders these fields pre-filled with a "✓ from praxis" indicator and a top-of-page banner.

- [ ] **Step 1: Write failing test for import on accept**

Append to `tests/praxis-mode-referral.test.ts`:

```ts
describe("questionnaire dedup on clinic accept", () => {
  it("imports praxis intake into patientQuestionnaireResponses with provenance markers", async () => {
    const { clinic, surgeon, praxisHospitalId, patient } = await setup();

    const make = await request(app).post("/api/praxis/surgeries")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", praxisHospitalId)
      .send({
        patientId: patient.id, targetHospitalId: clinic.id, surgeryType: "Septoplasty",
        plannedDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        consentGiven: true,
        intakeFields: {
          allergies: ["Penicillin"],
          medications: [{ name: "Aspirin", dosage: "100mg" }],
          conditions: { hypertension: { checked: true, notes: "controlled" } },
        },
      });
    created.surgeries.push(make.body.surgeryId);
    created.requests.push(make.body.externalRequestId);

    const [admin] = await db.insert(users).values({ email: `qadm-${Date.now()}@t.local`, firstName: "Q", lastName: "A" }).returning();
    created.users.push(admin.id);
    await db.insert(userHospitalRoles).values({ userId: admin.id, hospitalId: clinic.id, role: "admin" });

    const accept = await request(app)
      .post(`/api/external-surgery-requests/${make.body.externalRequestId}/accept`)
      .set("x-test-user-id", admin.id).set("x-test-hospital-id", clinic.id)
      .send({ confirmedDate: new Date(Date.now() + 10 * 86400000).toISOString() });
    expect(accept.status).toBe(200);
    expect(accept.body.questionnaireResponseId).toBeTruthy();

    const { patientQuestionnaireResponses } = await import("@shared/schema");
    const [qr] = await db.select().from(patientQuestionnaireResponses).where(eq(patientQuestionnaireResponses.id, accept.body.questionnaireResponseId));
    expect(qr.importedFromPraxis).toBe(true);
    expect(qr.importedFromPraxisAt).toBeTruthy();
    expect((qr.allergies as string[]) ?? []).toContain("Penicillin");
    expect((qr.medications as any[]) ?? []).toHaveLength(1);
    expect((qr.conditions as any)?.hypertension?.checked).toBe(true);
    const sources = qr.importedFieldSources as Record<string, string>;
    expect(sources.allergies).toBe("praxis_referral");
    expect(sources.medications).toBe("praxis_referral");
    expect(sources.conditions).toBe("praxis_referral");
  });

  it("only imports fields present in the snapshot — empty intake leaves all sources untagged", async () => {
    const { clinic, surgeon, praxisHospitalId, patient } = await setup();
    const make = await request(app).post("/api/praxis/surgeries")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", praxisHospitalId)
      .send({ patientId: patient.id, targetHospitalId: clinic.id, surgeryType: "X", consentGiven: true });
    created.surgeries.push(make.body.surgeryId);
    created.requests.push(make.body.externalRequestId);

    const [admin] = await db.insert(users).values({ email: `qadm2-${Date.now()}@t.local`, firstName: "Q", lastName: "A" }).returning();
    created.users.push(admin.id);
    await db.insert(userHospitalRoles).values({ userId: admin.id, hospitalId: clinic.id, role: "admin" });

    const accept = await request(app)
      .post(`/api/external-surgery-requests/${make.body.externalRequestId}/accept`)
      .set("x-test-user-id", admin.id).set("x-test-hospital-id", clinic.id)
      .send({});
    const { patientQuestionnaireResponses } = await import("@shared/schema");
    const [qr] = await db.select().from(patientQuestionnaireResponses).where(eq(patientQuestionnaireResponses.id, accept.body.questionnaireResponseId));
    expect(qr.importedFromPraxis).toBe(true);
    expect(qr.allergies).toBeNull();
    expect(Object.keys(qr.importedFieldSources ?? {})).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "questionnaire dedup"`
Expected: FAIL — `questionnaireResponseId` not present on accept response; import not happening.

- [ ] **Step 3: Implement `importPraxisIntakeAsQuestionnaire` helper**

Append to `server/storage/praxisMode.ts`:

```ts
import { patientQuestionnaireLinks, patientQuestionnaireResponses } from "@shared/schema";
import crypto from "crypto";

interface PraxisIntake {
  allergies?: string[] | null;
  medications?: Array<{ name: string; dosage?: string; frequency?: string; reason?: string }> | null;
  conditions?: Record<string, { checked: boolean; notes?: string }> | null;
  // demographics handled separately via createClinicPatientFromSnapshot
}

export async function importPraxisIntakeAsQuestionnaire(input: {
  clinicHospitalId: string;
  clinicPatientId: string;
  intake: PraxisIntake | null | undefined;
}): Promise<string> {
  const token = crypto.randomBytes(16).toString("hex");
  const [link] = await db.insert(patientQuestionnaireLinks).values({
    hospitalId: input.clinicHospitalId,
    patientId: input.clinicPatientId,
    token,
  }).returning();

  const sources: Record<string, string> = {};
  const values: Record<string, unknown> = {
    linkId: link.id,
    importedFromPraxis: true,
    importedFromPraxisAt: new Date(),
  };

  if (input.intake?.allergies?.length) {
    values.allergies = input.intake.allergies;
    sources.allergies = "praxis_referral";
  }
  if (input.intake?.medications?.length) {
    values.medications = input.intake.medications;
    sources.medications = "praxis_referral";
  }
  if (input.intake?.conditions && Object.keys(input.intake.conditions).length > 0) {
    values.conditions = input.intake.conditions;
    sources.conditions = "praxis_referral";
  }
  values.importedFieldSources = sources;

  const [resp] = await db.insert(patientQuestionnaireResponses).values(values as any).returning();
  return resp.id;
}
```

> **Note:** verify the exact column names on `patientQuestionnaireLinks` (token field, hospital FK, patient FK) by reading `shared/schema.ts` at line ~4494 before writing — adjust names as needed.

- [ ] **Step 4: Extend the accept endpoint to call the import helper**

In `server/routes/externalSurgery.ts`, in the accept handler (Task 8):

```ts
import { importPraxisIntakeAsQuestionnaire } from "../storage/praxisMode";

// After createClinicPatientFromSnapshot, before pushReferralStatus:
const [r] = await db.select().from(externalSurgeryRequests).where(eq(externalSurgeryRequests.id, id));
const snap = (r?.patientSnapshot as any) ?? null;
let questionnaireResponseId: string | null = null;
if (r?.sourceHospitalId && snap?.intake !== undefined) {
  questionnaireResponseId = await importPraxisIntakeAsQuestionnaire({
    clinicHospitalId: ctx.hospitalId,
    clinicPatientId: clinicPatientId,
    intake: snap.intake,
  });
}

// extend response:
return res.json({ clinicPatientId, questionnaireResponseId });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/praxis-mode-referral.test.ts -t "questionnaire dedup"`
Expected: PASS — both sub-tests pass.

- [ ] **Step 6: Patient-facing `/book` UI — banner + "from praxis" indicators**

In whichever component renders the patient questionnaire (grep `patientQuestionnaireResponses` in `client/src/`), at the top of the form check the response payload for `importedFromPraxis` + `importedFieldSources`:

```tsx
{response.importedFromPraxis && (
  <div className="rounded-md border border-blue-300 bg-blue-50 p-3 mb-4 text-sm">
    ℹ Your referring surgeon already shared some of your information with the clinic.
    Please review the pre-filled fields below and complete any missing sections.
  </div>
)}
```

For each fielded section (allergies, medications, conditions), if `importedFieldSources?.[fieldName] === 'praxis_referral'`, render an indicator next to the section heading:

```tsx
{sources?.allergies === "praxis_referral" && (
  <span className="text-xs text-blue-700 font-medium ml-2">✓ from praxis · review</span>
)}
```

- [ ] **Step 7: Smoke test in browser**

End-to-end: praxis surgeon creates referral with intake fields → clinic admin accepts → open the clinic-side patient's questionnaire link → confirm banner is shown, the three sections (allergies, medications, conditions) are pre-filled with values + "✓ from praxis · review" markers, and any other fields are blank.

- [ ] **Step 8: Commit**

```bash
git add server/storage/praxisMode.ts server/routes/externalSurgery.ts client/src/pages/Book.tsx  # or wherever the patient questionnaire UI is
git add tests/praxis-mode-referral.test.ts
git commit -m "feat(praxis): questionnaire dedup — import praxis intake on clinic accept + patient banner"
```

---

### Task 16: Clinic pairing — share code generation + redemption UI

**Files:**
- Modify: clinic admin hospital settings page to add "Generate pairing code" button + display
- Modify: praxis Schedule tab (or a new "Connected clinics" sub-page) to add "Add clinic by code" form
- Modify: `server/routes/praxisMode.ts` to wire `/api/clinics/:id/pairing-code` (clinic-side) and `/api/praxis/:id/pair-by-code` (praxis-side)

- [ ] **Step 1: Add the two endpoints**

```ts
// in server/routes/praxisMode.ts
import { generatePairingCode, createPairingByCode } from "../storage/praxisMode";

praxisModeRouter.post("/api/clinics/:clinicHospitalId/pairing-code", async (req: any, res) => {
  // require clinic admin role on :clinicHospitalId — use existing auth middleware
  const code = await generatePairingCode(req.params.clinicHospitalId);
  return res.json({ code, expiresInMinutes: 30 });
});

praxisModeRouter.post("/api/praxis/:praxisHospitalId/pair-by-code", async (req, res) => {
  const ctx = getActivePraxisContext(req);
  if (!ctx || ctx.praxisHospitalId !== req.params.praxisHospitalId) return res.status(401).json({ error: "not authenticated" });
  if (!req.body?.code) return res.status(400).json({ error: "code required" });
  try {
    const pair = await createPairingByCode({ praxisHospitalId: ctx.praxisHospitalId, code: String(req.body.code) });
    return res.json(pair);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Clinic admin UI — generate code button**

Find the clinic hospital-settings page (look for `hospital` in `client/src/pages`). Add a section:

```tsx
const [code, setCode] = useState<string | null>(null);
async function generate() {
  const res = await fetch(`/api/clinics/${hospitalId}/pairing-code`, { method: "POST", credentials: "include" });
  setCode((await res.json()).code);
}
// JSX:
<button onClick={generate}>Generate pairing code</button>
{code && <div>Share this code with the praxis (expires in 30 minutes): <code className="font-mono">{code}</code></div>}
```

- [ ] **Step 3: Praxis UI — redeem code form**

In the praxis area (a new "Connected clinics" pane or inside Schedule tab settings):

```tsx
const [code, setCode] = useState("");
async function pair() {
  const res = await fetch(`/api/praxis/${praxisHospitalId}/pair-by-code`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }), credentials: "include",
  });
  if (!res.ok) alert((await res.json()).error);
  else alert("Pairing requested. Clinic admin must approve.");
}
// JSX:
<input value={code} onChange={e => setCode(e.target.value)} placeholder="ABCD1234" />
<button onClick={pair} disabled={code.length !== 8}>Add clinic</button>
```

- [ ] **Step 4: Approval UI on clinic side**

In the clinic admin hospital settings, render a list of `clinic_pairings` rows where `clinicHospitalId === hospitalId && status === 'pending'`, each with an "Approve" button calling a new `POST /api/clinics/:clinicHospitalId/pairings/:pairingId/approve` (server-side: use `approvePairing` from storage).

- [ ] **Step 5: Smoke test**

End-to-end: clinic admin generates code → praxis surgeon enters code → clinic admin sees pending pairing → approves → praxis can now refer to that clinic.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/  server/routes/praxisMode.ts
git commit -m "feat(praxis): clinic pairing share code generation + redemption + approval"
```

---

## Phase 8 — Final integration

### Task 17: Workspace switcher (only when surgeon belongs to multiple praxis tenants)

**Files:**
- Modify: `client/src/components/surgeon-portal/AccountMenu.tsx` (or wherever the existing account menu lives — grep `accountMenu`)

- [ ] **Step 1: Extend the bootstrap response to include all workspaces**

In `server/routes/surgeonPortal.ts`, the bootstrap response now also includes all hospitals the surgeon is a member of (filtered to `tenantType='praxis'`):

```ts
const allPraxes = await db.select({ id: hospitals.id, name: hospitals.name })
  .from(userHospitalRoles).leftJoin(hospitals, eq(userHospitalRoles.hospitalId, hospitals.id))
  .where(and(eq(userHospitalRoles.userId, surgeonUserId), eq(hospitals.tenantType, "praxis")));

// replace the existing `praxis: praxisRoles[0] ?? null` with:
praxes: allPraxes,
activePraxisId: allPraxes[0]?.id ?? null,
```

- [ ] **Step 2: Render the switcher in `AccountMenu`**

```tsx
{portalState.praxes.length > 1 && (
  <div className="px-3 py-2 border-t">
    <div className="text-xs text-muted-foreground mb-1">Workspace</div>
    <select className="w-full border rounded p-1" value={portalState.activePraxisId ?? ""} onChange={e => switchWorkspace(e.target.value)}>
      {portalState.praxes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  </div>
)}
```

`switchWorkspace` either sets a client-side active id (which the portal then uses when calling `/api/praxis/...` endpoints) or calls a `/api/surgeon-portal/active-workspace` endpoint that updates the session. Match whichever pattern the existing portal uses for OTP session state.

- [ ] **Step 3: Smoke test**

Create a second praxis tenant for the test surgeon (manually in DB or via a second activation triggered after manually flipping the 409 guard) and verify the switcher appears.

- [ ] **Step 4: Commit**

```bash
git add server/routes/surgeonPortal.ts client/src/components/surgeon-portal/AccountMenu.tsx
git commit -m "feat(portal): workspace switcher when surgeon owns multiple praxes"
```

---

### Task 18: Final verification — lint, typecheck, full test run, spec coverage check

**Files:** (verification only)

- [ ] **Step 1: Run lint**

Run: `npm run lint` if a lint script exists; otherwise skip.
Expected: PASS — no new violations.

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: PASS — no TS errors.

- [ ] **Step 3: Run all praxis-mode tests**

Run: `npx vitest run tests/praxis-mode-*.test.ts`
Expected: PASS — all tests across migration, storage, routes, referral, reschedule, backfill suites pass.

- [ ] **Step 4: Run the full test suite to catch regressions**

Run: `npm test` (or the project's main test command)
Expected: PASS — including legacy surgeon-portal / surgeon-praxis tests untouched.

- [ ] **Step 5: Spec coverage walk-through**

Open `docs/superpowers/specs/2026-05-13-praxis-mode-design.md` side-by-side with the implementation. Tick off each requirement against the implementing task:

| Spec section | Implementing task(s) |
| --- | --- |
| Schema: `hospitals.tenant_type` | Task 1, 2 |
| Schema: `surgeries.target_hospital_id`, `external_request_id`, `referral_status`, `referral_note` | Task 1, 2 |
| Schema: `surgeries.last_clinic_reschedule_at`, `reschedule_acknowledged_at`, `reschedule_history` | Task 1, 2 |
| Schema: `external_surgery_requests.source_hospital_id`, `source_surgery_id`, `patient_snapshot` | Task 1, 2 |
| Schema: `clinic_pairings` | Task 1, 2 |
| Tenant provisioning (atomic + lean defaults + auto-pair) | Task 3, 6 |
| Backfill of historical requests, idempotent, 5-year cap | Task 5 |
| Clinic pairing list / create-by-code / approve / revoke | Task 4, 16 |
| Promo card in surgeon portal | Task 11 |
| Activation modal | Task 11 |
| 3-step onboarding tour after activation | Task 11a |
| Patients + Schedule tabs after activation | Task 12 |
| Surgery referral form (consent required, defaults clinic) | Task 13 |
| Cross-tenant payload structure | Task 7 |
| Clinic accept creates patient from snapshot + pushes status | Task 8 |
| Questionnaire dedup — clinic-side import + patient banner | Task 15a |
| `patient_questionnaire_responses` praxis-import columns | Task 1, 2, 15a |
| Reject / cancel status push | Task 9 |
| Reschedule push + history + alert pattern | Task 10 |
| Reschedule banner + calendar badge + ack | Task 14 |
| "From praxis" badge + snapshot panel on clinic inbox | Task 15 |
| Workspace switcher (multi-tenant) | Task 17 |

If any spec requirement maps to no task, file it as a follow-up and either patch it inline or capture it on the project's tracker.

- [ ] **Step 6: Push & open PR**

Run: `git status` to confirm no uncommitted changes. Push branch:

```bash
git push -u origin feat/praxis-mode
```

Open PR with title `feat: praxis mode (surgeon's own viali instance + cross-tenant referral)` and body summarizing the phases + linking the spec.

---

## Notes on patterns and reuse

- **Auth**: the praxis routes use the existing surgeon-portal OTP session and the existing clinic-admin auth — no new auth surface. The test-only `x-test-user-id`/`x-test-hospital-id` headers are gated behind `NODE_ENV === "test"` and must never be honored in production.
- **Idempotent migrations**: every `ALTER TABLE` / `CREATE TABLE` / `CREATE INDEX` uses `IF NOT EXISTS`; every constraint uses a `DO $$ BEGIN ... END $$` guard checking `pg_constraint`. Follows the existing pattern in `migrations/0248_surgeon_praxis.sql`.
- **Drizzle journal**: after writing migration 0253, verify `migrations/meta/_journal.json` includes the new entry with a `when` greater than all previous entries. If `npx drizzle-kit push` was used (Task 1 step 5), it does this automatically.
- **Tenant scoping**: every storage helper that touches praxis data takes `praxisHospitalId` explicitly. No global `currentHospital` lookups.
- **Snapshot is frozen**: the cross-tenant payload is captured at referral time and never auto-updates. Re-send (a future v2 task) is explicit.
- **Out of scope**: outcome loop, praxis-to-praxis referrals, multi-member praxes, Tarmed billing, public clinic directory — all flagged in the spec.
