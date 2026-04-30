import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { funnelsUrl, type FunnelsScope } from "@/lib/funnelsApi";
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
import { Loader2, TrendingUp, Download, HelpCircle, Trash2, ChevronRight, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isMarketingUtmSource } from "@shared/referralMapping";
import {
  FunnelRow,
  ConversionLevel,
  KEPT_STATUSES,
  exportAnonymizedCsv,
  exportAdPerformanceCsv,
  exportGoogleAdsCsv,
  exportMetaAdsCsv,
  exportMetaFormsCsv,
  countPlatformConversions,
} from "./referralFunnelExports";

// ── Types ──────────────────────────────────────────────────────────────────

interface ReferralFunnelProps {
  scope: FunnelsScope;
  from: string;
  to: string;
  currency?: string;
  onEarliestDate?: (date: string) => void;
  /**
   * Which sections to render.
   * - "all" (default): every section — title, filters, KPIs, funnel chart, matrix,
   *   ad budgets, ad performance, feed-back-to-platforms.
   * - "conversion": filters + KPIs + funnel chart + matrix. No ad-spend sections.
   * - "ads": filters + ad budgets + ad performance + feed-back-to-platforms. No funnel analytics.
   *
   * Lets the Marketing page split this component across two tabs while keeping
   * data fetching and filter state centralized here.
   */
  view?: "all" | "conversion" | "ads";
}

type FunnelMetrics = {
  totalReferrals: number;
  withAppointment: number;
  confirmed: number;
  kept: number;
  noShow: number;
  cancelled: number;
  surgeryPlanned: number;       // count where surgery_id present
  treatmentPerformed: number;   // count where treatment_id present
  converted: number;            // surgery OR treatment (union, de-duplicated)
  paid: number;                 // surgery paid OR treatment signed
  fromLead: number;             // count of referrals that originated from a lead webhook
  noShowRate: number;
  cancellationRate: number;
  leadToConversionRate: number;
  aptToConversionRate: number;
  conversionToPaidRate: number;
  fullFunnelRate: number;
  fromLeadRate: number;         // fromLead / totalReferrals
  totalRevenue: number;
  avgDaysToConversion: number | null;
};

// ── Constants ──────────────────────────────────────────────────────────────

const REFERRAL_COLORS: Record<string, string> = {
  social: "#3b82f6",
  search_engine: "#10b981",
  llm: "#8b5cf6",
  word_of_mouth: "#f59e0b",
  belegarzt: "#ec4899",
  marketing: "#14b8a6", // teal — owned marketing channels (Flows/newsletters)
  other: "#6b7280",
};

/**
 * Returns the "bucket" used to group a referral row in the funnel chart,
 * matrix table and source filter. Marketing rows (Flows email/SMS, external
 * newsletters matched by utm_source) are pulled out of their underlying
 * `source` (usually "other") into a dedicated "marketing" bucket so they can
 * be analysed independently of the delivery channel.
 */
function getFunnelBucket(r: FunnelRow): string {
  if (isMarketingUtmSource(r.utm_source)) return "marketing";
  return r.source;
}

/**
 * i18n label for a funnel bucket (the 6 source enum values plus the virtual
 * "marketing" bucket). Uses the shared `referral.*` namespace so labels stay
 * in sync with the rest of the app (ReferralSourcePicker, Marketing page, etc).
 * Falls back to the raw key for forward-compatibility.
 */
const BUCKET_LABEL_KEYS: Record<string, string> = {
  social: "referral.social",
  search_engine: "referral.searchEngine",
  llm: "referral.llm",
  word_of_mouth: "referral.wordOfMouth",
  belegarzt: "referral.belegarzt",
  marketing: "referral.marketing",
  other: "referral.other",
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
  const confirmed = withAppt.filter((r) =>
    r.appointment_status === "confirmed" || r.appointment_status === "scheduled",
  );
  const kept = withAppt.filter((r) =>
    KEPT_STATUSES.includes(r.appointment_status || ""),
  );
  const noShow = withAppt.filter((r) => r.appointment_status === "no_show");
  const cancelled = withAppt.filter((r) => r.appointment_status === "cancelled");

  const surgeryPlanned = rows.filter((r) => r.surgery_id);
  const treatmentPerformed = rows.filter((r) => r.treatment_id);
  const converted = rows.filter((r) => r.surgery_id || r.treatment_id);
  const paid = rows.filter((r) => r.payment_date || r.treatment_status === "signed");
  const fromLead = rows.filter((r) => r.from_lead);

  const totalRevenue = paid.reduce(
    (sum, r) =>
      sum + parseFloat(r.price || "0") + parseFloat(r.treatment_total || "0"),
    0,
  );

  // Days from referral to either payment_date or treatment_performed_at (whichever applies)
  const conversionDays = paid
    .map((r) => {
      const ts = r.payment_date ?? r.treatment_performed_at;
      if (!ts || !r.referral_date) return null;
      return (new Date(ts).getTime() - new Date(r.referral_date).getTime())
        / (1000 * 60 * 60 * 24);
    })
    .filter((d): d is number => d !== null && d >= 0);

  const attendedCount = confirmed.length + kept.length;

  return {
    totalReferrals: total,
    withAppointment: withAppt.length,
    confirmed: confirmed.length,
    kept: kept.length,
    noShow: noShow.length,
    cancelled: cancelled.length,
    surgeryPlanned: surgeryPlanned.length,
    treatmentPerformed: treatmentPerformed.length,
    converted: converted.length,
    paid: paid.length,
    fromLead: fromLead.length,
    noShowRate: withAppt.length > 0 ? noShow.length / withAppt.length : 0,
    cancellationRate: withAppt.length > 0 ? cancelled.length / withAppt.length : 0,
    leadToConversionRate: total > 0 ? converted.length / total : 0,
    aptToConversionRate:
      attendedCount > 0 ? converted.length / attendedCount : 0,
    conversionToPaidRate:
      converted.length > 0 ? paid.length / converted.length : 0,
    fullFunnelRate: total > 0 ? paid.length / total : 0,
    fromLeadRate: total > 0 ? fromLead.length / total : 0,
    totalRevenue,
    avgDaysToConversion:
      conversionDays.length > 0
        ? Math.round(conversionDays.reduce((a, b) => a + b, 0) / conversionDays.length)
        : null,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pct(v: number): string {
  return (v * 100).toFixed(1) + "%";
}

function colorForSource(source: string): string {
  return REFERRAL_COLORS[source] ?? REFERRAL_COLORS.other;
}

function classifyFunnel(r: FunnelRow): string {
  // Meta Forms: has meta lead/form ID (from Lead Ads / Excel import)
  if (r.meta_lead_id || r.meta_form_id) return "meta_forms";
  if (r.source === "social" && r.capture_method === "staff") return "meta_forms";
  if (r.has_click_id) {
    if (r.source === "search_engine") return "google_ads";
    if (r.source === "social") return "meta_ads";
    return "paid_other";
  }
  // Owned marketing channels (Flows email/SMS, newsletters, Klaviyo, etc.) —
  // grouped by utm_source regardless of delivery channel. See
  // MARKETING_UTM_SOURCES in shared/referralMapping.ts.
  if (isMarketingUtmSource(r.utm_source)) return "marketing";
  return "organic";
}


// ── Component ──────────────────────────────────────────────────────────────

export default function ReferralFunnel({ scope, from, to, currency = "CHF", onEarliestDate, view = "all" }: ReferralFunnelProps) {
  const showConversion = view === "all" || view === "conversion";
  const showAds = view === "all" || view === "ads";
  const { t } = useTranslation();
  const { toast } = useToast();
  const [providerFilter, setProviderFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [conversionLevel, setConversionLevel] = useState<ConversionLevel>("paid");

  // Ad budget state
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [editingBudget, setEditingBudget] = useState<{ month: string; funnel: string; value: string } | null>(null);
  const [newMonth, setNewMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const queryClient = useQueryClient();

  // Returns a human-readable label for a funnel bucket (source enum value or
  // the virtual "marketing" bucket). Falls back to the raw key if unknown.
  const bucketLabel = (bucket: string): string => {
    const key = BUCKET_LABEL_KEYS[bucket];
    return key ? t(key, bucket) : bucket;
  };

  // ── Data fetching ──────────────────────────────────────────────────────

  const funnelDataUrl = funnelsUrl("referral-funnel", scope, { from, to });
  const { data: rawRows = [], isLoading } = useQuery<FunnelRow[]>({
    queryKey: [funnelDataUrl],
    queryFn: async () => {
      if (!funnelDataUrl) throw new Error("scope not addressable");
      const res = await fetch(funnelDataUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch funnel data");
      return res.json();
    },
    enabled: !!funnelDataUrl,
  });

  // The funnel page operates only on referrals attached to an appointment.
  // Orphan referrals — currently only created by the Meta CSV bulk-match
  // approval flow when no future appointment exists — would skew every
  // denominator on this page. Excluding them gives a single, consistent
  // universe across all KPIs, the funnel chart, the source matrix, and CSV exports.
  const rows = useMemo(
    () => rawRows.filter((r) => r.appointment_id),
    [rawRows],
  );

  // Report earliest referral date to parent for auto-setting "From"
  const reportedEarliest = useRef(false);
  useEffect(() => {
    if (!reportedEarliest.current && rows.length > 0 && onEarliestDate) {
      const earliest = rows.reduce((min, r) =>
        r.referral_date < min ? r.referral_date : min, rows[0].referral_date);
      onEarliestDate(earliest.slice(0, 10));
      reportedEarliest.current = true;
    }
  }, [rows, onEarliestDate]);

  // ad-budgets only available in clinic scope (no chain mirror)
  const hospitalId = scope.hospitalIds[0] ?? "";
  const { data: allBudgets = [] } = useQuery<any[]>({
    queryKey: ["ad-budgets", hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/business/${hospitalId}/ad-budgets`);
      if (!res.ok) throw new Error("Failed to fetch budgets");
      return res.json();
    },
    enabled: !scope.groupId && !!hospitalId,
  });

  const saveBudgetMutation = useMutation({
    mutationFn: async ({ month, funnel, value }: { month: string; funnel: string; value: number }) => {
      await apiRequest("PUT", `/api/business/${hospitalId}/ad-budgets`, {
        month,
        budgets: { [funnel]: value },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-budgets"] });
      queryClient.invalidateQueries({ queryKey: ["ad-performance"] });
    },
    onError: (error: any) => {
      toast({ title: t("business.adBudgets.saveError", "Failed to save budgets"), description: error.message, variant: "destructive" });
    },
  });

  const addMonthMutation = useMutation({
    mutationFn: async (month: string) => {
      // Create with placeholder value 1 so the row persists (0 would delete)
      await apiRequest("PUT", `/api/business/${hospitalId}/ad-budgets`, {
        month,
        budgets: { google_ads: 1, meta_ads: 1, meta_forms: 1 },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-budgets"] });
      queryClient.invalidateQueries({ queryKey: ["ad-performance"] });
      toast({ title: t("business.adBudgets.monthAdded", "Month added — click values to set budgets") });
    },
  });

  const deleteMonthMutation = useMutation({
    mutationFn: async (month: string) => {
      await apiRequest("DELETE", `/api/business/${hospitalId}/ad-budgets/${month}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-budgets"] });
      queryClient.invalidateQueries({ queryKey: ["ad-performance"] });
      toast({ title: t("business.adBudgets.monthRemoved", "Month removed") });
    },
  });

  // Group budgets by month for the table
  const budgetsByMonth = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const b of allBudgets) {
      if (!map[b.month]) map[b.month] = { google_ads: 0, meta_ads: 0, meta_forms: 0 };
      map[b.month][b.funnel] = b.amountChf;
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, funnels]) => ({ month, ...funnels }));
  }, [allBudgets]);

  const adPerfUrl = funnelsUrl("ad-performance", scope);
  const { data: adPerformance = [], isLoading: adPerfLoading } = useQuery<any[]>({
    queryKey: [adPerfUrl],
    queryFn: async () => {
      if (!adPerfUrl) throw new Error("scope not addressable");
      const res = await fetch(adPerfUrl);
      if (!res.ok) throw new Error("Failed to fetch ad performance");
      return res.json();
    },
    enabled: !!adPerfUrl,
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
    for (const r of rows) s.add(getFunnelBucket(r));
    return Array.from(s).sort();
  }, [rows]);

  const campaigns = useMemo(() => {
    // Unified campaign label: prefer the human-readable campaign name from the
    // ad-platform webhook (e.g. Meta Ads Manager) and fall back to utm_campaign.
    // Server already computes this as `campaign`, but we double-coalesce here
    // for safety in case an older cached response lacks the field.
    const s = new Set<string>();
    for (const r of rows) {
      const label = r.campaign ?? r.utm_campaign;
      if (label) s.add(label);
    }
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (providerFilter !== "all") {
      result = result.filter((r) => r.provider_id === providerFilter);
    }
    if (sourceFilter !== "all") {
      result = result.filter((r) => getFunnelBucket(r) === sourceFilter);
    }
    if (campaignFilter !== "all") {
      result = result.filter((r) => (r.campaign ?? r.utm_campaign) === campaignFilter);
    }
    return result;
  }, [rows, providerFilter, sourceFilter, campaignFilter]);

  const metrics = useMemo(() => computeMetrics(filtered), [filtered]);

  const platformCounts = useMemo(
    () => countPlatformConversions(filtered, conversionLevel),
    [filtered, conversionLevel],
  );

  // ── Funnel chart data ──────────────────────────────────────────────────

  const funnelChartData = useMemo(() => {
    // Universe is "referrals attached to an appointment" — the standalone
    // "Appointments" stage would equal "Referrals" so it's omitted.
    const stageKeys = [
      "referrals",
      "kept",
      "surgeryPlanned",
      "paid",
    ] as const;
    const stageLabels: Record<(typeof stageKeys)[number], string> = {
      referrals: t("business.funnel.referrals", "Referrals"),
      kept: t("business.funnel.kept", "Kept"),
      surgeryPlanned: t("business.funnel.converted", "Converted"),
      paid: t("business.funnel.paid", "Paid"),
    };

    const bySource: Record<string, FunnelRow[]> = {};
    for (const r of filtered) {
      (bySource[getFunnelBucket(r)] ??= []).push(r);
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
          case "kept":
            entry[src] = m.kept;
            break;
          case "surgeryPlanned":
            entry[src] = m.converted;
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
    for (const r of filtered) s.add(getFunnelBucket(r));
    return Array.from(s).sort();
  }, [filtered]);

  // ── Matrix data ────────────────────────────────────────────────────────

  const matrixRows = useMemo(() => {
    const bySource: Record<string, FunnelRow[]> = {};
    for (const r of filtered) {
      (bySource[getFunnelBucket(r)] ??= []).push(r);
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

  if (scope.hospitalIds.length === 0) return null;

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
            {view === "ads"
              ? t("business.funnel.adPerformanceTitle", "Ad Performance")
              : t("business.funnel.title", "Conversion Funnel")}
          </h2>
          {showConversion && (
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">
                  {t(
                    "business.funnel.convertedHelp",
                    "A \"Converted\" referral is one whose appointment led to either a planned surgery or a signed treatment (Botox, fillers, etc.). The split between the two is shown in the matrix table below — Surgery and Treatment are counted in separate columns.",
                  )}
                </p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {showConversion && filtered.length > 0 && (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      {bucketLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {campaigns.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("business.funnel.campaign", "Campaign")}</Label>
                <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t(
                        "business.funnel.allCampaigns",
                        "All Campaigns",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("business.funnel.allCampaigns", "All Campaigns")}
                    </SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
          {showConversion && (
            <>
          {/* ── KPI cards ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label={t("business.funnel.totalReferrals", "Total Referrals")}
              value={String(metrics.totalReferrals)}
            />
            <KpiCard
              label={t("business.funnel.fromLeads", "From Leads")}
              value={`${metrics.fromLead} (${pct(metrics.fromLeadRate)})`}
            />
            <KpiCard
              label={t("business.funnel.noShowRate", "No-Show Rate")}
              value={`${metrics.noShow} (${pct(metrics.noShowRate)})`}
            />
            <KpiCard
              label={t("business.funnel.cancellationRate", "Cancellation Rate")}
              value={`${metrics.cancelled} (${pct(metrics.cancellationRate)})`}
            />
            <KpiCard
              label={t("business.funnel.attended", "Attended")}
              value={`${metrics.kept} / ${metrics.totalReferrals} (${pct(metrics.totalReferrals > 0 ? metrics.kept / metrics.totalReferrals : 0)})`}
            />
            <KpiCard
              label={t(
                "business.funnel.leadToConversion",
                "Referral \u2192 Converted",
              )}
              value={`${metrics.converted} (${pct(metrics.leadToConversionRate)})`}
            />
            <KpiCard
              label={t(
                "business.funnel.aptToConversion",
                "Appointment \u2192 Converted",
              )}
              value={`${metrics.converted} (${pct(metrics.aptToConversionRate)})`}
            />
            <KpiCard
              label={t(
                "business.funnel.conversionToPaid",
                "Converted \u2192 Paid",
              )}
              value={`${metrics.paid} (${pct(metrics.conversionToPaidRate)})`}
            />
            <KpiCard
              label={t("business.funnel.fullFunnel", "Full Funnel")}
              value={`${metrics.paid} / ${metrics.totalReferrals} (${pct(metrics.fullFunnelRate)})`}
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
                      name={bucketLabel(src)}
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
                      {t("business.funnel.fromLeads", "From Leads")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.attended", "Attended")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.noShow", "No-Show")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.cancelled", "Cancelled")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.surgery", "Surgery")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.treatment", "Treatment")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.refToConv", "Ref\u2192Conv")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.aptToConv", "Apt\u2192Conv")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.convToPaid", "Conv\u2192Paid")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.funnel.fullFunnel", "Full Funnel")}
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
                        {isSubRow ? `↳ ${subLabel}` : bucketLabel(source)}
                      </TableCell>
                      <TableCell className="text-right">{m.totalReferrals}</TableCell>
                      <TableCell className="text-right">
                        {m.fromLead} <span className="text-muted-foreground text-xs">({pct(m.fromLeadRate)})</span>
                      </TableCell>
                      <TableCell className="text-right">{m.kept}</TableCell>
                      <TableCell className="text-right">
                        {m.noShow} <span className="text-muted-foreground text-xs">({pct(m.noShowRate)})</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {m.cancelled} <span className="text-muted-foreground text-xs">({pct(m.cancellationRate)})</span>
                      </TableCell>
                      <TableCell className="text-right">{m.surgeryPlanned}</TableCell>
                      <TableCell className="text-right">{m.treatmentPerformed}</TableCell>
                      <TableCell className="text-right">{pct(m.leadToConversionRate)}</TableCell>
                      <TableCell className="text-right">{pct(m.aptToConversionRate)}</TableCell>
                      <TableCell className="text-right">{pct(m.conversionToPaidRate)}</TableCell>
                      <TableCell className="text-right">
                        {m.paid} <span className="text-muted-foreground text-xs">({pct(m.fullFunnelRate)})</span>
                      </TableCell>
                      <TableCell className="text-right">{CHF.format(m.totalRevenue)}</TableCell>
                      <TableCell className="text-right">{m.avgDaysToConversion ?? "\u2014"}</TableCell>
                    </TableRow>
                  ))}
                  {/* Footer totals */}
                  <TableRow className="font-semibold border-t-2">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{metrics.totalReferrals}</TableCell>
                    <TableCell className="text-right">
                      {metrics.fromLead} <span className="text-muted-foreground text-xs">({pct(metrics.fromLeadRate)})</span>
                    </TableCell>
                    <TableCell className="text-right">{metrics.kept}</TableCell>
                    <TableCell className="text-right">
                      {metrics.noShow} <span className="text-muted-foreground text-xs">({pct(metrics.noShowRate)})</span>
                    </TableCell>
                    <TableCell className="text-right">
                      {metrics.cancelled} <span className="text-muted-foreground text-xs">({pct(metrics.cancellationRate)})</span>
                    </TableCell>
                    <TableCell className="text-right">{metrics.surgeryPlanned}</TableCell>
                    <TableCell className="text-right">{metrics.treatmentPerformed}</TableCell>
                    <TableCell className="text-right">{pct(metrics.leadToConversionRate)}</TableCell>
                    <TableCell className="text-right">{pct(metrics.aptToConversionRate)}</TableCell>
                    <TableCell className="text-right">{pct(metrics.conversionToPaidRate)}</TableCell>
                    <TableCell className="text-right">
                      {metrics.paid} <span className="text-muted-foreground text-xs">({pct(metrics.fullFunnelRate)})</span>
                    </TableCell>
                    <TableCell className="text-right">{CHF.format(metrics.totalRevenue)}</TableCell>
                    <TableCell className="text-right">{metrics.avgDaysToConversion ?? "\u2014"}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

            </>
          )}

          {showAds && (
            <>
          {/* ── Ad Budgets Table ─────────────────────────────────────────── */}
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{t("business.adBudgets.title", "Ad Budgets")}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("business.adBudgets.help", "Monthly advertising spend per channel. Click any value to edit. Total is auto-calculated.")}
                  </p>
                </div>
                {!scope.groupId && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="month"
                      value={newMonth}
                      onChange={(e) => setNewMonth(e.target.value)}
                      className="w-40"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={addMonthMutation.isPending || budgetsByMonth.some(b => b.month === newMonth)}
                      onClick={() => addMonthMutation.mutate(newMonth)}
                    >
                      {t("business.adBudgets.addMonth", "+ Add Month")}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {budgetsByMonth.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("business.adBudgets.empty", "No budgets set yet. Select a month and click Add Month to start.")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("business.adBudgets.month", "Month")}</TableHead>
                        <TableHead className="text-right">Google Ads</TableHead>
                        <TableHead className="text-right">Meta Ads</TableHead>
                        <TableHead className="text-right">Meta Forms</TableHead>
                        <TableHead className="text-right">{t("common.total", "Total")}</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {budgetsByMonth.map((row: any) => {
                        const total = (row.google_ads || 0) + (row.meta_ads || 0) + (row.meta_forms || 0);
                        return (
                          <TableRow key={row.month}>
                            <TableCell className="font-medium">{row.month}</TableCell>
                            {(['google_ads', 'meta_ads', 'meta_forms'] as const).map((funnel) => {
                              const isEditing = !scope.groupId && editingBudget?.month === row.month && editingBudget?.funnel === funnel;
                              return (
                                <TableCell key={funnel} className="text-right">
                                  {isEditing ? (
                                    <Input
                                      type="number"
                                      min="0"
                                      autoFocus
                                      className="w-28 ml-auto text-right h-8"
                                      defaultValue={String(row[funnel] || 0)}
                                      onBlur={(e) => {
                                        const val = Math.round(Number(e.target.value) || 0);
                                        if (val !== (row[funnel] || 0)) {
                                          saveBudgetMutation.mutate({ month: row.month, funnel, value: val });
                                        }
                                        setEditingBudget(null);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                        if (e.key === 'Escape') setEditingBudget(null);
                                      }}
                                    />
                                  ) : (
                                    <span
                                      className={scope.groupId ? undefined : "cursor-pointer hover:underline"}
                                      onClick={scope.groupId ? undefined : () => setEditingBudget({ month: row.month, funnel, value: String(row[funnel] || 0) })}
                                    >
                                      {CHF.format(row[funnel] || 0)}
                                    </span>
                                  )}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right font-medium">{CHF.format(total)}</TableCell>
                            <TableCell>
                              {!scope.groupId && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => deleteMonthMutation.mutate(row.month)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Ad Performance by Month ────────────────────────────────── */}
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{t("business.adPerformance.title", "Ad Performance")}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t("business.adPerformance.help", "Monthly cost and conversion metrics across all advertising channels. Each row shows aggregated performance for that month.")}
                  </p>
                </div>
                {adPerformance.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportAdPerformanceCsv(adPerformance, filtered, from, to, classifyFunnel)}
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
              ) : adPerformance.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("business.adPerformance.empty", "No data yet. Add budget months above to see performance metrics.")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {[
                          { key: "month", label: t("business.adBudgets.month", "Month"), tip: t("business.adPerformance.monthTip", "Calendar month") },
                          { key: "budget", label: t("business.adPerformance.budget", "Budget"), tip: t("business.adPerformance.budgetTip", "Total ad spend across all channels") },
                          { key: "leads", label: t("business.adPerformance.referrals", "Referrals"), tip: t("business.adPerformance.referralsTip", "Number of referrals attributed to ad channels") },
                          { key: "cpl", label: "CPR", tip: t("business.adPerformance.cprTip", "Cost per Referral — budget divided by number of referrals") },
                          { key: "confirmed", label: t("business.adPerformance.confirmed", "Confirmed"), tip: t("business.adPerformance.confirmedTip", "Appointments scheduled or confirmed but not yet attended") },
                          { key: "kept", label: t("business.adPerformance.attended", "Attended"), tip: t("business.adPerformance.attendedTip", "Appointments that were attended (not no-show or cancelled)") },
                          { key: "cpk", label: t("business.adPerformance.cpk", "Cost/Attended"), tip: t("business.adPerformance.cpkTip", "Budget divided by number of attended appointments") },
                          { key: "paid", label: t("business.adPerformance.paid", "Paid"), tip: t("business.adPerformance.paidTip", "Surgeries with confirmed payment") },
                          { key: "cpa", label: "CPA", tip: t("business.adPerformance.cpaTip", "Cost per Acquisition — budget divided by paid conversions") },
                          { key: "revenue", label: t("business.adPerformance.revenue", "Revenue"), tip: t("business.adPerformance.revenueTip", "Total revenue from paid surgeries") },
                          { key: "roi", label: "ROI", tip: t("business.adPerformance.roiTip", "Return on investment — (revenue - budget) / budget") },
                        ].map(({ key, label, tip }) => (
                          <TableHead key={key} className={key !== "month" ? "text-right" : ""}>
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
                      {adPerformance.flatMap((row: any) => {
                        const isExpanded = expandedMonths.has(row.month);
                        const funnelLabels: Record<string, string> = {
                          google_ads: "Google Ads",
                          meta_ads: "Meta Ads",
                          meta_forms: "Meta Forms",
                        };
                        const toggleMonth = () => {
                          setExpandedMonths(prev => {
                            const next = new Set(prev);
                            if (next.has(row.month)) next.delete(row.month);
                            else next.add(row.month);
                            return next;
                          });
                        };
                        const rows = [
                          <TableRow key={row.month} className="cursor-pointer hover:bg-muted/50" onClick={toggleMonth}>
                            <TableCell className="font-medium">
                              <span className="inline-flex items-center gap-1">
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                {row.month}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{CHF.format(row.totalBudget)}</TableCell>
                            <TableCell className="text-right">{row.totalLeads}</TableCell>
                            <TableCell className="text-right">{row.totalCpl != null ? CHF.format(row.totalCpl) : "\u2014"}</TableCell>
                            <TableCell className="text-right">{row.totalConfirmed}</TableCell>
                            <TableCell className="text-right">{row.totalKept}</TableCell>
                            <TableCell className="text-right">{row.totalCpk != null ? CHF.format(row.totalCpk) : "\u2014"}</TableCell>
                            <TableCell className="text-right">{row.totalPaid}</TableCell>
                            <TableCell className="text-right">{row.totalCpa != null ? CHF.format(row.totalCpa) : "\u2014"}</TableCell>
                            <TableCell className="text-right">{CHF.format(row.totalRevenue)}</TableCell>
                            <TableCell className="text-right">
                              {row.totalRoi != null ? (
                                <span className={row.totalRoi >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                                  {row.totalRoi >= 0 ? "+" : ""}{row.totalRoi}x
                                </span>
                              ) : "\u2014"}
                            </TableCell>
                          </TableRow>,
                        ];
                        if (isExpanded) {
                          for (const f of row.funnels) {
                            const budget = f.budget;
                            const cpl = f.leads > 0 ? Math.round(budget / f.leads) : null;
                            const cpk = f.appointmentsKept > 0 ? Math.round(budget / f.appointmentsKept) : null;
                            const cpa = f.paidConversions > 0 ? Math.round(budget / f.paidConversions) : null;
                            const roi = budget > 0 && f.paidConversions > 0 ? Math.round(((f.revenue - budget) / budget) * 100) / 100 : null;
                            rows.push(
                              <TableRow key={`${row.month}-${f.funnel}`} className="text-muted-foreground">
                                <TableCell className="pl-10 text-sm">↳ {funnelLabels[f.funnel] || f.funnel}</TableCell>
                                <TableCell className="text-right text-sm">{CHF.format(budget)}</TableCell>
                                <TableCell className="text-right text-sm">{f.leads}</TableCell>
                                <TableCell className="text-right text-sm">{cpl != null ? CHF.format(cpl) : "\u2014"}</TableCell>
                                <TableCell className="text-right text-sm">{f.appointmentsConfirmed}</TableCell>
                                <TableCell className="text-right text-sm">{f.appointmentsKept}</TableCell>
                                <TableCell className="text-right text-sm">{cpk != null ? CHF.format(cpk) : "\u2014"}</TableCell>
                                <TableCell className="text-right text-sm">{f.paidConversions}</TableCell>
                                <TableCell className="text-right text-sm">{cpa != null ? CHF.format(cpa) : "\u2014"}</TableCell>
                                <TableCell className="text-right text-sm">{CHF.format(f.revenue)}</TableCell>
                                <TableCell className="text-right text-sm">
                                  {roi != null ? (
                                    <span className={roi >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                                      {roi >= 0 ? "+" : ""}{roi}x
                                    </span>
                                  ) : "\u2014"}
                                </TableCell>
                              </TableRow>
                            );
                          }
                        }
                        return rows;
                      })}
                      {/* Totals row */}
                      {adPerformance.length > 1 && (() => {
                        const totals = adPerformance.reduce((acc: any, row: any) => ({
                          budget: acc.budget + row.totalBudget,
                          leads: acc.leads + row.totalLeads,
                          confirmed: acc.confirmed + row.totalConfirmed,
                          kept: acc.kept + row.totalKept,
                          paid: acc.paid + row.totalPaid,
                          revenue: acc.revenue + row.totalRevenue,
                        }), { budget: 0, leads: 0, confirmed: 0, kept: 0, paid: 0, revenue: 0 });
                        return (
                          <TableRow className="font-semibold border-t-2">
                            <TableCell>{t("common.total", "Total")}</TableCell>
                            <TableCell className="text-right">{CHF.format(totals.budget)}</TableCell>
                            <TableCell className="text-right">{totals.leads}</TableCell>
                            <TableCell className="text-right">{totals.leads > 0 ? CHF.format(Math.round(totals.budget / totals.leads)) : "\u2014"}</TableCell>
                            <TableCell className="text-right">{totals.confirmed}</TableCell>
                            <TableCell className="text-right">{totals.kept}</TableCell>
                            <TableCell className="text-right">{totals.kept > 0 ? CHF.format(Math.round(totals.budget / totals.kept)) : "\u2014"}</TableCell>
                            <TableCell className="text-right">{totals.paid}</TableCell>
                            <TableCell className="text-right">{totals.paid > 0 ? CHF.format(Math.round(totals.budget / totals.paid)) : "\u2014"}</TableCell>
                            <TableCell className="text-right">{CHF.format(totals.revenue)}</TableCell>
                            <TableCell className="text-right">
                              {totals.budget > 0 && totals.paid > 0 ? (
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
          {/* ── Feed Back to Platforms ────────────────────────────────────── */}
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
                      <SelectItem value="kept">{t("business.funnel.levelKept", "Attended")}</SelectItem>
                      <SelectItem value="surgery_planned">{t("business.funnel.levelConverted", "Converted")}</SelectItem>
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
            </>
          )}
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
