# Lead Paste Import in Booking Dialog

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a paste-from-Excel import button in the clinic booking dialog so helpdesk staff can copy a lead row and auto-create the patient + set referral source without manual data entry.

**Architecture:** Client-side only for parsing. One small backend change to accept optional `referralCreatedAt` on the appointment creation endpoint so the referral event records the original lead date. The import UI is an inline panel in `BookingDialog` (same pattern as the existing "New Patient" form toggle).

**Tech Stack:** React, TypeScript, Lucide icons, shadcn/ui components, existing API endpoints.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `client/src/pages/clinic/Appointments.tsx` | Modify | Add import icon button, paste panel, parse logic, auto-fill flow |
| `server/routes/clinic.ts` | Modify | Accept optional `referralCreatedAt` in appointment creation endpoint |

---

### Task 1: Add lead paste import UI + parsing logic

**Files:**
- Modify: `client/src/pages/clinic/Appointments.tsx:28-37` (lucide imports)
- Modify: `client/src/pages/clinic/Appointments.tsx:416-438` (state declarations)
- Modify: `client/src/pages/clinic/Appointments.tsx:557-573` (createPatientMutation onSuccess — add lead import cleanup)
- Modify: `client/src/pages/clinic/Appointments.tsx:576-593` (after handleCreatePatient — add parseLeadRow + handleLeadImport)
- Modify: `client/src/pages/clinic/Appointments.tsx:595-613` (resetForm — add lead import state reset)
- Modify: `client/src/pages/clinic/Appointments.tsx:647-750` (patient search area — add import button + panel)

- [ ] **Step 1: Add ClipboardPaste to lucide imports**

In the lucide-react import block (line ~28-37), add `ClipboardPaste` to the import list.

- [ ] **Step 2: Add new state variables**

In `BookingDialog`, after the existing state declarations (line ~438), add:

```typescript
const [showLeadImport, setShowLeadImport] = useState(false);
const [leadPasteText, setLeadPasteText] = useState("");
const [leadImportPending, setLeadImportPending] = useState(false);
const [referralCreatedAt, setReferralCreatedAt] = useState<string | null>(null);
```

- [ ] **Step 3: Add lead import cleanup to createPatientMutation.onSuccess**

In `createPatientMutation`'s `onSuccess` callback (line ~557-565), add these lines so the import panel closes only after the patient is successfully created:

```typescript
setShowLeadImport(false);
setLeadPasteText("");
```

- [ ] **Step 4: Add parseLeadRow and handleLeadImport**

Add these two functions inside `BookingDialog`, after `handleCreatePatient` (line ~593):

```typescript
const parseLeadRow = (text: string): {
  leadDate: string | null;
  operation: string | null;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  source: string | null;
} | null => {
  const trimmed = text.trim();
  // Split by tab; if only 1 part, try semicolon
  let parts = trimmed.split('\t').map(p => p.trim());
  if (parts.length < 3) {
    parts = trimmed.split(';').map(p => p.trim());
  }
  if (parts.length < 3) return null;

  // Fixed column order: F, Operation, E-mail, Telefonnummer, Vorname, Nachname, Source
  const [leadDate, operation, email, phone, firstName, lastName, source] = parts;
  return {
    leadDate: leadDate || null,
    operation: operation || null,
    email: email && email.includes('@') ? email : null,
    phone: phone || null,
    firstName: firstName || null,
    lastName: lastName || null,
    source: source?.toLowerCase().trim() || null,
  };
};

const handleLeadImport = async () => {
  const parsed = parseLeadRow(leadPasteText);
  if (!parsed || (!parsed.firstName && !parsed.email)) {
    toast({
      title: t('appointments.importFailed', 'Could not parse lead'),
      description: t('appointments.importFailedDesc', 'Please paste a tab-separated row: F, Operation, E-mail, Phone, Vorname, Nachname, Source'),
      variant: "destructive",
    });
    return;
  }

  // Auto-fill notes from Operation
  if (parsed.operation) {
    setNotes(parsed.operation);
  }

  // Auto-fill referral source from Source column (fb/ig)
  if (parsed.source === 'fb' || parsed.source === 'ig') {
    setReferralSource("social");
    setReferralSourceDetail(parsed.source === 'fb' ? "facebook" : "instagram");
  }

  // Store lead date for referral event
  if (parsed.leadDate) {
    setReferralCreatedAt(parsed.leadDate);
  }

  // Try to find existing patient by searching name or email
  setLeadImportPending(true);
  try {
    const searchTerm = parsed.email || `${parsed.firstName || ''} ${parsed.lastName || ''}`.trim();
    const response = await fetch(`/api/patients?hospitalId=${hospitalId}&search=${encodeURIComponent(searchTerm)}`);
    if (response.ok) {
      const existingPatients: Patient[] = await response.json();
      // Check for match by email or name
      const match = existingPatients.find(p =>
        (parsed.email && p.email?.toLowerCase() === parsed.email.toLowerCase()) ||
        (parsed.firstName && parsed.lastName &&
          p.firstName.toLowerCase() === parsed.firstName.toLowerCase() &&
          p.surname.toLowerCase() === parsed.lastName.toLowerCase())
      );

      if (match) {
        // Patient exists — select them, close panel
        setSelectedPatientId(match.id);
        setPatientSearch(`${match.firstName} ${match.surname}`);
        setShowLeadImport(false);
        setLeadPasteText("");
        toast({
          title: t('appointments.patientFound', 'Existing patient found'),
          description: `${match.firstName} ${match.surname}`,
        });
      } else {
        // No match — create new patient (panel closes via createPatientMutation.onSuccess)
        createPatientMutation.mutate({
          hospitalId,
          firstName: (parsed.firstName || '').trim(),
          surname: (parsed.lastName || '').trim(),
          birthday: "1900-01-01", // Unknown — lead Excel doesn't include DOB
          sex: "O",
          email: parsed.email || undefined,
          phone: parsed.phone || undefined,
        });
      }
    }
  } catch (err) {
    toast({
      title: t('appointments.importFailed', 'Could not parse lead'),
      description: String(err),
      variant: "destructive",
    });
  } finally {
    setLeadImportPending(false);
  }
};
```

- [ ] **Step 5: Reset lead import state in resetForm**

In `resetForm()` (line ~595-613), add:

```typescript
setShowLeadImport(false);
setLeadPasteText("");
setLeadImportPending(false);
setReferralCreatedAt(null);
```

- [ ] **Step 6: Add the import icon button next to Patient+**

In the patient search area (line ~662-670), after the existing `UserPlus` Button, add a second icon button:

```tsx
<Button
  variant="outline"
  size="icon"
  onClick={() => {
    setShowLeadImport(true);
    setShowNewPatientForm(false);
  }}
  title={t('appointments.importLead', 'Import from Lead')}
  data-testid="button-show-lead-import"
>
  <ClipboardPaste className="h-4 w-4" />
</Button>
```

- [ ] **Step 7: Add the lead paste panel**

The patient search section (line ~649-750) becomes a three-way view: lead import panel OR normal search OR new patient form. Wrap the existing `!showNewPatientForm` ternary in a broader check — if `showLeadImport` is true, show the import panel instead:

```tsx
{showLeadImport ? (
  <div className="border rounded-md p-4 space-y-3 mt-1">
    <div className="flex items-center justify-between mb-2">
      <h4 className="text-sm font-medium">{t('appointments.importLead', 'Import from Lead')}</h4>
      <Button variant="ghost" size="sm" onClick={() => { setShowLeadImport(false); setLeadPasteText(""); }}
        data-testid="button-cancel-lead-import">
        {t('common.cancel', 'Cancel')}
      </Button>
    </div>
    <Textarea
      value={leadPasteText}
      onChange={(e) => setLeadPasteText(e.target.value)}
      placeholder="F → Operation → E-mail → Telefonnummer → Vorname → Nachname → Source"
      rows={2}
      data-testid="textarea-lead-paste"
    />
    <p className="text-xs text-muted-foreground">
      {t('appointments.leadPasteHint', 'Paste one row from the leads Excel (tab-separated)')}
    </p>
    <Button onClick={handleLeadImport} disabled={leadImportPending || !leadPasteText.trim()}
      className="w-full" data-testid="button-import-lead">
      {leadImportPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {t('appointments.importAndCreate', 'Import & Create Patient')}
    </Button>
  </div>
) : !showNewPatientForm ? (
  // ... existing search input + Patient+ button + lead import button ...
) : (
  // ... existing new patient form ...
)}
```

- [ ] **Step 8: Run typecheck**

Run: `npm run check`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/clinic/Appointments.tsx
git commit -m "feat: add lead paste import in booking dialog with auto-fill"
```

---

### Task 2: Pass referralCreatedAt to backend

**Files:**
- Modify: `client/src/pages/clinic/Appointments.tsx:622-633` (handleSubmit payload)
- Modify: `server/routes/clinic.ts:2263-2292` (appointment creation endpoint)

- [ ] **Step 1: Include referralCreatedAt in the frontend submit payload**

In `handleSubmit` (line ~622-633), add `referralCreatedAt` to the mutation payload:

```typescript
createAppointmentMutation.mutate({
  patientId: selectedPatientId,
  providerId: selectedProviderId,
  serviceId: selectedServiceId || null,
  appointmentDate: selectedDate,
  startTime,
  endTime,
  notes: notes || null,
  isVideoAppointment,
  videoMeetingLink: videoMeetingLink || null,
  ...(referralSource ? { referralSource, referralSourceDetail: referralSourceDetail || null } : {}),
  ...(referralCreatedAt ? { referralCreatedAt } : {}),
});
```

- [ ] **Step 2: Accept and use referralCreatedAt on the server**

In `server/routes/clinic.ts`, at line ~2263 where referral fields are extracted:

```typescript
const { referralSource, referralSourceDetail, referralCreatedAt, ...appointmentBody } = req.body;
```

Then in the referral event insert (line ~2281-2288), parse the lead date and use it as `createdAt`:

```typescript
await db.insert(referralEvents).values({
  hospitalId,
  patientId: appointment.patientId,
  appointmentId: appointment.id,
  source: referralSource as "social" | "search_engine" | "llm" | "word_of_mouth" | "belegarzt" | "other",
  sourceDetail: referralSourceDetail || undefined,
  captureMethod: "staff",
  ...(referralCreatedAt ? { createdAt: parseLeadDate(referralCreatedAt) } : {}),
});
```

Add the `parseLeadDate` helper as a module-level function in `server/routes/clinic.ts`, right before the appointment creation route (place it above the `router.post("/:hospitalId/units/:unitId/appointments"` handler, around line ~2170):

```typescript
// Parse DD.MM.YYYY or YYYY-MM-DD date string to Date object
function parseLeadDate(dateStr: string): Date {
  const dotMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    return new Date(parseInt(dotMatch[3]), parseInt(dotMatch[2]) - 1, parseInt(dotMatch[1]));
  }
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }
  return new Date(); // Fallback to now
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/clinic/Appointments.tsx server/routes/clinic.ts
git commit -m "feat: pass lead date as referralCreatedAt to preserve original lead date"
```

---

### Task 3: Manual smoke test

**Files:** None (testing only)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test the happy path**

1. Go to clinic appointments calendar
2. Click a time slot to book
3. In the booking dialog, verify the new clipboard icon appears next to Patient+
4. Click it — verify the paste panel appears with textarea and hint text
5. Paste a test row: `01.03.2026	Brustvergrösserung	test@example.com	+41791234567	Maria	Müller	fb`
6. Click "Import & Create Patient"
7. Verify: patient "Maria Müller" is created/selected, notes = "Brustvergrösserung", referral = Social/Facebook
8. Complete the booking with a provider and time
9. Verify the appointment appears with correct referral source

- [ ] **Step 3: Test existing patient match**

1. Import the same lead row again
2. Verify it finds and selects the existing patient instead of creating a duplicate

- [ ] **Step 4: Test cancel/reset**

1. Open import panel, type something, click Cancel
2. Verify it returns to normal search view with cleared state

- [ ] **Step 5: Run lint + typecheck**

Run: `npm run check`
Expected: PASS
