# No-Show Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce clinic appointment no-shows via configurable fee notice, cancel-only reminders, and booking acknowledgment.

**Architecture:** Add a `noShowFeeMessage` text field to hospitals (presence = feature toggle). Wire it into: (1) admin settings UI, (2) booking page checkbox, (3) 24h reminder (cancel-only + fee notice), (4) morning reminder (info-only), (5) manage-appointment page (remove reschedule).

**Tech Stack:** Drizzle ORM, PostgreSQL, React, Express, Resend email

**Spec:** `docs/superpowers/specs/2026-03-19-no-show-reduction-design.md`

---

### Task 1: Schema — Add `noShowFeeMessage` and `noShowFeeAcknowledgedAt` Columns

**Files:**
- Modify: `shared/schema.ts:65-129` (hospitals table) and `shared/schema.ts:4298-4368` (clinicAppointments table)
- Create: `migrations/XXXX.sql` (auto-generated, then made idempotent)

- [ ] **Step 1: Add `noShowFeeMessage` to hospitals table in schema**

In `shared/schema.ts`, add after line 126 (`enableReferralOnBooking`):

```typescript
noShowFeeMessage: text("no_show_fee_message"), // When set, enables no-show fee notice at booking + in 24h reminder
```

- [ ] **Step 2: Add `noShowFeeAcknowledgedAt` to clinicAppointments table in schema**

In `shared/schema.ts`, add after line 4346 (`morningReminderSentAt`):

```typescript
noShowFeeAcknowledgedAt: timestamp("no_show_fee_acknowledged_at"), // When patient acknowledged no-show fee policy during booking
```

- [ ] **Step 3: Generate migration**

Run: `npm run db:generate`

- [ ] **Step 4: Make migration idempotent**

Edit the generated migration SQL to use `ADD COLUMN IF NOT EXISTS` for both columns.

- [ ] **Step 5: Run migration**

Run: `npm run db:migrate`

- [ ] **Step 6: Verify with drizzle-kit push**

Run: `npx drizzle-kit push`
Expected: "Changes applied" with no pending diffs.

- [ ] **Step 7: TypeScript check**

Run: `npm run check`
Expected: Clean pass.

- [ ] **Step 8: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat: add noShowFeeMessage and noShowFeeAcknowledgedAt columns"
```

---

### Task 2: Manage Appointment Page — Remove Reschedule

**Files:**
- Modify: `client/src/pages/ManageAppointment.tsx`

- [ ] **Step 1: Remove `handleReschedule` function**

Delete lines 91-117 (the entire `handleReschedule` function).

- [ ] **Step 2: Remove reschedule button from the UI**

Delete lines 228-239 (the `{info.bookingToken && ( <Button ... Reschedule ... />)}` block).

- [ ] **Step 3: Update page title to "Cancel Appointment"**

Change line 203 from:
```tsx
{isGerman ? "Ihren Termin verwalten" : "Manage Your Appointment"}
```
to:
```tsx
{isGerman ? "Termin absagen" : "Cancel Appointment"}
```

- [ ] **Step 4: Update the "what would you like to do?" prompt**

Change lines 222-225 from:
```tsx
{isGerman
  ? "Was möchten Sie mit diesem Termin tun?"
  : "What would you like to do with this appointment?"}
```
to:
```tsx
{isGerman
  ? "Möchten Sie diesen Termin absagen?"
  : "Would you like to cancel this appointment?"}
```

- [ ] **Step 5: Verify the post-cancel "Book a new appointment" link is still present**

Lines 182-189 should remain untouched — the `{info?.bookingToken && <a>Neuen Termin buchen</a>}` block stays.

- [ ] **Step 6: TypeScript check**

Run: `npm run check`
Expected: Clean pass (no references to `handleReschedule` elsewhere).

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/ManageAppointment.tsx
git commit -m "feat: remove reschedule from manage-appointment, cancel-only"
```

---

### Task 3: Admin Settings — No-Show Fee Message Text Area

**Files:**
- Modify: `client/src/pages/admin/Settings.tsx`

- [ ] **Step 1: Add `noShowFeeMessage` to hospitalForm initial state**

In `Settings.tsx` line 40, add to the `useState` object (after `appointmentReminderDisabled`):

```typescript
noShowFeeMessage: "" as string,
```

- [ ] **Step 2: Add `noShowFeeMessage` to hospitalForm hydration**

In `Settings.tsx` line 149 (inside the `useEffect` that sets form from `fullHospitalData`), add after `appointmentReminderDisabled`:

```typescript
noShowFeeMessage: fullHospitalData.noShowFeeMessage || "",
```

- [ ] **Step 3: Add mutation for saving noShowFeeMessage**

Add a new mutation after the existing `updateAppointmentReminderDisabledMutation` (~line 243):

```typescript
const updateNoShowFeeMessageMutation = useMutation({
  mutationFn: async (message: string) => {
    const response = await apiRequest("PATCH", `/api/admin/${activeHospital?.id}`, { noShowFeeMessage: message || null });
    return await response.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    toast({
      title: t("common.success"),
      description: t("admin.noShowFeeMessageSaved", "No-show fee notice saved"),
    });
  },
  onError: (error: any) => {
    toast({
      title: t("common.error"),
      description: error.message,
      variant: "destructive",
    });
  },
});
```

- [ ] **Step 4: Add UI card after the Appointment Reminder card**

Insert after line 1262 (closing `</div>` of the Appointment Reminder card), a new card:

```tsx
{/* No-Show Fee Notice Card */}
<div className="bg-card border border-border rounded-lg p-4">
  <div className="space-y-3">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
        <i className="fas fa-exclamation-triangle text-amber-500"></i>
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-foreground text-lg">
          {t("admin.noShowFeeNotice", "No-Show Fee Notice")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("admin.noShowFeeNoticeDescription", "When set, patients must acknowledge this message when booking online. It is also included in the 24h appointment reminder. Leave empty to disable.")}
        </p>
      </div>
    </div>
    {hospitalForm.noShowFeeMessage && hospitalForm.appointmentReminderDisabled && (
      <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-md p-3">
        <i className="fas fa-info-circle mr-1"></i>
        {t("admin.noShowFeeReminderWarning", "Note: Appointment reminders are currently disabled — the fee notice will only appear during booking, not in reminders.")}
      </div>
    )}
    <textarea
      className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
      placeholder={hospitalForm.defaultLanguage === "en"
        ? "Please note that appointments not cancelled at least 24 hours in advance may be subject to a CHF 150 fee."
        : "Bitte beachten Sie, dass Termine, die nicht mindestens 24 Stunden im Voraus abgesagt werden, mit CHF 150 in Rechnung gestellt werden können."}
      value={hospitalForm.noShowFeeMessage}
      onChange={(e) => setHospitalForm(prev => ({ ...prev, noShowFeeMessage: e.target.value }))}
    />
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground">
        {t("admin.noShowFeeSmsNote", "Note: Long messages may be sent as multiple SMS segments, increasing costs.")}
      </p>
      <Button
        size="sm"
        onClick={() => updateNoShowFeeMessageMutation.mutate(hospitalForm.noShowFeeMessage)}
        disabled={updateNoShowFeeMessageMutation.isPending}
      >
        {updateNoShowFeeMessageMutation.isPending
          ? t("common.saving", "Saving...")
          : t("common.save", "Save")}
      </Button>
    </div>
  </div>
</div>
```

- [ ] **Step 5: TypeScript check**

Run: `npm run check`
Expected: Clean pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/admin/Settings.tsx
git commit -m "feat: add no-show fee message settings UI"
```

---

### Task 4: Public Booking API — Expose `noShowFeeMessage`

**Files:**
- Modify: `server/routes/clinic.ts:196-227` (public booking info endpoint)

- [ ] **Step 1: Add `noShowFeeMessage` to the booking info response**

In `server/routes/clinic.ts` line 211, add after `language: hospital.defaultLanguage,`:

```typescript
noShowFeeMessage: hospital.noShowFeeMessage || null,
```

- [ ] **Step 2: Add `noShowFeeAcknowledged` to booking schema**

In `server/routes/clinic.ts` line 359 (`bookingSchema`), add after `refParam`:

```typescript
noShowFeeAcknowledged: z.boolean().optional(),
```

- [ ] **Step 3: Store `noShowFeeAcknowledgedAt` when creating the appointment**

In `server/routes/clinic.ts` line 444 (`storage.createClinicAppointment` call), add after `notes: notes || null,`:

```typescript
noShowFeeAcknowledgedAt: parsed.data.noShowFeeAcknowledged ? new Date() : null,
```

- [ ] **Step 4: TypeScript check**

Run: `npm run check`
Expected: Clean pass.

- [ ] **Step 5: Commit**

```bash
git add server/routes/clinic.ts
git commit -m "feat: expose noShowFeeMessage in booking API, store acknowledgment"
```

---

### Task 5: Booking Page — Acknowledgment Checkbox

**Files:**
- Modify: `client/src/pages/BookAppointment.tsx`

- [ ] **Step 1: Add `noShowFeeAcknowledged` state**

In `BookAppointment.tsx` line 154 (after `privacyAccepted`), add:

```typescript
const [noShowFeeAcknowledged, setNoShowFeeAcknowledged] = useState(false);
```

- [ ] **Step 2: Add `noShowFeeMessage` to the `BookingData` type**

In `BookAppointment.tsx` line 29, add to the `hospital` object in the `BookingData` type (after `language: string;`):

```typescript
noShowFeeMessage?: string | null;
```

- [ ] **Step 3: Add the acknowledgment checkbox after the privacy checkbox**

In `BookAppointment.tsx`, after the privacy consent label block (line 904), insert:

```tsx
{/* No-show fee acknowledgment */}
{data?.hospital?.noShowFeeMessage && (
  <label className="flex items-start gap-3 cursor-pointer">
    <input
      type="checkbox"
      checked={noShowFeeAcknowledged}
      onChange={(e) => setNoShowFeeAcknowledged(e.target.checked)}
      className={cn(
        "mt-0.5 h-4 w-4 rounded border shrink-0 accent-gray-900",
        isDark ? "border-white/20" : "border-gray-300"
      )}
    />
    <span className={cn(
      "text-xs leading-relaxed",
      isDark ? "text-white/50" : "text-gray-500"
    )}>
      {data.hospital.noShowFeeMessage} *
    </span>
  </label>
)}
```

- [ ] **Step 4: Add `noShowFeeAcknowledged` to the submit button disabled logic**

In `BookAppointment.tsx` line 909-910, add `noShowFeeAcknowledged` check. The button should be disabled when `noShowFeeMessage` is set and `noShowFeeAcknowledged` is false:

```tsx
disabled={showReferralStep
  ? (!firstName.trim() || !surname.trim() || !email.trim() || !phone.trim() || !notes.trim() || !privacyAccepted || (!!data?.hospital?.noShowFeeMessage && !noShowFeeAcknowledged))
  : (submitting || !firstName.trim() || !surname.trim() || !email.trim() || !phone.trim() || !notes.trim() || !privacyAccepted || (!!data?.hospital?.noShowFeeMessage && !noShowFeeAcknowledged))}
```

- [ ] **Step 5: Send `noShowFeeAcknowledged` in the booking request body**

In `BookAppointment.tsx` line 365 (`JSON.stringify` body), add after `refParam`:

```typescript
noShowFeeAcknowledged: noShowFeeAcknowledged || undefined,
```

- [ ] **Step 6: Add `noShowFeeAcknowledged` to `handleSubmit` dependency array**

In `BookAppointment.tsx` line 403 (the `useCallback` dependency array for `handleSubmit`), add `noShowFeeAcknowledged` to the array.

- [ ] **Step 7: TypeScript check**

Run: `npm run check`
Expected: Clean pass.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/BookAppointment.tsx
git commit -m "feat: add no-show fee acknowledgment checkbox to booking page"
```

---

### Task 6: Email Template — Add `mode` Parameter

**Files:**
- Modify: `server/resend.ts:1625-1679`

- [ ] **Step 1: Add `mode` and `noShowFeeMessage` parameters to `sendAppointmentReminderEmail`**

Change the function signature at line 1625:

```typescript
export async function sendAppointmentReminderEmail(
  toEmail: string,
  patientFirstName: string,
  clinicName: string,
  appointmentDate: string,
  appointmentTime: string,
  manageUrl: string,
  language: string = 'de',
  mode: 'cancel-only' | 'info-only' = 'cancel-only',
  noShowFeeMessage?: string | null,
)
```

- [ ] **Step 2: Update the email HTML template**

Replace ONLY the `const html = ...` template string (lines 1642-1658). Keep the rest of the function intact (the `client.emails.send()` call, error handling, and return statements at lines 1661-1679). New template:

```typescript
const html = `
  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
    <h2>${clinicName}</h2>
    <p>${isGerman ? 'Guten Tag' : 'Dear'} ${patientFirstName},</p>
    <p>${isGerman
      ? `Wir möchten Sie an Ihren Termin am <strong>${appointmentDate}</strong> um <strong>${appointmentTime}</strong> erinnern.`
      : `This is a reminder for your appointment on <strong>${appointmentDate}</strong> at <strong>${appointmentTime}</strong>.`}</p>
    ${mode === 'cancel-only' ? `
      <p>${isGerman
        ? 'Falls Sie den Termin absagen möchten:'
        : 'If you need to cancel this appointment:'}</p>
      <p style="text-align: center; margin: 24px 0;">
        <a href="${manageUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          ${isGerman ? 'Termin absagen' : 'Cancel Appointment'}
        </a>
      </p>
      ${noShowFeeMessage ? `<p style="color: #6b7280; font-size: 14px; margin-top: 16px;">${noShowFeeMessage}</p>` : ''}
    ` : ''}
    <p>${isGerman ? 'Freundliche Grüsse' : 'Kind regards'},<br/>${clinicName}</p>
  </div>
`;
```

- [ ] **Step 3: TypeScript check**

Run: `npm run check`
Expected: Clean pass (existing callers still work because new params have defaults).

- [ ] **Step 4: Commit**

```bash
git add server/resend.ts
git commit -m "feat: add mode param to appointment reminder email (cancel-only/info-only)"
```

---

### Task 7: 24h Reminder — Cancel-Only + Fee Notice

**Files:**
- Modify: `server/worker.ts:2293-2479` (`processAppointmentReminder`)

- [ ] **Step 1: Update SMS text — replace "Verwalten/Absagen" with "Absagen"**

Change lines 2392-2393:

```typescript
const feeNotice = hospital.noShowFeeMessage ? `\n${hospital.noShowFeeMessage}` : '';
const smsDe = `Erinnerung: Ihr Termin bei ${hospitalName} am ${formattedDate} um ${formattedTime}. Absagen: ${manageUrl}${feeNotice}`;
const smsEn = `Reminder: Your appointment at ${hospitalName} on ${formattedDate} at ${formattedTime}. Cancel: ${manageUrl}${feeNotice}`;
```

- [ ] **Step 2: Update email call — pass `mode` and `noShowFeeMessage`**

Change lines 2408-2416:

```typescript
const emailResult = await sendAppointmentReminderEmail(
  appt.patientEmail,
  appt.patientFirstName,
  hospitalName,
  formattedDate,
  formattedTime,
  manageUrl,
  lang,
  'cancel-only',
  hospital.noShowFeeMessage,
);
```

- [ ] **Step 3: TypeScript check**

Run: `npm run check`
Expected: Clean pass.

- [ ] **Step 4: Commit**

```bash
git add server/worker.ts
git commit -m "feat: 24h reminder — cancel-only link + no-show fee notice"
```

---

### Task 8: Morning Reminder — Info Only

**Files:**
- Modify: `server/worker.ts:2521-2715` (`processMorningAppointmentReminder`)

- [ ] **Step 1: Remove token lookup/creation block**

Delete lines 2591-2618 (the entire block that checks for existing cancel tokens or creates new ones, plus the `manageUrl` variable).

- [ ] **Step 2: Update SMS text — remove manage URL**

Replace lines 2627-2628:

```typescript
const smsDe = `Erinnerung: Ihr Termin heute bei ${hospitalName} um ${formattedTime}.`;
const smsEn = `Reminder: Your appointment today at ${hospitalName} at ${formattedTime}.`;
```

- [ ] **Step 3: Update email call — use `info-only` mode**

Replace lines 2642-2652:

```typescript
const { sendAppointmentReminderEmail } = await import('./resend');
const todayLabel = isGerman ? 'Heute' : 'Today';
const emailResult = await sendAppointmentReminderEmail(
  appt.patientEmail,
  appt.patientFirstName,
  hospitalName,
  todayLabel,
  formattedTime,
  '',
  lang,
  'info-only',
);
```

- [ ] **Step 4: Remove unused `baseUrl` variable**

Line 2569 (`const baseUrl = ...`) is now unused in this function. Remove it.

- [ ] **Step 5: TypeScript check**

Run: `npm run check`
Expected: Clean pass.

- [ ] **Step 6: Commit**

```bash
git add server/worker.ts
git commit -m "feat: morning reminder — info only, no action links"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Full TypeScript check**

Run: `npm run check`
Expected: Clean pass.

- [ ] **Step 2: Verify migration idempotency**

Read the migration file and confirm all statements use `IF NOT EXISTS` / `IF EXISTS`.

- [ ] **Step 3: Verify DB sync**

Run: `npx drizzle-kit push`
Expected: "Changes applied" with no pending diffs.

- [ ] **Step 4: Verify journal timestamps**

Check that the new migration's `when` value in `migrations/meta/_journal.json` is higher than all previous entries.

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup for no-show reduction feature"
```
