# Booking Page Service Selector — Design Spec

## Goal

Allow patients to select a treatment/service when booking, so appointments are created with the correct service and matched to a provider who offers it. Configurable per hospital — clinics that don't need service selection keep the current frictionless flow.

## Problem

1. **With `?service=CODE`**: If no service-specific providers have slots, the system silently falls back to ANY provider — potentially one who doesn't offer that service.
2. **Without `?service=CODE`**: Patient can't indicate what they need. Gets matched to whichever doctor has the earliest slot, regardless of specialization.

## Solution

### Hospital-Level Setting

Add `bookingRequiresServiceSelection` (boolean, default `false`) to `bookingSettings` JSONB on the `hospitals` table. No schema migration needed — it's a new key in the existing JSONB field.

- **`false` (default):** Current behavior. No service dropdown. Auto-pick first available provider across all bookable doctors. Zero friction change for existing clinics.
- **`true`:** Service dropdown shown. Patient must select a service (or it's pre-selected via `?service=CODE`). Provider matching is constrained to that service's linked providers.

### Booking Flow When `bookingRequiresServiceSelection = true`

**Step-by-step:**

1. Page loads → `GET /api/public/booking/:token` returns hospital info, providers, **and now also `bookableServices`** (services linked to at least one bookable provider) + `bookingRequiresServiceSelection` flag.

2. **If `?service=CODE` in URL:** Pre-select that service in the dropdown. Proceed to find best provider for it.

3. **If no `?service=CODE`:** Show service dropdown before the provider/datetime steps. Patient picks a service.

4. Once service selected → call `best-provider` with `?service=CODE` → returns best provider **only among providers linked to that service**. No fallback to unrelated providers.

5. **If no providers have availability for chosen service:** Show a message: _"No availability for [Service Name] in the next 3 months."_ with a button: _"Book a general consultation instead"_. This clears the service filter and falls back to any available provider (explicit user choice, not silent).

6. **Notes field becomes optional** when a service is selected. The service already explains the reason for the visit. Notes remain available for additional context but are not required.

7. Appointment is created with `serviceId` saved (already supported in the POST body and `clinicAppointments` table).

### Booking Flow When `bookingRequiresServiceSelection = false`

No change from current behavior. Service dropdown is not shown. Provider auto-selected by earliest slot. Notes field remains required.

## API Changes

### Modified: `GET /api/public/booking/:bookingToken`

Add to response:

```json
{
  "bookableServices": [
    {
      "id": "uuid",
      "name": "Brustvergrösserung",
      "description": "Breast augmentation with silicone implants",
      "code": "BREAST-AUG",
      "durationMinutes": 30
    }
  ],
  "bookingRequiresServiceSelection": true
}
```

**Query logic:** Select all `clinicServices` for this hospital where the service has at least one entry in `clinicServiceProviders` linking it to a provider who is `isBookable=true` AND `publicCalendarEnabled=true`. Order by `sortOrder`, then `name`.

### Modified: `GET /api/public/booking/:bookingToken/best-provider`

**Fix the fallback logic.** When `?service=CODE` is provided:

- Current (broken): If no service-specific providers have slots → fall through to ALL providers.
- New: If no service-specific providers have slots → return `{ provider: null, service: { ... }, noAvailability: true }`. **Never silently fall through** to unrelated providers.

The client handles the "no availability" case by showing the message + "general consultation" button.

When called **without** `?service` param: behavior unchanged (search all providers).

### Modified: `POST /api/public/booking/:bookingToken/book`

**Make `notes` conditionally optional.** Current schema requires `notes: z.string().min(1)`. Change to:

```typescript
notes: z.string().max(1000).optional().or(z.literal(""))
```

When `serviceId` is provided and `bookingRequiresServiceSelection` is true, `notes` can be empty. When no `serviceId` and `bookingRequiresServiceSelection` is false, `notes` remains required (validated in route handler logic, not just zod — so we can give a clear error message).

## UI Changes

### BookAppointment.tsx

**Service dropdown placement:** Between the phone input field and the notes textarea.

**Dropdown component:** Use an HTML `<select>` styled consistently with the existing form fields (the booking page uses plain HTML form elements, not shadcn — it's a public page with minimal dependencies).

**Dropdown behavior:**
- Label: "Behandlung auswählen" / "Select treatment" (respecting hospital language)
- Options: `bookableServices` from the initial API response
- If `?service=CODE` matches a service → pre-selected, dropdown still visible for changing
- If `?service=CODE` does NOT match → dropdown shown with no selection, placeholder: "Bitte wählen..." / "Please select..."
- On selection change → re-trigger `best-provider` call with the selected service code → update provider + available dates/times

**Notes field when service selected:**
- Remove `required` attribute
- Change label from "Grund der Terminanfrage *" to "Zusätzliche Bemerkungen (optional)" / "Additional notes (optional)"
- Do NOT auto-fill notes with service name anymore (the service is saved via `serviceId`, no need to duplicate in notes)

**"No availability" state:**
- Shown when `best-provider` returns `provider: null` for the selected service
- Message: "Für [Service Name] sind in den nächsten 3 Monaten leider keine Termine verfügbar."
- Button: "Allgemeine Konsultation buchen" / "Book a general consultation"
- Button click: clears selected service, calls `best-provider` without service filter

### Admin Settings

Add a toggle in the hospital booking settings (wherever `bookingSettings` is currently configured in the admin UI):
- Label: "Behandlungsauswahl bei Terminbuchung anzeigen" / "Show treatment selection on booking page"
- Toggle for `bookingRequiresServiceSelection`

## Data Flow

```
Patient visits /book/:token[?service=CODE]
  ↓
GET /api/public/booking/:token
  → Returns providers, bookableServices, bookingRequiresServiceSelection
  ↓
bookingRequiresServiceSelection = true?
  ├─ YES → Show service dropdown (pre-selected if ?service=CODE)
  │         ↓
  │       Patient selects service
  │         ↓
  │       GET /best-provider?service=CODE
  │         ├─ Provider found → proceed to datetime → details (notes optional)
  │         └─ No provider → "No availability" + "General consultation" button
  │                            ↓
  │                          Patient clicks fallback → clears service → GET /best-provider (all)
  │
  └─ NO → Current flow (auto-pick first available, notes required)
  ↓
POST /book { ...fields, serviceId, notes }
  → Appointment created with serviceId
```

## What's NOT in Scope

- Service-first card layout (services as visual cards instead of doctors) — deferred
- Multi-clinic booking page — deferred
- Availability-aware service list (checking if services have slots before showing them) — deferred, empty calendar is self-explanatory
- Price display on service dropdown — could add later but not needed now
