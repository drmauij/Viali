# Ad Funnel Budget & CPA Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-funnel budget tracking and cost-per-lead/CPA metrics to the referral analytics dashboard, differentiating Google Ads, Meta Ads, and Meta Forms channels.

**Architecture:** New `ad_budgets` table stores monthly spend per funnel. A dedicated SQL endpoint classifies referral events into funnels via click ID / capture method rules, joins with budgets, and returns aggregated metrics. The UI adds a budget input card and performance table below the existing referral matrix.

**Tech Stack:** PostgreSQL + Drizzle ORM (schema/migrations), Express routes (raw SQL), React + shadcn/ui + react-query (frontend)

**Spec:** `docs/superpowers/specs/2026-03-27-ad-funnel-budget-cpa-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `shared/schema.ts` | Modify (after line 6306) | Add `adFunnelEnum` + `adBudgets` table |
| `migrations/XXXX_ad_budgets.sql` | Create (via `npm run db:generate`) | Migration for new table |
| `server/routes/business.ts` | Modify (after line 2157) | Add 3 endpoints: GET/PUT ad-budgets, GET ad-performance |
| `client/src/pages/business/ReferralFunnel.tsx` | Modify (after line 646) | Add AdBudgetInput card + AdPerformanceTable |

---

## Task 1: Schema — Add `adBudgets` table

**Files:**
- Modify: `shared/schema.ts:6306` (after `referralEvents` table)

- [ ] **Step 1: Add enum and table to schema**

Add after the `referralEvents` table definition (after line 6306):

```typescript
export const adFunnelEnum = pgEnum("ad_funnel", ["google_ads", "meta_ads", "meta_forms"]);

export const adBudgets = pgTable("ad_budgets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  month: varchar("month", { length: 7 }).notNull(), // "2026-04" format
  funnel: adFunnelEnum("funnel").notNull(),
  amountChf: integer("amount_chf").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("ad_budgets_hospital_month_funnel").on(table.hospitalId, table.month, table.funnel),
]);
```

- [ ] **Step 2: Generate migration**

Run: `npm run db:generate`

- [ ] **Step 3: Make migration idempotent**

Open the generated migration SQL file in `migrations/`. Ensure all statements use `IF NOT EXISTS`, `DO $$ BEGIN ... END $$` guards. The enum creation needs special handling:

```sql
DO $$ BEGIN
  CREATE TYPE ad_funnel AS ENUM ('google_ads', 'meta_ads', 'meta_forms');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ad_budgets" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "hospital_id" varchar NOT NULL REFERENCES "hospitals"("id") ON DELETE CASCADE,
  "month" varchar(7) NOT NULL,
  "funnel" "ad_funnel" NOT NULL,
  "amount_chf" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ad_budgets_hospital_month_funnel" ON "ad_budgets" ("hospital_id", "month", "funnel");
```

- [ ] **Step 4: Run migration**

Run: `npm run db:migrate`

- [ ] **Step 5: TypeScript check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat: add ad_budgets table for per-funnel monthly budget tracking"
```

---

## Task 2: API — Budget CRUD endpoints

**Files:**
- Modify: `server/routes/business.ts:2157` (before `export default router`)

- [ ] **Step 1: Add GET ad-budgets endpoint**

Add before `export default router;` (line 2159):

```typescript
// ========================================
// Ad Budget Management (manager-only)
// ========================================

router.get('/api/business/:hospitalId/ad-budgets', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { month } = req.query;

    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month as string)) {
      return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
    }

    const { adBudgets } = await import("@shared/schema");
    const results = await db
      .select()
      .from(adBudgets)
      .where(and(eq(adBudgets.hospitalId, hospitalId), eq(adBudgets.month, month as string)));

    res.json(results);
  } catch (error: any) {
    logger.error('Error fetching ad budgets:', error);
    res.status(500).json({ message: 'Failed to fetch ad budgets' });
  }
});
```

- [ ] **Step 2: Add PUT ad-budgets upsert endpoint**

```typescript
router.put('/api/business/:hospitalId/ad-budgets', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { month, budgets } = req.body;

    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
    }

    const validFunnels = ['google_ads', 'meta_ads', 'meta_forms'] as const;
    const { adBudgets } = await import("@shared/schema");
    const results = [];

    for (const funnel of validFunnels) {
      const amount = budgets?.[funnel];
      if (amount === undefined || amount === null) continue;

      const amountChf = Math.round(Number(amount));
      if (isNaN(amountChf) || amountChf < 0) continue;

      if (amountChf === 0) {
        // Delete budget entry if set to 0
        await db
          .delete(adBudgets)
          .where(and(
            eq(adBudgets.hospitalId, hospitalId),
            eq(adBudgets.month, month),
            eq(adBudgets.funnel, funnel),
          ));
        continue;
      }

      const [upserted] = await db
        .insert(adBudgets)
        .values({
          hospitalId,
          month,
          funnel,
          amountChf,
        })
        .onConflictDoUpdate({
          target: [adBudgets.hospitalId, adBudgets.month, adBudgets.funnel],
          set: { amountChf, updatedAt: new Date() },
        })
        .returning();
      results.push(upserted);
    }

    res.json(results);
  } catch (error: any) {
    logger.error('Error upserting ad budgets:', error);
    res.status(500).json({ message: 'Failed to save ad budgets' });
  }
});
```

- [ ] **Step 3: TypeScript check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/routes/business.ts
git commit -m "feat: add GET/PUT endpoints for ad budget management"
```

---

## Task 3: API — Ad Performance endpoint

**Files:**
- Modify: `server/routes/business.ts` (after the budget endpoints from Task 2)

- [ ] **Step 1: Add GET ad-performance endpoint**

This endpoint runs a dedicated SQL query that classifies referral events into funnels using CASE WHEN, joins with appointments/surgeries (same LATERAL pattern as referral-funnel endpoint at line 1896), and aggregates per funnel. Budget data is joined separately.

```typescript
router.get('/api/business/:hospitalId/ad-performance', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { from, to } = req.query;

    const conditions = [sql`re.hospital_id = ${hospitalId}`];
    if (from) conditions.push(sql`re.created_at >= ${from}::timestamp`);
    if (to) conditions.push(sql`re.created_at <= ${to}::timestamp`);
    const whereClause = sql.join(conditions, sql` AND `);

    // Classify referrals into funnels and compute metrics
    const result = await db.execute(sql`
      WITH classified AS (
        SELECT
          CASE
            WHEN re.gclid IS NOT NULL OR re.gbraid IS NOT NULL OR re.wbraid IS NOT NULL THEN 'google_ads'
            WHEN (re.fbclid IS NOT NULL OR re.igshid IS NOT NULL) AND re.capture_method != 'staff' THEN 'meta_ads'
            WHEN re.source = 'social' AND re.capture_method = 'staff' AND re.fbclid IS NULL AND re.igshid IS NULL THEN 'meta_forms'
            ELSE NULL
          END AS funnel,
          re.id AS referral_id,
          re.created_at AS referral_date,
          ca.status AS appointment_status,
          s.id AS surgery_id,
          s.payment_status,
          COALESCE(s.price, 0) AS price
        FROM referral_events re
        LEFT JOIN clinic_appointments ca ON ca.id = re.appointment_id
        LEFT JOIN LATERAL (
          SELECT s2.id, s2.status, s2.payment_status, s2.price
          FROM surgeries s2
          WHERE s2.patient_id = re.patient_id
            AND s2.hospital_id = re.hospital_id
            AND s2.planned_date >= re.created_at
            AND s2.is_archived = false
            AND COALESCE(s2.is_suspended, false) = false
          ORDER BY s2.planned_date ASC
          LIMIT 1
        ) s ON true
        WHERE ${whereClause}
      ),
      funnel_metrics AS (
        SELECT
          funnel,
          COUNT(*) AS leads,
          COUNT(*) FILTER (WHERE appointment_status IN ('arrived', 'in_progress', 'completed')) AS appointments_kept,
          COUNT(*) FILTER (WHERE payment_status = 'paid') AS paid_conversions,
          COALESCE(SUM(price) FILTER (WHERE payment_status = 'paid'), 0) AS revenue
        FROM classified
        WHERE funnel IS NOT NULL
        GROUP BY funnel
      )
      SELECT
        fm.funnel,
        fm.leads,
        fm.appointments_kept,
        fm.paid_conversions,
        fm.revenue
      FROM funnel_metrics fm
      ORDER BY fm.funnel
    `);

    // Fetch budgets for the months in the date range
    const monthConditions = [sql`ab.hospital_id = ${hospitalId}`];
    if (from) monthConditions.push(sql`ab.month >= ${(from as string).substring(0, 7)}`);
    if (to) monthConditions.push(sql`ab.month <= ${(to as string).substring(0, 7)}`);
    const monthWhere = sql.join(monthConditions, sql` AND `);

    const budgetResult = await db.execute(sql`
      SELECT funnel, COALESCE(SUM(amount_chf), 0) AS total_budget
      FROM ad_budgets ab
      WHERE ${monthWhere}
      GROUP BY funnel
    `);

    const budgetMap: Record<string, number> = {};
    for (const row of budgetResult.rows as any[]) {
      budgetMap[row.funnel] = Number(row.total_budget);
    }

    // Merge metrics with budgets
    const allFunnels = ['google_ads', 'meta_ads', 'meta_forms'];
    const metricsMap: Record<string, any> = {};
    for (const row of result.rows as any[]) {
      metricsMap[row.funnel] = row;
    }

    const response = allFunnels.map(funnel => {
      const m = metricsMap[funnel];
      const leads = Number(m?.leads || 0);
      const appointmentsKept = Number(m?.appointments_kept || 0);
      const paidConversions = Number(m?.paid_conversions || 0);
      const revenue = Number(m?.revenue || 0);
      const budget = budgetMap[funnel] || 0;

      return {
        funnel,
        budget,
        leads,
        appointmentsKept,
        paidConversions,
        revenue,
        cpl: leads > 0 ? Math.round(budget / leads) : null,
        cpk: appointmentsKept > 0 ? Math.round(budget / appointmentsKept) : null,
        cpa: paidConversions > 0 ? Math.round(budget / paidConversions) : null,
        roi: budget > 0 && paidConversions > 0 ? Math.round(((revenue - budget) / budget) * 100) / 100 : null,
      };
    });

    res.json(response);
  } catch (error: any) {
    logger.error('Error fetching ad performance:', error);
    res.status(500).json({ message: 'Failed to fetch ad performance data' });
  }
});
```

- [ ] **Step 2: Verify the appointment status values**

Verify that the SQL uses the same statuses as `KEPT_STATUSES` in `ReferralFunnel.tsx` (line ~82): `['arrived', 'in_progress', 'completed']`. These are already used in the SQL above — just confirm they haven't changed.

Run: `grep -n "kept\|noShow\|cancelled\|appointment_status" client/src/pages/business/ReferralFunnel.tsx | head -20`

Adjust the SQL FILTER clause if needed.

- [ ] **Step 3: TypeScript check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/routes/business.ts
git commit -m "feat: add ad-performance endpoint with funnel classification and CPA metrics"
```

---

## Task 4: Frontend — Budget Input Card

**Files:**
- Modify: `client/src/pages/business/ReferralFunnel.tsx:646` (after the matrix Card closes)

- [ ] **Step 1: Add imports and state**

At the top of `ReferralFunnel.tsx`, add to the existing imports:

```typescript
import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
```

Note: Verify that a `<TooltipProvider>` exists higher in the component tree (e.g., in the app layout). If not, wrap the tooltip usage in one.

Check which of these are already imported and only add the missing ones.

Inside the component function, add state and queries after the existing state declarations:

```typescript
// Ad budget state
const [budgetMonth, setBudgetMonth] = useState(() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
});
const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({
  google_ads: '',
  meta_ads: '',
  meta_forms: '',
});

const queryClient = useQueryClient();

const { data: savedBudgets = [] } = useQuery<any[]>({
  queryKey: ["ad-budgets", hospitalId, budgetMonth],
  queryFn: async () => {
    const res = await fetch(`/api/business/${hospitalId}/ad-budgets?month=${budgetMonth}`);
    if (!res.ok) throw new Error("Failed to fetch budgets");
    return res.json();
  },
  enabled: !!hospitalId,
});

// Sync saved budgets to input fields
useEffect(() => {
  const inputs: Record<string, string> = { google_ads: '', meta_ads: '', meta_forms: '' };
  for (const b of savedBudgets) {
    inputs[b.funnel] = String(b.amountChf);
  }
  setBudgetInputs(inputs);
}, [savedBudgets]);

const saveBudgetsMutation = useMutation({
  mutationFn: async () => {
    await apiRequest("PUT", `/api/business/${hospitalId}/ad-budgets`, {
      month: budgetMonth,
      budgets: {
        google_ads: budgetInputs.google_ads ? Number(budgetInputs.google_ads) : 0,
        meta_ads: budgetInputs.meta_ads ? Number(budgetInputs.meta_ads) : 0,
        meta_forms: budgetInputs.meta_forms ? Number(budgetInputs.meta_forms) : 0,
      },
    });
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["ad-budgets"] });
    queryClient.invalidateQueries({ queryKey: ["ad-performance"] });
  },
});
```

- [ ] **Step 2: Add budget input card JSX**

After the matrix `</Card>` (line 646), before `</>` (line 647), add:

```tsx
{/* ── Ad Budget Input ─────────────────────────────────────────── */}
<Card className="mt-6">
  <CardHeader className="pb-3">
    <div className="flex items-center justify-between">
      <div>
        <CardTitle className="text-lg">{t("business.adBudgets.title", "Ad Budgets")}</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          {t("business.adBudgets.help", "Set your monthly advertising spend per channel to calculate cost-per-lead and cost-per-acquisition metrics below.")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="month"
          value={budgetMonth}
          onChange={(e) => setBudgetMonth(e.target.value)}
          className="w-40"
        />
      </div>
    </div>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-3 gap-4">
      {([
        { key: 'google_ads', label: 'Google Ads' },
        { key: 'meta_ads', label: 'Meta Ads' },
        { key: 'meta_forms', label: 'Meta Forms' },
      ] as const).map(({ key, label }) => (
        <div key={key} className="space-y-1.5">
          <Label className="text-sm">{label}</Label>
          <div className="relative">
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={budgetInputs[key]}
              onChange={(e) => setBudgetInputs(prev => ({ ...prev, [key]: e.target.value }))}
              className="pr-14"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">CHF</span>
          </div>
        </div>
      ))}
    </div>
    <div className="mt-4 flex justify-end">
      <Button
        onClick={() => saveBudgetsMutation.mutate()}
        disabled={saveBudgetsMutation.isPending}
        size="sm"
      >
        {saveBudgetsMutation.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("common.saving", "Saving...")}</>
        ) : (
          t("common.save", "Save")
        )}
      </Button>
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 3: TypeScript check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/business/ReferralFunnel.tsx
git commit -m "feat: add ad budget input card to referral funnel dashboard"
```

---

## Task 5: Frontend — Ad Performance Table

**Files:**
- Modify: `client/src/pages/business/ReferralFunnel.tsx` (after the budget card from Task 4)

- [ ] **Step 1: Add ad-performance query**

Add alongside the other queries inside the component:

```typescript
const { data: adPerformance = [], isLoading: adPerfLoading } = useQuery<any[]>({
  queryKey: ["ad-performance", hospitalId, from, to],
  queryFn: async () => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/business/${hospitalId}/ad-performance?${params}`);
    if (!res.ok) throw new Error("Failed to fetch ad performance");
    return res.json();
  },
  enabled: !!hospitalId,
});
```

- [ ] **Step 2: Add the performance table JSX**

After the budget `</Card>`, add:

```tsx
{/* ── Ad Performance Table ────────────────────────────────────── */}
<Card className="mt-6">
  <CardHeader className="pb-3">
    <CardTitle className="text-lg">{t("business.adPerformance.title", "Ad Performance")}</CardTitle>
    <p className="text-sm text-muted-foreground">
      {t("business.adPerformance.help", "Cost and conversion metrics per advertising channel for the selected date range. Budgets are allocated per calendar month.")}
    </p>
  </CardHeader>
  <CardContent>
    {adPerfLoading ? (
      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
    ) : (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                { key: "funnel", label: t("business.adPerformance.funnel", "Funnel"), tip: t("business.adPerformance.funnelTip", "Advertising channel classified by tracking parameters") },
                { key: "budget", label: t("business.adPerformance.budget", "Budget"), tip: t("business.adPerformance.budgetTip", "Total ad spend for the selected period") },
                { key: "leads", label: t("business.adPerformance.leads", "Leads"), tip: t("business.adPerformance.leadsTip", "Number of referrals attributed to this channel") },
                { key: "cpl", label: "CPL", tip: t("business.adPerformance.cplTip", "Cost per Lead — budget divided by number of leads") },
                { key: "kept", label: t("business.adPerformance.kept", "Appts Kept"), tip: t("business.adPerformance.keptTip", "Appointments that were attended (not no-show or cancelled)") },
                { key: "cpk", label: t("business.adPerformance.cpk", "Cost/Kept"), tip: t("business.adPerformance.cpkTip", "Budget divided by number of kept appointments") },
                { key: "paid", label: t("business.adPerformance.paid", "Paid"), tip: t("business.adPerformance.paidTip", "Surgeries with confirmed payment") },
                { key: "cpa", label: "CPA", tip: t("business.adPerformance.cpaTip", "Cost per Acquisition — budget divided by paid conversions") },
                { key: "revenue", label: t("business.adPerformance.revenue", "Revenue"), tip: t("business.adPerformance.revenueTip", "Total revenue from paid surgeries in this channel") },
                { key: "roi", label: "ROI", tip: t("business.adPerformance.roiTip", "Return on investment — (revenue - budget) / budget") },
              ].map(({ key, label, tip }) => (
                <TableHead key={key} className={key !== "funnel" ? "text-right" : ""}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 cursor-help">
                        {label}
                        <HelpCircle className="h-3 w-3 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent><p className="max-w-xs">{tip}</p></TooltipContent>
                  </Tooltip>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {adPerformance.map((row: any) => {
              const funnelLabels: Record<string, string> = {
                google_ads: "Google Ads",
                meta_ads: "Meta Ads",
                meta_forms: "Meta Forms",
              };
              return (
                <TableRow key={row.funnel}>
                  <TableCell className="font-medium">{funnelLabels[row.funnel] || row.funnel}</TableCell>
                  <TableCell className="text-right">{CHF.format(row.budget)}</TableCell>
                  <TableCell className="text-right">{row.leads}</TableCell>
                  <TableCell className="text-right">{row.cpl != null ? CHF.format(row.cpl) : "\u2014"}</TableCell>
                  <TableCell className="text-right">{row.appointmentsKept}</TableCell>
                  <TableCell className="text-right">{row.cpk != null ? CHF.format(row.cpk) : "\u2014"}</TableCell>
                  <TableCell className="text-right">{row.paidConversions}</TableCell>
                  <TableCell className="text-right">{row.cpa != null ? CHF.format(row.cpa) : "\u2014"}</TableCell>
                  <TableCell className="text-right">{CHF.format(row.revenue)}</TableCell>
                  <TableCell className="text-right">
                    {row.roi != null ? (
                      <span className={row.roi >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                        {row.roi >= 0 ? "+" : ""}{row.roi}x
                      </span>
                    ) : "\u2014"}
                  </TableCell>
                </TableRow>
              );
            })}
            {/* Totals row */}
            {adPerformance.length > 0 && (() => {
              const totals = adPerformance.reduce((acc: any, row: any) => ({
                budget: acc.budget + row.budget,
                leads: acc.leads + row.leads,
                appointmentsKept: acc.appointmentsKept + row.appointmentsKept,
                paidConversions: acc.paidConversions + row.paidConversions,
                revenue: acc.revenue + row.revenue,
              }), { budget: 0, leads: 0, appointmentsKept: 0, paidConversions: 0, revenue: 0 });
              return (
                <TableRow className="font-semibold border-t-2">
                  <TableCell>{t("common.total", "Total")}</TableCell>
                  <TableCell className="text-right">{CHF.format(totals.budget)}</TableCell>
                  <TableCell className="text-right">{totals.leads}</TableCell>
                  <TableCell className="text-right">{totals.leads > 0 ? CHF.format(Math.round(totals.budget / totals.leads)) : "\u2014"}</TableCell>
                  <TableCell className="text-right">{totals.appointmentsKept}</TableCell>
                  <TableCell className="text-right">{totals.appointmentsKept > 0 ? CHF.format(Math.round(totals.budget / totals.appointmentsKept)) : "\u2014"}</TableCell>
                  <TableCell className="text-right">{totals.paidConversions}</TableCell>
                  <TableCell className="text-right">{totals.paidConversions > 0 ? CHF.format(Math.round(totals.budget / totals.paidConversions)) : "\u2014"}</TableCell>
                  <TableCell className="text-right">{CHF.format(totals.revenue)}</TableCell>
                  <TableCell className="text-right">
                    {totals.budget > 0 && totals.paidConversions > 0 ? (
                      <span className={totals.revenue - totals.budget >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                        {totals.revenue - totals.budget >= 0 ? "+" : ""}{Math.round(((totals.revenue - totals.budget) / totals.budget) * 100) / 100}x
                      </span>
                    ) : "\u2014"}
                  </TableCell>
                </TableRow>
              );
            })()}
          </TableBody>
        </Table>
      </div>
    )}
  </CardContent>
</Card>
```

- [ ] **Step 3: TypeScript check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/business/ReferralFunnel.tsx
git commit -m "feat: add ad performance table with CPA/CPL/ROI metrics"
```

---

## Task 6: Verify & Final Check

- [ ] **Step 1: Run full TypeScript check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 2: Verify the appointment "kept" status logic**

Read the `computeMetrics` function in `ReferralFunnel.tsx` and confirm that the SQL FILTER clause for `appointments_kept` uses the same status values. The existing JS logic is the source of truth — match it exactly in the SQL.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

1. Navigate to Business → Referrals tab
2. Scroll down to "Ad Budgets" card
3. Select current month, enter test values (e.g. 4000, 2000, 14000), click Save
4. Verify the "Ad Performance" table shows the budget and any matching referrals
5. Change the date range filters at the top — verify the performance table updates

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
