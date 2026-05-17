import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// Standalone card wraps the body in <Card>. Body-only export is used by the
// combined MoneyChartsCard toggle to swap chart views without nesting cards.
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { useTranslation } from "react-i18next";
import { formatCurrencyLocale } from "@/lib/dateUtils";
import {
  chartTooltipContentStyle,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
  formatMonthTick,
  type MoneySummary,
} from "./types";

interface Props {
  summary: MoneySummary;
  onMonthClick?: (month: string) => void;
}

// Merge current-year monthly series with the prior-year overlay keyed by
// month-of-year. Recharts needs one flat data array, so we project both into
// the same row when the user has selected a specific year.
function buildSeries(summary: MoneySummary) {
  if (!summary.byMonthPrev || summary.byMonthPrev.length === 0) {
    return summary.byMonth.map((p) => ({ ...p, revenuePrev: null as number | null }));
  }
  const prevByMoy = new Map(summary.byMonthPrev.map((p) => [p.monthOfYear, p]));
  return summary.byMonth.map((p) => {
    const moy = p.month.slice(5, 7);
    const prev = prevByMoy.get(moy);
    return { ...p, revenuePrev: prev ? prev.revenue : null };
  });
}

export function RevenueTrendBody({ summary, onMonthClick }: Props) {
  const { t } = useTranslation();
  const data = useMemo(() => buildSeries(summary), [summary]);
  const years = new Set(summary.byMonth.map((p) => p.month.slice(0, 4)));
  const showYearInTick = years.size > 1;
  const hasPrev = !!summary.byMonthPrev && summary.byMonthPrev.length > 0;

  return (
    <>
      <div className="h-[320px]">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            {t("business.money.noData", "No revenue or cost data for this period")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 10, right: 12, left: 0, bottom: 4 }}
              onClick={(state: any) => {
                if (!onMonthClick) return;
                const m = state?.activeLabel as string | undefined;
                if (m && /^\d{4}-\d{2}$/.test(m)) onMonthClick(m);
              }}
              style={{ cursor: onMonthClick ? "pointer" : "default" }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="month"
                fontSize={11}
                tickFormatter={(m: string) => formatMonthTick(m, showYearInTick)}
              />
              <YAxis
                fontSize={11}
                tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              />
              <ReTooltip
                contentStyle={chartTooltipContentStyle}
                labelStyle={chartTooltipLabelStyle}
                itemStyle={chartTooltipItemStyle}
                formatter={(v: unknown, name: string) =>
                  v == null ? ["—", name] : [formatCurrencyLocale(Number(v)), name]
                }
                labelFormatter={(m: string) => formatMonthTick(m, true)}
              />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name={t("business.money.revenueCol", "Revenue") as string} />
              {hasPrev && (
                <Line type="monotone" dataKey="revenuePrev" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} name={t("business.money.revenuePrevYear", "Revenue (prior year)") as string} />
              )}
              <Line type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name={t("business.money.costs", "Costs") as string} />
              <Line type="monotone" dataKey="margin" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name={t("business.money.margin", "Margin") as string} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {onMonthClick
          ? t("business.money.trendHint", "Click any month to see the surgeries behind that number.")
          : t("business.money.treatmentFootnote", "Treatment material costs estimated from price markup; items without supplier or patient price are excluded.")}
      </p>
    </>
  );
}

export default function RevenueTrendChart(props: Props) {
  const { t } = useTranslation();
  const hasPrev = !!props.summary.byMonthPrev && props.summary.byMonthPrev.length > 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("business.money.trendTitle", "Revenue & cost over time")}</CardTitle>
        <CardDescription>
          {hasPrev
            ? t("business.money.trendDescWithYoY", "Monthly totals — revenue, cost, margin. Dashed line is prior year revenue for comparison.")
            : t("business.money.trendDescMonthly", "Monthly totals — revenue, total cost, and margin")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RevenueTrendBody {...props} />
      </CardContent>
    </Card>
  );
}
