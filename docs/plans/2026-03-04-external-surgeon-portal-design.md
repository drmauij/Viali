# External Surgeon Portal — Design

## Overview

A portal where external surgeons can view all their surgeries at a hospital and request cancellations, rescheduling, or suspensions. Uses OTP/magic link authentication (same pattern as patient/worklog portals). Clinic staff accept/refuse these requests from the existing sidebar panel.

## Portal Entry & Authentication

**URL:** `/surgeon-portal/:token` — reuses `hospital.externalSurgeryToken`

**Link placement:** Visible banner at the top of `ExternalSurgeryRequest.tsx` — "Already submitted requests? View your surgeries →"

**Auth flow (differs from patient/worklog — hospital-wide token, not per-person):**

1. Surgeon visits `/surgeon-portal/:token`
2. Custom `SurgeonPortalGate` asks for email address
3. System sends OTP to that email (email only, no SMS option)
4. Surgeon enters OTP or clicks magic link → session created
5. Session scoped to `portalType: "surgeon"`, `portalToken: token`, with surgeon's email stored

**Schema change:** Add `surgeonEmail` field to `portalAccessSessions` table (nullable, used only for surgeon portal).

**Session duration:** 30 days (same as worklog).

## Data Aggregation

Portal shows surgeries from two sources, deduplicated by `surgery.id`:

1. **From external requests:** `external_surgery_requests` where `surgeonEmail` matches AND `status = 'scheduled'` → linked `surgery` via `surgeryId`
2. **From direct planning:** `surgeries` where main surgeon's email matches (join `surgeonId` → `users.email`)

**Displayed per surgery:** patient name (or "Slot Reservation"), surgery name/CHOP code, planned date & time, room, status, duration.

**Filter:** Non-archived, non-cancelled surgeries. Completed surgeries optionally in a "past" section.

## Calendar & Day View

**Month calendar** (same pattern as `PlanningCalendar.tsx` from external worklog):

- 7-column grid, Monday–Sunday, prev/next month navigation
- Day cells show colored dots/badges for surgeries
- Click day → detail panel below

**Day detail panel** lists surgeries with time, patient, surgery name, room, status. Per active/planned surgery, three action buttons:

- **Request Cancellation** → dialog with required reason
- **Request Reschedule** → dialog with reason + optional preferred date + optional time range
- **Request Suspension** → dialog with required reason

If surgeon already has a pending request for a surgery, show its status instead of action buttons.

## Database Schema

```sql
surgeon_action_requests (
  id             UUID PRIMARY KEY,
  hospital_id    UUID NOT NULL REFERENCES hospitals(id),
  surgery_id     UUID NOT NULL REFERENCES surgeries(id),
  surgeon_email  VARCHAR NOT NULL,

  type           ENUM ('cancellation', 'reschedule', 'suspension') NOT NULL,
  reason         TEXT NOT NULL,

  -- Reschedule-specific (nullable)
  proposed_date      DATE,
  proposed_time_from INTEGER, -- minutes since midnight
  proposed_time_to   INTEGER,

  status         ENUM ('pending', 'accepted', 'refused') NOT NULL DEFAULT 'pending',
  response_note  TEXT,
  responded_by   UUID REFERENCES users(id),
  responded_at   TIMESTAMP,

  confirmation_email_sent BOOLEAN DEFAULT FALSE,
  confirmation_sms_sent   BOOLEAN DEFAULT FALSE,

  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
)

INDEXES:
  - (hospital_id, status)
  - (surgery_id)
  - (surgeon_email)
```

## Admin Sidebar — Accept/Refuse Workflow

`ExternalReservationsPanel` gets a new tab/section "Surgeon Requests":

- Badge with pending count (separate or combined with surgery requests)
- Request cards show: type (color-coded), surgery info, surgeon's reason, proposed date (for reschedule)
- Two buttons: **Accept** / **Refuse**

**Accept by type:**

| Type | Action |
|------|--------|
| Cancellation | Set surgery `status = 'cancelled'`, mark request `accepted` |
| Suspension | Set surgery `isSuspended = true`, mark request `accepted` |
| Reschedule | Open scheduling dialog pre-filled with proposed date → archive old surgery, create new one → mark request `accepted` |

**Refuse:** Dialog with optional refusal note → mark request `refused`.

**Notifications (after accept/refuse):** Email to surgeon with result + link to surgeon portal. SMS fallback if email fails.

## API Routes

### Surgeon Portal (session-protected)

```
GET  /api/surgeon-portal/:token/surgeries?month=YYYY-MM
POST /api/surgeon-portal/:token/action-requests
GET  /api/surgeon-portal/:token/action-requests
```

### Auth (adapting existing portal-auth)

```
POST /api/portal-auth/surgeon/:token/request-code   (email in body)
POST /api/portal-auth/surgeon/:token/verify-code
GET  /api/portal-auth/verify/:verificationToken      (existing magic link)
```

### Admin (authenticated)

```
GET   /api/hospitals/:id/surgeon-action-requests?status=pending
GET   /api/hospitals/:id/surgeon-action-requests/count
POST  /api/hospitals/:id/surgeon-action-requests/:reqId/accept
POST  /api/hospitals/:id/surgeon-action-requests/:reqId/refuse
```

## Notifications

Reuse `resend.ts` patterns. New email templates:

1. **Action request submitted** → to clinic (notification email or OR admins)
2. **Request accepted** → to surgeon (includes portal link)
3. **Request refused** → to surgeon (includes reason + portal link)

SMS fallback for surgeon notifications if email fails.

## Languages

Portal supports de/en (same as worklog portal). Emails bilingual based on hospital's `defaultLanguage`.
