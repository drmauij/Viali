# Appointment Edit & Provider Notification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow editing appointment date/time/provider from the Appointment Details dialog, notify patients on provider changes, include provider name in notification messages, and auto-confirm new appointments.

**Architecture:** Extend the existing PATCH endpoint's notification trigger to include provider changes. Add provider name to SMS/email templates. Add edit mode to the Appointment Details dialog with inline form fields. Change default status for new appointments from "scheduled" to "confirmed" and fix the reminder query to include confirmed appointments.

**Tech Stack:** React, TanStack Query, shadcn/ui, Express, Drizzle ORM, Vonage/ASPSMS SMS, Resend email

---

### Task 1: Backend — Add provider change to notification trigger + include provider name in messages

**Files:**
- Modify: `server/routes/clinic.ts:1492-1620` (sendAppointmentNotification)
- Modify: `server/routes/clinic.ts:1900-1909` (PATCH handler notification trigger)
- Modify: `server/resend.ts:1297-1352` (sendAppointmentRescheduleEmail)

**Step 1: Update notification trigger to include provider change**

In `server/routes/clinic.ts`, around line 1902-1909, change the trigger condition:

```typescript
// If time, date, or provider changed, send reschedule notification
const timeChanged = (validatedData.appointmentDate && validatedData.appointmentDate !== existing.appointmentDate)
  || (validatedData.startTime && validatedData.startTime !== existing.startTime)
  || (validatedData.endTime && validatedData.endTime !== existing.endTime);
const providerChanged = validatedData.providerId && validatedData.providerId !== existing.providerId;

if ((timeChanged || providerChanged) && updated.patientId && sendNotification !== false) {
  sendAppointmentNotification(updated.id, hospitalId, 'reschedule');
}
```

**Step 2: Add provider name to sendAppointmentNotification**

In `server/routes/clinic.ts`, inside `sendAppointmentNotification` (around line 1498), after fetching the appointment, also fetch the provider name:

```typescript
// After line ~1505 (after hospital fetch)
let providerName = '';
if (appointment.providerId) {
  const provider = await storage.getUser(appointment.providerId);
  if (provider) {
    providerName = `${provider.firstName || ''} ${provider.lastName || ''}`.trim();
  }
}
```

**Step 3: Update SMS reschedule messages to include provider name**

In the `smsMessages` object (around line 1554-1567), update the reschedule messages:

```typescript
reschedule: {
  de: `Ihr Termin bei ${clinicName} wurde verschoben auf ${formattedDate} um ${formattedTime}${providerName ? ` bei ${providerName}` : ''}.${cancelSuffix || ' Bei Fragen kontaktieren Sie uns bitte direkt.'}`,
  en: `Your appointment at ${clinicName} has been rescheduled to ${formattedDate} at ${formattedTime}${providerName ? ` with ${providerName}` : ''}.${cancelSuffix || ' For questions, please contact us directly.'}`,
},
```

Also update the confirmation messages similarly:

```typescript
confirmation: {
  de: `Ihr Termin bei ${clinicName} am ${formattedDate} um ${formattedTime}${providerName ? ` bei ${providerName}` : ''} wurde bestätigt.${cancelSuffix || ' Bei Fragen kontaktieren Sie uns bitte direkt.'}`,
  en: `Your appointment at ${clinicName} on ${formattedDate} at ${formattedTime}${providerName ? ` with ${providerName}` : ''} has been confirmed.${cancelSuffix || ' For questions, please contact us directly.'}`,
},
```

**Step 4: Update email reschedule template to include provider name**

In `server/resend.ts`, update `sendAppointmentRescheduleEmail` signature to accept optional `providerName`:

```typescript
export async function sendAppointmentRescheduleEmail(
  toEmail: string,
  patientFirstName: string,
  clinicName: string,
  appointmentDate: string,
  appointmentTime: string,
  language: string = 'de',
  cancelUrl: string = '',
  providerName: string = ''
)
```

Update the email body (line ~1326-1328):

```typescript
<p>${isGerman
  ? `Ihr Termin wurde verschoben auf ${appointmentDate} um ${appointmentTime}${providerName ? ` bei ${providerName}` : ''}. Bei Fragen kontaktieren Sie uns bitte direkt.`
  : `Your appointment has been rescheduled to ${appointmentDate} at ${appointmentTime}${providerName ? ` with ${providerName}` : ''}. For questions, please contact us directly.`}</p>
```

**Step 5: Pass providerName through the notification flow**

In `sendAppointmentNotification`, pass `providerName` to the email function call (around line 1589):

```typescript
const result = await emailFn(patient.email, patientName, clinicName, formattedDate, formattedTime, lang, cancelUrl, providerName);
```

**Step 6: Run typecheck**

Run: `npm run check`
Expected: PASS

**Step 7: Commit**

```bash
git add server/routes/clinic.ts server/resend.ts
git commit -m "feat: notify patient on provider change, include provider name in reschedule messages"
```

---

### Task 2: Backend — Auto-confirm new appointments + fix reminder query

**Files:**
- Modify: `server/routes/clinic.ts:1815-1823` (internal creation endpoint)
- Modify: `server/routes/dischargeBriefs.ts:659` (discharge brief appointment creation)
- Modify: `server/storage/clinic.ts:2115` (reminder query)

**Step 1: Auto-confirm in internal creation endpoint**

In `server/routes/clinic.ts`, around line 1815, the `insertClinicAppointmentSchema.parse` call gets status from `req.body`. Add a status override after the parse:

```typescript
const validatedData = insertClinicAppointmentSchema.parse({
  ...req.body,
  hospitalId,
  unitId,
  durationMinutes,
  createdBy: userId,
  status: 'confirmed',  // Auto-confirm new appointments
});
```

**Step 2: Auto-confirm in discharge briefs appointment creation**

In `server/routes/dischargeBriefs.ts`, line 659, change:

```typescript
status: "confirmed",
```

**Step 3: Fix reminder query to include confirmed appointments**

In `server/storage/clinic.ts`, line 2115, change from:

```typescript
eq(clinicAppointments.status, 'scheduled'),
```

to:

```typescript
inArray(clinicAppointments.status, ['scheduled', 'confirmed']),
```

Also add the `inArray` import if not already present at the top of the file.

**Step 4: Update JSDoc comment**

In `server/storage/clinic.ts`, line 2083, update the comment:

```
* Returns appointments where reminderSent = false, status in ('scheduled', 'confirmed'), appointmentType = 'external',
```

**Step 5: Run typecheck**

Run: `npm run check`
Expected: PASS

**Step 6: Commit**

```bash
git add server/routes/clinic.ts server/routes/dischargeBriefs.ts server/storage/clinic.ts
git commit -m "feat: auto-confirm new appointments, fix reminders to include confirmed status"
```

---

### Task 3: Frontend — Add edit mode to Appointment Details dialog

**Files:**
- Modify: `client/src/pages/clinic/Appointments.tsx:80-164` (state + mutations)
- Modify: `client/src/pages/clinic/Appointments.tsx:380-550` (dialog UI)

**Step 1: Add edit state and reschedule mutation**

After the existing state declarations (around line 93), add:

```typescript
const [editMode, setEditMode] = useState(false);
const [editDate, setEditDate] = useState('');
const [editStartTime, setEditStartTime] = useState('');
const [editEndTime, setEditEndTime] = useState('');
const [editProviderId, setEditProviderId] = useState('');
```

**Step 2: Add a reschedule mutation**

After `deleteAppointmentMutation` (around line 181), add:

```typescript
const rescheduleAppointmentMutation = useMutation({
  mutationFn: async ({ id, data }: { id: string; data: { appointmentDate?: string; startTime?: string; endTime?: string; providerId?: string } }) => {
    return apiRequest("PATCH", `/api/clinic/${hospitalId}/appointments/${id}`, data);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes(`/api/clinic/${hospitalId}/appointments`);
      }
    });
    toast({ title: t('appointments.rescheduled', 'Appointment rescheduled') });
    setEditMode(false);
    setDetailDialogOpen(false);
  },
  onError: () => {
    toast({ title: t('appointments.rescheduleError', 'Failed to reschedule appointment'), variant: "destructive" });
  },
});
```

**Step 3: Add helper to enter edit mode**

```typescript
const enterEditMode = () => {
  if (!selectedAppointment) return;
  setEditDate(selectedAppointment.appointmentDate);
  setEditStartTime(selectedAppointment.startTime);
  setEditEndTime(selectedAppointment.endTime);
  setEditProviderId(selectedAppointment.providerId || '');
  setEditMode(true);
};
```

**Step 4: Add save handler**

```typescript
const handleSaveReschedule = () => {
  if (!selectedAppointment) return;
  const changes: Record<string, string> = {};
  if (editDate !== selectedAppointment.appointmentDate) changes.appointmentDate = editDate;
  if (editStartTime !== selectedAppointment.startTime) changes.startTime = editStartTime;
  if (editEndTime !== selectedAppointment.endTime) changes.endTime = editEndTime;
  if (editProviderId !== (selectedAppointment.providerId || '')) changes.providerId = editProviderId;
  if (Object.keys(changes).length === 0) {
    setEditMode(false);
    return;
  }
  rescheduleAppointmentMutation.mutate({ id: selectedAppointment.id, data: changes });
};
```

**Step 5: Reset edit mode when dialog closes**

Update the Dialog `onOpenChange` (line 380):

```tsx
<Dialog open={detailDialogOpen} onOpenChange={(open) => {
  setDetailDialogOpen(open);
  if (!open) setEditMode(false);
}}>
```

**Step 6: Replace the read-only date/time/provider grid with conditional edit/view mode**

Replace the grid at lines 435-468 with:

```tsx
<div className="grid grid-cols-2 gap-4 text-sm">
  <div>
    <p className="text-muted-foreground">{t('appointments.date', 'Date')}</p>
    {editMode ? (
      <DateInput
        value={editDate}
        onChange={(e) => setEditDate(e.target.value)}
      />
    ) : (
      <p className="font-medium" data-testid="text-appointment-date">
        {formatDateLong(parseISO(selectedAppointment.appointmentDate))}
      </p>
    )}
  </div>
  <div>
    <p className="text-muted-foreground">{t('appointments.time', 'Time')}</p>
    {editMode ? (
      <div className="flex items-center gap-1">
        <TimeInput
          value={editStartTime}
          onChange={(e) => setEditStartTime(e.target.value)}
          className="w-20"
        />
        <span>-</span>
        <TimeInput
          value={editEndTime}
          onChange={(e) => setEditEndTime(e.target.value)}
          className="w-20"
        />
      </div>
    ) : (
      <p className="font-medium" data-testid="text-appointment-time">
        {selectedAppointment.startTime} - {selectedAppointment.endTime}
      </p>
    )}
  </div>
  <div>
    <p className="text-muted-foreground">{t('appointments.provider', 'Provider')}</p>
    {editMode ? (
      <Select value={editProviderId} onValueChange={setEditProviderId}>
        <SelectTrigger className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providers.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.firstName} {p.lastName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <p className="font-medium">
        {selectedAppointment.provider
          ? `${selectedAppointment.provider.firstName} ${selectedAppointment.provider.lastName}`
          : '-'}
      </p>
    )}
  </div>
  <div>
    <p className="text-muted-foreground">
      {selectedAppointment.appointmentType === 'internal'
        ? t('appointments.subject', 'Subject')
        : t('appointments.service', 'Service')}
    </p>
    <p className="font-medium">
      {selectedAppointment.appointmentType === 'internal'
        ? (selectedAppointment.internalSubject || '-')
        : (selectedAppointment.service?.name || '-')}
    </p>
  </div>
</div>
```

**Step 7: Add Edit/Save/Cancel buttons to dialog header**

In the DialogHeader (lines 382-387), add an edit button for editable statuses. Replace the header:

```tsx
<DialogHeader>
  <DialogTitle className="flex items-center gap-2">
    <Calendar className="h-5 w-5" />
    {t('appointments.details', 'Appointment Details')}
    {selectedAppointment && !editMode && (selectedAppointment.status === 'scheduled' || selectedAppointment.status === 'confirmed') && (
      <Button variant="ghost" size="sm" className="ml-auto h-7 w-7 p-0" onClick={enterEditMode}>
        <Pencil className="h-4 w-4" />
      </Button>
    )}
  </DialogTitle>
</DialogHeader>
```

**Step 8: Add Save/Cancel buttons when in edit mode**

In the DialogFooter (line 484), wrap existing buttons in a conditional and add edit-mode buttons:

```tsx
<DialogFooter className="flex-col gap-2 sm:flex-row">
  {editMode ? (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setEditMode(false)}
        disabled={rescheduleAppointmentMutation.isPending}
      >
        {t('common.cancel', 'Cancel')}
      </Button>
      <Button
        size="sm"
        onClick={handleSaveReschedule}
        disabled={rescheduleAppointmentMutation.isPending}
      >
        {rescheduleAppointmentMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
        {t('common.save', 'Save')}
      </Button>
    </>
  ) : (
    <>
      {/* ...existing status buttons and delete button... */}
    </>
  )}
</DialogFooter>
```

**Step 9: Add Pencil import**

Add `Pencil` to the lucide-react import (line 29-45):

```typescript
import {
  Calendar, Clock, User, Users, Phone, Mail, X, Check,
  AlertCircle, RefreshCw, Trash2, ToggleRight, ToggleLeft,
  UserPlus, Loader2, Pencil,
} from "lucide-react";
```

**Step 10: Run typecheck**

Run: `npm run check`
Expected: PASS

**Step 11: Commit**

```bash
git add client/src/pages/clinic/Appointments.tsx
git commit -m "feat: add edit mode to appointment details dialog for date/time/provider"
```

---

### Task 4: Verification & final typecheck

**Step 1: Run full typecheck**

Run: `npm run check`
Expected: PASS

**Step 2: Manual test checklist**

- [ ] Create new appointment → status should be "confirmed" (not "scheduled")
- [ ] Open Appointment Details → see Edit (pencil) button for confirmed appointments
- [ ] Click Edit → fields become editable (date, time, provider)
- [ ] Change date only → Save → patient gets SMS/email with new date + provider name
- [ ] Change provider only → Save → patient gets SMS/email mentioning new provider
- [ ] Change both → Save → patient gets SMS/email with both changes
- [ ] Cancel edit → fields revert, no notification sent
- [ ] Completed/cancelled appointments → no edit button shown
