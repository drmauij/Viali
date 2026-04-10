# Viali Flows — Marketing Campaigns

**Date:** 2026-04-10
**Status:** Approved
**Stakeholder context:** beauty2go CEO wants Salesforce Flows replacement. POC to demonstrate clinic-specific marketing automation built into Viali.

---

## 1. Overview

Marketing campaign tool that lets clinic staff segment patients by demographics and treatment history, compose AI-assisted messages (SMS, email, HTML newsletter), attach promo codes with booking links, and send — all from a single page.

**Core loop:** Segment → Channel → Compose (AI + manual edit) → Offer → Send → Track

**Approach:** Campaign-first with automation-ready data model. Campaigns are manually triggered flows with 2 steps (filter + send). Schema supports future automation (scheduled triggers, multi-step flows with waits/conditions, visual builder).

---

## 2. Data Model

### 2.1 `flows`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| hospitalId | FK → hospitals | |
| name | text | Campaign name |
| status | enum | `draft`, `scheduled`, `sending`, `sent`, `failed` |
| triggerType | enum | `manual` (future: `schedule`, `event`) |
| segmentFilters | JSONB | Array of filter rules from segment builder |
| channel | enum | `sms`, `email`, `html_email` |
| messageTemplate | text | Final message content (plain text or HTML) |
| messageSubject | text | Email subject line (null for SMS) |
| promoCodeId | FK → promo_codes | Nullable |
| recipientCount | integer | Snapshot at send time |
| createdBy | FK → users | |
| createdAt | timestamp | |
| updatedAt | timestamp | |
| sentAt | timestamp | Nullable |

### 2.2 `flow_steps` (automation-ready, not used by POC UI)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| flowId | FK → flows | |
| stepOrder | integer | |
| stepType | enum | `filter`, `send_sms`, `send_email`, `send_html_email`, `wait`, `condition` |
| config | JSONB | Step-specific configuration |
| createdAt | timestamp | |

### 2.3 `flow_executions`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| flowId | FK → flows | |
| patientId | FK → patients | |
| currentStepId | FK → flow_steps | Nullable |
| status | enum | `pending`, `running`, `completed`, `failed` |
| startedAt | timestamp | |
| completedAt | timestamp | Nullable |

### 2.4 `flow_events`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| executionId | FK → flow_executions | |
| stepId | FK → flow_steps | Nullable |
| eventType | enum | `sent`, `delivered`, `opened`, `clicked`, `booked`, `bounced` |
| metadata | JSONB | Channel-specific data (messageId, etc.) |
| createdAt | timestamp | |

### 2.5 `promo_codes`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| hospitalId | FK → hospitals | |
| flowId | FK → flows | Nullable (can exist independently) |
| code | text | Unique per hospital, uppercase |
| discountType | enum | `percent`, `fixed` |
| discountValue | numeric | Amount (e.g., 20 for 20%, or 500 for CHF 500) |
| description | text | Human-readable (e.g., "Frühlings-Angebot 20%") |
| validFrom | date | |
| validUntil | date | |
| maxUses | integer | Nullable = unlimited |
| usedCount | integer | Default 0, incremented on booking |
| createdBy | FK → users | |
| createdAt | timestamp | |

---

## 3. Page Structure

### 3.1 Entry Point

- **Route:** `/business/flows`
- **BottomNav:** New entry after "Marketing" in the business module, icon `fas fa-paper-plane`, label "Flows"
- **Lazy-loaded** page component at `client/src/pages/business/Flows.tsx`

### 3.2 Landing View

**Dashboard cards** (top row, dummy data for POC):
- Campaigns sent this month (e.g., "12")
- Recipients reached (e.g., "384")
- Avg. open rate (e.g., "34%")
- Bookings from campaigns (e.g., "28")

**Campaign list** (below, real data):
- Table columns: Name, Status (badge), Channel, Recipients, Sent date, Open rate, Bookings
- Open rate and bookings show dummy "—" for POC (real tracking is Phase 2)
- "Neue Kampagne" button → opens campaign creator
- Empty state with illustration and CTA on first visit

### 3.3 Campaign Creator

Opens as a full-page view (navigate to `/business/flows/new`, back button returns to list).

5 collapsible sections using `BookingSection` pattern from `/book`:
- Sections progress top-to-bottom
- Completed sections collapse to summary with "Ändern" link
- Active section is expanded

---

## 4. Section Details

### 4.1 Segment Builder

**Active state:** Rule builder with stackable AND conditions.

Each rule row has 3 dropdowns:
- **Field:** Geschlecht, Behandlung, Letzter Termin, Terminstatus
- **Operator:** ist, ist nicht, war, vor mehr als, vor weniger als
- **Value:** depends on field (M/F/O for gender, service list for treatment, N months/weeks for timeframe, status enum for appointment status)

Field-specific value types:
- `Geschlecht` → select: Männlich, Weiblich, Andere
- `Behandlung` → select from `clinicServices` for the hospital
- `Letzter Termin` → number input + unit select (Tage, Wochen, Monate)
- `Terminstatus` → select: Abgeschlossen, Abgesagt, No-Show

"+ Regel hinzufügen" button adds a new AND row. Each row has a delete button.

**Live patient count:** Debounced API call after filter changes, shows "→ 47 Patienten" badge.

**Summary state:** "Weiblich · Fettabsaugung · 3+ Monate her → 47 Patienten"

**API endpoint:** `POST /api/business/:hospitalId/flows/segment-count`
- Body: `{ filters: [...rules] }`
- Returns: `{ count: number, samplePatients: Array<{id, firstName, surname}> }`
- Query joins `patients` ↔ `clinicAppointments` ↔ `clinicServices`

### 4.2 Channel Selection

**Active state:** 3 cards, pick one:
- **SMS** — icon: message bubble, subtitle: "Kurznachricht (160 Zeichen)"
- **Email** — icon: envelope, subtitle: "Einfache Text-Email"
- **HTML Email** — icon: newspaper, subtitle: "Newsletter mit Design"

**Summary state:** Channel name + icon

### 4.3 Message Composer

**Two sub-tabs** toggled at the top of the section:

#### Tab: "AI Chat"
Split view layout (reuse pattern from Website Editor):
- **Left panel (40%):** Chat interface. User describes the message they want. AI generates it.
- **Right panel (60%):** Live preview.
  - SMS: styled phone/text bubble mockup
  - Email: simple email layout (subject + body)
  - HTML Email: rendered HTML in iframe (instant, no deploy needed)

AI system prompt includes:
- The selected channel + constraints (SMS: 160 chars, etc.)
- The segment context (who the recipients are, what treatment, timeframe)
- Hospital info (name, address, booking URL)
- Promo code if attached
- Template variables available: `{{vorname}}`, `{{nachname}}`, `{{behandlung}}`, `{{buchungslink}}`

AI returns the message content directly. For HTML email, returns full HTML. Server endpoint: `POST /api/business/:hospitalId/flows/compose` — calls Anthropic API (Claude for HTML, Mistral for SMS/plain email — or Claude for all).

#### Tab: "Editor"
- SMS: simple `<textarea>` with character count
- Email: subject `<input>` + Tiptap editor for body
- HTML Email: Tiptap editor (loaded with AI output HTML). Tiptap's `getHTML()` = the email content.

Switching from "AI Chat" to "Editor" loads the latest AI output into the editor. Switching back preserves the editor content.

**Summary state:** First ~60 chars of the message + channel icon

### 4.4 Offer (Optional)

Collapsed by default with "+" expand button.

**Active state:**
- Toggle: "Create new" vs "Select existing"
- **Create new:** code input (auto-generated or manual), discount type (% or CHF), value, description, valid from/until date pickers
- **Select existing:** dropdown of hospital's promo codes
- Preview: "Buchungslink: viali.app/book/TOKEN?service=liposuction&promo=SPRING25"

**Summary state:** "SPRING25 — 20% Rabatt, gültig bis 30.06.2026"

Code auto-generated as uppercase 8-char alphanumeric if user doesn't type one.

### 4.5 Review & Send

Always visible at the bottom (not collapsible).

**Content:**
- Summary line: "47 Patienten · HTML Email · Frühlings-Angebot"
- Expandable preview of the final message
- "Kampagne senden" button (purple, prominent)
- Confirmation dialog: "Sind Sie sicher? 47 Patienten werden eine HTML Email erhalten." with Cancel/Senden buttons.

---

## 5. Sending

### 5.1 Execution

On send:
1. Update flow status to `sending`
2. Query segment to get final patient list
3. Create `flow_executions` row per patient (status: `pending`)
4. For each patient:
   a. Replace template variables (`{{vorname}}` etc.)
   b. Generate booking link with service + promo params
   c. Send via channel:
      - SMS: `sendSms()` from `server/sms.ts`
      - Email/HTML Email: Resend via `server/email.ts` (new function for campaign emails)
   d. Create `flow_events` row (type: `sent`)
   e. Log to `patientMessages` table
   f. Update execution status to `completed`
5. Update flow status to `sent`, set `sentAt`

### 5.2 Rate limiting

Process sends sequentially with small delay (100ms) to avoid provider rate limits. For POC this is fine. Future: background job queue.

### 5.3 Error handling

If a send fails for a patient, log error to `flow_events` (type: `bounced`), continue with next patient. Mark execution as `failed`. After all sends, update flow status to `sent` (partial failures are acceptable).

---

## 6. Booking Page Changes

### 6.1 Promo Code Support

- New optional query param: `?promo=CODE`
- On booking page load, if `promo` param present:
  - Validate against `promo_codes` table (exists, not expired, not over maxUses, correct hospital)
  - If valid: show discount banner at top: "Ihr Rabattcode: SPRING25 — 20% auf Fettabsaugung"
  - If invalid/expired: silently ignore (no error shown)
- On booking creation: increment `usedCount` on the promo code
- Store promo code reference on the appointment or in referral event metadata

### 6.2 API

- `GET /api/public/booking/:token/promo/:code` — validate promo code, return discount info
- Booking creation endpoint updated to accept optional `promoCode` field

---

## 7. API Endpoints Summary

### Flows CRUD
- `GET /api/business/:hospitalId/flows` — list campaigns
- `POST /api/business/:hospitalId/flows` — create draft campaign
- `GET /api/business/:hospitalId/flows/:flowId` — get campaign detail
- `PATCH /api/business/:hospitalId/flows/:flowId` — update draft
- `DELETE /api/business/:hospitalId/flows/:flowId` — delete draft
- `POST /api/business/:hospitalId/flows/:flowId/send` — execute campaign

### Segment
- `POST /api/business/:hospitalId/flows/segment-count` — query patient count + sample

### Compose
- `POST /api/business/:hospitalId/flows/compose` — AI message generation

### Promo Codes
- `GET /api/business/:hospitalId/promo-codes` — list
- `POST /api/business/:hospitalId/promo-codes` — create
- `DELETE /api/business/:hospitalId/promo-codes/:id` — delete

### Public (booking page)
- `GET /api/public/booking/:token/promo/:code` — validate promo code

---

## 8. Real vs Dummy (POC)

| Component | Real | Dummy |
|-----------|------|-------|
| Dashboard cards (4 metrics) | | Hardcoded numbers |
| Campaign list + CRUD | Real (DB) | |
| Segment builder + live count | Real (query) | |
| Channel selection | Real | |
| AI message generation | Real (Claude/Mistral API) | |
| Tiptap editor | Real | |
| HTML email preview | Real (rendered in iframe) | |
| Promo code CRUD | Real (DB) | |
| Promo code on booking page | Real (validation + banner) | |
| SMS sending | Real (Vonage/ASPSMS) | |
| Email sending | Real (Resend) | |
| Campaign list status | Real | |
| Open/click/booking tracking | | Dummy "—" in table |
| WhatsApp | Not in POC | |

---

## 9. Files to Create/Modify

### New files
- `shared/schema.ts` — add `flows`, `flowSteps`, `flowExecutions`, `flowEvents`, `promoCodes` tables
- `server/routes/flows.ts` — all Flows API endpoints
- `client/src/pages/business/Flows.tsx` — landing page (dashboard + list)
- `client/src/pages/business/FlowCreate.tsx` — campaign creator (5 sections)
- `client/src/components/flows/SegmentBuilder.tsx` — rule builder component
- `client/src/components/flows/ChannelPicker.tsx` — channel selection cards
- `client/src/components/flows/MessageComposer.tsx` — AI chat + editor tabs + preview
- `client/src/components/flows/OfferSection.tsx` — promo code create/select
- `client/src/components/flows/ReviewSend.tsx` — summary + send button
- `client/src/components/flows/FlowDashboard.tsx` — dummy metric cards
- `client/src/components/flows/FlowList.tsx` — campaign table

### Modified files
- `server/routes/index.ts` — register flows router
- `client/src/App.tsx` — add route `/business/flows`, `/business/flows/new`
- `client/src/components/BottomNav.tsx` — add Flows nav item
- `client/src/pages/BookAppointment.tsx` — promo code param handling + banner
- `server/routes/clinic.ts` — promo code validation endpoint, booking creation update
- Migration file — new tables

---

## 10. Tech Decisions

- **AI model for compose:** Claude Sonnet for HTML email (better structured output), Mistral for SMS/plain email (fast, cheap). Fallback: Claude for everything.
- **Segment query:** Server-side SQL join across `patients`, `clinicAppointments`, `clinicServices`. Indexed on hospitalId + appointmentDate + serviceId.
- **HTML email preview:** Render AI output directly in an iframe via `srcdoc` attribute. Instant, no build step.
- **Template variables:** Simple string replacement server-side before send. Variables: `{{vorname}}`, `{{nachname}}`, `{{behandlung}}`, `{{buchungslink}}`.
- **Booking link format:** `https://{hospitalDomain}/book/{bookingToken}?service={serviceCode}&promo={promoCode}`
- **Campaign sending:** Synchronous loop with 100ms delay. Adequate for POC volumes (<500 recipients). Future: background job queue.
