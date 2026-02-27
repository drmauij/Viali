# External Surgery Address Fields + Patient Dedup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add address fields (street, postal code, city) to the external surgery reservation form's patient step, store them in the DB, and deduplicate patients by name+birthday when scheduling.

**Architecture:** Three-layer change — DB schema + migration, server Zod validation + scheduling logic, client form UI. No new storage functions needed: `findPatientByNameAndBirthday` already exists in `server/storage/anesthesia.ts:278`.

**Tech Stack:** Drizzle ORM, Zod, React, `AddressAutocomplete` (Mapbox), Vitest

---

### Task 1: Add address columns to `externalSurgeryRequests` schema

**Files:**
- Modify: `shared/schema.ts` (around line 4848)

**Step 1: Add 3 nullable varchar columns after `patientPhone`**

In `shared/schema.ts`, find the patient info block (around line 4844–4849):
```ts
  // Patient info (nullable for reservation-only requests)
  patientFirstName: varchar("patient_first_name"),
  patientLastName: varchar("patient_last_name"),
  patientBirthday: date("patient_birthday"),
  patientEmail: varchar("patient_email"),
  patientPhone: varchar("patient_phone"),
```

Add 3 lines after `patientPhone`:
```ts
  patientStreet: varchar("patient_street"),
  patientPostalCode: varchar("patient_postal_code"),
  patientCity: varchar("patient_city"),
```

**Step 2: Generate migration**

```bash
npm run db:generate
```

Expected: new file created at `migrations/0144_*.sql`

**Step 3: Make the migration idempotent**

Open the newly generated `migrations/0144_*.sql`. It will contain lines like:
```sql
ALTER TABLE "external_surgery_requests" ADD COLUMN "patient_street" varchar;
ALTER TABLE "external_surgery_requests" ADD COLUMN "patient_postal_code" varchar;
ALTER TABLE "external_surgery_requests" ADD COLUMN "patient_city" varchar;
```

Replace each with the idempotent form:
```sql
ALTER TABLE "external_surgery_requests" ADD COLUMN IF NOT EXISTS "patient_street" varchar;
--> statement-breakpoint
ALTER TABLE "external_surgery_requests" ADD COLUMN IF NOT EXISTS "patient_postal_code" varchar;
--> statement-breakpoint
ALTER TABLE "external_surgery_requests" ADD COLUMN IF NOT EXISTS "patient_city" varchar;
```

**Step 4: Verify journal timestamp**

```bash
cat migrations/meta/_journal.json | python3 -c "import json,sys; j=json.load(sys.stdin); e=j['entries'][-1]; print(e['idx'], e['when'])"
```

Expected: `144 <timestamp higher than 1772169898614>`. If not, update the `when` field in `_journal.json` to `Date.now()`.

**Step 5: Apply migration**

```bash
npm run db:migrate
```

Expected: "Changes applied" with no errors.

**Step 6: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat(db): add patient address columns to external_surgery_requests"
```

---

### Task 2: Update server Zod schema + scheduling flow

**Files:**
- Modify: `server/routes/externalSurgery.ts`

**Step 1: Add address fields to the Zod schema**

Find `externalSurgeryRequestSchema` (around line 89). It currently ends with `patientPhone` and `patientPosition` fields. Add 3 address fields after `patientPhone` (around line 104), using the same optional/nullable pattern:

```ts
  patientPhone: z.string().optional().nullable().transform(v => v === '' ? null : v),
  patientStreet: z.string().optional().nullable().transform(v => v === '' ? null : v),
  patientPostalCode: z.string().optional().nullable().transform(v => v === '' ? null : v),
  patientCity: z.string().optional().nullable().transform(v => v === '' ? null : v),
```

**Step 2: Update the `.refine()` required check**

Find the `.refine()` block (around line 108–113):
```ts
}).refine((data) => {
  if (!data.isReservationOnly) {
    return !!(data.patientFirstName && data.patientLastName && data.patientBirthday && data.patientPhone && data.surgeryName);
  }
  return true;
```

Add address fields to the check:
```ts
}).refine((data) => {
  if (!data.isReservationOnly) {
    return !!(
      data.patientFirstName && data.patientLastName &&
      data.patientBirthday && data.patientPhone &&
      data.patientStreet && data.patientPostalCode && data.patientCity &&
      data.surgeryName
    );
  }
  return true;
```

**Step 3: Replace the patient creation block with dedup logic**

Find the patient creation block (around line 456–471):
```ts
    // Create or find patient (skip for reservation-only requests)
    let patientId = request.patientId;
    if (!patientId && !request.isReservationOnly && request.patientFirstName && request.patientLastName && request.patientBirthday) {
      const patientNumber = await storage.generatePatientNumber(request.hospitalId);
      const patient = await storage.createPatient({
        hospitalId: request.hospitalId,
        firstName: request.patientFirstName,
        surname: request.patientLastName,
        birthday: request.patientBirthday,
        patientNumber,
        sex: 'O',
        email: request.patientEmail || undefined,
        phone: request.patientPhone || undefined,
      });
      patientId = patient.id;
    }
```

Replace the entire block with:
```ts
    // Create or find patient (skip for reservation-only requests)
    let patientId = request.patientId;
    if (!patientId && !request.isReservationOnly && request.patientFirstName && request.patientLastName && request.patientBirthday) {
      // Dedup check: reuse existing patient if name+birthday matches
      const existing = await storage.findPatientByNameAndBirthday(
        request.hospitalId,
        request.patientLastName,
        request.patientFirstName,
        request.patientBirthday,
      );

      if (existing) {
        patientId = existing.id;
        // Back-fill address if the existing patient record has any blank address fields
        const needsAddressUpdate =
          request.patientStreet || request.patientPostalCode || request.patientCity;
        if (needsAddressUpdate) {
          const addressPatch: Record<string, string> = {};
          if (!existing.street && request.patientStreet) addressPatch.street = request.patientStreet;
          if (!existing.postalCode && request.patientPostalCode) addressPatch.postalCode = request.patientPostalCode;
          if (!existing.city && request.patientCity) addressPatch.city = request.patientCity;
          if (Object.keys(addressPatch).length > 0) {
            await storage.updatePatient(existing.id, addressPatch);
          }
        }
      } else {
        const patientNumber = await storage.generatePatientNumber(request.hospitalId);
        const patient = await storage.createPatient({
          hospitalId: request.hospitalId,
          firstName: request.patientFirstName,
          surname: request.patientLastName,
          birthday: request.patientBirthday,
          patientNumber,
          sex: 'O',
          email: request.patientEmail || undefined,
          phone: request.patientPhone || undefined,
          street: request.patientStreet || undefined,
          postalCode: request.patientPostalCode || undefined,
          city: request.patientCity || undefined,
        });
        patientId = patient.id;
      }
    }
```

**Step 4: Run TypeScript check**

```bash
npm run check
```

Expected: no errors. Fix any type errors before continuing.

**Step 5: Commit**

```bash
git add server/routes/externalSurgery.ts
git commit -m "feat(server): add address fields to external surgery schema + patient dedup on schedule"
```

---

### Task 3: Add address fields to the client form

**Files:**
- Modify: `client/src/pages/ExternalSurgeryRequest.tsx`

**Step 1: Extend the `FormData` interface**

Find the `interface FormData` block (line 41). After `patientEmail: string;` (line 60), add:
```ts
  patientStreet: string;
  patientPostalCode: string;
  patientCity: string;
```

**Step 2: Add initial state values**

Find the initial `useState` for `formData` (around line 121). After `patientEmail: '',` (line 126), add:
```ts
    patientStreet: '',
    patientPostalCode: '',
    patientCity: '',
```

**Step 3: Import `AddressAutocomplete`**

At the top of the file, after the existing import on line 39, add:
```ts
import AddressAutocomplete from "@/components/AddressAutocomplete";
```

**Step 4: Add `AddressAutocomplete` to step 3 UI**

Find the closing of the `patientEmail` field block in step 3 (around line 898):
```tsx
                  />
                </div>
              </div>
            )}
```

Insert before the closing `</div></div>` (after the email `</div>`, before `</div>`  closing the step):
```tsx
                <div className="space-y-2">
                  <AddressAutocomplete
                    showLabels
                    values={{
                      street: formData.patientStreet,
                      postalCode: formData.patientPostalCode,
                      city: formData.patientCity,
                    }}
                    onChange={(addr) => {
                      updateField('patientStreet', addr.street);
                      updateField('patientPostalCode', addr.postalCode);
                      updateField('patientCity', addr.city);
                    }}
                  />
                </div>
```

The label "Street, Nr." / "PLZ" / "City" is rendered by `AddressAutocomplete` when `showLabels` is true. If you want to show "Address *" as a section label above it, add a `<Label>` before the component:
```tsx
                  <Label>
                    {t('surgery.externalRequest.address', 'Address')} *
                  </Label>
```

**Step 5: Update step 3 validation**

Find the `case 'patient':` block (around line 275):
```ts
      case 'patient':
        return formData.patientFirstName && formData.patientLastName &&
               formData.patientBirthday && formData.patientPhone;
```

Add address fields:
```ts
      case 'patient':
        return formData.patientFirstName && formData.patientLastName &&
               formData.patientBirthday && formData.patientPhone &&
               formData.patientStreet && formData.patientPostalCode && formData.patientCity;
```

**Step 6: Run TypeScript check**

```bash
npm run check
```

Expected: no errors. Fix any type errors before continuing.

**Step 7: Commit**

```bash
git add client/src/pages/ExternalSurgeryRequest.tsx
git commit -m "feat(ui): add address fields to external surgery patient step with Mapbox autocomplete"
```

---

### Task 4: Manual smoke test

**Step 1: Start dev server**
```bash
npm run dev
```

**Step 2: Open the form**

Navigate to `http://localhost:5000/external-surgery/<token>` (use the token from the URL in the task description: `mWbnplC0zXPocWYEfGhqakBz`).

**Step 3: Fill steps 1–2, reach step 3 (Patient Information)**

Verify:
- Address fields render with Mapbox autocomplete
- Typing a street shows suggestions
- Selecting a suggestion auto-fills postal code + city
- "Next" button stays disabled until all 3 address fields are filled

**Step 4: Test reservation-only mode**

Toggle "Reserve time slot only" on step 2 — step 3 (patient info) should be skipped entirely, no address required.

**Step 5: Submit and check DB**

After submission, verify in DB:
```sql
SELECT patient_first_name, patient_last_name, patient_street, patient_postal_code, patient_city
FROM external_surgery_requests
ORDER BY created_at DESC LIMIT 1;
```

**Step 6: Final typecheck**

```bash
npm run check
```

Expected: no errors.
