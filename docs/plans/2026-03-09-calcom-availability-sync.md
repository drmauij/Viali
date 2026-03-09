# Cal.com Availability Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically push provider availability schedules from Viali to Cal.com when saved, eliminating manual duplication.

**Architecture:** One-way sync (Viali → Cal.com) triggered after availability saves. Uses Cal.com v2 org-level schedules API (`/v2/organizations/{orgId}/users/{userId}/schedules`). Org ID is auto-detected from `/v2/me` and cached in `calcom_config`. Schedule IDs are stored per-provider in `calcom_provider_mappings.calcomScheduleId`.

**Tech Stack:** Drizzle ORM, Cal.com v2 API, PostgreSQL

---

### Task 1: Schema — Add orgId to calcom_config

**Files:**
- Modify: `shared/schema.ts:4441-4442`
- Create: migration SQL (via `npm run db:generate`)

**Step 1: Add orgId field to calcom_config schema**

In `shared/schema.ts`, inside the `calcomConfig` table definition, after the `apiKey` line (line 4442), add:

```typescript
  orgId: varchar("org_id"), // Cal.com organization ID (auto-detected from /me endpoint)
```

**Step 2: Add syncAvailability toggle**

In `shared/schema.ts`, after `syncTimebutlerAbsences` (line 4457), add:

```typescript
  syncAvailability: boolean("sync_availability").default(true), // Push availability schedules
```

**Step 3: Generate migration**

Run: `npm run db:generate`

**Step 4: Make migration idempotent**

Edit the generated SQL file. Replace column adds with:

```sql
ALTER TABLE "calcom_config" ADD COLUMN IF NOT EXISTS "org_id" varchar;
ALTER TABLE "calcom_config" ADD COLUMN IF NOT EXISTS "sync_availability" boolean DEFAULT true;
```

**Step 5: Run migration**

Run: `npm run db:migrate`

**Step 6: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat: add orgId and syncAvailability to calcom_config schema"
```

---

### Task 2: CalcomClient — Add org-level schedule methods

**Files:**
- Modify: `server/services/calcomClient.ts`

**Step 1: Add schedule interfaces**

After the `CreateBusyBlockRequest` interface (~line 92), add:

```typescript
export interface CalcomScheduleAvailability {
  days: string[]; // "Monday", "Tuesday", etc.
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface CalcomScheduleOverride {
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface CreateScheduleRequest {
  name: string;
  timeZone: string;
  isDefault: boolean;
  availability?: CalcomScheduleAvailability[];
  overrides?: CalcomScheduleOverride[];
}

export interface UpdateScheduleRequest {
  name?: string;
  timeZone?: string;
  availability?: CalcomScheduleAvailability[];
  overrides?: CalcomScheduleOverride[];
  isDefault?: boolean;
}

export interface CalcomSchedule {
  id: number;
  ownerId: number;
  name: string;
  timeZone: string;
  availability: CalcomScheduleAvailability[];
  isDefault: boolean;
  overrides: CalcomScheduleOverride[];
}
```

**Step 2: Update getMe return type**

Modify the `getMe` method (~line 137) to include organizationId:

```typescript
  async getMe(): Promise<{ id: number; username: string; email: string; name?: string; organizationId?: number }> {
    return this.request('/me');
  }
```

**Step 3: Add org-level schedule methods to CalcomClient class**

Add these methods at the end of the CalcomClient class, before the closing `}`:

```typescript
  /**
   * Get all schedules for a user within an organization
   */
  async getOrgUserSchedules(orgId: number, userId: number): Promise<CalcomSchedule[]> {
    return this.request<CalcomSchedule[]>(
      `/organizations/${orgId}/users/${userId}/schedules`
    );
  }

  /**
   * Create a schedule for a user within an organization
   */
  async createOrgUserSchedule(
    orgId: number,
    userId: number,
    schedule: CreateScheduleRequest
  ): Promise<CalcomSchedule> {
    return this.request<CalcomSchedule>(
      `/organizations/${orgId}/users/${userId}/schedules`,
      {
        method: 'POST',
        body: JSON.stringify(schedule),
      }
    );
  }

  /**
   * Update a schedule for a user within an organization
   */
  async updateOrgUserSchedule(
    orgId: number,
    userId: number,
    scheduleId: number,
    schedule: UpdateScheduleRequest
  ): Promise<CalcomSchedule> {
    return this.request<CalcomSchedule>(
      `/organizations/${orgId}/users/${userId}/schedules/${scheduleId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(schedule),
      }
    );
  }
```

**Step 4: Commit**

```bash
git add server/services/calcomClient.ts
git commit -m "feat: add org-level schedule methods to CalcomClient"
```

---

### Task 3: Availability sync function

**Files:**
- Modify: `server/services/calcomSync.ts`

**Step 1: Add imports**

At the top of `calcomSync.ts`, add to the existing schema imports:

```typescript
import {
  // ... existing imports ...
  providerAvailability,
  providerAvailabilityWindows,
} from "@shared/schema";
```

Also import the schedule types:

```typescript
import { createCalcomClient, type CalcomClient, type CalcomBooking, type CalcomScheduleAvailability, type CalcomScheduleOverride } from "./calcomClient";
```

**Step 2: Add day-of-week mapping helper**

After the `getProviderMappings` function (~line 75), add:

```typescript
const DAY_NAMES: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};
```

**Step 3: Add the syncAvailabilityToCalcom function**

After the `DAY_NAMES` constant, add:

```typescript
export async function syncAvailabilityToCalcom(
  hospitalId: string,
  providerId: string
): Promise<{ success: boolean; scheduleId?: number; error?: string }> {
  try {
    const calcomSetup = await getCalcomClientForHospital(hospitalId);
    if (!calcomSetup) {
      return { success: false, error: 'Cal.com not configured or enabled' };
    }

    // Check if availability sync is enabled
    const { client, config, timezone: hospitalTz } = calcomSetup;
    if (!(config as any).syncAvailability) {
      return { success: false, error: 'Availability sync disabled' };
    }

    // Get org ID (auto-detect if missing)
    let orgId = (config as any).orgId ? parseInt((config as any).orgId, 10) : null;
    if (!orgId) {
      const me = await client.getMe();
      if (!me.organizationId) {
        return { success: false, error: 'No organization found for Cal.com account' };
      }
      orgId = me.organizationId;
      // Cache orgId for future use
      await db
        .update(calcomConfig)
        .set({ orgId: String(orgId) } as any)
        .where(eq(calcomConfig.hospitalId, hospitalId));
    }

    // Get provider mapping
    const [mapping] = await db
      .select()
      .from(calcomProviderMappings)
      .where(
        and(
          eq(calcomProviderMappings.hospitalId, hospitalId),
          eq(calcomProviderMappings.providerId, providerId),
          eq(calcomProviderMappings.isEnabled, true)
        )
      );

    if (!mapping) {
      return { success: false, error: 'No Cal.com mapping for provider' };
    }

    const calcomUserId = mapping.calcomUserId ? parseInt(mapping.calcomUserId, 10) : null;
    if (!calcomUserId) {
      return { success: false, error: 'No Cal.com user ID configured for provider' };
    }

    // Read provider availability from DB
    const availRows = await db
      .select()
      .from(providerAvailability)
      .where(
        and(
          eq(providerAvailability.providerId, providerId),
          eq(providerAvailability.isActive, true)
        )
      );

    // Group time slots by startTime+endTime for compact Cal.com format
    // e.g. Mon-Fri 08:00-18:00 becomes one entry with days: ["Monday"..."Friday"]
    const slotGroups = new Map<string, string[]>();
    for (const row of availRows) {
      const key = `${row.startTime}-${row.endTime}`;
      const dayName = DAY_NAMES[row.dayOfWeek];
      if (!dayName) continue;
      if (!slotGroups.has(key)) {
        slotGroups.set(key, []);
      }
      slotGroups.get(key)!.push(dayName);
    }

    const availability: CalcomScheduleAvailability[] = [];
    for (const [key, days] of slotGroups) {
      const [startTime, endTime] = key.split('-');
      availability.push({ days, startTime, endTime });
    }

    // Read date-specific windows as overrides (next 3 months)
    const now = new Date();
    const threeMonthsLater = new Date();
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    const windowRows = await db
      .select()
      .from(providerAvailabilityWindows)
      .where(
        and(
          eq(providerAvailabilityWindows.providerId, providerId),
          gte(providerAvailabilityWindows.date, now.toISOString().split('T')[0]),
          lte(providerAvailabilityWindows.date, threeMonthsLater.toISOString().split('T')[0])
        )
      );

    const overrides: CalcomScheduleOverride[] = windowRows.map((w) => ({
      date: typeof w.date === 'string' ? w.date : new Date(w.date).toISOString().split('T')[0],
      startTime: w.startTime,
      endTime: w.endTime,
    }));

    // Create or update schedule in Cal.com
    const existingScheduleId = mapping.calcomScheduleId
      ? parseInt(mapping.calcomScheduleId, 10)
      : null;

    let scheduleId: number;

    if (existingScheduleId) {
      // Update existing schedule
      const updated = await client.updateOrgUserSchedule(
        orgId,
        calcomUserId,
        existingScheduleId,
        {
          availability,
          overrides,
          timeZone: hospitalTz,
        }
      );
      scheduleId = updated.id;
    } else {
      // Create new schedule
      // Get provider name for schedule label
      const [provider] = await db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, providerId));
      const providerName = provider
        ? `${provider.firstName || ''} ${provider.lastName || ''}`.trim()
        : 'Provider';

      const created = await client.createOrgUserSchedule(orgId, calcomUserId, {
        name: `Viali - ${providerName}`,
        timeZone: hospitalTz,
        isDefault: false,
        availability,
        overrides,
      });
      scheduleId = created.id;

      // Store schedule ID in mapping
      await db
        .update(calcomProviderMappings)
        .set({ calcomScheduleId: String(scheduleId) })
        .where(eq(calcomProviderMappings.id, mapping.id));
    }

    // Update sync timestamp
    await db
      .update(calcomProviderMappings)
      .set({ lastSyncAt: new Date(), lastSyncError: null })
      .where(eq(calcomProviderMappings.id, mapping.id));

    logger.info(`Synced availability to Cal.com for provider ${providerId}, scheduleId=${scheduleId}`);
    return { success: true, scheduleId };
  } catch (error: any) {
    logger.error(`Failed to sync availability to Cal.com for provider ${providerId}:`, error);

    // Store error on mapping if possible
    try {
      await db
        .update(calcomProviderMappings)
        .set({ lastSyncError: error.message })
        .where(
          and(
            eq(calcomProviderMappings.hospitalId, hospitalId),
            eq(calcomProviderMappings.providerId, providerId)
          )
        );
    } catch (_) {
      // ignore
    }

    return { success: false, error: error.message };
  }
}
```

**Step 4: Export from calcomSyncService**

Add `syncAvailabilityToCalcom` to the `calcomSyncService` object (~line 605):

```typescript
export const calcomSyncService: CalcomSyncService & { syncAvailabilityToCalcom: typeof syncAvailabilityToCalcom } = {
  syncAppointmentsToCalcom,
  syncSurgeriesToCalcom,
  syncSingleAppointment,
  syncSingleSurgery,
  deleteCalcomBlock,
  fullSync,
  syncAvailabilityToCalcom,
};
```

**Step 5: Commit**

```bash
git add server/services/calcomSync.ts
git commit -m "feat: add syncAvailabilityToCalcom function"
```

---

### Task 4: Wire up sync triggers in routes

**Files:**
- Modify: `server/routes/clinic.ts`

**Step 1: Add fire-and-forget helper at top of file**

Near the top of `clinic.ts`, after existing imports, add:

```typescript
import { syncAvailabilityToCalcom } from "../services/calcomSync";
```

Add a helper to fire sync without blocking the response:

```typescript
function fireAvailabilitySync(hospitalId: string, providerId: string) {
  syncAvailabilityToCalcom(hospitalId, providerId).catch((err) => {
    logger.error("Background availability sync failed:", err);
  });
}
```

**Step 2: Hook into PUT availability route (line ~1748)**

After `res.json(result);` on line ~1767, before the `catch`, add:

```typescript
    // Fire-and-forget: sync to Cal.com
    fireAvailabilitySync(hospitalId, providerId);
```

**Step 3: Hook into POST availability-windows route (line ~2031)**

After `res.status(201).json(window);` on line ~2057, before the `catch`, add:

```typescript
    // Fire-and-forget: sync to Cal.com
    const windowData = await storage.getProviderAvailabilityWindow(window.id);
    if (windowData?.providerId) {
      fireAvailabilitySync(hospitalId, windowData.providerId);
    }
```

Wait — the window is created with the providerId from params. Simpler:

```typescript
    // Fire-and-forget: sync to Cal.com
    fireAvailabilitySync(hospitalId, providerId);
```

**Step 4: Hook into PUT availability-windows route (line ~2065)**

This route doesn't have providerId in the URL. We need to look up the window to get it. After `res.json(updated);` (line ~2078), add:

```typescript
    // Fire-and-forget: sync to Cal.com
    if (updated?.providerId) {
      fireAvailabilitySync(hospitalId, updated.providerId);
    }
```

**Step 5: Hook into DELETE availability-windows route (line ~2085)**

Before the delete call, read the window to get providerId. Modify the handler:

```typescript
    // Read window before deleting to get providerId for sync
    const windowToDelete = await storage.getProviderAvailabilityWindow(windowId);

    await storage.deleteProviderAvailabilityWindow(windowId);

    // Fire-and-forget: sync to Cal.com
    if (windowToDelete?.providerId) {
      fireAvailabilitySync(hospitalId, windowToDelete.providerId);
    }

    res.status(204).send();
```

**Step 6: Auto-detect orgId in calcom-test route**

In the `/calcom-test` route (line ~3678), after `const me = await calcom.getMe();`, add:

```typescript
    // Auto-detect and cache org ID
    if (me.organizationId) {
      try {
        const { calcomConfig: calcomConfigTable } = await import("@shared/schema");
        await db
          .update(calcomConfigTable)
          .set({ orgId: String(me.organizationId) } as any)
          .where(eq(calcomConfigTable.hospitalId, hospitalId));
      } catch (e) {
        logger.warn("Could not cache Cal.com org ID:", (e as Error).message);
      }
    }
```

**Step 7: Commit**

```bash
git add server/routes/clinic.ts
git commit -m "feat: trigger availability sync on save to Cal.com"
```

---

### Task 5: Storage helper — getProviderAvailabilityWindow

**Files:**
- Modify: `server/storage/clinic.ts`

Check if `getProviderAvailabilityWindow(windowId)` already exists. If not, add it:

**Step 1: Add single-window getter**

```typescript
export async function getProviderAvailabilityWindow(windowId: string) {
  const [window] = await db
    .select()
    .from(providerAvailabilityWindows)
    .where(eq(providerAvailabilityWindows.id, windowId));
  return window || null;
}
```

**Step 2: Commit**

```bash
git add server/storage/clinic.ts
git commit -m "feat: add getProviderAvailabilityWindow storage helper"
```

---

### Task 6: TypeScript check + verify

**Step 1: Run TypeScript check**

Run: `npm run check`
Expected: No errors

**Step 2: Fix any type issues**

The `calcomConfig` type won't include `orgId` and `syncAvailability` until Drizzle regenerates. Since we added them to the schema, `npm run check` should pick them up. If there are cast issues with `(config as any).orgId`, consider removing the cast after confirming the type includes the field.

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve type issues for availability sync"
```

---

### Task 7: Manual test checklist

These are manual verification steps (no automated tests for external API integration):

1. **Test connection auto-detects orgId:** Go to Cal.com config → Test Connection. Check that `calcom_config.org_id` gets populated.
2. **Save availability triggers sync:** Edit a provider's weekly schedule in Manage Availability → Save. Check server logs for `Synced availability to Cal.com` message. Verify the schedule appears in Cal.com under the provider.
3. **Windows sync as overrides:** Add a date-specific availability window. Verify it shows as an override in Cal.com.
4. **Schedule reuse:** Save availability again — verify it updates the existing schedule (PATCH) rather than creating a new one. Check `calcom_provider_mappings.calcom_schedule_id` is populated.
5. **Error resilience:** Disable Cal.com config, save availability — verify no error shown to user (fire-and-forget).
