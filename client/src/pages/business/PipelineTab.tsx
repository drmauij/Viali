import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrencyLocale } from "@/lib/dateUtils";

interface SurgeriesSummary {
  countPlanned: number;
  countConverted: number;
  revenuePlanned: number;
  revenueWon: number;
}

interface FunnelSnapshot {
  leads: number;
  contacted: number;
  booked: number;
  firstVisit: number;
  conversionPct: number;
}

interface ProviderPerf {
  providerId: string;
  name: string;
  treatmentsCount: number;
  treatmentsRevenue: number;
  surgeriesPlanned: number;
  surgeriesConverted: number;
  revenuePlanned: number;
  revenueWon: number;
  utilizationPct: number | null;
}

interface ProvidersResponse {
  providers: ProviderPerf[];
}

interface MoneySummary {
  revenue: { total: number };
  cost: { total: number };
  margin: { value: number; percent: number };
}

interface TopProc {
  procedure: string;
  count: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
}

interface Props {
  hospitalId: string;
  range: "30d" | "90d" | "365d";
}

export default function PipelineTab({ hospitalId, range }: Props) {
  const { t } = useTranslation();

  const surgeries = useQuery<SurgeriesSummary>({
    queryKey: [`/api/business/${hospitalId}/surgeries-summary?range=${range}`],
    enabled: !!hospitalId,
  });

  const funnel = useQuery<FunnelSnapshot>({
    queryKey: [`/api/business/${hospitalId}/funnel-snapshot?range=${range}`],
    enabled: !!hospitalId,
  });

  const providers = useQuery<ProvidersResponse>({
    queryKey: [`/api/business/${hospitalId}/providers-performance?range=${range}`],
    enabled: !!hospitalId,
  });

  const money = useQuery<MoneySummary>({
    queryKey: [`/api/business/${hospitalId}/money-summary?range=${range}`],
    enabled: !!hospitalId,
  });

  const topProcs = useQuery<TopProc[]>({
    queryKey: [`/api/business/${hospitalId}/top-procedures-by-margin?range=${range}&limit=5`],
    enabled: !!hospitalId,
  });

  if (surgeries.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const avgMarginPerSurgery =
    money.data && surgeries.data && surgeries.data.countConverted > 0
      ? money.data.margin.value / surgeries.data.countConverted
      : 0;

  const fn = funnel.data;
  const stagePct = (curr: number, prev: number) =>
    prev > 0 ? ((curr / prev) * 100).toFixed(0) : "—";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">
              {t("business.pipeline.futureSurgeries", "Future surgeries")}
            </div>
            <div className="text-2xl font-bold">
              {surgeries.data?.countPlanned ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">
              {t("business.pipeline.futureRevenue", "Future revenue")}
            </div>
            <div className="text-2xl font-bold">
              {formatCurrencyLocale(surgeries.data?.revenuePlanned ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">
              {t("business.pipeline.leadConversion", "Lead → first visit")}
            </div>
            <div className="text-2xl font-bold">
              {fn ? `${fn.conversionPct}%` : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">
              {t("business.pipeline.avgMargin", "Avg margin / surgery")}
            </div>
            <div className="text-2xl font-bold">
              {formatCurrencyLocale(avgMarginPerSurgery)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("business.pipeline.funnelTitle", "Funnel")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fn ? (
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                {
                  label: t("business.pipeline.leads", "Leads"),
                  value: fn.leads,
                  conv: null as string | null,
                },
                {
                  label: t("business.pipeline.contacted", "Contacted"),
                  value: fn.contacted,
                  conv: stagePct(fn.contacted, fn.leads),
                },
                {
                  label: t("business.pipeline.booked", "Booked"),
                  value: fn.booked,
                  conv: stagePct(fn.booked, fn.contacted),
                },
                {
                  label: t("business.pipeline.firstVisit", "First visit"),
                  value: fn.firstVisit,
                  conv: stagePct(fn.firstVisit, fn.booked),
                },
              ].map((s) => (
                <div key={String(s.label)} className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                  <div className="text-xl font-bold">{s.value}</div>
                  {s.conv !== null && (
                    <div className="text-xs text-muted-foreground">{s.conv}%</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {t("common.errorLoadingData", "Error loading data")}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("business.pipeline.topProviders", "Top providers")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("business.pipeline.providerName", "Name")}</TableHead>
                  <TableHead className="text-right">
                    {t("business.pipeline.surgeries", "Surgeries")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("business.pipeline.revenue", "Revenue")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(providers.data?.providers ?? []).slice(0, 5).map((p) => (
                  <TableRow key={p.providerId}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">{p.surgeriesConverted}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrencyLocale(p.revenueWon)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("business.pipeline.topProcedures", "Top procedures")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("business.pipeline.procedure", "Procedure")}</TableHead>
                  <TableHead className="text-right">
                    {t("business.pipeline.count", "Count")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("business.pipeline.avgMarginCol", "Avg margin")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(topProcs.data ?? []).map((p) => (
                  <TableRow key={p.procedure}>
                    <TableCell className="font-medium">{p.procedure}</TableCell>
                    <TableCell className="text-right">{p.count}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrencyLocale(p.count > 0 ? p.margin / p.count : 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
