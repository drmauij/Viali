import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  chartTooltipContentStyle,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
  formatMonthTick,
} from "./types";

interface ReferralsBySource {
  sources: Array<{
    source: string;
    referrals: number;
    completed: number;       // attended — appointment completed/confirmed
    paid: number;            // money — referred patient has a paid surgery
    conversionPct: number;       // attended / referrals
    conversionPaidPct: number;   // paid / referrals (primary signal)
  }>;
}

interface ReferralsOverTime {
  granularity: "month" | "day";
  byPeriod: Array<{ period: string; source: string; count: number }>;
  total: number;
  totalDays: number;
  avgPerDay: number;
  avgPerDayPrev: number | null;
}

interface Props {
  hospitalId: string;
  range: string;
  onSourceClick?: (source: string) => void;
}

// referral_events.source is a closed enum — map directly to readable labels.
// Anything outside the enum (defensive fallback) gets title-cased on the fly.
const REFERRAL_SOURCE_LABELS: Record<string, string> = {
  social: "Social",
  search_engine: "Search engine",
  llm: "AI / LLM",
  word_of_mouth: "Word of mouth",
  belegarzt: "Belegarzt",
  marketing: "Marketing",
  other: "Other",
};

// One color per source, kept stable across renders so colours line up
// between the pies and the over-time area chart.
const SOURCE_COLORS: Record<string, string> = {
  social: "#3b82f6",
  search_engine: "#22c55e",
  llm: "#a855f7",
  word_of_mouth: "#f59e0b",
  belegarzt: "#0ea5e9",
  marketing: "#ec4899",
  other: "#94a3b8",
};

const FALLBACK_COLORS = ["#6366f1", "#14b8a6", "#ef4444", "#eab308", "#06b6d4", "#84cc16", "#f97316"];

function prettifyReferralSource(raw: string): string {
  return REFERRAL_SOURCE_LABELS[raw] ?? raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface PieDatum {
  source: string;
  label: string;
  color: string;
  referrals: number;
  completed: number;
  paid: number;
  conversionPct: number;
  conversionPaidPct: number;
}

type ViewMode = "source" | "conversion" | "overTime";

interface PieProps {
  data: PieDatum[];
  valueKey: "referrals" | "completed" | "paid";
  total: number;
  totalLabel: string;
  onSliceClick?: (source: string) => void;
}

function SourcePie({ data, valueKey, total, totalLabel, onSliceClick }: PieProps) {
  const allZero = data.every((d) => d[valueKey] === 0);
  return (
    <div className="relative h-[240px]">
      {allZero ? (
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">—</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey={valueKey}
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={95}
              paddingAngle={2}
              onClick={(slice: any) => {
                const src = slice?.payload?.source as string | undefined;
                if (src && onSliceClick) onSliceClick(src);
              }}
              style={{ cursor: onSliceClick ? "pointer" : "default", outline: "none" }}
            >
              {data.map((d) => (
                <Cell key={d.source} fill={d.color} stroke="hsl(var(--background))" strokeWidth={2} />
              ))}
            </Pie>
            <ReTooltip
              contentStyle={chartTooltipContentStyle}
              labelStyle={chartTooltipLabelStyle}
              itemStyle={chartTooltipItemStyle}
              formatter={(_v: unknown, _n: unknown, item: any) => {
                const p = item?.payload as PieDatum | undefined;
                if (!p) return ["", ""];
                return [
                  `${p.referrals} ref · ${p.paid} paid (${p.conversionPaidPct}%) · ${p.completed} attended`,
                  p.label,
                ];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-2xl font-bold leading-none">{total}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">{totalLabel}</div>
      </div>
    </div>
  );
}

interface LegendProps {
  data: PieDatum[];
  valueKey: "referrals" | "completed" | "paid";
  trailingKey?: "conversionPct" | "conversionPaidPct";
  trailingLabel?: string;
  onSourceClick?: (source: string) => void;
}

function SourceLegend({ data, valueKey, trailingKey, trailingLabel, onSourceClick }: LegendProps) {
  const { t } = useTranslation();
  const valueHeader = valueKey === "referrals"
    ? t("business.pipeline.referrals", "Referrals")
    : valueKey === "paid"
      ? t("business.pipeline.paid", "Paid")
      : t("business.pipeline.completed", "Completed");

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "grid gap-x-3 px-2 text-xs uppercase tracking-wide text-muted-foreground",
          trailingKey ? "grid-cols-[12px_1fr_auto_auto]" : "grid-cols-[12px_1fr_auto]",
        )}
      >
        <span />
        <span>{t("business.pipeline.source", "Source")}</span>
        <span className="text-right">{valueHeader}</span>
        {trailingKey && <span className="text-right">{trailingLabel}</span>}
      </div>
      <ul className="space-y-0.5">
        {data.map((d) => (
          <li
            key={d.source}
            className={cn(
              "grid gap-x-3 items-center px-2 py-1.5 rounded-md text-sm",
              trailingKey ? "grid-cols-[12px_1fr_auto_auto]" : "grid-cols-[12px_1fr_auto]",
              onSourceClick && "cursor-pointer hover:bg-muted/40",
            )}
            onClick={() => onSourceClick?.(d.source)}
          >
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: d.color }} aria-hidden />
            <span className="font-medium truncate">{d.label}</span>
            <span className="text-right tabular-nums">{d[valueKey]}</span>
            {trailingKey && (
              <span className="text-right tabular-nums text-muted-foreground">{d[trailingKey]}%</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface OverTimeProps {
  data: ReferralsOverTime;
  sourceColors: Record<string, string>;
}

function OverTimeChart({ data, sourceColors }: OverTimeProps) {
  const { t } = useTranslation();
  // Pivot the flat {period, source, count} rows into one row per period
  // with one column per source so recharts can stack the areas.
  const { rows, sources } = useMemo(() => {
    const periodMap = new Map<string, Record<string, number>>();
    const sourceSet = new Set<string>();
    for (const r of data.byPeriod) {
      sourceSet.add(r.source);
      const existing = periodMap.get(r.period) ?? {};
      existing[r.source] = (existing[r.source] ?? 0) + r.count;
      periodMap.set(r.period, existing);
    }
    const orderedSources = Array.from(sourceSet).sort();
    const allRows = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, vals]) => {
        const row: Record<string, string | number> = { period };
        for (const s of orderedSources) row[s] = vals[s] ?? 0;
        return row;
      });
    return { rows: allRows, sources: orderedSources };
  }, [data]);

  const isMonthly = data.granularity === "month";
  const yearsInTicks = new Set(rows.map((r) => String(r.period).slice(0, 4)));
  const showYearInMonthTick = yearsInTicks.size > 1;

  function formatTick(period: string): string {
    if (isMonthly) return formatMonthTick(period, showYearInMonthTick);
    return period.length >= 10 ? period.slice(5) : period;
  }

  return (
    <div className="h-[280px]">
      {rows.length === 0 ? (
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
          {t("business.pipeline.noReferrals", "No referrals captured in this period.")}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="period" fontSize={11} tickFormatter={formatTick} />
            <YAxis fontSize={11} allowDecimals={false} />
            <ReTooltip
              contentStyle={chartTooltipContentStyle}
              labelStyle={chartTooltipLabelStyle}
              itemStyle={chartTooltipItemStyle}
              labelFormatter={(p: string) => (isMonthly ? formatMonthTick(p, true) : p)}
              formatter={(v: unknown, name: string) => [String(v), prettifyReferralSource(name)]}
            />
            <Legend formatter={(name: string) => prettifyReferralSource(name)} />
            {sources.map((s) => (
              <Area
                key={s}
                type="monotone"
                dataKey={s}
                stackId="referrals"
                stroke={sourceColors[s]}
                fill={sourceColors[s]}
                fillOpacity={0.55}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function ReferralsBySourceCard({ hospitalId, range, onSourceClick }: Props) {
  const { t } = useTranslation();
  const [view, setView] = useState<ViewMode>("source");

  const bySourceQuery = useQuery<ReferralsBySource>({
    queryKey: [`/api/business/${hospitalId}/referrals-by-source?range=${range}`],
    enabled: !!hospitalId,
  });

  // Over-time data is only needed when the user actually opens that tab —
  // keeps the initial Pipeline payload small.
  const overTimeQuery = useQuery<ReferralsOverTime>({
    queryKey: [`/api/business/${hospitalId}/referrals-over-time?range=${range}`],
    enabled: !!hospitalId && view === "overTime",
  });

  const data = useMemo<PieDatum[]>(() => {
    const sources = bySourceQuery.data?.sources ?? [];
    let fallbackIdx = 0;
    return sources.map((s) => ({
      source: s.source,
      label: prettifyReferralSource(s.source),
      color: SOURCE_COLORS[s.source] ?? FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length],
      referrals: s.referrals,
      completed: s.completed,
      paid: s.paid,
      conversionPct: s.conversionPct,
      conversionPaidPct: s.conversionPaidPct,
    }));
  }, [bySourceQuery.data]);

  // Build a stable color map keyed by source for the over-time chart so the
  // colours line up with what the user just saw in the source pie.
  const sourceColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of data) map[d.source] = d.color;
    // Also pre-populate any source that's only present in over-time data
    // (in case the by-source totals are empty but the historical data isn't).
    if (overTimeQuery.data) {
      let fallbackIdx = Object.keys(map).length;
      for (const r of overTimeQuery.data.byPeriod) {
        if (!map[r.source]) {
          map[r.source] = SOURCE_COLORS[r.source] ?? FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length];
        }
      }
    }
    return map;
  }, [data, overTimeQuery.data]);

  const totalReferrals = data.reduce((sum, d) => sum + d.referrals, 0);
  const totalPaid = data.reduce((sum, d) => sum + d.paid, 0);
  const totalAttended = data.reduce((sum, d) => sum + d.completed, 0);
  const overallPaidPct = totalReferrals > 0 ? Math.round((totalPaid / totalReferrals) * 100) : 0;
  const overallAttendedPct = totalReferrals > 0 ? Math.round((totalAttended / totalReferrals) * 100) : 0;

  // Over-time delta — drives the colored avg/day stat shown only in that view.
  const overTimeStats = (() => {
    const d = overTimeQuery.data;
    if (!d || d.totalDays === 0) return null;
    const cur = d.avgPerDay;
    const prev = d.avgPerDayPrev;
    const deltaPct = prev != null && prev > 0 ? ((cur - prev) / prev) * 100 : null;
    return { cur, prev, deltaPct, totalDays: d.totalDays };
  })();

  const title = view === "source"
    ? t("business.pipeline.referralsBySourceTitle", "Referrals by source")
    : view === "conversion"
      ? t("business.pipeline.referralsByConversionTitle", "Referrals by conversion")
      : t("business.pipeline.referralsOverTimeTitle", "Referral sources over time");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {view === "conversion" && (
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  "business.pipeline.conversionDefPaid",
                  "Conversion = referred patient has a paid surgery on or after the referral date. Hover any slice to also see attended (appointment completed/confirmed).",
                )}
              </p>
            )}
            {view === "overTime" && (
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  "business.pipeline.referralsOverTimeDesc",
                  "Booking pipeline by source — the leading indicator of cashflow.",
                )}
              </p>
            )}
          </div>

          <div className="flex items-start gap-4 shrink-0">
            {view === "overTime" && overTimeStats && (() => {
              const { cur, deltaPct, totalDays } = overTimeStats;
              const down = deltaPct != null && deltaPct < 0;
              const up = deltaPct != null && deltaPct > 0;
              return (
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {t("business.pipeline.avgPerDay", "Avg referrals / day")}
                  </div>
                  <div className={cn(
                    "text-xl font-bold leading-tight",
                    down && "text-red-600 dark:text-red-400",
                    up && "text-emerald-600 dark:text-emerald-400",
                  )}>
                    {cur.toFixed(cur >= 10 ? 0 : 1)}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                    {deltaPct != null ? (
                      <span className={cn(
                        "flex items-center gap-0.5",
                        down && "text-red-600 dark:text-red-400",
                        up && "text-emerald-600 dark:text-emerald-400",
                      )}>
                        {down ? <ArrowDownRight className="h-3 w-3" /> : up ? <ArrowUpRight className="h-3 w-3" /> : null}
                        {Math.abs(deltaPct).toFixed(0)}% {t("business.pipeline.vsPriorWindow", "vs prior window")}
                      </span>
                    ) : (
                      <span>{t("business.pipeline.overDays", "over {{n}} days", { n: totalDays })}</span>
                    )}
                  </div>
                </div>
              );
            })()}
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v as ViewMode)}
              size="sm"
              variant="outline"
            >
              <ToggleGroupItem value="source">{t("business.pipeline.byVolume", "By volume")}</ToggleGroupItem>
              <ToggleGroupItem value="conversion">{t("business.pipeline.byConversion", "By conversion")}</ToggleGroupItem>
              <ToggleGroupItem value="overTime">{t("business.pipeline.overTime", "Over time")}</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {view === "overTime" ? (
          overTimeQuery.isLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !overTimeQuery.data ? (
            <div className="text-sm text-muted-foreground py-4">
              {t("business.pipeline.noReferrals", "No referrals captured in this period.")}
            </div>
          ) : (
            <OverTimeChart data={overTimeQuery.data} sourceColors={sourceColors} />
          )
        ) : bySourceQuery.isLoading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            {t("business.pipeline.noReferrals", "No referrals captured in this period.")}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {view === "source" ? (
                <>
                  <SourcePie
                    data={data}
                    valueKey="referrals"
                    total={totalReferrals}
                    totalLabel={t("business.pipeline.referrals", "Referrals")}
                    onSliceClick={onSourceClick}
                  />
                  <SourceLegend data={data} valueKey="referrals" onSourceClick={onSourceClick} />
                </>
              ) : (
                <>
                  <SourcePie
                    data={data}
                    valueKey="paid"
                    total={totalPaid}
                    totalLabel={t("business.pipeline.paid", "Paid")}
                    onSliceClick={onSourceClick}
                  />
                  <SourceLegend
                    data={data}
                    valueKey="paid"
                    trailingKey="conversionPaidPct"
                    trailingLabel={t("business.pipeline.conversion", "Conversion")}
                    onSourceClick={onSourceClick}
                  />
                </>
              )}
            </div>
            {view === "conversion" && totalReferrals > 0 && (
              <div className="text-xs text-muted-foreground pt-3 mt-3 border-t flex flex-wrap gap-x-4 gap-y-1">
                <span>{t("business.pipeline.overallPaidConversion", "Paid conversion {{p}}%", { p: overallPaidPct })}</span>
                <span>{t("business.pipeline.overallAttended", "Attended {{p}}%", { p: overallAttendedPct })}</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export { prettifyReferralSource };
