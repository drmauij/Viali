# Referral daily average + weekday peaks — design

**Date:** 2026-05-16
**Page:** `/business/funnels` → Referrals tab → Source insights card
**Driver:** Ads-balance was rebalanced. The owner needs to spot, week over week, whether the new spend mix is bringing in fewer referrals than the previous baseline, and which weekdays consistently underperform. The existing Source insights view answers "where did they come from" but not "how is the rate trending" or "is one weekday weaker than the others".

## Goals

1. Surface **average referrals per day** for the currently-filtered date range, prominently enough to be readable when the Source insights card is collapsed.
2. Show **development of daily referrals over time** with a 7-day moving average so a sustained drop is visible without weekday noise.
3. Show **per-weekday averages (Mon–Sun)** so the owner can tell if specific days of the week consistently bring more/fewer referrals.

Non-goals: source-by-source daily stacking, paid-vs-organic split on these charts, channel comparison. The existing donut, detail breakdown, and monthly multi-series chart already cover the "by source" axis. Adding source stacking to the new charts would duplicate that signal and crowd the card.

## Architecture

Single new read endpoint, single new storage helper, two new chart blocks inside the existing `Source insights` card. No schema changes.

### Server

`server/lib/referralAnalytics.ts` — new helper:

```ts
export interface ReferralDailyRow {
  date: string; // 'YYYY-MM-DD' in the bucketing timezone
  count: number;
}

export interface ReferralDailyResult {
  rows: ReferralDailyRow[];
  timezone: string; // e.g. "Europe/Zurich" for single-hospital scope, "UTC" for cross-TZ group scope
}

export async function getReferralDailyCounts(
  hospitalIds: string[],
  opts: { from?: string; to?: string } = {}
): Promise<ReferralDailyResult>;
```

The helper resolves the bucketing timezone internally: looks up `hospitals.timezone` for `hospitalIds`, returns that timezone if all entries match, otherwise `"UTC"`.

Behavior:

- Filters `referral_events` by `hospitalScopeClause` (same predicate helper used by `getReferralStats`).
- If `from` / `to` provided, applies `gte` / `lte` on `created_at`. If `from` is missing, defaults to `to - 90 days`. If `to` is missing, defaults to `now()`. The unbounded case is the only one where day-grain across full history is genuinely expensive; documenting and capping it in the helper is cleaner than pushing the responsibility to callers.
- Buckets by day using `to_char(created_at AT TIME ZONE $tz, 'YYYY-MM-DD')`. The `$tz` parameter is the hospital timezone for single-hospital scope. For group scope where the hospitals in `hospitalIds` may have differing `timezone` columns, the helper falls back to UTC and the caller is expected to surface a small footnote in the UI.
- Returns gap-free rows: emits a `count: 0` entry for every calendar day in `[from, to]` that has no events. Implementation: server-side `generate_series` joined left to the grouped result. Padding server-side keeps the contract honest — clients never need to know which days exist in the DB.
- Ordered ascending by `date`.

### Routes

`server/routes/business.ts`:

```ts
router.get(
  '/api/business/:hospitalId/referral-daily',
  isAuthenticated,
  isMarketingOrManager,
  async (req, res) => { /* resolveHospitalScope → getReferralDailyCounts */ }
);
```

`server/routes/chain.ts`: mirror at `/api/chain/:groupId/referral-daily`, guarded by `isChainAdminForGroup`, same pattern as the other chain referral routes.

`funnelsUrl` (in `client/src/lib/funnelsApi.ts`): extend the path union to include `"referral-daily"`. The existing builder already accepts `{ from, to }` query params.

### Client

In `client/src/components/funnels/ReferralEventsTab.tsx`:

- New React-Query call:
  ```ts
  const dailyUrl = funnelsUrl("referral-daily", scope, { from, to });
  const { data: referralDaily, isLoading: referralDailyLoading } = useQuery<ReferralDailyResult>({
    queryKey: [dailyUrl],
    enabled: scope.hospitalIds.length > 0,
  });
  ```
- Three memoized derivations:
  - `avgPerDay` — uses the already-present `referralData.totalReferrals` divided by `daysInRange` (computed from `from` / `to`, falling back to `referralDaily.rows.length` when filter is empty). No second round-trip.
  - `dailyWithMa` — maps `referralDaily.rows` to `{ date, count, ma7 }` where `ma7` is the trailing 7-day mean (right-aligned, partial windows for the first 6 entries).
  - `weekdayAvg` — array of 7 objects keyed `mon` … `sun` with `{ label, avg, count }` where `avg = sum(counts for that weekday) / numberOfThatWeekdayInRange`. The denominator is the count of dates in `referralDaily.rows` whose weekday matches, not `count`, so empty days are treated as zeros (correct) rather than skipped (would inflate the avg).

### UI placement

Inside the existing Source insights `<CardContent>`, in this order:

```
[ totalReferrals · avgPerDay /day ]              ← extend the existing sample-size line
[ donut "How patients found us" ] [ "Detail breakdown" ]
[ Daily referrals (?)            — full-width   ]   ← new
[ Weekday peaks (?)              — half-width   ]   ← new
[ Referral sources over time (?) — full-width   ]   ← existing, unchanged
```

The avg/day sits next to the existing `{totalReferrals} total booking referrals` text inside the same `<div className="text-sm text-muted-foreground px-1">`. The card header is collapsed by default; the avg/day visibility is gated by the same `sourceInsightsOpen` state as everything else in the card. (If the user wants the avg/day visible while collapsed, that's a small follow-up — flagged in Open Questions.)

### Components

No new sub-components. Both new charts use the existing `ChartCard` helper already defined in the file. Render fragments:

- **Daily referrals** — Recharts `<ComposedChart>` with a `<Bar dataKey="count">` and an overlaid `<Line dataKey="ma7" type="monotone" strokeDasharray="4 4">`. X axis is `date` formatted via the existing `dateUtils` helpers in `client/src/lib/dateUtils.ts` (european/american per hospital regional settings — never hardcode). Y is integer counts. Height 240.
- **Weekday peaks** — Recharts `<BarChart>` with 7 bars, X = weekday label (localized via `t("common.weekday.mon")` etc., reusing existing i18n keys where present), Y = `avg`. Bar fill is `--primary`. Height 200.

Both charts share the existing card's styling (`<ChartCard title=… helpText=…>`).

### Data flow

```
from/to (page filter) ─┐
                       ├──► referral-stats   ──► donut + Detail breakdown + totalReferrals
                       ├──► referral-daily   ──► avgPerDay, daily chart, weekday chart   [NEW]
                       └──► referral-events  ──► table
                  referral-timeseries (monthly, full history, unchanged) ──► monthly multi-series line
```

`avgPerDay` reads `totalReferrals` from the stats query (already present) and `daysInRange` from the page filter, so it doesn't have to wait on `referral-daily` to render the headline number. The daily/weekday charts wait on `referral-daily`.

## Error handling and edge cases

- **Empty range / `daysInRange ≤ 0`** — `avgPerDay` renders as `—`. Both new charts show their `no-data` empty state.
- **`from` and `to` both unset** — server uses `to = now, from = to - 90d`. Documented in the route comment. Client shows the same UI; no banner needed (the page filter is the user's lever).
- **Range < 7 days** — daily chart renders the MA line with `strokeDasharray="4 4"` and the help tooltip notes "rolling average uses the available days when the range is shorter than 7". No separate banner.
- **Weekday with zero occurrences in range** — bar still renders at height 0 with the label visible; tooltip shows `0 / 0 days`.
- **Group scope (`X-Active-Scope: group`)** with differing `timezone` values across hospitals in the group — server buckets in UTC; response `timezone` is `"UTC"`; the UI shows a small `(UTC)` annotation next to the chart titles. Single-hospital scope (or group scope where every hospital shares the same timezone) uses that timezone and shows no annotation.
- **Cross-midnight events** — using `created_at AT TIME ZONE $tz` for bucketing matches the same convention as the rest of the codebase (`shared/admissionCongruence.ts` `localDayKey`). The donut and the new charts will therefore agree on which day an event belongs to.
- **Server cap** — `getReferralDailyCounts` rejects with 400 if the resolved range exceeds 366 days. Day-grain across multi-year windows is meaningful but not what this card is for; the monthly chart already covers long-history exploration.

## Testing

New file `tests/referral-analytics-daily.test.ts`:

- Returns gap-free dates between `from` and `to` (including weekends and days with no events).
- Zero-count days are present with `count: 0`.
- `hospitalIds` scoping: an event in a non-listed hospital is excluded.
- Timezone bucketing: an event whose `created_at` UTC instant is `2026-05-15T23:30:00Z` lands on `2026-05-16` for `Europe/Zurich` (CEST = UTC+2) and on `2026-05-15` for UTC.
- 366-day cap returns 400.
- `from` missing defaults to `to - 90 days`.

Component test (extends existing `tests/funnels/*` patterns if present, otherwise a new `tests/funnels/referral-events-tab-weekday.test.tsx`):

- Given a date range with 3 Mondays and 2 Tuesdays and a `referralDaily` fixture, `weekdayAvg.mon = sum(Monday counts) / 3` and `weekdayAvg.tue = sum(Tuesday counts) / 2`.
- `avgPerDay` divides `totalReferrals` by the days-in-range count, not by `referralDaily.length` (these can differ when the filter is empty).

`tests/public-docs.test.ts` — no change. This is an admin endpoint, not a public webhook.

## Internationalization

New i18n keys (add to all locale files alongside existing `business.referrals.*`):

```
business.referrals.avgPerDay              → "/day avg"
business.referrals.dailyReferrals          → "Daily referrals"
business.referrals.dailyReferralsHelp      → "Daily count of booking referrals in the selected range, with a 7-day moving average overlay."
business.referrals.weekdayPeaks            → "Weekday peaks"
business.referrals.weekdayPeaksHelp        → "Average referrals per day for each weekday across the selected range."
business.referrals.rollingAvgShortRange    → "Rolling average uses the available days when the range is shorter than 7."
```

Weekday labels reuse existing `common.weekday.{mon,tue,wed,thu,fri,sat,sun}` keys. If they don't exist, add them in the same commit. The existing tone rule applies — formal/clinical, no casual second-person.

## Open questions

1. **Avg/day visibility while card is collapsed.** Default is "hidden when card is collapsed", matching today's behavior for `totalReferrals`. If the owner wants the number always visible (the explicit monitoring use case suggests yes), a small follow-up moves the line into the `CardHeader`. Flagging for confirmation, not blocking.
2. **Comparison to prior period.** Not in scope. The line + MA gives a visual baseline. If a hard "vs previous period" delta is wanted, it's a separate spec — needs a second range and a comparison primitive used nowhere else on this page yet.

## Implementation order

1. `getReferralDailyCounts` + tests.
2. `referral-daily` business + chain routes.
3. `funnelsUrl` union extension.
4. Component: query + memoized derivations + two `<ChartCard>` blocks + avg/day in the sample-size line.
5. i18n keys.
6. Manual smoke on `/business/funnels` (single hospital, group scope, empty range, < 7 day range, no events at all).
7. `npm run check` + `npm test`.
