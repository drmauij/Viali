# Billing Usage History Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Usage History" tab to the "Current Usage" card on `/admin/billing`, showing records/month and computed cost for all past months.

**Architecture:** A new API endpoint queries `anesthesiaRecords` grouped by month and cross-references `billingInvoices` for price data per period. The frontend converts the existing "Current Usage" card into a tabbed card using the existing `Tabs` component from `@/components/ui/tabs`.

**Tech Stack:** Express (backend), Drizzle ORM, React + TanStack Query, shadcn/ui Tabs

---

### Task 1: Add the `/api/billing/:hospitalId/usage-history` endpoint

**Files:**
- Modify: `server/routes/billing.ts` (append near the other GET billing routes, around line 1598)

**Context:**
- `countAnesthesiaRecordsForHospital(hospitalId, start, end)` already exists in this file — reuse it.
- `billingInvoices` is already imported from `@shared/schema`.
- `hospitals`, `anesthesiaRecords`, `surgeries` are already imported.
- Use `desc`, `eq`, `and`, `gte`, `lt`, `sql` from `drizzle-orm` — already imported.
- `hospital.pricePerRecord` is a decimal string (e.g. `"6.00"`), default to `6.00` if null.
- The endpoint must be protected by `isAuthenticated` only (same as the existing `billing-invoices` route at line 1582).

**Step 1: Add the route**

Add this block immediately after the `billing-invoices` route (after line 1598):

```typescript
// Get historical monthly usage for a hospital
router.get("/api/billing/:hospitalId/usage-history", isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;

    // Access check
    const userHospitals = await storage.getUserHospitals(userId);
    if (!userHospitals.some((h: any) => h.id === hospitalId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    // Find the earliest anesthesia record for this hospital
    const [earliest] = await db
      .select({ createdAt: anesthesiaRecords.createdAt })
      .from(anesthesiaRecords)
      .innerJoin(surgeries, eq(anesthesiaRecords.surgeryId, surgeries.id))
      .where(eq(surgeries.hospitalId, hospitalId))
      .orderBy(anesthesiaRecords.createdAt)
      .limit(1);

    if (!earliest) {
      return res.json({ months: [] });
    }

    // Build list of completed months from earliest record month up to (but not including) current month
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const months: Array<{
      month: string;
      periodStart: Date;
      periodEnd: Date;
    }> = [];

    let cursor = new Date(
      earliest.createdAt!.getFullYear(),
      earliest.createdAt!.getMonth(),
      1
    );

    while (cursor < currentMonthStart) {
      const periodStart = new Date(cursor);
      const periodEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const month = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      months.push({ month, periodStart, periodEnd });
      cursor = periodEnd;
    }

    if (months.length === 0) {
      return res.json({ months: [] });
    }

    // Fetch all invoices for this hospital to cross-reference pricing
    const invoices = await db
      .select()
      .from(billingInvoices)
      .where(eq(billingInvoices.hospitalId, hospitalId));

    const currentPricePerRecord = hospital.pricePerRecord
      ? parseFloat(hospital.pricePerRecord)
      : 6.00;

    // Build result — count records for each month in parallel
    const results = await Promise.all(
      months.map(async ({ month, periodStart, periodEnd }) => {
        const recordCount = await countAnesthesiaRecordsForHospital(
          hospitalId,
          periodStart,
          periodEnd
        );

        // Find matching invoice (periodStart match)
        const matchingInvoice = invoices.find((inv) => {
          const invStart = new Date(inv.periodStart);
          return (
            invStart.getFullYear() === periodStart.getFullYear() &&
            invStart.getMonth() === periodStart.getMonth()
          );
        });

        let pricePerRecord: number | null = null;
        let totalCost: number | null = null;

        if (matchingInvoice) {
          // Use invoice basePrice if available
          const invoicePrice = parseFloat(matchingInvoice.basePrice || "0");
          if (invoicePrice > 0 && recordCount > 0) {
            pricePerRecord = invoicePrice;
            totalCost = recordCount * pricePerRecord;
          }
        } else if (currentPricePerRecord > 0 && recordCount > 0) {
          // Fall back to current hospital price
          pricePerRecord = currentPricePerRecord;
          totalCost = recordCount * pricePerRecord;
        }

        return {
          month,
          recordCount,
          pricePerRecord,
          totalCost,
          hasInvoice: !!matchingInvoice,
        };
      })
    );

    // Return newest first, only months with records
    const filtered = results
      .filter((r) => r.recordCount > 0)
      .reverse();

    res.json({ months: filtered });
  } catch (error) {
    logger.error("Error fetching usage history:", error);
    res.status(500).json({ message: "Failed to fetch usage history" });
  }
});
```

**Step 2: Verify TypeScript compiles**

```bash
cd /home/mau/viali && npm run check 2>&1 | head -30
```
Expected: no new errors.

**Step 3: Test the endpoint manually**

```bash
# Start dev server if not running, then in another terminal:
curl -s -b cookies.txt "http://localhost:5000/api/billing/HOSPITAL_ID/usage-history" | jq .
```
Expected: `{ months: [...] }` or `{ months: [] }` (no 500 error).

**Step 4: Commit**

```bash
git add server/routes/billing.ts
git commit -m "feat(billing): add usage-history API endpoint with invoice price cross-reference"
```

---

### Task 2: Add the UsageHistory tab to the frontend

**Files:**
- Modify: `client/src/pages/admin/Billing.tsx`

**Context:**
- The "Current Usage" card is at line 811. It's a plain `<Card>` with `<CardHeader>` and `<CardContent>`.
- The project uses shadcn/ui — `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` are available from `@/components/ui/tabs`. Check if that file exists:
  ```bash
  ls client/src/components/ui/tabs.tsx
  ```
  If it doesn't exist, it needs to be added (see note below).
- `formatCurrency` and `formatMonthYear` are already imported from `@/lib/dateUtils`.
- `ScrollArea` is already imported.
- `Loader2` is already imported.

**Step 1: Check if Tabs component exists**

```bash
ls /home/mau/viali/client/src/components/ui/tabs.tsx
```

If it doesn't exist, add it:
```bash
cd /home/mau/viali && npx shadcn@latest add tabs --yes 2>&1
```
Or create it manually with the standard shadcn/ui Tabs implementation.

**Step 2: Add the `UsageHistory` interface and query**

In `Billing.tsx`, after the existing `Invoice` interface (around line 100), add:

```typescript
interface UsageHistoryMonth {
  month: string; // e.g. "2025-01"
  recordCount: number;
  pricePerRecord: number | null;
  totalCost: number | null;
  hasInvoice: boolean;
}

interface UsageHistoryData {
  months: UsageHistoryMonth[];
}
```

**Step 3: Add the query in `BillingContent`**

In `BillingContent`, after the existing `invoicesData` query (around line 258), add:

```typescript
const { data: usageHistory, isLoading: usageHistoryLoading } = useQuery<UsageHistoryData>({
  queryKey: ["/api/billing", hospitalId, "usage-history"],
  queryFn: async () => {
    const res = await fetch(`/api/billing/${hospitalId}/usage-history`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch usage history");
    return res.json();
  },
});
```

**Step 4: Add the Tabs import**

In the imports section at the top of the file, add:

```typescript
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
```

**Step 5: Replace the "Current Usage" card with a tabbed version**

Find the "Current Usage" card (starts at line ~811):

```tsx
<Card>
  <CardHeader>
    <CardTitle>Current Usage</CardTitle>
    <CardDescription>This month's anesthesia records</CardDescription>
  </CardHeader>
  <CardContent>
    ...existing content...
  </CardContent>
</Card>
```

Replace it with:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Usage</CardTitle>
    <CardDescription>Anesthesia record usage and cost</CardDescription>
  </CardHeader>
  <CardContent>
    <Tabs defaultValue="current">
      <TabsList className="mb-4">
        <TabsTrigger value="current">Current Month</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>

      <TabsContent value="current">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Plan</span>
            <Badge variant={billingStatus.licenseType === "free" ? "secondary" : billingStatus.licenseType === "test" ? "outline" : "default"}>
              {billingStatus.licenseType === "free" ? "Free" :
               billingStatus.licenseType === "test" ? (billingStatus.trialExpired ? "Trial Expired" : `Trial (${billingStatus.trialDaysRemaining}d)`) :
               "Basic"}
            </Badge>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Records this month</span>
            <span className="font-medium">{billingStatus.currentMonthRecords}</span>
          </div>
          {billingStatus.licenseType !== "free" && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Price per record</span>
                <span className="font-medium">
                  {formatCurrency(billingStatus.pricePerRecord ?? 0)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Estimated cost</span>
                <span className="font-bold text-lg">
                  {formatCurrency(billingStatus.estimatedCost ?? 0)}
                </span>
              </div>
            </>
          )}
        </div>
      </TabsContent>

      <TabsContent value="history">
        {usageHistoryLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !usageHistory?.months?.length ? (
          <p className="text-center text-muted-foreground py-8">No usage history yet</p>
        ) : (
          <ScrollArea className="h-[250px]">
            <div className="space-y-1">
              <div className="grid grid-cols-4 gap-2 px-2 pb-2 text-xs font-medium text-muted-foreground border-b">
                <span>Month</span>
                <span className="text-right">Records</span>
                <span className="text-right">Price/Record</span>
                <span className="text-right">Total Cost</span>
              </div>
              {usageHistory.months.map((entry) => {
                const [year, month] = entry.month.split("-");
                const date = new Date(parseInt(year), parseInt(month) - 1, 1);
                return (
                  <div
                    key={entry.month}
                    className="grid grid-cols-4 gap-2 px-2 py-2 text-sm hover:bg-muted/50 rounded"
                  >
                    <span className="font-medium">{formatMonthYear(date)}</span>
                    <span className="text-right">{entry.recordCount}</span>
                    <span className="text-right text-muted-foreground">
                      {entry.pricePerRecord != null
                        ? formatCurrency(entry.pricePerRecord)
                        : "—"}
                    </span>
                    <span className="text-right font-medium">
                      {entry.totalCost != null
                        ? formatCurrency(entry.totalCost)
                        : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </TabsContent>
    </Tabs>
  </CardContent>
</Card>
```

**Step 6: Verify TypeScript compiles**

```bash
cd /home/mau/viali && npm run check 2>&1 | head -30
```
Expected: no errors.

**Step 7: Commit**

```bash
git add client/src/pages/admin/Billing.tsx
git commit -m "feat(billing): add Usage History tab to current usage card"
```

---

### Task 3: Final verification

**Step 1: Run full typecheck**

```bash
cd /home/mau/viali && npm run check
```
Expected: clean exit.

**Step 2: Smoke test in browser**

- Navigate to `/admin/billing`
- Verify "Current Month" tab shows existing content
- Verify "History" tab loads without error
- If hospital has past records: confirm month names, record counts, and costs appear correctly
- If no past records: confirm "No usage history yet" message appears

**Step 3: Final commit if any fixes needed**

```bash
git add -p
git commit -m "fix(billing): usage history tab cleanup"
```
