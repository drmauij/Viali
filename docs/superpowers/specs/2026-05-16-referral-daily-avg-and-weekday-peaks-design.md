# Source insights upgrade — tighter week-over-week referral monitoring

**Date:** 2026-05-16
**Page:** `/business/funnels` → Referrals tab → Source insights card
**Driver:** Ads-balance was rebalanced. The owner needs to spot, week over week, whether the new spend mix is bringing in fewer referrals than the previous baseline. Today's "Referral Sources Over Time" chart almost answers this — but it's monthly grain on full history, ignores the page-level `from`/`to` filter, has a sparse X-axis (missing months are dropped, not zero-padded), and lives under a chart-card title that's barely readable in dark mode. The donut chart in the same card has a legend that overlaps the pie at higher source counts. Net: the card has the data but not the ergonomics for tight monitoring.

## Goals

1. **Upgrade the existing "Referral Sources Over Time" chart** so it's the daily / weekly monitoring tool the owner actually needs:
   - Granularity toggle: **Week (default), Month, Day**.
   - Honors the page-level `from` / `to` filter (same as `referral-stats` and the events table).
   - Gap-free X-axis: zero-count periods are padded so the timeline is continuous.
   - Per-source lines retained. When a source is focused (donut slice click → `selectedReferralSource`), the other lines dim and a **dashed 7-period moving average** overlays for the focused source.
2. **Fix the donut legend overlap** — `Legend` rendered below the pie with its own row height, container tall enough not to clip when there are 6+ sources.
3. **Fix the chart-card title contrast** — `ChartCard` title currently inherits muted color on dark backgrounds; switch to `text-foreground` so it reads at first glance.
4. **Add an "avg referrals/day" headline number** next to the existing `{totalReferrals} total booking referrals` line. Single derived metric, no extra fetch.
5. **Add a "weekday peaks" bar chart** — 7 bars (Mon–Sun), stacked by source, value = average referrals per day for that weekday across the filtered range. Answers "which day is consistently weakest" — a different question than the line chart, not redundant.

Non-goals: paid-vs-organic split on these charts, prior-period delta, splitting the MA per source for every source at once (only the focused source gets an MA overlay), Detail Breakdown rework.

## Architecture

One new read endpoint, one new storage helper, in-place modifications to `ReferralEventsTab.tsx` and (one-line) the existing `ChartCard` component. The legacy `referral-timeseries` endpoint stays untouched for back-compat (`chain.ts` and any other callers continue working).

### Server

`server/lib/referralAnalytics.ts` — new helper:

```ts
export interface ReferralDailyRow {
  date: string;                     // 'YYYY-MM-DD' in the bucketing timezone
  total: number;                    // sum across all sources for this day
  bySource: Record<string, number>; // keyed by referralEvents.source value:
                                    // social | search_engine | llm | word_of_mouth
                                    // | belegarzt | marketing | other
                                    // Sources with zero count for the day MAY be omitted;
                                    // the client treats missing keys as 0.
}

export interface ReferralDailyResult {
  rows: ReferralDailyRow[];
  sources: string[];                // distinct sources present in [from, to],
                                    // ordered by total count descending. Drives
                                    // line / stack order and legend ordering.
  timezone: string;                 // e.g. "Europe/Zurich" for single-hospital scope,
                                    // "UTC" for cross-TZ group scope.
}

export async function getReferralDailyBySource(
  hospitalIds: string[],
  opts: { from?: string; to?: string } = {}
): Promise<ReferralDailyResult>;
```

Behavior:

- Filters `referral_events` by `hospitalScopeClause` (same predicate helper used by `getReferralStats`).
- Resolves the bucketing timezone internally: looks up `hospitals.timezone` for the resolved `hospitalIds`. Returns that timezone if all entries match, otherwise `"UTC"`.
- If `from` / `to` provided, applies `gte` / `lte` on `created_at`. If `from` is missing, defaults to `to - 90 days`. If `to` is missing, defaults to `now()`.
- Buckets in SQL by `(to_char(created_at AT TIME ZONE $tz, 'YYYY-MM-DD'), source)` with `count(*)`.
- Coalesces unknown / null `source` to `"other"` to match the existing UI palette and donut.
- Folds the `(day, source, count)` triplets into one row per day with `bySource` populated for sources that had ≥1 event that day, plus `total` as the row sum.
- **Gap-free padding**: server-side `generate_series(from::date, to::date, '1 day')` joined LEFT to the grouped result, so every calendar day in `[from, to]` appears with `total: 0`, `bySource: {}` if it had no events. This is the single fix that gives the upgraded line chart its continuous X-axis at any grain — the client never has to know which days exist in the DB.
- Computes `sources` as the distinct sources present in the range, ordered by descending total count.
- Ordered ascending by `date`.
- **Range cap**: rejects with 400 if the resolved range exceeds 366 days. Day-grain across multi-year windows is meaningful but not what this card is for, and the line chart's Month grain handles long windows fine via client-side rollup.

### Routes

`server/routes/business.ts`:

```ts
router.get(
  '/api/business/:hospitalId/referral-daily',
  isAuthenticated,
  isMarketingOrManager,
  async (req, res) => { /* resolveHospitalScope → getReferralDailyBySource */ }
);
```

`server/routes/chain.ts`: mirror at `/api/chain/:groupId/referral-daily`, guarded by `isChainAdminForGroup`, same pattern as the other chain referral routes.

`funnelsUrl` (in `client/src/lib/funnelsApi.ts`): extend the path union to include `"referral-daily"`. The existing builder already accepts `{ from, to }` query params.

The legacy `/referral-timeseries` route and `getReferralTimeseries` helper stay untouched. The upgraded chart switches to the new endpoint; no migration needed for the legacy callers.

### Client

In `client/src/components/funnels/ReferralEventsTab.tsx`:

**New state and query:**

```ts
const [grain, setGrain] = useState<"week" | "month" | "day">("week");

const dailyUrl = funnelsUrl("referral-daily", scope, { from, to });
const { data: referralDaily, isLoading: referralDailyLoading } = useQuery<ReferralDailyResult>({
  queryKey: [dailyUrl],
  enabled: scope.hospitalIds.length > 0,
});
```

`grain` is local state, not persisted. The default "week" reflects the post-rebalance monitoring use case; a follow-up could persist to `localStorage` if it turns out to be a per-user preference, but YAGNI for now.

**Derived values (memoized):**

- `daysInRange` — `(to - from)` in days, or `referralDaily?.rows.length` when filter is empty.
- `avgPerDay` — `referralData.totalReferrals / daysInRange`, formatted to 1 decimal. Always reflects **all sources**, never the donut selection — the headline number must stay comparable across selections.
- `periodSeries` — client-side rollup of `referralDaily.rows` to the chosen grain:
  - `day`: identity map. Each `date` is its own period.
  - `week`: keyed by ISO week start (`YYYY-Www`, Monday-anchored). Period label uses `formatDate` on the Monday for display consistency with hospital regional settings.
  - `month`: keyed by `YYYY-MM`. Period label uses `formatDate(firstOfMonth, { month: 'short', year: 'numeric' })`.
  - Each period row: `{ period, ...bySource (per-source numeric keys), focused, ma7 }`.
  - `focused` = the count for `selectedReferralSource` in that period, or `null` when nothing is selected. The MA `<Line>` is conditionally rendered only when a source is selected, so the `null`/no-render path keeps the chart clean and avoids rendering an MA over the all-sources total (which would compete visually with the colored lines).
  - `ma7` = trailing 7-period mean of `focused` when `selectedReferralSource` is set, right-aligned, partial windows for the first 6 periods. Undefined when nothing is selected.
- `weekdayBySource` — from `referralDaily.rows` directly (not the rolled-up series), 7 entries `mon` … `sun` with `{ label, totalAvg, bySource: Record<string, number> }`. Each value is `sum(daily.bySource[src] for that weekday) / numberOfThatWeekdayInRange`. Denominator = the count of dates in `referralDaily.rows` whose weekday matches; empty days are treated as zero (not skipped). This way a range with only 2 Mondays but 8 zero-count Mondays still averages over 10.

**UI placement** inside the existing Source insights `<CardContent>`, in this order:

```
[ {totalReferrals} total booking referrals  ·  {avgPerDay} /day avg ]   ← extended line

[ donut "How patients found us"          ] [ "Detail breakdown"         ]
                                                                          ↑ legend overlap fix

[ Referral sources over time (?)  [W][M][D]                              ]   ← upgraded chart,
                                                                              grain toggle on right

[ Weekday peaks (?)                                                       ]   ← new
```

(The `Daily referrals` chart from the earlier draft is dropped — the upgraded "Referral sources over time" with `D` grain selected covers it.)

### Component changes in detail

1. **`ChartCard` title contrast.** Change `<CardTitle className="text-lg">` → `<CardTitle className="text-lg text-foreground">`. One line. The rest of the card already inherits foreground correctly; only the title was bleeding into the muted token via theme inheritance.

2. **Donut legend overlap.** The current `<PieChart>` block uses default `<Legend>` placement with `outerRadius={100}` inside a `height={300}` container. Fix:
   - Bump container `height` to `360` (was 300).
   - Set `<Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 12, maxHeight: 96, overflowY: "auto" }} />`.
   - The pie keeps its dimensions; the legend gets a dedicated band below it with vertical scroll for the rare case of 8+ sources. No more overlap.
   - The custom `formatter` callback that produces `"Search Engine 56 (29%)"` stays — only the layout changes.

3. **Upgraded "Referral sources over time".**
   - Replace the existing `<LineChart data={referralLineData}>` (which is fed from `referralTimeseries`) with `<LineChart data={periodSeries}>`.
   - Add a small `<ToggleGroup>` (or three `Button`s in `outline` variant, matching the existing UI primitives — pick whichever ships first) in the `<ChartCard>` header right side: `W / M / D`. Default `W`. State: the `grain` from above.
   - Render one `<Line>` per source from `referralDaily.sources` using `REFERRAL_COLORS`.
   - When `selectedReferralSource` is set, the other `<Line>` components get `opacity={0.25}` and the focused source gets `strokeWidth={3}`. An additional `<Line dataKey="ma7" strokeDasharray="4 4" stroke="white" strokeOpacity={0.6}>` overlays the moving-average trail. When no source is selected, the MA line is hidden.
   - X-axis `dataKey="period"`. Tick formatter uses the period-display logic from above (week → Monday-of-week label, month → short-month + year).
   - Y-axis: `allowDecimals={false}`.
   - Empty state: when `periodSeries.length === 0` or `referralDaily.rows` is all zeros, show the existing `"no data"` placeholder.

4. **Avg/day inline number.** Extend the existing sample-size line:
   ```tsx
   <div className="text-sm text-muted-foreground px-1">
     {referralData.totalReferrals} {t("business.referrals.totalBookingReferrals")}
     {avgPerDay !== null && (
       <> · <span className="font-medium text-foreground">{avgPerDay.toFixed(1)}</span> {t("business.referrals.avgPerDayShort", "/day avg")}</>
     )}
   </div>
   ```
   The `font-medium text-foreground` makes the number visually prominent without adding a separate stat tile.

5. **Weekday peaks chart.** New `<ChartCard>` block, `<BarChart data={weekdayBySource}>`:
   - 7 bars, X = `label` (localized `t("common.weekday.mon")` etc.), Y = `totalAvg`.
   - **Stacked by source**: one `<Bar dataKey={`bySource.${src}`} stackId="weekday" fill={REFERRAL_COLORS[src]} />` per source from `referralDaily.sources`.
   - When `selectedReferralSource` is set, non-selected stacks get `opacity={0.25}`. The focused source pops.
   - Height 220.

### Data flow

```
from/to (page filter) ─┐
                       ├──► referral-stats   ──► donut + Detail breakdown + totalReferrals + avgPerDay
                       ├──► referral-daily   ──► periodSeries (W/M/D) + weekdayBySource   [NEW]
                       └──► referral-events  ──► table

donut click → selectedReferralSource ──► focuses upgraded line chart + weekday bar chart
                                          (no extra fetch; pure client-side dim)
```

`avgPerDay` reads `totalReferrals` from the stats query (already present) and `daysInRange` from the page filter, so the headline number renders before `referral-daily` returns. The line chart and weekday chart wait on `referral-daily`.

## Error handling and edge cases

- **Empty range / `daysInRange ≤ 0`** — `avgPerDay` renders as `—`. Both new derived views show the existing "no data" empty state.
- **`from` and `to` both unset** — server uses `to = now, from = to - 90d`. Documented in the route comment. Client shows the same UI.
- **Range < 7 days** — line chart renders the MA only when a source is selected; for partial windows, the first 6 periods get an MA computed over `min(i+1, 7)` periods, marked with `strokeDasharray="4 4"`. No banner.
- **Range > 366 days** — server returns 400. Client shows an inline message under the chart: "Range too wide for daily detail — narrow the date filter to see this chart." The monthly multi-series line in this case is what the legacy `referral-timeseries` was for; we keep that fallback open by leaving the legacy endpoint in place, but the upgraded chart is the primary view for ≤ 366 days.
- **Weekday with zero occurrences in range** — bar renders at height 0; tooltip shows `0 / 0 days`.
- **Group scope (`X-Active-Scope: group`)** with differing `timezone` values across hospitals — server buckets in UTC; response `timezone` is `"UTC"`; the upgraded chart and weekday chart both render a small `(UTC)` annotation next to their titles. Single-hospital scope (or group scope where every hospital shares the same timezone) shows no annotation.
- **Cross-midnight events** — using `created_at AT TIME ZONE $tz` for bucketing matches the same convention as the rest of the codebase (`shared/admissionCongruence.ts` `localDayKey`). The donut and the upgraded chart will therefore agree on which day an event belongs to.
- **Donut legend wrapping** — already handled by the layout fix above. With 8+ sources the legend scrolls within its band rather than pushing the pie up.

## Testing

New file `tests/referral-analytics-daily.test.ts`:

- Returns gap-free dates between `from` and `to` (weekends and days with no events included with `total: 0`, `bySource: {}`).
- Source bucketing: `count(*)` per `(day, source)` matches a hand-rolled SQL aggregation on the fixture.
- `sources` array is sorted by descending total count and includes every source present in the range.
- Null / unknown `source` values bucket to `"other"`.
- `hospitalIds` scoping: an event in a non-listed hospital is excluded.
- Timezone bucketing: an event whose `created_at` is `2026-05-15T23:30:00Z` lands on `2026-05-16` for `Europe/Zurich` (CEST = UTC+2) and on `2026-05-15` for UTC.
- 366-day cap returns 400.
- `from` missing defaults to `to - 90 days`.

Component-level tests (in `tests/funnels/referral-events-tab.test.tsx`, new file unless a sibling already exists):

- `avgPerDay = totalReferrals / daysInRange`, not `referralDaily.rows.length`, when filter is set.
- Grain rollup: a `referralDaily` fixture spanning 3 weeks produces 3 rows in `periodSeries` at week grain, 1 row at month grain, 21 rows at day grain.
- `weekdayBySource.mon.totalAvg = sum(Monday counts) / numberOfMondaysInRange` (verify denominator includes zero-count Mondays).
- Donut slice click sets `selectedReferralSource`, line chart renders the MA only when set.

`tests/public-docs.test.ts` — no change. This is an admin endpoint, not a public webhook.

## Internationalization

New i18n keys (add to all locale files alongside existing `business.referrals.*`):

```
business.referrals.avgPerDayShort          → "/day avg"
business.referrals.grain.week              → "Week"
business.referrals.grain.month             → "Month"
business.referrals.grain.day               → "Day"
business.referrals.weekdayPeaks            → "Weekday peaks"
business.referrals.weekdayPeaksHelp        → "Average referrals per day for each weekday across the selected range. Stacked by source — click a slice in 'How patients found us' to isolate one."
business.referrals.rangeTooWide            → "Range too wide for daily detail — narrow the date filter to see this chart."
```

Weekday labels reuse existing `common.weekday.{mon,tue,wed,thu,fri,sat,sun}` keys. If they don't exist, add them in the same commit. The existing tone rule applies — formal/clinical, no casual second-person.

## Open questions

1. **Default grain choice.** Spec assumes Week. If the owner ends up flipping to Day for the first month of monitoring and Month thereafter, persisting `grain` to `localStorage` is a 3-line follow-up.
2. **Prior-period comparison.** Not in scope. The line + MA gives a visual baseline. A "vs previous period" delta would need a second range fetch and a comparison primitive used nowhere else on this page yet.
3. **Avg/day visibility while card is collapsed.** Default is "hidden when card is collapsed". If the owner wants the number always visible (the monitoring use case suggests yes), a small follow-up moves the line into the `CardHeader`.

## Implementation order

1. `getReferralDailyBySource` + tests (timezone, padding, scoping, range cap, source coalescing).
2. `referral-daily` business + chain routes.
3. `funnelsUrl` union extension.
4. Component edits (one commit):
   - `ChartCard` title color fix.
   - Donut legend layout fix.
   - New query + memoized `periodSeries` + `weekdayBySource` + `avgPerDay`.
   - Grain toggle in the upgraded line chart header.
   - Replace `referralTimeseries` data feed in the line chart with `periodSeries`.
   - Per-source MA overlay when `selectedReferralSource` is set.
   - Add weekday-peaks `<ChartCard>` block.
   - Extend sample-size line with avg/day.
5. i18n keys.
6. Manual smoke on `/business/funnels` (single hospital, group scope, empty range, < 7 day range, > 366 day range, no events at all, 192-referral fixture from the screenshot).
7. `npm run check` + `npm test`.
