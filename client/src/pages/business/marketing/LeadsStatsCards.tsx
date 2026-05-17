import { useQuery } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { sourceLabel } from "@/components/leads/sourceIcon";
import { funnelsUrl, type FunnelsScope } from "@/lib/funnelsApi";

interface LeadsStatsResponse {
  total: number;
  converted: number;
  bySource: Array<{ source: string; count: number }>;
  conversionOverall: number;
  conversionBySource: Array<{ source: string; total: number; converted: number; rate: number }>;
  avgDaysToConversion: number | null;
  timeseries: Array<{ month: string; count: number }>;
}

const SOURCE_COLORS: Record<string, string> = {
  ig: "#ec4899",
  fb: "#3b82f6",
  website: "#10b981",
  email: "#f59e0b",
  default: "#64748b",
};

function color(source: string) {
  return SOURCE_COLORS[source] ?? SOURCE_COLORS.default;
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function LeadsStatsCards({
  scope,
  from,
  to,
}: {
  scope: FunnelsScope;
  from: string;
  to: string;
}) {
  const { t } = useTranslation();

  const url = funnelsUrl("leads-stats", scope, { from, to });

  const { data, isLoading, isError } = useQuery<LeadsStatsResponse>({
    queryKey: [url],
    enabled: scope.hospitalIds.length > 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground text-center">
          {t("business.leads.stats.error", "Could not load lead statistics.")}
        </CardContent>
      </Card>
    );
  }

  const { total, converted, bySource, conversionOverall, conversionBySource, avgDaysToConversion, timeseries } = data;

  return (
    <Tabs defaultValue="overview" className="w-full">
      <div className="overflow-x-auto scrollbar-hide">
        <TabsList className="inline-flex w-auto min-w-full">
          <TabsTrigger value="overview" className="whitespace-nowrap">
            {t("business.leads.tabs.overview", "Overview")}
          </TabsTrigger>
          <TabsTrigger value="bySource" className="whitespace-nowrap">
            {t("business.leads.charts.bySource", "Leads by source")}
          </TabsTrigger>
          <TabsTrigger value="overTime" className="whitespace-nowrap">
            {t("business.leads.charts.overTime", "Leads over time")}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" className="mt-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("business.leads.stats.totalLeads", "Total leads")}
              </div>
              <div className="text-2xl font-semibold">{total.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">
                {t("business.leads.stats.inRange", "in range")}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("business.leads.stats.conversionRate", "Conversion rate")}
              </div>
              <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                {total > 0 ? formatPct(conversionOverall) : "—"}
              </div>
              <div className="text-xs font-semibold">
                {t("business.leads.stats.convertedCount", "{{n}} of {{total}} converted", {
                  n: converted.toLocaleString(),
                  total: total.toLocaleString(),
                })}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {conversionBySource.map((r) => (
                  <span key={r.source}>
                    {sourceLabel(r.source)} {r.converted}/{r.total} ({formatPct(r.rate)})
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("business.leads.stats.avgDaysToConversion", "Avg days to conversion")}
              </div>
              <div className="text-2xl font-semibold">
                {avgDaysToConversion == null ? "—" : avgDaysToConversion.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("business.leads.stats.leadToAppointment", "lead → appointment")}
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="bySource" className="mt-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {t("business.leads.charts.bySource", "Leads by source")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {total === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("business.leads.empty", "No leads yet.")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={bySource.map((r) => ({ name: sourceLabel(r.source), value: r.count, source: r.source }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                  >
                    {bySource.map((r) => (
                      <Cell key={r.source} fill={color(r.source)} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={24} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="overTime" className="mt-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {t("business.leads.charts.overTime", "Leads over time")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {total === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("business.leads.empty", "No leads yet.")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={timeseries}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                    itemStyle={{ color: "#0f172a" }}
                  />
                  <Bar dataKey="count" fill={SOURCE_COLORS.default} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
