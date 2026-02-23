# Hospital Default Language Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a hospital-level default language setting (de/en) and use it for all external surgery notification emails and SMS.

**Architecture:** New `default_language` column on hospitals table, exposed via Regional Preferences admin UI. Both notification flows (admin notification on new request + surgeon confirmation on scheduling) read `hospital.defaultLanguage` instead of hardcoding.

**Tech Stack:** Drizzle ORM, PostgreSQL, React, i18next, Resend email API, Vonage SMS

---

### Task 1: Schema + Migration

**Files:**
- Modify: `shared/schema.ts:66` (after `hourFormat` line)
- Create: migration file via `npm run db:generate`

**Step 1: Add column to schema**

In `shared/schema.ts`, add after line 66 (`hourFormat`):

```ts
defaultLanguage: varchar("default_language").default("de"), // Notification language: 'de' or 'en'
```

**Step 2: Generate migration**

Run: `npm run db:generate`

**Step 3: Make migration idempotent**

Open the generated migration SQL file in `migrations/`. Wrap the ALTER TABLE in:

```sql
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hospitals' AND column_name = 'default_language'
  ) THEN
    ALTER TABLE "hospitals" ADD COLUMN "default_language" varchar DEFAULT 'de';
  END IF;
END $$;
```

**Step 4: Push migration**

Run: `npm run db:migrate`

**Step 5: Commit**

```
feat: add defaultLanguage column to hospitals schema
```

---

### Task 2: Backend Validation

**Files:**
- Modify: `server/routes/admin.ts:30` (inside `updateHospitalSchema`)

**Step 1: Add to zod schema**

In `server/routes/admin.ts`, add to `updateHospitalSchema` after the `timezone` line (line 30):

```ts
defaultLanguage: z.enum(["de", "en"]).optional(),
```

**Step 2: Verify TypeScript compiles**

Run: `npm run check`

**Step 3: Commit**

```
feat: add defaultLanguage to hospital update validation
```

---

### Task 3: i18n Translation Keys

**Files:**
- Modify: `client/src/i18n/locales/en.json:~1553` (after `hourFormat12h`)
- Modify: `client/src/i18n/locales/de.json:~1638` (after `hourFormat12h`)

**Step 1: Add English keys**

After `"hourFormat12h": "12-hour (2:30 PM)"`, add:

```json
"defaultLanguage": "Default Language",
"defaultLanguageDescription": "Language used for automated emails and SMS notifications",
"defaultLanguageDe": "Deutsch",
"defaultLanguageEn": "English",
```

**Step 2: Add German keys**

After `"hourFormat12h": "12-Stunden (2:30 PM)"`, add:

```json
"defaultLanguage": "Standardsprache",
"defaultLanguageDescription": "Sprache für automatische E-Mails und SMS-Benachrichtigungen",
"defaultLanguageDe": "Deutsch",
"defaultLanguageEn": "English",
```

**Step 3: Commit**

```
feat: add i18n keys for default language setting
```

---

### Task 4: Admin UI — Regional Preferences Dropdown

**Files:**
- Modify: `client/src/pages/admin/Hospital.tsx:90-108` (hospitalForm initial state)
- Modify: `client/src/pages/admin/Hospital.tsx:719-737` (useEffect loading fullHospitalData)
- Modify: `client/src/pages/admin/Hospital.tsx:1293` (after Hour Format dropdown, before closing `</div>` of the grid)

**Step 1: Add to form initial state**

At line 107, after `timezone: "Europe/Zurich" as string,`, add:

```ts
defaultLanguage: "de" as string,
```

**Step 2: Add to useEffect data loading**

At line 736, after `timezone: fullHospitalData.timezone || "Europe/Zurich",`, add:

```ts
defaultLanguage: fullHospitalData.defaultLanguage || "de",
```

**Step 3: Add dropdown to Regional Preferences tab**

After the Hour Format `</div>` (line 1293), add a new dropdown inside the grid:

```tsx
{/* Default Language */}
<div>
  <Label>{t("admin.defaultLanguage", "Default Language")}</Label>
  <Select
    value={hospitalForm.defaultLanguage}
    onValueChange={(value) => setHospitalForm(prev => ({ ...prev, defaultLanguage: value }))}
  >
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="de">{t("admin.defaultLanguageDe", "Deutsch")}</SelectItem>
      <SelectItem value="en">{t("admin.defaultLanguageEn", "English")}</SelectItem>
    </SelectContent>
  </Select>
  <p className="text-xs text-muted-foreground mt-1">{t("admin.defaultLanguageDescription", "Language used for automated emails and SMS notifications")}</p>
</div>
```

**Step 4: Verify it compiles**

Run: `npm run check`

**Step 5: Commit**

```
feat: add Default Language dropdown to Regional Preferences
```

---

### Task 5: Use `defaultLanguage` in Admin Notification (New Request)

**Files:**
- Modify: `server/routes/externalSurgery.ts:186` (hardcoded `'de'`)
- Modify: `server/routes/externalSurgery.ts:227` (hardcoded `'de'`)

**Step 1: Replace hardcoded language in dedicated email path**

At line 186, change:

```ts
'de'
```

to:

```ts
(result.hospital.defaultLanguage as 'de' | 'en') || 'de'
```

**Step 2: Replace hardcoded language in OR-admin fallback path**

At line 227, change the same way:

```ts
(result.hospital.defaultLanguage as 'de' | 'en') || 'de'
```

**Step 3: Verify TypeScript compiles**

Run: `npm run check`

**Step 4: Commit**

```
feat: use hospital defaultLanguage for admin notification emails
```

---

### Task 6: Bilingual Surgeon Confirmation Email

**Files:**
- Modify: `server/routes/externalSurgery.ts:573-621` (inline English-only HTML)

**Step 1: Refactor confirmation email to be bilingual**

Replace the entire block from line 573 (`if (sendConfirmation) {`) through line 641 (closing `}` of `sendConfirmation` block) with:

```ts
if (sendConfirmation) {
  const hospital = await storage.getHospital(request.hospitalId);
  const hospitalName = hospital?.name || 'the hospital';
  const lang = (hospital?.defaultLanguage as 'de' | 'en') || 'de';
  const isGerman = lang === 'de';
  const dateLocale = isGerman ? 'de-CH' : 'en-GB';
  const formattedDate = new Date(plannedDate).toLocaleDateString(dateLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Try email first; only fall back to SMS if email wasn't sent
  let emailSent = false;
  if (request.surgeonEmail) {
    try {
      const resendApiKey = process.env.RESEND_API_KEY;
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);

        const subjectText = request.isReservationOnly
          ? (isGerman ? `Slot-Reservierung bestätigt – ${formattedDate}` : `Slot Reservation Confirmed - ${formattedDate}`)
          : (isGerman
            ? `OP bestätigt – ${request.patientLastName}, ${request.patientFirstName}`
            : `Surgery Confirmed - ${request.patientLastName}, ${request.patientFirstName}`);

        const headingText = request.isReservationOnly
          ? (isGerman ? 'Slot-Reservierung bestätigt' : 'Slot Reservation Confirmed')
          : (isGerman ? 'OP-Reservierung bestätigt' : 'Surgery Reservation Confirmed');

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'noreply@mail.viali.app',
          to: request.surgeonEmail,
          subject: subjectText,
          html: `
            <h2>${headingText}</h2>
            <p>${isGerman ? 'Sehr geehrte/r Dr.' : 'Dear Dr.'} ${request.surgeonLastName},</p>
            <p>${isGerman
              ? `Ihre ${request.isReservationOnly ? 'Slot-Reservierung' : 'OP-Reservierung'} wurde bei ${hospitalName} bestätigt.`
              : `Your ${request.isReservationOnly ? 'slot reservation' : 'surgery reservation'} request has been confirmed at ${hospitalName}.`}</p>
            <h3>${isGerman ? 'Details:' : 'Details:'}</h3>
            <ul>
              ${!request.isReservationOnly ? `<li><strong>${isGerman ? 'Patient' : 'Patient'}:</strong> ${request.patientLastName}, ${request.patientFirstName}</li>` : ''}
              <li><strong>${isGerman ? 'Eingriff' : 'Surgery'}:</strong> ${request.surgeryName || (isGerman ? 'Slot-Reservierung' : 'Slot Reservation')}</li>
              <li><strong>${isGerman ? 'Datum' : 'Date'}:</strong> ${formattedDate}</li>
              <li><strong>${isGerman ? 'Dauer' : 'Duration'}:</strong> ${request.surgeryDurationMinutes} ${isGerman ? 'Minuten' : 'minutes'}</li>
              <li><strong>${isGerman ? 'Anästhesie' : 'Anesthesia'}:</strong> ${request.withAnesthesia ? (isGerman ? 'Ja' : 'Yes') : (isGerman ? 'Nein' : 'No')}</li>
            </ul>
            <p>${isGerman ? 'Bei Fragen kontaktieren Sie uns bitte direkt.' : 'If you have any questions, please contact us directly.'}</p>
            <p>${isGerman ? 'Freundliche Grüsse' : 'Best regards'},<br>${hospitalName}</p>
          `,
        });

        await storage.updateExternalSurgeryRequest(id, {
          confirmationEmailSent: true,
        });
        emailSent = true;
      }
    } catch (emailError) {
      logger.error("Error sending confirmation email:", emailError);
    }
  }

  // SMS only as fallback when email wasn't available or failed
  if (!emailSent && request.surgeonPhone && (await isSmsConfiguredForHospital(request.hospitalId) || isSmsConfigured())) {
    try {
      const smsText = request.isReservationOnly
        ? (isGerman
          ? `Slot-Reservierung bestätigt bei ${hospitalName} am ${formattedDate}. – ${hospitalName}`
          : `Slot reservation confirmed at ${hospitalName} on ${formattedDate}. - ${hospitalName}`)
        : (isGerman
          ? `OP bestätigt bei ${hospitalName}: ${request.patientLastName}, ${request.patientFirstName} am ${formattedDate}. – ${hospitalName}`
          : `Surgery confirmed at ${hospitalName}: ${request.patientLastName}, ${request.patientFirstName} on ${formattedDate}. - ${hospitalName}`);
      await sendSms(
        request.surgeonPhone,
        smsText,
        request.hospitalId
      );

      await storage.updateExternalSurgeryRequest(id, {
        confirmationSmsSent: true,
      });
    } catch (smsError) {
      logger.error("Error sending confirmation SMS:", smsError);
    }
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run check`

**Step 3: Commit**

```
feat: make surgeon confirmation email/SMS bilingual using hospital defaultLanguage
```

---

### Task 7: Final Verification

**Step 1: TypeScript check**

Run: `npm run check`
Expected: Clean pass

**Step 2: Build**

Run: `npm run build`
Expected: Clean build

**Step 3: Final commit if any fixups needed, then done**
