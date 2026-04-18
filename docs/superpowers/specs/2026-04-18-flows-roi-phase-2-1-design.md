# Flows Revenue + Cost + ROI (Phase 2.1) — Design Spec

**Date:** 2026-04-18
**Phase:** 2.1 of the Flows compliance + analytics roadmap
**Builds on:** Phase 2 (event tracking + per-campaign booking attribution)
**Status:** Design — pending implementation; depends on Phase 2 shipping first

## Goal

Make the marketing claim "revenue per campaign" true by surfacing three numbers per Flow campaign: **revenue** (sum of confirmed appointment prices attributable to the campaign), **cost** (SMS spend; email ≈ 0), and **ROI** ((revenue − cost) / cost). Also add a "Patient Re-Engagement" card to `/business/marketing` alongside the existing "Ad performance" so staff see both marketing funnels on one dashboard.

## Why this scope (and not more)

Phase 2 ships with **booking counts** but no revenue. That's enough to validate the event pipeline end-to-end, but leaves the dashboard honest-but-thin: *"this campaign drove 12 bookings"* is half the story. Phase 2.1 closes the money-signal gap with the smallest possible surface — no new schema beyond one `hospitals` column, no new page, reuses existing helpers — so it can ship as a fast follow to Phase 2.

## Non-goals

- Discount / refund / partial-payment accounting (too much nuance for v1; uses service list price)
- Multi-appointment patient attribution (if one patient from campaign X books 3 future appointments, only the first counts)
- Package / membership revenue (defer until the separate Memberships feature ships)
- Realized-vs-invoiced distinction (v1 = list price on booked appointment; realized/paid revenue is an audit feature)
- Labor / staff-time cost on the cost side
- Actual per-SMS cost from ASPSMS API responses (Phase 2.2 if ever needed — v1 uses a configured per-hospital unit cost × segment count)
- Cross-campaign budget pooling or monthly campaign budgets
- Per-variant revenue (Phase 3 adds this as a one-line query extension when `flowExecutions.variantId` exists)

## Architecture overview

Purely additive to Phase 2. No new tables, no new routes beyond existing flows-metrics endpoints gaining fields. One new column on `hospitals`, two query extensions, one new UI section on `/business/marketing`, inline numeric updates on `Flows.tsx` and `FlowMetrics.tsx`.

```
┌────────────────────────────┐
│  hospitals.sms_cost_per_   │
│  message (new column)      │
│  staff-editable in admin   │
└────────────┬───────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  summarizeFlows() (Phase 2)             │
│  + computeSmsCost(flow, h)              │  ← NEW
│  + joinServicePrices(flow)              │  ← NEW
│  Returns: existing counts + revenue,    │
│           cost, roi per flow            │
└────────────┬────────────────────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
┌────────────┐   ┌─────────────────────────────┐
│Flows.tsx   │   │ Marketing.tsx new card       │
│per-row     │   │ "Patient Re-Engagement"      │
│FlowMetrics │   │ Aggregate flow revenue/      │
│funnel      │   │ cost/ROI for the period      │
└────────────┘   └─────────────────────────────┘
```

## Data model

### One new column on `hospitals`

```typescript
// shared/schema.ts — hospitals table
smsCostPerMessage: decimal("sms_cost_per_message", { precision: 10, scale: 4 }).default("0.08"),
```

- Default `0.08` (roughly CHF 0.08 per SMS segment at ASPSMS Swiss rates as of 2026). Staff can override per hospital in `/admin → Settings → Regional Preferences`.
- Expressed in the hospital's configured currency (`hospitals.currency`, which already defaults to "CHF"). No currency suffix on the column name — per-hospital currency is contextual.
- Precision 4 because SMS pricing can go to tenths of a cent (e.g., EUR 0.0725 per segment on some tiers).
- Nullable defaults to 0.08 on migration; existing rows get the default automatically.

### Migration

**Note:** the migration index + `when` timestamp below are correct as of spec-write time. At implementation time, verify the next available index in `migrations/meta/_journal.json` — main gains new migrations between spec and implementation. Use the next-highest `idx` and a `when` higher than every existing entry.

```sql
-- Migration 0225: add per-hospital SMS unit cost for Flows ROI reporting
-- Idempotent.

ALTER TABLE "hospitals"
  ADD COLUMN IF NOT EXISTS "sms_cost_per_message" numeric(10, 4) DEFAULT 0.08;
```

No other schema changes. Revenue and cost are **computed**, not stored — they're derived every time from existing tables (`clinic_services.price`, `referral_events.flow_execution_id`, `flow_executions.patient_id`, `flow_executions.resend_email_id`, etc.). If pricing changes retroactively, the dashboard updates without backfills.

### Why no `cost_per_flow` cache column

Caching campaign cost and revenue as denormalized columns would feel cleaner but locks in three bugs:
1. Service price changes don't propagate to historical campaigns
2. Appointment cancellations after the fact don't reduce historical revenue
3. Hospital changes their SMS unit cost → historical campaigns' cost stays wrong

Recomputing from source every page load is correct and fast enough at our volume (<50 campaigns per hospital, join of maybe 500 referral_events rows max).

## Revenue computation

For a flow, revenue = sum of `clinic_services.price` for all appointments attributable to the flow whose status is neither `cancelled` nor `no_show`.

"Attributable" means, in order of preference:
1. `referral_events.flow_execution_id` is set (Phase 3 — per-execution attribution via `?fe=` token)
2. `referral_events.utm_content = flow.id` (Phase 2 — per-flow UTM)

Since Phase 2.1 ships before Phase 3, the Phase 2.1 query uses path (2) only. When Phase 3 lands, the same helper extends to support (1) and returns per-variant revenue as a one-line bucket-by-variant addition.

```sql
-- Revenue per flow (Phase 2.1 shape — UTM-based attribution)
SELECT
  re.utm_content AS flow_id,
  COALESCE(SUM(cs.price), 0) AS revenue
FROM referral_events re
JOIN clinic_appointments ca ON ca.id = re.appointment_id
LEFT JOIN clinic_services cs ON cs.id = ca.service_id
WHERE re.hospital_id = $1
  AND re.utm_content IS NOT NULL
  AND re.utm_content = ANY($2)  -- array of flow ids
  AND ca.status NOT IN ('cancelled', 'no_show')
  AND re.created_at >= $3
GROUP BY re.utm_content;
```

Edge case handling:
- Appointment without a service (`service_id IS NULL`) → counts as a booking but contributes 0 to revenue. The LEFT JOIN + COALESCE handles it.
- Service deleted after booking → joined row is null, contributes 0. Acceptable — deleted services have no price to sum.

## Cost computation

For a flow, cost = `sms_recipient_count × estimated_segments × hospital.sms_cost_per_message`.

**Segment estimation (per approved decision Q1=B):**

```typescript
function estimateSegmentsForSms(body: string, hasUnsubscribeFooter: boolean): number {
  const unsubLen = hasUnsubscribeFooter ? 112 : 0; // "\n\nAbmelden: https://viali.app/unsubscribe/<~90-char-token>"
  const total = body.length + unsubLen;
  return Math.max(1, Math.ceil(total / 160));
}
```

- Runs over `flow.messageTemplate` + estimated unsubscribe-footer length (Phase 1's SMS opt-out hint adds ~110 characters including the HMAC token).
- Estimated, not measured — ASPSMS' actual segment count depends on encoding (GSM-7 vs UCS-2) and minor header overhead. An `if (body contains non-ASCII) multiply by 2` heuristic could land in v2 if accuracy demands it.
- For email channels (`email` / `html_email`), segments = 0 and cost = 0.

**Cost query (effectively data-driven):**

No SQL aggregation needed — cost is computed in JS from each flow's recipient count and message body:

```typescript
function computeSmsCost(flow: Flow, hospital: Hospital, sentCount: number): number {
  if (flow.channel !== "sms") return 0;
  const segments = estimateSegmentsForSms(
    flow.messageTemplate ?? "",
    true, // Phase 1 always appends the opt-out footer
  );
  const unitCost = Number(hospital.smsCostPerMessage ?? 0.08);
  return sentCount * segments * unitCost;
}
```

## ROI computation

```typescript
function computeRoi(revenue: number, cost: number): number | null {
  if (cost <= 0) return null; // All-email campaigns or unconfigured SMS cost
  return (revenue - cost) / cost;
}
```

Display rule: `null` renders as `"—"` (em-dash). Positive values render as a percentage (e.g., `+245%`). Negative values (when revenue < cost) render as negative percentages (e.g., `-40%`) so staff can see campaigns that lost money.

## API shape changes

No new endpoints. The existing Phase 2 endpoints gain fields:

### `GET /api/business/:hospitalId/flows/metrics/summary`

Response gets three new fields per row:

```typescript
{
  since: string;
  rows: Array<{
    flowId: string;
    // ... existing Phase 2 fields: sent, delivered, opened, clicked, bounced, complained, bookings ...
    revenue: number;       // sum of attributed service prices
    cost: number;          // estimated SMS spend
    roi: number | null;    // (revenue - cost) / cost, null when cost = 0
  }>;
}
```

### `GET /api/business/:hospitalId/flows/:flowId/metrics`

`funnel` object gains the same three fields:

```typescript
{
  funnel: {
    // ... existing Phase 2 fields ...
    revenue: number;
    cost: number;
    roi: number | null;
  };
  bounces: [...];
  complaints: [...];
  series: [...];
}
```

### Implementation inside `summarizeFlows()` and `flowDetail()`

Both helpers in `server/services/marketingMetricsQuery.ts` get extended:

1. Fetch hospital's `smsCostPerMessage` once at top of helper (one extra query: `SELECT sms_cost_per_message, currency FROM hospitals WHERE id = ?`).
2. Run the revenue SQL above alongside the existing event/booking queries.
3. For each flow row, compute cost in JS from `flow.channel`, `flow.messageTemplate`, and `sentCount`, then compute ROI.
4. Merge into the response rows.

This adds one SQL query per page load (revenue aggregation) plus the per-hospital lookup. Still <100ms total at 50-campaign volume.

## Frontend changes

### `client/src/pages/business/Flows.tsx` (Phase 2 baseline)

Two changes to the per-row mini-strip and the top-line STATS:

**Per-row mini-strip** — append revenue, cost, ROI to the existing strip:

```tsx
{metricsByFlow[c.id] && (
  <div className="text-xs text-muted-foreground mt-1">
    {metricsByFlow[c.id].sent} {t("flows.row.sent", "sent")} ·
    {" "}{metricsByFlow[c.id].opened} {t("flows.row.opened", "opened")} ·
    {" "}{metricsByFlow[c.id].bookings} {t("flows.row.booked", "booked")} ·
    {" "}{formatCurrency(metricsByFlow[c.id].revenue)} {t("flows.row.revenue", "revenue")}
    {metricsByFlow[c.id].roi !== null && (
      <> · <span className={metricsByFlow[c.id].roi! >= 0 ? "text-green-600" : "text-red-600"}>
        {metricsByFlow[c.id].roi! >= 0 ? "+" : ""}{Math.round(metricsByFlow[c.id].roi! * 100)}% ROI
      </span></>
    )}
  </div>
)}
```

`formatCurrency` from `client/src/lib/dateUtils.ts` — already reads the hospital's currency from global config.

**Top-line STATS array** — add Revenue and ROI tiles:

```tsx
const STATS = useMemo(() => {
  const rows = metricsSummary?.rows ?? [];
  const totals = rows.reduce((acc, r) => ({
    sent: acc.sent + r.sent,
    opened: acc.opened + r.opened,
    bookings: acc.bookings + r.bookings,
    revenue: acc.revenue + r.revenue,
    cost: acc.cost + r.cost,
  }), { sent: 0, opened: 0, bookings: 0, revenue: 0, cost: 0 });
  const openRate = totals.sent > 0 ? Math.round((totals.opened / totals.sent) * 100) : 0;
  const aggregateRoi = totals.cost > 0 ? (totals.revenue - totals.cost) / totals.cost : null;
  return [
    { label: t("flows.dashboard.campaigns", "Campaigns This Month"), value: String(rows.length), icon: Send, color: "text-purple-400" },
    { label: t("flows.dashboard.reached", "Recipients Reached"), value: String(totals.sent), icon: Users, color: "text-blue-400" },
    { label: t("flows.dashboard.openRate", "Avg. Open Rate"), value: `${openRate}%`, icon: BarChart3, color: "text-green-400" },
    { label: t("flows.dashboard.bookings", "Bookings"), value: String(totals.bookings), icon: CalendarCheck, color: "text-orange-400" },
    { label: t("flows.dashboard.revenue", "Revenue"), value: formatCurrency(totals.revenue), icon: TrendingUp, color: "text-emerald-400" },
    { label: t("flows.dashboard.roi", "ROI"), value: aggregateRoi === null ? "—" : `${aggregateRoi >= 0 ? "+" : ""}${Math.round(aggregateRoi * 100)}%`, icon: Percent, color: "text-cyan-400" },
  ];
}, [metricsSummary, t]);
```

Two new lucide icons used: `TrendingUp`, `Percent`.

### `client/src/pages/business/FlowMetrics.tsx` (Phase 2 baseline)

Funnel section gains two metrics below the existing count row:

```tsx
<div className="mt-4 grid grid-cols-3 gap-4 border-t pt-4">
  <div className="text-center">
    <div className="text-xl font-semibold">{formatCurrency(f.revenue)}</div>
    <div className="text-xs text-muted-foreground">{t("flows.funnel.revenue", "Revenue")}</div>
  </div>
  <div className="text-center">
    <div className="text-xl font-semibold">{formatCurrency(f.cost)}</div>
    <div className="text-xs text-muted-foreground">{t("flows.funnel.cost", "Cost")}</div>
  </div>
  <div className="text-center">
    <div className={`text-xl font-semibold ${f.roi !== null && f.roi < 0 ? "text-red-600" : "text-emerald-600"}`}>
      {f.roi === null ? "—" : `${f.roi >= 0 ? "+" : ""}${Math.round(f.roi * 100)}%`}
    </div>
    <div className="text-xs text-muted-foreground">{t("flows.funnel.roi", "ROI")}</div>
  </div>
</div>
```

### `client/src/pages/business/Marketing.tsx` — new "Patient Re-Engagement" card

The page currently shows paid-acquisition analytics (UTMs, click IDs, campaign hierarchy). Add a new card ABOVE or BESIDE the existing ad-performance section:

```tsx
<Card>
  <CardHeader>
    <CardTitle>{t("marketing.reengagement.title", "Patient Re-Engagement (Flows)")}</CardTitle>
    <CardDescription>{t("marketing.reengagement.description", "Campaigns to existing patients for the selected period")}</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-4 gap-4">
      <MetricTile label={t("marketing.reengagement.campaigns", "Campaigns")} value={String(flowsSummary?.rows.length ?? 0)} />
      <MetricTile label={t("marketing.reengagement.revenue", "Revenue")} value={formatCurrency(totalFlowsRevenue)} />
      <MetricTile label={t("marketing.reengagement.cost", "Cost")} value={formatCurrency(totalFlowsCost)} />
      <MetricTile label={t("marketing.reengagement.roi", "ROI")} value={flowsRoi === null ? "—" : `${flowsRoi >= 0 ? "+" : ""}${Math.round(flowsRoi * 100)}%`} />
    </div>
    <div className="mt-4">
      <Button variant="link" onClick={() => navigate("/business/flows")}>
        {t("marketing.reengagement.viewAll", "View all campaigns →")}
      </Button>
    </div>
  </CardContent>
</Card>
```

The card fetches the same `/api/business/:hospitalId/flows/metrics/summary` endpoint that Phase 2's `Flows.tsx` already hits — shared query key for free cache sharing via React Query.

### `client/src/pages/admin/Settings.tsx` — new SMS cost config field

In `/admin → Settings → Regional Preferences` (or Operations settings if that fits better — inspect to match surrounding fields), add a numeric input:

```
SMS cost per message (segment): [ 0.08 ] CHF
```

Value stored as `hospitals.smsCostPerMessage`. The currency label next to the input reads `hospital.currency` (existing setting).

## File structure

### New files

None. Phase 2.1 is purely a column addition + helper extensions + UI additions.

### Modified files

| Path | Change |
|---|---|
| `shared/schema.ts` | Add `smsCostPerMessage` column to `hospitals` |
| `migrations/0225_hospitals_sms_cost_per_message.sql` | New idempotent migration |
| `migrations/meta/_journal.json` | Register the new migration (verify next available index at implementation time) |
| `server/services/marketingMetricsQuery.ts` | Extend `summarizeFlows()` and `flowDetail()` with revenue + cost + ROI |
| `server/services/marketingCostEstimate.ts` | New tiny helper file — `estimateSegmentsForSms()` + `computeSmsCost()` |
| `tests/marketing-cost-estimate.test.ts` | New tests for segment estimation + SMS cost |
| `tests/marketing-metrics-query.test.ts` (extends Phase 2's file) | Add revenue/cost/roi shape assertions |
| `client/src/pages/business/Flows.tsx` | Two new top-line STATS tiles; per-row strip gets revenue + ROI |
| `client/src/pages/business/FlowMetrics.tsx` | Funnel section gets revenue / cost / ROI row |
| `client/src/pages/business/Marketing.tsx` | New "Patient Re-Engagement" card |
| `client/src/pages/admin/Settings.tsx` | New numeric input for `smsCostPerMessage` in Regional Preferences |

## Test coverage summary

| Test file | Scenarios |
|---|---|
| `marketing-cost-estimate.test.ts` | `estimateSegmentsForSms` returns 1 for short body, 2 for 170-char body, min 1 for empty; accounts for unsubscribe footer toggle; `computeSmsCost` returns 0 for email channel, returns segments × sentCount × unitCost for sms, handles missing `smsCostPerMessage` by using 0.08 default |
| `marketing-metrics-query.test.ts` (extend) | `summarizeFlows` response includes `revenue`, `cost`, `roi` per row; revenue query excludes cancelled + no_show appointments; cost = 0 for email flows; roi is null when cost is 0; appointment without service row contributes 0 to revenue but still counts as a booking |

+6 new tests. Total marketing test count after Phase 2.1: 33 (Phase 1) + 20 (Phase 2) + 6 (Phase 2.1) = ~59 tests.

## Operational rollout

### Pre-deploy

- No new env vars.
- No Resend / ASPSMS config changes.

### After deploy

1. Run migration 0224. Idempotent.
2. All existing hospitals pick up the 0.08 default. Staff can adjust per hospital in `/admin → Settings` when they want.
3. Dashboards immediately show revenue + cost + ROI for existing campaigns (if any have been sent since Phase 2 shipped). Zero backfill required — queries compute from source.

### Rollback safety

Fully additive. The new column has a default value; removing the column would require reverting code that references it. If the UI or query is buggy: feature-flag the new fields in the API response (return null) and the UI will render `"—"` gracefully.

## Decisions log

| # | Decision | Rationale |
|---|---|---|
| 1 | No new cache table; compute revenue/cost/ROI live from source every page load | Correct under price changes, appointment cancellations, unit-cost tweaks; fast enough at our volume |
| 2 | Revenue = `clinic_services.price` × count of attributable appointments NOT in status `cancelled`/`no_show` | Simplest defensible definition; discounts/refunds are audit-level nuance out of scope |
| 3 | Cost uses segment-aware estimation (recipient × ceil(body.length / 160) × unit_cost), NOT actual ASPSMS response | Accuracy-per-complexity tradeoff favors estimation; actual-cost tracking is Phase 2.2 if staff demand it |
| 4 | Email cost = 0 (not tracked per-send) | Resend is a bundled plan; marginal cost per email is not a meaningful number |
| 5 | New column `smsCostPerMessage` on `hospitals`, default 0.08, staff-configurable in `/admin → Settings` | Per-hospital because SMS costs vary by destination country and carrier tier |
| 6 | No currency suffix on column name; uses `hospitals.currency` setting + `formatCurrency()` helper | Multi-currency support is already in the product (`hospitals.currency` at `schema.ts:73`); don't hardcode CHF anywhere |
| 7 | ROI display: positive green (`+245%`), negative red (`-40%`), null as `"—"` | Immediate visual signal for "is this campaign worth running" |
| 8 | "Patient Re-Engagement" card on `/business/marketing`, alongside existing ad-performance | Staff see both marketing funnels on one dashboard; no tab-switching; each funnel keeps its own "View details" link into deeper analytics |
| 9 | No per-variant revenue in Phase 2.1 | Per-variant attribution requires Phase 3's `flow_executions.variantId` — the query extends naturally once that column exists |
| 10 | Attribution path: `utm_content = flow.id` from Phase 2 | `flow_execution_id` (Phase 3) will be preferred when it exists, but Phase 2.1 ships on top of Phase 2's attribution alone |

## What this branch ENABLES on the marketing page

After Phase 2.1 ships:
- ✅ "Report revenue per campaign and channel" — true
- ✅ "Attribute bookings directly to campaigns" — already true after Phase 2, now with revenue number attached
- ✅ "Full transparency on marketing budget spend" — true for Flows-side spend (ad-side already existed)

Still aspirational:
- A/B testing claims (Phase 3)
- Automatic reminders for non-responders (Phase 4)

## Estimated scope

~200 lines of new code (split: ~60 cost-estimate helper + ~40 query extensions + ~60 UI additions across 4 files + ~40 admin settings input), ~6 tests. Half-day implementation.
