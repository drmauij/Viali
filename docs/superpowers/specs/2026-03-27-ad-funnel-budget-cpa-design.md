# Ad Funnel Budget & CPA Analytics

**Date:** 2026-03-27
**Status:** Design

## Problem

The referral dashboard tracks conversion funnels but has no cost dimension. Staff cannot see cost-per-lead, cost-per-acquisition, or ROI for their advertising channels. Additionally, "Meta Ads" (tracked via fbclid/igshid) and "Meta Forms" (manual Excel leads entered by staff) are lumped together under "social" — there is no way to differentiate them.

### Current ad budget allocation (April 2026)

| Channel | Budget | Tracking |
|---------|--------|----------|
| Google Ads | 4,000 CHF | gclid/gbraid/wbraid via booking link |
| Meta Ads | 2,000 CHF | fbclid/igshid via booking link |
| Meta Forms | 14,000 CHF | Manual staff entry from Excel leads |

## Design

### Data Model

New table: `ad_budgets`

| Column | Type | Notes |
|--------|------|-------|
| id | varchar PK | `gen_random_uuid()` |
| hospitalId | varchar FK → hospitals | cascade delete |
| month | varchar | `"2026-04"` format (YYYY-MM), validated with `/^\d{4}-(0[1-9]\|1[0-2])$/` |
| funnel | enum | `google_ads`, `meta_ads`, `meta_forms` |
| amountChf | integer | Budget in CHF (whole numbers). 0 = no budget (treated same as missing). |
| createdAt | timestamp | defaultNow |
| updatedAt | timestamp | defaultNow |

Unique constraint on `(hospitalId, month, funnel)` — one budget entry per funnel per month.

### Funnel Classification Logic

Applied server-side in SQL via `CASE WHEN` expressions in the `/ad-performance` endpoint query (dedicated query — does NOT reuse the existing `/referral-funnel` endpoint, which does not return click ID columns).

Rules are evaluated in priority order — first match wins:

| Priority | Funnel | Rule |
|----------|--------|------|
| 1 | `google_ads` | has `gclid` OR `gbraid` OR `wbraid` |
| 2 | `meta_ads` | (has `fbclid` OR `igshid`) AND `capture_method != 'staff'` |
| 3 | `meta_forms` | `source = 'social'` AND `capture_method = 'staff'` AND no `fbclid` AND no `igshid` |
| — | (excluded) | Everything else — organic, word-of-mouth, etc. Not shown in ad performance section |

**Note on `meta_forms` fragility:** This rule depends on staff choosing "social" as the source when entering Meta Form leads. If they pick "other", the lead silently drops out of ad performance. Staff should be trained accordingly, and the UI source picker should default to "social" for staff-entered leads when possible.

**Note on staff + click IDs:** Today, the staff appointment creation form (clinic.ts:2281) never sets click ID fields. If that changes in the future, the priority order ensures a staff entry with a click ID is classified as the ad funnel (not meta_forms).

### API Endpoints

**Budget CRUD:**

- `GET /api/business/:hospitalId/ad-budgets?month=2026-04`
  - Returns array of budget entries for the given month
- `PUT /api/business/:hospitalId/ad-budgets`
  - Upserts budgets for a month
  - Body: `{ month: "2026-04", budgets: { google_ads: 4000, meta_ads: 2000, meta_forms: 14000 } }`
  - Validates `month` format: `/^\d{4}-(0[1-9]|1[0-2])$/`
  - Setting a value to 0 or omitting it removes the budget entry for that funnel

**Ad Performance:**

- `GET /api/business/:hospitalId/ad-performance?from=...&to=...`
  - Runs its own SQL query on `referral_events` with CASE WHEN classification and JOIN to appointments/surgeries for conversion data
  - Joins with `ad_budgets` for relevant months (determined by extracting distinct YYYY-MM values from the date range)
  - When the date range spans multiple months, budgets are summed across those full months. Partial month selection still uses the full month's budget — a small "Budgets are allocated per calendar month" note is shown in the UI when the date range does not align to month boundaries.
  - Returns per-funnel metrics

Response shape per funnel:
```json
{
  "funnel": "google_ads",
  "budget": 4000,
  "leads": 12,
  "appointmentsKept": 8,
  "paidConversions": 3,
  "revenue": 15000,
  "cpl": 333,
  "cpk": 500,
  "cpa": 1333,
  "roi": 2.75
}
```

### UI Layout

New section at the bottom of the existing Referral Funnel tab, below the current matrix table. Two parts:

**Part A: Budget Input Card**

- Card titled "Ad Budgets" with a month picker (defaults to current month)
- Three inline input fields in a row: Google Ads, Meta Ads, Meta Forms — each with CHF label
- Save button to persist
- Help text: *"Set your monthly advertising spend per channel to calculate cost-per-lead and cost-per-acquisition metrics below."*

**Part B: Ad Performance Table**

- Respects the same date range filters (from/to) already at the top of the page
- Table columns with help text tooltips on each header:

| Column | Help tooltip |
|--------|-------------|
| Funnel | "Advertising channel classified by tracking parameters" |
| Budget | "Total ad spend for the selected period" |
| Leads | "Number of referrals attributed to this channel" |
| CPL | "Cost per Lead — budget divided by number of leads" |
| Appts Kept | "Appointments that were attended (not no-show or cancelled)" |
| Cost/Kept | "Budget divided by number of kept appointments" |
| Paid | "Surgeries with confirmed payment" |
| CPA | "Cost per Acquisition — budget divided by paid conversions" |
| Revenue | "Total revenue from paid surgeries in this channel" |
| ROI | "Return on investment — (revenue - budget) / budget" |

### Metrics Formulas

- **CPL** = budget / leads (or "—" if leads = 0)
- **Cost/Kept** = budget / appointments kept (or "—" if kept = 0)
- **CPA** = budget / paid conversions (or "—" if paid = 0)
- **ROI** = (revenue - budget) / budget (or "—" if budget = 0 or paid = 0)

All CHF values displayed with `formatCurrency()` helper. ROI displayed as multiples (e.g. "2.75x"). Negative ROI (no conversions yet) shown as "—" rather than "-1.0x" to avoid confusion.

## Scope Exclusions

- No custom/user-defined funnels (only the 3 hardcoded ones)
- No organic social tracking in this section
- No daily/weekly budget granularity — monthly only
- No integration with ad platform APIs (budgets are manually entered)
- Currency hardcoded to CHF
- No budget history/audit trail (upsert overwrites previous value)
