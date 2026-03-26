# Separate Internal Bookable from Public Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple internal appointment calendar bookability from public `/book` page visibility by adding a separate `publicCalendarEnabled` field.

**Architecture:** Add `publicCalendarEnabled` boolean column to `userHospitalRoles`. Internal endpoints keep using `isBookable` only. Public booking endpoints additionally require `publicCalendarEnabled = true`. The ManageAvailabilityDialog "Public Calendar Enabled" toggle switches this new field instead of `isBookable`.

**Tech Stack:** Drizzle ORM, PostgreSQL, React, TanStack Query

**Spec:** `docs/superpowers/specs/2026-03-26-separate-bookable-public-calendar.md`

---

### Task 1: Schema + Migration

**Files:**
- Modify: `shared/schema.ts:165` (add column after `isBookable`)
- Modify: `shared/schema.ts:4191-4201` (add to `ClinicProvider` interface)
- Create: migration via `npm run db:generate`

- [ ] **Step 1: Add column to schema**

In `shared/schema.ts`, inside `userHospitalRoles` table definition, add after line 165 (`isBookable`):

```typescript
publicCalendarEnabled: boolean("public_calendar_enabled").default(false), // Whether provider appears on public /book page (requires isBookable=true)
```

- [ ] **Step 2: Add to ClinicProvider interface**

In `shared/schema.ts`, add `publicCalendarEnabled` to the `ClinicProvider` interface (after `isBookable`):

```typescript
publicCalendarEnabled: boolean;
```

- [ ] **Step 3: Generate migration**

Run: `npm run db:generate`

- [ ] **Step 4: Make migration idempotent**

Open the generated migration SQL file. It should contain an `ALTER TABLE` adding the column. Ensure it uses:

```sql
ALTER TABLE "user_hospital_roles" ADD COLUMN IF NOT EXISTS "public_calendar_enabled" boolean DEFAULT false;
```

- [ ] **Step 5: Verify journal timestamp**

Check `migrations/meta/_journal.json` — the new entry's `when` must be higher than `1774514523955` (current highest).

- [ ] **Step 6: Run migration**

Run: `npm run db:migrate`

- [ ] **Step 7: TypeScript check**

Run: `npm run check`
Expected: clean pass (may have errors from storage/routes not yet mapping the new field — that's fine, fix in next tasks)

- [ ] **Step 8: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat: add publicCalendarEnabled column to userHospitalRoles"
```

---

### Task 2: Storage Layer — Add `publicCalendarEnabled` to mapper + new public query

**Files:**
- Modify: `server/storage/clinic.ts:73-87` (`roleToClinicProvider` — add field)
- Modify: `server/storage/clinic.ts:174-199` (add `getPublicBookableProvidersByHospital`)

- [ ] **Step 1: Update `roleToClinicProvider` mapper**

In `server/storage/clinic.ts:73-87`, add `publicCalendarEnabled` to the return object:

```typescript
function roleToClinicProvider(role: UserHospitalRole): ClinicProvider {
  return {
    id: role.id,
    hospitalId: role.hospitalId,
    unitId: role.unitId,
    userId: role.userId,
    role: role.role,
    isBookable: role.isBookable ?? false,
    publicCalendarEnabled: (role as any).publicCalendarEnabled ?? false,
    availabilityMode: (role.availabilityMode as 'always_available' | 'windows_required') ?? 'always_available',
    bookingServiceName: role.bookingServiceName ?? null,
    bookingLocation: role.bookingLocation ?? null,
    createdAt: role.createdAt ?? null,
    updatedAt: null,
  };
}
```

Note: `(role as any)` is only needed if Drizzle type inference hasn't picked up the new column yet. Once `npm run db:generate` ran, the type should be inferred and the cast can be removed.

- [ ] **Step 2: Add `getPublicBookableProvidersByHospital` function**

Add after `getBookableProvidersByHospital` (after line 199):

```typescript
export async function getPublicBookableProvidersByHospital(hospitalId: string): Promise<(ClinicProvider & { user: User })[]> {
  const results = await db
    .select({
      role: userHospitalRoles,
      user: users
    })
    .from(userHospitalRoles)
    .innerJoin(users, eq(userHospitalRoles.userId, users.id))
    .where(and(
      eq(userHospitalRoles.hospitalId, hospitalId),
      eq(userHospitalRoles.isBookable, true),
      eq(userHospitalRoles.publicCalendarEnabled, true)
    ))
    .orderBy(asc(users.lastName), asc(users.firstName));

  const byUser = new Map<string, (ClinicProvider & { user: User })>();
  for (const r of results) {
    const existing = byUser.get(r.role.userId);
    if (!existing) {
      byUser.set(r.role.userId, { ...roleToClinicProvider(r.role), user: r.user });
    } else if (r.role.role === 'doctor' && existing.role !== 'doctor') {
      byUser.set(r.role.userId, { ...existing, role: 'doctor' });
    }
  }
  return Array.from(byUser.values());
}
```

- [ ] **Step 3: Also update `getClinicProvidersByHospital` to propagate `publicCalendarEnabled`**

In `getClinicProvidersByHospital` (line ~156-167), the dedup logic merges `isBookable` from multiple roles. Do the same for `publicCalendarEnabled`:

```typescript
} else if (r.role.isBookable && !existing.role.isBookable) {
  userMap.set(r.role.userId, {
    role: { ...existing.role, isBookable: true, publicCalendarEnabled: existing.role.publicCalendarEnabled || r.role.publicCalendarEnabled },
    user: r.user
  });
} else if (r.role.publicCalendarEnabled && !existing.role.publicCalendarEnabled) {
  userMap.set(r.role.userId, {
    role: { ...existing.role, publicCalendarEnabled: true },
    user: r.user
  });
}
```

- [ ] **Step 4: TypeScript check**

Run: `npm run check`

- [ ] **Step 5: Commit**

```bash
git add server/storage/clinic.ts
git commit -m "feat: add publicCalendarEnabled to storage mapper + public provider query"
```

---

### Task 3: Public Booking Routes — Use `publicCalendarEnabled` filter

**Files:**
- Modify: `server/routes/clinic.ts:333-367` (booking page endpoint)
- Modify: `server/routes/clinic.ts:370-416` (available-dates endpoint)
- Modify: `server/routes/clinic.ts:443-517` (best-provider endpoint)
- Modify: `server/routes/clinic.ts:520-590` (slots endpoint)
- Modify: `server/routes/clinic.ts:609-650` (book endpoint)

All public endpoints (`/api/public/booking/...`) must filter by `publicCalendarEnabled = true` in addition to `isBookable = true`.

- [ ] **Step 1: Update booking page provider list**

In `server/routes/clinic.ts:341`, change:

```typescript
// Before:
const providers = await storage.getBookableProvidersByHospital(hospital.id);
// After:
const providers = await storage.getPublicBookableProvidersByHospital(hospital.id);
```

Add import — `getPublicBookableProvidersByHospital` is a named export from `server/storage/clinic.ts`, and `storage` is already imported from there.

- [ ] **Step 2: Update available-dates provider check**

In `server/routes/clinic.ts:388-392`, add `publicCalendarEnabled` check:

```typescript
const roles = await db
  .select()
  .from(rolesTable)
  .where(and(
    eq(rolesTable.userId, providerId),
    eq(rolesTable.hospitalId, hospital.id),
    eq(rolesTable.isBookable, true),
    eq(rolesTable.publicCalendarEnabled, true)
  ));
```

- [ ] **Step 3: Update best-provider endpoint**

In `server/routes/clinic.ts:458`, change:

```typescript
// Before:
const allBookable = await storage.getBookableProvidersByHospital(hospital.id);
// After:
const allBookable = await storage.getPublicBookableProvidersByHospital(hospital.id);
```

- [ ] **Step 4: Update slots provider check**

In `server/routes/clinic.ts:535-542`, add `publicCalendarEnabled` check:

```typescript
const roles = await db
  .select()
  .from(rolesTable)
  .where(and(
    eq(rolesTable.userId, providerId),
    eq(rolesTable.hospitalId, hospital.id),
    eq(rolesTable.isBookable, true),
    eq(rolesTable.publicCalendarEnabled, true)
  ));
```

- [ ] **Step 5: Update book endpoint provider check**

In `server/routes/clinic.ts:630-637`, add `publicCalendarEnabled` check:

```typescript
const roles = await db
  .select()
  .from(rolesTable)
  .where(and(
    eq(rolesTable.userId, providerId),
    eq(rolesTable.hospitalId, hospital.id),
    eq(rolesTable.isBookable, true),
    eq(rolesTable.publicCalendarEnabled, true)
  ));
```

- [ ] **Step 6: TypeScript check**

Run: `npm run check`

- [ ] **Step 7: Commit**

```bash
git add server/routes/clinic.ts
git commit -m "feat: public booking endpoints require publicCalendarEnabled"
```

---

### Task 4: Provider Toggle Endpoint — Handle `publicCalendarEnabled`

**Files:**
- Modify: `server/routes/clinic.ts:2573-2643` (PUT clinic-providers/:userId)
- Modify: `server/routes/admin.ts:986-1049` (PATCH user-roles/:roleId/bookable)

- [ ] **Step 1: Update PUT endpoint to accept `publicCalendarEnabled`**

In `server/routes/clinic.ts:2578`, destructure the new field:

```typescript
const { isBookable, publicCalendarEnabled, bookingServiceName, bookingLocation } = req.body;
```

Remove the strict `isBookable` boolean check (line 2580-2582). Instead, validate that at least one of `isBookable` or `publicCalendarEnabled` is provided:

```typescript
if (typeof isBookable !== 'boolean' && typeof publicCalendarEnabled !== 'boolean') {
  return res.status(400).json({ message: "isBookable or publicCalendarEnabled must be a boolean" });
}
```

Update the updateSet building (line 2587-2590):

```typescript
const updateSet: Record<string, any> = {};
if (typeof isBookable === 'boolean') updateSet.isBookable = isBookable;
if (typeof publicCalendarEnabled === 'boolean') updateSet.publicCalendarEnabled = publicCalendarEnabled;
if (bookingServiceName !== undefined) updateSet.bookingServiceName = bookingServiceName || null;
if (bookingLocation !== undefined) updateSet.bookingLocation = bookingLocation || null;

// If turning off isBookable, also turn off publicCalendarEnabled
if (isBookable === false) updateSet.publicCalendarEnabled = false;
```

- [ ] **Step 2: Update admin PATCH endpoint**

In `server/routes/admin.ts:1022-1025`, when setting `isBookable = false`, also set `publicCalendarEnabled = false`:

```typescript
// Update the isBookable field in userHospitalRoles
const updateData: Record<string, any> = { isBookable };
if (!isBookable) updateData.publicCalendarEnabled = false;

await db.update(userHospitalRoles)
  .set(updateData)
  .where(eq(userHospitalRoles.id, roleId));
```

- [ ] **Step 3: TypeScript check**

Run: `npm run check`

- [ ] **Step 4: Commit**

```bash
git add server/routes/clinic.ts server/routes/admin.ts
git commit -m "feat: toggle endpoints handle publicCalendarEnabled + cascade off"
```

---

### Task 5: ManageAvailabilityDialog — Wire up `publicCalendarEnabled`

**Files:**
- Modify: `client/src/components/clinic/ManageAvailabilityDialog.tsx:665-787`

- [ ] **Step 1: Update the "Public Calendar Enabled" toggle**

In `ManageAvailabilityDialog.tsx:668`, change:

```typescript
// Before:
const isBookable = selectedFullProvider?.isBookable ?? false;
// After:
const isBookable = selectedFullProvider?.isBookable ?? false;
const publicCalendarEnabled = (selectedFullProvider as any)?.publicCalendarEnabled ?? false;
```

- [ ] **Step 2: Update toggle checked state and handler**

In `ManageAvailabilityDialog.tsx:685-694`, change the Switch:

```tsx
<Switch
  checked={publicCalendarEnabled}
  onCheckedChange={(checked) => {
    updateProviderBookingMutation.mutate({
      isBookable: selectedFullProvider?.isBookable ?? false,
      publicCalendarEnabled: checked,
      bookingServiceName: selectedFullProvider?.bookingServiceName || undefined,
      bookingLocation: selectedFullProvider?.bookingLocation || undefined,
    });
  }}
  disabled={updateProviderBookingMutation.isPending || !isBookable}
/>
```

- [ ] **Step 3: Add hint when provider is not bookable**

After the toggle div (line ~696), add a hint if not bookable:

```tsx
{!isBookable && (
  <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
    <p className="text-sm text-amber-700 dark:text-amber-300">
      {t('availability.mustBeBookableFirst', 'This provider must be set as "Bookable" in User Management before enabling the public calendar.')}
    </p>
  </div>
)}
```

- [ ] **Step 4: Update booking settings visibility**

In line ~699, change condition from `isBookable` to `publicCalendarEnabled`:

```typescript
// Before:
{isBookable && (
// After:
{publicCalendarEnabled && (
```

This shows the booking link, service name, and location only when the provider is publicly visible.

- [ ] **Step 5: Update service/location save calls**

In lines ~753-754 and ~772-773, the `onBlur` handlers send `isBookable: true`. Change to also pass `publicCalendarEnabled`:

```typescript
updateProviderBookingMutation.mutate({
  isBookable: true,
  publicCalendarEnabled: true,
  bookingServiceName: e.target.value,
  bookingLocation: selectedFullProvider?.bookingLocation || undefined,
});
```

(Same pattern for the location onBlur.)

- [ ] **Step 6: Update mutation type**

In `ManageAvailabilityDialog.tsx:136`, update the mutation type to include `publicCalendarEnabled`:

```typescript
mutationFn: async (data: { isBookable?: boolean; publicCalendarEnabled?: boolean; bookingServiceName?: string; bookingLocation?: string }) => {
```

- [ ] **Step 7: TypeScript check**

Run: `npm run check`

- [ ] **Step 8: Commit**

```bash
git add client/src/components/clinic/ManageAvailabilityDialog.tsx
git commit -m "feat: public calendar toggle uses publicCalendarEnabled field"
```

---

### Task 6: Final Verification

- [ ] **Step 1: TypeScript check**

Run: `npm run check`
Expected: clean pass

- [ ] **Step 2: Start dev server and manual test**

Run: `npm run dev`

Test scenarios:
1. Set a user "Bookable" from Users page → they appear in appointment calendar but NOT on `/book` page
2. Open Manage Availability → "Public Calendar Enabled" toggle is OFF and available to turn on
3. Turn on "Public Calendar Enabled" → provider now appears on `/book` page
4. Turn off "Bookable" from Users page → "Public Calendar Enabled" also turns off
5. Verify existing internal booking still works (appointment calendar)

- [ ] **Step 3: Commit any fixes**
