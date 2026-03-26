import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
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
import { DateInput } from "@/components/ui/date-input";
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
import { Loader2, TrendingUp } from "lucide-react";

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

// ── Component ──────────────────────────────────────────────────────────────

export default function ReferralFunnel({ hospitalId }: ReferralFunnelProps) {
  const { t } = useTranslation();

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [providerFilter, setProviderFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

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
    return Object.entries(bySource)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([src, srcRows]) => ({
        source: src,
        metrics: computeMetrics(srcRows),
      }));
  }, [filtered]);

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
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5" />
        <h2 className="text-xl font-semibold">
          {t("business.funnel.title", "Conversion Funnel")}
        </h2>
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
                  {matrixRows.map(({ source, metrics: m }) => (
                    <TableRow key={source}>
                      <TableCell className="font-medium">{source}</TableCell>
                      <TableCell className="text-right">
                        {m.totalReferrals}
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
