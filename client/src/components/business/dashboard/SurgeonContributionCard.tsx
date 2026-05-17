import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrencyLocale } from "@/lib/dateUtils";
import {
  chartTooltipContentStyle,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
  type ProviderPerf,
} from "./types";

interface Props {
  hospitalId: string;
  range: string;
}

const BAR_COLORS = ["#6366f1", "#0ea5e9", "#22c55e", "#f59e0b", "#ec4899", "#a855f7", "#14b8a6", "#ef4444"];

export function SurgeonContributionBody({ hospitalId, range }: Props) {
  const { t } = useTranslation();
  const query = useQuery<{ providers: ProviderPerf[] }>({
    queryKey: [`/api/business/${hospitalId}/providers-performance?range=${range}`],
    enabled: !!hospitalId,
  });

  const data = useMemo(() => {
    const providers = query.data?.providers ?? [];
    return providers
      .filter((p) => (p.revenueWon ?? 0) > 0)
      .sort((a, b) => b.revenueWon - a.revenueWon)
      .slice(0, 10)
      .map((p) => ({
        name: p.name,
        revenue: p.revenueWon,
        cases: p.surgeriesConverted + p.treatmentsCount,
      }));
  }, [query.data]);

  return (
    <div className="h-[320px]">
      {query.isLoading ? (
        <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : data.length === 0 ? (
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
          {t("business.leadership.noProviderRevenue", "No realized provider revenue in this period")}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 10, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis type="number" fontSize={11} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
            <YAxis type="category" dataKey="name" fontSize={11} width={140} />
            <ReTooltip
              contentStyle={chartTooltipContentStyle}
              labelStyle={chartTooltipLabelStyle}
              itemStyle={chartTooltipItemStyle}
              formatter={(v: unknown, name: string) =>
                name === "revenue"
                  ? [formatCurrencyLocale(Number(v)), t("business.money.revenueCol", "Revenue") as string]
                  : [String(v), t("business.leadership.cases", "Cases") as string]
              }
            />
            <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function SurgeonContributionCard(props: Props) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("business.leadership.surgeonContributionTitle", "Revenue by provider")}</CardTitle>
        <CardDescription>
          {t("business.leadership.surgeonContributionDesc", "Top 10 providers by realized revenue for the selected period.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SurgeonContributionBody {...props} />
      </CardContent>
    </Card>
  );
}
