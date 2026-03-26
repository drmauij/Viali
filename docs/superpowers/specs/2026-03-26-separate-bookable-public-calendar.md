# Separate Internal Bookable from Public Calendar

**Date:** 2026-03-26
**Status:** Approved

## Problem

A single `isBookable` field on `userHospitalRoles` controls both:
- Whether a provider appears in the internal appointment calendar (for staff booking)
- Whether a provider appears on the public `/book` page (for patient self-booking)

This means toggling one always affects the other. Users expect these to be independent.

## Solution

Add a `publicCalendarEnabled` boolean column to `userHospitalRoles` (default `false`).

### Field semantics

| Field | Controls | Set from |
|-------|----------|----------|
| `isBookable` | Provider listed in internal appointment calendar | "Bookable" toggle on Users page |
| `publicCalendarEnabled` | Provider listed on public `/book` page | "Public Calendar Enabled" toggle in Manage Availability dialog |

### Rules

- `publicCalendarEnabled` can only be `true` if `isBookable` is also `true`
- Setting `isBookable = false` automatically sets `publicCalendarEnabled = false`
- Setting `isBookable = true` does NOT auto-enable `publicCalendarEnabled`

### No data migration

Only 2 providers are currently public in prod — will be set manually.

## Changes

### 1. Schema (`shared/schema.ts`)
Add `publicCalendarEnabled: boolean("public_calendar_enabled").default(false)` to `userHospitalRoles`.

### 2. Migration
`ALTER TABLE ADD COLUMN IF NOT EXISTS public_calendar_enabled BOOLEAN DEFAULT false`

### 3. Storage (`server/storage/clinic.ts`)
- Add `getPublicBookableProvidersByHospital()` — same as `getBookableProvidersByHospital` but also filters `publicCalendarEnabled = true`
- Keep `getBookableProvidersByHospital/ByUnit` unchanged (internal use)

### 4. Routes — Public booking (`server/routes/clinic.ts`)
- `GET /api/public/booking/:bookingToken` — use `getPublicBookableProvidersByHospital()` instead of `getBookableProvidersByHospital()`
- Public slot/date/best-provider endpoints — validate provider has `publicCalendarEnabled = true`

### 5. Routes — Provider toggle (`server/routes/clinic.ts`)
- `PUT /api/clinic/:hospitalId/clinic-providers/:userId` — accept `publicCalendarEnabled` in body, persist it

### 6. Routes — Admin (`server/routes/admin.ts`)
- `PATCH /api/admin/user-roles/:roleId/bookable` — when `isBookable = false`, also set `publicCalendarEnabled = false`

### 7. ManageAvailabilityDialog
- "Public Calendar Enabled" toggle reads/writes `publicCalendarEnabled` (not `isBookable`)
- Disable toggle if provider is not `isBookable`
- Show hint: provider must be bookable first

### 8. ClinicProvider type
- Add `publicCalendarEnabled` to `ClinicProvider` interface and `roleToClinicProvider` mapper
