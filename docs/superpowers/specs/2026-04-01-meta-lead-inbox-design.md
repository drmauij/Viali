# Meta Lead Inbox — Design Spec

**Date:** 2026-04-01
**Status:** Draft

## Problem

Meta (Facebook/Instagram) lead form submissions currently go through an Excel sheet managed by the marketing agency. Staff manually call patients from the Excel, then create appointments in Viali. This is the only lead source not natively integrated — Google Ads leads already flow through the booking page with automatic UTM/gclid tracking.

## Solution

Replace the Excel middleman with:
1. A webhook endpoint the agency POSTs leads to (instead of the Excel)
2. An inbox sidebar panel on the appointment calendar (same UX pattern as external surgery requests) where staff see leads, log contact attempts, and drag-and-drop to schedule appointments

Once a lead becomes an appointment, it enters the existing referral funnel — conversion tracking, analytics, and CSV export back to Meta are already built.

## Scope

### In scope
- Webhook receiver (REST endpoint with API key auth)
- `meta_leads` + `meta_lead_contacts` tables
- Inbox sidebar panel on appointment calendar page (toggle with surgery requests)
- Lead status tracking + contact log
- Patient fuzzy matching on scheduling (reuse existing logic from LeadConversion)
- Appointment + referral event creation on conversion
- Webhook config UI in `/admin/integrations`

### Out of scope
- Meta Graph API integration (agency handles their Meta connection)
- Post-appointment tracking (existing referral funnel handles OP, paid, cancellation)
- Conversion feedback to Meta (already implemented in Marketing → Feed Back to Platforms)
- Notifications/alerts for new leads (future enhancement)

## Data Model

### `meta_leads` table

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default gen | |
| hospitalId | uuid | FK hospitals, NOT NULL | |
| firstName | varchar | NOT NULL | |
| lastName | varchar | NOT NULL | |
| email | varchar | nullable | At least one of email/phone expected |
| phone | varchar | nullable | |
| operation | varchar | NOT NULL | Procedure the patient wants |
| source | varchar | NOT NULL | `fb` or `ig` |
| metaLeadId | varchar | NOT NULL, unique per hospital | From Meta, used for conversion CSV |
| metaFormId | varchar | NOT NULL | From Meta, used for conversion CSV |
| status | enum | NOT NULL, default `new` | `new`, `in_progress`, `converted`, `closed` |
| patientId | uuid | FK patients, nullable | Set when matched/converted |
| appointmentId | uuid | FK clinic_appointments, nullable | Set on conversion |
| closedReason | varchar | nullable | Free text when closing |
| createdAt | timestamp | NOT NULL, default now | When webhook received |
| updatedAt | timestamp | NOT NULL, default now | |

**Indexes:**
- `(hospitalId, status, createdAt)` — inbox queries filtered by status
- `(hospitalId, metaLeadId)` — unique, dedup incoming webhooks

### `meta_lead_contacts` table (contact log)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default gen | |
| metaLeadId | uuid | FK meta_leads, NOT NULL | |
| outcome | enum | NOT NULL | `reached`, `no_answer`, `wants_callback`, `will_call_back`, `needs_time` |
| note | text | nullable | Free text |
| createdAt | timestamp | NOT NULL, default now | |
| createdBy | uuid | FK users, NOT NULL | Staff who logged the contact |

**Index:** `(metaLeadId, createdAt)` — contact history ordered by time

### `meta_lead_webhook_config` table

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| hospitalId | uuid | PK, FK hospitals | One config per hospital |
| apiKey | varchar | NOT NULL | Stored hashed (bcrypt or similar) |
| enabled | boolean | NOT NULL, default true | Kill switch |
| createdAt | timestamp | NOT NULL, default now | |

## API Endpoints

### Webhook (public, API key auth)

**`POST /api/webhooks/meta-leads/:hospitalId`**

Query params: `key` — the API key

Request body:
```json
{
  "lead_id": "string (required)",
  "form_id": "string (required)",
  "first_name": "string (required)",
  "last_name": "string (required)",
  "email": "string (optional)",
  "phone": "string (optional)",
  "operation": "string (required)",
  "source": "fb | ig (required)"
}
```

Response: `200 OK` with `{ "status": "received", "id": "<lead uuid>" }`

Behavior:
- Validate API key against hashed value in `meta_lead_webhook_config`
- Check `enabled` flag
- Dedup by `(hospitalId, metaLeadId)` — if already exists, return 200 with existing ID (idempotent)
- Insert into `meta_leads` with status `new`
- Return 401 if key invalid, 403 if disabled, 400 if missing required fields

### Internal API (authenticated, marketing/manager role)

**`GET /api/business/:hospitalId/meta-leads`**
- Query params: `status` (optional filter), `limit`, `before` (cursor pagination)
- Returns leads with latest contact summary (count + last outcome)
- Joins `meta_lead_contacts` aggregated

**`GET /api/business/:hospitalId/meta-leads/:leadId`**
- Full lead detail with contact history

**`POST /api/business/:hospitalId/meta-leads/:leadId/contacts`**
- Body: `{ "outcome": "reached|no_answer|wants_callback|will_call_back|needs_time", "note": "optional text" }`
- Creates contact log entry
- Auto-updates lead status to `in_progress` if currently `new`

**`PATCH /api/business/:hospitalId/meta-leads/:leadId`**
- Body: `{ "status": "closed", "closedReason": "optional text" }`
- Only allows setting `closed` status manually (converted is set automatically)

**`POST /api/business/:hospitalId/meta-leads/:leadId/convert`**
- Body: `{ "patientId": "uuid (existing or null)", "patient": { ... new patient data if no match }, "appointmentDate": "ISO", "appointmentTime": "HH:mm", "surgeryRoomId": "uuid|null", "duration": 30 }`
- If `patientId` is null, creates new patient from lead data
- Creates clinic appointment
- Creates `referralEvent` with `metaLeadId`, `metaFormId`, source=`social`, captureMethod=`staff`
- Sets lead status to `converted`, stores `patientId` + `appointmentId`

**`POST /api/business/:hospitalId/meta-leads/fuzzy-match`**
- Body: `{ "firstName": "...", "lastName": "...", "email": "...", "phone": "..." }`
- Reuses existing fuzzy match logic from `patientDeduplication.ts`
- Returns candidate patients with confidence scores

### Webhook Config (admin role)

**`GET /api/admin/:hospitalId/meta-lead-config`**
- Returns: `{ enabled, webhookUrl, hasApiKey, createdAt }`
- Does NOT return raw API key (only whether one exists)

**`POST /api/admin/:hospitalId/meta-lead-config/generate-key`**
- Generates new API key, hashes and stores it
- Returns the raw key ONCE in the response (not stored in plaintext)

**`PATCH /api/admin/:hospitalId/meta-lead-config`**
- Body: `{ "enabled": boolean }`
- Toggle webhook on/off

## UI Components

### 1. Inbox Sidebar Panel (Appointment Calendar)

**Location:** Right panel in `ResizablePanelGroup` on the appointment calendar page (OpList.tsx)

**Panel toggle:** Tabs or dropdown at the top of the sidebar to switch between "Surgery Requests" and "Meta Leads". Badge count on Meta Leads showing number of `new` leads.

**Lead card contents:**
- Name (first + last)
- Operation (procedure)
- Source icon (Facebook / Instagram)
- Time since arrival (e.g. "2h ago", "3d ago")
- Contact summary: "Contacted 2x — wants callback" or "New"
- Visual indicator for status (color dot or badge)

**Card interactions:**
- Draggable onto calendar (same pattern as `useExternalRequestDrag`)
- Click to expand: shows contact history + "Log Contact" form + "Close Lead" button
- Drag or tap-to-select → drop on calendar slot → scheduling dialog

**Filters:** Toggle between "New", "In Progress", "All" at the top of the panel

### 2. Scheduling Dialog (on drop)

Triggered when a lead is dropped onto a calendar slot. Similar to `ScheduleDialog` for surgery requests.

**Steps:**
1. Shows lead info (name, phone, email, operation) — read-only
2. Patient matching section:
   - Auto-runs fuzzy match on lead name/phone/email
   - If matches found: shows candidates with confidence scores, user picks one or chooses "Create new patient"
   - If no matches: defaults to "Create new patient" (pre-filled from lead data)
3. Appointment details (pre-filled from drop coordinates):
   - Date + time (from calendar slot)
   - Room (from drop target column)
   - Duration (default 30 min, editable)
4. Confirm button → creates patient (if new) + appointment + referral event + marks lead converted

### 3. Contact Log Inline Form

When a lead card is expanded in the sidebar:
- Dropdown for outcome: Reached / No Answer / Wants Callback / Will Call Back / Needs Time
- Text input for optional note
- "Log" button
- Below: chronological list of previous contacts (timestamp, outcome, note, who logged it)

### 4. Webhook Config Tab (`/admin/integrations`)

New tab: "Meta Leads"

**Contents:**
- **Status indicator:** green/red dot showing enabled/disabled
- **Webhook URL:** read-only text field with copy button. Format: `https://<domain>/api/webhooks/meta-leads/<hospitalId>?key=<key>`
- **API Key section:**
  - If no key: "Generate API Key" button
  - If key exists: "Regenerate API Key" button (with confirmation — invalidates old key)
  - On generate: shows the key ONCE in a copyable field with warning "Save this key — it won't be shown again"
- **Enable/Disable toggle**
- **Last received:** timestamp of the most recent webhook call (from latest `meta_leads.createdAt`)
- **Instructions panel:** collapsible section with setup instructions for the agency:
  ```
  Send a POST request to the webhook URL above with this JSON body:
  {
    "lead_id": "Meta Lead ID",
    "form_id": "Meta Form ID",
    "first_name": "...",
    "last_name": "...",
    "email": "...",
    "phone": "...",
    "operation": "...",
    "source": "fb or ig"
  }
  ```

## Drag-and-Drop Implementation

Follows the exact same pattern as external surgery requests:

1. **Global drag state:** New module `useMetaLeadDrag.ts` exporting `draggedMetaLead` + `setDraggedMetaLead()` (mirrors `useExternalRequestDrag.ts`)
2. **Lead card:** Sets `draggedMetaLead` on drag start, clears on drag end
3. **OPCalendar.tsx:** Already supports `dragFromOutsideItem` + `onDropFromOutside` — extend to check both `draggedRequest` and `draggedMetaLead`
4. **OpList.tsx:** `handleDropFromOutside` checks which drag source is active, opens the appropriate scheduling dialog
5. **Tap-to-select:** Same pattern — select a lead by tapping, then tap a calendar slot

## Access Control

- Webhook endpoint: API key only (no session auth — external agency calls it)
- Inbox panel + lead APIs: `isAuthenticated` + `isMarketingOrManager` (same as referral funnel)
- Webhook config: `isAuthenticated` + `isAdmin` (same as other integration configs)

## Migration Notes

- All migrations must be idempotent (`IF NOT EXISTS`, `DO $$ ... END $$`)
- Three new tables: `meta_leads`, `meta_lead_contacts`, `meta_lead_webhook_config`
- Two new enums: `meta_lead_status`, `meta_lead_contact_outcome`
- No changes to existing tables

## Future Enhancements (out of scope)

- Real-time notifications (e.g. browser notification or sound when new lead arrives)
- Auto-matching: if lead phone/email matches exactly one patient, pre-select automatically
- Bulk actions (close multiple leads)
- Direct Meta Graph API integration (bypass agency)
- Lead assignment to specific staff members
