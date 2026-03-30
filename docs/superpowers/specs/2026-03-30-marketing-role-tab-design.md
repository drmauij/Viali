# Marketing Role & Tab Separation — Design Spec

## Goal

Separate referral/lead analytics from the business dashboard into a dedicated Marketing page, and add a `marketing` role so external agencies can access only marketing data without seeing financial/operational content.

## Problem

The marketing agency needs access to referral and lead analytics, but the business dashboard exposes surgery costs, inventory data, staff costs, and administration — all sensitive operational data they shouldn't see. Currently there's no role that restricts business unit access to just marketing content.

## Solution

### 1. New Role: `marketing`

Add `"marketing"` to the role system:

**Hierarchy:** `admin > manager > doctor > nurse > staff > marketing > guest`

- Added to `ROLE_HIERARCHY` in `server/utils/accessControl.ts`
- Added to `WRITE_ROLES` (not read-only)
- Only selectable when assigning a role to a **business** unit type — filtered out of the role dropdown for all other unit types (clinic, anesthesia, OR, logistic)

### 2. New Route: `/business/marketing`

**New component:** `client/src/pages/business/Marketing.tsx`

- Two tabs: **Referrals** (renders `ReferralFunnel`) and **Leads** (renders `LeadConversionTab`)
- Reuses existing components directly — no logic duplication
- Wrapped with `ProtectedRoute requireBusiness`
- Accessible to: `admin`, `manager`, and `marketing` roles on business units

### 3. CostAnalytics Changes

- Remove the Referrals and Leads tabs from `CostAnalytics.tsx`
- CostAnalytics keeps only: **Surgeries** and **Inventories**
- Tab grid changes from `grid-cols-4` to `grid-cols-2`

### 4. Navigation & Access Control

**Frontend navigation (business sidebar/bottom nav):**
- Add "Marketing" link to `/business/marketing`
- Visible to `admin`, `manager`, and `marketing` roles

**Role-based page access:**

| Route | admin | manager | marketing |
|-------|-------|---------|-----------|
| `/business` (CostAnalytics) | yes | yes | **no** → redirect to `/business/marketing` |
| `/business/marketing` | yes | yes | yes |
| `/business/administration` | yes | yes | **no** → redirect |
| `/business/staff` | yes | yes | **no** → redirect |
| `/business/contracts` | yes | yes | **no** → redirect |
| `/business/costs` | yes | yes | **no** → redirect |
| `/business/time` | yes | yes | **no** → redirect |
| `/business/staff-full` | yes | yes | **no** → redirect |
| `/business/dashboard-full` | yes | yes | **no** → redirect |
| `/business/worklogs` | yes | yes | **no** → redirect |

**Implementation approach:** In `ProtectedRoute.tsx`, when `requireBusiness` is set and the user's role is `marketing`, only allow through if the current path is `/business/marketing`. Otherwise redirect to `/business/marketing`.

**Default landing page for marketing role:** When a marketing user navigates to `/business`, they're redirected to `/business/marketing`.

### 5. Admin UI: Role Dropdown Filtering

In the admin panel where roles are assigned to users for a unit:
- When the unit type is `business`: show `admin`, `manager`, `doctor`, `nurse`, `staff`, `marketing`, `guest`
- When the unit type is anything else: show all roles **except** `marketing`

### 6. Backend

No new API endpoints or middleware needed. The referral/lead data endpoints are already hospital-scoped via `requireHospitalAccess`. The marketing user has a `userHospitalRoles` entry for the business unit, so existing access checks pass.

The role value `"marketing"` is stored as a string in `userHospitalRoles.role` (same as all other roles — no schema migration needed).

## Files Changed

| Action | File | Change |
|--------|------|--------|
| Create | `client/src/pages/business/Marketing.tsx` | New page with Referrals + Leads tabs |
| Modify | `client/src/pages/business/CostAnalytics.tsx` | Remove Referrals + Leads tabs (keep Surgeries + Inventories) |
| Modify | `client/src/App.tsx` | Add `/business/marketing` route |
| Modify | `client/src/components/ProtectedRoute.tsx` | Gate marketing role to only `/business/marketing` |
| Modify | `client/src/components/Layout.tsx` or nav component | Add Marketing nav link, hide other links for marketing role |
| Modify | `server/utils/accessControl.ts` | Add `marketing` to `ROLE_HIERARCHY` and `WRITE_ROLES` |
| Modify | Admin role assignment UI | Filter `marketing` role to business unit type only |

## What's NOT in Scope

- Granular per-endpoint API authorization by role (marketing user can technically call any hospital-scoped API — acceptable since the UI prevents navigation)
- Separate marketing-specific API responses (same data, just different UI access)
- Multi-tenant marketing dashboards (one agency seeing multiple hospitals)
