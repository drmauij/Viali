# Referral Booking Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move referral source collection from the patient formulaire to the public booking page, with UTM/ref auto-detection and a dedicated `referral_events` table.

**Architecture:** New `referral_events` table stores all referral data with FKs to hospitals, patients, and appointments (SET NULL on delete). The booking page gets a new "referral" step using an extracted shared component. UTM/ref params auto-map to referral sources and bypass the manual step. Dashboard endpoints switch from querying questionnaire responses to the new table.

**Tech Stack:** Drizzle ORM, PostgreSQL, React, TanStack Router, TanStack Query, Zod, Recharts, i18next

**Spec:** `docs/superpowers/specs/2026-03-19-referral-booking-migration-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `shared/schema.ts` (append) | `referralEvents` table + `enableReferralOnBooking` column on hospitals |
| Create | `client/src/components/ReferralSourcePicker.tsx` | Shared icon-grid referral UI component |
| Create | `shared/referralMapping.ts` | UTM → source mapping logic (shared between client skip-logic and server validation) |
| Modify | `client/src/pages/BookAppointment.tsx` | Add referral step, UTM/ref parsing, conditional step logic |
| Modify | `server/routes/clinic.ts:358-526` | Extend booking schema + handler to accept/store referral data |
| Modify | `client/src/pages/PatientQuestionnaire.tsx` | Remove referral step (step index 1) |
| Modify | `server/routes/questionnaire.ts:146-147,2694-2695` | Remove referral fields from schema + persistence |
| Modify | `server/routes/business.ts:1782-1872` | Switch referral-stats + timeseries to query `referral_events` |
| Modify | `client/src/pages/business/CostAnalytics.tsx:484-550,1640-1645` | Update TypeScript types + sample size label |
| Modify | `client/src/pages/admin/components/BookingTokenSection.tsx:129-170` | Add referral toggle to booking settings |
| Modify | `server/routes/admin.ts:1348-1360` | Accept `enableReferralOnBooking` in booking-settings endpoint |
| Create | `migrations/XXXX_referral_events.sql` | New table + hospital column + drop old columns (idempotent) |
| Create | `tests/referral-booking.test.ts` | Integration tests for referral capture |

---

## Task 1: Schema — `referral_events` table + hospital setting

**Files:**
- Modify: `shared/schema.ts:65-128` (hospitals table), append new table
- Generate: migration via `npm run db:generate`

- [ ] **Step 1: Add `enableReferralOnBooking` to hospitals table**

In `shared/schema.ts`, add after line 125 (`visionAiProvider`), before `createdAt`:

```typescript
  enableReferralOnBooking: boolean("enable_referral_on_booking").default(false),
```

- [ ] **Step 2: Add `referralEvents` table definition**

Append after the end of the last table in `shared/schema.ts`. Follow existing patterns (varchar PK with gen_random_uuid, varchar FKs):

```typescript
// Referral events — tracks how patients found the clinic (captured at booking time)
export const referralEvents = pgTable("referral_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  patientId: varchar("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
  appointmentId: varchar("appointment_id").references(() => clinicAppointments.id, { onDelete: 'set null' }),
  source: varchar("source", { enum: ["social", "search_engine", "llm", "word_of_mouth", "belegarzt", "other"] }).notNull(),
  sourceDetail: varchar("source_detail"),
  utmSource: varchar("utm_source"),
  utmMedium: varchar("utm_medium"),
  utmCampaign: varchar("utm_campaign"),
  utmTerm: varchar("utm_term"),
  utmContent: varchar("utm_content"),
  refParam: varchar("ref_param"),
  captureMethod: varchar("capture_method", { enum: ["manual", "utm", "ref"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 3: Generate migration**

Run: `npm run db:generate`

- [ ] **Step 4: Make migration idempotent**

Open the generated migration file in `migrations/`. Convert to idempotent SQL:

```sql
CREATE TABLE IF NOT EXISTS "referral_events" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hospital_id" varchar NOT NULL,
  "patient_id" varchar NOT NULL,
  "appointment_id" varchar,
  "source" varchar NOT NULL,
  "source_detail" varchar,
  "utm_source" varchar,
  "utm_medium" varchar,
  "utm_campaign" varchar,
  "utm_term" varchar,
  "utm_content" varchar,
  "ref_param" varchar,
  "capture_method" varchar NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Foreign keys (idempotent via DO blocks)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_events_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "referral_events" ADD CONSTRAINT "referral_events_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE cascade;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_events_patient_id_patients_id_fk') THEN
    ALTER TABLE "referral_events" ADD CONSTRAINT "referral_events_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE cascade;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_events_appointment_id_clinic_appointments_id_fk') THEN
    ALTER TABLE "referral_events" ADD CONSTRAINT "referral_events_appointment_id_clinic_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "clinic_appointments"("id") ON DELETE set null;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "referral_events_hospital_created" ON "referral_events" ("hospital_id", "created_at");
CREATE INDEX IF NOT EXISTS "referral_events_appointment_id" ON "referral_events" ("appointment_id");
CREATE INDEX IF NOT EXISTS "referral_events_patient_id" ON "referral_events" ("patient_id");

-- Hospital setting
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "enable_referral_on_booking" boolean DEFAULT false;
```

- [ ] **Step 5: Push migration**

Run: `npm run db:migrate`

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npm run check`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat: add referral_events table and enableReferralOnBooking hospital setting"
```

---

## Task 2: UTM → source mapping utility

**Files:**
- Create: `shared/referralMapping.ts`

- [ ] **Step 1: Create the mapping module**

Create `shared/referralMapping.ts`:

```typescript
export type ReferralSource = "social" | "search_engine" | "llm" | "word_of_mouth" | "belegarzt" | "other";
export type CaptureMethod = "manual" | "utm" | "ref";

interface MappedReferral {
  source: ReferralSource;
  sourceDetail: string | null;
  captureMethod: CaptureMethod;
}

interface UtmParams {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
}

const UTM_SOURCE_MAP: Record<string, { source: ReferralSource; detail: string }> = {
  google: { source: "search_engine", detail: "Google" },
  bing: { source: "search_engine", detail: "Bing" },
  facebook: { source: "social", detail: "Facebook" },
  fb: { source: "social", detail: "Facebook" },
  instagram: { source: "social", detail: "Instagram" },
  ig: { source: "social", detail: "Instagram" },
  tiktok: { source: "social", detail: "TikTok" },
  chatgpt: { source: "llm", detail: "ChatGPT" },
  openai: { source: "llm", detail: "ChatGPT" },
  claude: { source: "llm", detail: "Claude" },
  anthropic: { source: "llm", detail: "Claude" },
  perplexity: { source: "llm", detail: "Perplexity" },
};

// Google medium overrides for more granular detail
const GOOGLE_MEDIUM_MAP: Record<string, string> = {
  maps: "Google Maps",
  local: "Google Maps",
  cpc: "Google Ads",
};

export function mapUtmToReferral(utm: UtmParams): MappedReferral | null {
  const src = utm.utmSource?.toLowerCase()?.trim();
  if (!src) return null;

  const mapped = UTM_SOURCE_MAP[src];
  if (!mapped) {
    return { source: "other", sourceDetail: utm.utmSource || null, captureMethod: "utm" };
  }

  let detail = mapped.detail;

  // Google-specific: check utm_medium for Maps/Ads distinction
  if (src === "google" && utm.utmMedium) {
    const medium = utm.utmMedium.toLowerCase().trim();
    if (GOOGLE_MEDIUM_MAP[medium]) {
      detail = GOOGLE_MEDIUM_MAP[medium];
    }
  }

  return { source: mapped.source, sourceDetail: detail, captureMethod: "utm" };
}

export function mapRefToReferral(refParam: string): MappedReferral {
  return { source: "belegarzt", sourceDetail: refParam, captureMethod: "ref" };
}

/**
 * Determine referral from URL params. Priority: UTM > ref > null.
 */
export function resolveReferralFromParams(params: {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  ref?: string | null;
}): (MappedReferral & { utmParams?: UtmParams; refParam?: string }) | null {
  // UTM takes priority
  const utmResult = mapUtmToReferral(params);
  if (utmResult) {
    return {
      ...utmResult,
      utmParams: {
        utmSource: params.utmSource,
        utmMedium: params.utmMedium,
        utmCampaign: params.utmCampaign,
        utmTerm: params.utmTerm,
        utmContent: params.utmContent,
      },
    };
  }

  // Then ref param
  if (params.ref) {
    return { ...mapRefToReferral(params.ref), refParam: params.ref };
  }

  return null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run check`

- [ ] **Step 3: Commit**

```bash
git add shared/referralMapping.ts
git commit -m "feat: add UTM/ref to referral source mapping utility"
```

---

## Task 3: Extract shared `ReferralSourcePicker` component

**Files:**
- Create: `client/src/components/ReferralSourcePicker.tsx`
- Reference: `client/src/pages/PatientQuestionnaire.tsx:2169-2307` (existing ReferralStep)

- [ ] **Step 1: Create the shared component**

Extract the icon-grid UI from `PatientQuestionnaire.tsx` lines 2169-2307 into a standalone component. The component should:
- Accept `value` (current source), `detail` (current detail), `onChange(source, detail)` callback, and `labels` (i18n object) as props
- Render the same icon grid with 6 options
- Handle conditional sub-options (social platforms, search engines, free text for word_of_mouth and other)
- NOT handle step navigation or form state — just the picker itself

Read `PatientQuestionnaire.tsx` lines 2169-2307 for the exact UI to replicate. Keep the same icons (Share2, Search, Bot, Users, Stethoscope, MoreHorizontal), same grid layout, same conditional panels.

Props interface:

```typescript
interface ReferralSourcePickerProps {
  value: string;
  detail: string;
  onChange: (source: string, detail: string) => void;
  labels: {
    title: string;
    hint: string;
    social: string;
    searchEngine: string;
    llm: string;
    wordOfMouth: string;
    belegarzt: string;
    other: string;
    socialPlatform: string;
    searchPlatform: string;
    detailPlaceholder: string;
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run check`

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ReferralSourcePicker.tsx
git commit -m "feat: extract ReferralSourcePicker as shared component"
```

---

## Task 4: Add referral step to booking page

**Files:**
- Modify: `client/src/pages/BookAppointment.tsx:39,43-84,262-303,612-833,837-881,1021-1071`

- [ ] **Step 1: Parse UTM/ref params from URL**

In `BookAppointment.tsx`, after the existing `searchParams.get()` calls (lines 47-52), add:

```typescript
import { resolveReferralFromParams } from "@shared/referralMapping";

// ... inside the component, after line 52:
const utmSource = searchParams.get("utm_source");
const utmMedium = searchParams.get("utm_medium");
const utmCampaign = searchParams.get("utm_campaign");
const utmTerm = searchParams.get("utm_term");
const utmContent = searchParams.get("utm_content");
const refParam = searchParams.get("ref");

const autoReferral = resolveReferralFromParams({
  utmSource, utmMedium, utmCampaign, utmTerm, utmContent, ref: refParam,
});
```

- [ ] **Step 2: Update Step type and add referral state**

Change the Step type (line 39) to include "referral":

```typescript
type Step = "provider" | "datetime" | "details" | "referral" | "done";
```

Add referral form state after the existing form state (after line 79):

```typescript
const [referralSource, setReferralSource] = useState("");
const [referralDetail, setReferralDetail] = useState("");
```

- [ ] **Step 3: Update step flow logic**

The "details" step's submit button currently transitions to "done". Change it to transition to "referral" instead — but only if the referral step should be shown:

```typescript
// Determine if referral step should show
const showReferralStep = data?.enableReferralOnBooking && !autoReferral;
```

In the details step submit handler: if `showReferralStep`, go to "referral"; otherwise go to "done".

In the `handleSubmit` function (lines 262-303), update to include referral data in the POST body:

```typescript
const referral = autoReferral || (referralSource ? {
  source: referralSource,
  sourceDetail: referralDetail || null,
  captureMethod: "manual" as const,
} : null);

// Add to fetch body:
body: JSON.stringify({
  ...existingFields,
  referralSource: referral?.source,
  referralSourceDetail: referral?.sourceDetail,
  captureMethod: referral?.captureMethod,
  utmSource, utmMedium, utmCampaign, utmTerm, utmContent,
  refParam,
}),
```

- [ ] **Step 4: Add referral step rendering**

Between the "details" step rendering (line ~833) and the "done" step (line ~837), add the referral step:

```tsx
{step === "referral" && (
  <div className="space-y-6">
    <ReferralSourcePicker
      value={referralSource}
      detail={referralDetail}
      onChange={(source, detail) => {
        setReferralSource(source);
        setReferralDetail(detail);
      }}
      labels={{/* booking.referral.* i18n keys */}}
    />
    <Button
      onClick={handleSubmit}
      disabled={!referralSource || submitting}
      className="w-full"
    >
      {submitting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
      {/* Submit / Book button label */}
    </Button>
  </div>
)}
```

Note: When referral step is shown, the submit/book action moves from the details step to the referral step. The details step gets a "Next" button instead of "Book Appointment". The existing `handleSubmit` function already calls `setStep("done")` on success — so the referral step's button should only call `handleSubmit()` (do NOT call `setStep("done")` separately, or the user will see confirmation before the request completes).

- [ ] **Step 5: Update StepIndicator**

Update the `StepIndicator` component (lines 1021-1071) to include the referral step when `showReferralStep` is true. The steps array should dynamically include/exclude the referral step.

- [ ] **Step 6: Update BookingData type**

In the `BookingData` type (around line 11-35), add `enableReferralOnBooking: boolean` to match the updated API response.

- [ ] **Step 7: Add booking.referral i18n keys**

`BookAppointment.tsx` currently uses inline German strings (not i18next). Follow the same pattern as `PatientQuestionnaire.tsx` which defines translation objects inline at the top of the file. Create a `BOOKING_REFERRAL_LABELS` object with translations for all 5 languages (EN, DE, IT, ES, FR) matching the `ReferralSourcePickerProps.labels` interface. Select the correct language based on `data.hospital.language`.

**Important:** UTM/ref params (`utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent`, `refParam`) must ALWAYS be included in the POST body regardless of the `enableReferralOnBooking` setting or whether `autoReferral` is present. This ensures UTM auto-capture works even when the manual step is disabled.

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npm run check`

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/BookAppointment.tsx
git commit -m "feat: add referral step to public booking page with UTM/ref auto-detection"
```

---

## Task 5: Server — accept and store referral data on booking

**Files:**
- Modify: `server/routes/clinic.ts:196-226,358-526`

- [ ] **Step 1: Update booking config endpoint**

In the GET `/api/public/booking/:bookingToken` handler (lines 196-226), include `enableReferralOnBooking` as a top-level field in the response (alongside `hospital`, `bookingSettings`, `providers`):

```typescript
res.json({
  hospital: { /* existing fields */ },
  bookingSettings: { /* existing fields */ },
  providers: [ /* existing array */ ],
  enableReferralOnBooking: hospital.enableReferralOnBooking ?? false,
});
```

Ensure the `BookingData` type in `BookAppointment.tsx` (Task 4 Step 6) matches this top-level placement.

- [ ] **Step 2: Extend bookingSchema**

In `server/routes/clinic.ts`, update the `bookingSchema` (lines 358-368) to accept referral fields:

```typescript
const bookingSchema = z.object({
  // ... existing fields ...
  providerId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  firstName: z.string().min(1).max(100),
  surname: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().min(1).max(30),
  notes: z.string().min(1).max(1000),
  // Referral fields (all optional at schema level)
  referralSource: z.enum(["social", "search_engine", "llm", "word_of_mouth", "belegarzt", "other"]).optional(),
  referralSourceDetail: z.string().max(500).optional(),
  captureMethod: z.enum(["manual", "utm", "ref"]).optional(),
  utmSource: z.string().max(500).optional(),
  utmMedium: z.string().max(500).optional(),
  utmCampaign: z.string().max(500).optional(),
  utmTerm: z.string().max(500).optional(),
  utmContent: z.string().max(500).optional(),
  refParam: z.string().max(500).optional(),
});
```

- [ ] **Step 3: Add server-side conditional validation**

After Zod parsing in the POST handler, add:

```typescript
// If hospital requires referral and no auto-capture, referralSource is mandatory
if (hospital.enableReferralOnBooking && !parsed.utmSource && !parsed.refParam && !parsed.referralSource) {
  return res.status(400).json({ message: "Referral source is required" });
}
```

- [ ] **Step 4: Insert referral event after appointment creation**

After the appointment is created (around line 441), insert the referral event:

```typescript
// Save referral event if any referral data present
if (parsed.referralSource || parsed.utmSource || parsed.refParam) {
  await db.insert(referralEvents).values({
    hospitalId: hospital.id,
    patientId: patient.id,
    appointmentId: appointment.id,
    source: parsed.referralSource || "other",
    sourceDetail: parsed.referralSourceDetail || null,
    utmSource: parsed.utmSource || null,
    utmMedium: parsed.utmMedium || null,
    utmCampaign: parsed.utmCampaign || null,
    utmTerm: parsed.utmTerm || null,
    utmContent: parsed.utmContent || null,
    refParam: parsed.refParam || null,
    captureMethod: parsed.captureMethod || "manual",
  });
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npm run check`

- [ ] **Step 6: Commit**

```bash
git add server/routes/clinic.ts
git commit -m "feat: accept and store referral data in booking endpoint"
```

---

## Task 6: Hospital settings UI — referral toggle

**Files:**
- Modify: `client/src/pages/admin/components/BookingTokenSection.tsx:11-66,129-170`
- Modify: `server/routes/admin.ts:1348-1360`

- [ ] **Step 1: Add state for referral toggle**

In `BookingTokenSection.tsx`, add state (after line 17):

```typescript
const [enableReferral, setEnableReferral] = useState(false);
```

Load from API response (in the useEffect, after line 30):

```typescript
if (s.enableReferralOnBooking !== undefined) setEnableReferral(s.enableReferralOnBooking);
```

Note: The `tokenData` query response needs to include this field. Check that the GET `/api/admin/:hospitalId/booking-token` endpoint returns `enableReferralOnBooking` from the hospital record alongside `bookingSettings`.

- [ ] **Step 2: Add toggle to settings UI**

In the booking settings grid (after line 164, before the Save button), add:

```tsx
<div className="col-span-3 flex items-center gap-2">
  <input
    type="checkbox"
    id="enableReferral"
    checked={enableReferral}
    onChange={(e) => setEnableReferral(e.target.checked)}
    className="rounded"
  />
  <Label htmlFor="enableReferral" className="text-xs text-muted-foreground">
    Ask patients how they found you when booking
  </Label>
</div>
```

- [ ] **Step 3: Include in save mutation**

Update the `saveSettingsMutation` (lines 54-66) to send `enableReferralOnBooking`:

```typescript
mutationFn: async () => {
  await apiRequest("PUT", `/api/admin/${hospitalId}/booking-settings`, {
    slotDurationMinutes: parseInt(slotDuration) || 30,
    maxAdvanceDays: parseInt(maxDays) || 90,
    minAdvanceHours: parseInt(minHours) || 2,
    enableReferralOnBooking: enableReferral,
  });
},
```

- [ ] **Step 4: Update admin API to accept the toggle**

In `server/routes/admin.ts` line 1348, update the PUT handler to also save `enableReferralOnBooking`:

```typescript
const { slotDurationMinutes, maxAdvanceDays, minAdvanceHours, enableReferralOnBooking } = req.body;
const hospital = await storage.updateHospital(hospitalId, {
  bookingSettings: { slotDurationMinutes, maxAdvanceDays, minAdvanceHours },
  ...(enableReferralOnBooking !== undefined && { enableReferralOnBooking }),
});
```

Also ensure the GET booking-token endpoint returns `enableReferralOnBooking` from the hospital.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npm run check`

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/admin/components/BookingTokenSection.tsx server/routes/admin.ts
git commit -m "feat: add referral toggle to booking settings"
```

---

## Task 7: Dashboard — switch to `referral_events`

**Files:**
- Modify: `server/routes/business.ts:1782-1872`
- Modify: `client/src/pages/business/CostAnalytics.tsx:484-491,1640-1645`

- [ ] **Step 1: Update referral-stats endpoint**

Replace the query in `/api/business/:hospitalId/referral-stats` (lines 1782-1835). Switch from joining `patientQuestionnaireResponses` + `patientQuestionnaireLinks` to querying `referralEvents` directly:

```typescript
const breakdown = await db
  .select({
    referralSource: referralEvents.source,
    referralSourceDetail: referralEvents.sourceDetail,
    count: sql<number>`count(*)::int`,
  })
  .from(referralEvents)
  .where(and(
    eq(referralEvents.hospitalId, hospitalId),
    ...(from ? [gte(referralEvents.createdAt, new Date(from))] : []),
    ...(to ? [lte(referralEvents.createdAt, new Date(to))] : []),
  ))
  .groupBy(referralEvents.source, referralEvents.sourceDetail);

const totalResult = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(referralEvents)
  .where(and(
    eq(referralEvents.hospitalId, hospitalId),
    ...(from ? [gte(referralEvents.createdAt, new Date(from))] : []),
    ...(to ? [lte(referralEvents.createdAt, new Date(to))] : []),
  ));

res.json({
  breakdown,
  totalReferrals: totalResult[0]?.count || 0,
});
```

- [ ] **Step 2: Update referral-timeseries endpoint**

Replace the query in `/api/business/:hospitalId/referral-timeseries` (lines 1838-1872):

```typescript
const timeseries = await db
  .select({
    month: sql<string>`to_char(${referralEvents.createdAt}, 'YYYY-MM')`,
    referralSource: referralEvents.source,
    count: sql<number>`count(*)::int`,
  })
  .from(referralEvents)
  .where(eq(referralEvents.hospitalId, hospitalId))
  .groupBy(sql`to_char(${referralEvents.createdAt}, 'YYYY-MM')`, referralEvents.source)
  .orderBy(sql`to_char(${referralEvents.createdAt}, 'YYYY-MM')`);

res.json(timeseries);
```

- [ ] **Step 3: Update frontend types and labels**

In `CostAnalytics.tsx`, update the query type (lines 484-491):

```typescript
const { data: referralData, isLoading: referralLoading } = useQuery<{
  breakdown: Array<{ referralSource: string; referralSourceDetail: string | null; count: number }>;
  totalReferrals: number;
}>({
```

Update the sample size indicator (lines 1640-1645):

```tsx
{referralData && (
  <div className="text-sm text-muted-foreground px-1">
    {referralData.totalReferrals} {t('business.referrals.totalBookingReferrals')}
  </div>
)}
```

Also **extend** the existing `REFERRAL_DETAIL_LABELS` constant (lines 338-344) with new UTM-mapped detail entries. Keep the existing lowercase keys and add the new mixed-case ones:

```typescript
const REFERRAL_DETAIL_LABELS: Record<string, string> = {
  // Existing (from manual picker)
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  google: "Google",
  bing: "Bing",
  // New (from UTM mapping — uses title case as sourceDetail)
  "Google Maps": "Google Maps",
  "Google Ads": "Google Ads",
  ChatGPT: "ChatGPT",
  Claude: "Claude",
  Perplexity: "Perplexity",
};
```

Also update/replace the i18n keys used in the sample size indicator. The old keys `business.referrals.of` and `business.referrals.questionnairesAnswered` are no longer needed — replace with a single `business.referrals.totalBookingReferrals` key.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npm run check`

- [ ] **Step 5: Commit**

```bash
git add server/routes/business.ts client/src/pages/business/CostAnalytics.tsx
git commit -m "feat: switch referral dashboard to referral_events table"
```

---

## Task 8: Remove referral step from formulaire

**Files:**
- Modify: `client/src/pages/PatientQuestionnaire.tsx:216-226,1243-1244,1331-1332,1559-1560,1855,2169-2307,3346-3361`
- Modify: `server/routes/questionnaire.ts:146-147,2694-2695`

- [ ] **Step 1: Remove from STEPS array**

In `PatientQuestionnaire.tsx`, remove the referral entry from the STEPS array (line 218 — the entry with Megaphone icon at index 1).

- [ ] **Step 2: Remove ReferralStep component**

Delete the `ReferralStep` component function (lines 2169-2307).

- [ ] **Step 3: Remove referral step rendering**

Remove the `{currentStep === 1 && ...}` block that renders ReferralStep (around line 1855).

- [ ] **Step 4: Remove form state initialization**

Remove `referralSource: ""` and `referralSourceDetail: ""` from form data initialization (lines 1243-1244) and from the existing response loading (lines 1331-1332).

- [ ] **Step 5: Remove step validation case**

Remove `case 'referral':` from the step validation switch (lines 1559-1560).

- [ ] **Step 6: Remove summary display**

Remove the referral section from the summary rendering (lines 3346-3361).

- [ ] **Step 7: Remove referral translation keys**

Remove the `questionnaire.personal.referral.*` translation keys from all 5 language blocks (EN: 252-265, DE: 447-460, IT: 642-655, ES: 837-850, FR: 1032-1045) and the summary keys.

- [ ] **Step 8: Remove from server schema and persistence**

In `server/routes/questionnaire.ts`:
- Remove `referralSource` and `referralSourceDetail` from the Zod validation schema (lines 146-147)
- Remove these fields from the database insert/update (lines 2694-2695)

- [ ] **Step 9: Verify step indexes are correct**

After removing step index 1 (referral), all subsequent step indexes shift down by 1. The file uses numeric `currentStep === N` comparisons for rendering (lines ~1847-1880+), validation, and summary. Every `currentStep === N` for N >= 1 must be decremented by 1. Search for all occurrences of `currentStep ===` and `currentStep ==` in the file and update. Also check the summary section which uses step indexes to display section headers.

- [ ] **Step 10: Verify TypeScript compiles**

Run: `npm run check`

- [ ] **Step 11: Commit**

```bash
git add client/src/pages/PatientQuestionnaire.tsx server/routes/questionnaire.ts
git commit -m "refactor: remove referral step from patient formulaire"
```

---

## Task 9: Migration — drop old referral columns

**Files:**
- Modify: `shared/schema.ts:3972-3974`
- Generate: migration via `npm run db:generate`

This task MUST be done after Task 7 (dashboard switch) and Task 8 (formulaire removal), since those endpoints still reference these columns.

- [ ] **Step 1: Remove columns from schema**

In `shared/schema.ts`, remove lines 3972-3974 (the `referralSource` and `referralSourceDetail` columns and their comment from `patientQuestionnaireResponses`).

- [ ] **Step 2: Generate migration**

Run: `npm run db:generate`

- [ ] **Step 3: Make migration idempotent**

Convert the generated migration to use `IF EXISTS`:

```sql
ALTER TABLE "patient_questionnaire_responses" DROP COLUMN IF EXISTS "referral_source";
ALTER TABLE "patient_questionnaire_responses" DROP COLUMN IF EXISTS "referral_source_detail";
```

- [ ] **Step 4: Push migration**

Run: `npm run db:migrate`

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npm run check`

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "refactor: drop referral columns from patient_questionnaire_responses"
```

---

## Task 10: Integration tests

**Files:**
- Create: `tests/referral-booking.test.ts`

- [ ] **Step 1: Write tests for UTM mapping utility**

Test `resolveReferralFromParams` from `shared/referralMapping.ts`:

```typescript
// Test cases:
// - Google organic → search_engine / Google
// - Google Maps → search_engine / Google Maps
// - Google Ads → search_engine / Google Ads
// - Facebook → social / Facebook
// - Unknown utm_source → other / (raw value)
// - ref param only → belegarzt / (ref value)
// - UTM + ref → UTM wins
// - No params → null
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/referral-booking.test.ts` (or the project's test runner)

- [ ] **Step 3: Write tests for booking endpoint with referral**

Reference `tests/discharge-medication-templates.test.ts` for the test infrastructure pattern (vitest, test database setup, HTTP client, seed data). Follow the same setup/teardown approach.

Test the POST `/api/public/booking/:bookingToken/book` endpoint:

```typescript
// Test cases:
// - Booking with manual referral source → creates referral_event
// - Booking with UTM params → creates referral_event with UTM data
// - Booking with ref param → creates referral_event with belegarzt source
// - Booking without referral (setting disabled) → no referral_event created
// - Booking without referral (setting enabled) → 400 error
// - Appointment deletion → referral_event.appointmentId becomes null
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run tests/referral-booking.test.ts`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add tests/referral-booking.test.ts
git commit -m "test: add integration tests for referral booking"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run full TypeScript check**

Run: `npm run check`
Expected: clean, no errors

- [ ] **Step 2: Run all tests**

Run the full test suite to ensure nothing is broken.

- [ ] **Step 3: Manual smoke test checklist**

1. Enable referral on booking for a test hospital (admin settings)
2. Visit booking page without params → referral step appears after details
3. Select a source → can proceed to book
4. Visit booking page with `?utm_source=google&utm_medium=maps` → referral step skipped, booking works
5. Visit booking page with `?ref=dr_mueller` → referral step skipped, booking works
6. Check `referral_events` table → rows created with correct data
7. Check business dashboard → referral charts show the new data
8. Delete an appointment → verify `referral_events.appointmentId` is null but row persists
9. Visit formulaire → referral step is gone

- [ ] **Step 4: Verify migrations are idempotent**

Run: `npm run db:migrate` a second time
Expected: no errors, no changes applied

- [ ] **Step 5: Final commit if any cleanup needed**

---

## Post-Deploy (Manual)

- Update Google Business Profile booking URLs to include UTM params: `?utm_source=google&utm_medium=maps`
- This is a manual configuration per hospital, not a code change
- For referring doctors, create trackable links like: `/book/<token>?ref=dr_mueller`
