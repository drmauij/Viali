# Coverage Type (Kostenträger) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `coverageType` varchar field to surgeries and external surgery requests so users can track whether a patient is Selbstzahler (self-payer), Krankenkasse (insurance), or another coverage type.

**Architecture:** New nullable varchar column on both `surgeries` and `external_surgery_requests` tables. UI presents common presets (Selbstzahler, Krankenkasse) as selectable options with free-text fallback. The field flows from external request → surgery when scheduling.

**Tech Stack:** Drizzle ORM, PostgreSQL, React, shadcn/ui Select, i18next

---

### Task 1: Schema & Migration

**Files:**
- Modify: `shared/schema.ts:975` (surgeries table, Business/Billing section)
- Modify: `shared/schema.ts:4990` (externalSurgeryRequests table, after diagnosis)
- Create: `migrations/XXXX_*.sql` (auto-generated, then made idempotent)

- [ ] **Step 1: Add `coverageType` to surgeries table**

In `shared/schema.ts`, in the `surgeries` table definition, after the `price` line (~line 976), add:

```typescript
coverageType: varchar("coverage_type"), // Kostenträger: Selbstzahler, Krankenkasse, etc.
```

- [ ] **Step 2: Add `coverageType` to externalSurgeryRequests table**

In `shared/schema.ts`, in the `externalSurgeryRequests` table definition, after the `diagnosis` line (~line 4990), add:

```typescript
coverageType: varchar("coverage_type"), // Kostenträger: Selbstzahler, Krankenkasse, etc.
```

- [ ] **Step 3: Generate migration**

Run: `npm run db:generate`

- [ ] **Step 4: Verify migration is idempotent**

Open the generated `.sql` file. It should contain:
```sql
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "coverage_type" varchar;--> statement-breakpoint
ALTER TABLE "external_surgery_requests" ADD COLUMN IF NOT EXISTS "coverage_type" varchar;
```

If `IF NOT EXISTS` is missing, add it manually.

- [ ] **Step 5: Verify journal timestamp**

Check `migrations/meta/_journal.json` — the new entry's `when` value must be higher than ALL previous entries.

- [ ] **Step 6: Run migration**

Run: `npm run db:migrate`

- [ ] **Step 7: TypeScript check**

Run: `npm run check`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat: add coverageType (Kostenträger) field to surgeries and external surgery requests"
```

---

### Task 2: i18n Translations

**Files:**
- Modify: `client/src/i18n/locales/de.json`
- Modify: `client/src/i18n/locales/en.json`

- [ ] **Step 1: Add German translations**

In `de.json`, add to the `surgery.externalRequest` section (after `"diagnosis"` key, ~line 4908):

```json
"coverageType": "Kostenträger",
"coverageTypePlaceholder": "Bitte wählen...",
"coverageTypeSelbstzahler": "Selbstzahler",
"coverageTypeKrankenkasse": "Krankenkasse",
"coverageTypeOther": "Andere..."
```

Also add to the `surgery.externalRequests` section (after `"diagnosis"` key, ~line 4852):

```json
"coverageType": "Kostenträger"
```

Also add to the `surgeryPlanning` section (near `"paymentMethod"`, ~line 5844):

```json
"coverageType": "Kostenträger"
```

Also add to the `anesthesia.quickSchedule` section (near `"diagnosis"` key):

```json
"coverageType": "Kostenträger",
"coverageTypePlaceholder": "Bitte wählen...",
"coverageTypeSelbstzahler": "Selbstzahler",
"coverageTypeKrankenkasse": "Krankenkasse",
"coverageTypeOther": "Andere..."
```

- [ ] **Step 2: Add English translations**

Mirror the same keys in `en.json` at the corresponding sections:

In `surgery.externalRequest`:
```json
"coverageType": "Coverage Type",
"coverageTypePlaceholder": "Please select...",
"coverageTypeSelbstzahler": "Self-payer",
"coverageTypeKrankenkasse": "Insurance",
"coverageTypeOther": "Other..."
```

In `surgery.externalRequests`:
```json
"coverageType": "Coverage Type"
```

In `surgeryPlanning`:
```json
"coverageType": "Coverage Type"
```

In `anesthesia.quickSchedule`:
```json
"coverageType": "Coverage Type",
"coverageTypePlaceholder": "Please select...",
"coverageTypeSelbstzahler": "Self-payer",
"coverageTypeKrankenkasse": "Insurance",
"coverageTypeOther": "Other..."
```

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/locales/de.json client/src/i18n/locales/en.json
git commit -m "feat: add coverageType i18n translations (DE/EN)"
```

---

### Task 3: External Surgery Request Form (Public Anmeldung)

**Files:**
- Modify: `client/src/pages/ExternalSurgeryRequest.tsx:43-71` (FormData interface)
- Modify: `client/src/pages/ExternalSurgeryRequest.tsx:120-145` (initial state)
- Modify: `client/src/pages/ExternalSurgeryRequest.tsx:~815` (after diagnosis field in JSX)

- [ ] **Step 1: Add to FormData interface**

In `ExternalSurgeryRequest.tsx`, in the `FormData` interface (~line 59, after `diagnosis: string;`), add:

```typescript
coverageType: string;
```

- [ ] **Step 2: Add initial state**

In the `useState<FormData>` initial value (~line 136, after `diagnosis: '',`), add:

```typescript
coverageType: '',
```

- [ ] **Step 3: Add UI field after diagnosis**

After the diagnosis `</div>` (~line 815), before the scheduling section divider (~line 817), add a coverage type selector:

```tsx
{/* Coverage Type (Kostenträger) */}
<div className="space-y-2">
  <Label htmlFor="coverageType">
    {t('surgery.externalRequest.coverageType')}
  </Label>
  <Select
    value={formData.coverageType}
    onValueChange={(value) => {
      if (value === '__other__') {
        updateField('coverageType', '');
        // Focus the input after render
        setTimeout(() => document.getElementById('coverageTypeCustom')?.focus(), 0);
      } else {
        updateField('coverageType', value);
      }
    }}
  >
    <SelectTrigger data-testid="select-coverage-type">
      <SelectValue placeholder={t('surgery.externalRequest.coverageTypePlaceholder')} />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="Selbstzahler">{t('surgery.externalRequest.coverageTypeSelbstzahler')}</SelectItem>
      <SelectItem value="Krankenkasse">{t('surgery.externalRequest.coverageTypeKrankenkasse')}</SelectItem>
      <SelectItem value="__other__">{t('surgery.externalRequest.coverageTypeOther')}</SelectItem>
    </SelectContent>
  </Select>
  {formData.coverageType !== '' && formData.coverageType !== 'Selbstzahler' && formData.coverageType !== 'Krankenkasse' && (
    <Input
      id="coverageTypeCustom"
      value={formData.coverageType}
      onChange={(e) => updateField('coverageType', e.target.value)}
      placeholder={t('surgery.externalRequest.coverageTypePlaceholder')}
      data-testid="input-coverage-type-custom"
    />
  )}
</div>
```

Note: `Select` from shadcn/ui is already imported in this file. Check if it is — if not, add it to the imports.

- [ ] **Step 4: Verify Select import**

Check the imports at the top of `ExternalSurgeryRequest.tsx`. If `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` are not imported, add:

```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
```

- [ ] **Step 5: TypeScript check**

Run: `npm run check`

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/ExternalSurgeryRequest.tsx
git commit -m "feat: add coverageType selector to external surgery request form"
```

---

### Task 4: Server-side — External Surgery Request Validation & Flow

**Files:**
- Modify: `server/routes/externalSurgery.ts:107` (add to validation schema)
- Modify: `server/routes/externalSurgery.ts:~830` (pass to surgery creation)

- [ ] **Step 1: Add to validation schema**

In `server/routes/externalSurgery.ts`, in the `externalSurgeryRequestSchema` z.object, after the `diagnosis` line (~line 107), add:

```typescript
coverageType: z.string().optional().nullable().transform(v => v === '' ? null : v),
```

- [ ] **Step 2: Pass coverageType when creating surgery from external request**

In the surgery creation block (~line 830, after `diagnosis: request.diagnosis || null,`), add:

```typescript
coverageType: request.coverageType || null,
```

- [ ] **Step 3: TypeScript check**

Run: `npm run check`

- [ ] **Step 4: Commit**

```bash
git add server/routes/externalSurgery.ts
git commit -m "feat: add coverageType to external surgery request validation and flow"
```

---

### Task 5: SurgeryFormFields (Shared Internal Form Component)

**Files:**
- Modify: `client/src/components/anesthesia/SurgeryFormFields.tsx:22-71` (props interface)
- Modify: `client/src/components/anesthesia/SurgeryFormFields.tsx:73-88` (destructuring)
- Modify: `client/src/components/anesthesia/SurgeryFormFields.tsx:~748` (after diagnosis field, JSX)

- [ ] **Step 1: Add to props interface**

In `SurgeryFormFieldsProps` (~line 33, after `diagnosis: string;`), add:

```typescript
coverageType: string;
```

In the change handlers section (~line 52, after `onDiagnosisChange`), add:

```typescript
onCoverageTypeChange: (v: string) => void;
```

- [ ] **Step 2: Add to destructured props**

In the function signature destructuring (~line 75, after `diagnosis`), add `coverageType` to the values and `onCoverageTypeChange` to the handlers.

- [ ] **Step 3: Add UI field after diagnosis**

After the diagnosis `</div>` block (~line 748, before the implant details block), add:

```tsx
{/* Coverage Type (Kostenträger) - hidden in slot reservation mode */}
{!isSlotReservation && (
  <div className="space-y-2">
    <Label>{t('anesthesia.quickSchedule.coverageType')} <span className="text-xs text-muted-foreground">({t('anesthesia.quickSchedule.optional', 'opt.')})</span></Label>
    <Select
      value={coverageType || undefined}
      onValueChange={(value) => {
        if (value === '__other__') {
          onCoverageTypeChange('');
        } else {
          onCoverageTypeChange(value);
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger data-testid={tid("select-coverage-type")}>
        <SelectValue placeholder={t('anesthesia.quickSchedule.coverageTypePlaceholder')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Selbstzahler">{t('anesthesia.quickSchedule.coverageTypeSelbstzahler')}</SelectItem>
        <SelectItem value="Krankenkasse">{t('anesthesia.quickSchedule.coverageTypeKrankenkasse')}</SelectItem>
        <SelectItem value="__other__">{t('anesthesia.quickSchedule.coverageTypeOther')}</SelectItem>
      </SelectContent>
    </Select>
    {coverageType !== '' && coverageType !== 'Selbstzahler' && coverageType !== 'Krankenkasse' && coverageType && (
      <Input
        value={coverageType}
        onChange={(e) => onCoverageTypeChange(e.target.value)}
        placeholder={t('anesthesia.quickSchedule.coverageTypePlaceholder')}
        disabled={disabled}
        data-testid={tid("input-coverage-type-custom")}
      />
    )}
  </div>
)}
```

- [ ] **Step 4: Verify Select import**

Check if `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` are imported. They should be (line 8). If not, add the import.

- [ ] **Step 5: TypeScript check**

Run: `npm run check`

- [ ] **Step 6: Commit**

```bash
git add client/src/components/anesthesia/SurgeryFormFields.tsx
git commit -m "feat: add coverageType field to SurgeryFormFields component"
```

---

### Task 6: QuickCreateSurgeryDialog

**Files:**
- Modify: `client/src/components/anesthesia/QuickCreateSurgeryDialog.tsx:82` (state)
- Modify: `client/src/components/anesthesia/QuickCreateSurgeryDialog.tsx:~347` (submit payload)
- Modify: `client/src/components/anesthesia/QuickCreateSurgeryDialog.tsx:~590` (SurgeryFormFields props)

- [ ] **Step 1: Add state**

After `const [diagnosis, setDiagnosis] = useState("");` (~line 82), add:

```typescript
const [coverageType, setCoverageType] = useState("");
```

- [ ] **Step 2: Add to submit payload**

In the `createSurgeryMutation.mutate()` call (~line 347, after `diagnosis`), add:

```typescript
coverageType: coverageType.trim() || undefined,
```

- [ ] **Step 3: Add props to SurgeryFormFields**

In the `<SurgeryFormFields>` component usage (~line 591, after `diagnosis={diagnosis}`), add:

```tsx
coverageType={coverageType}
```

And after `onDiagnosisChange={setDiagnosis}` (~line 608), add:

```tsx
onCoverageTypeChange={setCoverageType}
```

- [ ] **Step 4: Reset coverageType in form reset**

Find the `resetForm` function and add `setCoverageType("");` alongside the other state resets.

- [ ] **Step 5: TypeScript check**

Run: `npm run check`

- [ ] **Step 6: Commit**

```bash
git add client/src/components/anesthesia/QuickCreateSurgeryDialog.tsx
git commit -m "feat: add coverageType to QuickCreateSurgeryDialog"
```

---

### Task 7: EditSurgeryDialog

**Files:**
- Modify: `client/src/components/anesthesia/EditSurgeryDialog.tsx:57` (state)
- Modify: `client/src/components/anesthesia/EditSurgeryDialog.tsx:~207` (load from surgery)
- Modify: `client/src/components/anesthesia/EditSurgeryDialog.tsx:~259` (update payload)
- Modify: `client/src/components/anesthesia/EditSurgeryDialog.tsx:~600` (SurgeryFormFields props)

- [ ] **Step 1: Add state**

After `const [diagnosis, setDiagnosis] = useState("");` (~line 57), add:

```typescript
const [coverageType, setCoverageType] = useState("");
```

- [ ] **Step 2: Load from surgery data**

After `setDiagnosis(surgery.diagnosis || "");` (~line 207), add:

```typescript
setCoverageType(surgery.coverageType || "");
```

- [ ] **Step 3: Add to update payload**

In the `apiRequest("PATCH", ...)` body (~line 259, after `diagnosis: diagnosis || null,`), add:

```typescript
coverageType: coverageType || null,
```

- [ ] **Step 4: Add props to SurgeryFormFields**

In the `<SurgeryFormFields>` props (~line 600, after `diagnosis={diagnosis}`), add:

```tsx
coverageType={coverageType}
```

And after `onDiagnosisChange={setDiagnosis}`, add:

```tsx
onCoverageTypeChange={setCoverageType}
```

- [ ] **Step 5: TypeScript check**

Run: `npm run check`

- [ ] **Step 6: Commit**

```bash
git add client/src/components/anesthesia/EditSurgeryDialog.tsx
git commit -m "feat: add coverageType to EditSurgeryDialog"
```

---

### Task 8: Display in SurgeryPlanningTable & ExternalReservationsPanel

**Files:**
- Modify: `client/src/components/shared/SurgeryPlanningTable.tsx:~2033` (expanded row payment info)
- Modify: `client/src/components/surgery/ExternalReservationsPanel.tsx:~339` (request details)

- [ ] **Step 1: Add to SurgeryPlanningTable expanded row**

In the payment info section (~line 2033, before or after the paymentMethod line), add:

```tsx
<p><span className="text-muted-foreground">{t("surgeryPlanning.coverageType")}:</span> {surgery.coverageType ?? "-"}</p>
```

- [ ] **Step 2: Add to ExternalReservationsPanel request details**

In the surgery info block (~line 339, after the diagnosis display), add:

```tsx
{request.coverageType && (
  <p className="text-sm text-muted-foreground">
    {t('surgery.externalRequests.coverageType')}: {request.coverageType}
  </p>
)}
```

- [ ] **Step 3: TypeScript check**

Run: `npm run check`

- [ ] **Step 4: Commit**

```bash
git add client/src/components/shared/SurgeryPlanningTable.tsx client/src/components/surgery/ExternalReservationsPanel.tsx
git commit -m "feat: display coverageType in surgery planning table and external requests panel"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run full TypeScript check**

Run: `npm run check`
Expected: no errors

- [ ] **Step 2: Run dev server and test**

Run: `npm run dev`

Manual tests:
1. Open external surgery request form → verify coverageType dropdown appears after diagnosis
2. Create a surgery via QuickCreateSurgeryDialog → verify coverageType field exists
3. Edit a surgery → verify coverageType loads and saves
4. Check surgery planning table expanded row → verify coverageType displays
5. Select "Andere..." → verify free text input appears

- [ ] **Step 3: Final commit if any fixes needed**
