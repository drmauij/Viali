# Clinic Room Type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff mark that a walk-in patient has arrived and is physically waiting in a clinic area, visible on the OP-Plan surgery summary, automatically cleared when the patient is assigned a PACU bed.

**Architecture:** Add a generic `CLINIC` room type to the existing `surgery_rooms` model and a dedicated `clinicRoomId` FK on `surgeries`. Picker lives in the surgery summary dialog next to the PACU bed picker. Server enforces the sequential rule (assigning `pacuBedId` nulls `clinicRoomId`). OP page renders a distinct amber chip when clinic is set and PACU is not.

**Tech Stack:** Drizzle ORM, Postgres, Express, React, TanStack Query, shadcn/ui, i18next.

**Spec:** `docs/superpowers/specs/2026-04-09-clinic-room-type-design.md`

---

## File Structure

**Modified:**
- `shared/schema.ts` — extend `roomTypeEnum`, add `clinicRoomId` column + index, update insert schema types
- `migrations/0204_add_clinic_room_type.sql` — NEW idempotent migration
- `migrations/meta/_journal.json` — add entry (via `db:generate`)
- `server/routes/anesthesia/surgeries.ts:339` — PATCH handler enforces sequential rule
- `server/storage/anesthesia.ts` — include `clinicRoomId` + joined name in today's-surgeries query used by OP page
- `client/src/pages/admin/Clinical.tsx:1041` — add CLINIC option to Add Room dialog
- `client/src/components/anesthesia/PacuBedSelector.tsx` — narrow its `SurgeryRoom` type
- `client/src/components/anesthesia/SurgerySummaryDialog.tsx` — add Clinic room row above PACU bed row
- `client/src/pages/anesthesia/Op.tsx` — render clinic chip on surgery card
- `client/src/i18n/locales/en.json` — new strings
- `client/src/i18n/locales/de.json` — new strings (if present)

**Created:**
- `client/src/components/anesthesia/ClinicRoomSelector.tsx` — picker component mirroring `PacuBedSelector`'s single-select pattern, without occupancy checking
- `server/routes/anesthesia/__tests__/surgeries.clinicRoom.test.ts` — integration test for the sequential rule

---

## Task 1: Schema — extend enum and add FK

**Files:**
- Modify: `shared/schema.ts:237-238` (enum)
- Modify: `shared/schema.ts:980` (add column near `pacuBedId`)
- Modify: `shared/schema.ts:1067` (add index near `idx_surgeries_pacu_bed`)

- [ ] **Step 1: Update `roomTypeEnum`**

Replace line 237-238:

```ts
// Room types: OP = Operating Room, PACU = Post-Anesthesia Care Unit, CLINIC = waiting/reception area
export const roomTypeEnum = pgEnum("room_type", ["OP", "PACU", "CLINIC"]);
```

- [ ] **Step 2: Add `clinicRoomId` column on surgeries**

Immediately after the `pacuBedId` line (line 980), add:

```ts
  clinicRoomId: varchar("clinic_room_id").references(() => surgeryRooms.id), // Pre-op clinic/waiting room assignment — cleared when pacuBedId is set
```

- [ ] **Step 3: Add index**

In the `surgeries` index list, immediately after `idx_surgeries_pacu_bed` (line 1067), add:

```ts
    index("idx_surgeries_clinic_room").on(table.clinicRoomId),
```

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: PASS (no type errors introduced).

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(schema): add CLINIC room type and surgeries.clinicRoomId"
```

---

## Task 2: Migration

**Files:**
- Create: `migrations/0204_add_clinic_room_type.sql`
- Modify: `migrations/meta/_journal.json` (auto via `db:generate`)

- [ ] **Step 1: Generate migration**

Run: `npm run db:generate`
Expected: a new file `migrations/0204_*.sql` is created plus journal entry.

- [ ] **Step 2: Rewrite migration to be idempotent**

Overwrite the generated SQL at `migrations/0204_*.sql` (rename to `0204_add_clinic_room_type.sql` if needed) with:

```sql
-- Add CLINIC room type for pre-op waiting/reception rooms
-- Adds a new enum value and a nullable FK on surgeries
ALTER TYPE "room_type" ADD VALUE IF NOT EXISTS 'CLINIC';

ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "clinic_room_id" varchar REFERENCES "surgery_rooms"("id");

CREATE INDEX IF NOT EXISTS "idx_surgeries_clinic_room" ON "surgeries" ("clinic_room_id");
```

- [ ] **Step 3: Verify journal entry**

Run: `cat migrations/meta/_journal.json | tail -20`
Expected: new entry for `0204_add_clinic_room_type` with a `when` timestamp strictly greater than every previous entry in the file. If the `when` is lower than any prior entry, edit it to be `Date.now()` value greater than the current maximum.

- [ ] **Step 4: Apply migration**

Run: `npx drizzle-kit push`
Expected: "Changes applied" or "No changes detected" after push. Then run `npm run db:migrate` if the project uses it.

- [ ] **Step 5: Verify schema matches**

Run: `npx drizzle-kit push`
Expected: "No changes detected".

- [ ] **Step 6: Commit**

```bash
git add migrations/0204_add_clinic_room_type.sql migrations/meta/_journal.json migrations/meta/0*_snapshot.json
git commit -m "feat(db): migration for clinic room type"
```

---

## Task 3: Server — enforce sequential rule on surgery update (TEST FIRST)

**Files:**
- Create: `server/routes/anesthesia/__tests__/surgeries.clinicRoom.test.ts`
- Modify: `server/routes/anesthesia/surgeries.ts:357-380`

- [ ] **Step 1: Write failing test**

Create `server/routes/anesthesia/__tests__/surgeries.clinicRoom.test.ts`. The project pattern for integration tests uses supertest against the Express app — mirror whatever the closest existing test file does. Minimal coverage:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../../app"; // adjust import to match how other tests bootstrap the app
import { createTestSurgery, createTestRoom, loginAsTestUser } from "../../../../test/helpers"; // use existing helpers; if none, inline the setup following existing test files

describe("PATCH /api/anesthesia/surgeries/:id — clinicRoomId sequential rule", () => {
  it("assigning pacuBedId clears clinicRoomId", async () => {
    const agent = await loginAsTestUser();
    const pacu = await createTestRoom({ type: "PACU", name: "Bed 1" });
    const clinic = await createTestRoom({ type: "CLINIC", name: "Entrance" });
    const surgery = await createTestSurgery({ clinicRoomId: clinic.id });

    const res = await agent
      .patch(`/api/anesthesia/surgeries/${surgery.id}`)
      .send({ pacuBedId: pacu.id });

    expect(res.status).toBe(200);
    expect(res.body.pacuBedId).toBe(pacu.id);
    expect(res.body.clinicRoomId).toBeNull();
  });

  it("setting clinicRoomId alone leaves pacuBedId untouched", async () => {
    const agent = await loginAsTestUser();
    const pacu = await createTestRoom({ type: "PACU", name: "Bed 1" });
    const clinic = await createTestRoom({ type: "CLINIC", name: "Entrance" });
    const surgery = await createTestSurgery({ pacuBedId: pacu.id });

    const res = await agent
      .patch(`/api/anesthesia/surgeries/${surgery.id}`)
      .send({ clinicRoomId: clinic.id });

    expect(res.status).toBe(200);
    expect(res.body.pacuBedId).toBe(pacu.id);
    expect(res.body.clinicRoomId).toBe(clinic.id);
  });

  it("clearing pacuBedId does not repopulate clinicRoomId", async () => {
    const agent = await loginAsTestUser();
    const pacu = await createTestRoom({ type: "PACU", name: "Bed 1" });
    const surgery = await createTestSurgery({ pacuBedId: pacu.id });

    const res = await agent
      .patch(`/api/anesthesia/surgeries/${surgery.id}`)
      .send({ pacuBedId: null });

    expect(res.status).toBe(200);
    expect(res.body.pacuBedId).toBeNull();
    expect(res.body.clinicRoomId).toBeNull();
  });
});
```

Note to engineer: before writing this test, open the nearest existing integration test under `server/` to see the actual bootstrap pattern (app import, auth helper, DB cleanup). Match that pattern exactly — do not invent helpers that don't exist.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/anesthesia/__tests__/surgeries.clinicRoom.test.ts`
Expected: all three tests FAIL. The first one fails because `clinicRoomId` is not cleared; the others should pass or fail depending on baseline wiring — the key failing assertion is `expect(res.body.clinicRoomId).toBeNull()` in test 1.

- [ ] **Step 3: Implement the rule in the PATCH handler**

In `server/routes/anesthesia/surgeries.ts`, inside the PATCH handler, right after the date parsing block (line 369) and before the `isSuspended` block (line 371), insert:

```ts
    // Sequential physical-location rule: assigning a PACU bed clears any pending clinic/waiting assignment.
    // A patient is either waiting in the clinic OR in a PACU bed — never both.
    if (Object.prototype.hasOwnProperty.call(updateData, 'pacuBedId') && updateData.pacuBedId) {
      updateData.clinicRoomId = null;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/routes/anesthesia/__tests__/surgeries.clinicRoom.test.ts`
Expected: all three tests PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/anesthesia/__tests__/surgeries.clinicRoom.test.ts server/routes/anesthesia/surgeries.ts
git commit -m "feat(anesthesia): clear clinicRoomId when pacuBedId is assigned"
```

---

## Task 4: Surgery list query — include clinicRoomId + joined name

**Files:**
- Modify: `server/storage/anesthesia.ts` (the `getTodaySurgeries`-style function around line 993 that powers the OP page)

Goal: wherever the OP-page today-surgeries query currently left-joins `surgeryRooms` on `pacuBedId` to read `pacuBedName`, add a second left-join alias on `clinicRoomId` and return `clinicRoomId` + `clinicRoomName` on each row.

- [ ] **Step 1: Add alias + join**

Near the existing `leftJoin(surgeryRooms, eq(surgeries.pacuBedId, surgeryRooms.id))` (line 995), add an aliased second join. Drizzle pattern:

```ts
import { alias } from "drizzle-orm/pg-core";
// near top of function:
const clinicRoom = alias(surgeryRooms, "clinic_room");
// in the query chain, alongside the pacu bed join:
.leftJoin(clinicRoom, eq(surgeries.clinicRoomId, clinicRoom.id))
```

- [ ] **Step 2: Select the new columns**

If the query uses explicit `.select({...})`, add `clinicRoomId: surgeries.clinicRoomId` and `clinicRoomName: clinicRoom.name`. If it selects full rows, read them off the result row as `row.clinic_room?.name`.

- [ ] **Step 3: Return fields in the shaped result**

Wherever the function builds the returned objects (around line 970), add:

```ts
        clinicRoomId: row.surgery.clinicRoomId || null,
        clinicRoomName: row.clinic_room?.name || null,
```

Add the same two fields to the TypeScript return interface near line 874.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Smoke test**

Run: `npm run dev`, then in another shell hit the today-surgeries endpoint used by the OP page (find the exact URL in the `useQuery` in `client/src/pages/anesthesia/Op.tsx`). Confirm the response JSON now includes `clinicRoomId` and `clinicRoomName` on each surgery.

- [ ] **Step 6: Commit**

```bash
git add server/storage/anesthesia.ts
git commit -m "feat(anesthesia): expose clinicRoomId/name in OP surgery list"
```

---

## Task 5: Admin — add CLINIC to Add Room dialog

**Files:**
- Modify: `client/src/pages/admin/Clinical.tsx:1041-1042`
- Modify: `client/src/i18n/locales/en.json` (add `admin.roomTypeCLINIC`)
- Modify: `client/src/i18n/locales/de.json` if present

- [ ] **Step 1: Add SelectItem**

After line 1042 (PACU item), add:

```tsx
                  <SelectItem value="CLINIC">{t("admin.roomTypeCLINIC", "Clinic (Waiting Area)")}</SelectItem>
```

- [ ] **Step 2: Add i18n keys**

In `client/src/i18n/locales/en.json` under the `admin` namespace:

```json
"roomTypeCLINIC": "Clinic (Waiting Area)"
```

In `client/src/i18n/locales/de.json` (if present):

```json
"roomTypeCLINIC": "Klinik (Wartebereich)"
```

- [ ] **Step 3: Manual verify**

Run: `npm run dev`, open admin → Clinical → Add Room. Confirm the dropdown now shows "Clinic (Waiting Area)" and creating one persists with `type = "CLINIC"`.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/Clinical.tsx client/src/i18n/locales/*.json
git commit -m "feat(admin): allow creating CLINIC room type"
```

---

## Task 6: ClinicRoomSelector component

**Files:**
- Create: `client/src/components/anesthesia/ClinicRoomSelector.tsx`
- Modify: `client/src/components/anesthesia/PacuBedSelector.tsx:30` (widen the internal `SurgeryRoom` type to include `"CLINIC"` so no type error when querying all rooms)

- [ ] **Step 1: Widen SurgeryRoom type in PacuBedSelector**

Change `client/src/components/anesthesia/PacuBedSelector.tsx:30`:

```ts
  type: "OP" | "PACU" | "CLINIC";
```

(No logic change — the filter for `type === "PACU"` keeps its behavior.)

- [ ] **Step 2: Create the ClinicRoomSelector component**

Create `client/src/components/anesthesia/ClinicRoomSelector.tsx`:

```tsx
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { DoorOpen, X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SurgeryRoom {
  id: string;
  name: string;
  type: "OP" | "PACU" | "CLINIC";
  hospitalId: string;
  sortOrder: number;
}

interface ClinicRoomSelectorProps {
  surgeryId: string;
  hospitalId?: string;
  currentRoomId?: string | null;
  currentRoomName?: string | null;
  onAssign?: (roomId: string | null) => void;
  variant?: "button" | "badge";
  size?: "sm" | "default";
  disabled?: boolean;
}

export function ClinicRoomSelector({
  surgeryId,
  hospitalId: hospitalIdProp,
  currentRoomId,
  currentRoomName,
  onAssign,
  variant = "button",
  size = "default",
  disabled = false,
}: ClinicRoomSelectorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const hospitalId = hospitalIdProp || activeHospital?.id;
  const [open, setOpen] = useState(false);

  const { data: allRooms = [] } = useQuery<SurgeryRoom[]>({
    queryKey: [`/api/surgery-rooms/${hospitalId}`],
    enabled: !!hospitalId,
  });

  const clinicRooms = useMemo(
    () => allRooms.filter((r) => r.type === "CLINIC"),
    [allRooms],
  );

  const assignMutation = useMutation({
    mutationFn: async (roomId: string | null) => {
      return apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, {
        clinicRoomId: roomId,
      });
    },
    onSuccess: (_, roomId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries/${surgeryId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries/today/${hospitalId}`] });
      setOpen(false);
      onAssign?.(roomId);
      toast({
        title: t("common.success"),
        description: roomId
          ? t("anesthesia.clinic.assigned", "Patient marked as waiting")
          : t("anesthesia.clinic.unassigned", "Waiting status cleared"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("anesthesia.clinic.failedToAssign", "Failed to assign clinic room"),
        variant: "destructive",
      });
    },
  });

  const currentRoom = clinicRooms.find((r) => r.id === currentRoomId);
  const displayName = currentRoomName || currentRoom?.name;

  if (variant === "badge" && currentRoomId) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Badge
            variant="secondary"
            className="cursor-pointer gap-1 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
            data-testid="badge-clinic-room"
          >
            <DoorOpen className="h-3 w-3" />
            {displayName}
          </Badge>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <RoomList
            rooms={clinicRooms}
            currentRoomId={currentRoomId}
            onSelect={(id) => assignMutation.mutate(id)}
            isPending={assignMutation.isPending}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={currentRoomId ? "secondary" : "outline"}
          size={size}
          disabled={disabled}
          className={cn(
            currentRoomId &&
              "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50",
          )}
          data-testid="button-assign-clinic-room"
        >
          <DoorOpen className="h-4 w-4 mr-2" />
          {currentRoomId && displayName
            ? displayName
            : t("anesthesia.clinic.markWaiting", "Mark as Waiting")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <RoomList
          rooms={clinicRooms}
          currentRoomId={currentRoomId}
          onSelect={(id) => assignMutation.mutate(id)}
          isPending={assignMutation.isPending}
        />
      </PopoverContent>
    </Popover>
  );
}

interface RoomListProps {
  rooms: SurgeryRoom[];
  currentRoomId?: string | null;
  onSelect: (roomId: string | null) => void;
  isPending: boolean;
}

function RoomList({ rooms, currentRoomId, onSelect, isPending }: RoomListProps) {
  const { t } = useTranslation();

  if (rooms.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        {t("anesthesia.clinic.noRooms", "No clinic rooms configured")}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground px-2 py-1">
        {t("anesthesia.clinic.selectRoom", "Select Clinic Room")}
      </div>
      {rooms.map((room) => {
        const isSelected = room.id === currentRoomId;
        return (
          <button
            key={room.id}
            onClick={() => !isPending && onSelect(room.id)}
            disabled={isPending}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
              isSelected
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                : "hover:bg-muted cursor-pointer",
            )}
            data-testid={`button-select-clinic-room-${room.id}`}
          >
            <div className="flex items-center gap-2">
              <DoorOpen className="h-4 w-4" />
              <span className="font-medium">{room.name}</span>
            </div>
            {isSelected && <Check className="h-4 w-4 text-amber-700" />}
            {isPending && isSelected && <Loader2 className="h-4 w-4 animate-spin" />}
          </button>
        );
      })}
      {currentRoomId && (
        <>
          <div className="border-t my-1" />
          <button
            onClick={() => !isPending && onSelect(null)}
            disabled={isPending}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10"
            data-testid="button-unassign-clinic-room"
          >
            <X className="h-4 w-4" />
            {t("anesthesia.clinic.clear", "Clear Waiting")}
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add i18n strings**

In `client/src/i18n/locales/en.json` under `anesthesia.clinic`:

```json
"clinic": {
  "markWaiting": "Mark as Waiting",
  "assigned": "Patient marked as waiting",
  "unassigned": "Waiting status cleared",
  "failedToAssign": "Failed to assign clinic room",
  "noRooms": "No clinic rooms configured",
  "selectRoom": "Select Clinic Room",
  "clear": "Clear Waiting",
  "waitingLabel": "Waiting"
}
```

Mirror in `de.json` if present with translated strings.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/anesthesia/ClinicRoomSelector.tsx client/src/components/anesthesia/PacuBedSelector.tsx client/src/i18n/locales/*.json
git commit -m "feat(anesthesia): ClinicRoomSelector component"
```

---

## Task 7: Surgery summary dialog — add clinic row above PACU row

**Files:**
- Modify: `client/src/components/anesthesia/SurgerySummaryDialog.tsx` around line 122-123 and line 870-885

- [ ] **Step 1: Derive the clinic room**

Near line 123 (`const pacuBed = rooms.find(r => r.id === surgery?.pacuBedId);`), add on the next line:

```ts
  const clinicRoom = rooms.find(r => r.id === surgery?.clinicRoomId);
```

Also ensure the `Surgery` type used in the dialog (find the local interface or generated type) includes `clinicRoomId: string | null`. If it's derived from the API type, confirm Task 4's fields are present.

- [ ] **Step 2: Add the clinic row**

Immediately **before** the existing PACU Bed row block (around line 871), add a sibling row with the same structure, using the new `ClinicRoomSelector`. Example, matching the surrounding pattern:

```tsx
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('anesthesia.clinic.waitingLabel', 'Waiting')}</span>
                  {clinicRoom && (
                    <span
                      className="text-sm text-amber-800 dark:text-amber-300 font-semibold"
                      data-testid="text-clinic-room-current"
                    >
                      {clinicRoom.name}
                    </span>
                  )}
                </div>
                <ClinicRoomSelector
                  surgeryId={surgery!.id}
                  currentRoomId={surgery?.clinicRoomId}
                  currentRoomName={clinicRoom?.name}
                />
```

And add the import at the top of the file:

```ts
import { ClinicRoomSelector } from "@/components/anesthesia/ClinicRoomSelector";
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Manual verify**

Run: `npm run dev`. Open a surgery summary dialog. Confirm:
- Two rows visible: "Waiting" and "PACU Bed".
- Picking a clinic room shows the name on the Waiting row.
- Then picking a PACU bed clears the Waiting row (server-side rule, verified via refetch).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/anesthesia/SurgerySummaryDialog.tsx
git commit -m "feat(anesthesia): clinic room row in surgery summary dialog"
```

---

## Task 8: OP page — render clinic chip on surgery card

**Files:**
- Modify: `client/src/pages/anesthesia/Op.tsx`

Goal: on the OP surgery card (NOT inside the PACU documentation tab), wherever the PACU bed label is shown for each surgery in the OP-Plan list, add a sibling render of the clinic room chip when `clinicRoomId` is set and `pacuBedId` is not.

- [ ] **Step 1: Locate the card**

In `client/src/pages/anesthesia/Op.tsx`, find where surgeries are rendered in the OP-Plan list (the card that shows patient name, planned time, and currently the PACU bed info if any). The query returning these surgeries is the `/api/anesthesia/surgeries/today/...` response that Task 4 extended.

- [ ] **Step 2: Render the chip**

In the card JSX, next to where the existing PACU bed chip/label is rendered, add:

```tsx
{!surgery.pacuBedId && surgery.clinicRoomName && (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
    data-testid={`chip-clinic-room-${surgery.id}`}
  >
    {surgery.clinicRoomName}
  </span>
)}
```

Do NOT modify the existing PACU bed rendering — the precedence (PACU wins) happens automatically because the clinic chip is gated on `!surgery.pacuBedId`.

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Manual end-to-end verify**

Run: `npm run dev`. In the OP-Plan:
1. Open a surgery summary, mark patient as waiting (pick a clinic room). Close dialog.
2. Confirm the surgery card now shows an amber chip with the clinic room name.
3. Re-open the dialog, assign a PACU bed.
4. Confirm the amber chip disappears and the PACU bed label is shown instead.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/anesthesia/Op.tsx
git commit -m "feat(anesthesia): show clinic waiting chip on OP surgery card"
```

---

## Task 9: Final verification

- [ ] **Step 1: Typecheck**

Run: `npm run check`
Expected: PASS clean.

- [ ] **Step 2: Full test run**

Run: `npx vitest run`
Expected: all tests pass (at minimum, the three new tests in Task 3 plus all previously-passing tests).

- [ ] **Step 3: Migration idempotency check (per CLAUDE.md "check db for deploy")**

- Re-read `migrations/0204_add_clinic_room_type.sql` — every statement must have `IF NOT EXISTS` / `IF EXISTS` / equivalent guard. ✓
- Run: `npx drizzle-kit push` — expected "No changes detected".
- Verify `migrations/meta/_journal.json` newest entry is `0204_add_clinic_room_type` with the highest `when` value.

- [ ] **Step 4: Git status sanity**

Run: `git status`
Expected: clean working tree.

- [ ] **Step 5: Done**

Report: feature complete, all tests green, migration idempotent, ready to deploy.
