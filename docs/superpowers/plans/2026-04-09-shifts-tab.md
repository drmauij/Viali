# Shifts Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new top-level Shifts tab for per-day staff rostering with configurable shift types, integrated with existing provider absences and the OP calendar.

**Architecture:** Two new tables (`shift_types`, `staff_shifts`) decoupled from `staff_pool`. One combined atomic endpoint for the popover. Three new calendar views (Day/Week/Month) under `/clinic/shifts` that reuse the patterns of the existing Appointments views but render shifts instead of appointments. Absence visuals extracted into a shared helper module consumed by both Appointments and Shifts views.

**Tech Stack:** Drizzle ORM + Postgres, Express, React + wouter, TanStack Query, shadcn/ui, date-fns, i18next (EN + DE), existing `apiRequest` client.

**Spec:** `docs/superpowers/specs/2026-04-09-shifts-tab-design.md`

---

## File Structure

**Backend**
- Create: `shared/schema.ts` additions — `shiftTypes` and `staffShifts` tables + Zod insert schemas
- Create: `migrations/0205_shifts.sql` — idempotent migration
- Create: `server/routes/shifts.ts` — CRUD + combined assign endpoints
- Modify: `server/routes.ts` — register shifts router
- Modify: `server/storage.ts` — add shift-type + staff-shift methods (or `server/storage/shifts.ts` if pattern exists; inspect first)
- Create: `tests/routes/shifts.test.ts` — integration tests

**Shared frontend helpers**
- Create: `client/src/lib/absenceStyles.ts` — extracted absence color/pattern helpers
- Modify: `client/src/components/clinic/AppointmentsWeekView.tsx` — consume shared helpers (refactor, no behavior change)
- Modify: `client/src/components/clinic/AppointmentsMonthView.tsx` — same

**Settings page**
- Create: `client/src/pages/clinic/ShiftTypes.tsx` — list + CRUD
- Create: `client/src/components/clinic/ShiftTypeFormDialog.tsx` — add/edit modal
- Modify: clinic settings nav to include a "Shift Types" link

**Shifts tab**
- Create: `client/src/pages/clinic/Shifts.tsx` — main page (header, view switcher, data fetching)
- Create: `client/src/components/shifts/ShiftsDayView.tsx`
- Create: `client/src/components/shifts/ShiftsWeekView.tsx`
- Create: `client/src/components/shifts/ShiftsMonthView.tsx`
- Create: `client/src/components/shifts/ShiftCell.tsx`
- Create: `client/src/components/shifts/StaffShiftPopover.tsx`
- Create: `client/src/components/shifts/AbsenceInfoBlock.tsx`
- Modify: `client/src/App.tsx` — register `/clinic/shifts` route
- Modify: clinic bottom-nav / sidebar — add Shifts entry after Appointments

**OP calendar integration**
- Modify: the planned-staff detail dialog (locate in code) — add Shift section using the same shift dropdown + `AbsenceInfoBlock`

**Translations**
- Modify: `client/src/i18n/locales/en.json`, `client/src/i18n/locales/de.json` — add `shifts.*` keys

---

## Task 1: Schema + Migration

**Files:**
- Modify: `shared/schema.ts`
- Create: `migrations/0205_shifts.sql`
- Modify: `migrations/meta/_journal.json`

- [ ] **Step 1: Add Drizzle table definitions to `shared/schema.ts`**

Add near the other tables (use existing column helpers/types in the file):

```ts
export const shiftTypes = pgTable("shift_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: text("hospital_id").notNull().references(() => hospitals.id, { onDelete: "cascade" }),
  unitId: text("unit_id").references(() => units.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  code: text("code").notNull(),
  icon: text("icon"),
  color: text("color").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  hospitalSortIdx: index("shift_types_hospital_sort_idx").on(t.hospitalId, t.sortOrder),
  hospitalUnitIdx: index("shift_types_hospital_unit_idx").on(t.hospitalId, t.unitId),
}));

export const staffShifts = pgTable("staff_shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: text("hospital_id").notNull().references(() => hospitals.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  shiftTypeId: uuid("shift_type_id").notNull().references(() => shiftTypes.id, { onDelete: "restrict" }),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("staff_shifts_hospital_user_date_uidx").on(t.hospitalId, t.userId, t.date),
  hospitalDateIdx: index("staff_shifts_hospital_date_idx").on(t.hospitalId, t.date),
}));

export const insertShiftTypeSchema = createInsertSchema(shiftTypes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStaffShiftSchema = createInsertSchema(staffShifts).omit({ id: true, createdAt: true, updatedAt: true });
export type ShiftType = typeof shiftTypes.$inferSelect;
export type StaffShift = typeof staffShifts.$inferSelect;
```

Before committing, skim `shared/schema.ts` to confirm the exact import shapes for `pgTable`, `uuid`, `text`, `date`, `timestamp`, `integer`, `index`, `uniqueIndex`, `createInsertSchema` — match them, don't guess.

- [ ] **Step 2: Write idempotent migration file**

Create `migrations/0205_shifts.sql`:

```sql
CREATE TABLE IF NOT EXISTS "shift_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "hospital_id" text NOT NULL,
  "unit_id" text,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "icon" text,
  "color" text NOT NULL,
  "start_time" text NOT NULL,
  "end_time" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_types_hospital_id_fk') THEN
    ALTER TABLE "shift_types" ADD CONSTRAINT "shift_types_hospital_id_fk"
      FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shift_types_unit_id_fk') THEN
    ALTER TABLE "shift_types" ADD CONSTRAINT "shift_types_unit_id_fk"
      FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "shift_types_hospital_sort_idx" ON "shift_types" ("hospital_id", "sort_order");
CREATE INDEX IF NOT EXISTS "shift_types_hospital_unit_idx" ON "shift_types" ("hospital_id", "unit_id");

CREATE TABLE IF NOT EXISTS "staff_shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "hospital_id" text NOT NULL,
  "user_id" text NOT NULL,
  "date" date NOT NULL,
  "shift_type_id" uuid NOT NULL,
  "created_by" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_shifts_hospital_id_fk') THEN
    ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_hospital_id_fk"
      FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_shifts_user_id_fk') THEN
    ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_shifts_shift_type_id_fk') THEN
    ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_shift_type_id_fk"
      FOREIGN KEY ("shift_type_id") REFERENCES "shift_types"("id") ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_shifts_created_by_fk') THEN
    ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_created_by_fk"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "staff_shifts_hospital_user_date_uidx"
  ON "staff_shifts" ("hospital_id", "user_id", "date");
CREATE INDEX IF NOT EXISTS "staff_shifts_hospital_date_idx" ON "staff_shifts" ("hospital_id", "date");
```

- [ ] **Step 3: Add journal entry**

Edit `migrations/meta/_journal.json` — add a new entry for `0205_shifts` with a `when` value that is the largest in the file (use current epoch ms). Follow the exact shape used by previous entries.

- [ ] **Step 4: Run the "check db for deploy" workflow manually**

```bash
npx drizzle-kit push    # must say "Changes applied" with no pending diffs
npm run check           # must pass clean
```

If `drizzle-kit push` reports diffs, the schema and migration SQL are out of sync — fix before proceeding.

- [ ] **Step 5: Run the migration twice locally to prove idempotency**

```bash
npm run db:migrate   # first run: applies 0205
npm run db:migrate   # second run: should be a no-op
```

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts migrations/0205_shifts.sql migrations/meta/_journal.json
git commit -m "feat(shifts): add shift_types and staff_shifts tables"
```

---

## Task 2: Storage layer

**Files:**
- Modify: `server/storage.ts` (or matching pattern if storage is split)

- [ ] **Step 1: Inspect storage file pattern**

Read the first 200 lines of `server/storage.ts` and grep for `shiftTypes`/`staffShifts` to confirm a single-file pattern is used. If the codebase splits storage per domain (e.g. `server/storage/` directory), put new methods in `server/storage/shifts.ts` and import it from `server/storage.ts` following the existing style.

- [ ] **Step 2: Add shift-type storage methods**

```ts
async getShiftTypes(hospitalId: string): Promise<ShiftType[]> {
  return db.select().from(shiftTypes)
    .where(eq(shiftTypes.hospitalId, hospitalId))
    .orderBy(asc(shiftTypes.sortOrder), asc(shiftTypes.name));
}

async createShiftType(data: InsertShiftType): Promise<ShiftType> {
  const [row] = await db.insert(shiftTypes).values(data).returning();
  return row;
}

async updateShiftType(id: string, data: Partial<InsertShiftType>): Promise<ShiftType | null> {
  const [row] = await db.update(shiftTypes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(shiftTypes.id, id))
    .returning();
  return row ?? null;
}

async deleteShiftType(id: string): Promise<{ deleted: boolean; usageCount: number }> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(staffShifts).where(eq(staffShifts.shiftTypeId, id));
  if (count > 0) return { deleted: false, usageCount: count };
  await db.delete(shiftTypes).where(eq(shiftTypes.id, id));
  return { deleted: true, usageCount: 0 };
}
```

- [ ] **Step 3: Add staff-shift storage methods**

```ts
async getStaffShiftsRange(hospitalId: string, from: string, to: string): Promise<StaffShift[]> {
  return db.select().from(staffShifts)
    .where(and(
      eq(staffShifts.hospitalId, hospitalId),
      gte(staffShifts.date, from),
      lte(staffShifts.date, to),
    ));
}

async upsertStaffShift(data: InsertStaffShift): Promise<StaffShift> {
  const [row] = await db.insert(staffShifts)
    .values(data)
    .onConflictDoUpdate({
      target: [staffShifts.hospitalId, staffShifts.userId, staffShifts.date],
      set: { shiftTypeId: data.shiftTypeId, updatedAt: new Date(), createdBy: data.createdBy },
    })
    .returning();
  return row;
}

async clearStaffShift(hospitalId: string, userId: string, date: string): Promise<void> {
  await db.delete(staffShifts).where(and(
    eq(staffShifts.hospitalId, hospitalId),
    eq(staffShifts.userId, userId),
    eq(staffShifts.date, date),
  ));
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run check
```

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts
git commit -m "feat(shifts): add storage layer for shift_types and staff_shifts"
```

---

## Task 3: Backend routes + tests

**Files:**
- Create: `server/routes/shifts.ts`
- Modify: `server/routes.ts` (or wherever routers are registered)
- Create: `tests/routes/shifts.test.ts`

- [ ] **Step 1: Inspect existing router patterns**

Read `server/routes/anesthesia/staff.ts` top 40 lines to confirm the `isAuthenticated`, `requireWriteAccess`, and request-schema patterns used for auth and validation. Mirror them exactly.

- [ ] **Step 2: Write failing integration test**

Create `tests/routes/shifts.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../helpers/app"; // match existing tests' import
import { seedHospitalWithAdmin, seedUser, authCookie } from "../helpers/fixtures";

describe("shift types", () => {
  let hospitalId: string;
  let adminCookie: string;

  beforeEach(async () => {
    const seed = await seedHospitalWithAdmin();
    hospitalId = seed.hospitalId;
    adminCookie = seed.cookie;
  });

  it("creates, lists, updates, and blocks delete when referenced", async () => {
    const create = await request(app)
      .post(`/api/shift-types/${hospitalId}`)
      .set("Cookie", adminCookie)
      .send({ name: "Early", code: "E", color: "#3b82f6", startTime: "07:00", endTime: "15:00", sortOrder: 0 });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const list = await request(app).get(`/api/shift-types/${hospitalId}`).set("Cookie", adminCookie);
    expect(list.body).toHaveLength(1);

    const upd = await request(app).patch(`/api/shift-types/${id}`).set("Cookie", adminCookie).send({ name: "Frühdienst" });
    expect(upd.body.name).toBe("Frühdienst");

    // assign it
    const user = await seedUser(hospitalId);
    await request(app).post(`/api/staff-shifts/${hospitalId}`)
      .set("Cookie", adminCookie)
      .send({ userId: user.id, date: "2026-05-01", shiftTypeId: id });

    // delete should fail
    const del = await request(app).delete(`/api/shift-types/${id}`).set("Cookie", adminCookie);
    expect(del.status).toBe(409);
  });

  it("non-admin cannot write", async () => {
    const viewer = await seedUser(hospitalId, "member");
    const cookie = await authCookie(viewer);
    const r = await request(app).post(`/api/shift-types/${hospitalId}`).set("Cookie", cookie).send({
      name: "X", code: "X", color: "#000", startTime: "00:00", endTime: "01:00", sortOrder: 0,
    });
    expect(r.status).toBe(403);
  });
});

describe("staff shifts combined assign", () => {
  it("upserts shift and staff_pool atomically, both independent", async () => {
    const { hospitalId, cookie } = await seedHospitalWithAdmin();
    const user = await seedUser(hospitalId);
    const shiftType = (await request(app).post(`/api/shift-types/${hospitalId}`).set("Cookie", cookie)
      .send({ name: "E", code: "E", color: "#000", startTime: "07:00", endTime: "15:00", sortOrder: 0 })).body;

    // assign shift only (no role)
    const r1 = await request(app).post(`/api/staff-shifts/${hospitalId}/assign`)
      .set("Cookie", cookie)
      .send({ userId: user.id, date: "2026-05-01", shiftTypeId: shiftType.id, role: null });
    expect(r1.status).toBe(200);

    // fetch staff_pool — should be empty for that date
    const pool = await request(app).get(`/api/staff-pool/${hospitalId}?date=2026-05-01`).set("Cookie", cookie);
    expect(pool.body).toHaveLength(0);

    // assign role only (no shift clears shift)
    const r2 = await request(app).post(`/api/staff-shifts/${hospitalId}/assign`)
      .set("Cookie", cookie)
      .send({ userId: user.id, date: "2026-05-01", shiftTypeId: null, role: "surgeon" });
    expect(r2.status).toBe(200);
  });
});
```

Consult `tests/helpers/fixtures` (or equivalent) before writing — rename helpers to match what exists. If no test helpers exist for seeding, inspect existing tests under `tests/` for the pattern and follow it.

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- tests/routes/shifts.test.ts
```

Expected: FAIL with "route not found" on the first POST.

- [ ] **Step 4: Implement the router**

Create `server/routes/shifts.ts`:

```ts
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { requireWriteAccess } from "../middleware/access";
import { storage } from "../storage";
import { db } from "../db";
import { staffPool } from "@shared/schema";
import { and, eq } from "drizzle-orm";

const router = Router();

const shiftTypeBody = z.object({
  unitId: z.string().nullable().optional(),
  name: z.string().min(1),
  code: z.string().min(1).max(4),
  icon: z.string().nullable().optional(),
  color: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  sortOrder: z.number().int().default(0),
});

router.get("/api/shift-types/:hospitalId", isAuthenticated, async (req, res) => {
  const rows = await storage.getShiftTypes(req.params.hospitalId);
  res.json(rows);
});

router.post("/api/shift-types/:hospitalId", isAuthenticated, requireWriteAccess, async (req, res) => {
  const parsed = shiftTypeBody.parse(req.body);
  const row = await storage.createShiftType({ ...parsed, hospitalId: req.params.hospitalId });
  res.status(201).json(row);
});

router.patch("/api/shift-types/:id", isAuthenticated, requireWriteAccess, async (req, res) => {
  const parsed = shiftTypeBody.partial().parse(req.body);
  const row = await storage.updateShiftType(req.params.id, parsed);
  if (!row) return res.status(404).end();
  res.json(row);
});

router.delete("/api/shift-types/:id", isAuthenticated, requireWriteAccess, async (req, res) => {
  const result = await storage.deleteShiftType(req.params.id);
  if (!result.deleted) return res.status(409).json({ usageCount: result.usageCount });
  res.status(204).end();
});

const rangeQuery = z.object({ from: z.string(), to: z.string() });

router.get("/api/staff-shifts/:hospitalId", isAuthenticated, async (req, res) => {
  const { from, to } = rangeQuery.parse(req.query);
  const rows = await storage.getStaffShiftsRange(req.params.hospitalId, from, to);
  res.json(rows);
});

const assignBody = z.object({
  userId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftTypeId: z.string().nullable(),
  role: z.string().nullable(),
});

router.post("/api/staff-shifts/:hospitalId/assign", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  const { userId, date, shiftTypeId, role } = assignBody.parse(req.body);
  const hospitalId = req.params.hospitalId;

  await db.transaction(async (tx) => {
    // shift side
    if (shiftTypeId === null) {
      await tx.delete(staffShifts).where(and(
        eq(staffShifts.hospitalId, hospitalId),
        eq(staffShifts.userId, userId),
        eq(staffShifts.date, date),
      ));
    } else {
      await tx.insert(staffShifts)
        .values({ hospitalId, userId, date, shiftTypeId, createdBy: req.user.id })
        .onConflictDoUpdate({
          target: [staffShifts.hospitalId, staffShifts.userId, staffShifts.date],
          set: { shiftTypeId, updatedAt: new Date(), createdBy: req.user.id },
        });
    }
    // role side — writes to staff_pool
    if (role === null) {
      await tx.delete(staffPool).where(and(
        eq(staffPool.hospitalId, hospitalId),
        eq(staffPool.userId, userId),
        eq(staffPool.date, date),
      ));
    } else {
      // Inspect the existing POST /api/staff-pool handler and mirror its upsert
      // logic here (typically: upsert by (hospitalId, userId, date) with the role
      // and a provider name looked up from users table). Keep it inside `tx`.
      // If that handler is already extracted into storage.upsertStaffPool, call it
      // with the transaction instead: await storage.upsertStaffPool(tx, { ... }).
      throw new Error("TODO: mirror staff-pool upsert inside tx — see note above");
    }
  });

  res.json({ ok: true });
});

// Single shift upsert and delete (used by direct endpoints in tests and bulk paths)
router.post("/api/staff-shifts/:hospitalId", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  const body = z.object({
    userId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    shiftTypeId: z.string(),
  }).parse(req.body);
  const row = await storage.upsertStaffShift({ ...body, hospitalId: req.params.hospitalId, createdBy: req.user.id });
  res.json(row);
});

router.delete("/api/staff-shifts/:id", isAuthenticated, requireWriteAccess, async (req, res) => {
  await db.delete(staffShifts).where(eq(staffShifts.id, req.params.id));
  res.status(204).end();
});

export default router;
```

**Important:** before running the tests, you must remove the `throw new Error("TODO: ...")` line and replace it with the actual staff-pool upsert logic. Read the existing `POST /api/staff-pool` handler in the codebase first — grep:

```bash
grep -rn "staff-pool" server/routes/ | head
```

Then either call the existing storage helper inside the transaction (preferred) or inline the equivalent `tx.insert(staffPool)....onConflictDoUpdate({...})` logic here. The shape of a `staffPool` row is visible in `shared/schema.ts`.

Replace the commented drizzle placeholders with the actual table/columns imports from `@shared/schema` — `staffShifts` import, `staffShifts.hospitalId`, etc. Keep transaction atomicity tight.

- [ ] **Step 5: Register the router**

In `server/routes.ts` (or wherever routers are mounted), add:

```ts
import shiftsRouter from "./routes/shifts";
app.use(shiftsRouter);
```

Match the exact mount style used by other routers.

- [ ] **Step 6: Re-run tests until green**

```bash
npm test -- tests/routes/shifts.test.ts
```

Expected: PASS on all cases. Fix until green. Do NOT skip the "non-admin cannot write" or the combined-assign atomicity cases.

- [ ] **Step 7: Commit**

```bash
git add server/routes/shifts.ts server/routes.ts tests/routes/shifts.test.ts
git commit -m "feat(shifts): add shift-types and staff-shifts CRUD + combined assign endpoint"
```

---

## Task 4: Extract shared absence-style helpers

**Files:**
- Create: `client/src/lib/absenceStyles.ts`
- Modify: `client/src/components/clinic/AppointmentsWeekView.tsx`
- Modify: `client/src/components/clinic/AppointmentsMonthView.tsx`

This is a pure refactor — no behavior change, no new rendering, no new state. The goal is to have a single source of truth for "what color is a vacation day" that the new Shifts views can import.

- [ ] **Step 1: Find all current absence-style logic in both views**

```bash
grep -n "ABSENCE_COLORS\|absenceType\|approvalStatus\|isPartial" client/src/components/clinic/AppointmentsWeekView.tsx client/src/components/clinic/AppointmentsMonthView.tsx
```

Capture the full `ABSENCE_COLORS` constant and any helper functions that decide classnames for (absence, isPartial, approvalStatus) tuples.

- [ ] **Step 2: Create the shared helper**

Create `client/src/lib/absenceStyles.ts`:

```ts
// Single source of truth for rendering provider absences and time-off
// across the Appointments and Shifts views.

export type AbsenceInput = {
  type: string;                // e.g. "vacation", "sickness", "timeoff"
  isPartial: boolean;
  approvalStatus?: "approved" | "pending" | string;
  startTime?: string | null;   // "HH:MM" for partial
  endTime?: string | null;
};

export const ABSENCE_COLORS: Record<string, string> = {
  // ← paste the exact map currently in AppointmentsWeekView
};

export function absenceBgClass(absence: AbsenceInput | null | undefined): string {
  if (!absence) return "";
  if (absence.approvalStatus === "pending") {
    return "bg-orange-50 dark:bg-orange-950/30 border border-dashed border-orange-300 dark:border-orange-700";
  }
  if (absence.isPartial) return ""; // partial time-offs use an overlay, not a full background
  return ABSENCE_COLORS[absence.type] ?? ABSENCE_COLORS.default ?? "";
}

export function partialOverlayStyle(absence: AbsenceInput | null | undefined) {
  if (!absence || !absence.isPartial || !absence.startTime || !absence.endTime) return null;
  return {
    // return the style/props the existing views apply for partial overlays
    // e.g. diagonal stripe overlay sized to the time range
  };
}

export function absenceLabel(absence: AbsenceInput, t: (k: string) => string): string {
  return t(`absences.types.${absence.type}`);
}

/** Returns true if the shift's [startTime, endTime] overlaps the absence window. */
export function shiftOverlapsAbsence(
  shift: { startTime: string; endTime: string },
  absence: AbsenceInput,
): boolean {
  if (!absence.isPartial) return true; // full-day absence blocks any shift
  if (!absence.startTime || !absence.endTime) return false;
  const [sh, sm] = shift.startTime.split(":").map(Number);
  const [eh, em] = shift.endTime.split(":").map(Number);
  const [ash, asm] = absence.startTime.split(":").map(Number);
  const [aeh, aem] = absence.endTime.split(":").map(Number);
  const sMin = sh * 60 + sm, eMin = eh * 60 + em;
  const aStart = ash * 60 + asm, aEnd = aeh * 60 + aem;
  return sMin < aEnd && eMin > aStart;
}
```

Copy-paste the actual constant and helper bodies from the existing views into this file. Do not rewrite semantics.

- [ ] **Step 3: Replace the inline logic in AppointmentsWeekView**

Delete the local `ABSENCE_COLORS` constant, the inline classname ternaries, and any helper functions that moved. Import `absenceBgClass`, etc. from `@/lib/absenceStyles` and apply them identically. The rendered output must be byte-identical.

- [ ] **Step 4: Replace the inline logic in AppointmentsMonthView**

Same as above.

- [ ] **Step 5: Manual visual verification**

Start the dev server, navigate to Appointments, switch to Week and Month views, verify that absences still render the same colors and the partial-time-off overlays still look identical. Compare against git stash if uncertain.

- [ ] **Step 6: Typecheck + lint**

```bash
npm run check
```

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/absenceStyles.ts \
        client/src/components/clinic/AppointmentsWeekView.tsx \
        client/src/components/clinic/AppointmentsMonthView.tsx
git commit -m "refactor(absences): extract shared absence-style helpers"
```

---

## Task 5: Settings page — Shift Types list + form

**Files:**
- Create: `client/src/pages/clinic/ShiftTypes.tsx`
- Create: `client/src/components/clinic/ShiftTypeFormDialog.tsx`
- Modify: clinic settings nav / route registration

- [ ] **Step 1: Add the route**

In `client/src/App.tsx`, add (near `/clinic/services`):

```tsx
const ClinicShiftTypes = React.lazy(() => import("@/pages/clinic/ShiftTypes"));
```

```tsx
<Route path="/clinic/shift-types">{() => <ProtectedRoute requireClinic><ClinicShiftTypes /></ProtectedRoute>}</Route>
```

- [ ] **Step 2: Write `ShiftTypeFormDialog`**

Create `client/src/components/clinic/ShiftTypeFormDialog.tsx` — a controlled dialog with:

- Name (`Input`, required)
- Code (`Input`, `maxLength=4`, required)
- Icon — `Select` from a curated list: `['sun','moon','sun-moon','phone','bed','stethoscope','clock','alarm-clock','calendar','zap']`. Render preview using lucide dynamic lookup.
- Color — simple hex `Input` + `input type="color"` side-by-side (native picker, no new lib)
- Start time — `Input type="time"`
- End time — `Input type="time"`
- Unit — `Select` populated from `/api/units/:hospitalId`, with an "All units" option that maps to `null`
- Sort order — `Input type="number"`

Submit handler calls `apiRequest("POST"|"PATCH", ...)` depending on whether `initialValue` is provided. On success, calls `onSaved()` and closes.

Validation (inline, not Zod — keep it tight): name non-empty, code 1–4 chars, color matches `#[0-9A-Fa-f]{6}`, start ≠ end. Show `FormMessage` under the offending field.

- [ ] **Step 3: Write `ShiftTypes` page**

Create `client/src/pages/clinic/ShiftTypes.tsx`:

```tsx
export default function ShiftTypes() {
  const { t } = useTranslation();
  const { activeHospital } = useActiveHospital();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ShiftType | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: shiftTypes = [], isLoading } = useQuery<ShiftType[]>({
    queryKey: [`/api/shift-types/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/shift-types/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/shift-types/${activeHospital?.id}`] }),
    onError: (e: any) => {
      if (e.status === 409) toast({ title: t("shifts.settings.deleteBlocked", { count: e.body?.usageCount }), variant: "destructive" });
      else toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  // Render: page header, "+ Add shift type" button, table with columns:
  // [color swatch] [icon] [name] [code] [startTime–endTime] [unit|all] [sortOrder] [edit] [delete]
  // Empty state: "No shift types configured yet."
  // <ShiftTypeFormDialog open={adding || !!editing} initialValue={editing} onClose={...} onSaved={...} />
}
```

Fill in the JSX following the project's existing settings pages as a pattern reference (e.g. `client/src/pages/clinic/Services.tsx` if it exists — inspect to match styling).

- [ ] **Step 4: Add settings nav link**

Locate the clinic settings navigation (sidebar or tabs — grep for `/clinic/services` in the codebase) and add a "Shift Types" entry pointing to `/clinic/shift-types`. Use lucide `Clock` icon.

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
```

Navigate to `/clinic/shift-types`. Add a shift type with all fields. Edit it. Try to delete it. Confirm the list refreshes.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/clinic/ShiftTypes.tsx \
        client/src/components/clinic/ShiftTypeFormDialog.tsx \
        client/src/App.tsx
# plus any nav file
git commit -m "feat(shifts): add Shift Types settings page"
```

---

## Task 6: AbsenceInfoBlock component

**Files:**
- Create: `client/src/components/shifts/AbsenceInfoBlock.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { format, parseISO } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AbsenceInput } from "@/lib/absenceStyles";

interface Props {
  absence: (AbsenceInput & {
    startDate: string;
    endDate: string;
    reason?: string | null;
    notes?: string | null;
    creatorName?: string | null;
  }) | null;
}

export default function AbsenceInfoBlock({ absence }: Props) {
  const { t } = useTranslation();
  if (!absence) return null;

  const dateLabel = absence.startDate === absence.endDate
    ? format(parseISO(absence.startDate), "d MMM yyyy")
    : `${format(parseISO(absence.startDate), "d MMM")} – ${format(parseISO(absence.endDate), "d MMM yyyy")}`;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs space-y-1" data-testid="absence-info-block">
      <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
        <AlertTriangle className="h-3 w-3" />
        {t(`absences.types.${absence.type}`)}
        {absence.approvalStatus === "pending" && (
          <span className="text-[10px] uppercase opacity-70">({t("absences.pending")})</span>
        )}
      </div>
      <div className="text-amber-700 dark:text-amber-300">{dateLabel}</div>
      {absence.isPartial && absence.startTime && absence.endTime && (
        <div className="text-amber-700 dark:text-amber-300">
          {t("absences.partial")}: {absence.startTime}–{absence.endTime}
        </div>
      )}
      {absence.reason && <div className="italic opacity-80">"{absence.reason}"</div>}
      {absence.creatorName && <div className="opacity-60">— {absence.creatorName}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/shifts/AbsenceInfoBlock.tsx
git commit -m "feat(shifts): add AbsenceInfoBlock component"
```

---

## Task 7: StaffShiftPopover component

**Files:**
- Create: `client/src/components/shifts/StaffShiftPopover.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AbsenceInfoBlock from "./AbsenceInfoBlock";
import { shiftOverlapsAbsence, type AbsenceInput } from "@/lib/absenceStyles";
import type { ShiftType } from "@shared/schema";

type StaffRole =
  | "surgeon" | "surgicalAssistant" | "instrumentNurse" | "circulatingNurse"
  | "anesthesiologist" | "anesthesiaNurse" | "pacuNurse";

const STAFF_ROLES: StaffRole[] = [
  "surgeon","surgicalAssistant","instrumentNurse","circulatingNurse",
  "anesthesiologist","anesthesiaNurse","pacuNurse",
];

interface Props {
  hospitalId: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  currentShiftTypeId?: string | null;
  currentRole?: StaffRole | null;
  absence?: (AbsenceInput & { startDate: string; endDate: string; reason?: string | null; creatorName?: string | null }) | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  children: React.ReactNode;
}

export default function StaffShiftPopover(props: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [role, setRole] = useState<StaffRole | "">(props.currentRole ?? "");
  const [shiftTypeId, setShiftTypeId] = useState<string>(props.currentShiftTypeId ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (props.open) {
      setRole(props.currentRole ?? "");
      setShiftTypeId(props.currentShiftTypeId ?? "");
    }
  }, [props.open, props.currentRole, props.currentShiftTypeId]);

  const { data: shiftTypes = [] } = useQuery<ShiftType[]>({
    queryKey: [`/api/shift-types/${props.hospitalId}`],
    enabled: props.open,
  });

  const save = async (clearAll = false) => {
    setSaving(true);
    try {
      await apiRequest("POST", `/api/staff-shifts/${props.hospitalId}/assign`, {
        userId: props.userId,
        date: props.date,
        shiftTypeId: clearAll ? null : (shiftTypeId || null),
        role: clearAll ? null : (role || null),
      });
      queryClient.invalidateQueries({ queryKey: [`/api/staff-shifts/${props.hospitalId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/staff-pool/${props.hospitalId}`] });
      toast({ title: t("shifts.saved") });
      props.onSaved();
      props.onOpenChange(false);
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverTrigger asChild>{props.children}</PopoverTrigger>
      <PopoverContent className="w-80" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <h4 className="font-medium text-sm">{props.userName}</h4>
          <p className="text-xs text-muted-foreground">{props.date}</p>

          <AbsenceInfoBlock absence={props.absence ?? null} />

          <div className="space-y-1">
            <Label className="text-xs">{t("shifts.popover.role")}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={t("shifts.popover.rolePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("shifts.popover.roleNone")}</SelectItem>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">{t(`surgery.staff.${r}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("shifts.popover.shift")}</Label>
            <Select value={shiftTypeId} onValueChange={setShiftTypeId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={t("shifts.popover.shiftPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("shifts.popover.shiftNone")}</SelectItem>
                {shiftTypes.map((s) => {
                  const conflict = props.absence ? shiftOverlapsAbsence(s, props.absence) : false;
                  return (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                        {s.name} ({s.startTime}–{s.endTime})
                        {conflict && <AlertCircle className="h-3 w-3 text-amber-600" />}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" className="flex-1 h-8 text-xs" disabled={saving} onClick={() => save(false)}>
              {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {t("common.save")}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={saving} onClick={() => save(true)}>
              {t("shifts.popover.clearAll")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/shifts/StaffShiftPopover.tsx
git commit -m "feat(shifts): add StaffShiftPopover with absence-aware shift picker"
```

---

## Task 8: ShiftCell component

**Files:**
- Create: `client/src/components/shifts/ShiftCell.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { cn } from "@/lib/utils";
import type { ShiftType } from "@shared/schema";
import { absenceBgClass, type AbsenceInput } from "@/lib/absenceStyles";
import * as lucide from "lucide-react";

interface Props {
  shift?: ShiftType | null;
  absence?: AbsenceInput | null;
  variant: "week" | "month";
  onClick?: () => void;
  disabled?: boolean;
}

function iconFor(name?: string | null) {
  if (!name) return null;
  const Key = name
    .split("-")
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join("") as keyof typeof lucide;
  const Icon = lucide[Key] as React.ComponentType<{ className?: string }> | undefined;
  return Icon ? <Icon className="h-3 w-3" /> : null;
}

export default function ShiftCell({ shift, absence, variant, onClick, disabled }: Props) {
  const absenceClass = absenceBgClass(absence ?? null);

  return (
    <div
      className={cn(
        "h-full w-full p-1 rounded-sm",
        absenceClass,
        !disabled && "cursor-pointer hover:bg-muted/30 transition-colors",
      )}
      onClick={disabled ? undefined : onClick}
      data-testid="shift-cell"
    >
      {shift ? (
        <div
          className="rounded-sm text-white font-semibold px-2 py-1 flex items-center gap-1"
          style={{ backgroundColor: shift.color }}
        >
          {iconFor(shift.icon)}
          <span className="text-[11px]">{shift.code}</span>
          {variant === "week" && (
            <span className="text-[10px] opacity-90 ml-auto">
              {shift.startTime}–{shift.endTime}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/shifts/ShiftCell.tsx
git commit -m "feat(shifts): add ShiftCell component"
```

---

## Task 9: Shifts page shell + Week view

**Files:**
- Create: `client/src/pages/clinic/Shifts.tsx`
- Create: `client/src/components/shifts/ShiftsWeekView.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Register the route**

In `client/src/App.tsx`:

```tsx
const ClinicShifts = React.lazy(() => import("@/pages/clinic/Shifts"));
```

```tsx
<Route path="/clinic/shifts">{() => <ProtectedRoute requireClinic><ClinicShifts /></ProtectedRoute>}</Route>
```

- [ ] **Step 2: Write the page shell**

Create `client/src/pages/clinic/Shifts.tsx`:

```tsx
import { useState } from "react";
import { addDays, addMonths, startOfISOWeek, startOfMonth, endOfMonth, format } from "date-fns";
import { useTranslation } from "react-i18next";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ShiftsWeekView from "@/components/shifts/ShiftsWeekView";
import ShiftsMonthView from "@/components/shifts/ShiftsMonthView";
import ShiftsDayView from "@/components/shifts/ShiftsDayView";
import type { StaffShift, ShiftType } from "@shared/schema";

type View = "day" | "week" | "month";
const VIEW_KEY = "shifts_view";

export default function Shifts() {
  const { t } = useTranslation();
  const { activeHospital } = useActiveHospital();
  const hospitalId = activeHospital?.id;

  const [view, setView] = useState<View>(() => (sessionStorage.getItem(VIEW_KEY) as View) || "week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const setAndPersistView = (v: View) => {
    setView(v);
    sessionStorage.setItem(VIEW_KEY, v);
  };

  const { from, to } = (() => {
    if (view === "day") return { from: format(anchor, "yyyy-MM-dd"), to: format(anchor, "yyyy-MM-dd") };
    if (view === "week") {
      const start = startOfISOWeek(anchor);
      return { from: format(start, "yyyy-MM-dd"), to: format(addDays(start, 6), "yyyy-MM-dd") };
    }
    return { from: format(startOfMonth(anchor), "yyyy-MM-dd"), to: format(endOfMonth(anchor), "yyyy-MM-dd") };
  })();

  const { data: shiftTypes = [] } = useQuery<ShiftType[]>({
    queryKey: [`/api/shift-types/${hospitalId}`],
    enabled: !!hospitalId,
  });

  const { data: staffShifts = [] } = useQuery<StaffShift[]>({
    queryKey: [`/api/staff-shifts/${hospitalId}`, from, to],
    enabled: !!hospitalId,
    queryFn: async () => {
      const r = await fetch(`/api/staff-shifts/${hospitalId}?from=${from}&to=${to}`, { credentials: "include" });
      return r.json();
    },
  });

  const { data: providers = [] } = useQuery<any[]>({
    queryKey: [`/api/clinic/${hospitalId}/bookable-providers`, activeHospital?.unitId],
    enabled: !!hospitalId,
  });

  // Absences and time-off: reuse existing queries the Appointments tab uses
  const { data: absences = [] } = useQuery<any[]>({
    queryKey: [`/api/provider-absences/${hospitalId}`, from, to],
    enabled: !!hospitalId,
  });
  const { data: timeOffs = [] } = useQuery<any[]>({
    queryKey: [`/api/provider-time-off/${hospitalId}`, from, to],
    enabled: !!hospitalId,
  });

  const navigate = (dir: -1 | 1) => {
    setAnchor((a) => {
      if (view === "day") return addDays(a, dir);
      if (view === "week") return addDays(a, dir * 7);
      return addMonths(a, dir);
    });
  };

  const shared = { shiftTypes, staffShifts, providers, absences, timeOffs, hospitalId: hospitalId!, anchor };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("shifts.tabLabel")}</h1>
        <div className="flex gap-2">
          {(["day","week","month"] as const).map((v) => (
            <Button key={v} size="sm" variant={view === v ? "default" : "outline"} onClick={() => setAndPersistView(v)}>
              {t(`shifts.${v}View`)}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="icon" variant="outline" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={() => setAnchor(new Date())}>{t("common.today")}</Button>
        <Button size="icon" variant="outline" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
        <span className="ml-2 font-medium">{format(anchor, "MMMM yyyy")}</span>
      </div>
      {view === "day" && <ShiftsDayView {...shared} />}
      {view === "week" && <ShiftsWeekView {...shared} />}
      {view === "month" && <ShiftsMonthView {...shared} />}
    </div>
  );
}
```

Verify the actual shape of `useActiveHospital`, `ProtectedRoute`, and the absences/time-off query keys by grepping existing Appointments page code and matching them exactly.

- [ ] **Step 3: Write ShiftsWeekView**

Create `client/src/components/shifts/ShiftsWeekView.tsx`. Mirror the layout of `AppointmentsWeekView.tsx` (provider rows × 7 day columns) but render a `ShiftCell` per cell instead of the appointments list. Use `useState` for drag-select range and open the popover on mouseup. Full skeleton:

```tsx
import { useMemo, useState } from "react";
import { addDays, startOfISOWeek, format, parseISO, isWithinInterval } from "date-fns";
import StaffShiftPopover from "./StaffShiftPopover";
import ShiftCell from "./ShiftCell";
import type { ShiftType, StaffShift } from "@shared/schema";

interface Props {
  shiftTypes: ShiftType[];
  staffShifts: StaffShift[];
  providers: Array<{ id: string; firstName: string | null; lastName: string | null }>;
  absences: any[];
  timeOffs: any[];
  hospitalId: string;
  anchor: Date;
}

export default function ShiftsWeekView({ shiftTypes, staffShifts, providers, absences, timeOffs, hospitalId, anchor }: Props) {
  const weekStart = useMemo(() => startOfISOWeek(anchor), [anchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const shiftByKey = useMemo(() => {
    const m = new Map<string, StaffShift>();
    for (const s of staffShifts) m.set(`${s.userId}|${s.date}`, s);
    return m;
  }, [staffShifts]);

  const typeById = useMemo(() => new Map(shiftTypes.map(t => [t.id, t])), [shiftTypes]);

  const absenceFor = (userId: string, day: Date) => {
    const dayStr = format(day, "yyyy-MM-dd");
    for (const a of absences) {
      if (a.providerId === userId && dayStr >= a.startDate && dayStr <= a.endDate) {
        return { type: a.absenceType, isPartial: false, approvalStatus: "approved", startDate: a.startDate, endDate: a.endDate, reason: a.notes };
      }
    }
    for (const t of timeOffs) {
      if (t.providerId === userId && dayStr >= t.startDate && dayStr <= t.endDate) {
        return {
          type: t.reason ?? "timeoff",
          isPartial: !!t.startTime,
          approvalStatus: t.approvalStatus ?? "approved",
          startTime: t.startTime, endTime: t.endTime,
          startDate: t.startDate, endDate: t.endDate, reason: t.notes,
        };
      }
    }
    return null;
  };

  const [popover, setPopover] = useState<{ userId: string; userName: string; date: string } | null>(null);

  return (
    <div className="border rounded-md overflow-auto">
      <div className="grid" style={{ gridTemplateColumns: `160px repeat(7, minmax(100px, 1fr))` }}>
        <div className="p-2 bg-muted/30 text-xs font-medium">{/* empty */}</div>
        {days.map((d) => (
          <div key={d.toISOString()} className="p-2 bg-muted/30 text-xs font-medium text-center">
            {format(d, "EEE d MMM")}
          </div>
        ))}
        {providers.map((p) => {
          const name = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
          return (
            <>
              <div key={`name-${p.id}`} className="p-2 text-sm border-t font-medium bg-muted/10">{name}</div>
              {days.map((d) => {
                const dateStr = format(d, "yyyy-MM-dd");
                const shift = shiftByKey.get(`${p.id}|${dateStr}`);
                const shiftType = shift ? typeById.get(shift.shiftTypeId) ?? null : null;
                const absence = absenceFor(p.id, d);
                const isOpen = popover?.userId === p.id && popover?.date === dateStr;
                return (
                  <div key={`c-${p.id}-${dateStr}`} className="border-t border-l min-h-[44px]">
                    <StaffShiftPopover
                      hospitalId={hospitalId}
                      userId={p.id}
                      userName={name}
                      date={dateStr}
                      currentShiftTypeId={shift?.shiftTypeId ?? null}
                      absence={absence as any}
                      open={isOpen}
                      onOpenChange={(v) => setPopover(v ? { userId: p.id, userName: name, date: dateStr } : null)}
                      onSaved={() => {}}
                    >
                      <div className="h-full w-full">
                        <ShiftCell
                          shift={shiftType}
                          absence={absence as any}
                          variant="week"
                          onClick={() => setPopover({ userId: p.id, userName: name, date: dateStr })}
                        />
                      </div>
                    </StaffShiftPopover>
                  </div>
                );
              })}
            </>
          );
        })}
      </div>
    </div>
  );
}
```

Verify the **exact shape** of the provider-absences and time-off query responses by reading `AppointmentsWeekView.tsx` before filling the `absenceFor` helper — rename fields to match real DB columns.

- [ ] **Step 4: Manual smoke test**

Create a shift type in Settings, then navigate to `/clinic/shifts`. Click a cell in week view, assign a shift, confirm the chip appears. Reload — persists.

- [ ] **Step 5: Typecheck**

```bash
npm run check
```

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/clinic/Shifts.tsx \
        client/src/components/shifts/ShiftsWeekView.tsx \
        client/src/App.tsx
git commit -m "feat(shifts): add Shifts page + ShiftsWeekView"
```

---

## Task 10: ShiftsMonthView

**Files:**
- Create: `client/src/components/shifts/ShiftsMonthView.tsx`

- [ ] **Step 1: Write the month view**

Mirror `AppointmentsMonthView.tsx` structure (weekdays only, week separators). Each cell renders a `ShiftCell` with `variant="month"`. Reuse the same `shiftByKey`, `typeById`, and `absenceFor` helpers from the Week view — consider extracting to `client/src/components/shifts/shiftsHelpers.ts` if duplication is already causing drift, otherwise inline for now. Drag-select state/handler same pattern as Week view (cells in the same row only).

- [ ] **Step 2: Wire into `Shifts.tsx`**

Already wired via `{view === "month" && <ShiftsMonthView {...shared} />}` in Task 9. Verify it renders.

- [ ] **Step 3: Manual smoke test**

Switch between Month and Week; assignments persist; click a cell → popover opens.

- [ ] **Step 4: Typecheck + commit**

```bash
npm run check
git add client/src/components/shifts/ShiftsMonthView.tsx
git commit -m "feat(shifts): add ShiftsMonthView"
```

---

## Task 11: ShiftsDayView

**Files:**
- Create: `client/src/components/shifts/ShiftsDayView.tsx`

The day view is the time-axis view. Provider lanes with an hourly axis (06:00–22:00 to match the Appointments calendar range). Each lane renders:
- Unavailability block(s) positioned by absence/time-off hours
- Shift block positioned by the shift's `startTime`/`endTime`, drawn on top of or next to the unavailability

Click anywhere in an empty lane → popover opens. Click existing shift block → popover opens pre-filled.

- [ ] **Step 1: Write the component**

```tsx
import { useMemo, useState } from "react";
import { format } from "date-fns";
import StaffShiftPopover from "./StaffShiftPopover";
import type { ShiftType, StaffShift } from "@shared/schema";

const MIN_HOUR = 6;
const MAX_HOUR = 22;
const TOTAL_MIN = (MAX_HOUR - MIN_HOUR) * 60;

function timeToPct(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const mins = h * 60 + m - MIN_HOUR * 60;
  return (mins / TOTAL_MIN) * 100;
}

interface Props {
  shiftTypes: ShiftType[];
  staffShifts: StaffShift[];
  providers: Array<{ id: string; firstName: string | null; lastName: string | null }>;
  absences: any[];
  timeOffs: any[];
  hospitalId: string;
  anchor: Date;
}

export default function ShiftsDayView({ shiftTypes, staffShifts, providers, absences, timeOffs, hospitalId, anchor }: Props) {
  const dateStr = format(anchor, "yyyy-MM-dd");
  const typeById = useMemo(() => new Map(shiftTypes.map(t => [t.id, t])), [shiftTypes]);
  const shiftByUser = useMemo(() => {
    const m = new Map<string, StaffShift>();
    for (const s of staffShifts) if (s.date === dateStr) m.set(s.userId, s);
    return m;
  }, [staffShifts, dateStr]);

  const [popover, setPopover] = useState<{ userId: string; userName: string } | null>(null);

  const hours = Array.from({ length: MAX_HOUR - MIN_HOUR + 1 }, (_, i) => MIN_HOUR + i);

  return (
    <div className="border rounded-md overflow-auto">
      <div className="grid" style={{ gridTemplateColumns: `160px 60px 1fr` }}>
        <div />
        <div />
        <div className="relative border-b">
          <div className="flex">
            {hours.map((h) => (
              <div key={h} className="flex-1 text-[10px] text-muted-foreground px-1">{String(h).padStart(2, "0")}:00</div>
            ))}
          </div>
        </div>
        {providers.map((p) => {
          const name = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
          const shift = shiftByUser.get(p.id);
          const shiftType = shift ? typeById.get(shift.shiftTypeId) : null;
          const partialTimeOff = timeOffs.find(
            (t) => t.providerId === p.id && t.startTime && dateStr >= t.startDate && dateStr <= t.endDate
          );
          const fullAbsence = absences.find(
            (a) => a.providerId === p.id && dateStr >= a.startDate && dateStr <= a.endDate
          );
          return (
            <>
              <div key={`n-${p.id}`} className="p-2 text-sm border-t font-medium bg-muted/10">{name}</div>
              <div key={`sp-${p.id}`} className="border-t" />
              <div key={`l-${p.id}`} className="relative border-t h-14 bg-muted/5"
                   onClick={() => setPopover({ userId: p.id, userName: name })}>
                {fullAbsence && <div className="absolute inset-0 bg-red-100/50 dark:bg-red-950/30" />}
                {partialTimeOff && (
                  <div
                    className="absolute top-0 bottom-0 bg-red-200/60 dark:bg-red-900/40"
                    style={{
                      left: `${timeToPct(partialTimeOff.startTime)}%`,
                      width: `${timeToPct(partialTimeOff.endTime) - timeToPct(partialTimeOff.startTime)}%`,
                    }}
                  />
                )}
                {shiftType && (
                  <div
                    className="absolute top-1 bottom-1 rounded text-white text-[11px] font-semibold flex items-center px-2"
                    style={{
                      left: `${timeToPct(shiftType.startTime)}%`,
                      width: `${timeToPct(shiftType.endTime) - timeToPct(shiftType.startTime)}%`,
                      backgroundColor: shiftType.color,
                    }}
                  >
                    {shiftType.code} · {shiftType.startTime}–{shiftType.endTime}
                  </div>
                )}
              </div>
              <StaffShiftPopover
                hospitalId={hospitalId}
                userId={p.id}
                userName={name}
                date={dateStr}
                currentShiftTypeId={shift?.shiftTypeId ?? null}
                absence={partialTimeOff ? {
                  type: partialTimeOff.reason ?? "timeoff", isPartial: true,
                  startTime: partialTimeOff.startTime, endTime: partialTimeOff.endTime,
                  startDate: partialTimeOff.startDate, endDate: partialTimeOff.endDate,
                  reason: partialTimeOff.notes, approvalStatus: partialTimeOff.approvalStatus,
                } as any : fullAbsence ? {
                  type: fullAbsence.absenceType, isPartial: false,
                  startDate: fullAbsence.startDate, endDate: fullAbsence.endDate,
                  reason: fullAbsence.notes, approvalStatus: "approved",
                } as any : null}
                open={popover?.userId === p.id}
                onOpenChange={(v) => setPopover(v ? { userId: p.id, userName: name } : null)}
                onSaved={() => {}}
              >
                <span style={{ display: "none" }} />
              </StaffShiftPopover>
            </>
          );
        })}
      </div>
    </div>
  );
}
```

Note: the popover is rendered as a sibling with a hidden trigger, because the click handler is on the lane itself. If Radix Popover requires the trigger to be the anchor, restructure by positioning an invisible anchor inside the lane at the click coordinates. Follow the pattern already used in `ClinicCalendar.tsx` where popovers attach to arbitrary calendar areas.

- [ ] **Step 2: Manual smoke test — the core use case**

Seed a half-day `providerTimeOff` (e.g. 08:00–12:00) for a provider. Navigate to the Shifts Day view. Confirm the partial overlay sits over 08:00–12:00. Click the lane, open the popover, select a Late shift (16:00–22:00). Save. The shift chip should sit to the right of the time-off block, visually not overlapping. The Late shift in the dropdown should NOT have the warning icon. Now try an Early shift (07:00–15:00) — its dropdown entry should have the warning icon.

- [ ] **Step 3: Typecheck + commit**

```bash
npm run check
git add client/src/components/shifts/ShiftsDayView.tsx
git commit -m "feat(shifts): add ShiftsDayView with partial-time-off aware overlays"
```

---

## Task 12: Drag-select bulk assign (Week + Month)

**Files:**
- Modify: `client/src/components/shifts/ShiftsWeekView.tsx`
- Modify: `client/src/components/shifts/ShiftsMonthView.tsx`
- Modify: `server/routes/shifts.ts` (add `/assign/bulk` if not already)

- [ ] **Step 1: Add bulk endpoint to router**

In `server/routes/shifts.ts`, add:

```ts
const bulkAssignBody = z.object({
  items: z.array(z.object({
    userId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    shiftTypeId: z.string().nullable(),
    role: z.string().nullable(),
  })),
});

router.post("/api/staff-shifts/:hospitalId/assign/bulk", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  const { items } = bulkAssignBody.parse(req.body);
  await db.transaction(async (tx) => {
    for (const item of items) {
      // same logic as single assign, inside the same tx
    }
  });
  res.json({ ok: true });
});
```

Fill in the item loop by extracting the per-item logic from the single-assign endpoint into a shared helper function called from both.

- [ ] **Step 2: Add drag-select state to ShiftsWeekView**

Introduce `dragRange` state (start and end day indices for a specific provider row). Implement `onMouseDown` / `onMouseEnter` / `onMouseUp` on each cell, restricted to the same provider row. On mouseup:
- If the range is a single cell, open the popover as today
- If the range spans multiple cells, open the popover in "bulk" mode — popover shows the count ("Applying to 3 days") and Save calls the bulk endpoint with the expanded item list

Add a `bulk` boolean prop to `StaffShiftPopover` plus an optional `bulkCount` for the label. In bulk mode, the popover uses `/assign/bulk` and passes an array.

- [ ] **Step 3: Same in ShiftsMonthView**

Same drag-select pattern, limited to the same provider row and respecting week separators (don't allow a drag to span a separator — or allow it and just apply to the days; simpler = allow).

- [ ] **Step 4: Manual smoke test**

Drag across Mo–Fr for one provider, select a shift in the popover, confirm all five cells fill with the same shift.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run check
git add server/routes/shifts.ts \
        client/src/components/shifts/ShiftsWeekView.tsx \
        client/src/components/shifts/ShiftsMonthView.tsx \
        client/src/components/shifts/StaffShiftPopover.tsx
git commit -m "feat(shifts): drag-select bulk assign in week and month views"
```

---

## Task 13: OP calendar planned-staff detail dialog — Shift section

**Files:**
- Modify: the planned-staff detail dialog component (locate via grep)

- [ ] **Step 1: Find the dialog**

```bash
grep -rn "planned.?staff\|PlannedStaff\|staffPoolDetail" client/src/components/anesthesia client/src/components/surgery 2>/dev/null
```

The file should be a dialog that opens when clicking a planned staff member in the OP calendar staff box.

- [ ] **Step 2: Add a Shift section**

Inside the dialog body, below the existing role/unit fields, add:

```tsx
<div className="space-y-1">
  <Label className="text-xs">{t("shifts.popover.shift")}</Label>
  <Select value={shiftTypeId} onValueChange={setShiftTypeId}>
    <SelectTrigger className="h-8 text-xs">
      <SelectValue placeholder={t("shifts.popover.shiftPlaceholder")} />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="">{t("shifts.popover.shiftNone")}</SelectItem>
      {shiftTypes.map((s) => (
        <SelectItem key={s.id} value={s.id}>{s.name} ({s.startTime}–{s.endTime})</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
<AbsenceInfoBlock absence={absenceForThisUserAndDate} />
```

Load `shiftTypes` via `useQuery([/api/shift-types/:hospitalId])`. Load the current shift with `useQuery([/api/staff-shifts/:hospitalId, date, date])` and find the matching row.

When the user clicks Save on the dialog, after the existing save completes, call the single shift endpoint:

```ts
await apiRequest("POST", `/api/staff-shifts/${hospitalId}/assign`, {
  userId, date, shiftTypeId: shiftTypeId || null, role: null, // role handled by existing code
});
```

(or integrate into the existing combined endpoint if cleaner). The absence block reuses the same absence data already loaded by the OP dialog — inspect the code to find the existing absence prop/query and pass it.

- [ ] **Step 3: Manual smoke test**

Open a planned staff member in OP calendar, set a shift, save, close, reopen — shift persists.

- [ ] **Step 4: Typecheck + commit**

```bash
npm run check
git add <the dialog file>
git commit -m "feat(shifts): add shift field to OP planned-staff detail dialog"
```

---

## Task 14: Translations + nav entry

**Files:**
- Modify: `client/src/i18n/locales/en.json`
- Modify: `client/src/i18n/locales/de.json`
- Modify: clinic bottom-nav / sidebar

- [ ] **Step 1: Add all `shifts.*` keys to en.json**

```json
{
  "shifts": {
    "tabLabel": "Shifts",
    "dayView": "Day",
    "weekView": "Week",
    "monthView": "Month",
    "saved": "Shift saved",
    "popover": {
      "role": "Role (Saal plan)",
      "rolePlaceholder": "Select role",
      "roleNone": "Not in Saal",
      "shift": "Shift",
      "shiftPlaceholder": "Select shift",
      "shiftNone": "No shift",
      "clearAll": "Clear all"
    },
    "settings": {
      "title": "Shift Types",
      "addNew": "Add shift type",
      "empty": "No shift types configured yet.",
      "deleteBlocked": "This shift type is used in {{count}} assignments. Reassign or clear them first.",
      "form": {
        "name": "Name",
        "code": "Code",
        "icon": "Icon",
        "color": "Color",
        "startTime": "Start time",
        "endTime": "End time",
        "unit": "Unit",
        "allUnits": "All units",
        "sortOrder": "Sort order"
      }
    }
  }
}
```

- [ ] **Step 2: Add German translations to de.json**

Same keys, translated:

```json
{
  "shifts": {
    "tabLabel": "Schichten",
    "dayView": "Tag",
    "weekView": "Woche",
    "monthView": "Monat",
    "saved": "Schicht gespeichert",
    "popover": {
      "role": "Rolle (Saal-Plan)",
      "rolePlaceholder": "Rolle wählen",
      "roleNone": "Nicht im Saal",
      "shift": "Schicht",
      "shiftPlaceholder": "Schicht wählen",
      "shiftNone": "Keine Schicht",
      "clearAll": "Alles löschen"
    },
    "settings": {
      "title": "Schichttypen",
      "addNew": "Schichttyp hinzufügen",
      "empty": "Noch keine Schichttypen konfiguriert.",
      "deleteBlocked": "Dieser Schichttyp wird in {{count}} Zuweisungen verwendet. Bitte zuerst neu zuweisen oder löschen.",
      "form": {
        "name": "Name",
        "code": "Kürzel",
        "icon": "Icon",
        "color": "Farbe",
        "startTime": "Beginn",
        "endTime": "Ende",
        "unit": "Einheit",
        "allUnits": "Alle Einheiten",
        "sortOrder": "Sortierung"
      }
    }
  }
}
```

- [ ] **Step 3: Add nav entry**

Find the clinic bottom-nav / sidebar component (grep for the "Appointments" nav label). Add a new entry right after Appointments:

```tsx
{ to: "/clinic/shifts", icon: CalendarClock, label: t("shifts.tabLabel") }
```

Use the same entry shape as the surrounding items.

- [ ] **Step 4: Typecheck + manual walkthrough**

```bash
npm run check
npm run dev
```

Navigate: Appointments → Shifts (via nav) → Settings → Shift Types. All pages load, translations render in both EN and DE.

- [ ] **Step 5: Commit**

```bash
git add client/src/i18n/locales/en.json client/src/i18n/locales/de.json <nav file>
git commit -m "feat(shifts): add i18n keys and nav entry"
```

---

## Final verification

- [ ] **Step 1: Full typecheck**

```bash
npm run check
```

- [ ] **Step 2: Full test suite**

```bash
npm test
```

- [ ] **Step 3: Manual end-to-end walkthrough**

1. Create 3 shift types in Settings (Early, Late, Night)
2. Navigate to Shifts tab
3. Week view: assign Early to provider A Mo–Fr via drag-select
4. Month view: verify the chips appear on the right days
5. Day view: navigate to a day where provider B has a half-day time-off → assign a non-overlapping shift, confirm no warning icon; try an overlapping shift, confirm warning icon
6. Delete a shift type that's in use → confirm 409 toast with count
7. Reassign, then delete the now-empty shift type → confirm success
8. Open OP calendar, click a planned staff member, set a shift, save, reopen → persisted

- [ ] **Step 4: Deploy readiness check**

Run the "check db for deploy" workflow from `CLAUDE.md`:

```bash
# Verify 0205_shifts.sql is idempotent (re-read it)
npx drizzle-kit push   # should say "Changes applied" with no diff
npm run check          # clean
# Verify _journal.json has 0205 entry with max when
```

If everything is clean: feature is ready for review and deploy.
