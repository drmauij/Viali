import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, Download, HelpCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────

interface ReferralFunnelProps {
  hospitalId: string | undefined;
}

type FunnelRow = {
  referral_id: string;
  source: string;
  source_detail: string | null;
  referral_date: string;
  patient_id: string;
  capture_method: string;
  has_click_id: boolean;
  appointment_id: string | null;
  appointment_status: string | null;
  provider_id: string | null;
  appointment_date: string | null;
  provider_first_name: string | null;
  provider_last_name: string | null;
  surgery_id: string | null;
  surgery_status: string | null;
  payment_status: string | null;
  price: string | null;
  payment_date: string | null;
  surgery_planned_date: string | null;
  surgeon_id: string | null;
};

type FunnelMetrics = {
  totalReferrals: number;
  withAppointment: number;
  kept: number;
  noShow: number;
  cancelled: number;
  surgeryPlanned: number;
  paid: number;
  noShowRate: number;
  cancellationRate: number;
  aptToSurgeryRate: number;
  surgeryToPaidRate: number;
  fullFunnelRate: number;
  totalRevenue: number;
  avgDaysToConversion: number | null;
};

// ── Constants ──────────────────────────────────────────────────────────────

const KEPT_STATUSES = ["arrived", "in_progress", "completed"];

const REFERRAL_COLORS: Record<string, string> = {
  social: "#3b82f6",
  search_engine: "#10b981",
  llm: "#8b5cf6",
  word_of_mouth: "#f59e0b",
  belegarzt: "#ec4899",
  other: "#6b7280",
};

const CHF = new Intl.NumberFormat("de-CH", {
  style: "currency",
  currency: "CHF",
  minimumFractionDigits: 0,
});

// ── Aggregation ────────────────────────────────────────────────────────────

function computeMetrics(rows: FunnelRow[]): FunnelMetrics {
  const total = rows.length;
  const withAppt = rows.filter((r) => r.appointment_id);
  const kept = withAppt.filter((r) =>
    KEPT_STATUSES.includes(r.appointment_status || ""),
  );
  const noShow = withAppt.filter((r) => r.appointment_status === "no_show");
  const cancelled = withAppt.filter(
    (r) => r.appointment_status === "cancelled",
  );
  const surgeryPlanned = rows.filter((r) => r.surgery_id);
  const paid = surgeryPlanned.filter((r) => r.payment_status === "paid");
  const totalRevenue = paid.reduce(
    (sum, r) => sum + parseFloat(r.price || "0"),
    0,
  );

  const conversionDays = paid
    .filter((r) => r.payment_date && r.referral_date)
    .map(
      (r) =>
        (new Date(r.payment_date!).getTime() -
          new Date(r.referral_date).getTime()) /
        (1000 * 60 * 60 * 24),
    )
    .filter((d) => d >= 0);

  return {
    totalReferrals: total,
    withAppointment: withAppt.length,
    kept: kept.length,
    noShow: noShow.length,
    cancelled: cancelled.length,
    surgeryPlanned: surgeryPlanned.length,
    paid: paid.length,
    noShowRate: withAppt.length > 0 ? noShow.length / withAppt.length : 0,
    cancellationRate:
      withAppt.length > 0 ? cancelled.length / withAppt.length : 0,
    aptToSurgeryRate:
      kept.length > 0 ? surgeryPlanned.length / kept.length : 0,
    surgeryToPaidRate:
      surgeryPlanned.length > 0 ? paid.length / surgeryPlanned.length : 0,
    fullFunnelRate: total > 0 ? paid.length / total : 0,
    totalRevenue,
    avgDaysToConversion:
      conversionDays.length > 0
        ? Math.round(
            conversionDays.reduce((a, b) => a + b, 0) / conversionDays.length,
          )
        : null,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

function pct(v: number): string {
  return (v * 100).toFixed(1) + "%";
}

function colorForSource(source: string): string {
  return REFERRAL_COLORS[source] ?? REFERRAL_COLORS.other;
}

// ── Export ─────────────────────────────────────────────────────────────────

function exportAnonymizedCsv(rows: FunnelRow[]) {
  const header = [
    "referral_date", "source", "source_detail", "capture_method",
    "appointment_status", "appointment_date", "provider_name",
    "surgery_status", "payment_status", "price_chf", "payment_date",
    "days_to_conversion",
  ].join(",");

  const csvRows = rows.map((r) => {
    const daysToConversion =
      r.payment_date && r.referral_date
        ? Math.round(
            (new Date(r.payment_date).getTime() -
              new Date(r.referral_date).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : "";
    const providerName =
      r.provider_first_name
        ? `${r.provider_first_name} ${r.provider_last_name ?? ""}`.trim()
        : "";
    return [
      r.referral_date?.slice(0, 10) ?? "",
      r.source,
      r.source_detail ?? "",
      r.capture_method,
      r.appointment_status ?? "",
      r.appointment_date ?? "",
      providerName,
      r.surgery_status ?? "",
      r.payment_status ?? "",
      r.price ?? "",
      r.payment_date ?? "",
      daysToConversion,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  const csv = [header, ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `referral-funnel-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function classifyFunnel(r: FunnelRow): string {
  if (r.has_click_id) {
    // Determine specific ad funnel from source_detail or source
    if (r.source === "search_engine") return "google_ads";
    if (r.source === "social") return "meta_ads";
    return "paid_other";
  }
  if (r.source === "social" && r.capture_method === "staff") return "meta_forms";
  return "organic";
}

function exportAdPerformanceCsv(
  adPerformance: any[],
  rows: FunnelRow[],
  from: string,
  to: string,
) {
  const funnelLabels: Record<string, string> = {
    google_ads: "Google Ads",
    meta_ads: "Meta Ads",
    meta_forms: "Meta Forms",
  };

  // Section 1: Summary
  const summaryHeader = "funnel,budget_chf,leads,cpl_chf,appointments_kept,cost_per_kept_chf,paid_conversions,cpa_chf,revenue_chf,roi";
  const summaryRows = adPerformance.map((r: any) => [
    funnelLabels[r.funnel] || r.funnel,
    r.budget,
    r.leads,
    r.cpl ?? "",
    r.appointmentsKept,
    r.cpk ?? "",
    r.paidConversions,
    r.cpa ?? "",
    r.revenue,
    r.roi ?? "",
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));

  // Section 2: Raw referral-level data with funnel classification
  const detailHeader = "referral_date,funnel,source,source_detail,capture_method,has_click_id,appointment_status,appointment_date,provider,surgery_status,payment_status,price_chf,payment_date,days_to_conversion";
  const detailRows = rows.map((r) => {
    const funnel = classifyFunnel(r);
    const daysToConversion = r.payment_date && r.referral_date
      ? Math.round((new Date(r.payment_date).getTime() - new Date(r.referral_date).getTime()) / (1000 * 60 * 60 * 24))
      : "";
    const provider = r.provider_first_name
      ? `${r.provider_first_name} ${r.provider_last_name ?? ""}`.trim()
      : "";
    return [
      r.referral_date?.slice(0, 10) ?? "",
      funnel,
      r.source,
      r.source_detail ?? "",
      r.capture_method,
      r.has_click_id ? "yes" : "no",
      r.appointment_status ?? "",
      r.appointment_date ?? "",
      provider,
      r.surgery_status ?? "",
      r.payment_status ?? "",
      r.price ?? "",
      r.payment_date ?? "",
      daysToConversion,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });

  const csv = [
    `"Ad Performance Report — ${from} to ${to}"`,
    "",
    "--- SUMMARY ---",
    summaryHeader,
    ...summaryRows,
    "",
    "--- DETAIL (per referral) ---",
    detailHeader,
    ...detailRows,
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ad-performance-${from}-to-${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ReferralFunnel({ hospitalId }: ReferralFunnelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [providerFilter, setProviderFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  // Ad budget state
  const [budgetMonth, setBudgetMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({
    google_ads: '',
    meta_ads: '',
    meta_forms: '',
  });

  const queryClient = useQueryClient();

  // ── Data fetching ──────────────────────────────────────────────────────

  const { data: rows = [], isLoading } = useQuery<FunnelRow[]>({
    queryKey: ["referral-funnel", hospitalId, from, to],
    queryFn: async () => {
      const res = await fetch(
        `/api/business/${hospitalId}/referral-funnel?from=${from}&to=${to}`,
      );
      if (!res.ok) throw new Error("Failed to fetch funnel data");
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const { data: savedBudgets = [] } = useQuery<any[]>({
    queryKey: ["ad-budgets", hospitalId, budgetMonth],
    queryFn: async () => {
      const res = await fetch(`/api/business/${hospitalId}/ad-budgets?month=${budgetMonth}`);
      if (!res.ok) throw new Error("Failed to fetch budgets");
      return res.json();
    },
    enabled: !!hospitalId,
  });

  // Sync saved budgets to input fields
  useEffect(() => {
    const inputs: Record<string, string> = { google_ads: '', meta_ads: '', meta_forms: '' };
    for (const b of savedBudgets) {
      inputs[b.funnel] = String(b.amountChf);
    }
    setBudgetInputs(inputs);
  }, [savedBudgets]);

  const saveBudgetsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/business/${hospitalId}/ad-budgets`, {
        month: budgetMonth,
        budgets: {
          google_ads: budgetInputs.google_ads ? Number(budgetInputs.google_ads) : 0,
          meta_ads: budgetInputs.meta_ads ? Number(budgetInputs.meta_ads) : 0,
          meta_forms: budgetInputs.meta_forms ? Number(budgetInputs.meta_forms) : 0,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-budgets"] });
      queryClient.invalidateQueries({ queryKey: ["ad-performance"] });
      toast({ title: t("business.adBudgets.saved", "Budgets saved") });
    },
    onError: (error: any) => {
      toast({ title: t("business.adBudgets.saveError", "Failed to save budgets"), description: error.message, variant: "destructive" });
    },
  });

  const { data: adPerformance = [], isLoading: adPerfLoading } = useQuery<any[]>({
    queryKey: ["ad-performance", hospitalId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/business/${hospitalId}/ad-performance?${params}`);
      if (!res.ok) throw new Error("Failed to fetch ad performance");
      return res.json();
    },
    enabled: !!hospitalId,
  });

  // ── Derived data ───────────────────────────────────────────────────────

  const providers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.provider_id && r.provider_first_name) {
        map.set(
          r.provider_id,
          `${r.provider_first_name} ${r.provider_last_name ?? ""}`.trim(),
        );
      }
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1]),
    );
  }, [rows]);

  const sources = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.source);
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (providerFilter !== "all") {
      result = result.filter((r) => r.provider_id === providerFilter);
    }
    if (sourceFilter !== "all") {
      result = result.filter((r) => r.source === sourceFilter);
    }
    return result;
  }, [rows, providerFilter, sourceFilter]);

  const metrics = useMemo(() => computeMetrics(filtered), [filtered]);

  // ── Funnel chart data ──────────────────────────────────────────────────

  const funnelChartData = useMemo(() => {
    const stageKeys = [
      "referrals",
      "appointments",
      "kept",
      "surgeryPlanned",
      "paid",
    ] as const;
    const stageLabels: Record<(typeof stageKeys)[number], string> = {
      referrals: t("business.funnel.referrals", "Referrals"),
      appointments: t("business.funnel.appointments", "Appointments"),
      kept: t("business.funnel.kept", "Kept"),
      surgeryPlanned: t("business.funnel.surgeryPlanned", "Surgery Planned"),
      paid: t("business.funnel.paid", "Paid"),
    };

    const bySource: Record<string, FunnelRow[]> = {};
    for (const r of filtered) {
      (bySource[r.source] ??= []).push(r);
    }

    return stageKeys.map((key) => {
      const entry: Record<string, string | number> = {
        stage: stageLabels[key],
      };
      for (const [src, srcRows] of Object.entries(bySource)) {
        const m = computeMetrics(srcRows);
        switch (key) {
          case "referrals":
            entry[src] = m.totalReferrals;
            break;
          case "appointments":
            entry[src] = m.withAppointment;
            break;
          case "kept":
            entry[src] = m.kept;
            break;
          case "surgeryPlanned":
            entry[src] = m.surgeryPlanned;
            break;
          case "paid":
            entry[src] = m.paid;
            break;
        }
      }
      return entry;
    });
  }, [filtered, t]);

  const activeSources = useMemo(() => {
    const s = new Set<string>();
    for (const r of filtered) s.add(r.source);
    return Array.from(s).sort();
  }, [filtered]);

  // ── Matrix data ────────────────────────────────────────────────────────

  const matrixRows = useMemo(() => {
    const bySource: Record<string, FunnelRow[]> = {};
    for (const r of filtered) {
      (bySource[r.source] ??= []).push(r);
    }
    const result: Array<{
      source: string;
      metrics: FunnelMetrics;
      isSubRow?: boolean;
      subLabel?: string;
    }> = [];
    for (const [src, srcRows] of Object.entries(bySource).sort(([a], [b]) => a.localeCompare(b))) {
      // Aggregate row
      result.push({ source: src, metrics: computeMetrics(srcRows) });
      // Split into paid (has click ID) vs organic (no click ID)
      const paid = srcRows.filter((r) => r.has_click_id);
      const organic = srcRows.filter((r) => !r.has_click_id);
      // Only show sub-rows if BOTH paid and organic exist for this source
      if (paid.length > 0 && organic.length > 0) {
        result.push({ source: src, metrics: computeMetrics(paid), isSubRow: true, subLabel: t("business.funnel.paid", "Paid") });
        result.push({ source: src, metrics: computeMetrics(organic), isSubRow: true, subLabel: t("business.funnel.organic", "Organic") });
      }
    }
    return result;
  }, [filtered, t]);

  // ── Guard ──────────────────────────────────────────────────────────────

  if (!hospitalId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          <h2 className="text-xl font-semibold">
            {t("business.funnel.title", "Conversion Funnel")}
          </h2>
        </div>
        {filtered.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportAnonymizedCsv(filtered)}
          >
            <Download className="h-4 w-4 mr-1" />
            {t("business.funnel.export", "Export CSV")}
          </Button>
        )}
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>From</Label>
              <DateInput value={from} onChange={setFrom} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <DateInput value={to} onChange={setTo} />
            </div>
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={t(
                      "business.funnel.allProviders",
                      "All Providers",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("business.funnel.allProviders", "All Providers")}
                  </SelectItem>
                  {providers.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("business.funnel.source", "Source")}</Label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={t(
                      "business.funnel.allSources",
                      "All Sources",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("business.funnel.allSources", "All Sources")}
                  </SelectItem>
                  {sources.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── No data ─────────────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {t(
            "business.funnel.noData",
            "No referral data for the selected period.",
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <>
          {/* ── KPI cards ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label={t("business.funnel.totalReferrals", "Total Referrals")}
              value={String(metrics.totalReferrals)}
            />
            <KpiCard
              label={t("business.funnel.noShowRate", "No-Show Rate")}
              value={pct(metrics.noShowRate)}
            />
            <KpiCard
              label={t("business.funnel.cancellationRate", "Cancellation Rate")}
              value={pct(metrics.cancellationRate)}
            />
            <KpiCard
              label={t("business.funnel.kept", "Kept")}
              value={`${metrics.kept} / ${metrics.withAppointment}`}
            />
            <KpiCard
              label={t(
                "business.funnel.aptToSurgery",
                "Appointment \u2192 Surgery",
              )}
              value={pct(metrics.aptToSurgeryRate)}
            />
            <KpiCard
              label={t(
                "business.funnel.surgeryToPaid",
                "Surgery \u2192 Paid",
              )}
              value={pct(metrics.surgeryToPaidRate)}
            />
            <KpiCard
              label={t("business.funnel.fullFunnel", "Full Funnel")}
              value={pct(metrics.fullFunnelRate)}
            />
            <KpiCard
              label={t("business.funnel.revenue", "Revenue")}
              value={CHF.format(metrics.totalRevenue)}
            />
            <KpiCard
              label={t(
                "business.funnel.avgDays",
                "Avg Days to Conversion",
              )}
              value={
                metrics.avgDaysToConversion !== null
                  ? String(metrics.avgDaysToConversion)
                  : "\u2014"
              }
            />
          </div>

          {/* ── Funnel bar chart ──────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>
                {t("business.funnel.funnelStages", "Funnel Stages")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={funnelChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stage" />
                  <YAxis allowDecimals={false} />
                  <RechartsTooltip />
                  <Legend />
                  {activeSources.map((src) => (
                    <Bar
                      key={src}
                      dataKey={src}
                      fill={colorForSource(src)}
                      name={src}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ── Matrix table ──────────────────────────────────────────────── */}
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t("business.funnel.source", "Source")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.referrals", "Referrals")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.kept", "Kept")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.noShowRate", "No-Show %")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.cancellationRate", "Cancel %")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t(
                        "business.funnel.aptToSurgery",
                        "Apt\u2192Surgery %",
                      )}
                    </TableHead>
                    <TableHead className="text-right">
                      {t(
                        "business.funnel.surgeryToPaid",
                        "Surgery\u2192Paid %",
                      )}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.fullFunnel", "Full Funnel %")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.revenue", "Revenue")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.avgDays", "Avg Days")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrixRows.map(({ source, metrics: m, isSubRow, subLabel }, idx) => (
                    <TableRow key={`${source}-${subLabel || 'agg'}-${idx}`} className={isSubRow ? "text-muted-foreground" : ""}>
                      <TableCell className={isSubRow ? "pl-8 text-sm" : "font-medium"}>
                        {isSubRow ? `↳ ${subLabel}` : source}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.totalReferrals}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.kept}
                      </TableCell>
                      <TableCell className="text-right">
                        {pct(m.noShowRate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {pct(m.cancellationRate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {pct(m.aptToSurgeryRate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {pct(m.surgeryToPaidRate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {pct(m.fullFunnelRate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {CHF.format(m.totalRevenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.avgDaysToConversion ?? "\u2014"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Footer totals */}
                  <TableRow className="font-semibold border-t-2">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">
                      {metrics.totalReferrals}
                    </TableCell>
                    <TableCell className="text-right">
                      {metrics.kept}
                    </TableCell>
                    <TableCell className="text-right">
                      {pct(metrics.noShowRate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {pct(metrics.cancellationRate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {pct(metrics.aptToSurgeryRate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {pct(metrics.surgeryToPaidRate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {pct(metrics.fullFunnelRate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {CHF.format(metrics.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {metrics.avgDaysToConversion ?? "\u2014"}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ── Ad Budget Input ─────────────────────────────────────────── */}
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{t("business.adBudgets.title", "Ad Budgets")}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("business.adBudgets.help", "Set your monthly advertising spend per channel to calculate cost-per-lead and cost-per-acquisition metrics below.")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="month"
                    value={budgetMonth}
                    onChange={(e) => setBudgetMonth(e.target.value)}
                    className="w-40"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {([
                  { key: 'google_ads', label: 'Google Ads' },
                  { key: 'meta_ads', label: 'Meta Ads' },
                  { key: 'meta_forms', label: 'Meta Forms' },
                ] as const).map(({ key, label }) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-sm">{label}</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={budgetInputs[key]}
                        onChange={(e) => setBudgetInputs(prev => ({ ...prev, [key]: e.target.value }))}
                        className="pr-14"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">CHF</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={() => saveBudgetsMutation.mutate()}
                  disabled={saveBudgetsMutation.isPending}
                  size="sm"
                >
                  {saveBudgetsMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("common.saving", "Saving...")}</>
                  ) : (
                    t("common.save", "Save")
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Ad Performance Table ────────────────────────────────────── */}
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{t("business.adPerformance.title", "Ad Performance")}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t("business.adPerformance.help", "Cost and conversion metrics per advertising channel for the selected date range. Budgets are allocated per calendar month.")}
                  </p>
                </div>
                {adPerformance.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportAdPerformanceCsv(adPerformance, filtered, from, to)}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    {t("business.funnel.export", "Export CSV")}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {adPerfLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {[
                          { key: "funnel", label: t("business.adPerformance.funnel", "Funnel"), tip: t("business.adPerformance.funnelTip", "Advertising channel classified by tracking parameters") },
                          { key: "budget", label: t("business.adPerformance.budget", "Budget"), tip: t("business.adPerformance.budgetTip", "Total ad spend for the selected period") },
                          { key: "leads", label: t("business.adPerformance.leads", "Leads"), tip: t("business.adPerformance.leadsTip", "Number of referrals attributed to this channel") },
                          { key: "cpl", label: "CPL", tip: t("business.adPerformance.cplTip", "Cost per Lead — budget divided by number of leads") },
                          { key: "kept", label: t("business.adPerformance.kept", "Appts Kept"), tip: t("business.adPerformance.keptTip", "Appointments that were attended (not no-show or cancelled)") },
                          { key: "cpk", label: t("business.adPerformance.cpk", "Cost/Kept"), tip: t("business.adPerformance.cpkTip", "Budget divided by number of kept appointments") },
                          { key: "paid", label: t("business.adPerformance.paid", "Paid"), tip: t("business.adPerformance.paidTip", "Surgeries with confirmed payment") },
                          { key: "cpa", label: "CPA", tip: t("business.adPerformance.cpaTip", "Cost per Acquisition — budget divided by paid conversions") },
                          { key: "revenue", label: t("business.adPerformance.revenue", "Revenue"), tip: t("business.adPerformance.revenueTip", "Total revenue from paid surgeries in this channel") },
                          { key: "roi", label: "ROI", tip: t("business.adPerformance.roiTip", "Return on investment — (revenue - budget) / budget") },
                        ].map(({ key, label, tip }) => (
                          <TableHead key={key} className={key !== "funnel" ? "text-right" : ""}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1 cursor-help">
                                  {label}
                                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent><p className="max-w-xs">{tip}</p></TooltipContent>
                            </Tooltip>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adPerformance.map((row: any) => {
                        const funnelLabels: Record<string, string> = {
                          google_ads: "Google Ads",
                          meta_ads: "Meta Ads",
                          meta_forms: "Meta Forms",
                        };
                        return (
                          <TableRow key={row.funnel}>
                            <TableCell className="font-medium">{funnelLabels[row.funnel] || row.funnel}</TableCell>
                            <TableCell className="text-right">{CHF.format(row.budget)}</TableCell>
                            <TableCell className="text-right">{row.leads}</TableCell>
                            <TableCell className="text-right">{row.cpl != null ? CHF.format(row.cpl) : "\u2014"}</TableCell>
                            <TableCell className="text-right">{row.appointmentsKept}</TableCell>
                            <TableCell className="text-right">{row.cpk != null ? CHF.format(row.cpk) : "\u2014"}</TableCell>
                            <TableCell className="text-right">{row.paidConversions}</TableCell>
                            <TableCell className="text-right">{row.cpa != null ? CHF.format(row.cpa) : "\u2014"}</TableCell>
                            <TableCell className="text-right">{CHF.format(row.revenue)}</TableCell>
                            <TableCell className="text-right">
                              {row.roi != null ? (
                                <span className={row.roi >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                                  {row.roi >= 0 ? "+" : ""}{row.roi}x
                                </span>
                              ) : "\u2014"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Totals row */}
                      {adPerformance.length > 0 && (() => {
                        const totals = adPerformance.reduce((acc: any, row: any) => ({
                          budget: acc.budget + row.budget,
                          leads: acc.leads + row.leads,
                          appointmentsKept: acc.appointmentsKept + row.appointmentsKept,
                          paidConversions: acc.paidConversions + row.paidConversions,
                          revenue: acc.revenue + row.revenue,
                        }), { budget: 0, leads: 0, appointmentsKept: 0, paidConversions: 0, revenue: 0 });
                        return (
                          <TableRow className="font-semibold border-t-2">
                            <TableCell>{t("common.total", "Total")}</TableCell>
                            <TableCell className="text-right">{CHF.format(totals.budget)}</TableCell>
                            <TableCell className="text-right">{totals.leads}</TableCell>
                            <TableCell className="text-right">{totals.leads > 0 ? CHF.format(Math.round(totals.budget / totals.leads)) : "\u2014"}</TableCell>
                            <TableCell className="text-right">{totals.appointmentsKept}</TableCell>
                            <TableCell className="text-right">{totals.appointmentsKept > 0 ? CHF.format(Math.round(totals.budget / totals.appointmentsKept)) : "\u2014"}</TableCell>
                            <TableCell className="text-right">{totals.paidConversions}</TableCell>
                            <TableCell className="text-right">{totals.paidConversions > 0 ? CHF.format(Math.round(totals.budget / totals.paidConversions)) : "\u2014"}</TableCell>
                            <TableCell className="text-right">{CHF.format(totals.revenue)}</TableCell>
                            <TableCell className="text-right">
                              {totals.budget > 0 && totals.paidConversions > 0 ? (
                                <span className={totals.revenue - totals.budget >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                                  {totals.revenue - totals.budget >= 0 ? "+" : ""}{Math.round(((totals.revenue - totals.budget) / totals.budget) * 100) / 100}x
                                </span>
                              ) : "\u2014"}
                            </TableCell>
                          </TableRow>
                        );
                      })()}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
