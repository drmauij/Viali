# Appointment Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add inline patient creation, automatic SMS/email confirmations, and reschedule notification dialog to the external appointment booking flow.

**Architecture:** Add inline patient form to BookingDialog (replicating QuickCreateSurgeryDialog pattern). Create a shared server-side `sendAppointmentNotification()` helper called async after create/update. Add a RescheduleConfirmDialog to ClinicCalendar that intercepts drag-drop before mutating.

**Tech Stack:** React, react-big-calendar DnD, Vonage SMS (`server/sms.ts`), Resend email (`server/resend.ts`), i18next, jsPDF

---

### Task 1: Fix providerId silently dropped on drag-to-different-provider

**Files:**
- Modify: `server/routes/clinic.ts:1258-1265`

**Step 1: Add providerId to updateAppointmentSchema**

In the Zod schema at line 1258, add `providerId`:

```typescript
const updateAppointmentSchema = z.object({
  status: z.enum(["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"]).optional(),
  appointmentDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().nullable().optional(),
  serviceId: z.string().nullable().optional(),
  providerId: z.string().optional(),
});
```

**Step 2: Run TypeScript check**

```bash
npm run check
```

**Step 3: Commit**

```
fix(appointments): allow providerId update on drag-to-different-provider
```

---

### Task 2: Server-side appointment notification helper

**Files:**
- Modify: `server/resend.ts` (add `sendAppointmentConfirmationEmail` and `sendAppointmentRescheduleEmail`)
- Modify: `server/routes/clinic.ts` (add `sendAppointmentNotification` helper, call from POST and PATCH)

**Step 1: Add email functions to resend.ts**

At the end of `server/resend.ts`, add two email functions following the existing pattern:

```typescript
export async function sendAppointmentConfirmationEmail(
  toEmail: string,
  patientFirstName: string,
  clinicName: string,
  appointmentDate: string,
  appointmentTime: string,
  language: string = 'de'
): Promise<{ success: boolean; data?: any; error?: any }> {
  const { client, fromEmail } = getResendClient();
  if (!client) return { success: false, error: 'Email not configured' };
  const isGerman = language === 'de';

  const subject = isGerman
    ? `Terminbestätigung – ${clinicName}`
    : `Appointment Confirmation – ${clinicName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e40af;">${clinicName}</h2>
      <p>${isGerman ? 'Guten Tag' : 'Dear'} ${patientFirstName},</p>
      <p>${isGerman
        ? `Ihr Termin am <strong>${appointmentDate}</strong> um <strong>${appointmentTime}</strong> wurde bestätigt.`
        : `Your appointment on <strong>${appointmentDate}</strong> at <strong>${appointmentTime}</strong> has been confirmed.`
      }</p>
      <p>${isGerman
        ? 'Bei Fragen kontaktieren Sie uns bitte direkt.'
        : 'For questions, please contact us directly.'
      }</p>
      <p>${isGerman ? 'Freundliche Grüsse' : 'Kind regards'},<br/>${clinicName}</p>
    </div>
  `;

  try {
    const { data, error } = await client.emails.send({ from: fromEmail, to: toEmail, subject, html });
    if (error) return { success: false, error };
    return { success: true, data };
  } catch (error) {
    return { success: false, error };
  }
}

export async function sendAppointmentRescheduleEmail(
  toEmail: string,
  patientFirstName: string,
  clinicName: string,
  appointmentDate: string,
  appointmentTime: string,
  language: string = 'de'
): Promise<{ success: boolean; data?: any; error?: any }> {
  const { client, fromEmail } = getResendClient();
  if (!client) return { success: false, error: 'Email not configured' };
  const isGerman = language === 'de';

  const subject = isGerman
    ? `Terminverschiebung – ${clinicName}`
    : `Appointment Rescheduled – ${clinicName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e40af;">${clinicName}</h2>
      <p>${isGerman ? 'Guten Tag' : 'Dear'} ${patientFirstName},</p>
      <p>${isGerman
        ? `Ihr Termin wurde verschoben auf <strong>${appointmentDate}</strong> um <strong>${appointmentTime}</strong>.`
        : `Your appointment has been rescheduled to <strong>${appointmentDate}</strong> at <strong>${appointmentTime}</strong>.`
      }</p>
      <p>${isGerman
        ? 'Bei Fragen kontaktieren Sie uns bitte direkt.'
        : 'For questions, please contact us directly.'
      }</p>
      <p>${isGerman ? 'Freundliche Grüsse' : 'Kind regards'},<br/>${clinicName}</p>
    </div>
  `;

  try {
    const { data, error } = await client.emails.send({ from: fromEmail, to: toEmail, subject, html });
    if (error) return { success: false, error };
    return { success: true, data };
  } catch (error) {
    return { success: false, error };
  }
}
```

**Step 2: Add shared notification helper to clinic.ts**

Near the top of the appointments section in `server/routes/clinic.ts` (after imports), add a helper function:

```typescript
async function sendAppointmentNotification(
  appointmentId: string,
  hospitalId: string,
  type: 'confirmation' | 'reschedule'
) {
  try {
    const appointment = await storage.getClinicAppointment(appointmentId);
    if (!appointment?.patientId) return;

    const patient = await storage.getPatient(appointment.patientId);
    if (!patient) return;

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) return;

    const lang = (hospital.defaultLanguage as string) || 'de';
    const isGerman = lang === 'de';
    const tz = hospital.timezone || 'Europe/Zurich';
    const dateLocale = isGerman ? 'de-CH' : 'en-GB';

    // Format date and time using hospital regional settings
    const dateObj = new Date(`${appointment.appointmentDate}T${appointment.startTime}:00`);
    const formattedDate = dateObj.toLocaleDateString(dateLocale, { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' });
    const formattedTime = appointment.startTime;

    const clinicName = hospital.name;
    const patientName = patient.firstName || '';

    // Try SMS first, then email fallback
    const phone = patient.phone;
    const email = patient.email;
    let channel: 'sms' | 'email' | null = null;
    let recipient = '';
    let success = false;

    if (phone) {
      const { isSmsConfiguredForHospital } = await import('../sms');
      const smsAvailable = await isSmsConfiguredForHospital(hospitalId);
      if (smsAvailable) {
        const { sendSms } = await import('../sms');
        const smsText = type === 'confirmation'
          ? (isGerman
            ? `Ihr Termin bei ${clinicName} am ${formattedDate} um ${formattedTime} wurde bestätigt. Bei Fragen kontaktieren Sie uns bitte direkt.`
            : `Your appointment at ${clinicName} on ${formattedDate} at ${formattedTime} has been confirmed. For questions, please contact us directly.`)
          : (isGerman
            ? `Ihr Termin bei ${clinicName} wurde verschoben auf ${formattedDate} um ${formattedTime}. Bei Fragen kontaktieren Sie uns bitte direkt.`
            : `Your appointment at ${clinicName} has been rescheduled to ${formattedDate} at ${formattedTime}. For questions, please contact us directly.`);

        const result = await sendSms(phone, smsText, hospitalId);
        if (result.success) {
          channel = 'sms';
          recipient = phone;
          success = true;
        }
      }
    }

    // Email fallback if SMS not sent
    if (!success && email) {
      const { sendAppointmentConfirmationEmail, sendAppointmentRescheduleEmail } = await import('../resend');
      const emailFn = type === 'confirmation' ? sendAppointmentConfirmationEmail : sendAppointmentRescheduleEmail;
      const result = await emailFn(email, patientName, clinicName, formattedDate, formattedTime, lang);
      if (result.success) {
        channel = 'email';
        recipient = email;
        success = true;
      }
    }

    // Log to patient_messages
    if (success && channel && patient.id) {
      const messageType = type === 'confirmation' ? 'appointment_confirmation' : 'appointment_reschedule';
      const messageText = type === 'confirmation'
        ? (isGerman ? `Terminbestätigung: ${formattedDate} um ${formattedTime}` : `Appointment confirmation: ${formattedDate} at ${formattedTime}`)
        : (isGerman ? `Terminverschiebung: ${formattedDate} um ${formattedTime}` : `Appointment rescheduled: ${formattedDate} at ${formattedTime}`);

      await storage.createPatientMessage({
        hospitalId,
        patientId: patient.id,
        sentBy: null,
        channel,
        recipient,
        message: messageText,
        status: 'sent',
        isAutomatic: true,
        messageType,
      });
    }
  } catch (err) {
    logger.error(`Failed to send appointment ${type} notification for ${appointmentId}:`, err);
  }
}
```

**Step 3: Call from POST endpoint (after appointment creation)**

In the POST endpoint (after `const appointment = await storage.createClinicAppointment(validatedData);`), add an async notification call alongside the existing Cal.com sync:

```typescript
    const appointment = await storage.createClinicAppointment(validatedData);

    // Async sync to Cal.com (don't block response)
    (async () => {
      try {
        const { syncSingleAppointment } = await import("../services/calcomSync");
        await syncSingleAppointment(appointment.id);
      } catch (err) {
        logger.error(`Failed to sync appointment ${appointment.id} to Cal.com:`, err);
      }
    })();

    // Async send confirmation notification (don't block response)
    if (appointment.patientId) {
      sendAppointmentNotification(appointment.id, hospitalId, 'confirmation');
    }

    res.status(201).json(appointment);
```

**Step 4: Call from PATCH endpoint (on time/date change)**

In the PATCH endpoint, after `const updated = await storage.updateClinicAppointment(appointmentId, updateData);`, add a check for time/date changes and send reschedule notification:

```typescript
    const updated = await storage.updateClinicAppointment(appointmentId, updateData);

    // If time or date changed, send reschedule notification
    const timeChanged = (validatedData.appointmentDate && validatedData.appointmentDate !== existing.appointmentDate)
      || (validatedData.startTime && validatedData.startTime !== existing.startTime)
      || (validatedData.endTime && validatedData.endTime !== existing.endTime);

    if (timeChanged && updated.patientId && req.body.sendNotification !== false) {
      sendAppointmentNotification(updated.id, hospitalId, 'reschedule');
    }

    // Async sync to Cal.com (don't block response) - existing code
```

Note the `sendNotification !== false` check — this allows the frontend to opt out by passing `sendNotification: false` (used later if user declines notification in the reschedule dialog).

**Step 5: Run TypeScript check**

```bash
npm run check
```

**Step 6: Commit**

```
feat(appointments): add SMS/email notifications on create and reschedule
```

---

### Task 3: Inline patient creation in BookingDialog

**Files:**
- Modify: `client/src/pages/clinic/Appointments.tsx:622-874` (BookingDialog function)

**Step 1: Add imports**

At the top of `Appointments.tsx`, add these imports alongside existing ones:

```typescript
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { UserPlus, Loader2 } from "lucide-react";
```

(Check if `Loader2` is already imported — if so, just add `UserPlus`.)

**Step 2: Add state variables and helpers inside BookingDialog**

After the existing state variables (line 653), add:

```typescript
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [newPatientFirstName, setNewPatientFirstName] = useState("");
  const [newPatientSurname, setNewPatientSurname] = useState("");
  const [newPatientDOB, setNewPatientDOB] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [birthdayInput, setBirthdayInput] = useState("");
```

Add the `parseBirthday` function (copy from `QuickCreateSurgeryDialog.tsx` lines 98-149 — the exact function is in the exploration output above).

Add the `handleBirthdayChange` handler:
```typescript
  const handleBirthdayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setBirthdayInput(input);
    const parsed = parseBirthday(input);
    if (parsed) {
      setNewPatientDOB(parsed);
    } else if (input.trim() === "") {
      setNewPatientDOB("");
    }
  };
```

Add the create patient mutation:
```typescript
  const createPatientMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/patients", data);
      return response.json();
    },
    onSuccess: (newPatient) => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', hospitalId] });
      setSelectedPatientId(newPatient.id);
      setPatientSearch(`${newPatient.firstName} ${newPatient.surname}`);
      setShowNewPatientForm(false);
      toast({
        title: t('anesthesia.quickSchedule.patientCreated', 'Patient created'),
        description: t('anesthesia.quickSchedule.patientCreatedDescription', 'Patient has been created and selected'),
      });
    },
    onError: () => {
      toast({
        title: t('anesthesia.quickSchedule.creationFailed', 'Failed to create patient'),
        description: t('anesthesia.quickSchedule.creationFailedDescription', 'Could not create patient. Please try again.'),
        variant: "destructive",
      });
    },
  });

  const handleCreatePatient = () => {
    if (!newPatientFirstName.trim() || !newPatientSurname.trim() || !newPatientDOB) {
      toast({
        title: t('anesthesia.quickSchedule.missingInformation', 'Missing information'),
        description: t('anesthesia.quickSchedule.missingPatientFields', 'Please fill in first name, surname, and date of birth'),
        variant: "destructive",
      });
      return;
    }
    createPatientMutation.mutate({
      hospitalId,
      firstName: newPatientFirstName.trim(),
      surname: newPatientSurname.trim(),
      birthday: newPatientDOB,
      sex: "M",
      phone: newPatientPhone.trim() || undefined,
    });
  };
```

Update `resetForm` to clear the new patient fields:
```typescript
  const resetForm = () => {
    setSelectedPatientId("");
    setSelectedProviderId("");
    setSelectedServiceId("");
    setSelectedDate(formatDateForInput(new Date()));
    setSelectedSlot("");
    setPatientSearch("");
    setNotes("");
    setShowNewPatientForm(false);
    setNewPatientFirstName("");
    setNewPatientSurname("");
    setNewPatientDOB("");
    setNewPatientPhone("");
    setBirthdayInput("");
  };
```

**Step 3: Replace the patient search section in the JSX**

Replace the patient search `<div>` (lines 740-772) with:

```tsx
          <div>
            <Label>{t('appointments.searchPatient', 'Search Patient')} *</Label>
            {!showNewPatientForm ? (
              <div>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      if (selectedPatientId) setSelectedPatientId("");
                    }}
                    placeholder={t('appointments.searchPatientPlaceholder', 'Type at least 2 characters...')}
                    data-testid="input-patient-search"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowNewPatientForm(true)}
                    title={t('anesthesia.quickSchedule.newPatient', 'New Patient')}
                    data-testid="button-show-new-patient"
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
                {patients.length > 0 && !selectedPatientId && (
                  <div className="mt-1 border rounded-md max-h-32 overflow-y-auto">
                    {patients.map((patient) => (
                      <button
                        key={patient.id}
                        onClick={() => {
                          setSelectedPatientId(patient.id);
                          setPatientSearch(`${patient.firstName} ${patient.surname}`);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 ${
                          selectedPatientId === patient.id ? 'bg-primary/10' : ''
                        }`}
                        data-testid={`patient-option-${patient.id}`}
                      >
                        {patient.firstName} {patient.surname}
                        {patient.birthday && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            ({format(new Date(patient.birthday), 'P', { locale: dateLocale })})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="border rounded-md p-4 space-y-3 mt-1">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">{t('anesthesia.quickSchedule.newPatient', 'New Patient')}</h4>
                  <Button variant="ghost" size="sm" onClick={() => setShowNewPatientForm(false)}
                    data-testid="button-cancel-new-patient">
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="booking-new-patient-firstname">{t('anesthesia.quickSchedule.firstName', 'First Name')} *</Label>
                    <Input id="booking-new-patient-firstname" value={newPatientFirstName}
                      onChange={(e) => setNewPatientFirstName(e.target.value)}
                      data-testid="input-new-patient-firstname" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="booking-new-patient-surname">{t('anesthesia.quickSchedule.surname', 'Surname')} *</Label>
                    <Input id="booking-new-patient-surname" value={newPatientSurname}
                      onChange={(e) => setNewPatientSurname(e.target.value)}
                      data-testid="input-new-patient-surname" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="booking-new-patient-dob">{t('anesthesia.quickSchedule.dateOfBirth', 'Date of Birth')} *</Label>
                    <Input id="booking-new-patient-dob" type="text"
                      placeholder={t('anesthesia.quickSchedule.dobPlaceholder', 'dd.mm.yyyy')}
                      value={birthdayInput} onChange={handleBirthdayChange}
                      data-testid="input-new-patient-dob"
                      className={birthdayInput && !newPatientDOB ? "border-destructive" : ""} />
                    {birthdayInput && newPatientDOB && (
                      <div className="text-xs text-muted-foreground">{formatDateForInput(newPatientDOB)}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="booking-new-patient-phone">{t('anesthesia.quickSchedule.phone', 'Phone')}</Label>
                    <PhoneInputWithCountry
                      id="booking-new-patient-phone"
                      placeholder={t('anesthesia.quickSchedule.phonePlaceholder', '+41...')}
                      value={newPatientPhone}
                      onChange={(value) => setNewPatientPhone(value)}
                      data-testid="input-new-patient-phone" />
                  </div>
                </div>
                <Button onClick={handleCreatePatient} disabled={createPatientMutation.isPending}
                  className="w-full" data-testid="button-create-patient">
                  {createPatientMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('anesthesia.quickSchedule.createPatient', 'Create Patient')}
                </Button>
              </div>
            )}
          </div>
```

**Step 4: Run TypeScript check**

```bash
npm run check
```

**Step 5: Commit**

```
feat(appointments): add inline patient creation to booking dialog
```

---

### Task 4: Reschedule confirmation dialog in ClinicCalendar

**Files:**
- Modify: `client/src/components/clinic/ClinicCalendar.tsx:961-1027` (handleEventDrop, handleEventResize)

**Step 1: Add Dialog imports**

Add to the existing imports in ClinicCalendar.tsx:

```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
```

(Check if `Dialog` is already imported — it likely isn't since the calendar doesn't currently use one.)

**Step 2: Add state for pending reschedule**

Near the other state declarations in the ClinicCalendar component, add:

```typescript
  const [pendingReschedule, setPendingReschedule] = useState<{
    appointmentId: string;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    providerId?: string;
    patientName?: string;
  } | null>(null);
```

**Step 3: Modify handleEventDrop to show dialog instead of mutating**

Replace the immediate `rescheduleAppointmentMutation.mutate(...)` call at line 987-993 with:

```typescript
    // Show confirmation dialog instead of immediate mutate
    const patientName = event.patientName || event.title || '';
    setPendingReschedule({
      appointmentId,
      appointmentDate: formatDateForInput(start),
      startTime: formatTime(start),
      endTime: formatTime(end),
      providerId: newProviderId !== event.resource ? newProviderId : undefined,
      patientName,
    });
```

**Step 4: Modify handleEventResize similarly**

Replace the immediate `rescheduleAppointmentMutation.mutate(...)` call at line 1021-1025 with:

```typescript
    const patientName = event.patientName || event.title || '';
    setPendingReschedule({
      appointmentId,
      appointmentDate: formatDateForInput(start),
      startTime: formatTime(start),
      endTime: formatTime(end),
      patientName,
    });
```

**Step 5: Add the confirmation dialog and handlers**

Add a `handleConfirmReschedule` and `handleCancelReschedule` function:

```typescript
  const handleConfirmReschedule = useCallback((sendNotification: boolean) => {
    if (!pendingReschedule) return;
    const body: any = {
      appointmentDate: pendingReschedule.appointmentDate,
      startTime: pendingReschedule.startTime,
      endTime: pendingReschedule.endTime,
      sendNotification,
    };
    if (pendingReschedule.providerId) body.providerId = pendingReschedule.providerId;
    rescheduleAppointmentMutation.mutate({
      ...pendingReschedule,
    });
    setPendingReschedule(null);
  }, [pendingReschedule, rescheduleAppointmentMutation]);

  const handleCancelReschedule = useCallback(() => {
    setPendingReschedule(null);
    // Refetch to revert the visual drag in the calendar
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes(`/api/clinic/${hospitalId}/appointments`);
      }
    });
  }, [hospitalId]);
```

Add the dialog JSX at the end of the component's return, before the closing fragment/div:

```tsx
      {/* Reschedule confirmation dialog */}
      <Dialog open={!!pendingReschedule} onOpenChange={(open) => { if (!open) handleCancelReschedule(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('appointments.rescheduleConfirm', 'Reschedule Appointment')}</DialogTitle>
            <DialogDescription>
              {pendingReschedule?.patientName && (
                <span className="font-medium text-foreground">{pendingReschedule.patientName}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <p className="text-sm text-muted-foreground">
              {t('appointments.rescheduleConfirmDesc', 'Move appointment to:')}
            </p>
            <p className="text-sm font-medium mt-1">
              {pendingReschedule?.appointmentDate} · {pendingReschedule?.startTime} – {pendingReschedule?.endTime}
            </p>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCancelReschedule}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="secondary" onClick={() => handleConfirmReschedule(false)}>
              {t('appointments.rescheduleOnly', 'Reschedule Only')}
            </Button>
            <Button onClick={() => handleConfirmReschedule(true)}>
              {t('appointments.rescheduleAndNotify', 'Reschedule & Notify')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

**Step 6: Update the reschedule mutation to pass sendNotification**

Modify `rescheduleAppointmentMutation` (line 928) to accept and pass `sendNotification`:

```typescript
  const rescheduleAppointmentMutation = useMutation({
    mutationFn: async ({ appointmentId, appointmentDate, startTime, endTime, providerId, sendNotification }: {
      appointmentId: string;
      appointmentDate: string;
      startTime: string;
      endTime: string;
      providerId?: string;
      sendNotification?: boolean;
    }) => {
      const body: any = { appointmentDate, startTime, endTime };
      if (providerId) body.providerId = providerId;
      if (sendNotification === false) body.sendNotification = false;
      return apiRequest("PATCH", `/api/clinic/${hospitalId}/appointments/${appointmentId}`, body);
    },
    // ... rest unchanged
  });
```

And update `handleConfirmReschedule` to pass it through:

```typescript
  const handleConfirmReschedule = useCallback((sendNotification: boolean) => {
    if (!pendingReschedule) return;
    rescheduleAppointmentMutation.mutate({
      appointmentId: pendingReschedule.appointmentId,
      appointmentDate: pendingReschedule.appointmentDate,
      startTime: pendingReschedule.startTime,
      endTime: pendingReschedule.endTime,
      providerId: pendingReschedule.providerId,
      sendNotification,
    });
    setPendingReschedule(null);
  }, [pendingReschedule, rescheduleAppointmentMutation]);
```

**Step 7: Run TypeScript check**

```bash
npm run check
```

**Step 8: Commit**

```
feat(appointments): add reschedule confirmation dialog with notification option
```

---

### Task 5: Translation keys for new appointment features

**Files:**
- Modify: `client/src/i18n/locales/en.json` (appointments section)
- Modify: `client/src/i18n/locales/de.json` (appointments section)

**Step 1: Add missing translation keys**

Under the `appointments` object in both locale files, add:

**English:**
```json
"rescheduleConfirm": "Reschedule Appointment",
"rescheduleConfirmDesc": "Move appointment to:",
"rescheduleOnly": "Reschedule Only",
"rescheduleAndNotify": "Reschedule & Notify"
```

**German:**
```json
"rescheduleConfirm": "Termin verschieben",
"rescheduleConfirmDesc": "Termin verschieben auf:",
"rescheduleOnly": "Nur verschieben",
"rescheduleAndNotify": "Verschieben & Benachrichtigen"
```

**Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('client/src/i18n/locales/en.json','utf8')); console.log('OK')"
node -e "JSON.parse(require('fs').readFileSync('client/src/i18n/locales/de.json','utf8')); console.log('OK')"
```

**Step 3: Commit**

```
feat(i18n): add translation keys for appointment reschedule dialog
```

---

### Task 6: Final TypeScript check and integration verification

**Step 1: Full TypeScript check**

```bash
npm run check
```

**Step 2: Fix any type errors**

**Step 3: Manual testing checklist**

- [ ] Book new appointment → SMS/email sent to patient
- [ ] Book appointment with inline-created patient → works
- [ ] Drag appointment to new time → confirmation dialog appears
- [ ] Click "Reschedule & Notify" → appointment moves, SMS/email sent
- [ ] Click "Reschedule Only" → appointment moves, no notification
- [ ] Click "Cancel" → appointment stays in original position
- [ ] Resize appointment → confirmation dialog appears
- [ ] Drag to different provider column → provider changes (providerId fix)

**Step 4: Commit if any fixes needed**

```
fix: resolve issues from appointment enhancement integration
```
