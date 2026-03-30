# Permission Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add granular permission flags (`canConfigure`, `canChat`, `canPlanOps`) to `userHospitalRoles` so non-admin users can be granted specific capabilities without full admin access.

**Architecture:** Three boolean columns added to `user_hospital_roles` table. Admin role implicitly has all permissions. Backend middleware `requirePermission('canConfigure')` checks `role === 'admin' || flag === true`. Frontend exposes flags via the existing `useActiveHospital` hook. User management UI gets checkboxes to toggle flags per user-unit assignment.

**Tech Stack:** PostgreSQL, Drizzle ORM, Express middleware, React (shadcn/ui), TanStack Query

---

### Task 1: Schema & Migration

**Files:**
- Modify: `shared/schema.ts:159-183` (userHospitalRoles table)
- Create: `migrations/XXXX_permission_flags.sql` (via `npm run db:generate`)

- [ ] **Step 1: Add permission flag columns to schema**

In `shared/schema.ts`, add three boolean columns to `userHospitalRoles`:

```typescript
canConfigure: boolean("can_configure").default(false),
canChat: boolean("can_chat").default(false),
canPlanOps: boolean("can_plan_ops").default(false),
```

Add after the `bookingLocation` field (line ~175), before `calcomUserId`.

- [ ] **Step 2: Generate migration**

Run: `npm run db:generate`

- [ ] **Step 3: Make migration idempotent**

Open the generated migration file. Replace statements with idempotent versions:

```sql
ALTER TABLE "user_hospital_roles" ADD COLUMN IF NOT EXISTS "can_configure" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_hospital_roles" ADD COLUMN IF NOT EXISTS "can_chat" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_hospital_roles" ADD COLUMN IF NOT EXISTS "can_plan_ops" boolean DEFAULT false;
```

- [ ] **Step 4: Verify journal timestamp**

Check `migrations/meta/_journal.json` — the new entry's `when` must be higher than ALL previous entries (including migration 133 which has `when: 1771900000000`).

- [ ] **Step 5: Push migration**

Run: `npm run db:migrate`
Expected: "Changes applied" with no pending diffs.

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat: add permission flag columns (canConfigure, canChat, canPlanOps)"
```

---

### Task 2: Backend — Expose Flags in User Data

**Files:**
- Modify: `server/storage/hospitals.ts:16-38` (getUserHospitals return type + query)
- Modify: `server/storage.ts` (IStorage interface — getUserHospitals return type must match)

- [ ] **Step 1: Update getUserHospitals return type and mapping in storage/hospitals.ts**

In `server/storage/hospitals.ts`, add the three flags to:
1. The return type annotation (line 16)
2. The `result.map()` callback (lines 24-37)

Add to the return type:
```typescript
canConfigure: boolean; canChat: boolean; canPlanOps: boolean;
```

Add to the map:
```typescript
canConfigure: row.user_hospital_roles.canConfigure ?? false,
canChat: row.user_hospital_roles.canChat ?? false,
canPlanOps: row.user_hospital_roles.canPlanOps ?? false,
```

- [ ] **Step 2: Update IStorage interface in server/storage.ts**

The `IStorage` interface has a hardcoded return type for `getUserHospitals` that does NOT auto-sync with the implementation. Find the `getUserHospitals` type signature in `server/storage.ts` and add `canConfigure: boolean; canChat: boolean; canPlanOps: boolean;` to its return type.

No changes needed in `auth.ts` — it already returns `hospitals` directly from `getUserHospitals`.

- [ ] **Step 3: Verify the /api/auth/user endpoint returns flags**

Run: `npm run check`
Expected: TypeScript passes clean.

- [ ] **Step 4: Commit**

```bash
git add server/storage/hospitals.ts server/storage.ts
git commit -m "feat: expose permission flags in getUserHospitals response"
```

---

### Task 3: Backend — Permission Middleware

**Files:**
- Modify: `server/utils/accessControl.ts` (add `requirePermission` factory + `hasPermission` helper)
- Modify: `server/utils/index.ts` (re-export `requirePermission` and `PermissionFlag` so `import from "../utils"` works)

- [ ] **Step 1: Add permission helper and middleware factory**

Add at the end of `server/utils/accessControl.ts`:

```typescript
export type PermissionFlag = 'canConfigure' | 'canChat' | 'canPlanOps';

// Check if user has a specific permission for a hospital
// Admin role implicitly has all permissions
export async function userHasPermission(
  userId: string,
  hospitalId: string,
  permission: PermissionFlag
): Promise<boolean> {
  const hospitals = await storage.getUserHospitals(userId);
  return hospitals.some(
    h => h.id === hospitalId && (h.role === 'admin' || h[permission] === true)
  );
}

// Middleware factory: requirePermission('canConfigure')
export function requirePermission(permission: PermissionFlag) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hospitalId = await resolveHospitalIdFromRequest(req);
      if (!hospitalId) {
        return res.status(400).json({
          message: "Hospital context required.",
          code: "HOSPITAL_ID_REQUIRED"
        });
      }

      const hasAccess = await userHasPermission(userId, hospitalId, permission);
      if (!hasAccess) {
        return res.status(403).json({
          message: "Insufficient permissions for this action.",
          code: "PERMISSION_DENIED"
        });
      }

      req.resolvedHospitalId = hospitalId;
      req.verifiedHospitalId = hospitalId;
      next();
    } catch (error) {
      logger.error(`Error checking permission ${permission}:`, error);
      res.status(500).json({ message: "Error checking permissions" });
    }
  };
}
```

Note: `resolveHospitalIdFromRequest` is already defined as a private function in this file. It needs to remain accessible — it's already in scope since `requirePermission` is in the same file.

- [ ] **Step 2: Re-export from server/utils/index.ts**

Add to `server/utils/index.ts`:
```typescript
export { requirePermission, userHasPermission, type PermissionFlag } from './accessControl';
```

The barrel export file does NOT auto-export new symbols — this must be added explicitly.

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: Clean pass.

- [ ] **Step 4: Commit**

```bash
git add server/utils/accessControl.ts server/utils/index.ts
git commit -m "feat: add requirePermission middleware factory"
```

---

### Task 4: Backend — Apply Permission Middleware to Routes

**Files:**
- Modify: `server/routes/admin.ts` (configuration routes: use `requirePermission('canConfigure')` instead of `isAdmin` for settings-only routes)
- Modify: `server/routes/anesthesia/settings.ts` or wherever surgery/anesthesia/inventory set routes live (use `requirePermission('canPlanOps')`)
- Modify: chat-related routes (use `requirePermission('canChat')`)

The goal is to replace `isAdmin` with `requirePermission(...)` on routes that match the three permission categories. Routes that are truly admin-only (user management, unit creation) stay behind `isAdmin`.

- [ ] **Step 1: Identify which admin.ts routes get which permission**

**Keep `isAdmin` (true admin-only):**
- `POST/GET /api/admin/:hospitalId/units` — unit management
- `POST /api/admin/:hospitalId/users` — user creation
- `PATCH /api/admin/users/:roleId` — role changes
- `POST /api/admin/:hospitalId/users/add-existing` — add existing user

**Change to `requirePermission('canConfigure')`:**
- `GET /api/admin/:hospitalId` — view hospital settings
- `PATCH /api/admin/:hospitalId` — update hospital settings
- `PATCH /api/admin/:hospitalId/anesthesia-location` — set anesthesia unit
- `PATCH /api/admin/:hospitalId/surgery-location` — set surgery unit
- Token management routes (questionnaire, kiosk, booking tokens)
- Closure management routes
- Logo upload

**`canChat` note:** There are NO dedicated chat-specific backend routes that need admin gating. `canChat` is a **frontend-only gate** for this iteration — it controls visibility of chat management UI in `ChatDock.tsx`. The `addonPatientChat` toggle is part of hospital settings (`PATCH /api/admin/:hospitalId`) which falls under `canConfigure`.

**Change to `requirePermission('canPlanOps')`:**
- Surgery sets, anesthesia sets, inventory sets routes (in their respective route files)
- External surgery request routes (viewing/managing)

- [ ] **Step 2: Update admin.ts — replace isAdmin with requirePermission('canConfigure') on config routes**

Import `requirePermission` from `../utils`:
```typescript
import { requireWriteAccess, requireResourceAdmin, requireStrictHospitalAccess, requirePermission } from "../utils";
```

Replace `isAdmin` middleware on configuration routes. For example:

```typescript
// Before:
router.get('/api/admin/:hospitalId', isAuthenticated, isAdmin, async (req, res) => {
// After:
router.get('/api/admin/:hospitalId', isAuthenticated, requirePermission('canConfigure'), async (req, res) => {
```

Apply this to all config-related routes listed in Step 1. Keep `isAdmin` on user/unit management routes.

- [ ] **Step 3: Update surgery/anesthesia/inventory set routes for canPlanOps**

Find routes for surgery sets, anesthesia sets, inventory sets that currently use `requireAdminRole`. Replace with `requirePermission('canPlanOps')`.

- [ ] **Step 4: Update external surgery request access for canPlanOps**

In the OpList external requests check (currently gated by `requireHospitalAccess` on backend, admin check on frontend), update to use `requirePermission('canPlanOps')`.

- [ ] **Step 5: Update inline admin checks across backend routes**

Many route files have **inline** `h.role === 'admin'` checks (not middleware-based). These must also be updated. Use `userHasPermission()` helper for inline checks.

**canConfigure (inline checks):**
- `server/routes/checklists.ts` — checklist template CRUD (~3 inline checks)
- `server/routes/hospitals.ts` — hospital settings/seed/reset (~4 inline checks)
- `server/routes/clinic.ts` — clinic configuration routes
- `server/routes/tardoc.ts` — TARDOC billing configuration (~5 inline checks)
- `server/routes/anesthesia/settings.ts` — line ~466, inline role check

**canPlanOps (inline checks):**
- `server/routes/anesthesia/surgeries.ts` — line ~360, surgery deletion admin check
- `server/routes/anesthesia/inventory.ts` — lines ~485, 559, 976, 1015, PATCH/DELETE on sets

**Keep admin-only (inline checks):**
- `server/routes/billing.ts` — billing management stays admin-only
- `server/routes/notes.ts` — hospital-scoped note edit/delete
- `server/routes/worktimeLogs.ts` — worktime log admin checks

For inline checks, replace the pattern:
```typescript
// Before:
const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
// After:
const hasPermission = await userHasPermission(userId, hospitalId, 'canConfigure');
```

Import `userHasPermission` from `../utils` in each file that needs it.

**Note on resolveHospitalIdFromRequest:** The `requirePermission` middleware resolves hospitalId from `req.params.hospitalId`, `req.body.hospitalId`, AND the `X-Active-Hospital-Id` header. This covers the anesthesia/inventory set routes which pass hospitalId in the request body (not URL params).

- [ ] **Step 6: Run typecheck**

Run: `npm run check`
Expected: Clean pass.

- [ ] **Step 7: Commit**

```bash
git add server/routes/
git commit -m "feat: apply requirePermission middleware and inline checks to routes"
```

---

### Task 5: Frontend — Expose Flags in useActiveHospital

**Files:**
- Modify: `client/src/hooks/useActiveHospital.ts:5-26` (Hospital interface)

- [ ] **Step 1: Add permission flags to Hospital interface**

```typescript
interface Hospital {
  id: string;
  name: string;
  role: string;
  unitId: string;
  unitName: string;
  unitType?: string | null;
  isAnesthesiaModule?: boolean;
  isSurgeryModule?: boolean;
  isBusinessModule?: boolean;
  isClinicModule?: boolean;
  isLogisticModule?: boolean;
  showControlledMedications?: boolean;
  externalSurgeryToken?: string | null;
  visionAiProvider?: string;
  currency?: string;
  dateFormat?: string;
  hourFormat?: string;
  timezone?: string;
  defaultLanguage?: string;
  // Permission flags
  canConfigure?: boolean;
  canChat?: boolean;
  canPlanOps?: boolean;
}
```

No other changes needed — the data already flows from `/api/auth/user` → `user.hospitals` → `useActiveHospital`.

- [ ] **Step 2: Add a convenience helper**

Create a small helper function (can go in the same file or a new `usePermissions.ts`):

```typescript
export function useHasPermission(permission: 'canConfigure' | 'canChat' | 'canPlanOps'): boolean {
  const activeHospital = useActiveHospital();
  if (!activeHospital) return false;
  return activeHospital.role === 'admin' || activeHospital[permission] === true;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useActiveHospital.ts
git commit -m "feat: expose permission flags in useActiveHospital hook"
```

---

### Task 6: Frontend — Update Admin Checks to Use Permissions

**Files:**
- Modify: ~15 frontend files that currently check `activeHospital?.role === "admin"` for features that now map to a permission flag

The key mapping:

| Current check | New check | Files |
|---|---|---|
| `isAdmin` for Settings page access | `isAdmin \|\| canConfigure` | `ProtectedRoute.tsx`, `BottomNav.tsx`, `ModuleDrawer.tsx`, `Settings.tsx` |
| `isAdmin` for Checklists/Clinical config | `isAdmin \|\| canConfigure` | `Checklists.tsx`, `Clinical.tsx` |
| `isAdmin` for chat toggle | `isAdmin \|\| canChat` | `ChatDock.tsx` |
| `isAdmin` for external surgery requests | `isAdmin \|\| canPlanOps` | `OpList.tsx` |
| `isAdmin` for surgery sets/anesthesia sets | `isAdmin \|\| canPlanOps` | `PatientDetail.tsx`, `IntraOpTab.tsx`, `InventoryUsageTab.tsx` |
| `isAdmin` for integrations | `isAdmin \|\| canConfigure` | `Integrations.tsx` |
| `isAdmin` for patients list | `isAdmin \|\| canPlanOps` | `Patients.tsx` |
| `isAdmin` for Op page (isAdmin prop) | `isAdmin \|\| canPlanOps` | `Op.tsx` |
| `isAdmin` for EditSurgeryDialog | `isAdmin \|\| canPlanOps` | `EditSurgeryDialog.tsx` |
| `isAdmin` for UnifiedTimeline | `isAdmin \|\| canPlanOps` | `UnifiedTimeline.tsx` |
| `isAdmin` for Items page | `isAdmin \|\| canConfigure` | `Items.tsx` |
| `isAdmin` for CommandPalette | `isAdmin \|\| canConfigure \|\| canChat \|\| canPlanOps` | `CommandPalette.tsx` |
| `isAdmin` for staff management | keep `isAdmin` only | `StaffTab.tsx`, `StaffPoolPanel.tsx`, `StaffManagementDialog.tsx`, `PlanStaffDialog.tsx` |
| `isAdmin` for user management | keep `isAdmin` only | `Users.tsx` |
| `isAdmin/manager` for business pages | keep as-is (role-based, not permission-based) | `CostAnalytics.tsx`, `SimplifiedStaff.tsx` |

- [ ] **Step 1: Update files that need canConfigure**

Replace patterns like:
```typescript
// Before:
const isAdmin = activeHospital?.role === "admin";
// After:
const isAdmin = activeHospital?.role === "admin";
const canConfigure = isAdmin || activeHospital?.canConfigure === true;
```

Then use `canConfigure` instead of `isAdmin` for settings-related gates.

For route protection in `ProtectedRoute.tsx`:
```typescript
const hasAdminAccess = activeHospital?.role === "admin";
const hasConfigAccess = hasAdminAccess || activeHospital?.canConfigure === true;
```

For `BottomNav.tsx` and `ModuleDrawer.tsx`, update the settings/admin menu visibility to show when `canConfigure || canChat || canPlanOps` (any permission grants access to the admin area, but individual pages gate their own content).

- [ ] **Step 2: Update files that need canChat**

In `ChatDock.tsx`, replace the admin check for the chat management toggle.

- [ ] **Step 3: Update files that need canPlanOps**

In `OpList.tsx`:
```typescript
// Before:
const showExternalRequests = hasExternalSurgeryToken && activeHospital?.unitType === 'or' && activeHospital?.role === 'admin';
// After:
const showExternalRequests = hasExternalSurgeryToken && activeHospital?.unitType === 'or' && (activeHospital?.role === 'admin' || activeHospital?.canPlanOps === true);
```

Similar updates in `PatientDetail.tsx`, `IntraOpTab.tsx`, `InventoryUsageTab.tsx`.

- [ ] **Step 4: Run typecheck + lint**

Run: `npm run check`
Expected: Clean pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/
git commit -m "feat: use permission flags instead of admin-only checks in frontend"
```

---

### Task 7: User Management UI — Permission Checkboxes

**Files:**
- Modify: `client/src/pages/admin/Users.tsx` (add checkboxes for permission flags when creating/editing user roles)
- Modify: `server/routes/admin.ts` (accept permission flags in create/update user role endpoints)

- [ ] **Step 1: Update backend — accept permission flags in role endpoints**

In `admin.ts`, update the validation schemas:

```typescript
const updateUserRoleSchema = z.object({
  unitId: z.string().optional(),
  role: z.enum(['admin', 'user', 'viewer']).optional(),
  canConfigure: z.boolean().optional(),
  canChat: z.boolean().optional(),
  canPlanOps: z.boolean().optional(),
});
```

Also update the create-user endpoint to accept these fields and pass them to `storage.createUserHospitalRole()`.

- [ ] **Step 2: Update storage — save permission flags when creating/updating roles**

Ensure the storage methods for creating and updating `userHospitalRoles` pass through the permission flag values.

- [ ] **Step 3: Update Users.tsx — add permission checkboxes**

In the user creation dialog and the role editing section, add three checkboxes below the role selector. Only show them when the selected role is NOT `admin` (admin has all permissions implicitly).

Use shadcn `Checkbox` component:

```tsx
{userForm.role !== 'admin' && (
  <div className="space-y-2">
    <Label className="text-sm font-medium">{t("admin.extraPermissions")}</Label>
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2">
        <Checkbox
          checked={userForm.canConfigure}
          onCheckedChange={(v) => setUserForm({ ...userForm, canConfigure: !!v })}
        />
        <span className="text-sm">{t("admin.permissionConfigure")}</span>
      </label>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={userForm.canChat}
          onCheckedChange={(v) => setUserForm({ ...userForm, canChat: !!v })}
        />
        <span className="text-sm">{t("admin.permissionChat")}</span>
      </label>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={userForm.canPlanOps}
          onCheckedChange={(v) => setUserForm({ ...userForm, canPlanOps: !!v })}
        />
        <span className="text-sm">{t("admin.permissionPlanOps")}</span>
      </label>
    </div>
  </div>
)}
```

- [ ] **Step 4: Add i18n keys**

Add translation keys for both `de` and `en`:
- `admin.extraPermissions`: "Extra Permissions" / "Zusätzliche Berechtigungen"
- `admin.permissionConfigure`: "Configuration (settings, tokens, closures)" / "Konfiguration (Einstellungen, Tokens, Schliessungen)"
- `admin.permissionChat`: "Patient Chat Management" / "Patienten-Chat Verwaltung"
- `admin.permissionPlanOps`: "OP Planning (surgery sets, external requests)" / "OP-Planung (OP-Sets, externe Anfragen)"

- [ ] **Step 5: Run typecheck + lint**

Run: `npm run check`
Expected: Clean pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/admin/Users.tsx server/routes/admin.ts client/src/lib/i18n/
git commit -m "feat: add permission flag checkboxes to user management UI"
```

---

### Task 8: Smoke Test & Verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify admin still works**

Login as admin. Confirm all settings, chat, op-planning features are accessible as before.

- [ ] **Step 3: Test permission grant**

Create a `doctor` user (or use existing one). Grant `canConfigure`. Verify:
- Doctor can access Settings page
- Doctor cannot access User Management
- Doctor cannot see chat toggle (no `canChat`)
- Doctor cannot see external surgery requests (no `canPlanOps`)

- [ ] **Step 4: Test permission combinations**

Grant same doctor `canPlanOps`. Verify external surgery requests now visible.

- [ ] **Step 5: Run typecheck final**

Run: `npm run check`
Expected: Clean pass.

- [ ] **Step 6: Final commit if any fixes**

```bash
git add -A
git commit -m "fix: address smoke test issues for permission flags"
```
