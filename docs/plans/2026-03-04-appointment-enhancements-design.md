# Appointment Booking Enhancements — Design

**Date:** 2026-03-04

## Goal

Enhance the external appointment booking flow with inline patient creation, automatic SMS/email notifications on creation/reschedule, and a reschedule confirmation dialog.

## Bug Fixes (included)

1. **Slot validation** — DONE. Merged overlapping slots into continuous ranges.
2. **providerId dropped on drag** — Add `providerId` to `updateAppointmentSchema`.

## Feature 1: Inline Patient Creation

Replicate the pattern from `QuickCreateSurgeryDialog.tsx` into `BookingDialog` (Appointments.tsx):
- UserPlus button next to patient search input
- Inline bordered card with: First Name, Surname, DOB (flexible parser), Phone
- POST /api/patients, auto-select on success
- Reuse same translation keys from `anesthesia.quickSchedule.*`

## Feature 2: Auto SMS/Email on Appointment Creation

- Server-side, after `storage.createClinicAppointment()` in POST endpoint
- Async (non-blocking), same pattern as Cal.com sync
- Fetch patient phone/email, fetch hospital settings
- SMS first (via Vonage `sendSms()`), email fallback if no phone
- Bilingual message using `hospital.defaultLanguage`
- Date/time formatted per hospital timezone + dateFormat + hourFormat
- Log to `patient_messages` table (`messageType: 'appointment_confirmation'`, `isAutomatic: true`)

## Feature 3: Reschedule Confirmation Dialog + Notification

- On drag-drop/resize in ClinicCalendar: show confirmation dialog instead of immediate mutate
- Dialog shows: "Reschedule to [date] [time]? A notification will be sent to the patient."
- Buttons: "Reschedule & Notify" / "Cancel"
- Server-side PATCH: detect time/date change, send reschedule SMS/email
- Same SMS-first, email-fallback logic

## SMS/Email Message Templates

**Confirmation (DE):** Ihr Termin bei {clinic} am {date} um {time} wurde bestätigt. Bei Fragen kontaktieren Sie uns bitte direkt.
**Confirmation (EN):** Your appointment at {clinic} on {date} at {time} has been confirmed. For questions, please contact us directly.

**Reschedule (DE):** Ihr Termin bei {clinic} wurde verschoben auf {date} um {time}. Bei Fragen kontaktieren Sie uns bitte direkt.
**Reschedule (EN):** Your appointment at {clinic} has been rescheduled to {date} at {time}. For questions, please contact us directly.
