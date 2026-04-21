# Marketing → Leads tab redesign

**Date:** 2026-04-21
**Status:** design — awaiting implementation plan
**Scope:** `/business/marketing` → Leads tab (`LeadsReadOnlyCard` in `client/src/pages/business/Marketing.tsx` + supporting backend)

## Problem

The Leads tab on `/business/marketing` shows only a flat, read-only list of the
50 most recent leads. Three concrete gaps today:

1. **Localization is broken.** `LeadsReadOnlyCard` passes German strings as
   `t()` fallbacks (`"Quelle"`, `"Neu"`, `"Eingegangen"`, …). The keys exist in
   `de.json` but are entirely missing from `en.json`. In English mode the
   fallbacks render, so English users see German labels mixed with English
   ones, and the cap-hint string `"insgesamt angezeigt (max. 50)"` never
   localizes.
2. **Source column is text.** The column shows raw `"ig"` / `"fb"` /
   `"website"` strings. The clinic-side `LeadsPanel` already renders proper
   icons for the same values — Marketing duplicates the labels but drops the
   icons.
3. **No marketing signal at the top.** The dashboard is supposed to answer
   "what did my ads buy me" at a glance. Today it's a row of 50 records with
   no aggregation above them. There is also no pagination — once a clinic
   passes 50 leads, older ones are invisible.

## Non-goals

- No changes to the leads capture path (webhooks, `referral_events`, the
  booking flow).
- No changes to the clinic-unit `LeadsPanel` behaviour. We will refactor its
  `SourceIcon` helper into a shared module but keep the panel wired to it.
- No schema changes. Every metric we need is already on `leads`,
  `lead_contacts`, and `clinic_appointments`.
- No search or lead-detail drill-in on this pass. The list stays read-only.
  (Discussed and deferred.)
- No CSV export beyond what fits the current date-range + status filter — no
  per-column picker, no file-size guard. If export becomes heavy we'll revisit.

## User-approved decisions (brainstorming)

| # | Topic | Decision |
|---|-------|----------|
| 1 | i18n fix scope | Add the missing `business.leads.*` keys in `en.json`; extend `de.json` with the new keys introduced by this redesign. |
| 2 | Source column | Replace text with icons; reuse the exact `SourceIcon` + `sourceLabel` helpers from `client/src/components/leads/LeadsPanel.tsx`, extracted to a shared module. |
| 3 | Pagination | Progressive "Load more…" using the same pattern as **Recent Referral Events** in the same file (`useState` + `useCallback`, `before=` cursor, `PAGE_SIZE = 50`). |
| 4 | Conversion metric | **A + C**: one overall "conversion rate" tile **plus** a mini per-source split (IG / FB / Web …) directly underneath the tile's headline number. |
| 5 | Date scope for stats | **A**: every stats card respects the Von/Bis range at the top of the page. One knob. |
| 6 | Time-bucket | **B**: always monthly — matches the existing `referralTimeseries` chart in the Quellen tab. |
| 7 | Extra scope items | **A** Status-filter pills above the list · **C** Total-leads tile · **D** Avg-days-to-conversion tile · **F** CSV export. |
| 7-deferred | — | **B** (click row → drill-in) and **E** (search) explicitly out of scope this iteration. |

## Layout (mocked & approved)

```
╭─────────────────────────────────────────────────────────────────────╮
│  [Total leads: 247]  [Conversion: 18.2% · IG 12% FB 8% Web 24%]    │
│                      [Avg days to conversion: 7.4]                  │
├─────────────────────────────────────────────────────────────────────┤
│  [Leads by source — pie]        [Leads over time — monthly bars]   │
├─────────────────────────────────────────────────────────────────────┤
│  [All] [New] [In Progress] [Converted] [Closed]   [⬇ Export CSV]   │
├─────────────────────────────────────────────────────────────────────┤
│  Name           | Source | Status   | Contacts | Converted | Date  │
│  Beat Zenelaj   |  📷    | NEW      |    0     |  No       | 21/04 │
│  Marc Csilla    |  f     | IN PROG  |    1     |  No       | 20/04 │
│  ...                                                                │
│                          [ Load more… ]                             │
╰─────────────────────────────────────────────────────────────────────╯
```

All three stat tiles, both charts, and the leads list filter off the **same**
Von/Bis range (`referralFrom` / `referralTo` already in component state).

## Metric definitions

| Metric | Definition |
|---|---|
| **Total leads** | `COUNT(*) FROM leads WHERE hospital_id = :h AND created_at BETWEEN :from AND :to` |
| **Conversion rate (overall)** | `COUNT(*) FILTER (WHERE status = 'converted' OR appointment_id IS NOT NULL) / NULLIF(COUNT(*), 0)` over the same window. Expressed as 0.0–1.0, formatted `%` client-side. |
| **Conversion rate (by source)** | Same as overall, `GROUP BY source`. Only sources with `total ≥ 1` in the window appear; sources with `0` converted render as `0%`. |
| **Avg days to conversion** | `AVG(EXTRACT(EPOCH FROM (ca.created_at - l.created_at)) / 86400)` where `ca = clinic_appointments` joined on `l.appointment_id = ca.id`, for leads in the window with a linked appointment. `clinic_appointments.created_at` is nullable (defaulted, not `NOT NULL`), so filter `ca.created_at IS NOT NULL` to skip the handful of very old rows. `NULL` overall → tile shows `"—"`. We use appointment `created_at` (when the lead booked), not `appointment_date` (scheduled slot) — that's the moment the lead converted. |
| **Source breakdown (pie)** | `COUNT(*) GROUP BY source` over the window. |
| **Time series (monthly bars)** | `COUNT(*) GROUP BY date_trunc('month', created_at AT TIME ZONE <hospital.tz>)` over the window. Hospital timezone, not server UTC — per the project datetime rule. |

"Converted" uniformly means **`status = 'converted'` OR `appointment_id IS NOT
NULL`**. The existing list already uses this OR — we match it.

## API surface

### 1. New — `GET /api/business/:hospitalId/leads/stats`

Query params (all optional):
- `from` — ISO date (inclusive). Omitted → no lower bound (all-time).
- `to` — ISO date (inclusive). Omitted → defaults to now.

Response:
```json
{
  "total": 247,
  "bySource": [
    { "source": "ig",      "count": 104 },
    { "source": "fb",      "count": 70  },
    { "source": "website", "count": 73  }
  ],
  "conversionOverall": 0.182,
  "conversionBySource": [
    { "source": "ig",      "total": 104, "converted": 12, "rate": 0.115 },
    { "source": "fb",      "total": 70,  "converted": 6,  "rate": 0.086 },
    { "source": "website", "total": 73,  "converted": 18, "rate": 0.247 }
  ],
  "avgDaysToConversion": 7.4,
  "timeseries": [
    { "month": "2026-01", "count": 42 },
    { "month": "2026-02", "count": 68 },
    { "month": "2026-03", "count": 73 },
    { "month": "2026-04", "count": 64 }
  ]
}
```

Auth: `isAuthenticated + isMarketingOrManager` (same as the existing
`GET /leads`).

Implementation: one handler, one DB round-trip using CTEs / conditional
aggregates — no N+1. The existing
`leads_hospital_status_created (hospital_id, status, created_at)` index covers
every filter.

### 2. New — `GET /api/business/:hospitalId/leads/export.csv`

Query params:
- `from`, `to` — same semantics as `/leads/stats` (all-time lower bound /
  defaults-to-now when omitted)
- `status` — `all` (default) or one of the enum values, matches the list's
  filter

Response: `text/csv; charset=utf-8`, `Content-Disposition: attachment;
filename="leads-<hospital>-<YYYY-MM-DD>.csv"`. UTF-8 BOM prepended for Excel.

Columns (order):
```
id, first_name, last_name, email, phone, source, status, converted,
contact_count, last_contact_outcome, utm_source, utm_medium, utm_campaign,
utm_term, utm_content, created_at
```

`converted` is a derived `yes`/`no` from the same OR rule used everywhere
else. `contact_count` and `last_contact_outcome` come from the same subqueries
already used by `GET /leads`.

Auth: same as above. No size cap on this pass — Viali clinics produce <10k
leads/yr. If that changes we'll add one.

### 3. Reuse — `GET /api/business/:hospitalId/leads`

Already supports `limit`, `before`, `status`. No change. We'll just start
passing the real `status` value and a real `from`/`to` (the endpoint currently
ignores `from`/`to` — add them, matching the stats endpoint). All three are
optional so existing callers (the clinic-unit `LeadsPanel`) are unaffected.

## Frontend

### Component structure

```
client/src/
├─ components/leads/
│  ├─ LeadsPanel.tsx                 (existing — stays)
│  └─ sourceIcon.tsx                 (NEW — extracted from LeadsPanel)
├─ pages/business/Marketing.tsx      (edit — replaces LeadsReadOnlyCard body)
└─ pages/business/marketing/
   └─ LeadsStatsCards.tsx            (NEW — 3 tiles + 2 charts)
```

- **`sourceIcon.tsx`** — exports `SourceIcon`, `sourceLabel`, and the inline
  `FacebookIcon` SVG. Both `LeadsPanel.tsx` and the Marketing tab import from
  here. DRY fix per CLAUDE.md.
- **`LeadsStatsCards.tsx`** — owns the `useQuery` for `/leads/stats`, the two
  Recharts (`PieChart`, `BarChart`), and the three KPI tiles. Takes
  `{ hospitalId, from, to }`. Isolated so Marketing.tsx doesn't balloon.
- **`LeadsReadOnlyCard`** — stays in Marketing.tsx, but grows:
  - Status-filter pills (client state, piped into the query key)
  - Uses `SourceIcon` in the Source column
  - "Load more…" button identical in shape to the Recent Referral Events
    one, driven by `useState` + `useCallback` + a `before=` cursor

### State & query keys

```
[`/api/business/${hospitalId}/leads/stats?from=${from}&to=${to}`]
[`/api/business/${hospitalId}/leads?limit=50&status=${status}&from=${from}&to=${to}`]
```

Both queries are `enabled: !!hospitalId` and re-fetch when Von/Bis change.
TanStack Query de-dupes across tab switches.

Progressive-load follows the Referral Events pattern verbatim:
`loadMoreLeads`, `leadsHasMore`, `leadsLoadingMore`, `PAGE_SIZE = 50`, cursor
= `before=${lastLead.createdAt}`. Status changes reset the list.

### Status filter

Pills: `All | New | In Progress | Converted | Closed`. Client state only;
passed through to the list query and the CSV export URL. Stats tiles/charts
do **not** react to status — the point of the stats is the full distribution.

### CSV export

Plain `<a href="/api/business/.../leads/export.csv?from&to&status">` styled as
a button. Relies on browser navigation + the `Content-Disposition` header —
no fetch/blob dance needed.

### i18n

**Add to `en.json` under `business.leads`:** `title`, `description`,
`totalShown`, `empty`, `yes`, `no`, `col.{name, source, status, contacts,
converted, created}`, `status.{new, in_progress, converted, closed}`.

**Add to both `en.json` and `de.json` under `business.leads`:**

- `stats.totalLeads`, `stats.conversionRate`, `stats.avgDaysToConversion`,
  `stats.inRange`, `stats.leadToAppointment`
- `charts.bySource`, `charts.overTime`
- `filter.all`, `filter.new`, `filter.inProgress`, `filter.converted`,
  `filter.closed`
- `export.csv`

No hardcoded German fallback strings in new code. Fallback defaults in
`t(key, fallback)` must be English.

Also replace the existing fallback `"insgesamt angezeigt (max. 50)"` with a
count-based string that no longer hardcodes `50` — the stats endpoint now
supplies `total`, so the card shows `{loaded} of {total}`.

## Error handling

- Stats endpoint 500 → stat tiles render `"—"`, charts render an empty-state
  message. The leads list below still works.
- Leads list endpoint 500 → standard TanStack error boundary (existing
  behaviour).
- CSV endpoint 500 → browser shows its own error page. We won't swallow the
  click; a 500 here is a server bug, not a normal path.
- Empty window (0 leads) → tiles show `0`, charts show a muted "no data"
  placeholder. No crashes from `/0`.

## Testing

- `tests/leads-stats.test.ts` (new) — seeds a hospital with a deterministic
  mix of leads (different sources, statuses, appointments linked at varying
  intervals) and asserts every field of `/leads/stats` against hand-computed
  expected values for a narrow date window. Boundary cases: lead exactly on
  `from`, lead exactly on `to`, lead outside window. One test for
  `avgDaysToConversion = NULL` path.
- `tests/leads-export.test.ts` (new) — asserts response headers
  (`Content-Type`, `Content-Disposition`, BOM prefix), column order, status
  filter honoured, date range honoured, RBAC (non-marketing role rejected).
- `tests/leads-list.test.ts` (extend if exists, create if not) — cursor
  pagination with `before=` returns the next page and terminates correctly
  when < `PAGE_SIZE` rows remain; `from`/`to` filters honoured.
- Frontend: the existing Marketing page has no component-level tests and we
  won't add a framework just for this. Manual QA of:
  (a) EN vs DE switching on `/business/marketing` Leads tab — every string
      flips correctly;
  (b) Status pills trigger a clean re-fetch + `load more` reset;
  (c) Von/Bis change re-drives stats + list + CSV URL;
  (d) Source column renders icons for `ig`/`fb`/`website` and the fallback
      `Globe` for anything else.

## Performance

- Stats endpoint: a single parameterized query with conditional aggregates.
  On a 10k-row `leads` table with the existing
  `(hospital_id, status, created_at)` index, expected < 30 ms.
- Leads list: unchanged shape. Cursor pagination is already in place.
- CSV export: streaming not required at current scale (<10k). If it becomes
  an issue we switch to a `res.write`-per-row streamer — one-file change.

## Migration / compatibility

- No schema changes.
- No breaking API changes (existing `GET /leads` gains optional `from`/`to`).
- The clinic-unit `LeadsPanel` switches its `SourceIcon` import from
  local-file to the shared module — behaviourally identical.

## Out-of-scope / future follow-ups

- Click a lead row → open the clinic-style side-panel (deferred option B).
- Search box (deferred option E).
- Per-campaign breakdown tile (UTM-aware) — natural next step after this.
- Revenue-per-lead and cost-per-lead — tie-in with the Flows ROI work
  currently parked (`project_flows_roi.md`).

## Public API docs

`GET /leads/stats` and `GET /leads/export.csv` are **auth-gated admin
endpoints**, not public webhooks. Per CLAUDE.md the "single source of truth"
rule applies only to public endpoints — `PUBLIC_API_MD` is **not** updated.
