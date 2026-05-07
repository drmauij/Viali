# Surgeon-as-Praxis + In-Portal Surgery Request Form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `is_praxis` flag and `parent_surgeon_id` self-FK to `users`, then move the public surgery-request form behind the existing surgeon-portal OTP gate so a praxis user can submit on behalf of one of their child doctors.

**Architecture:** Schema gets two new columns on `users` and one new FK on `external_surgery_requests`. Server adds praxis storage helpers, an auth-gated request endpoint, and a roll-up extension to `getSurgeriesForSurgeon`. Admin UI exposes the flag and a children multi-select. The public submission endpoint becomes 410 Gone; its old client page redirects to the surgeon portal.

**Tech Stack:** Drizzle ORM (Postgres), Express, React + TanStack Query, shadcn/ui, vitest.

**Spec:** `docs/superpowers/specs/2026-05-07-surgeon-praxis-portal-design.md`

---

## File structure

| File | Action | Responsibility |
|------|--------|----------------|
| `migrations/0248_surgeon_praxis.sql` | Create | DB columns, FKs, indexes (idempotent) |
| `migrations/meta/_journal.json` | Modify | Append idx 248 entry |
| `shared/schema.ts` | Modify | Drizzle column defs on `users` + `externalSurgeryRequests` |
| `server/storage/surgeonPortal.ts` | Modify | New praxis helpers + roll-up in `getSurgeriesForSurgeon` |
| `server/storage/clinic.ts` | Modify (light) | `updateUser` already accepts arbitrary partial — no change unless typing blocks it |
| `server/routes/surgeonPortal.ts` | Modify | New `POST /:token/requests` endpoint |
| `server/routes/externalSurgery.ts` | Modify | Public POST returns 410 Gone |
| `server/routes/admin.ts` | Modify | Extend user-details PATCH; add praxis-children PUT |
| `client/src/pages/admin/Users.tsx` | Modify | Praxis checkbox + children multi-select in edit dialog |
| `client/src/pages/SurgeonPortal.tsx` | Modify | New request-form section (with surgeon picker for praxes) |
| `client/src/pages/ExternalSurgeryRequest.tsx` | Replace | Redirect to surgeon portal |
| `tests/surgeon-praxis-storage.test.ts` | Create | Unit tests for praxis helpers + roll-up |
| `tests/surgeon-praxis-routes.test.ts` | Create | Integration tests for new POST endpoint |

Tests follow the project pattern (`tests/<feature>.test.ts`, vitest, real DB, `TEST_HOSPITAL_ID`, cleanup in `afterAll`).

---

## Task 1: Database migration + Drizzle schema

**Files:**
- Create: `migrations/0248_surgeon_praxis.sql`
- Modify: `migrations/meta/_journal.json`
- Modify: `shared/schema.ts:38` (users) and `shared/schema.ts:5600` (externalSurgeryRequests)

- [ ] **Step 1: Write the migration SQL**

Create `migrations/0248_surgeon_praxis.sql`:

```sql
-- 0248_surgeon_praxis.sql
-- Adds is_praxis flag and parent_surgeon_id self-FK to users.
-- Adds optional surgeon_id FK to external_surgery_requests for new portal-submitted requests.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_praxis BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS parent_surgeon_id VARCHAR;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_parent_surgeon_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_parent_surgeon_id_fkey
      FOREIGN KEY (parent_surgeon_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_parent_surgeon_id
  ON users(parent_surgeon_id);

ALTER TABLE external_surgery_requests
  ADD COLUMN IF NOT EXISTS surgeon_id VARCHAR;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'external_surgery_requests_surgeon_id_fkey'
  ) THEN
    ALTER TABLE external_surgery_requests
      ADD CONSTRAINT external_surgery_requests_surgeon_id_fkey
      FOREIGN KEY (surgeon_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_external_surgery_requests_surgeon_id
  ON external_surgery_requests(surgeon_id);
```

- [ ] **Step 2: Append journal entry**

Edit `migrations/meta/_journal.json`. The current last entry is idx 247 with `when: 1780100000000`. Append:

```json
    {
      "idx": 248,
      "version": "7",
      "when": 1780200000000,
      "tag": "0248_surgeon_praxis",
      "breakpoints": true
    }
```

Make sure `when` is strictly higher than every previous entry (verify with `jq '.entries[].when' migrations/meta/_journal.json | sort -n | tail -3`).

- [ ] **Step 3: Update Drizzle users schema**

In `shared/schema.ts`, locate `export const users = pgTable("users", {` (line 38). Add these two fields anywhere inside the column block (suggest right after `role`):

```ts
isPraxis: boolean("is_praxis").notNull().default(false),
parentSurgeonId: varchar("parent_surgeon_id"),
```

Note: the Drizzle FK reference on `parentSurgeonId` is intentionally not declared via `.references(() => users.id)` because that creates a self-reference cycle Drizzle's TypeScript can't always resolve. The constraint is enforced by the migration — Drizzle just sees a varchar column.

- [ ] **Step 4: Update Drizzle externalSurgeryRequests schema**

In `shared/schema.ts`, locate `export const externalSurgeryRequests = pgTable("external_surgery_requests", {` (line 5600). Add this column right after `surgeonPhone` (line 5608):

```ts
// Optional FK populated by portal-submitted requests; null on legacy public-form rows
surgeonId: varchar("surgeon_id").references(() => users.id, { onDelete: "set null" }),
```

- [ ] **Step 5: Run migration and verify**

```bash
npx drizzle-kit push
npm run check
```

Expected: drizzle-kit reports schema in sync, TypeScript passes clean.

Manual DB check:

```bash
psql $DATABASE_URL -c "\d users" | grep -E "is_praxis|parent_surgeon"
psql $DATABASE_URL -c "\d external_surgery_requests" | grep surgeon_id
```

Expected: three new columns present.

- [ ] **Step 6: Commit**

```bash
git add migrations/0248_surgeon_praxis.sql migrations/meta/_journal.json shared/schema.ts
git commit -m "feat(surgeon-portal): add is_praxis flag and parent_surgeon_id to users"
```

---

## Task 2: Praxis storage helpers

**Files:**
- Modify: `server/storage/surgeonPortal.ts` (append helpers)
- Test: `tests/surgeon-praxis-storage.test.ts` (create)

These helpers are used by the admin endpoints (Task 4) and the request endpoint (Task 5). Write tests first.

- [ ] **Step 1: Write failing tests for helpers**

Create `tests/surgeon-praxis-storage.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../server/db";
import { users } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import {
  getChildrenOfPraxis,
  setPraxisChildren,
  togglePraxis,
} from "../server/storage/surgeonPortal";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const createdUserIds: string[] = [];

async function makeUser(email: string, opts: { isPraxis?: boolean } = {}) {
  const [u] = await db.insert(users).values({
    email,
    firstName: "Test",
    lastName: email.split("@")[0],
    role: "doctor",
    isPraxis: opts.isPraxis ?? false,
  }).returning();
  createdUserIds.push(u.id);
  return u;
}

afterAll(async () => {
  if (createdUserIds.length > 0) {
    // Clear parent_surgeon_id first to avoid FK issues during cleanup
    await db.update(users).set({ parentSurgeonId: null })
      .where(inArray(users.id, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  const { pool } = await import("../server/db");
  await pool.end();
});

describe("getChildrenOfPraxis", () => {
  it("returns only children whose parent_surgeon_id matches", async () => {
    const praxis = await makeUser(`praxis-${Date.now()}@test.local`, { isPraxis: true });
    const childA = await makeUser(`childA-${Date.now()}@test.local`);
    const childB = await makeUser(`childB-${Date.now()}@test.local`);
    const unrelated = await makeUser(`other-${Date.now()}@test.local`);

    await db.update(users).set({ parentSurgeonId: praxis.id })
      .where(inArray(users.id, [childA.id, childB.id]));

    const children = await getChildrenOfPraxis(praxis.id);
    const childIds = children.map((c) => c.id).sort();
    expect(childIds).toEqual([childA.id, childB.id].sort());
    expect(children.find((c) => c.id === unrelated.id)).toBeUndefined();
  });
});

describe("setPraxisChildren", () => {
  it("rewrites parent_surgeon_id to the given set, clearing previous links", async () => {
    const praxis = await makeUser(`praxis2-${Date.now()}@test.local`, { isPraxis: true });
    const a = await makeUser(`a-${Date.now()}@test.local`);
    const b = await makeUser(`b-${Date.now()}@test.local`);
    const c = await makeUser(`c-${Date.now()}@test.local`);

    await setPraxisChildren(praxis.id, [a.id, b.id]);
    let kids = await getChildrenOfPraxis(praxis.id);
    expect(kids.map((k) => k.id).sort()).toEqual([a.id, b.id].sort());

    // Replace set: now only c
    await setPraxisChildren(praxis.id, [c.id]);
    kids = await getChildrenOfPraxis(praxis.id);
    expect(kids.map((k) => k.id)).toEqual([c.id]);

    // Empty set clears all
    await setPraxisChildren(praxis.id, []);
    kids = await getChildrenOfPraxis(praxis.id);
    expect(kids).toEqual([]);
  });

  it("refuses to set a praxis user as a child", async () => {
    const praxis = await makeUser(`praxis3-${Date.now()}@test.local`, { isPraxis: true });
    const otherPraxis = await makeUser(`praxis4-${Date.now()}@test.local`, { isPraxis: true });

    await expect(
      setPraxisChildren(praxis.id, [otherPraxis.id])
    ).rejects.toThrow(/cannot be a child/i);
  });
});

describe("togglePraxis", () => {
  it("turns is_praxis on", async () => {
    const u = await makeUser(`tog-${Date.now()}@test.local`);
    await togglePraxis(u.id, true);
    const [refetched] = await db.select().from(users).where(eq(users.id, u.id));
    expect(refetched.isPraxis).toBe(true);
  });

  it("refuses to turn off if children still linked", async () => {
    const praxis = await makeUser(`tog2-${Date.now()}@test.local`, { isPraxis: true });
    const child = await makeUser(`tog3-${Date.now()}@test.local`);
    await db.update(users).set({ parentSurgeonId: praxis.id })
      .where(eq(users.id, child.id));

    await expect(togglePraxis(praxis.id, false))
      .rejects.toThrow(/still has linked children/i);
  });

  it("turns off cleanly when no children linked", async () => {
    const u = await makeUser(`tog4-${Date.now()}@test.local`, { isPraxis: true });
    await togglePraxis(u.id, false);
    const [refetched] = await db.select().from(users).where(eq(users.id, u.id));
    expect(refetched.isPraxis).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/surgeon-praxis-storage.test.ts
```

Expected: FAIL with "getChildrenOfPraxis is not a function" (or similar import error).

- [ ] **Step 3: Implement helpers**

Append to `server/storage/surgeonPortal.ts`:

```ts
// ========== PRAXIS HELPERS ==========

/**
 * Return all users where parent_surgeon_id = praxisUserId.
 * Caller is responsible for verifying praxisUserId actually has is_praxis=true.
 */
export async function getChildrenOfPraxis(praxisUserId: string) {
  return await db
    .select()
    .from(users)
    .where(eq(users.parentSurgeonId, praxisUserId));
}

/**
 * Replace the set of children for a praxis. Rewrites parent_surgeon_id atomically:
 *   - new children get parent_surgeon_id = praxisUserId
 *   - previously-linked children NOT in the new set get parent_surgeon_id = null
 * Throws if any candidate child has is_praxis=true (one-level only).
 */
export async function setPraxisChildren(
  praxisUserId: string,
  childUserIds: string[],
) {
  if (childUserIds.length > 0) {
    const candidates = await db
      .select({ id: users.id, isPraxis: users.isPraxis })
      .from(users)
      .where(inArray(users.id, childUserIds));

    const praxisChildren = candidates.filter((c) => c.isPraxis);
    if (praxisChildren.length > 0) {
      throw new Error(
        `User(s) ${praxisChildren.map((c) => c.id).join(", ")} cannot be a child — already a praxis`,
      );
    }
  }

  await db.transaction(async (tx) => {
    // 1. Clear all current children of this praxis
    await tx
      .update(users)
      .set({ parentSurgeonId: null })
      .where(eq(users.parentSurgeonId, praxisUserId));

    // 2. Set new children
    if (childUserIds.length > 0) {
      await tx
        .update(users)
        .set({ parentSurgeonId: praxisUserId })
        .where(inArray(users.id, childUserIds));
    }
  });
}

/**
 * Toggle is_praxis on a user. When turning OFF, refuses if children are still linked.
 */
export async function togglePraxis(userId: string, isPraxis: boolean) {
  if (!isPraxis) {
    const children = await getChildrenOfPraxis(userId);
    if (children.length > 0) {
      throw new Error(
        `User ${userId} still has linked children — unlink them before disabling praxis`,
      );
    }
  }

  await db
    .update(users)
    .set({ isPraxis })
    .where(eq(users.id, userId));
}
```

Add `inArray` to the existing drizzle-orm imports at the top of the file (`import { eq, and, sql, gte, lt, isNotNull, inArray } from "drizzle-orm";`).

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/surgeon-praxis-storage.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/storage/surgeonPortal.ts tests/surgeon-praxis-storage.test.ts
git commit -m "feat(surgeon-portal): add praxis storage helpers (getChildren, setChildren, toggle)"
```

---

## Task 3: Praxis dashboard roll-up

**Files:**
- Modify: `server/storage/surgeonPortal.ts:26-110` (`getSurgeriesForSurgeon`)
- Test: extend `tests/surgeon-praxis-storage.test.ts`

Extend `getSurgeriesForSurgeon` so a praxis user pulls in surgeries belonging to their children too.

- [ ] **Step 1: Add failing test**

Append to `tests/surgeon-praxis-storage.test.ts`:

```ts
import { surgeries, externalSurgeryRequests } from "@shared/schema";
import { getSurgeriesForSurgeon } from "../server/storage/surgeonPortal";

const createdSurgeryIds: string[] = [];
const createdReqIds: string[] = [];

// Add to the existing afterAll cleanup (don't write a second afterAll — extend the one already there)
// At the top of afterAll, before the users delete:
//   await db.delete(externalSurgeryRequests).where(inArray(externalSurgeryRequests.id, createdReqIds));
//   await db.delete(surgeries).where(inArray(surgeries.id, createdSurgeryIds));

describe("getSurgeriesForSurgeon — praxis roll-up", () => {
  it("returns surgeries for praxis itself plus all children", async () => {
    const praxis = await makeUser(`rp-${Date.now()}@test.local`, { isPraxis: true });
    const childA = await makeUser(`rcA-${Date.now()}@test.local`);
    const childB = await makeUser(`rcB-${Date.now()}@test.local`);
    await db.update(users).set({ parentSurgeonId: praxis.id })
      .where(inArray(users.id, [childA.id, childB.id]));

    // One surgery for childA via surgeonId match
    const [surgA] = await db.insert(surgeries).values({
      hospitalId: TEST_HOSPITAL_ID,
      patientName: "TestA",
      scheduledDate: new Date(),
      surgeonId: childA.id,
      status: "scheduled",
    } as any).returning();
    createdSurgeryIds.push(surgA.id);

    // One external request for childB (linked to a fresh surgery)
    const [surgB] = await db.insert(surgeries).values({
      hospitalId: TEST_HOSPITAL_ID,
      patientName: "TestB",
      scheduledDate: new Date(),
      surgeonId: childB.id,
      status: "scheduled",
    } as any).returning();
    createdSurgeryIds.push(surgB.id);

    // Fetch as praxis (by email)
    const results = await getSurgeriesForSurgeon(TEST_HOSPITAL_ID, praxis.email!);
    const ids = results.map((s) => s.id);
    expect(ids).toContain(surgA.id);
    expect(ids).toContain(surgB.id);
  });

  it("solo doctor sees only their own surgeries", async () => {
    const solo = await makeUser(`solo-${Date.now()}@test.local`);
    const [surg] = await db.insert(surgeries).values({
      hospitalId: TEST_HOSPITAL_ID,
      patientName: "SoloPatient",
      scheduledDate: new Date(),
      surgeonId: solo.id,
      status: "scheduled",
    } as any).returning();
    createdSurgeryIds.push(surg.id);

    const results = await getSurgeriesForSurgeon(TEST_HOSPITAL_ID, solo.email!);
    expect(results.find((s) => s.id === surg.id)).toBeDefined();
    // No roll-up: ensure unrelated surgeries are NOT here (we only inserted one)
  });
});
```

Also update the existing `afterAll` to also delete from `externalSurgeryRequests` and `surgeries` (use the snippet shown above).

If `surgeries` requires extra non-null fields (check the schema — `scheduledDate` may be `surgery_date`, etc.), adjust the insert to include them. The exact required fields depend on `shared/schema.ts` — read the table def first and match.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/surgeon-praxis-storage.test.ts -t "praxis roll-up"
```

Expected: FAIL — current `getSurgeriesForSurgeon` only matches the caller's email, not children.

- [ ] **Step 3: Modify `getSurgeriesForSurgeon`**

Replace lines 26–80 of `server/storage/surgeonPortal.ts` (the function body up to the `if (allSurgeryIds.length === 0)` check). The new flow:

1. Resolve the calling user by `(hospitalId membership, email)` to get their `userId` and `isPraxis`.
2. If `isPraxis`, fetch children's emails and IDs; otherwise, just the caller's.
3. Use the expanded email set for both Source 1 (external request match) and Source 2 (surgeon-user match).

```ts
export async function getSurgeriesForSurgeon(
  hospitalId: string,
  surgeonEmail: string,
  month?: string,
) {
  const callerEmailLower = surgeonEmail.toLowerCase();

  // Resolve caller user. We do not require hospital membership here because the portal
  // session has already verified that — we just need the user record for is_praxis.
  const [caller] = await db
    .select({ id: users.id, email: users.email, isPraxis: users.isPraxis })
    .from(users)
    .where(sql`LOWER(${users.email}) = ${callerEmailLower}`)
    .limit(1);

  // Build the set of (id, email) tuples to match against
  const matchUserIds: string[] = [];
  const matchEmailsLower: string[] = [callerEmailLower];

  if (caller) {
    matchUserIds.push(caller.id);
    if (caller.isPraxis) {
      const children = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.parentSurgeonId, caller.id));
      for (const child of children) {
        matchUserIds.push(child.id);
        if (child.email) matchEmailsLower.push(child.email.toLowerCase());
      }
    }
  }

  // Build date range filter if month is provided
  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;
  if (month) {
    const [year, monthNum] = month.split("-").map(Number);
    dateFrom = new Date(year, monthNum - 1, 1);
    dateTo = new Date(year, monthNum, 1);
  }

  // Source 1: linked from external_surgery_requests by email OR by surgeon_id
  const externalRows = await db
    .select({ surgeryId: externalSurgeryRequests.surgeryId })
    .from(externalSurgeryRequests)
    .where(
      and(
        eq(externalSurgeryRequests.hospitalId, hospitalId),
        eq(externalSurgeryRequests.status, "scheduled"),
        isNotNull(externalSurgeryRequests.surgeryId),
        sql`(LOWER(${externalSurgeryRequests.surgeonEmail}) IN (${sql.join(
          matchEmailsLower.map((e) => sql`${e}`),
          sql`, `,
        )}) OR ${externalSurgeryRequests.surgeonId} IN (${sql.join(
          matchUserIds.length > 0 ? matchUserIds.map((id) => sql`${id}`) : [sql`NULL`],
          sql`, `,
        )}))`,
      ),
    );

  const linkedSurgeryIds = externalRows
    .map((r) => r.surgeryId)
    .filter((id): id is string => id !== null);

  // Source 2: surgeries.surgeonId points to any of the matched users, OR
  //           surgeries.surgeonId user's email matches the matched email set.
  const userSurgeries = await db
    .select({ surgeryId: surgeries.id })
    .from(surgeries)
    .innerJoin(users, eq(surgeries.surgeonId, users.id))
    .where(
      and(
        eq(surgeries.hospitalId, hospitalId),
        sql`(${users.id} IN (${sql.join(
          matchUserIds.length > 0 ? matchUserIds.map((id) => sql`${id}`) : [sql`NULL`],
          sql`, `,
        )}) OR LOWER(${users.email}) IN (${sql.join(
          matchEmailsLower.map((e) => sql`${e}`),
          sql`, `,
        )}))`,
      ),
    );

  const userSurgeryIds = userSurgeries.map((r) => r.surgeryId);

  // Combine and deduplicate
  const allSurgeryIds = [...new Set([...linkedSurgeryIds, ...userSurgeryIds])];

  if (allSurgeryIds.length === 0) {
    return [];
  }
  // ... (existing surgery-detail fetch code from old line 81 onward stays unchanged)
```

Keep everything from old line 81 (`// Fetch full surgery details for all matched IDs`) onward as-is.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/surgeon-praxis-storage.test.ts
```

Expected: all tests pass (helpers + roll-up).

- [ ] **Step 5: Commit**

```bash
git add server/storage/surgeonPortal.ts tests/surgeon-praxis-storage.test.ts
git commit -m "feat(surgeon-portal): roll up children's surgeries when caller is_praxis"
```

---

## Task 4: Admin endpoints — praxis flag + children management

**Files:**
- Modify: `server/routes/admin.ts:799-855` (`PATCH /api/admin/users/:userId/details`)
- Modify: `server/routes/admin.ts` (add `PUT /api/admin/users/:userId/praxis-children`)

The existing details PATCH already accepts arbitrary fields — we just need to thread `isPraxis` through it. The children-set is large enough to deserve its own endpoint.

- [ ] **Step 1: Extend user-details PATCH for `isPraxis`**

In `server/routes/admin.ts`, line 802, expand the destructure:

```ts
const { firstName, lastName, phone, adminNotes, weeklyTargetHours, overtimeBalanceMinutes, hospitalId, gln, zsrNumber, isPraxis } = req.body;
```

After the existing optional-field handling (around line 848, after `zsrNumber`), add:

```ts
if (isPraxis !== undefined) {
  // Use storage helper so the "still has children" guard fires
  const { togglePraxis } = await import("../storage/surgeonPortal");
  try {
    await togglePraxis(userId, !!isPraxis);
  } catch (e: any) {
    return res.status(409).json({ message: e.message });
  }
}
```

The `togglePraxis` call already issues its own UPDATE, so don't re-include `isPraxis` in the `updateData` object that's passed to `storage.updateUser`.

- [ ] **Step 2: Add new endpoint for children management**

Insert after the user-details PATCH block (around line 855), before the next route definition:

```ts
router.put('/api/admin/users/:userId/praxis-children', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { userId } = req.params;
    const { hospitalId, childUserIds } = req.body as { hospitalId: string; childUserIds: string[] };

    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID is required" });
    }
    if (!Array.isArray(childUserIds)) {
      return res.status(400).json({ message: "childUserIds must be an array" });
    }

    const currentUserId = req.user.id;
    const hospitals = await storage.getUserHospitals(currentUserId);
    const hasAdminRole = hospitals.some(h => h.id === hospitalId && (h.role === 'admin' || h.role === 'group_admin'));
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!targetUser.isPraxis) {
      return res.status(400).json({ message: "User is not flagged as a praxis" });
    }

    // Verify praxis belongs to this hospital
    const targetUserHospitals = await storage.getUserHospitals(userId);
    if (!targetUserHospitals.some(h => h.id === hospitalId)) {
      return res.status(403).json({ message: "User does not belong to this hospital" });
    }

    // Verify all candidate children belong to this hospital
    if (childUserIds.length > 0) {
      for (const childId of childUserIds) {
        const childHosps = await storage.getUserHospitals(childId);
        if (!childHosps.some(h => h.id === hospitalId)) {
          return res.status(400).json({ message: `Child ${childId} does not belong to this hospital` });
        }
      }
    }

    const { setPraxisChildren } = await import("../storage/surgeonPortal");
    try {
      await setPraxisChildren(userId, childUserIds);
    } catch (e: any) {
      return res.status(409).json({ message: e.message });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error("Error setting praxis children:", error);
    res.status(500).json({ message: "Failed to set praxis children" });
  }
});

router.get('/api/admin/users/:userId/praxis-children', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { userId } = req.params;
    const { getChildrenOfPraxis } = await import("../storage/surgeonPortal");
    const children = await getChildrenOfPraxis(userId);
    res.json(children.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email })));
  } catch (error) {
    logger.error("Error listing praxis children:", error);
    res.status(500).json({ message: "Failed to list praxis children" });
  }
});
```

- [ ] **Step 3: Smoke test via curl**

Start dev server (`npm run dev`), then with a logged-in admin session cookie:

```bash
# Replace <SESSION>, <HOSPITAL_ID>, <PRAXIS_ID>, <CHILD_ID> with real values
curl -X PATCH http://localhost:5000/api/admin/users/<PRAXIS_ID>/details \
  -H "Cookie: <SESSION>" -H "Content-Type: application/json" \
  -d '{"firstName":"P","lastName":"X","hospitalId":"<HOSPITAL_ID>","isPraxis":true}'

curl -X PUT http://localhost:5000/api/admin/users/<PRAXIS_ID>/praxis-children \
  -H "Cookie: <SESSION>" -H "Content-Type: application/json" \
  -d '{"hospitalId":"<HOSPITAL_ID>","childUserIds":["<CHILD_ID>"]}'

curl http://localhost:5000/api/admin/users/<PRAXIS_ID>/praxis-children \
  -H "Cookie: <SESSION>"
```

Expected: each call returns 200 / `{ success: true }` or the children array.

- [ ] **Step 4: Run typecheck**

```bash
npm run check
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add server/routes/admin.ts
git commit -m "feat(admin): allow toggling is_praxis and managing praxis children via API"
```

---

## Task 5: Surgeon-portal request-submission endpoint

**Files:**
- Modify: `server/routes/surgeonPortal.ts` (add `POST /api/surgeon-portal/:token/requests`)
- Test: `tests/surgeon-praxis-routes.test.ts` (create)

- [ ] **Step 1: Write failing test**

Create `tests/surgeon-praxis-routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server/index";
import { db } from "../server/db";
import { users, externalSurgeryRequests, hospitals, portalAccessSessions } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const createdUserIds: string[] = [];
const createdRequestIds: string[] = [];

let portalToken: string;
let praxisUser: { id: string; email: string };
let childUser: { id: string; email: string };
let soloUser: { id: string; email: string };

async function makeSession(email: string) {
  // Match the existing portal session creation pattern; cookie name and shape come from
  // server/auth or wherever portal sessions are issued. Inspect server/storage/surgeonPortal.ts
  // findPortalSessionWithEmail to align.
  const sessionToken = `test-session-${Date.now()}-${Math.random()}`;
  await db.insert(portalAccessSessions).values({
    sessionToken,
    portalToken,
    portalType: "surgeon",
    surgeonEmail: email,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  } as any);
  return sessionToken;
}

beforeAll(async () => {
  const [hosp] = await db.select().from(hospitals).where(eq(hospitals.id, TEST_HOSPITAL_ID));
  portalToken = (hosp as any).surgeonPortalToken ?? (hosp as any).portalToken;
  if (!portalToken) throw new Error("Test hospital missing surgeonPortalToken");

  const ts = Date.now();
  const [p] = await db.insert(users).values({
    email: `praxis-${ts}@test.local`, firstName: "P", lastName: "X",
    role: "doctor", isPraxis: true,
  }).returning();
  praxisUser = { id: p.id, email: p.email! };
  createdUserIds.push(p.id);

  const [c] = await db.insert(users).values({
    email: `child-${ts}@test.local`, firstName: "C", lastName: "X",
    role: "doctor", parentSurgeonId: p.id,
  }).returning();
  childUser = { id: c.id, email: c.email! };
  createdUserIds.push(c.id);

  const [s] = await db.insert(users).values({
    email: `solo-${ts}@test.local`, firstName: "S", lastName: "X",
    role: "doctor",
  }).returning();
  soloUser = { id: s.id, email: s.email! };
  createdUserIds.push(s.id);
});

afterAll(async () => {
  await db.delete(externalSurgeryRequests).where(inArray(externalSurgeryRequests.id, createdRequestIds));
  await db.update(users).set({ parentSurgeonId: null }).where(inArray(users.id, createdUserIds));
  await db.delete(users).where(inArray(users.id, createdUserIds));
  const { pool } = await import("../server/db");
  await pool.end();
});

const baseBody = {
  surgeryName: "Test surgery",
  surgeryDurationMinutes: 60,
  withAnesthesia: true,
  wishedDate: "2026-06-01",
  isReservationOnly: false,
  patientFirstName: "Pat",
  patientLastName: "Test",
  patientBirthday: "1990-01-01",
  patientEmail: "pat@test.local",
  patientPhone: "+41000000000",
};

describe("POST /api/surgeon-portal/:token/requests", () => {
  it("solo doctor submits with their own surgeonId", async () => {
    const session = await makeSession(soloUser.email);
    const res = await request(app)
      .post(`/api/surgeon-portal/${portalToken}/requests`)
      .set("Cookie", `surgeon_session=${session}`)
      .send({ ...baseBody, surgeonId: soloUser.id });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    createdRequestIds.push(res.body.id);

    const [row] = await db.select().from(externalSurgeryRequests)
      .where(eq(externalSurgeryRequests.id, res.body.id));
    expect(row.surgeonId).toBe(soloUser.id);
    expect(row.surgeonEmail).toBe(soloUser.email);
  });

  it("solo doctor cannot submit for a different surgeonId", async () => {
    const session = await makeSession(soloUser.email);
    const res = await request(app)
      .post(`/api/surgeon-portal/${portalToken}/requests`)
      .set("Cookie", `surgeon_session=${session}`)
      .send({ ...baseBody, surgeonId: childUser.id });
    expect(res.status).toBe(403);
  });

  it("praxis can submit on behalf of a child", async () => {
    const session = await makeSession(praxisUser.email);
    const res = await request(app)
      .post(`/api/surgeon-portal/${portalToken}/requests`)
      .set("Cookie", `surgeon_session=${session}`)
      .send({ ...baseBody, surgeonId: childUser.id });
    expect(res.status).toBe(201);
    createdRequestIds.push(res.body.id);

    const [row] = await db.select().from(externalSurgeryRequests)
      .where(eq(externalSurgeryRequests.id, res.body.id));
    expect(row.surgeonId).toBe(childUser.id);
    expect(row.surgeonEmail).toBe(childUser.email);
  });

  it("praxis can submit for themselves", async () => {
    const session = await makeSession(praxisUser.email);
    const res = await request(app)
      .post(`/api/surgeon-portal/${portalToken}/requests`)
      .set("Cookie", `surgeon_session=${session}`)
      .send({ ...baseBody, surgeonId: praxisUser.id });
    expect(res.status).toBe(201);
    createdRequestIds.push(res.body.id);
  });

  it("praxis cannot submit for an unrelated user", async () => {
    const session = await makeSession(praxisUser.email);
    const res = await request(app)
      .post(`/api/surgeon-portal/${portalToken}/requests`)
      .set("Cookie", `surgeon_session=${session}`)
      .send({ ...baseBody, surgeonId: soloUser.id });
    expect(res.status).toBe(403);
  });

  it("rejects when session is missing", async () => {
    const res = await request(app)
      .post(`/api/surgeon-portal/${portalToken}/requests`)
      .send({ ...baseBody, surgeonId: soloUser.id });
    expect(res.status).toBe(401);
  });
});
```

If `app` is not exported from `server/index`, follow the pattern from another test that uses supertest (e.g. `tests/book-group-route.test.ts`) — that file shows the canonical import path for this codebase. Match it.

If `portalAccessSessions` columns differ from what's used above, inspect the table in `shared/schema.ts` and `findPortalSessionWithEmail` in `server/storage/surgeonPortal.ts:305` — match the real shape. The cookie name comes from `requireSurgeonSession` middleware (`server/routes/surgeonPortal.ts:31`); inspect it to use the exact name.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/surgeon-praxis-routes.test.ts
```

Expected: FAIL with 404 (route does not exist).

- [ ] **Step 3: Implement the endpoint**

Append to `server/routes/surgeonPortal.ts`:

```ts
router.post(
  "/api/surgeon-portal/:token/requests",
  requireSurgeonSession,
  async (req: any, res: Response) => {
    try {
      const sessionEmail: string = req.surgeonSession.surgeonEmail.toLowerCase();
      const portalToken = req.params.token;

      // Resolve hospital from token (same lookup used by the GET routes)
      const [hosp] = await db
        .select()
        .from(hospitals)
        .where(eq(hospitals.surgeonPortalToken, portalToken))
        .limit(1);
      if (!hosp) return res.status(404).json({ message: "Hospital not found" });

      // Resolve session user
      const [sessionUser] = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.email}) = ${sessionEmail}`)
        .limit(1);
      if (!sessionUser) return res.status(401).json({ message: "Session user not found" });

      const { surgeonId, ...rest } = req.body as { surgeonId: string; [k: string]: any };
      if (!surgeonId) return res.status(400).json({ message: "surgeonId is required" });

      // Resolve target surgeon
      const [targetSurgeon] = await db
        .select()
        .from(users)
        .where(eq(users.id, surgeonId))
        .limit(1);
      if (!targetSurgeon) return res.status(400).json({ message: "Target surgeon not found" });

      // Authorization: solo can only submit for self; praxis can submit for self or children
      if (sessionUser.isPraxis) {
        const isSelf = targetSurgeon.id === sessionUser.id;
        const isChild = targetSurgeon.parentSurgeonId === sessionUser.id;
        if (!isSelf && !isChild) {
          return res.status(403).json({ message: "Target surgeon is not yourself or one of your children" });
        }
      } else {
        if (targetSurgeon.id !== sessionUser.id) {
          return res.status(403).json({ message: "You may only submit requests for yourself" });
        }
      }

      // Build the row; populate denormalized surgeon fields from the resolved user
      const requestPayload = {
        hospitalId: hosp.id,
        surgeonId: targetSurgeon.id,
        surgeonFirstName: targetSurgeon.firstName ?? "",
        surgeonLastName: targetSurgeon.lastName ?? "",
        surgeonEmail: targetSurgeon.email ?? "",
        surgeonPhone: targetSurgeon.phone ?? "",
        ...rest,
      };

      // Validate against the existing insert schema (drops disallowed fields)
      const parsed = insertExternalSurgeryRequestSchema.safeParse(requestPayload);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
      }

      const [created] = await db
        .insert(externalSurgeryRequests)
        .values(parsed.data as any)
        .returning();

      res.status(201).json(created);
    } catch (error) {
      logger.error("Error creating surgeon-portal request:", error);
      res.status(500).json({ message: "Failed to create request" });
    }
  },
);
```

Add the necessary imports at the top of the file:

```ts
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { hospitals, users, externalSurgeryRequests, insertExternalSurgeryRequestSchema } from "@shared/schema";
```

(Some may already be imported via the storage layer; only add the missing ones.)

The middleware `requireSurgeonSession` already attaches the verified session info to the request. Inspect `server/routes/surgeonPortal.ts:31-50` to confirm the property name (it uses `req.surgeonSession` per the existing pattern; if it differs, match the real one).

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/surgeon-praxis-routes.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/routes/surgeonPortal.ts tests/surgeon-praxis-routes.test.ts
git commit -m "feat(surgeon-portal): in-portal request endpoint with praxis surgeon resolution"
```

---

## Task 6: Public form returns 410 Gone

**Files:**
- Modify: `server/routes/externalSurgery.ts:185` (or wherever `POST /public/external-surgery/:token` is defined)

The public form is being killed. The submission endpoint returns 410 Gone with a pointer to the surgeon portal.

- [ ] **Step 1: Locate the public POST handler**

```bash
grep -n 'public/external-surgery' /home/mau/viali/server/routes/externalSurgery.ts
```

Expected: a single POST at the public path. Read the surrounding 30 lines to understand its dependencies.

- [ ] **Step 2: Replace the handler body**

Replace the entire route handler body with a 410 response. Keep the route path so it still matches incoming requests.

```ts
router.post("/public/external-surgery/:token", async (_req: Request, res: Response) => {
  return res.status(410).json({
    message: "This endpoint has been removed. Please log in to the surgeon portal to submit a request.",
    surgeonPortalPath: "/surgeon-portal/:token",
  });
});
```

If there are any GET routes under `/public/external-surgery/` that the legacy form relied on (e.g. fetching the hospital name for display), leave them functioning — the redirect-page client (Task 9) may need them. Check the file for sibling routes; only the POST submission becomes 410.

- [ ] **Step 3: Verify the change**

```bash
npm run check
```

Expected: passes.

Manual smoke (dev server running):

```bash
curl -X POST http://localhost:5000/public/external-surgery/<TOKEN> \
  -H "Content-Type: application/json" -d '{}' -o /dev/null -w "%{http_code}\n"
```

Expected: `410`.

- [ ] **Step 4: Commit**

```bash
git add server/routes/externalSurgery.ts
git commit -m "feat(external-surgery): retire public POST endpoint (410 Gone)"
```

---

## Task 7: Admin UI — praxis flag + children multi-select

**Files:**
- Modify: `client/src/pages/admin/Users.tsx` (find the user-edit dialog, add the new fields)

The page is large (~2400 lines). Locate the user-edit dialog by searching for the existing `firstName`/`lastName` inputs paired with the `PATCH /api/admin/users/:userId/details` mutation.

- [ ] **Step 1: Locate the edit dialog**

```bash
grep -n "patch.*users.*details\|users/.*details" /home/mau/viali/client/src/pages/admin/Users.tsx
grep -n "isPraxis\|firstName\|lastName" /home/mau/viali/client/src/pages/admin/Users.tsx | head -20
```

Identify the dialog component and the mutation that posts to `/api/admin/users/:userId/details`.

- [ ] **Step 2: Add the praxis checkbox + state**

Inside the edit dialog component, add state for `isPraxis` mirroring the pattern used by other booleans on the same form (e.g. checkboxes for permissions). Add a Checkbox (shadcn `Checkbox`) labeled **"Is a praxis (multi-doctor practice)"**:

```tsx
const [isPraxis, setIsPraxis] = useState<boolean>(user?.isPraxis ?? false);

// In JSX, alongside other user fields:
<div className="flex items-center gap-2">
  <Checkbox
    id="is-praxis"
    checked={isPraxis}
    onCheckedChange={(checked) => setIsPraxis(!!checked)}
  />
  <Label htmlFor="is-praxis">Is a praxis (multi-doctor practice)</Label>
</div>
```

Include `isPraxis` in the body of the existing details PATCH mutation:

```ts
body: JSON.stringify({ firstName, lastName, /*...*/, isPraxis }),
```

If the API returns 409 ("still has linked children"), surface the message via toast (use the existing `useToast` import — the page already uses it).

- [ ] **Step 3: Add the children multi-select**

When `isPraxis` is checked AND the user has been saved (so `user.id` exists), render a multi-select picker. The picker lists hospital users where `isPraxis === false` and `parentSurgeonId` is either null or already this user's id. The page already has a `users` query — reuse it.

```tsx
{isPraxis && user?.id && (
  <div className="space-y-2">
    <Label>Associated doctors (children)</Label>
    <PraxisChildrenSelect
      praxisUserId={user.id}
      hospitalId={selectedHospitalId}
    />
  </div>
)}
```

Define `PraxisChildrenSelect` either inline in this file (consistent with the file's existing style — it's already large and self-contained) or as a sibling component file `client/src/components/admin/PraxisChildrenSelect.tsx`. Pick whichever matches the page's existing patterns.

The component:
1. Fetches `GET /api/admin/users/:userId/praxis-children` for current children → seeds local selection state.
2. Fetches the hospital's user list (already available via the page's existing query) → filters to `isPraxis=false` and (`parentSurgeonId === null` OR `parentSurgeonId === praxisUserId`).
3. Renders shadcn `Command` + `Popover` (the canonical multi-select pattern in this repo — search the codebase for `CommandList` to find an example: `grep -rln "CommandList" client/src/`).
4. On change, debounces and calls `PUT /api/admin/users/:userId/praxis-children` with the new array.

```tsx
function PraxisChildrenSelect({ praxisUserId, hospitalId }: { praxisUserId: string; hospitalId: string }) {
  const queryClient = useQueryClient();
  const { data: candidates = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users/hospital", hospitalId],
    enabled: !!hospitalId,
  });
  const { data: currentChildren = [] } = useQuery<User[]>({
    queryKey: [`/api/admin/users/${praxisUserId}/praxis-children`],
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set(currentChildren.map((c) => c.id)));
  }, [currentChildren]);

  const eligible = useMemo(
    () =>
      candidates.filter(
        (u) =>
          u.id !== praxisUserId &&
          !u.isPraxis &&
          (!u.parentSurgeonId || u.parentSurgeonId === praxisUserId),
      ),
    [candidates, praxisUserId],
  );

  const save = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(`/api/admin/users/${praxisUserId}/praxis-children`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospitalId, childUserIds: ids }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${praxisUserId}/praxis-children`] });
    },
  });

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
    save.mutate(Array.from(next));
  };

  // Render an inline list with checkboxes (simplest, follows the repo's convention for this kind of UI).
  return (
    <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
      {eligible.length === 0 && (
        <div className="text-sm text-muted-foreground">No eligible doctors in this hospital.</div>
      )}
      {eligible.map((u) => (
        <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={selectedIds.has(u.id)}
            onCheckedChange={() => toggle(u.id)}
          />
          <span>{u.lastName}, {u.firstName} <span className="text-muted-foreground">({u.email})</span></span>
        </label>
      ))}
    </div>
  );
}
```

Adjust the `useQuery` `queryKey` for `candidates` to match the actual key the page already uses for "all hospital users" — search the file for `useQuery` hooks fetching users.

- [ ] **Step 4: Display "Praxis: …" badge on child user**

In the same edit dialog, when `user.parentSurgeonId` is set, show a read-only badge using the page's existing badge primitive:

```tsx
{user?.parentSurgeonId && (
  <Badge variant="secondary">Praxis: {parentName}</Badge>
)}
```

Resolve `parentName` from the hospital users list (same query above) by id.

- [ ] **Step 5: Manual smoke**

Start `npm run dev`, log in as admin, open Users → edit any doctor. Toggle "Is a praxis", save, reopen → checkbox sticks. Pick two children → reopen → still selected. Try toggling off while children are linked → toast surfaces 409 message. Unlink children → toggle off → succeeds.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/admin/Users.tsx
git commit -m "feat(admin): add praxis flag and children multi-select to user edit dialog"
```

---

## Task 8: Surgeon-portal request form

**Files:**
- Modify: `client/src/pages/SurgeonPortal.tsx`

The page already has the calendar + action-request dialogs. Add a new tab or button "Submit new surgery request" that opens a form. The form mirrors the fields previously on `ExternalSurgeryRequest.tsx` minus the surgeon-detail block.

- [ ] **Step 1: Reuse the existing form fields**

`client/src/pages/ExternalSurgeryRequest.tsx` defines the field schema and form layout. Either:

- (a) Extract the form fields into a shared component `client/src/components/surgery/SurgeryRequestForm.tsx` (preferred — DRY), then import it into both the existing public page and the new portal section. The shared component takes a callback `onSubmit(values: FormValues)` and lets the parent handle the network call.
- (b) Copy the field layout into `SurgeonPortal.tsx`. Avoid this — duplication.

Option (a). Move every field except `surgeonFirstName / surgeonLastName / surgeonEmail / surgeonPhone` into the shared component. Keep all patient + surgery + reservation fields.

Add a `surgeonId` prop and (for praxes only) a "Operating surgeon" picker at the top of the form rendered when the parent passes `availableSurgeons` of length > 1.

```tsx
type AvailableSurgeon = { id: string; firstName: string; lastName: string };
type Props = {
  availableSurgeons: AvailableSurgeon[]; // length 1 → solo; length 2+ → praxis with self+children
  selectedSurgeonId: string;
  onSelectedSurgeonIdChange: (id: string) => void;
  onSubmit: (values: FormValues, selectedSurgeonId: string) => void;
};
```

If `availableSurgeons.length > 1`, render a `Select` at the top:

```tsx
{availableSurgeons.length > 1 && (
  <div className="space-y-2">
    <Label>Operating surgeon</Label>
    <Select value={selectedSurgeonId} onValueChange={onSelectedSurgeonIdChange}>
      <SelectTrigger><SelectValue placeholder="Select surgeon" /></SelectTrigger>
      <SelectContent>
        {availableSurgeons.map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.lastName}, {s.firstName}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

- [ ] **Step 2: Wire up the surgeon-portal section**

In `SurgeonPortal.tsx`, add a new section / tab "New surgery request". Use the existing tab pattern in the file (search for the existing tabs to see what shadcn primitive is in use — likely `Tabs / TabsList / TabsContent`).

```tsx
const { data: me } = useQuery<{ id: string; isPraxis: boolean; firstName: string; lastName: string }>({
  queryKey: [`/api/surgeon-portal/${token}/me`],
});
const { data: children = [] } = useQuery<AvailableSurgeon[]>({
  queryKey: [`/api/surgeon-portal/${token}/children`],
  enabled: !!me?.isPraxis,
});

const availableSurgeons: AvailableSurgeon[] = me
  ? [{ id: me.id, firstName: me.firstName, lastName: me.lastName }, ...children]
  : [];

const [selectedSurgeonId, setSelectedSurgeonId] = useState("");
useEffect(() => {
  if (availableSurgeons.length > 0 && !selectedSurgeonId) {
    setSelectedSurgeonId(availableSurgeons[0].id);
  }
}, [availableSurgeons]);

const submitRequest = useMutation({
  mutationFn: async ({ values, surgeonId }: { values: FormValues; surgeonId: string }) => {
    const res = await fetch(`/api/surgeon-portal/${token}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...values, surgeonId }),
    });
    if (!res.ok) throw new Error((await res.json()).message ?? "Failed to submit request");
    return res.json();
  },
  onSuccess: () => {
    toast({ title: "Request submitted" });
    queryClient.invalidateQueries({ queryKey: [`/api/surgeon-portal/${token}/surgeries`] });
  },
});

<SurgeryRequestForm
  availableSurgeons={availableSurgeons}
  selectedSurgeonId={selectedSurgeonId}
  onSelectedSurgeonIdChange={setSelectedSurgeonId}
  onSubmit={(values, surgeonId) => submitRequest.mutate({ values, surgeonId })}
/>
```

- [ ] **Step 3: Add the missing GET endpoints (`/me` and `/children`)**

In `server/routes/surgeonPortal.ts`, add two GET helpers needed by the form:

```ts
router.get(
  "/api/surgeon-portal/:token/me",
  requireSurgeonSession,
  async (req: any, res: Response) => {
    const email = req.surgeonSession.surgeonEmail.toLowerCase();
    const [u] = await db.select().from(users)
      .where(sql`LOWER(${users.email}) = ${email}`).limit(1);
    if (!u) return res.status(404).json({ message: "Not found" });
    res.json({ id: u.id, firstName: u.firstName, lastName: u.lastName, isPraxis: u.isPraxis });
  },
);

router.get(
  "/api/surgeon-portal/:token/children",
  requireSurgeonSession,
  async (req: any, res: Response) => {
    const email = req.surgeonSession.surgeonEmail.toLowerCase();
    const [u] = await db.select().from(users)
      .where(sql`LOWER(${users.email}) = ${email}`).limit(1);
    if (!u) return res.status(404).json({ message: "Not found" });
    if (!u.isPraxis) return res.json([]);
    const { getChildrenOfPraxis } = await import("../storage/surgeonPortal");
    const children = await getChildrenOfPraxis(u.id);
    res.json(children.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName })));
  },
);
```

- [ ] **Step 4: Manual smoke test**

`npm run dev`. From the OTP gate, log in as a praxis (configured via Task 7). The new tab/button shows the form with the surgeon picker. Submit → toast → request appears in admin panel. Log in as a solo doctor → no picker visible, submit works. Log in as a child user → no picker, request goes against themselves.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/surgery/SurgeryRequestForm.tsx client/src/pages/SurgeonPortal.tsx server/routes/surgeonPortal.ts
git commit -m "feat(surgeon-portal): in-portal surgery request form with praxis surgeon picker"
```

---

## Task 9: Public form redirect + portal landing copy

**Files:**
- Modify: `client/src/pages/ExternalSurgeryRequest.tsx` (full body replacement)
- Modify: `client/src/pages/SurgeonPortal.tsx:55-56` (DE subtitle) and `:107-108` (EN subtitle)

Two coordinated copy changes that frame the new flow for users:
1. Old `/external-surgery/:token` page redirects to `/surgeon-portal/:token` (same per-hospital token).
2. The portal OTP gate's subtitle is updated to make clear it's for **both** submitting new requests **and** reviewing existing surgeries — not just viewing.

The current subtitle is "Geben Sie Ihre E-Mail-Adresse ein, um Ihre OPs einzusehen." (DE) / "Enter your email address to view your surgeries." (EN). It mentions only viewing.

- [ ] **Step 1: Update the OTP gate subtitle**

In `client/src/pages/SurgeonPortal.tsx`, update both translation blocks (the gate copy is keyed under `subtitle`).

DE block (around line 56):

```ts
subtitle: "Geben Sie Ihre E-Mail-Adresse ein, um neue Anfragen einzureichen und Ihre OPs zu verwalten.",
```

EN block (around line 108):

```ts
subtitle: "Enter your email address to submit new surgery requests and manage your scheduled surgeries.",
```

Tone: formal/clinical/descriptive — matches the project's UI copy convention. No casual second-person framing.

- [ ] **Step 2: Replace the public form page body**

```tsx
import { useEffect } from "react";
import { useParams, useLocation } from "wouter";

export default function ExternalSurgeryRequest() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (token) navigate(`/surgeon-portal/${token}`, { replace: true });
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-8 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-semibold">Surgery requests are now submitted via the surgeon portal.</h1>
        <p className="text-muted-foreground">
          Redirecting you to the portal sign-in. If nothing happens,
          please follow the link sent to your email.
        </p>
      </div>
    </div>
  );
}
```

If the page used a different routing import (e.g. `react-router-dom`), match the existing import. Check the top of the original file before replacing.

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

Expected: passes.

- [ ] **Step 4: Manual smoke test**

`npm run dev`. Two checks:

1. Visit `/external-surgery/<token>` → auto-redirects to `/surgeon-portal/<token>` OTP gate.
2. Land on the OTP gate → subtitle reads about submitting new requests AND managing existing surgeries (not just viewing).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/ExternalSurgeryRequest.tsx client/src/pages/SurgeonPortal.tsx
git commit -m "feat(surgeon-portal): redirect public form and clarify portal landing copy"
```

---

## Task 10: Final integration smoke + post-task verification

- [ ] **Step 1: Lint + typecheck**

```bash
npm run check
```

Expected: clean.

- [ ] **Step 2: Full test run**

```bash
npx vitest run tests/surgeon-praxis-storage.test.ts tests/surgeon-praxis-routes.test.ts
```

Expected: all green.

- [ ] **Step 3: Manual end-to-end smoke**

`npm run dev`. Walk the full flow:

1. Admin → Users → mark User P as praxis, link Users C1 and C2 as children.
2. Log out. Visit `/external-surgery/<token>` — auto-redirects to `/surgeon-portal/<token>`.
3. OTP in as User P → see "New surgery request" tab → submit a request for C1 → success toast.
4. Verify in admin "External surgery requests" panel — surgeon shows as C1, not P.
5. P's surgeon-portal calendar shows surgeries belonging to P, C1, and C2 (after admin schedules them).
6. C1 OTPs in directly → sees only their own surgeries (no roll-up of P's or C2's).
7. POST `/public/external-surgery/<token>` returns 410.

- [ ] **Step 4: Verify migration idempotency**

Per project convention: re-running migration `0248_surgeon_praxis.sql` against an already-migrated DB must succeed. Confirm by reading the SQL — every statement uses `IF NOT EXISTS` or `DO $$ BEGIN ... pg_constraint check ... END $$`.

```bash
grep -nE "IF NOT EXISTS|pg_constraint" migrations/0248_surgeon_praxis.sql
```

Expected: every `ALTER`, `CREATE INDEX`, and constraint add is guarded.

- [ ] **Step 5: Final commit (if any cleanup)**

If anything was left dirty:

```bash
git status
git add -A
git commit -m "chore(surgeon-portal): cleanup after smoke test"
```

Otherwise skip.

---

## Self-review notes

- **Spec coverage:**
  - Schema: Task 1 ✓
  - Auth unchanged: implicit (no auth-layer tasks) ✓
  - New endpoint with surgeon resolution: Task 5 ✓
  - Public form 410 + redirect: Tasks 6 + 9 ✓
  - Praxis dashboard roll-up: Task 3 ✓
  - Storage helpers: Task 2 ✓
  - Admin UI: Task 7 ✓
  - Surgeon portal UI: Task 8 ✓
  - No new roles, no backfill, hard-delete only: respected throughout ✓
  - Per-hospital scope: enforced in admin endpoint via hospital-membership check ✓

- **Type/name consistency:** `isPraxis`, `parentSurgeonId`, `surgeonId`, `getChildrenOfPraxis`, `setPraxisChildren`, `togglePraxis` — used identically across all tasks. Endpoint paths `/api/admin/users/:userId/praxis-children` and `/api/surgeon-portal/:token/{me,children,requests}` consistent.

- **Known soft spots:**
  - Task 5 references `req.surgeonSession` — actual property name on request comes from `requireSurgeonSession` middleware. Task instructions tell the implementer to inspect that middleware first. Not a placeholder, but a verification dependency.
  - Task 7 needs the implementer to identify the canonical hospital-users query key — the call-out is explicit, not vague.
  - Task 5 supertest setup depends on `app` being importable from `server/index`; the task points the implementer at a sibling test for the canonical pattern.

These are deliberate "verify-before-applying" hooks rather than placeholders — every code block is concrete and executable, but the implementer is told where to confirm one or two repo-specific conventions.
