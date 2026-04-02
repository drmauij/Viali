# Portal Document Sharing

**Date:** 2026-04-02
**Status:** Approved

## Summary

Allow staff to share signed discharge briefs with patients via the patient portal. Staff can make documents visible on the portal and optionally send an email/SMS notification. Patients authenticate via existing OTP flow and download PDFs from a new "Documents" section in the portal.

## Scope

- **Shareable documents:** All signed/locked discharge briefs (any brief type: surgery_discharge, anesthesia_discharge, anesthesia_overnight_discharge, prescription, surgery_report, surgery_estimate, generic).
- **Not in scope:** Sharing unsigned drafts, staff-uploaded documents, or email attachments. These can be added later.

## Staff UI — Share Action

On each signed/locked brief card in `PatientDocumentsSection`, a share icon button appears. Clicking opens a dialog with two actions:

1. **"Make available on Patient Portal"** — confirmation dialog: "This document will be visible to the patient on their portal. Continue?" On confirm, marks the brief as portal-visible + creates audit log.
2. **"Send notification via Email/SMS"** — only enabled if already shared to portal. Sends a notification to the patient saying "A new document is available on your portal" with a link to the portal. Patient authenticates via OTP as usual.

The share button shows a visual indicator (filled icon or badge) when the document is already portal-visible. Staff can **revoke** sharing (unshare) with confirmation + audit log.

## Database Changes

Add three columns to `discharge_briefs` table:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `portal_visible` | boolean | false | Whether document is visible on patient portal |
| `portal_shared_at` | timestamp | null | When it was shared |
| `portal_shared_by` | varchar (FK users) | null | Who shared it |

No new tables. Share/unshare actions logged via existing `createAuditLog`.

## Backend Endpoints

### Staff endpoints (require `isAuthenticated` + `requireWriteAccess`)

- **`POST /api/discharge-briefs/:id/share`** — Sets `portal_visible = true`, records `portal_shared_by` and `portal_shared_at`. Creates audit log entry (action: "share"). Returns updated brief.

- **`POST /api/discharge-briefs/:id/unshare`** — Sets `portal_visible = false`, clears shared_at/shared_by. Creates audit log entry (action: "unshare"). Returns updated brief.

- **`POST /api/discharge-briefs/:id/notify-patient`** — Sends email/SMS to the patient with a link to the portal. Uses existing notification infrastructure (portal OTP email/SMS sending). Validates the brief is portal-visible before sending. Creates audit log entry (action: "notify_patient").

### Portal endpoints (require valid portal session)

- **`GET /api/patient-portal/:token/documents`** — Returns list of portal-visible signed briefs for this patient. Each entry includes: id, briefType, language, signedAt, signer name. Does NOT include PDF URLs (those are fetched on demand).

- **`GET /api/patient-portal/:token/documents/:briefId/download`** — Validates: brief belongs to this patient + is portal-visible + is signed + has a PDF. Returns a time-limited signed S3 URL (15-minute expiry). Creates audit log entry (action: "portal_download").

## Patient Portal UI

A new **"Documents"** section appears below the surgery card when there is at least one shared document. Works regardless of surgery status (pre- or post-surgery).

Contents:
- Section heading: "Your Documents" (translated)
- List of shared documents, each showing:
  - Document type label (e.g., "Surgery Discharge Brief", "Prescription", "Surgery Estimate")
  - Language badge
  - Signed date
  - Download button — fetches signed URL from download endpoint, opens PDF in new tab

## Security

- Portal download endpoint validates: valid session + brief belongs to patient + portal_visible = true + brief is signed + has PDF
- S3 signed URLs expire after 15 minutes
- Full audit trail: who shared, when, who downloaded, when
- Notification links point to portal (not direct PDF) — patient must authenticate via OTP
- Unsharing immediately revokes portal access (next download attempt fails)

## Audit Log Entries

All actions use existing `createAuditLog` with `recordType: "discharge_brief"`:

| Action | userId | Details |
|--------|--------|---------|
| `share` | Staff who shared | `{ portalVisible: true }` |
| `unshare` | Staff who unshared | `{ portalVisible: false }` |
| `notify_patient` | Staff who sent notification | `{ notificationType: "email" \| "sms" }` |
| `portal_download` | null (patient action) | `{ patientId, portalToken }` |

## Migration

Single idempotent migration adding three columns to `discharge_briefs`:
```sql
ALTER TABLE discharge_briefs ADD COLUMN IF NOT EXISTS portal_visible boolean DEFAULT false;
ALTER TABLE discharge_briefs ADD COLUMN IF NOT EXISTS portal_shared_at timestamp;
ALTER TABLE discharge_briefs ADD COLUMN IF NOT EXISTS portal_shared_by varchar REFERENCES users(id);
```
