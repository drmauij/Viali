# Referral Source Analytics Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a referral source pie chart with drill-down and date filtering to the Business Dashboard, showing how patients found the clinic.

**Architecture:** New API endpoint aggregates `referral_source` and `referral_source_detail` from `patient_questionnaire_responses` (joined via `patient_questionnaire_links` for hospitalId filtering). Frontend adds a new "Referrals" sub-tab in `CostAnalytics.tsx` alongside existing "Surgeries" and "Inventories" tabs, using recharts `PieChart`. Click a slice to drill into detail breakdown.

**Tech Stack:** Drizzle ORM (server query), recharts PieChart (already installed), React Query, existing Radix UI Card components.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `server/routes/business.ts` | Modify | Add `GET /api/business/:hospitalId/referral-stats` endpoint |
| `client/src/pages/business/CostAnalytics.tsx` | Modify | Add "Referrals" sub-tab with pie chart + drill-down |
| `client/src/i18n/translations/questionnaire.ts` | Modify | Add translation keys for referral analytics labels |

No new files needed — all changes fit in existing files.

---

## Referral Source Values Reference

Stored in DB (`referral_source` column):
- `social` → detail: `facebook`, `instagram`, `tiktok`
- `search_engine` → detail: `google`, `bing`
- `llm` (AI Assistant) → no detail
- `word_of_mouth` (Personal Recommendation) → detail: free text
- `belegarzt` (Referring Doctor) → no detail
- `other` → detail: free text

Labels already defined in `QuestionnaireTab.tsx` lines 204-219 (`REFERRAL_SOURCE_LABELS`, `REFERRAL_DETAIL_LABELS`). Reuse these mappings on the frontend.

---

### Task 1: Backend — Referral Stats API Endpoint

**Files:**
- Modify: `server/routes/business.ts` (add endpoint after existing surgery routes ~line 1331)

- [ ] **Step 1: Add the endpoint**

Add `GET /api/business/:hospitalId/referral-stats` with optional `from` and `to` query params (ISO date strings). Query joins `patient_questionnaire_responses` → `patient_questionnaire_links` (for `hospitalId` filter), filters by `submitted_at` date range, groups by `referral_source` and `referral_source_detail`.

```typescript
// After the surgeries/:surgeryId/costs endpoint

router.get('/api/business/:hospitalId/referral-stats', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { from, to } = req.query;

    let query = db
      .select({
        referralSource: patientQuestionnaireResponses.referralSource,
        referralSourceDetail: patientQuestionnaireResponses.referralSourceDetail,
        count: sql<number>`count(*)::int`,
      })
      .from(patientQuestionnaireResponses)
      .innerJoin(
        patientQuestionnaireLinks,
        eq(patientQuestionnaireResponses.linkId, patientQuestionnaireLinks.id)
      )
      .where(
        and(
          eq(patientQuestionnaireLinks.hospitalId, hospitalId),
          eq(patientQuestionnaireLinks.status, 'submitted'),
          isNotNull(patientQuestionnaireResponses.referralSource),
          from ? gte(patientQuestionnaireLinks.submittedAt, new Date(from as string)) : undefined,
          to ? lte(patientQuestionnaireLinks.submittedAt, new Date(to as string)) : undefined,
        )
      )
      .groupBy(
        patientQuestionnaireResponses.referralSource,
        patientQuestionnaireResponses.referralSourceDetail,
      );

    const rows = await query;

    // Also get total questionnaire count (including those without referral source)
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(patientQuestionnaireResponses)
      .innerJoin(
        patientQuestionnaireLinks,
        eq(patientQuestionnaireResponses.linkId, patientQuestionnaireLinks.id)
      )
      .where(
        and(
          eq(patientQuestionnaireLinks.hospitalId, hospitalId),
          eq(patientQuestionnaireLinks.status, 'submitted'),
          from ? gte(patientQuestionnaireLinks.submittedAt, new Date(from as string)) : undefined,
          to ? lte(patientQuestionnaireLinks.submittedAt, new Date(to as string)) : undefined,
        )
      );

    res.json({
      breakdown: rows,
      totalQuestionnaires: totalResult?.count || 0,
      answeredReferral: rows.reduce((sum, r) => sum + r.count, 0),
    });
  } catch (error: any) {
    console.error('Error fetching referral stats:', error);
    res.status(500).json({ message: 'Failed to fetch referral stats' });
  }
});
```

- [ ] **Step 2: Add missing imports if needed**

Ensure `isNotNull`, `gte`, `lte` from `drizzle-orm` and `patientQuestionnaireResponses`, `patientQuestionnaireLinks` from schema are imported at the top of `business.ts`. Check existing imports first — some may already be there.

- [ ] **Step 3: Test the endpoint manually**

Run: `curl localhost:5000/api/business/{hospitalId}/referral-stats` (with auth cookie)
Expected: JSON with `breakdown`, `totalQuestionnaires`, `answeredReferral` fields.

- [ ] **Step 4: Commit**

```bash
git add server/routes/business.ts
git commit -m "feat(business): add referral source statistics API endpoint"
```

---

### Task 2: Frontend — Referrals Sub-Tab with Pie Chart

**Files:**
- Modify: `client/src/pages/business/CostAnalytics.tsx`

- [ ] **Step 1: Add "Referrals" to the sub-tab grid**

Change the `TabsList` grid from `grid-cols-2` to `grid-cols-3` and add a third `TabsTrigger` for "referrals":

```tsx
<TabsList className="grid w-full max-w-md grid-cols-3">
  <TabsTrigger value="surgeries" ...>...</TabsTrigger>
  <TabsTrigger value="inventories" ...>...</TabsTrigger>
  <TabsTrigger value="referrals" className="flex items-center gap-2" data-testid="tab-costs-referrals">
    <Users className="h-4 w-4" />
    {t('business.costs.referrals')}
  </TabsTrigger>
</TabsList>
```

- [ ] **Step 2: Add state and data fetching**

Add date range state and the query:

```tsx
const [referralFrom, setReferralFrom] = useState("");
const [referralTo, setReferralTo] = useState("");
const [selectedReferralSource, setSelectedReferralSource] = useState<string | null>(null);

const referralParams = new URLSearchParams();
if (referralFrom) referralParams.set("from", referralFrom);
if (referralTo) referralParams.set("to", referralTo);

const { data: referralData, isLoading: referralLoading } = useQuery<{
  breakdown: Array<{ referralSource: string; referralSourceDetail: string | null; count: number }>;
  totalQuestionnaires: number;
  answeredReferral: number;
}>({
  queryKey: [`/api/business/${activeHospital?.id}/referral-stats?${referralParams.toString()}`],
  enabled: !!activeHospital?.id && activeSubTab === 'referrals',
});
```

- [ ] **Step 3: Aggregate data for pie chart with useMemo**

```tsx
const REFERRAL_COLORS: Record<string, string> = {
  social: "#3b82f6",
  search_engine: "#10b981",
  llm: "#8b5cf6",
  word_of_mouth: "#f59e0b",
  belegarzt: "#ec4899",
  other: "#6b7280",
};

const REFERRAL_LABELS: Record<string, string> = {
  social: "Social Media",
  search_engine: "Search Engine",
  llm: "AI Assistant",
  word_of_mouth: "Personal Recommendation",
  belegarzt: "Referring Doctor",
  other: "Other",
};

const DETAIL_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  google: "Google",
  bing: "Bing",
};

const referralPieData = useMemo(() => {
  if (!referralData?.breakdown) return [];
  const grouped: Record<string, number> = {};
  referralData.breakdown.forEach((r) => {
    grouped[r.referralSource] = (grouped[r.referralSource] || 0) + r.count;
  });
  return Object.entries(grouped).map(([source, count]) => ({
    name: REFERRAL_LABELS[source] || source,
    value: count,
    source,
    color: REFERRAL_COLORS[source] || "#6b7280",
  }));
}, [referralData]);

const referralDetailData = useMemo(() => {
  if (!referralData?.breakdown || !selectedReferralSource) return [];
  return referralData.breakdown
    .filter((r) => r.referralSource === selectedReferralSource && r.referralSourceDetail)
    .map((r) => ({
      name: DETAIL_LABELS[r.referralSourceDetail!] || r.referralSourceDetail!,
      value: r.count,
    }));
}, [referralData, selectedReferralSource]);
```

- [ ] **Step 4: Add the TabsContent with pie chart, sample size, date filter, and drill-down**

```tsx
<TabsContent value="referrals" className="space-y-4">
  {/* Date range filter */}
  <Card>
    <CardContent className="pt-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t('business.referrals.dateRange')}:</span>
        </div>
        <Input
          type="date"
          value={referralFrom}
          onChange={(e) => setReferralFrom(e.target.value)}
          className="w-40"
          placeholder="From"
        />
        <span className="text-muted-foreground">—</span>
        <Input
          type="date"
          value={referralTo}
          onChange={(e) => setReferralTo(e.target.value)}
          className="w-40"
          placeholder="To"
        />
        {(referralFrom || referralTo) && (
          <button
            onClick={() => { setReferralFrom(""); setReferralTo(""); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </CardContent>
  </Card>

  {/* Sample size indicator */}
  {referralData && (
    <div className="text-sm text-muted-foreground px-1">
      {referralData.answeredReferral} {t('business.referrals.of')} {referralData.totalQuestionnaires} {t('business.referrals.questionnairesAnswered')}
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
                  key={index}
                  fill={entry.color}
                  opacity={selectedReferralSource && selectedReferralSource !== entry.source ? 0.4 : 1}
                  stroke={selectedReferralSource === entry.source ? entry.color : "transparent"}
                  strokeWidth={selectedReferralSource === entry.source ? 3 : 0}
                />
              ))}
            </Pie>
            <RechartsTooltip
              formatter={(value: number) => [value, "Responses"]}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>

    {/* Detail drill-down */}
    <ChartCard
      title={selectedReferralSource
        ? `${REFERRAL_LABELS[selectedReferralSource] || selectedReferralSource} — Detail`
        : t('business.referrals.clickToExplore')
      }
      helpText={t('business.referrals.detailHelp')}
    >
      {!selectedReferralSource ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          {t('business.referrals.selectSlice')}
        </div>
      ) : referralDetailData.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          {t('business.referrals.noDetail')}
        </div>
      ) : (
        <div className="space-y-3 pt-2">
          {referralDetailData.map((item, i) => {
            const total = referralDetailData.reduce((s, d) => s + d.value, 0);
            const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : "0";
            return (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{item.name}</span>
                  <span className="text-muted-foreground">{item.value} ({pct}%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: REFERRAL_COLORS[selectedReferralSource] || "#6b7280",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  </div>
</TabsContent>
```

- [ ] **Step 5: Run typecheck**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/business/CostAnalytics.tsx
git commit -m "feat(business): add referral source pie chart with drill-down to Dashboard"
```

---

### Task 3: Translation Keys

**Files:**
- Modify: `client/src/i18n/translations/questionnaire.ts` (or wherever business translations live)

- [ ] **Step 1: Find the business translation keys location**

Search for existing keys like `business.costs.surgeries` to find the right file.

- [ ] **Step 2: Add translation keys for all languages**

Keys to add (EN values shown, translate for DE/IT/ES/FR):

```
business.costs.referrals: "Referrals"
business.referrals.dateRange: "Date range"
business.referrals.of: "of"
business.referrals.questionnairesAnswered: "questionnaires answered"
business.referrals.sourceBreakdown: "How patients found us"
business.referrals.sourceBreakdownHelp: "Shows how patients heard about the clinic based on questionnaire responses"
business.referrals.noData: "No referral data available"
business.referrals.clickToExplore: "Detail Breakdown"
business.referrals.detailHelp: "Click a slice in the pie chart to see the detail breakdown"
business.referrals.selectSlice: "Click a slice to see details"
business.referrals.noDetail: "No detail breakdown for this source"
```

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/
git commit -m "feat(i18n): add referral analytics translation keys"
```

---

### Task 4: Final Verification

- [ ] **Step 1: Run lint + typecheck**

```bash
npm run check
```

- [ ] **Step 2: Manual test**

1. Open Business module → Dashboard tab
2. Click "Referrals" sub-tab
3. Verify pie chart loads with data (or shows "no data" if no questionnaires have referral sources)
4. Verify sample size text shows "X of Y questionnaires answered"
5. Set a date range → verify chart updates
6. Click a pie slice → verify detail breakdown appears on the right
7. Click the same slice again → verify it deselects

- [ ] **Step 3: Final commit if any fixes needed**
