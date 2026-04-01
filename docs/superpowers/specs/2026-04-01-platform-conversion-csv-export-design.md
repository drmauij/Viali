# Platform Conversion CSV Export

Export converted leads as platform-specific CSVs for offline conversion upload to Google Ads, Meta Ads, and Meta Lead Ads.

## Location

Inside `ReferralFunnel.tsx`, near existing export buttons. New "Feed Back to Platforms" section with:
- Conversion level dropdown (shared by all 3 buttons)
- 3 download buttons: Google Ads, Meta Ads, Meta Forms

## Conversion Level Dropdown

Options:
- **Appointment Kept** — patient attended (`arrived`, `in_progress`, `completed`)
- **Surgery Planned** — surgery record exists
- **Paid** — surgery has `payment_date` (default)

## Conversion Value

- Use `surgeries.price` when available (surgery planned or paid stages)
- Leave blank when no surgery/price exists (e.g. appointment kept with no surgery yet)
- Currency from `hospitals.currency` (defaults to CHF, can be EUR/USD)

## Date Range

Uses the existing date range filter already in ReferralFunnel — no month segmentation. User scopes to whatever range they want.

## Backend Change

Add actual click ID columns to the `/api/business/:hospitalId/referral-funnel` query SELECT:
- `re.gclid`
- `re.gbraid`
- `re.wbraid`
- `re.fbclid`
- `re.igshid`

These are currently omitted (only `has_click_id` boolean is returned). The `meta_lead_id` and `meta_form_id` columns are already included.

Update the `FunnelRow` TypeScript type to include these new fields.

## Google Ads CSV

**Filter:** rows where `gclid || gbraid || wbraid` is present AND conversion level reached.

| Column | Value |
|--------|-------|
| `Google Click ID` | gclid or gbraid or wbraid |
| `Click Type` | `"GCLID"` / `"GBRAID"` / `"WBRAID"` |
| `Conversion Name` | `"Appointment Kept"` / `"Surgery Planned"` / `"Paid"` |
| `Conversion Time` | Conversion timestamp (appointment date, surgery planned date, or payment date) in `yyyy-MM-dd HH:mm:ss+zzzz` format |
| `Conversion Value` | `surgeries.price` or blank |
| `Conversion Currency` | hospital currency |

**Filename:** `google-ads-conversions-{from}-to-{to}.csv`

## Meta Ads CSV

**Filter:** rows where `fbclid || igshid` is present AND conversion level reached.

| Column | Value |
|--------|-------|
| `event_name` | `"Lead"` / `"Schedule"` / `"Purchase"` (maps to kept/planned/paid) |
| `event_time` | Unix timestamp of conversion |
| `fbc` | `fb.1.{timestamp}.{fbclid}` format, or igshid |
| `value` | `surgeries.price` or blank |
| `currency` | hospital currency |
| `action_source` | `"website"` |

**Filename:** `meta-ads-conversions-{from}-to-{to}.csv`

## Meta Forms CSV

**Filter:** rows where `meta_lead_id` is present AND conversion level reached.

| Column | Value |
|--------|-------|
| `lead_id` | meta_lead_id |
| `event_name` | `"lead_converted"` / `"lead_surgery_planned"` / `"lead_paid"` |
| `event_time` | Unix timestamp of conversion |
| `lead_value` | `surgeries.price` or blank |
| `currency` | hospital currency |

**Filename:** `meta-forms-conversions-{from}-to-{to}.csv`

## UI

A collapsible or visually distinct section labeled "Feed Back to Platforms" below the existing export buttons:

```
[Conversion Level: v Paid        ]

[ Google Ads CSV (3) ]  [ Meta Ads CSV (1) ]  [ Meta Forms CSV (5) ]
```

Each button shows the count of matching rows in parentheses. Buttons are disabled (with tooltip) when count is 0.

## Files to Modify

1. `server/routes/business.ts` — add gclid/gbraid/wbraid/fbclid/igshid to funnel query SELECT
2. `client/src/pages/business/ReferralFunnel.tsx` — add FunnelRow fields, export functions, UI section

## No New Dependencies

All export logic is client-side (same pattern as existing `exportAnonymizedCsv` and `exportAdPerformanceCsv`).
