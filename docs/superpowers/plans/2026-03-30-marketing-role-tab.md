# Marketing Role & Tab Separation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate referral/lead analytics into a dedicated `/business/marketing` page and add a `marketing` role that restricts business unit access to only that page.

**Architecture:** Add `marketing` to the role hierarchy and write roles in `accessControl.ts`. Create a new `Marketing.tsx` page that reuses `ReferralFunnel` and `LeadConversionTab` components. Remove those tabs from `CostAnalytics.tsx`. Gate business routes so `marketing` role users can only access `/business/marketing`. Add `marketing` to the role dropdown for business unit types. Update bottom nav to show the Marketing link.

**Tech Stack:** React, TypeScript, wouter routing, existing shadcn/ui Tabs components.

---

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `server/utils/accessControl.ts` | Add `marketing` to role hierarchy and write roles |
| Create | `client/src/pages/business/Marketing.tsx` | New page with Referrals + Leads tabs |
| Modify | `client/src/pages/business/CostAnalytics.tsx` | Remove Referrals + Leads tabs |
| Modify | `client/src/App.tsx` | Add `/business/marketing` route |
| Modify | `client/src/components/ProtectedRoute.tsx` | Gate marketing role to only `/business/marketing` |
| Modify | `client/src/components/BottomNav.tsx` | Add Marketing nav item, handle marketing role |
| Modify | `client/src/pages/admin/Users.tsx` | Add `marketing` to business unit role dropdown |

---

### Task 1: Add `marketing` Role to Backend

**Files:**
- Modify: `server/utils/accessControl.ts:5-9`

- [ ] **Step 1: Add marketing to ROLE_HIERARCHY and WRITE_ROLES**

In `server/utils/accessControl.ts`, replace lines 5-9:

```typescript
export const ROLE_HIERARCHY = ['admin', 'manager', 'doctor', 'nurse', 'staff', 'guest'] as const;
export type UserRole = typeof ROLE_HIERARCHY[number];

export const WRITE_ROLES: UserRole[] = ['admin', 'manager', 'doctor', 'nurse', 'staff'];
export const READ_ONLY_ROLES: UserRole[] = ['guest'];
```

with:

```typescript
export const ROLE_HIERARCHY = ['admin', 'manager', 'doctor', 'nurse', 'staff', 'marketing', 'guest'] as const;
export type UserRole = typeof ROLE_HIERARCHY[number];

export const WRITE_ROLES: UserRole[] = ['admin', 'manager', 'doctor', 'nurse', 'staff', 'marketing'];
export const READ_ONLY_ROLES: UserRole[] = ['guest'];
```

- [ ] **Step 2: Run typecheck**

Run: `cd /home/mau/viali && npm run check`
Expected: No errors. The `UserRole` type is inferred from the const array, so adding `'marketing'` automatically extends it.

- [ ] **Step 3: Commit**

```bash
git add server/utils/accessControl.ts
git commit -m "feat: add marketing role to role hierarchy and write roles"
```

---

### Task 2: Add `marketing` to Admin Role Dropdown

**Files:**
- Modify: `client/src/pages/admin/Users.tsx:28-36`

- [ ] **Step 1: Add marketing role to business unit roles**

In `client/src/pages/admin/Users.tsx`, find the `getRolesForUnitType` function. Replace the business unit block (lines 31-36):

```typescript
  if (lowerType === "business") {
    return [
      { value: "manager", labelKey: "admin.roleManager" },
      { value: "staff", labelKey: "admin.roleStaff" },
    ];
  }
```

with:

```typescript
  if (lowerType === "business") {
    return [
      { value: "manager", labelKey: "admin.roleManager" },
      { value: "marketing", labelKey: "admin.roleMarketing" },
      { value: "staff", labelKey: "admin.roleStaff" },
    ];
  }
```

- [ ] **Step 2: Add translation key for marketing role**

Search for the translation file that contains `admin.roleManager` and add `admin.roleMarketing`. The key should map to `"Marketing"`. Find the translation files and add the key in both German and English.

Run: `cd /home/mau/viali && grep -r "roleManager" client/src/ --include="*.ts" --include="*.json" -l`

Add `"admin.roleMarketing": "Marketing"` next to `"admin.roleManager"` in each translation file found.

- [ ] **Step 3: Run typecheck**

Run: `cd /home/mau/viali && npm run check`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/Users.tsx
git add -A  # include translation files
git commit -m "feat: add marketing role option for business unit type in admin UI"
```

---

### Task 3: Create Marketing Page

**Files:**
- Create: `client/src/pages/business/Marketing.tsx`

- [ ] **Step 1: Create the Marketing page component**

This page reuses the existing `ReferralFunnel` and `LeadConversionTab` components. The referral tab includes the date range filter, pie chart, time-series chart, events table, and the ReferralFunnel component — all of which are currently in CostAnalytics.tsx lines 1644-1928.

Create `client/src/pages/business/Marketing.tsx`:

```typescript
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Users, TrendingUp, Loader2 } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import DateInput from "@/components/ui/date-input";
import ChartCard from "@/components/business/ChartCard";
import ReferralFunnel from "./ReferralFunnel";
import { LeadConversionTab } from "./LeadConversion";

// Referral source color mapping (same as CostAnalytics)
const REFERRAL_COLORS: Record<string, string> = {
  social: "#8b5cf6",
  search_engine: "#3b82f6",
  word_of_mouth: "#10b981",
  belegarzt: "#f59e0b",
  other: "#6b7280",
  llm: "#ec4899",
};

const REFERRAL_LABELS: Record<string, string> = {
  social: "Social Media",
  search_engine: "Search Engine",
  word_of_mouth: "Word of Mouth",
  belegarzt: "Belegarzt",
  other: "Other",
  llm: "AI / LLM",
};

const REFERRAL_DETAIL_LABELS: Record<string, string> = {
  Facebook: "Facebook",
  Instagram: "Instagram",
  TikTok: "TikTok",
  LinkedIn: "LinkedIn",
  YouTube: "YouTube",
  Twitter: "Twitter / X",
  Google: "Google",
  Bing: "Bing",
  Yahoo: "Yahoo",
  DuckDuckGo: "DuckDuckGo",
  ChatGPT: "ChatGPT",
  Claude: "Claude",
  Perplexity: "Perplexity",
};

export default function Marketing() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const [activeTab, setActiveTab] = useState("referrals");
  const [referralFrom, setReferralFrom] = useState("");
  const [referralTo, setReferralTo] = useState(new Date().toISOString().slice(0, 10));
  const [selectedReferralSource, setSelectedReferralSource] = useState<string | null>(null);

  // Fetch referral source statistics
  const referralParams = new URLSearchParams();
  if (referralFrom) referralParams.set("from", referralFrom);
  if (referralTo) referralParams.set("to", referralTo);

  const { data: referralData, isLoading: referralLoading } = useQuery<{
    breakdown: Array<{ referralSource: string; referralSourceDetail: string | null; count: number }>;
    totalReferrals: number;
  }>({
    queryKey: [`/api/business/${activeHospital?.id}/referral-stats?${referralParams.toString()}`],
    enabled: !!activeHospital?.id && activeTab === 'referrals',
  });

  // Fetch referral time-series (full history, no date filter)
  const { data: referralTimeseries, isLoading: referralTimeseriesLoading } = useQuery<
    Array<{ month: string; referralSource: string; count: number }>
  >({
    queryKey: [`/api/business/${activeHospital?.id}/referral-timeseries`],
    enabled: !!activeHospital?.id && activeTab === 'referrals',
  });

  // Fetch recent referral events
  const { data: referralEventsList, isLoading: referralEventsLoading } = useQuery<
    Array<{
      id: string;
      source: string;
      sourceDetail: string | null;
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      utmTerm: string | null;
      utmContent: string | null;
      gclid: string | null;
      gbraid: string | null;
      wbraid: string | null;
      fbclid: string | null;
      ttclid: string | null;
      msclkid: string | null;
      captureMethod: string;
      createdAt: string;
      patientFirstName: string | null;
      patientLastName: string | null;
    }>
  >({
    queryKey: [`/api/business/${activeHospital?.id}/referral-events?limit=50`],
    enabled: !!activeHospital?.id && activeTab === 'referrals',
  });

  // Transform time-series into line chart format
  const referralLineData = useMemo(() => {
    if (!referralTimeseries?.length) return [];
    const monthMap: Record<string, Record<string, number>> = {};
    const allSources = new Set<string>();
    for (const row of referralTimeseries) {
      if (!monthMap[row.month]) monthMap[row.month] = {};
      monthMap[row.month][row.referralSource] = (monthMap[row.month][row.referralSource] || 0) + row.count;
      allSources.add(row.referralSource);
    }
    return Object.keys(monthMap).sort().map((month) => {
      const entry: Record<string, any> = { month };
      for (const src of allSources) {
        entry[src] = monthMap[month][src] || 0;
      }
      return entry;
    });
  }, [referralTimeseries]);

  const referralLineSources = useMemo(() => {
    if (!referralTimeseries?.length) return [];
    const s = new Set<string>();
    for (const row of referralTimeseries) s.add(row.referralSource);
    return Array.from(s);
  }, [referralTimeseries]);

  const referralPieData = useMemo(() => {
    if (!referralData?.breakdown) return [];
    const grouped: Record<string, number> = {};
    referralData.breakdown.forEach((r) => {
      grouped[r.referralSource] = (grouped[r.referralSource] || 0) + r.count;
    });
    return Object.entries(grouped).map(([source, count]) => ({
      name: REFERRAL_LABELS[source] || source,
      source,
      value: count,
      fill: REFERRAL_COLORS[source] || "#94a3b8",
    }));
  }, [referralData]);

  const referralDetailData = useMemo(() => {
    if (!referralData?.breakdown || !selectedReferralSource) return [];
    return referralData.breakdown
      .filter((r) => r.referralSource === selectedReferralSource && r.referralSourceDetail)
      .map((r) => ({
        name: REFERRAL_DETAIL_LABELS[r.referralSourceDetail!] || r.referralSourceDetail!,
        value: r.count,
      }));
  }, [referralData, selectedReferralSource]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{t('business.marketing.title', 'Marketing')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('business.marketing.subtitle', 'Referral analytics and lead conversion tracking')}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="referrals" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('business.costs.referrals')}
          </TabsTrigger>
          <TabsTrigger value="leads" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {t('business.costs.leads', 'Leads')}
          </TabsTrigger>
        </TabsList>

        {/* Referrals Tab — this is the content moved from CostAnalytics.tsx lines 1644-1923 */}
        <TabsContent value="referrals" className="space-y-4 mt-6">
          {/* Date range filter */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">From</span>
                  <DateInput value={referralFrom} onChange={setReferralFrom} />
                </div>
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">To</span>
                  <DateInput value={referralTo} onChange={setReferralTo} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sample size indicator */}
          {referralData && (
            <div className="text-sm text-muted-foreground px-1">
              {referralData.totalReferrals} {t('business.referrals.totalBookingReferrals')}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Main pie chart */}
            <ChartCard
              title={t('business.referrals.sourceBreakdown')}
              helpText={t('business.referrals.sourceBreakdownHelp')}
            >
              {referralLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : referralPieData.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  {t('business.referrals.noData')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={referralPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      onClick={(entry) => setSelectedReferralSource(
                        selectedReferralSource === entry.source ? null : entry.source
                      )}
                      cursor="pointer"
                    >
                      {referralPieData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.fill}
                          opacity={selectedReferralSource && selectedReferralSource !== entry.source ? 0.3 : 1}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [value, name]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Detail drill-down pie (when a source is clicked) */}
            {selectedReferralSource && referralDetailData.length > 0 && (
              <ChartCard
                title={`${REFERRAL_LABELS[selectedReferralSource] || selectedReferralSource} — ${t('business.referrals.detailBreakdown', 'Detail')}`}
              >
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={referralDetailData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {referralDetailData.map((_, index) => (
                        <Cell key={`detail-${index}`} fill={Object.values(REFERRAL_COLORS)[index % Object.values(REFERRAL_COLORS).length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number, name: string) => [value, name]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          {/* Time-series line chart */}
          <ChartCard
            title={t('business.referrals.timeline', 'Referrals Over Time')}
          >
            {referralTimeseriesLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : referralLineData.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                {t('business.referrals.noData')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={referralLineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  {referralLineSources.map((src) => (
                    <Line
                      key={src}
                      type="monotone"
                      dataKey={src}
                      name={REFERRAL_LABELS[src] || src}
                      stroke={REFERRAL_COLORS[src] || "#94a3b8"}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Recent referral events table */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-4">{t('business.referrals.recentEvents', 'Recent Referral Events')}</h3>
              {referralEventsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : !referralEventsList?.length ? (
                <div className="text-muted-foreground text-sm">{t('business.referrals.noEvents', 'No referral events recorded yet.')}</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('business.referrals.date', 'Date')}</TableHead>
                        <TableHead>{t('business.referrals.patient', 'Patient')}</TableHead>
                        <TableHead>{t('business.referrals.source', 'Source')}</TableHead>
                        <TableHead>{t('business.referrals.detail', 'Detail')}</TableHead>
                        <TableHead>{t('business.referrals.method', 'Method')}</TableHead>
                        <TableHead>UTM</TableHead>
                        <TableHead>Click IDs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {referralEventsList.map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {new Date(ev.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-xs">
                            {ev.patientFirstName} {ev.patientLastName}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {REFERRAL_LABELS[ev.source] || ev.source}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{ev.sourceDetail || "—"}</TableCell>
                          <TableCell className="text-xs">{ev.captureMethod}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">
                            {[ev.utmSource, ev.utmMedium, ev.utmCampaign, ev.utmTerm, ev.utmContent]
                              .filter(Boolean).join(" / ") || "—"}
                          </TableCell>
                          <TableCell className="text-xs max-w-[150px] truncate">
                            {[ev.gclid && "gclid", ev.fbclid && "fbclid", ev.gbraid && "gbraid", ev.wbraid && "wbraid", ev.ttclid && "ttclid", ev.msclkid && "msclkid"]
                              .filter(Boolean).join(", ") || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Conversion Funnel Analytics */}
          <ReferralFunnel
            hospitalId={activeHospital?.id}
            from={referralFrom}
            to={referralTo}
            onEarliestDate={(d) => { if (!referralFrom) setReferralFrom(d); }}
          />
        </TabsContent>

        {/* Leads Tab */}
        <TabsContent value="leads" className="mt-6">
          <LeadConversionTab hospitalId={activeHospital?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**Note to implementer:** The referrals tab content (pie charts, line chart, events table, ReferralFunnel) is copied from CostAnalytics.tsx lines 1644-1923. Read CostAnalytics.tsx to verify the JSX matches exactly — there may be small differences between the plan and the actual current code. Copy the exact JSX from CostAnalytics and adapt only the variable names (e.g., `activeSubTab` → `activeTab`).

- [ ] **Step 2: Run typecheck**

Run: `cd /home/mau/viali && npm run check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/business/Marketing.tsx
git commit -m "feat: create Marketing page with Referrals and Leads tabs"
```

---

### Task 4: Remove Referrals and Leads Tabs from CostAnalytics

**Files:**
- Modify: `client/src/pages/business/CostAnalytics.tsx`

- [ ] **Step 1: Remove referral/lead imports**

In `CostAnalytics.tsx`, remove these import lines:

```typescript
import { LeadConversionTab } from "./LeadConversion";
import ReferralFunnel from "./ReferralFunnel";
```

- [ ] **Step 2: Remove referral-related state variables**

Remove these state declarations (around lines 365-367):

```typescript
const [referralFrom, setReferralFrom] = useState("");
const [referralTo, setReferralTo] = useState(new Date().toISOString().slice(0, 10));
const [selectedReferralSource, setSelectedReferralSource] = useState<string | null>(null);
```

- [ ] **Step 3: Remove referral data queries and computed values**

Remove the referral-related queries and memos (around lines 487-584):
- `referralParams` URL params construction
- `referralData` useQuery
- `referralTimeseries` useQuery
- `referralEventsList` useQuery
- `referralLineData` useMemo
- `referralLineSources` useMemo
- `referralPieData` useMemo
- `referralDetailData` useMemo

- [ ] **Step 4: Remove referral/lead TabsTriggers**

In the TabsList (around line 762), remove the referrals and leads triggers:

```typescript
<TabsTrigger value="referrals" className="flex items-center gap-2" data-testid="tab-costs-referrals">
  <Users className="h-4 w-4" />
  {t('business.costs.referrals')}
</TabsTrigger>
<TabsTrigger value="leads" className="flex items-center gap-2" data-testid="tab-costs-leads">
  <TrendingUp className="h-4 w-4" />
  {t('business.costs.leads', 'Leads')}
</TabsTrigger>
```

Change the TabsList grid from `grid-cols-4` to `grid-cols-2`:

```typescript
<TabsList className="grid w-full max-w-2xl grid-cols-2">
```

- [ ] **Step 5: Remove referral/lead TabsContent sections**

Remove the entire referrals TabsContent (lines 1644-1923) and leads TabsContent (lines 1926-1928).

- [ ] **Step 6: Clean up unused imports**

Remove any imports that are no longer used after removing the referral/lead tabs. Check for: `Users`, `TrendingUp` from lucide-react (if not used elsewhere in the file), `DateInput`, `ChartCard`, recharts components (if only used in referral charts), `Badge`, etc. Only remove imports that have zero remaining references in the file.

- [ ] **Step 7: Run typecheck**

Run: `cd /home/mau/viali && npm run check`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/business/CostAnalytics.tsx
git commit -m "refactor: remove Referrals and Leads tabs from CostAnalytics (moved to Marketing page)"
```

---

### Task 5: Add Route and Access Control

**Files:**
- Modify: `client/src/App.tsx:244-252`
- Modify: `client/src/components/ProtectedRoute.tsx`

- [ ] **Step 1: Add Marketing route in App.tsx**

In `client/src/App.tsx`, add the marketing route. Find the business routes block (around line 244) and add the new route **before** the `/business` catch-all route:

Add this import at the top with the other lazy imports:
```typescript
const Marketing = lazy(() => import("@/pages/business/Marketing"));
```

Then add the route (insert before the `/business` route):
```typescript
<Route path="/business/marketing">{() => <ProtectedRoute requireBusiness><Marketing /></ProtectedRoute>}</Route>
```

**Note:** If `Marketing` is not already imported via lazy loading, check how other business page imports work (e.g. `CostAnalytics`, `SimplifiedDashboard`) and follow the same pattern.

- [ ] **Step 2: Update ProtectedRoute to gate marketing role**

In `client/src/components/ProtectedRoute.tsx`, make two changes:

**A. Update the default redirect for marketing role users:**

Replace the `getDefaultRedirect` function's business check (lines 41-43):

```typescript
if (hasBusinessAccess) {
  return "/business";
}
```

with:

```typescript
if (hasBusinessAccess) {
  return activeHospital?.role === 'marketing' ? "/business/marketing" : "/business";
}
```

**B. Add marketing role gating in the business access check:**

Replace the business access check block (lines 100-103):

```typescript
if (requireBusiness && !hasBusinessAccess) {
  return <Redirect to={defaultRedirect} />;
}
```

with:

```typescript
if (requireBusiness && !hasBusinessAccess) {
  return <Redirect to={defaultRedirect} />;
}

// Marketing role can only access /business/marketing
if (requireBusiness && hasBusinessAccess && activeHospital?.role === 'marketing') {
  const currentPath = window.location.pathname;
  if (currentPath !== '/business/marketing') {
    return <Redirect to="/business/marketing" />;
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd /home/mau/viali && npm run check`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx client/src/components/ProtectedRoute.tsx
git commit -m "feat: add /business/marketing route and gate marketing role access"
```

---

### Task 6: Update Bottom Navigation

**Files:**
- Modify: `client/src/components/BottomNav.tsx:183-197`

- [ ] **Step 1: Add Marketing nav item and handle marketing role**

In `client/src/components/BottomNav.tsx`, find the business navigation block (lines 183-197). Replace it:

```typescript
if (activeModule === "business") {
  const businessItems: NavItem[] = [];

  // Manager/admin users: Dashboard (costs/analytics) first, then Administration, Staff, etc.
  if (activeHospital?.role === 'admin' || activeHospital?.role === 'manager') {
    businessItems.push({ id: "business-dashboard", icon: "fas fa-chart-pie", label: t('bottomNav.business.dashboard'), path: "/business" });
    businessItems.push({ id: "business-administration", icon: "fas fa-table", label: t('bottomNav.business.administration', 'Administration'), path: "/business/administration" });
    businessItems.push({ id: "business-staff", icon: "fas fa-users", label: t('bottomNav.business.staff'), path: "/business/staff" });
    businessItems.push({ id: "business-contracts", icon: "fas fa-file-signature", label: t('bottomNav.business.contracts', 'Contracts'), path: "/business/contracts" });
    businessItems.push({ id: "business-worklogs", icon: "fas fa-clock", label: t('bottomNav.business.worklogs', 'Worklogs'), path: "/business/worklogs" });
  } else {
    // Staff role users: Administration (surgery planning) only
    businessItems.push({ id: "business-administration", icon: "fas fa-table", label: t('bottomNav.business.administration', 'Administration'), path: "/business" });
  }
  return businessItems;
}
```

with:

```typescript
if (activeModule === "business") {
  const businessItems: NavItem[] = [];

  if (activeHospital?.role === 'marketing') {
    // Marketing role: only Marketing page
    businessItems.push({ id: "business-marketing", icon: "fas fa-bullhorn", label: t('bottomNav.business.marketing', 'Marketing'), path: "/business/marketing" });
  } else if (activeHospital?.role === 'admin' || activeHospital?.role === 'manager') {
    // Manager/admin users: all pages including Marketing
    businessItems.push({ id: "business-dashboard", icon: "fas fa-chart-pie", label: t('bottomNav.business.dashboard'), path: "/business" });
    businessItems.push({ id: "business-marketing", icon: "fas fa-bullhorn", label: t('bottomNav.business.marketing', 'Marketing'), path: "/business/marketing" });
    businessItems.push({ id: "business-administration", icon: "fas fa-table", label: t('bottomNav.business.administration', 'Administration'), path: "/business/administration" });
    businessItems.push({ id: "business-staff", icon: "fas fa-users", label: t('bottomNav.business.staff'), path: "/business/staff" });
    businessItems.push({ id: "business-contracts", icon: "fas fa-file-signature", label: t('bottomNav.business.contracts', 'Contracts'), path: "/business/contracts" });
    businessItems.push({ id: "business-worklogs", icon: "fas fa-clock", label: t('bottomNav.business.worklogs', 'Worklogs'), path: "/business/worklogs" });
  } else {
    // Staff role users: Administration (surgery planning) only
    businessItems.push({ id: "business-administration", icon: "fas fa-table", label: t('bottomNav.business.administration', 'Administration'), path: "/business" });
  }
  return businessItems;
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd /home/mau/viali && npm run check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/BottomNav.tsx
git commit -m "feat: add Marketing to bottom nav, show only Marketing for marketing role"
```

---

### Task 7: Verify End-to-End

- [ ] **Step 1: Run full typecheck**

Run: `cd /home/mau/viali && npm run check`
Expected: No errors.

- [ ] **Step 2: Manual verification**

Run: `cd /home/mau/viali && npm run dev`

Test with a **manager** user on a business unit:
1. Bottom nav shows: Dashboard, Marketing, Administration, Staff, Contracts, Worklogs
2. `/business` shows CostAnalytics with only Surgeries and Inventories tabs (no Referrals/Leads)
3. `/business/marketing` shows Marketing page with Referrals and Leads tabs
4. Referral charts, events table, ReferralFunnel all render correctly
5. Leads tab renders LeadConversionTab correctly

Test with a **marketing** user (assign the role in admin):
1. Bottom nav shows only: Marketing
2. Navigating to `/business` redirects to `/business/marketing`
3. Navigating to `/business/administration` redirects to `/business/marketing`
4. `/business/marketing` works normally with Referrals and Leads tabs

- [ ] **Step 3: Fix any issues found**

If any issues, fix and commit:
```bash
git add -A
git commit -m "fix: marketing role and tab separation edge cases"
```
