# Flows Revenue per Campaign (Phase 2.1) — Design Spec

**Date:** 2026-04-18 (revised — supersedes the earlier "revenue + cost + ROI" draft)
**Phase:** 2.1 of the Flows compliance + analytics roadmap
**Builds on:** Phase 2 (event tracking + per-campaign booking attribution)
**Status:** Design — implementation starting immediately

## Goal

Surface **revenue per campaign** on the Flows dashboard so staff can see which campaigns drive real money, not just bookings. Also clean up the existing campaign list table — fix the placeholder "Open Rate" column and move per-campaign metrics from the cramped inline mini-strip into proper columns.

## Why the scope changed from the earlier draft

The original Phase 2.1 spec included SMS cost tracking (`hospitals.sms_cost_per_message`, segment estimation, admin settings input) and ROI display. After discussion: SMS cost is a few cents per send and email is effectively free, so the "cost" side of ROI is approximately zero for realistic campaign volumes. A campaign to 340 patients costs maybe CHF 27 in SMS or CHF 0 via email — not a number staff need to see or act on.

What staff DO need: revenue. "This campaign drove CHF 18,400 in bookings" is the actionable signal. Cost and ROI are removed from scope.

The earlier spec also added a "Patient Re-Engagement" card to `/business/marketing`. That's also dropped: Flows live on `/business/flows`, `/business/marketing` focuses on paid-ad performance, and mixing the two invites cross-funnel confusion. Revenue stays on the Flows page where staff already are.

## Non-goals

- SMS cost tracking (email is free, SMS is pennies — the cost side of ROI is effectively zero at our volumes)
- ROI calculation / display
- `hospitals.sms_cost_per_message` column or admin settings input
- "Patient Re-Engagement" section on `/business/marketing`
- Discount / refund / partial-payment accounting (v1 uses service list price)
- Multi-appointment patient attribution (only the first booking per patient-per-campaign counts)
- Package / membership revenue (defer until Memberships feature ships)
- Realized-vs-invoiced revenue distinction (v1 = list price on booked appointment)
- Per-variant revenue (Phase 3 adds it as a one-line query extension once `flow_executions.variantId` exists)

## Scope summary

1. **Extend the existing metrics queries** (`summarizeFlows`, `flowDetail`) to aggregate revenue per campaign from `clinic_services.price` joined through `referral_events.utm_content = flow.id` → appointments, excluding cancelled / no-show.
2. **Add revenue to API response payloads** (no new endpoints — extends existing ones).
3. **Clean up the Flows.tsx campaign list table:**
   - Delete the cramped inline mini-strip under campaign names
   - Wire up the "Open Rate" column (currently shows `"—"` placeholder)
   - Add a "Booked" column (per-campaign booking count from Phase 2's existing data)
   - Add a "Revenue" column (new)
4. **Add revenue tile** in the `FlowMetrics.tsx` funnel next to the Booked number.
5. **Add revenue to top-line STATS card row** — one new tile alongside Campaigns / Reached / Open Rate / Bookings.

No schema change. No migration. No new files. No new env vars. Purely query + UI extensions.

## Data model

Nothing new. Revenue is computed from existing tables every page load:

- `referral_events` (populated by `/book` POST when a patient with `?utm_content=<flow.id>` completes a booking) — already wired end-to-end after Phase 2.
- `clinic_appointments.status` — exclude `'cancelled'` and `'no_show'`.
- `clinic_appointments.service_id` → `clinic_services.price` (decimal, in the hospital's currency).

## Revenue query

One SQL query added alongside the existing summary queries. For the list-view summary:

```sql
SELECT
  re.utm_content AS "flowId",
  COALESCE(SUM(cs.price), 0) AS revenue
FROM referral_events re
JOIN clinic_appointments ca ON ca.id = re.appointment_id
LEFT JOIN clinic_services cs ON cs.id = ca.service_id
WHERE re.hospital_id = $1
  AND re.utm_content IS NOT NULL
  AND re.created_at >= $2
  AND ca.status NOT IN ('cancelled', 'no_show')
GROUP BY re.utm_content;
```

Edge cases:
- **Appointment without a service** (`service_id IS NULL`) — counts as a booking in Phase 2's booking count, contributes 0 to revenue. The LEFT JOIN + COALESCE handles it.
- **Service deleted after booking** — joined row is null, contributes 0. Historical revenue numbers degrade gracefully.
- **Service price changed later** — revenue reflects the CURRENT list price (not the price at booking time). Acceptable for v1; the correct-at-time-of-booking story needs invoices, which is deferred.

For the drill-down:

```sql
SELECT COALESCE(SUM(cs.price), 0) AS revenue
FROM referral_events re
JOIN clinic_appointments ca ON ca.id = re.appointment_id
LEFT JOIN clinic_services cs ON cs.id = ca.service_id
WHERE re.utm_content = $1
  AND ca.status NOT IN ('cancelled', 'no_show');
```

(No `created_at` scoping for drill-down — it's all-time per the Phase 2 convention.)

## API shape changes

No new endpoints. The existing Phase 2 endpoints gain one field:

### `GET /api/business/:hospitalId/flows/metrics/summary`

Each row gets a `revenue` number:

```typescript
{
  since: string;
  rows: Array<{
    flowId: string;
    // ... existing fields: sent, delivered, opened, clicked, bounced, complained, bookings ...
    revenue: number; // NEW
  }>;
}
```

### `GET /api/business/:hospitalId/flows/:flowId/metrics`

`funnel` object gets a `revenue` field:

```typescript
{
  funnel: {
    // ... existing fields ...
    revenue: number; // NEW
  };
  bounces: [...];
  complaints: [...];
  series: [...];
}
```

### Implementation inside the query helpers

Both `summarizeFlows()` and `flowDetail()` in `server/services/marketingMetricsQuery.ts` get one extra `db.execute(sql\`...\`)` call for revenue. Results merged into the response objects. Preserves the "multiple small queries merged in JS" pattern from Phase 2.

## Frontend changes

### `client/src/pages/business/Flows.tsx` — table cleanup + revenue

**Remove the inline mini-strip** (currently lines 214–220 — the `metricsByFlow[c.id] &&` block that renders *"X sent · Y opened · Z booked"* under the campaign name):

Delete that block entirely. Per-campaign metrics will live in proper columns from now on.

**Table header — rearrange and add columns:**

Current:
```
Name | Status | Channel | Recipients | Sent | Open Rate | (actions)
```

New:
```
Name | Status | Channel | Recipients | Sent | Opens | Booked | Revenue | (actions)
```

Where:
- **Recipients** = `c.recipientCount` (unchanged — the planned segment size at send time)
- **Sent** = the send date (unchanged — shows when it went out)
- **Opens** = a rate, e.g. `"18 (53%)"` — count of opened + percent of sent
- **Booked** = `metricsByFlow[c.id]?.bookings ?? "—"`
- **Revenue** = `formatCurrency(metricsByFlow[c.id]?.revenue ?? 0)` — uses the existing `formatCurrency` helper in `client/src/lib/dateUtils.ts` which reads the hospital's currency from global config

**Render per row:**

```tsx
<TableCell>
  {metricsByFlow[c.id]?.sent ? (
    <span>
      {metricsByFlow[c.id].opened}
      {" "}
      <span className="text-muted-foreground text-xs">
        ({Math.round((metricsByFlow[c.id].opened / metricsByFlow[c.id].sent) * 100)}%)
      </span>
    </span>
  ) : "—"}
</TableCell>
<TableCell>{metricsByFlow[c.id]?.bookings ?? "—"}</TableCell>
<TableCell>
  {metricsByFlow[c.id]?.revenue !== undefined
    ? formatCurrency(metricsByFlow[c.id].revenue)
    : "—"}
</TableCell>
```

**Top-line STATS — add a 5th tile:**

```tsx
const STATS = useMemo(() => {
  const rows = metricsSummary?.rows ?? [];
  const totals = rows.reduce(
    (acc, r) => ({
      sent: acc.sent + r.sent,
      opened: acc.opened + r.opened,
      bookings: acc.bookings + r.bookings,
      revenue: acc.revenue + r.revenue, // NEW
    }),
    { sent: 0, opened: 0, bookings: 0, revenue: 0 },
  );
  const openRate = totals.sent > 0 ? Math.round((totals.opened / totals.sent) * 100) : 0;
  return [
    { label: t("flows.dashboard.campaigns", "Campaigns This Month"), value: String(rows.length), icon: Send, color: "text-purple-400" },
    { label: t("flows.dashboard.reached", "Recipients Reached"), value: String(totals.sent), icon: Users, color: "text-blue-400" },
    { label: t("flows.dashboard.openRate", "Avg. Open Rate"), value: `${openRate}%`, icon: BarChart3, color: "text-green-400" },
    { label: t("flows.dashboard.bookings", "Bookings"), value: String(totals.bookings), icon: CalendarCheck, color: "text-orange-400" },
    // NEW tile:
    { label: t("flows.dashboard.revenue", "Revenue"), value: formatCurrency(totals.revenue), icon: TrendingUp, color: "text-emerald-400" },
  ];
}, [metricsSummary, t]);
```

One new lucide icon: `TrendingUp`. Add to the existing `lucide-react` import group at the top of the file. If the STATS tiles are rendered in a 4-column grid, change to 5-column responsive (e.g., `grid-cols-2 md:grid-cols-3 lg:grid-cols-5`).

### `client/src/pages/business/FlowMetrics.tsx` — add revenue tile to funnel

The funnel currently renders 5 tiles: Sent · Delivered · Opened · Clicked · Booked. Add Revenue as a 6th tile:

```tsx
const FUNNEL = [
  { label: t("flows.funnel.sent", "Sent"), value: f.sent },
  { label: t("flows.funnel.delivered", "Delivered"), value: f.delivered },
  { label: t("flows.funnel.opened", "Opened"), value: f.opened },
  { label: t("flows.funnel.clicked", "Clicked"), value: f.clicked },
  { label: t("flows.funnel.booked", "Booked"), value: f.bookings },
  { label: t("flows.funnel.revenue", "Revenue"), value: formatCurrency(f.revenue), highlight: true },
];
```

(A `highlight: true` flag lets the revenue tile render with a distinctive emerald-600 color — visually calls out the money signal.)

The funnel grid is currently `grid-cols-5`. Change to `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` to accommodate the new tile without crushing on narrow viewports.

## File structure

### New files

None.

### Modified files

| Path | Change |
|---|---|
| `server/services/marketingMetricsQuery.ts` | Extend `summarizeFlows()` + `flowDetail()` with revenue aggregation query |
| `client/src/pages/business/Flows.tsx` | Kill inline mini-strip; wire Opens column; add Booked + Revenue columns; add Revenue tile to STATS; import `formatCurrency` + `TrendingUp` |
| `client/src/pages/business/FlowMetrics.tsx` | Add Revenue tile to funnel; bump grid cols |
| `tests/marketing-metrics-query.test.ts` | Assert revenue query references `clinic_services`, `referral_events`, filters `cancelled`/`no_show`, uses `COALESCE(SUM(price), 0)` |

No schema change, no migration, no new routes, no new env vars. Zero operational rollout steps.

## Test coverage

Extends Phase 2's existing `tests/marketing-metrics-query.test.ts` with two new assertions:

```typescript
it("queries clinic_services for revenue, excluding cancelled + no_show appointments", async () => {
  await summarizeFlows("h1", new Date("2026-04-01T00:00:00Z"));
  const allSql = capturedSql.join(" ");
  expect(allSql).toContain("clinic_services");
  expect(allSql).toContain("ca.service_id");
  expect(allSql).toMatch(/'cancelled'/);
  expect(allSql).toMatch(/'no_show'/);
  expect(allSql).toMatch(/coalesce\(sum/i);
});

it("flowDetail includes a revenue query", async () => {
  await flowDetail("flow_xyz");
  const allSql = capturedSql.join(" ");
  expect(allSql).toContain("clinic_services");
  expect(allSql).toMatch(/coalesce\(sum/i);
});
```

That's it — no new test files. Visual verification of the UI happens by loading `/business/flows` in dev after merge.

## Decisions log

| # | Decision | Rationale |
|---|---|---|
| 1 | Drop cost + ROI tracking entirely | SMS is pennies, email is free; the "cost" side of ROI is effectively zero at our campaign volumes and staff can't act on it |
| 2 | Drop `/business/marketing` integration | Flows and paid ads are different funnels; staff looking at campaign results go to `/business/flows` |
| 3 | Revenue via live query, no caching | <50ms with existing indexes; correct under price changes + appointment cancellations; matches Phase 2's pattern |
| 4 | Revenue = `clinic_services.price` × bookings in status ≠ cancelled/no_show | Simplest defensible number; v1 ignores discounts/refunds |
| 5 | No currency column on the numbers — use `hospitals.currency` + `formatCurrency()` | Multi-currency already in product; never hardcode CHF anywhere |
| 6 | Clean up the table: kill inline mini-strip, wire Open Rate column, add Booked + Revenue columns | Phase 2's mini-strip was a compromise; proper columns are clearer and more scannable |
| 7 | No per-variant revenue in this phase | Extends naturally once Phase 3's `flow_executions.variantId` exists |

## What this enables on the marketing page

After Phase 2.1 ships:
- ✅ "Report revenue per campaign" — true
- ✅ "Track which offers convert" — truer (Phase 2 had booking count; 2.1 has booking count + money)

Still aspirational (Phase 3): A/B testing claims.
Still aspirational (Phase 4 / never): "automatic reminders for non-responders", budget forecasting.

## Estimated scope

~80 lines of code:
- ~30 lines: query helper extensions (2 new SQL statements, shape merges)
- ~40 lines: Flows.tsx column rewiring + STATS tile
- ~10 lines: FlowMetrics.tsx funnel tile
- +2 test assertions

Half-morning implementation.
