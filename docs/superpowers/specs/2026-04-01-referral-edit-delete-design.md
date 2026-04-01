# Admin Role for Business Units + Referral Edit/Delete — Design Spec

**Date:** 2026-04-01
**Status:** Approved

## Problem

Business-type units only allow `manager`, `marketing`, `staff` roles — no `admin`. Users like `admin@business` can't exist. Additionally, referral events in the "Recent Referral Events" card are read-only with no way to correct mistakes (wrong source attribution) or remove bad data.

## Solution

1. Add `admin` to allowed roles for business units
2. Add edit (source + sourceDetail) and delete capabilities to referral events
3. Edit: admin + manager. Delete: admin only.

## Changes

### 1. Role restriction (`client/src/pages/admin/Users.tsx`)

Add `admin` to the business unit allowed roles array (currently `manager`, `marketing`, `staff`).

### 2. API endpoints (`server/routes/business.ts`)

**PATCH `/api/business/:hospitalId/referral-events/:eventId`**
- Auth: `isAuthenticated`, `isMarketingOrManager`
- Body: `{ source?: string, sourceDetail?: string }`
- Validates source against enum: `social`, `search_engine`, `llm`, `word_of_mouth`, `belegarzt`, `other`
- Returns updated referral event

**DELETE `/api/business/:hospitalId/referral-events/:eventId`**
- Auth: `isAuthenticated`, admin-only check (role === 'admin')
- Verifies event belongs to hospital before deleting
- Returns `{ success: true }`

### 3. UI (`client/src/pages/business/Marketing.tsx`)

Add actions column to the Recent Referral Events table, visible to admin/manager:

- **Edit button** (pencil icon): Opens a Dialog with:
  - Source dropdown (the 6 enum values)
  - Source Detail text input
  - Save / Cancel buttons
- **Delete button** (trash icon, admin only): Opens AlertDialog confirmation, then deletes

After edit/delete, invalidate the referral-events query to refresh the table.

## No migration needed

No schema changes — just new endpoints and UI.
