# Platform Conversion CSV Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add platform-specific CSV export buttons (Google Ads, Meta Ads, Meta Forms) to the ReferralFunnel component so users can download converted leads for offline conversion upload.

**Architecture:** Extend the existing funnel API to return actual click IDs (currently only `has_click_id` boolean). Add 3 client-side export functions following the same pattern as existing `exportAnonymizedCsv`. Add a conversion-level dropdown and 3 download buttons to the UI.

**Tech Stack:** React, TypeScript, Drizzle ORM (raw SQL), CSV generation (client-side Blob)

---

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/routes/business.ts` | Modify (~line 1932) | Add click ID columns to funnel query SELECT |
| `client/src/pages/business/ReferralFunnel.tsx` | Modify | Add FunnelRow fields, 3 export functions, conversion-level dropdown, platform buttons |
| `client/src/pages/business/Marketing.tsx` | Modify (~line 654) | Pass `currency` prop to ReferralFunnel |

---

### Task 1: Add click ID columns to funnel API

**Files:**
- Modify: `server/routes/business.ts:1931-1972`

- [ ] **Step 1: Add click ID columns to the funnel SQL query**

In `server/routes/business.ts`, find the funnel query SELECT (around line 1931). Add these columns after the `has_click_id` CASE expression (line 1939):

```sql
        re.gclid,
        re.gbraid,
        re.wbraid,
        re.fbclid,
        re.igshid,
```

The `meta_lead_id` and `meta_form_id` are already selected (lines 1940-1941). No other changes needed — the query joins and WHERE clause stay the same.

- [ ] **Step 2: Verify the server compiles**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add server/routes/business.ts
git commit -m "feat(funnel): add click ID columns (gclid, gbraid, wbraid, fbclid, igshid) to funnel API"
```

---

### Task 2: Extend FunnelRow type and add currency prop

**Files:**
- Modify: `client/src/pages/business/ReferralFunnel.tsx:42-75`
- Modify: `client/src/pages/business/Marketing.tsx:654-658`

- [ ] **Step 1: Add click ID fields to FunnelRow type**

In `ReferralFunnel.tsx`, add these fields to the `FunnelRow` type (after `has_click_id` on line 58):

```typescript
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  igshid: string | null;
```

- [ ] **Step 2: Add currency to ReferralFunnelProps**

In `ReferralFunnel.tsx`, update `ReferralFunnelProps` (line 44) to add currency:

```typescript
interface ReferralFunnelProps {
  hospitalId: string | undefined;
  from: string;
  to: string;
  currency?: string;
  onEarliestDate?: (date: string) => void;
}
```

- [ ] **Step 3: Destructure currency in the component**

In `ReferralFunnel.tsx` line 328, update the destructure:

```typescript
export default function ReferralFunnel({ hospitalId, from, to, currency = "CHF", onEarliestDate }: ReferralFunnelProps) {
```

- [ ] **Step 4: Pass currency from Marketing.tsx**

In `Marketing.tsx` line 654, add the currency prop:

```tsx
<ReferralFunnel
  hospitalId={activeHospital?.id}
  from={referralFrom}
  to={referralTo}
  currency={activeHospital?.currency || "CHF"}
  onEarliestDate={(d) => { if (!referralFrom) setReferralFrom(d); }}
/>
```

- [ ] **Step 5: Verify compilation**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/business/ReferralFunnel.tsx client/src/pages/business/Marketing.tsx
git commit -m "feat(funnel): add click ID fields to FunnelRow type, pass currency prop"
```

---

### Task 3: Add platform export functions

**Files:**
- Modify: `client/src/pages/business/ReferralFunnel.tsx:324` (insert after `exportAdPerformanceCsv`)

- [ ] **Step 1: Add conversion level type and helper constants**

Insert after the `exportAdPerformanceCsv` function (after line 324), before the `// ── Component` comment:

```typescript
type ConversionLevel = "kept" | "surgery_planned" | "paid";

function matchesConversionLevel(r: FunnelRow, level: ConversionLevel): boolean {
  switch (level) {
    case "kept":
      return KEPT_STATUSES.includes(r.appointment_status || "");
    case "surgery_planned":
      return !!r.surgery_id;
    case "paid":
      return !!r.payment_date;
  }
}

function getConversionTimestamp(r: FunnelRow, level: ConversionLevel): string | null {
  switch (level) {
    case "kept":
      return r.appointment_date;
    case "surgery_planned":
      return r.surgery_planned_date;
    case "paid":
      return r.payment_date;
  }
}

function getConversionValue(r: FunnelRow): string {
  return r.price || "";
}
```

- [ ] **Step 2: Add Google Ads export function**

Insert after the helpers above:

```typescript
function exportGoogleAdsCsv(rows: FunnelRow[], level: ConversionLevel, currency: string, from: string, to: string) {
  const conversionName = level === "kept" ? "Appointment Kept" : level === "surgery_planned" ? "Surgery Planned" : "Paid";
  const filtered = rows.filter((r) => (r.gclid || r.gbraid || r.wbraid) && matchesConversionLevel(r, level));

  const header = "Google Click ID,Click Type,Conversion Name,Conversion Time,Conversion Value,Conversion Currency";
  const csvRows = filtered.map((r) => {
    const clickId = r.gclid || r.gbraid || r.wbraid || "";
    const clickType = r.gclid ? "GCLID" : r.gbraid ? "GBRAID" : "WBRAID";
    const ts = getConversionTimestamp(r, level) || "";
    return [clickId, clickType, conversionName, ts, getConversionValue(r), currency]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  const csv = [header, ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `google-ads-conversions-${from}-to-${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Add Meta Ads export function**

```typescript
function exportMetaAdsCsv(rows: FunnelRow[], level: ConversionLevel, currency: string, from: string, to: string) {
  const eventName = level === "kept" ? "Lead" : level === "surgery_planned" ? "Schedule" : "Purchase";
  const filtered = rows.filter((r) => (r.fbclid || r.igshid) && matchesConversionLevel(r, level));

  const header = "event_name,event_time,fbc,value,currency,action_source";
  const csvRows = filtered.map((r) => {
    const ts = getConversionTimestamp(r, level);
    const unixTime = ts ? Math.floor(new Date(ts).getTime() / 1000) : "";
    const fbc = r.fbclid || r.igshid || "";
    return [eventName, unixTime, fbc, getConversionValue(r), currency, "website"]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  const csv = [header, ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `meta-ads-conversions-${from}-to-${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Add Meta Forms export function**

```typescript
function exportMetaFormsCsv(rows: FunnelRow[], level: ConversionLevel, currency: string, from: string, to: string) {
  const eventName = level === "kept" ? "lead_converted" : level === "surgery_planned" ? "lead_surgery_planned" : "lead_paid";
  const filtered = rows.filter((r) => r.meta_lead_id && matchesConversionLevel(r, level));

  const header = "lead_id,event_name,event_time,lead_value,currency";
  const csvRows = filtered.map((r) => {
    const ts = getConversionTimestamp(r, level);
    const unixTime = ts ? Math.floor(new Date(ts).getTime() / 1000) : "";
    return [r.meta_lead_id || "", eventName, unixTime, getConversionValue(r), currency]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  const csv = [header, ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `meta-forms-conversions-${from}-to-${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 5: Add counting helper**

```typescript
function countPlatformConversions(rows: FunnelRow[], level: ConversionLevel) {
  const matching = rows.filter((r) => matchesConversionLevel(r, level));
  return {
    google: matching.filter((r) => r.gclid || r.gbraid || r.wbraid).length,
    meta: matching.filter((r) => r.fbclid || r.igshid).length,
    metaForms: matching.filter((r) => r.meta_lead_id).length,
  };
}
```

- [ ] **Step 6: Verify compilation**

Run: `npm run check`
Expected: No TypeScript errors (functions are unused for now, but TS won't error on that)

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/business/ReferralFunnel.tsx
git commit -m "feat(funnel): add Google Ads, Meta Ads, Meta Forms CSV export functions"
```

---

### Task 4: Add UI — conversion level dropdown + platform buttons

**Files:**
- Modify: `client/src/pages/business/ReferralFunnel.tsx`

- [ ] **Step 1: Add conversion level state**

In the component (after line 333, near other state declarations), add:

```typescript
const [conversionLevel, setConversionLevel] = useState<ConversionLevel>("paid");
```

- [ ] **Step 2: Compute platform counts**

After the existing `useMemo` blocks (find a good spot near the filtered data), add:

```typescript
const platformCounts = useMemo(
  () => countPlatformConversions(filtered, conversionLevel),
  [filtered, conversionLevel],
);
```

- [ ] **Step 3: Add the "Feed Back to Platforms" UI section**

Insert this JSX after the Ad Performance card's closing `</Card>` (around line 1209, before the final `</div>`). This goes inside the `{!isLoading && rows.length > 0 && ( ... )}` block:

```tsx
{/* ── Feed Back to Platforms ────────────────────────────── */}
<Card>
  <CardHeader>
    <CardTitle className="text-lg">
      {t("business.funnel.feedBack", "Feed Back to Platforms")}
    </CardTitle>
    <p className="text-sm text-muted-foreground">
      {t("business.funnel.feedBackHelp", "Download converted leads as CSV files formatted for each ad platform's offline conversion upload.")}
    </p>
  </CardHeader>
  <CardContent>
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-1.5">
        <Label>{t("business.funnel.conversionLevel", "Conversion Level")}</Label>
        <Select value={conversionLevel} onValueChange={(v) => setConversionLevel(v as ConversionLevel)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kept">{t("business.funnel.levelKept", "Appointment Kept")}</SelectItem>
            <SelectItem value="surgery_planned">{t("business.funnel.levelSurgery", "Surgery Planned")}</SelectItem>
            <SelectItem value="paid">{t("business.funnel.levelPaid", "Paid")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={platformCounts.google === 0}
        onClick={() => exportGoogleAdsCsv(filtered, conversionLevel, currency, from, to)}
      >
        <Download className="h-4 w-4 mr-1" />
        Google Ads ({platformCounts.google})
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={platformCounts.meta === 0}
        onClick={() => exportMetaAdsCsv(filtered, conversionLevel, currency, from, to)}
      >
        <Download className="h-4 w-4 mr-1" />
        Meta Ads ({platformCounts.meta})
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={platformCounts.metaForms === 0}
        onClick={() => exportMetaFormsCsv(filtered, conversionLevel, currency, from, to)}
      >
        <Download className="h-4 w-4 mr-1" />
        Meta Forms ({platformCounts.metaForms})
      </Button>
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 4: Verify compilation**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 5: Manual test**

Run: `npm run dev`

1. Go to `/business/marketing` → Referrals tab
2. Scroll to Conversion Funnel section
3. Verify "Feed Back to Platforms" card appears after Ad Performance
4. Test the conversion level dropdown switches between Kept/Surgery Planned/Paid
5. Verify button counts update when switching levels
6. If any rows exist with click IDs, test downloading a CSV and verify the format

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/business/ReferralFunnel.tsx
git commit -m "feat(funnel): add Feed Back to Platforms UI with conversion level picker and download buttons"
```

---

### Task 5: Typecheck and lint

- [ ] **Step 1: Run full typecheck**

Run: `npm run check`
Expected: Clean pass

- [ ] **Step 2: Final commit if any lint fixes needed**

```bash
git add -A
git commit -m "fix: lint/typecheck cleanup for platform CSV exports"
```
