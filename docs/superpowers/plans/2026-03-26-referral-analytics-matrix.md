# Referral Analytics Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a conversion funnel analytics dashboard on /business → Referrals showing no-show rate, cancellation rate, appointment→surgery conversion, surgery→paid conversion, revenue, and avg time to conversion — all sliceable by channel, provider, and time period.

**Architecture:** One new backend endpoint returns per-referral-event rows with joined appointment and surgery data. A new extracted frontend component (`ReferralFunnel.tsx`) does all client-side aggregation and renders KPI cards, a funnel bar chart, and a matrix table. No schema changes needed.

**Tech Stack:** Drizzle (raw SQL for lateral join), React Query, Recharts, shadcn/ui

---

### Task 1: Backend — Referral Funnel Endpoint

**Files:**
- Modify: `server/routes/business.ts` (insert after line 1876)

- [ ] **Step 1: Add the endpoint with raw SQL lateral join**

Insert at line 1877 in `server/routes/business.ts`, before the `// Lead Conversion Analysis` section:

```typescript
// Referral conversion funnel — one row per referral event with joined appointment + first surgery
router.get('/api/business/:hospitalId/referral-funnel', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    let dateFilter = '';
    const params: any[] = [hospitalId];
    let paramIdx = 2;

    if (from) {
      dateFilter += ` AND re.created_at >= $${paramIdx}::timestamp`;
      params.push(from);
      paramIdx++;
    }
    if (to) {
      dateFilter += ` AND re.created_at <= $${paramIdx}::timestamp`;
      params.push(to);
      paramIdx++;
    }

    const result = await db.execute(sql.raw(`
      SELECT
        re.id AS referral_id,
        re.source,
        re.source_detail,
        re.created_at AS referral_date,
        re.patient_id,
        re.capture_method,
        ca.id AS appointment_id,
        ca.status AS appointment_status,
        ca.provider_id,
        ca.appointment_date,
        u.first_name AS provider_first_name,
        u.last_name AS provider_last_name,
        s.id AS surgery_id,
        s.status AS surgery_status,
        s.payment_status,
        s.price,
        s.payment_date,
        s.planned_date AS surgery_planned_date,
        s.surgeon_id
      FROM referral_events re
      LEFT JOIN clinic_appointments ca ON ca.id = re.appointment_id
      LEFT JOIN users u ON u.id = ca.provider_id
      LEFT JOIN LATERAL (
        SELECT s2.id, s2.status, s2.payment_status, s2.price, s2.payment_date, s2.planned_date, s2.surgeon_id
        FROM surgeries s2
        WHERE s2.patient_id = re.patient_id
          AND s2.hospital_id = re.hospital_id
          AND s2.planned_date >= re.created_at
          AND s2.is_archived = false
          AND COALESCE(s2.is_suspended, false) = false
        ORDER BY s2.planned_date ASC
        LIMIT 1
      ) s ON true
      WHERE re.hospital_id = $1
        ${dateFilter}
      ORDER BY re.created_at DESC
    `));

    // Note: db.execute with sql.raw may need adjustment based on how Drizzle handles
    // parameterized raw queries. May need to use sql`...` template with ${} params instead.
    // Check existing raw SQL patterns in the codebase and adapt.

    res.json(result.rows || result);
  } catch (error: any) {
    logger.error('Error fetching referral funnel:', error);
    res.status(500).json({ message: 'Failed to fetch referral funnel data' });
  }
});
```

**Important:** Check how raw parameterized SQL is done in this codebase. Drizzle's `sql` tagged template with `${param}` may be needed instead of `sql.raw` with `$1` placeholders. Look at existing raw SQL usage in `server/routes/` for the correct pattern.

- [ ] **Step 2: Verify endpoint works**

Run: `npm run dev`, then `curl http://localhost:5000/api/business/<hospitalId>/referral-funnel` (with auth cookie/token)

Expected: JSON array of rows with referral + appointment + surgery data.

- [ ] **Step 3: Commit**

```bash
git add server/routes/business.ts
git commit -m "feat: add referral-funnel endpoint for conversion analytics matrix"
```

---

### Task 2: Frontend — ReferralFunnel Component (Data Layer)

**Files:**
- Create: `client/src/pages/business/ReferralFunnel.tsx`

- [ ] **Step 1: Create component with types, data fetching, and aggregation logic**

```typescript
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
// ... (imports defined in step 3)

type FunnelRow = {
  referral_id: string;
  source: string;
  source_detail: string | null;
  referral_date: string;
  patient_id: string;
  capture_method: string;
  appointment_id: string | null;
  appointment_status: string | null;
  provider_id: string | null;
  appointment_date: string | null;
  provider_first_name: string | null;
  provider_last_name: string | null;
  surgery_id: string | null;
  surgery_status: string | null;
  payment_status: string | null;
  price: string | null;
  payment_date: string | null;
  surgery_planned_date: string | null;
  surgeon_id: string | null;
};

type FunnelMetrics = {
  totalReferrals: number;
  withAppointment: number;
  kept: number; // arrived + in_progress + completed
  noShow: number;
  cancelled: number;
  surgeryPlanned: number;
  paid: number;
  noShowRate: number;
  cancellationRate: number;
  aptToSurgeryRate: number;
  surgeryToPaidRate: number;
  fullFunnelRate: number;
  totalRevenue: number;
  avgDaysToConversion: number | null;
};

const KEPT_STATUSES = ['arrived', 'in_progress', 'completed'];

function computeMetrics(rows: FunnelRow[]): FunnelMetrics {
  const total = rows.length;
  const withAppt = rows.filter(r => r.appointment_id);
  const kept = withAppt.filter(r => KEPT_STATUSES.includes(r.appointment_status || ''));
  const noShow = withAppt.filter(r => r.appointment_status === 'no_show');
  const cancelled = withAppt.filter(r => r.appointment_status === 'cancelled');
  const surgeryPlanned = rows.filter(r => r.surgery_id);
  const paid = surgeryPlanned.filter(r => r.payment_status === 'paid');

  const totalRevenue = paid.reduce((sum, r) => sum + parseFloat(r.price || '0'), 0);

  // Avg days to conversion
  const conversionDays = paid
    .filter(r => r.payment_date && r.referral_date)
    .map(r => {
      const ref = new Date(r.referral_date).getTime();
      const pay = new Date(r.payment_date!).getTime();
      return (pay - ref) / (1000 * 60 * 60 * 24);
    })
    .filter(d => d >= 0);

  return {
    totalReferrals: total,
    withAppointment: withAppt.length,
    kept: kept.length,
    noShow: noShow.length,
    cancelled: cancelled.length,
    surgeryPlanned: surgeryPlanned.length,
    paid: paid.length,
    noShowRate: withAppt.length > 0 ? noShow.length / withAppt.length : 0,
    cancellationRate: withAppt.length > 0 ? cancelled.length / withAppt.length : 0,
    aptToSurgeryRate: kept.length > 0 ? surgeryPlanned.length / kept.length : 0,
    surgeryToPaidRate: surgeryPlanned.length > 0 ? paid.length / surgeryPlanned.length : 0,
    fullFunnelRate: total > 0 ? paid.length / total : 0,
    totalRevenue,
    avgDaysToConversion: conversionDays.length > 0
      ? Math.round(conversionDays.reduce((a, b) => a + b, 0) / conversionDays.length)
      : null,
  };
}
```

- [ ] **Step 2: Commit data layer**

```bash
git add client/src/pages/business/ReferralFunnel.tsx
git commit -m "feat: add ReferralFunnel component with data types and aggregation logic"
```

---

### Task 3: Frontend — ReferralFunnel Component (UI)

**Files:**
- Modify: `client/src/pages/business/ReferralFunnel.tsx`

- [ ] **Step 1: Add full component UI with KPI cards, filters, funnel chart, and matrix table**

The component should include:

1. **Filter bar:** DateInput for from/to, Select for provider (extracted from data), Select for source
2. **KPI cards row** (grid): Total Referrals, No-Show Rate %, Cancellation Rate %, Apt→Surgery %, Surgery→Paid %, Full Funnel %, Revenue CHF, Avg Days
3. **Funnel bar chart** (Recharts BarChart): X-axis = funnel stages (Referrals → Appointments → Kept → Surgery → Paid), one bar per source, using REFERRAL_COLORS
4. **Matrix table**: Rows = source channels, Columns = each metric. Footer row = totals.

Use these existing imports/patterns:
- `Card, CardContent, CardHeader, CardTitle` from shadcn
- `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from shadcn
- `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` from shadcn
- `BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer` from recharts
- `DateInput` from `@/components/ui/date-input`
- `Loader2` from lucide-react

Reference `REFERRAL_COLORS` from the existing code in CostAnalytics.tsx:
```typescript
const REFERRAL_COLORS: Record<string, string> = {
  social: "#3b82f6",
  search_engine: "#10b981",
  llm: "#8b5cf6",
  word_of_mouth: "#f59e0b",
  belegarzt: "#ec4899",
  other: "#6b7280",
};
```

For the matrix table, group by `source` and compute metrics per group:
```typescript
const matrixData = useMemo(() => {
  const sources = [...new Set(filteredRows.map(r => r.source))];
  return sources.map(source => ({
    source,
    ...computeMetrics(filteredRows.filter(r => r.source === source)),
  }));
}, [filteredRows]);
```

Format percentages as `(rate * 100).toFixed(1) + '%'`, revenue as `new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(value)`.

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit UI**

```bash
git add client/src/pages/business/ReferralFunnel.tsx
git commit -m "feat: add KPI cards, funnel chart, and matrix table to ReferralFunnel"
```

---

### Task 4: Integrate into CostAnalytics

**Files:**
- Modify: `client/src/pages/business/CostAnalytics.tsx` (around line 1923)

- [ ] **Step 1: Import and mount ReferralFunnel**

At the top of CostAnalytics.tsx, add import:
```typescript
import ReferralFunnel from "./ReferralFunnel";
```

Inside the `<TabsContent value="referrals">` section, after the existing referral events table Card (around line 1923), before `</TabsContent>`:

```tsx
{/* Conversion Funnel Analytics */}
<ReferralFunnel hospitalId={activeHospital?.id} />
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit integration**

```bash
git add client/src/pages/business/CostAnalytics.tsx
git commit -m "feat: integrate ReferralFunnel into referrals tab"
```

---

### Task 5: Translations

**Files:**
- Modify: `client/src/i18n/locales/en.json`
- Modify: `client/src/i18n/locales/de.json`

- [ ] **Step 1: Add translation keys**

Add a `business.funnel` section to both files:

**English:**
```json
"funnel": {
  "title": "Conversion Funnel",
  "totalReferrals": "Total Referrals",
  "noShowRate": "No-Show Rate",
  "cancellationRate": "Cancellation Rate",
  "aptToSurgery": "Appointment → Surgery",
  "surgeryToPaid": "Surgery → Paid",
  "fullFunnel": "Full Funnel",
  "revenue": "Revenue",
  "avgDays": "Avg Days to Conversion",
  "allProviders": "All Providers",
  "allSources": "All Sources",
  "source": "Source",
  "referrals": "Referrals",
  "appointments": "Appointments",
  "kept": "Kept",
  "surgeryPlanned": "Surgery Planned",
  "paid": "Paid",
  "noData": "No referral data for the selected period.",
  "funnelStages": "Funnel Stages"
}
```

**German:**
```json
"funnel": {
  "title": "Konversionstrichter",
  "totalReferrals": "Empfehlungen gesamt",
  "noShowRate": "No-Show-Rate",
  "cancellationRate": "Stornierungsrate",
  "aptToSurgery": "Termin → OP",
  "surgeryToPaid": "OP → Bezahlt",
  "fullFunnel": "Gesamte Konversion",
  "revenue": "Umsatz",
  "avgDays": "Ø Tage bis Konversion",
  "allProviders": "Alle Ärzte",
  "allSources": "Alle Quellen",
  "source": "Quelle",
  "referrals": "Empfehlungen",
  "appointments": "Termine",
  "kept": "Wahrgenommen",
  "surgeryPlanned": "OP geplant",
  "paid": "Bezahlt",
  "noData": "Keine Empfehlungsdaten für den ausgewählten Zeitraum.",
  "funnelStages": "Trichterstufen"
}
```

- [ ] **Step 2: Commit translations**

```bash
git add client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat: add German and English translations for referral funnel analytics"
```

---

### Task 6: Verify End-to-End

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Manual test in browser**

1. Navigate to /business → Referrals tab
2. Scroll down to Conversion Funnel section
3. Verify KPI cards show correct numbers
4. Verify funnel bar chart renders
5. Verify matrix table shows per-channel breakdown
6. Test provider filter
7. Test date range filter
8. Switch to German locale — verify all labels are translated

- [ ] **Step 3: Final commit if any fixes needed**
