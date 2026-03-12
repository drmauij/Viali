# Manage Appointment (Cancel/Reschedule) + Reminder Improvements

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the cancel-only appointment page with a manage page (cancel OR reschedule), shift first reminder to 14:00–15:00, add morning-of second reminder.

**Architecture:** Extend the existing token-based cancel flow to a manage-appointment page. Reschedule = cancel old + redirect to booking page with pre-filled patient data. Add `morningReminderSent` column for the second reminder. Update SMS/email templates to link to manage page instead of cancel.

**Tech Stack:** React (frontend), Express (backend), Drizzle ORM (DB), Resend (email), ASPSMS/Vonage (SMS)

---

### Task 1: Add `morningReminderSent` column to schema

**Files:**
- Modify: `shared/schema.ts:4312-4314`

**Step 1: Add column to schema**

In `shared/schema.ts`, in the `clinicAppointments` table definition, after `reminderSentAt` (line 4314), add:

```typescript
  // Reminders
  reminderSent: boolean("reminder_sent").default(false),
  reminderSentAt: timestamp("reminder_sent_at"),
  morningReminderSent: boolean("morning_reminder_sent").default(false),
  morningReminderSentAt: timestamp("morning_reminder_sent_at"),
```

**Step 2: Generate migration**

Run: `npm run db:generate`

**Step 3: Make migration idempotent**

Open the generated migration file in `migrations/`. Convert to idempotent SQL:

```sql
ALTER TABLE "clinic_appointments" ADD COLUMN IF NOT EXISTS "morning_reminder_sent" boolean DEFAULT false;
ALTER TABLE "clinic_appointments" ADD COLUMN IF NOT EXISTS "morning_reminder_sent_at" timestamp;
```

**Step 4: Run migration**

Run: `npm run db:migrate`

**Step 5: Verify TypeScript compiles**

Run: `npm run check`

**Step 6: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat: add morningReminderSent column for same-day appointment reminders"
```

---

### Task 2: Create ManageAppointment page (frontend)

**Files:**
- Create: `client/src/pages/ManageAppointment.tsx`
- Modify: `client/src/App.tsx:173`

**Step 1: Create ManageAppointment.tsx**

This page replaces CancelAppointment. It fetches appointment info via the existing cancel-info endpoint (which we'll extend in Task 3), then shows two options: Cancel or Reschedule.

```tsx
import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AppointmentInfo = {
  appointmentDate: string;
  appointmentTime: string;
  clinicName: string;
  patientName: string;
  status: string;
  language: string;
  bookingToken: string | null;
  providerId: string | null;
  patientFirstName: string;
  patientSurname: string;
  patientEmail: string | null;
  patientPhone: string | null;
};

type CancelResult = {
  success: boolean;
  appointment: { date: string; time: string; clinicName: string };
};

export default function ManageAppointment() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<AppointmentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelResult, setCancelResult] = useState<CancelResult | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/clinic/appointments/cancel-info/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.alreadyUsed) setError("already_used");
          else if (data.expired) setError("expired");
          else setError("not_found");
          return;
        }
        const data = await res.json();
        if (data.status === "cancelled") {
          setError("already_cancelled");
        } else {
          setInfo(data);
        }
      })
      .catch(() => setError("network"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCancel = async () => {
    if (!token) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/clinic/appointments/cancel-by-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "cancel_failed");
        return;
      }
      const data: CancelResult = await res.json();
      setCancelResult(data);
      setCancelled(true);
    } catch {
      setError("network");
    } finally {
      setCancelling(false);
    }
  };

  const handleReschedule = () => {
    if (!info?.bookingToken) return;
    // Cancel old appointment first, then redirect to booking page
    if (!token) return;
    setCancelling(true);
    fetch("/api/clinic/appointments/cancel-by-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, reason: "Rescheduled by patient" }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message || "cancel_failed");
          return;
        }
        // Build booking URL with pre-filled patient data
        const params = new URLSearchParams();
        if (info.providerId) params.set("provider", info.providerId);
        if (info.patientFirstName) params.set("firstName", info.patientFirstName);
        if (info.patientSurname) params.set("surname", info.patientSurname);
        if (info.patientEmail) params.set("email", info.patientEmail);
        if (info.patientPhone) params.set("phone", info.patientPhone);
        params.set("reschedule", "true");
        window.location.href = `/book/${info.bookingToken}?${params.toString()}`;
      })
      .catch(() => setError("network"))
      .finally(() => setCancelling(false));
  };

  const isGerman = info?.language === "de";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (error) {
    const messages: Record<string, { de: string; en: string }> = {
      already_used: {
        de: "Dieser Link wurde bereits verwendet.",
        en: "This link has already been used.",
      },
      expired: {
        de: "Dieser Link ist abgelaufen.",
        en: "This link has expired.",
      },
      already_cancelled: {
        de: "Dieser Termin wurde bereits abgesagt.",
        en: "This appointment has already been cancelled.",
      },
      not_found: {
        de: "Termin nicht gefunden.",
        en: "Appointment not found.",
      },
      network: {
        de: "Verbindungsfehler. Bitte versuchen Sie es erneut.",
        en: "Connection error. Please try again.",
      },
    };
    const msg = messages[error] || messages.not_found;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="text-4xl mb-4">
              {error === "already_cancelled" || error === "already_used" ? "✓" : "⚠"}
            </div>
            <p className="text-lg text-gray-700">{msg.de}</p>
            <p className="text-sm text-gray-500 mt-1">{msg.en}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (cancelled && cancelResult) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="text-4xl mb-4">✓</div>
            <h2 className="text-xl font-semibold mb-2">
              {isGerman ? "Termin abgesagt" : "Appointment Cancelled"}
            </h2>
            <p className="text-gray-600">
              {isGerman
                ? `Ihr Termin bei ${cancelResult.appointment.clinicName} am ${cancelResult.appointment.date} um ${cancelResult.appointment.time} wurde erfolgreich abgesagt.`
                : `Your appointment at ${cancelResult.appointment.clinicName} on ${cancelResult.appointment.date} at ${cancelResult.appointment.time} has been successfully cancelled.`}
            </p>
            {info?.bookingToken && (
              <a
                href={`/book/${info.bookingToken}${info.providerId ? `?provider=${info.providerId}` : ""}`}
                className="inline-block mt-4 text-blue-600 hover:text-blue-800 underline"
              >
                {isGerman ? "Neuen Termin buchen" : "Book a new appointment"}
              </a>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {isGerman ? "Ihren Termin verwalten" : "Manage Your Appointment"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-100 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">{isGerman ? "Klinik" : "Clinic"}</span>
              <span className="font-medium">{info.clinicName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{isGerman ? "Datum" : "Date"}</span>
              <span className="font-medium">{info.appointmentDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{isGerman ? "Uhrzeit" : "Time"}</span>
              <span className="font-medium">{info.appointmentTime}</span>
            </div>
          </div>

          <p className="text-center text-gray-600 text-sm">
            {isGerman
              ? "Was möchten Sie mit diesem Termin tun?"
              : "What would you like to do with this appointment?"}
          </p>

          <div className="space-y-3">
            {info.bookingToken && (
              <Button
                className="w-full"
                onClick={handleReschedule}
                disabled={cancelling}
              >
                {cancelling
                  ? (isGerman ? "Wird bearbeitet..." : "Processing...")
                  : (isGerman ? "Termin verschieben" : "Reschedule Appointment")}
              </Button>
            )}

            <Button
              variant="destructive"
              className="w-full"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling
                ? (isGerman ? "Wird abgesagt..." : "Cancelling...")
                : (isGerman ? "Termin absagen" : "Cancel Appointment")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Update App.tsx routes**

In `client/src/App.tsx`, add the ManageAppointment route and make CancelAppointment redirect to it. At the top, add the import:

```typescript
import ManageAppointment from "@/pages/ManageAppointment";
```

Replace the cancel-appointment route (line 173) with:

```tsx
<Route path="/manage-appointment/:token" component={ManageAppointment} />
<Route path="/cancel-appointment/:token" component={ManageAppointment} />
```

This keeps backward compatibility — old cancel links still work, they just show the manage page now.

**Step 3: Verify it compiles**

Run: `npm run check`

**Step 4: Commit**

```bash
git add client/src/pages/ManageAppointment.tsx client/src/App.tsx
git commit -m "feat: add manage-appointment page with cancel and reschedule options"
```

---

### Task 3: Extend cancel-info API to return booking/patient data

**Files:**
- Modify: `server/routes/clinic.ts:54-96`

**Step 1: Update cancel-info endpoint response**

In `server/routes/clinic.ts`, modify the `GET /api/clinic/appointments/cancel-info/:token` handler. Update the response (around line 84) to include booking token, provider, and patient data:

```typescript
    res.json({
      appointmentDate: formattedDate,
      appointmentTime: appointment.startTime,
      clinicName: hospital.name,
      patientName: appointment.patient?.firstName || '',
      status: appointment.status,
      language: lang,
      // New fields for manage-appointment page
      bookingToken: hospital.bookingToken || null,
      providerId: appointment.providerId || null,
      patientFirstName: appointment.patient?.firstName || '',
      patientSurname: appointment.patient?.surname || '',
      patientEmail: appointment.patient?.email || null,
      patientPhone: appointment.patient?.phone || null,
    });
```

**Step 2: Update cancel-by-token to accept custom reason**

In `server/routes/clinic.ts`, in the `POST /api/clinic/appointments/cancel-by-token` handler (line 130), change the cancellation reason to use the request body if provided:

```typescript
    // Cancel the appointment
    const reason = req.body.reason || 'Cancelled by patient';
    await storage.updateClinicAppointment(appointment.id, {
      status: 'cancelled',
      cancellationReason: reason,
    });
```

**Step 3: Verify it compiles**

Run: `npm run check`

**Step 4: Commit**

```bash
git add server/routes/clinic.ts
git commit -m "feat: extend cancel-info API with booking token and patient data for reschedule flow"
```

---

### Task 4: Pre-fill booking page from query params

**Files:**
- Modify: `client/src/pages/BookAppointment.tsx:44-71`

**Step 1: Read query params and initialize form state**

In `BookAppointment.tsx`, after the existing `searchParams` lines (line 47), extract additional params:

```typescript
  const preselectedProviderId = searchParams.get("provider");
  const prefillFirstName = searchParams.get("firstName");
  const prefillSurname = searchParams.get("surname");
  const prefillEmail = searchParams.get("email");
  const prefillPhone = searchParams.get("phone");
  const isReschedule = searchParams.get("reschedule") === "true";
```

Then update the form state initializers (lines 66-69) to use prefill values:

```typescript
  const [firstName, setFirstName] = useState(prefillFirstName || "");
  const [surname, setSurname] = useState(prefillSurname || "");
  const [email, setEmail] = useState(prefillEmail || "");
  const [phone, setPhone] = useState(prefillPhone || "");
```

**Step 2: Verify it compiles**

Run: `npm run check`

**Step 3: Commit**

```bash
git add client/src/pages/BookAppointment.tsx
git commit -m "feat: support pre-filling booking form via query params for reschedule flow"
```

---

### Task 5: Shift first reminder to 14:00–15:00

**Files:**
- Modify: `server/worker.ts:2301-2312`

**Step 1: Update the time window**

In `server/worker.ts`, change the reminder window constants (around line 2307):

```typescript
  const reminderWindowStart = 14 * 60;       // 2:00pm
  const reminderWindowEnd = 15 * 60;         // 3:00pm
```

Also update the log message (line 2311):

```typescript
    logger.info(`[Worker] Skipping appointment reminder - current time ${currentHour}:${currentMinute.toString().padStart(2, '0')} (${tz}) is outside window (14:00-15:00)`);
```

**Step 2: Verify it compiles**

Run: `npm run check`

**Step 3: Commit**

```bash
git add server/worker.ts
git commit -m "feat: shift appointment reminder window from 17:30-18:30 to 14:00-15:00"
```

---

### Task 6: Add morning-of reminder

**Files:**
- Modify: `server/worker.ts` (near processAppointmentReminder and scheduleAppointmentReminderJobs)
- Modify: `server/storage/clinic.ts` (add getAppointmentsForMorningReminder + markMorningReminderSent)

**Step 1: Add storage functions**

In `server/storage/clinic.ts`, after `getAppointmentsForReminder` (around line 2137), add:

```typescript
export async function getAppointmentsForMorningReminder(hospitalId: string, date: string): Promise<Array<{
  appointmentId: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientEmail: string | null;
  patientPhone: string | null;
  appointmentDate: string;
  startTime: string;
  unitId: string;
}>> {
  const results = await db
    .select({
      appointmentId: clinicAppointments.id,
      patientId: clinicAppointments.patientId,
      patientFirstName: patients.firstName,
      patientLastName: patients.surname,
      patientEmail: patients.email,
      patientPhone: patients.phone,
      appointmentDate: clinicAppointments.appointmentDate,
      startTime: clinicAppointments.startTime,
      unitId: clinicAppointments.unitId,
    })
    .from(clinicAppointments)
    .innerJoin(patients, eq(clinicAppointments.patientId, patients.id))
    .where(and(
      eq(clinicAppointments.hospitalId, hospitalId),
      eq(clinicAppointments.appointmentDate, date),
      eq(clinicAppointments.appointmentType, 'external'),
      inArray(clinicAppointments.status, ['scheduled', 'confirmed']),
      eq(clinicAppointments.morningReminderSent, false),
    ));

  return results.map(r => ({
    appointmentId: r.appointmentId,
    patientId: r.patientId!,
    patientFirstName: r.patientFirstName || '',
    patientLastName: r.patientLastName || '',
    patientEmail: r.patientEmail,
    patientPhone: r.patientPhone,
    appointmentDate: r.appointmentDate,
    startTime: r.startTime,
    unitId: r.unitId,
  }));
}

export async function markMorningReminderSent(appointmentId: string): Promise<void> {
  await db
    .update(clinicAppointments)
    .set({ morningReminderSent: true, morningReminderSentAt: new Date() })
    .where(eq(clinicAppointments.id, appointmentId));
}
```

**Step 2: Add morning reminder processor in worker.ts**

In `server/worker.ts`, after the `processAppointmentReminder` function (after line 2477), add a new function `processMorningAppointmentReminder`. This function is nearly identical to `processAppointmentReminder` but:

- Time window: **08:00–09:00** instead of 14:00–15:00
- Targets **today's** appointments instead of tomorrow's
- Uses `morningReminderSent` flag via `getAppointmentsForMorningReminder`
- Uses `markMorningReminderSent` instead of `markAppointmentReminderSent`
- Reuses existing cancel tokens if one exists for the appointment (query `appointmentActionTokens` by appointmentId where `used = false`), otherwise creates new token
- Job type: `'morning_appointment_reminder'`
- SMS text: "Erinnerung: Ihr Termin heute bei {name} um {time}" / "Reminder: Your appointment today at {name} at {time}"

```typescript
async function processMorningAppointmentReminder(job: any): Promise<void> {
  const hospitalId = job.hospitalId;
  logger.info(`[Worker] Morning appointment reminder for hospital ${hospitalId}`);

  const hospitalData = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
  const hospital = hospitalData[0];
  if (!hospital) return;

  const tz = hospital.timezone || 'Europe/Zurich';

  // Only send between 8:00 AM and 9:00 AM in hospital timezone
  const now = new Date();
  const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const currentHour = nowInTz.getHours();
  const currentMinute = nowInTz.getMinutes();
  const timeInMinutes = currentHour * 60 + currentMinute;

  if (timeInMinutes < 8 * 60 || timeInMinutes > 9 * 60) {
    logger.info(`[Worker] Skipping morning reminder - current time ${currentHour}:${currentMinute.toString().padStart(2, '0')} (${tz}) is outside window (08:00-09:00)`);
    return;
  }

  if (hospital.appointmentReminderDisabled) {
    logger.info(`[Worker] Skipping morning reminder - disabled for hospital ${hospitalId}`);
    return;
  }

  // Today's appointments
  const todayStr = nowInTz.toISOString().split('T')[0];

  const eligibleAppointments = await storage.getAppointmentsForMorningReminder(hospitalId, todayStr);
  logger.info(`[Worker] Found ${eligibleAppointments.length} appointments for morning reminder today (${todayStr})`);

  // ... rest follows same pattern as processAppointmentReminder but uses:
  // - storage.markMorningReminderSent() instead of markAppointmentReminderSent()
  // - "heute" / "today" in message text
  // - Reuse existing unused cancel token for the appointment if available,
  //   otherwise create new one
  // - messageType: 'appointment_reminder' (same type, visible in patient messages)
}
```

The full implementation should follow the same structure as `processAppointmentReminder` (lines 2291-2477). Key differences inline above.

**Step 3: Add scheduling for morning reminders**

In `server/worker.ts`, add `scheduleMorningReminderJobs()` — identical to `scheduleAppointmentReminderJobs` but with job type `'morning_appointment_reminder'`.

Then in the worker's scheduled job section (around line 2903), add the call:

```typescript
await scheduleAppointmentReminderJobs();
await scheduleMorningReminderJobs();
```

**Step 4: Add job type handling in worker loop**

In the worker's job dispatch switch/if block, add handling for `'morning_appointment_reminder'` job type that calls `processMorningAppointmentReminder(job)`.

**Step 5: Verify it compiles**

Run: `npm run check`

**Step 6: Commit**

```bash
git add server/worker.ts server/storage/clinic.ts
git commit -m "feat: add morning-of appointment reminder (08:00-09:00 same day)"
```

---

### Task 7: Update SMS and email templates to use manage-appointment link

**Files:**
- Modify: `server/worker.ts:2377,2390-2391`
- Modify: `server/resend.ts:1625-1679`

**Step 1: Update cancel URL to manage URL in worker**

In `server/worker.ts`, change the URL construction (line 2377):

```typescript
      const manageUrl = `${baseUrl}/manage-appointment/${cancelToken}`;
```

Update all references from `cancelUrl` to `manageUrl` in the same function.

Update SMS text (lines 2390-2391):

```typescript
        const smsDe = `Erinnerung: Ihr Termin bei ${hospitalName} am ${formattedDate} um ${formattedTime}. Verwalten/Absagen: ${manageUrl}`;
        const smsEn = `Reminder: Your appointment at ${hospitalName} on ${formattedDate} at ${formattedTime}. Manage/Cancel: ${manageUrl}`;
```

Apply same change in the morning reminder function.

**Step 2: Update reminder email template**

In `server/resend.ts`, update `sendAppointmentReminderEmail` (lines 1625-1679):

- Rename parameter `cancelUrl` → `manageUrl`
- Change the button text from "Termin absagen" / "Cancel Appointment" to "Termin verwalten" / "Manage Appointment"
- Change the button color from red to a neutral/primary color (blue)
- Update any surrounding copy to mention reschedule option

**Step 3: Verify it compiles**

Run: `npm run check`

**Step 4: Commit**

```bash
git add server/worker.ts server/resend.ts
git commit -m "feat: update reminder links and templates to use manage-appointment URL"
```

---

### Task 8: Update confirmation email to include manage link

**Files:**
- Modify: `server/resend.ts` — find the appointment confirmation email function
- Modify: `server/routes/clinic.ts` — where confirmation emails are sent after booking

**Step 1: Find and update confirmation email**

Search for the confirmation email sent after a patient books via `/book`. It should already include a cancel link. Update it to use `/manage-appointment/` URL and change button text to "Manage Appointment" / "Termin verwalten".

**Step 2: Verify it compiles**

Run: `npm run check`

**Step 3: Commit**

```bash
git add server/resend.ts server/routes/clinic.ts
git commit -m "feat: update booking confirmation email to use manage-appointment link"
```

---

### Task 9: Final verification

**Step 1: TypeScript check**

Run: `npm run check`

**Step 2: Test the full flow manually**

- Visit `/manage-appointment/:token` with a valid token
- Verify appointment details show
- Verify Cancel button works
- Verify Reschedule redirects to `/book` with pre-filled data
- Visit `/cancel-appointment/:token` — should show manage page (backward compat)

**Step 3: Check old cancel links still work**

Verify that existing SMS/emails with `/cancel-appointment/` URLs still resolve correctly.

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
