# No-Show Reduction Feature — Design Spec

## Problem

High no-show rates for clinic appointments. Current reminders (day-before at 2 PM, morning at 8 AM) both include manage/cancel/reschedule links but don't communicate consequences of no-shows.

## Solution

A four-part strategy to reduce no-shows:

1. Configurable no-show fee message per hospital (single text field, acts as feature toggle)
2. Mandatory acknowledgment checkbox during online booking
3. 24h reminder restructured: cancel-only link + fee notice (last chance)
4. Morning reminder stripped to info-only (no action links, no fee text)
5. Remove reschedule from manage-appointment page entirely

## Design

### 1. Hospital Settings — `noShowFeeMessage` Field

**Schema change:** Add `noShowFeeMessage` (text, nullable) to the `hospitals` table.

- **`null` / empty** = feature is off — no checkbox at booking, no fee text in reminders
- **Populated** = feature is on — enables booking checkbox + 24h reminder fee insert

No separate boolean toggle needed. The presence of the message IS the toggle.

**Default text** (pre-filled in the admin UI, based on hospital's language setting):

- **DE:** "Bitte beachten Sie, dass Termine, die nicht mindestens 24 Stunden im Voraus abgesagt werden, mit CHF 150 in Rechnung gestellt werden können."
- **EN:** "Please note that appointments not cancelled at least 24 hours in advance may be subject to a CHF 150 fee."

The clinic can freely edit the text (change the amount, the wording, etc.).

**Admin UI:** Add a text area in the Settings tab, in the appointment settings section (near the existing "Appointment Reminder" toggle). Label: "No-Show Fee Notice" with a description explaining that filling in the field enables the feature at booking and in reminders.

**Edge case:** If a hospital has `noShowFeeMessage` set but `appointmentReminderDisabled = true`, the booking checkbox will still show but no reminders are sent. The admin UI should show a warning in this case (e.g. "Note: appointment reminders are currently disabled — the fee notice will only appear during booking, not in reminders").

### 2. Online Booking — Acknowledgment Checkbox

**Where:** `BookAppointment.tsx`, details step, after the existing privacy checkbox and before the submit button.

**Behavior:**
- Only rendered when the hospital's `noShowFeeMessage` is non-empty
- Mandatory — submit button disabled until checked (same pattern as `privacyAccepted`)
- Checkbox label = the hospital's `noShowFeeMessage` text
- New state: `noShowFeeAcknowledged` (boolean, default false)

**Server-side:** Store `noShowFeeAcknowledgedAt` (timestamp, nullable) on the `clinic_appointments` table. Set when the booking is created with the acknowledgment. This provides an audit trail if a clinic needs to prove the patient accepted the fee policy.

**Data flow:** The `noShowFeeMessage` must be included in the public booking API response. The booking endpoint (`server/routes/clinic.ts`, public booking info route) already returns a curated hospital object — add `noShowFeeMessage` to it. The `BookingData` type in `BookAppointment.tsx` must be updated to include this field.

**Language note:** The booking page currently renders German text regardless of hospital language. The no-show checkbox will display whatever text the clinic saved in `noShowFeeMessage`, so it naturally uses the clinic's chosen language. No additional i18n needed.

### 3. 24h Reminder (Day Before) — Cancel Only + Fee Notice

**Changes to `processAppointmentReminder()` in `server/worker.ts`:**

- **SMS:** Replace "Verwalten/Absagen" (Manage/Cancel) with just "Absagen" (Cancel). The URL still points to `/manage-appointment/{token}` (route path unchanged to avoid breaking outstanding tokens), but that page now only shows the cancel option.
- **Append fee message:** If `hospital.noShowFeeMessage` is non-empty, append it after the cancel link.
- **Email:** Same changes — cancel-only button label, add fee notice text below the button.

**Email function:** The existing `sendAppointmentReminderEmail()` in `server/resend.ts` is shared by both reminders. Add a `mode` parameter: `'cancel-only' | 'info-only'`.
- `cancel-only`: renders cancel button + optional fee text (for 24h reminder)
- `info-only`: no buttons, no fee text (for morning reminder)

**SMS template (DE):**
```
Erinnerung: Ihr Termin bei {hospital} am {date} um {time}. Absagen: {cancelUrl}
{noShowFeeMessage}
```

**SMS template (EN):**
```
Reminder: Your appointment at {hospital} on {date} at {time}. Cancel: {cancelUrl}
{noShowFeeMessage}
```

The fee message line is omitted entirely when `noShowFeeMessage` is empty.

**Note on SMS length:** Appending the fee message may push SMS beyond 160 chars (2 segments). The admin UI description should mention that long messages increase SMS costs.

### 4. Morning Reminder (Day Of) — Info Only

**Changes to `processMorningAppointmentReminder()` in `server/worker.ts`:**

- **Remove ALL action links** — no cancel URL, no manage URL
- **No fee text** — just appointment time/location
- **Remove action token generation** — the existing token lookup/creation block (checking for existing cancel tokens or creating new ones) becomes dead code and should be removed
- **Email:** Use `sendAppointmentReminderEmail()` with `mode: 'info-only'` — no buttons, no links

**SMS template (DE):**
```
Erinnerung: Ihr Termin heute bei {hospital} um {time}.
```

**SMS template (EN):**
```
Reminder: Your appointment today at {hospital} at {time}.
```

### 5. Manage Appointment Page — Remove Reschedule

**Changes to `ManageAppointment.tsx`:**

- Remove the reschedule button (lines 228-239) and `handleReschedule()` function entirely
- Only the cancel button remains
- This applies to ALL clinics (not gated by the fee message setting)
- The page title/description should reflect cancel-only: "Cancel Appointment" instead of "Manage Appointment"
- **Keep the post-cancel "Book a new appointment" link** (lines 182-189) — this appears after a successful cancellation and is a natural UX for patients who want to rebook
- **Route path stays as `/manage-appointment/:token`** — do NOT rename to avoid breaking previously sent reminder links

## Files to Modify

| File | Change |
|------|--------|
| `shared/schema.ts` | Add `noShowFeeMessage` to hospitals table, `noShowFeeAcknowledgedAt` to clinic_appointments |
| `migrations/XXXX.sql` | Add column migrations (idempotent) |
| `client/src/pages/admin/Settings.tsx` | Add text area for no-show fee message + warning when reminders disabled |
| `client/src/pages/BookAppointment.tsx` | Add acknowledgment checkbox, update `BookingData` type |
| `server/worker.ts` | Modify both reminder functions, remove morning token generation |
| `server/resend.ts` | Add `mode` parameter to `sendAppointmentReminderEmail()` |
| `client/src/pages/ManageAppointment.tsx` | Remove reschedule button, keep post-cancel rebooking link |
| `server/routes/clinic.ts` | Include `noShowFeeMessage` in public booking API response |

## Out of Scope

- Actual fee charging / billing integration
- No-show tracking or reporting
- Different fee messages per appointment type
- Automated follow-up for no-shows
