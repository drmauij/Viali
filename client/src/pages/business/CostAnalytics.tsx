import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowUpRight, ArrowDownRight } from "lucide-react";

import { useActiveHospital } from "@/hooks/useActiveHospital";
import { formatCurrencyLocale } from "@/lib/dateUtils";

import WhatChangedPanel from "@/components/business/dashboard/WhatChangedPanel";
import MoneyChartsCard from "@/components/business/dashboard/MoneyChartsCard";
import InventoryCard from "@/components/business/dashboard/InventoryCard";
import ReferralsBySourceCard from "@/components/business/dashboard/ReferralsBySourceCard";
import ReferralsDetailModal from "@/components/business/dashboard/ReferralsDetailModal";
import MonthSurgeriesModal from "@/components/business/dashboard/MonthSurgeriesModal";
import AdPerformanceCard from "@/components/business/dashboard/AdPerformanceCard";
import SurgeryCostsCard from "@/components/business/dashboard/SurgeryCostsCard";
import type { MoneySummary } from "@/components/business/dashboard/types";

interface SurgeriesSummary {
  countPlanned: number;
  countConverted: number;
  revenuePlanned: number;
  revenueWon: number;
}

interface ReferralsBySourceTotals {
  sources: Array<{
    source: string;
    referrals: number;
    completed: number;
    paid: number;
    conversionPct: number;
    conversionPaidPct: number;
  }>;
}

interface KpiCardProps {
  label: string;
  value: string;
  hint?: React.ReactNode;
  help?: string;
  emphasis?: "positive" | "negative";
}

function KpiCard({ label, value, hint, help, emphasis }: KpiCardProps) {
  const valueTone =
    emphasis === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : emphasis === "negative"
        ? "text-red-600 dark:text-red-400"
        : "";
  return (
    <Card>
      <CardContent className="p-4 flex flex-col h-full">
        <div className="text-xs text-muted-foreground uppercase">{label}</div>
        <div className={`text-2xl font-bold ${valueTone}`}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
        {help && (
          <div className="text-[10px] text-muted-foreground/60 mt-auto pt-2 leading-snug italic">
            {help}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CostAnalytics() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const [range, setRange] = useState<string>("all");
  const [showBackToChain, setShowBackToChain] = useState(false);
  const [, navigate] = useLocation();
  const [drilldownMonth, setDrilldownMonth] = useState<string | null>(null);
  const [drilldownSource, setDrilldownSource] = useState<string | null>(null);

  useEffect(() => {
    setShowBackToChain(sessionStorage.getItem("chain.drilledInto") === "true");
  }, []);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => current - i);
  }, []);

  const isManager = activeHospital?.role === "admin" || activeHospital?.role === "manager";
  const hospitalId = activeHospital?.id ?? "";

  const summary = useQuery<MoneySummary>({
    queryKey: [`/api/business/${hospitalId}/money-summary?range=${range}`],
    enabled: !!hospitalId,
  });

  const surgeries = useQuery<SurgeriesSummary>({
    queryKey: [`/api/business/${hospitalId}/surgeries-summary?range=${range}`],
    enabled: !!hospitalId,
  });

  const referralsTotals = useQuery<ReferralsBySourceTotals>({
    queryKey: [`/api/business/${hospitalId}/referrals-by-source?range=${range}`],
    enabled: !!hospitalId,
  });

  if (!isManager) {
    return <Redirect to="/business/administration" />;
  }

  const isAllRange = range === "all";
  const s = summary.data;
  const sg = surgeries.data;
  const refRows = referralsTotals.data?.sources ?? [];
  const referralsTotal = refRows.reduce((sum, r) => sum + r.referrals, 0);
  const referralsCompleted = refRows.reduce((sum, r) => sum + r.completed, 0);
  const referralsPaid = refRows.reduce((sum, r) => sum + r.paid, 0);
  const paidConversion = referralsTotal > 0 ? (referralsPaid / referralsTotal) * 100 : 0;

  const staffPct = s && s.cost.total > 0 ? (s.cost.staff / s.cost.total) * 100 : 0;
  const matPct = s && s.cost.total > 0 ? (s.cost.materials / s.cost.total) * 100 : 0;
  const marginPp = s?.margin.deltaPp_vs_prev ?? 0;
  const avgMarginPerSurgery =
    s && sg && sg.countConverted > 0 ? s.margin.value / sg.countConverted : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      {showBackToChain && (
        <div className="-mx-4 md:-mx-6 -mt-4 md:-mt-6 px-4 md:px-6 py-2 bg-blue-500/5 border-b border-blue-500/20 text-sm flex items-center gap-2">
          <button
            onClick={() => { sessionStorage.removeItem("chain.drilledInto"); navigate("/chain"); }}
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            data-testid="back-to-chain-breadcrumb"
          >
            ← {t("business.backToChain", "Back to Chain overview")}
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-cost-analytics-title">
            {activeHospital?.name ?? t("business.costs.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("business.dashboard.subtitle", "Manage administrative details for surgeries such as billing, contracts, and documentation")}
          </p>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[180px]" data-testid="select-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("business.range.all", "All time")}</SelectItem>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={String(y)}>{String(y)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <WhatChangedPanel hospitalId={hospitalId} />

      <Tabs defaultValue="money" className="w-full">
        <div className="overflow-x-auto scrollbar-hide">
          <TabsList className="inline-flex w-auto min-w-full">
            <TabsTrigger value="money" data-testid="tab-money" className="whitespace-nowrap">
              {t("business.bands.moneyTitle", "Money")}
            </TabsTrigger>
            <TabsTrigger value="pipeline" data-testid="tab-pipeline" className="whitespace-nowrap">
              {t("business.bands.pipelineTitle", "Pipeline")}
            </TabsTrigger>
            <TabsTrigger value="costs" data-testid="tab-costs" className="whitespace-nowrap">
              {t("business.bands.costsTitle", "Costs")}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Money ───────────────────────────────────────────────── */}
        <TabsContent value="money" className="mt-6 space-y-6">
          <p className="text-sm text-muted-foreground">
            {t("business.bands.moneyHint", "Did we make money? Revenue, costs, and margin for the selected period.")}
          </p>

          {summary.isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : !s ? (
            <div className="text-center text-red-500 py-12">{t("common.errorLoadingData", "Error loading data")}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard
                  label={t("business.money.revenue", "Revenue")}
                  value={formatCurrencyLocale(s.revenue.total)}
                  hint={t("business.money.surgeryShare", "Surgery {{v}} · Treatments {{t}}", {
                    v: formatCurrencyLocale(s.revenue.surgery),
                    t: formatCurrencyLocale(s.revenue.treatment),
                  })}
                  help={t(
                    "business.money.revenueHelp",
                    "Money billed for completed surgeries and treatments in this period.",
                  )}
                />
                <KpiCard
                  label={t("business.money.costs", "Costs")}
                  value={formatCurrencyLocale(s.cost.total)}
                  hint={t("business.money.costSplit", "Staff {{a}}% · Materials {{b}}%", {
                    a: staffPct.toFixed(0),
                    b: matPct.toFixed(0),
                  })}
                  help={t(
                    "business.money.costsHelp",
                    "Staff hours and consumables used on completed cases.",
                  )}
                />
                <KpiCard
                  label={t("business.money.margin", "Margin")}
                  value={formatCurrencyLocale(s.margin.value)}
                  emphasis={s.margin.value >= 0 ? "positive" : "negative"}
                  hint={!isAllRange ? (
                    <span className="flex items-center gap-1">
                      {marginPp >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(marginPp).toFixed(1)} pp {t("business.money.vsPrev", "vs prev period")}
                    </span>
                  ) : undefined}
                  help={t(
                    "business.money.marginHelp",
                    "What is left after subtracting costs from revenue.",
                  )}
                />
                <KpiCard
                  label={t("business.money.marginPercent", "Margin %")}
                  value={`${(s.margin.percent * 100).toFixed(1)}%`}
                  hint={!isAllRange ? `${marginPp >= 0 ? "↑" : "↓"} ${Math.abs(marginPp).toFixed(1)} pp` : undefined}
                  help={t(
                    "business.money.marginPercentHelp",
                    "Margin as a share of revenue.",
                  )}
                />
              </div>

              <MoneyChartsCard
                hospitalId={hospitalId}
                range={range}
                summary={s}
                onMonthClick={(m) => setDrilldownMonth(m)}
              />

              <InventoryCard hospitalId={hospitalId} />
            </>
          )}
        </TabsContent>

        {/* ─── Costs ───────────────────────────────────────────────── */}
        <TabsContent value="costs" className="mt-6 space-y-6">
          <p className="text-sm text-muted-foreground">
            {t(
              "business.bands.costsHint",
              "Per-surgery cost detail — staff, anesthesia consumables, and surgery consumables. Click a row to see the full breakdown.",
            )}
          </p>
          <SurgeryCostsCard hospitalId={hospitalId} range={range} />
        </TabsContent>

        {/* ─── Pipeline ────────────────────────────────────────────── */}
        <TabsContent value="pipeline" className="mt-6 space-y-6">
          <p className="text-sm text-muted-foreground">
            {t("business.bands.pipelineHint", "Are bookings healthy? Future revenue, referral sources, and ad performance — the inputs to the funnel.")}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Card className="lg:col-span-2">
              <CardContent className="p-4 flex flex-col h-full">
                <div className="text-xs text-muted-foreground uppercase">
                  {t("business.pipeline.futurePipeline", "Future pipeline")}
                </div>
                <div className="mt-1 grid grid-cols-2 divide-x divide-border">
                  <div className="pr-4">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      {t("business.pipeline.surgeries", "Surgeries")}
                    </div>
                    <div className="text-2xl font-bold" data-testid="pipeline-future-count">
                      {sg?.countPlanned ?? 0}
                    </div>
                  </div>
                  <div className="pl-4">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      {t("business.pipeline.plannedRevenue", "Planned revenue")}
                    </div>
                    <div
                      className="text-2xl font-bold text-emerald-600 dark:text-emerald-400"
                      data-testid="pipeline-planned-revenue"
                    >
                      {formatCurrencyLocale(sg?.revenuePlanned ?? 0)}
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground/60 mt-auto pt-2 leading-snug italic">
                  {t(
                    "business.pipeline.futurePipelineHelp",
                    "Booked surgeries still to come and the revenue they should bring in.",
                  )}
                </div>
              </CardContent>
            </Card>
            <KpiCard
              label={t("business.pipeline.totalReferrals", "Referrals in period")}
              value={String(referralsTotal)}
              hint={t("business.pipeline.attendedAndPaid", "{{a}} attended · {{p}} paid", {
                a: referralsCompleted,
                p: referralsPaid,
              })}
              help={t(
                "business.pipeline.totalReferralsHelp",
                "New patient referrals received in this period, across all sources.",
              )}
            />
            <KpiCard
              label={t("business.pipeline.paidConversion", "Paid conversion")}
              value={referralsTotal > 0 ? `${paidConversion.toFixed(0)}%` : "—"}
              emphasis={paidConversion >= 30 ? "positive" : undefined}
              help={t(
                "business.pipeline.paidConversionHelp",
                "Share of referrals that have paid for a surgery.",
              )}
            />
            <KpiCard
              label={t("business.pipeline.avgMargin", "Avg margin / surgery")}
              value={formatCurrencyLocale(avgMarginPerSurgery)}
              emphasis={avgMarginPerSurgery >= 0 ? "positive" : "negative"}
              help={t(
                "business.pipeline.avgMarginHelp",
                "Average profit per completed surgery — revenue minus cost.",
              )}
            />
          </div>

          <ReferralsBySourceCard
            hospitalId={hospitalId}
            range={range}
            onSourceClick={(src) => setDrilldownSource(src)}
          />

          <AdPerformanceCard hospitalId={hospitalId} range={range} />
        </TabsContent>
      </Tabs>

      <MonthSurgeriesModal
        hospitalId={hospitalId}
        month={drilldownMonth}
        onClose={() => setDrilldownMonth(null)}
      />
      <ReferralsDetailModal
        hospitalId={hospitalId}
        range={range}
        source={drilldownSource}
        onClose={() => setDrilldownSource(null)}
      />
    </div>
  );
}
